/**
 * Tests for Admin Tool approval-message builders (Lead/Head renew + new tool).
 *
 * Run: node src/tool-request-sync-2026/tests/admin-message.test.js
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
    'MappingService.gs',
    'ContentParser.gs',
    'AdminDataService.gs',
    'AdminMessageService.gs',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, {
      filename: file,
    });
  }

  return vm.runInContext(
    `({
      CONFIG,
      parseTicketContent_,
      formatMoneyLabel_,
      buildLeadRenewMessage_,
      buildHeadRenewMessage_,
      buildLeadNewToolMessage_,
      buildHeadNewToolMessage_,
      groupRenewTicketsForLead_,
      resolveTeamLabel_,
      resolvePeriodLabel_,
      filterTicketsByPaymentType_,
    })`,
    context
  );
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertIncludes(text, snippet, label) {
  if (text.indexOf(snippet) === -1) {
    throw new Error(`${label}: missing ${JSON.stringify(snippet)}\n---\n${text}`);
  }
}

function run() {
  const ctx = loadProject();
  const {
    parseTicketContent_,
    formatMoneyLabel_,
    buildLeadRenewMessage_,
    buildHeadRenewMessage_,
    buildLeadNewToolMessage_,
    buildHeadNewToolMessage_,
    groupRenewTicketsForLead_,
    resolveTeamLabel_,
    filterTicketsByPaymentType_,
    CONFIG,
  } = ctx;

  assert(formatMoneyLabel_(300, 'USD') === '$300', 'money int');
  assert(formatMoneyLabel_(552.86, 'USD') === '$552.86', 'money decimal');

  const content =
    '[Dev SEO M5] - Request gia hạn tool Cloudflare T8/2026\n' +
    'Thời gian triển khai: 17/08/2026 - 16/09/2026\n' +
    'Mục đích sử dụng:\n- CDN + security\n' +
    'Số lượng: 1\n' +
    'NH: VIETINBANK\nSTK: 4GWJL268DKZRC8L\nCHỦ TK: NGUYEN THI MY XUYEN\n';
  const parsed = parseTicketContent_(content);
  assert(parsed.periodLabel === 'T8/2026', 'period');
  assert(parsed.deployStart === '17/08/2026', 'deploy start');
  assert(parsed.deployEnd === '16/09/2026', 'deploy end');
  assert(parsed.stk === '4GWJL268DKZRC8L', 'stk');
  assert(parsed.bank === 'VIETINBANK', 'bank');
  assert(parsed.recipient.indexOf('NGUYEN') === 0, 'recipient');
  assert(parsed.qty === 1, 'qty');

  const renewTickets = [
    {
      team: 'Dev M5',
      idBokt: '3497082',
      toolName: 'CONTENTFUL',
      cost: 300,
      dvt: 'USD',
      qty: 1,
      paymentType: 'Gia hạn',
      renewalType: 'Mua theo tháng',
      periodLabel: 'T8/2026',
      brand: 'All Brand',
      content: '',
      paymentInfo: 'Thẻ visa',
    },
    {
      team: 'Dev M5',
      idBokt: '3504377',
      toolName: 'BACKBLAZE',
      cost: 5.14,
      dvt: 'USD',
      qty: 1,
      paymentType: 'Gia hạn',
      renewalType: 'Mua theo tháng',
      periodLabel: 'T8/2026',
      brand: 'All Brand',
      content: '',
      paymentInfo: 'Thẻ visa',
    },
    {
      team: 'Dev M5',
      idBokt: '3505066',
      toolName: 'Sentry',
      cost: 100,
      dvt: 'USD',
      qty: 1,
      paymentType: 'Nâng cấp',
      renewalType: 'Mua theo tháng',
      periodLabel: 'T8/2026',
      brand: 'All Brand',
      content: '',
      paymentInfo: 'Thẻ visa',
    },
  ];

  assert(resolveTeamLabel_(renewTickets) === 'M5 - DEV SEO', 'team label');

  const groups = groupRenewTicketsForLead_(renewTickets);
  assert(groups.length === 2, '2 groups');
  assert(groups[0].header === '📌 Loại: Mua theo tháng - Gia hạn', 'gia han header');
  assert(groups[1].header === '📌 Loại: Nâng cấp', 'nang cap header');

  const leadRenew = buildLeadRenewMessage_(renewTickets);
  assertIncludes(leadRenew, '[M5 - DEV SEO] - Đề xuất gia hạn/nâng cấp tool T8/2026', 'lead title');
  assertIncludes(leadRenew, '1. CONTENTFUL', 'lead tool');
  assertIncludes(leadRenew, '- ID phiếu: 3497082', 'lead id');
  assertIncludes(leadRenew, '- Chi phí: $300', 'lead cost');
  assertIncludes(leadRenew, '📌 Loại: Nâng cấp', 'lead nang cap');
  assertIncludes(leadRenew, '=> TỔNG CẦN THANH TOÁN: $405.14', 'lead total');
  assertIncludes(leadRenew, CONFIG.MESSAGE.LEAD_MENTION, 'lead mention');

  const headRenew = buildHeadRenewMessage_(renewTickets);
  assertIncludes(headRenew, '1. ID phiếu: 3497082 - CONTENTFUL - $300', 'head line');
  assertIncludes(headRenew, 'Link BOKT:', 'head link');
  assertIncludes(headRenew, CONFIG.MESSAGE.HEAD_MENTION, 'head mention');
  assertIncludes(headRenew, 'đã được Lead', 'head lead approved');

  const newTickets = [
    {
      team: 'Dev M5',
      idBokt: '3513368',
      toolName: 'Voice minimax',
      cost: 500,
      dvt: 'USDT',
      qty: 1,
      paymentType: 'Mua mới',
      renewalType: 'Mua theo tháng',
      periodLabel: 'T8/2026',
      brand: 'All brand',
      content: content,
      paymentInfo: 'Thẻ Visa',
      deployStart: '29/07/2026',
      deployEnd: '28/08/2026',
      features: 'AI voice',
      stk: '4GWJL268DKZRC8L',
      recipient: 'NGUYEN THI MY XUYEN',
      bank: 'VIETINBANK',
      priceLabel: '500 USDT',
    },
  ];

  const leadNew = buildLeadNewToolMessage_(newTickets);
  assertIncludes(leadNew, '[M5 - DEV SEO] - Đề xuất mua tool mới T8/2026', 'new lead title');
  assertIncludes(leadNew, 'ID phiếu: 3513368', 'new id');
  assertIncludes(leadNew, 'Tên tool: Voice minimax', 'new name');
  assertIncludes(leadNew, 'Thời gian triển khai: Từ 29/07/2026 - 28/08/2026', 'new deploy');
  assertIncludes(leadNew, 'Giá tiền: 500 USDT', 'new price');
  assertIncludes(leadNew, 'STK: 4GWJL268DKZRC8L', 'new stk');
  assertIncludes(leadNew, CONFIG.MESSAGE.NEW_TOOL_LEAD_REVIEWERS, 'new lead reviewers');

  const headNew = buildHeadNewToolMessage_(newTickets);
  assertIncludes(headNew, CONFIG.MESSAGE.HEAD_MENTION, 'new head mention');
  assertIncludes(headNew, 'mua tool mới trên', 'new head closing');

  // filter: only mua moi
  const mixed = renewTickets.concat(newTickets);
  const onlyNew = filterTicketsByPaymentType_(mixed, ['Mua mới'], 'test');
  assert(onlyNew.length === 1, 'filter mua moi');

  let threw = false;
  try {
    filterTicketsByPaymentType_([], ['Gia hạn'], 'empty');
  } catch (e) {
    threw = true;
  }
  assert(threw, 'empty tick throws');

  console.log('All admin-message tests passed.');
}

run();
