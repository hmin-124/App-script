/**
 * Unit tests for Tool Request → 2026 sync pure logic
 * (normalize / validate / cost rules / mapping / manual-column protection).
 *
 * Run: node src/tool-request-sync-2026/tests/sync-logic.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

function loadProject() {
  const context = {
    console,
    Date,
    RegExp,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Error,
    Math,
    JSON,
    Map,
    Set,
    isFinite,
    Session: {
      getActiveUser: () => ({ getEmail: () => 'tester@example.com' }),
      getEffectiveUser: () => ({ getEmail: () => 'tester@example.com' }),
    },
  };
  vm.createContext(context);

  for (const file of [
    'Config.gs',
    'Utils.gs',
    'ValidationService.gs',
    'MappingService.gs',
    'DataAccess.gs',
  ]) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  return vm.runInContext(
    `({
      CONFIG,
      normalizeId_,
      normalizeText_,
      parseNumber_,
      validateSourceRecord_,
      resolveCostAndCurrency_,
      extractToolNameFromContent_,
      mapSourceToTarget_,
      filterPatchCols_,
      allocateTargetInsertRows_,
    })`,
    context
  );
}

/**
 * Build a minimal Sheet mock: column E (index 5) holds ID BOKT values.
 * @param {*[]} idColumnValues values for rows starting at TARGET_DATA_START_ROW
 */
