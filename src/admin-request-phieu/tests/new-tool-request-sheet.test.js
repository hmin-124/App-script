/**
 * Regression tests for the sheet-based NEW_TOOL_REQUEST message builder.
 * Asserts the exact sample output from the product spec (AHREFS / SEO TECH).
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
    Session: { getScriptTimeZone: () => 'Asia/Ho_Chi_Minh' },
    Utilities: {
      formatDate(date, _tz, pattern) {
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        if (pattern === 'dd/MM/yyyy') return `${dd}/${mm}/${yyyy}`;
        return `${dd}/${mm}/${yyyy}`;
      },
      getUuid: () => 'test-uuid',
    },
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
    throw new Error(
      `${label}\n--- expected ---\n${expected}\n--- actual ---\n${actual}`
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run() {
  const { NewToolRequestService, Config } = loadProject();
  const service = {
    calculate: (data) => NewToolRequestService.prototype.calculateRequestAmounts_.call({}, data),
  };

  const data = {
    department: 'SEO TECH',
    requestTitle: 'Đề xuất giải ngân NCC AHREFS - Tháng 08/2026',
    requestId: '3513368',
    toolName: 'AHREFS',
    toolFeatures: 'Phân tích backlink, keyword, đối thủ và technical SEO',
    packageInformation: 'Ahrefs Standard - Monthly',
    deploymentStartDate: new Date(2026, 6, 29),
    deploymentEndDate: new Date(2026, 7, 28),
    brandProject: 'All brand',
    basePrice: 249,
    currency: 'USD',
    vatRate: 0.1,
    paymentMethod: 'Bank Transfer',
    accountNumber: '4GWJL268DKZRC8L',
    recipientName: 'NGUYEN THI MY XUYEN',
    bankName: 'VIETINBANK',
    paymentNote: '',
    businessPurpose: 'Phục vụ SEO Tech dự án A',
    approverName: '',
    requesterName: 'Henry',
    chatWebhookKey: 'CHAT_WEBHOOK_SEO_TECH',
  };

  service.calculate(data);
  assertEqual(data.deploymentDuration, 31, 'deployment duration days');
  assertEqual(Number(data.vatAmount.toFixed(2)), 24.9, 'vat amount');
  assertEqual(Number(data.totalAmount.toFixed(2)), 273.9, 'total amount');

  const expected = [
    '[SEO TECH] Đề xuất giải ngân NCC AHREFS - Tháng 08/2026',
    '',
    'ID phiếu: 3513368',
    '',
    'Tên Tool: AHREFS',
    '',
    'Tính năng / Mục đích:',
    'Phân tích backlink, keyword, đối thủ và technical SEO',
    '',
    'Thời gian triển khai: Từ 29/07/2026 - 28/08/2026',
    'Thời lượng triển khai: 31 ngày',
    '',
    'Brand triển khai: All brand',
    '',
    'Thông tin gói: Ahrefs Standard - Monthly',
    '',
    'Price: 249.00 USD',
    '',
    'GTGT (10%): 24.90 USD',
    '',
    'TOTAL: 273.90 USD',
    '',
    '__________',
    '',
    'Hình thức thanh toán: Bank Transfer',
    '',
    'STK / Wallet: 4GWJL268DKZRC8L',
    '',
    'Tên người nhận: NGUYEN THI MY XUYEN',
    '',
    'Tên ngân hàng / Network: VIETINBANK',
    '',
    'Note: Phục vụ SEO Tech dự án A',
    '',
    'Nhờ anh duyệt giúp em đề xuất mua Tool mới này ạ.',
    '',
    'Cám ơn anh!',
  ].join('\n');

  const actual = NewToolRequestService.buildNewToolRequestMessage(data);
  assertEqual(actual, expected, 'sample message must match 100%');

  // Optional payment lines omitted when empty
  const minimalPay = { ...data, accountNumber: '', recipientName: '', bankName: '', paymentNote: '' };
  service.calculate(minimalPay);
  const minimalMessage = NewToolRequestService.buildNewToolRequestMessage(minimalPay);
  assert(!minimalMessage.includes('STK / Wallet:'), 'omit empty STK line');
  assert(!minimalMessage.includes('Tên người nhận:'), 'omit empty recipient line');
  assert(!minimalMessage.includes('Tên ngân hàng'), 'omit empty bank line');
  assert(!minimalMessage.includes('Nội dung thanh toán:'), 'omit empty payment note');

  // Approver name custom closing
  const withApprover = { ...data, approverName: 'Minh' };
  service.calculate(withApprover);
  const approverMessage = NewToolRequestService.buildNewToolRequestMessage(withApprover);
  assert(
    approverMessage.includes('Nhờ Minh duyệt giúp em đề xuất mua Tool mới này ạ.'),
    'custom approver closing'
  );

  // VAT parse helpers
  assertEqual(NewToolRequestService._parseVatRate('10%'), 0.1, 'parse 10%');
  assertEqual(NewToolRequestService._parseVatRate(0.1), 0.1, 'parse 0.1');
  assertEqual(NewToolRequestService._parseVatRate(10), 0.1, 'parse 10 as percent points');

  assertEqual(Config.NEW_TOOL_FORM_SHEET_NAME, 'NEW_TOOL_REQUEST', 'form sheet name');
  assertEqual(Config.NEW_TOOL_LOG_SHEET_NAME, 'NEW_TOOL_REQUEST_LOG', 'log sheet name');
  assertEqual(Config.NEW_TOOL_FORM_FIELDS.length, 27, '27 form fields');

  console.log('OK — new-tool-request-sheet tests passed.');
}

run();
