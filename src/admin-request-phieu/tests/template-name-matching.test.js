/**
 * Regression test for "Không tìm thấy Template." when request sheets were
 * renamed/duplicated to prefixed names such as:
 *   - "Dev SEO T7.2026"
 *   - "Copy of T8.2026"
 *
 * Reproduces the real workbook state from the bug report (M5 - DevSEO -
 * Software Info) inside a lightweight Sheet/Spreadsheet mock, then asserts
 * TemplateService + MessageService resolve those tabs correctly.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const FILES = [
  'Config.gs',
  'Utils.gs',
  'TemplateService.gs',
  'MessageService.gs',
];

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
    Logger: { log() {} },
  };
  vm.createContext(context);
  for (const file of FILES) {
    // Class declarations are lexical bindings in Node's vm and do NOT become
    // properties of the sandbox automatically - mirror each top-level class
    // onto `this` so later files (and the test) can resolve them.
    const code =
      fs.readFileSync(path.join(ROOT, file), 'utf8') +
      '\n;["Config","UserFacingError","AppLogger","Utils","TemplateService","MessageService"]' +
      '.forEach((name) => { try { this[name] = eval(name); } catch (_) {} });';
    vm.runInContext(code, context, { filename: file });
  }
  return context;
}

class MockSheet {
  constructor(name) {
    this._name = name;
  }
  getName() {
    return this._name;
  }
  setName(name) {
    this._name = name;
  }
  getIndex() {
    return 1;
  }
  copyTo(spreadsheet) {
    const copy = new MockSheet(`Copy of ${this._name}`);
    spreadsheet._sheets.push(copy);
    return copy;
  }
}

class MockSpreadsheet {
  constructor(sheetNames, activeName) {
    this._sheets = sheetNames.map((name) => new MockSheet(name));
    this._activeName = activeName || sheetNames[0];
  }
  getSheets() {
    return this._sheets.slice();
  }
  getSheetByName(name) {
    return this._sheets.find((sheet) => sheet.getName() === name) || null;
  }
  getActiveSheet() {
    return this.getSheetByName(this._activeName) || this._sheets[0] || null;
  }
  setActiveSheet(sheet) {
    this._activeName = sheet.getName();
  }
  deleteSheet(sheet) {
    this._sheets = this._sheets.filter((item) => item !== sheet);
  }
  moveActiveSheet() {}
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function run() {
  const { Config, Utils, TemplateService, MessageService, UserFacingError } = loadProject();
  let passed = 0;

  // --- Utils.matchRequestSheetName / parseSheetName --------------------
  assertEqual(Utils.matchRequestSheetName('T8.2026')?.month, 8, 'canonical month');
  assertEqual(Utils.matchRequestSheetName('T8.2026')?.year, 2026, 'canonical year');
  assertEqual(Utils.matchRequestSheetName('Dev SEO T7.2026')?.month, 7, 'Dev SEO prefix month');
  assertEqual(Utils.matchRequestSheetName('Copy of T8.2026')?.month, 8, 'Copy of prefix month');
  assertEqual(Utils.matchRequestSheetName('QUẢN LÝ TOOLS'), null, 'tracker is not a request sheet');
  assertEqual(Utils.matchRequestSheetName('PaaS, SaaS'), null, 'unrelated sheet skipped');
  assertEqual(Utils.parseSheetName('Copy of T9.2026').year, 2026, 'parseSheetName accepts prefix');
  passed += 7;

  // --- Real bug workbook state (from screenshot) -----------------------
  // Tabs: Copy of T8.2026 | PaaS, SaaS | QUẢN LÝ TOOLS | Dev SEO T7.2026
  // Today ~ 07/2026 => Generate targets T8.2026 => needs a template before T8.
  const bugWorkbook = new MockSpreadsheet(
    ['Copy of T8.2026', 'PaaS, SaaS', 'QUẢN LÝ TOOLS', 'Dev SEO T7.2026'],
    'Copy of T8.2026'
  );
  const templateService = new TemplateService(bugWorkbook);
  const template = templateService.findLatestTemplateSheet(8, 2026);
  assertEqual(template.getName(), 'Dev SEO T7.2026', 'prefers earlier month Dev SEO T7 over Copy of T8');
  passed += 1;

  // Same-month fallback when only a duplicated tab remains.
  const onlyCopy = new MockSpreadsheet(['Copy of T8.2026', 'QUẢN LÝ TOOLS']);
  const fallback = new TemplateService(onlyCopy).findLatestTemplateSheet(8, 2026);
  assertEqual(fallback.getName(), 'Copy of T8.2026', 'falls back to same-month Copy of T8');
  passed += 1;

  // Still errors when nothing resembles a request sheet.
  let threw = false;
  try {
    new TemplateService(new MockSpreadsheet(['QUẢN LÝ TOOLS', 'PaaS, SaaS'])).findLatestTemplateSheet(8, 2026);
  } catch (error) {
    threw = error instanceof UserFacingError && /Không tìm thấy Template/.test(error.message);
  }
  assert(threw, 'still throws UserFacingError when no template exists');
  passed += 1;

  // createSheetFromTemplate copies Dev SEO T7 -> T8.2026
  const created = templateService.createSheetFromTemplate('T8.2026', 8, 2026);
  assertEqual(created.getName(), 'T8.2026', 'new sheet gets canonical name');
  assert(bugWorkbook.getSheetByName('T8.2026'), 'canonical T8.2026 exists after copy');
  passed += 2;

  // MessageService must accept the active prefixed tab (Copy of T8.2026),
  // which is the real state when Admin opens a duplicated request sheet.
  const messageWorkbook = new MockSpreadsheet(
    ['Copy of T8.2026', 'PaaS, SaaS', 'QUẢN LÝ TOOLS', 'Dev SEO T7.2026'],
    'Copy of T8.2026'
  );
  const resolved = new MessageService(messageWorkbook)._getRequestSheet();
  assertEqual(resolved.getName(), 'Copy of T8.2026', 'MessageService uses active prefixed request sheet');
  passed += 1;

  // Canonical names still work.
  assertEqual(
    new TemplateService(new MockSpreadsheet(['T7.2026', 'QUẢN LÝ TOOLS'])).findLatestTemplateSheet(8, 2026).getName(),
    'T7.2026',
    'canonical T7 still works'
  );
  passed += 1;

  console.log(`OK — ${passed} assertions passed (template-name-matching).`);
  console.log(`REQUEST_SHEET_PREFIX=${Config.REQUEST_SHEET_PREFIX}`);
}

run();
