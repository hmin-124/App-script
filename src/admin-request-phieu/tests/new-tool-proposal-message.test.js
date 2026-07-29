/**
 * Regression: proposal message built from Request Tool mới sheet data
 * must match the Admin sample (AHREFS / SEO TECH) exactly.
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
    Logger: { log() {} },
  };
  vm.createContext(context);
  for (const file of ['Config.gs', 'Utils.gs', 'NewToolRequestService.gs']) {
    const code =
      fs.readFileSync(path.join(ROOT, file), 'utf8') +
      '\n;["Config","UserFacingError","AppLogger","Utils","NewToolRequestService"]' +
      '.forEach((name) => { try { this[name] = eval(name); } catch (_) {} });';
    vm.runInContext(code, context, { filename: file });
  }
  return context;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}\n--- expected ---\n${expected}\n--- actual ---\n${actual}`);
  }
}

function run() {
  const { Config, Utils, NewToolRequestService } = loadProject();

  assertEqual(
    Utils.getNextMonthSheetName(new Date(2026, 6, 29)),
    'Request Tool mới T8.2026',
    'sheet name for Jul 2026'
  );
  assertEqual(Utils.matchRequestSheetName('Request Tool mới T8.2026')?.month, 8, 'parse titled sheet');
  assertEqual(Utils.matchRequestSheetName('T7.2026')?.month, 7, 'parse legacy sheet');
  assertEqual(Utils.matchRequestSheetName('Dev SEO T7.2026')?.month, 7, 'parse prefixed sheet');

  const tool = {
    tenTool: 'AHREFS',
    thongTinGoi: 'Ahrefs Standard - Monthly',
    price: 249,
    idPhieu: '3513368',
    note: 'Phục vụ SEO Tech dự án A',
    teamTag: 'SEO TECH',
    brandTrienKhai: 'All brand',
    thoiGianTrienKhai: 'Từ 29/07/2026 - 28/08/2026',
    stk: '4GWJL268DKZRC8L',
    tenNguoiNhan: 'NGUYEN THI MY XUYEN',
    tenNganHang: 'VIETINBANK',
  };

  const expected = [
    '[SEO TECH] Đề xuất giải ngân NCC AHREFS - Tháng 08/2026',
    'ID phiếu: 3513368',
    'Thời gian triển khai: Từ 29/07/2026 - 28/08/2026',
    'Brand triển khai: All brand',
    '',
    'Thông tin gói: Ahrefs Standard - Monthly',
    'Price: 249 USD',
    'GTGT (10%): 24.9 USD',
    'TOTAL: 273.9 USD',
    '__________',
    'Hình thức thanh toán:',
    'STK: 4GWJL268DKZRC8L',
    'Tên người nhận: NGUYEN THI MY XUYEN',
    'Tên ngân hàng: VIETINBANK',
    '',
    'Note: Phục vụ SEO Tech dự án A',
    '',
    'Nhờ anh duyệt giúp em đề xuất mua Tool mới này ạ.',
    'Cám ơn anh!',
  ].join('\n');

  const actual = NewToolRequestService.buildMessage(tool, 8, 2026);
  assertEqual(actual, expected, 'AHREFS sample message');

  assertEqual(Config.REQUEST_SHEET_TITLE_PREFIX, 'Request Tool mới ', 'title prefix');
  assertEqual(Config.MENU_ITEM_NEW_TOOL_REQUEST.includes('GỬI TIN NHẮN'), true, 'menu label');

  console.log('OK — new-tool-proposal-message tests passed.');
}

run();
