/**
 * Unit tests for Tool Request → 2026 sync pure logic
 * (normalize / validate / cost rules / mapping / admin-safe patch).
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
  ]) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  }

  // `const`/`function` bindings live in the VM lexical scope, not as
  // properties on the context object — export the symbols we need to test.
  return vm.runInContext(
    `({
      CONFIG,
      normalizeId_,
      normalizeText_,
      parseNumber_,
      validateSourceRecord_,
      resolveCostAndCurrency_,
      mapSourceToTarget_,
      applyUpdatePatch_,
    })`,
    context
  );
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
    mapSourceToTarget_,
    applyUpdatePatch_,
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

  // --- cost rules ---
  CONFIG.EXCHANGE_RATE = null;
  let cost = resolveCostAndCurrency_(55, 1000);
  assertEqual(cost.dvt, 'USD', 'prefer usd');
  assertEqual(cost.cost, 55, 'usd cost');
  assertEqual(cost.fxRate, '', 'no fx');
  assertEqual(cost.amount, '', 'no amount without fx');

  CONFIG.EXCHANGE_RATE = 25000;
  cost = resolveCostAndCurrency_(2, null);
  assertEqual(cost.amount, 50000, 'usd * fx');

  cost = resolveCostAndCurrency_(null, 500000);
  assertEqual(cost.dvt, 'PNT', 'vnd → PNT');
  assertEqual(cost.fxRate, 1, 'pnt fx');
  assertEqual(cost.amount, 500000, 'pnt amount');

  // --- mapping insert + admin-safe update ---
  CONFIG.EXCHANGE_RATE = null;
  const record = {
    rowNumber: 5,
    values: makeSourceValues({
      1: '  N8N  Cloud ',
      3: 'Chi tiết gói',
      4: 'Dev M5',
      5: 'Gia hạn',
      6: 'Mua theo tháng',
      7: 34.2,
      16: 'Thẻ visa',
      18: 3513372,
      19: '',
      20: '11 hàng tháng',
    }),
  };
  const validated = validateSourceRecord_(record);
  assert(validated.ok, 'map source ok');
  const mapped = mapSourceToTarget_(record, validated, new Map());
  assertEqual(mapped.insertRow[CONFIG.TARGET_COLS.TEAM], 'Dev M5', 'team');
  assertEqual(mapped.insertRow[CONFIG.TARGET_COLS.ID_BOKT], '3513372', 'id');
  assertEqual(mapped.insertRow[CONFIG.TARGET_COLS.NCC], 'N8N Cloud', 'ncc normalized');
  assertEqual(mapped.insertRow[CONFIG.TARGET_COLS.CHANNEL], 'mkt0008', 'default channel');
  assertEqual(mapped.insertRow[CONFIG.TARGET_COLS.STATUS], 'PENDING', 'default status');
  assertEqual(mapped.insertRow[CONFIG.TARGET_COLS.GROUP_INTERNAL], false, 'group false');
  assertEqual(mapped.updatePatch[CONFIG.TARGET_COLS.STATUS], undefined, 'status omitted when source empty');

  const existing = new Array(CONFIG.TARGET_NUM_COLS).fill('');
  existing[CONFIG.TARGET_COLS.GROUP_INTERNAL] = true;
  existing[CONFIG.TARGET_COLS.PIC] = 'mali';
  existing[CONFIG.TARGET_COLS.NOTE] = 'keep-me';
  existing[CONFIG.TARGET_COLS.CREATED_AT] = new Date(2026, 0, 1);
  existing[CONFIG.TARGET_COLS.STATUS] = 'Approved';
  existing[CONFIG.TARGET_COLS.BRAND] = 'BrandX';

  const merged = applyUpdatePatch_(existing, mapped.updatePatch);
  assertEqual(merged[CONFIG.TARGET_COLS.GROUP_INTERNAL], true, 'preserve admin group');
  assertEqual(merged[CONFIG.TARGET_COLS.PIC], 'mali', 'preserve PIC');
  assertEqual(merged[CONFIG.TARGET_COLS.NOTE], 'keep-me', 'preserve note');
  assertEqual(merged[CONFIG.TARGET_COLS.BRAND], 'BrandX', 'preserve brand');
  assertEqual(merged[CONFIG.TARGET_COLS.STATUS], 'Approved', 'preserve status when source empty');
  assertEqual(merged[CONFIG.TARGET_COLS.COST], 34.2, 'update cost');
  assertEqual(merged[CONFIG.TARGET_COLS.NCC], 'N8N Cloud', 'update ncc');
  assert(
    merged[CONFIG.TARGET_COLS.CREATED_AT] instanceof Date &&
      merged[CONFIG.TARGET_COLS.CREATED_AT].getTime() === existing[CONFIG.TARGET_COLS.CREATED_AT].getTime(),
    'preserve created at'
  );

  // Status updates when source has value
  record.values[CONFIG.SOURCE_COLS.PAYMENT_STATUS] = 'Done';
  const validated2 = validateSourceRecord_(record);
  const mapped2 = mapSourceToTarget_(record, validated2, new Map());
  const merged2 = applyUpdatePatch_(existing, mapped2.updatePatch);
  assertEqual(merged2[CONFIG.TARGET_COLS.STATUS], 'Done', 'status updates from source');

  console.log('All sync-logic tests passed.');
}

run();