function makeSheetMock(idColumnValues) {
  const start = 2;
  const lastRow = idColumnValues.length ? start + idColumnValues.length - 1 : 0;
  return {
    getLastRow: () => lastRow,
    getMaxRows: () => Math.max(1000, lastRow),
    getRange: (row, col, numRows) => ({
      getValues: () => {
        if (col !== 5) return Array.from({ length: numRows }, () => ['']);
        const out = [];
        for (let i = 0; i < numRows; i++) {
          const abs = row + i;
          const idx = abs - start;
          out.push([idx >= 0 && idx < idColumnValues.length ? idColumnValues[idx] : '']);
        }
        return out;
      },
    }),
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeSourceValues(overrides) {
  const cols = 21;
  const values = new Array(cols).fill('');
  Object.keys(overrides).forEach((key) => {
    values[Number(key)] = overrides[key];
  });
  return values;
}

function run() {
  const ctx = loadProject();
  const {
    CONFIG,
    normalizeId_,
    normalizeText_,
    parseNumber_,
    validateSourceRecord_,
    resolveCostAndCurrency_,
    extractToolNameFromContent_,
    mapSourceToTarget_,
    filterPatchCols_,
    allocateTargetInsertRows_,
  } = ctx;

  // --- normalizeId_ ---
  assertEqual(normalizeId_(3513368), '3513368', 'id number');
  assertEqual(normalizeId_('3513368'), '3513368', 'id string');
  assertEqual(normalizeId_('3513368.0'), '3513368', 'id trailing .0');
  assertEqual(normalizeId_('  99  '), '99', 'id trim');
  assertEqual(normalizeId_(''), '', 'id empty');

  // --- normalizeText_ ---
  assertEqual(normalizeText_('  Adobe   Creative  '), 'Adobe Creative', 'text collapse');

  // --- parseNumber_ ---
  assertEqual(parseNumber_(55), 55, 'num');
  assertEqual(parseNumber_('1,234.56'), 1234.56, 'us format');
  assertEqual(parseNumber_(''), null, 'blank');
  assertEqual(parseNumber_('abc'), null, 'junk');

  // --- validate required ---
  const incomplete = validateSourceRecord_({
    rowNumber: 3,
    values: makeSourceValues({ 1: 'Cloudflare' }),
  });
  assert(!incomplete.ok, 'incomplete should fail');
  assert(incomplete.errors.some((e) => e.indexOf('ID BOKT') >= 0), 'missing id error');

  const noCost = validateSourceRecord_({
    rowNumber: 3,
    values: makeSourceValues({
      1: 'Cloudflare',
      4: 'Dev M5',
      5: 'Gia hạn',
      6: 'Mua theo tháng',
      18: 3513368,
    }),
  });
  assert(!noCost.ok, 'no cost fails');
  assert(noCost.errors.indexOf('Thiếu thông tin chi phí') >= 0, 'cost error message');

  const okUsd = validateSourceRecord_({
    rowNumber: 3,
    values: makeSourceValues({
      1: 'Cloudflare',
      4: 'Dev M5',
      5: 'Gia hạn',
      6: 'Mua theo tháng',
      7: 55,
      8: 1000000,
      18: '3513368',
      19: 'Done',
    }),
  });
  assert(okUsd.ok, 'usd row ok');
  assert(okUsd.warnings.length >= 1, 'dual currency warning');

  // --- cost rules: only Cost + DVT (no FX / Thành tiền) ---
  let cost = resolveCostAndCurrency_(55, 1000);
  assertEqual(cost.dvt, 'USD', 'prefer usd');
  assertEqual(cost.cost, 55, 'usd cost');
  assertEqual(cost.fxRate, undefined, 'no fx in resolver');
  assertEqual(cost.amount, undefined, 'no amount in resolver');

  cost = resolveCostAndCurrency_(null, 500000);
  assertEqual(cost.dvt, 'PNT', 'vnd → PNT');
  assertEqual(cost.cost, 500000, 'pnt cost');

  // --- extract tool name from nội dung phiếu ---
  const parsed = extractToolNameFromContent_(
    '[Dev SEO M5] - Request gia hạn tool Cloudflare T8/2026',
    'Other'
  );
  assertEqual(parsed.toolName, 'Cloudflare', 'parse Cloudflare');
  assertEqual(parsed.warning, '', 'no parse warning');

  const multi = extractToolNameFromContent_(
    '[Dev SEO M5] - Request gia hạn tool Amazon Web Services T8/2026\nbody text',
    ''
  );
  assertEqual(multi.toolName, 'Amazon Web Services', 'multi-word tool');

  const fallback = extractToolNameFromContent_('No tool token here', 'N8N');
  assertEqual(fallback.toolName, 'N8N', 'fallback to col B');
  assert(fallback.warning.length > 0, 'fallback warns');

  // --- mapping: sync cols only; manual cols absent ---
  const record = {
    rowNumber: 5,
    values: makeSourceValues({
      1: '  N8N  Cloud ',
      3: '[Dev SEO M5] - Request gia hạn tool Cloudflare T8/2026',
      4: 'Dev M5',
      5: 'Gia hạn',
      6: 'Mua theo tháng',
      7: 34.2,
      16: 'Thẻ visa',
      18: 3513372,
      19: 'Done',
      20: '11 hàng tháng',
    }),
  };
  const validated = validateSourceRecord_(record);
  assert(validated.ok, 'map source ok');
  const mapped = mapSourceToTarget_(record, validated);

  const TC = CONFIG.TARGET_COLS;
  assertEqual(mapped.insertPatch[TC.TEAM], 'Dev M5', 'team');
  assertEqual(mapped.insertPatch[TC.ID_BOKT], '3513372', 'id');
  assertEqual(mapped.insertPatch[TC.TOOL_NAME], 'Cloudflare', 'G Tên tool from content');
  assertEqual(mapped.insertPatch[TC.CHANNEL], 'mkt0008', 'default channel');
  assertEqual(mapped.insertPatch[TC.COST], 34.2, 'cost');
  assertEqual(mapped.insertPatch[TC.DVT], 'USD', 'dvt');
  assertEqual(mapped.updatePatch[TC.TOOL_NAME], 'Cloudflare', 'update tool name');

  // Manual columns must NOT appear (incl. F Ngày tạo phiếu)
  CONFIG.MANUAL_TARGET_COLS.forEach((colIdx) => {
    assert(
      !Object.prototype.hasOwnProperty.call(mapped.insertPatch, colIdx),
      `insertPatch must not contain manual col ${colIdx}`
    );
    assert(
      !Object.prototype.hasOwnProperty.call(mapped.updatePatch, colIdx),
      `updatePatch must not contain manual col ${colIdx}`
    );
  });
  assertEqual(mapped.insertPatch[TC.CREATED_AT], undefined, 'F Ngày tạo phiếu not synced');

  // INSERT-only fields absent from update patch
  CONFIG.INSERT_ONLY_TARGET_COLS.forEach((colIdx) => {
    assert(
      Object.prototype.hasOwnProperty.call(mapped.insertPatch, colIdx),
      `insertPatch should contain insert-only col ${colIdx}`
    );
    assert(
      !Object.prototype.hasOwnProperty.call(mapped.updatePatch, colIdx),
      `updatePatch must not contain insert-only col ${colIdx}`
    );
  });

  // filterPatchCols_ defense
  const dirty = Object.assign({}, mapped.updatePatch, { [TC.NCC]: 'HACK', [TC.STATUS]: 'X', [TC.CREATED_AT]: new Date() });
  const cleaned = filterPatchCols_(dirty, CONFIG.UPDATABLE_TARGET_COLS);
  assertEqual(cleaned[TC.NCC], undefined, 'filter drops NCC');
  assertEqual(cleaned[TC.STATUS], undefined, 'filter drops Status');
  assertEqual(cleaned[TC.CREATED_AT], undefined, 'filter drops Created At');
  assertEqual(cleaned[TC.COST], 34.2, 'filter keeps Cost');
  assertEqual(cleaned[TC.TOOL_NAME], 'Cloudflare', 'filter keeps Tên tool');

  // --- allocateTargetInsertRows_ ---
  const sheet = makeSheetMock(['111', '', '', '222', '']);
  const rows = allocateTargetInsertRows_(sheet, 3);
  assertEqual(rows.length, 3, 'allocate 3 rows');
  assertEqual(rows[0], 3, 'first blank slot');
  assertEqual(rows[1], 4, 'second blank slot');
  assertEqual(rows[2], 6, 'third blank slot');

  const full = makeSheetMock(['1', '2', '3']);
  const appended = allocateTargetInsertRows_(full, 2);
  assertEqual(appended[0], 5, 'append row 5');
  assertEqual(appended[1], 6, 'append row 6');

  console.log('All sync-logic tests passed.');
}

run();
