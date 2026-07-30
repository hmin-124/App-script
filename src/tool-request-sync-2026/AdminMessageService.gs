/**
 * AdminMessageService.gs
 * ---------------------------------------------------------------------------
 * Build Lead/Head approval messages for:
 *   1) Gia hạn / Nâng cấp
 *   2) Mua tool mới
 *
 * Selection source: sheet 2026 column B (Group nội bộ duyệt) = TRUE.
 */

/**
 * Menu: Lead — gia hạn/nâng cấp
 */
function buildLeadRenewMessage() {
  runAdminMessageAction_('Tin nhắn Lead — gia hạn/nâng cấp', () => {
    const tickets = filterTicketsByPaymentType_(
      readTickedAdminRows_(),
      CONFIG.MESSAGE.RENEW_CATEGORY_ORDER,
      'Lead gia hạn/nâng cấp'
    );
    return buildLeadRenewMessage_(tickets);
  });
}

/**
 * Menu: Head — gia hạn/nâng cấp
 */
function buildHeadRenewMessage() {
  runAdminMessageAction_('Tin nhắn Head — gia hạn/nâng cấp', () => {
    const tickets = filterTicketsByPaymentType_(
      readTickedAdminRows_(),
      CONFIG.MESSAGE.RENEW_CATEGORY_ORDER,
      'Head gia hạn/nâng cấp'
    );
    return buildHeadRenewMessage_(tickets);
  });
}

/**
 * Menu: Lead — mua tool mới
 */
function buildLeadNewToolMessage() {
  runAdminMessageAction_('Tin nhắn Lead — mua tool mới', () => {
    const tickets = filterTicketsByPaymentType_(
      readTickedAdminRows_(),
      [CONFIG.MESSAGE.PAYMENT_CATEGORY.MUA_MOI],
      'Lead mua tool mới'
    );
    return buildLeadNewToolMessage_(tickets);
  });
}

/**
 * Menu: Head — mua tool mới
 */
function buildHeadNewToolMessage() {
  runAdminMessageAction_('Tin nhắn Head — mua tool mới', () => {
    const tickets = filterTicketsByPaymentType_(
      readTickedAdminRows_(),
      [CONFIG.MESSAGE.PAYMENT_CATEGORY.MUA_MOI],
      'Head mua tool mới'
    );
    return buildHeadNewToolMessage_(tickets);
  });
}

/**
 * @param {string} title
 * @param {function(): string} builderFn
 */
function runAdminMessageAction_(title, builderFn) {
  try {
    const message = builderFn();
    showMessageDialog_(title, message);
  } catch (err) {
    notifyUser_(true, title, describeError_(err).message);
  }
}

/**
 * Lead renew/upgrade message (grouped by Loại).
 * @param {Object[]} tickets
 * @returns {string}
 */
function buildLeadRenewMessage_(tickets) {
  const teamLabel = resolveTeamLabel_(tickets);
  const period = resolvePeriodLabel_(tickets);
  const groups = groupRenewTicketsForLead_(tickets);
  const total = sumTicketCosts_(tickets);

  const lines = [];
  lines.push(`[${teamLabel}] - Đề xuất gia hạn/nâng cấp tool ${period}`);
  lines.push('=====');

  groups.forEach((group, gIdx) => {
    lines.push(group.header);
    group.items.forEach((t, idx) => {
      lines.push(`${idx + 1}. ${t.toolName || '(Chưa có tên tool)'}`);
      lines.push(`- Số lượng: ${t.qty || CONFIG.MESSAGE.DEFAULT_QTY}`);
      lines.push(`- ID phiếu: ${t.idBokt}`);
      lines.push(`- Chi phí: ${formatMoneyLabel_(t.cost, t.dvt)}`);
      if (idx < group.items.length - 1) lines.push('');
    });
    lines.push('=====');
    if (gIdx < groups.length - 1) {
      // blank line between category blocks is optional; sample keeps ===== only
    }
  });

  lines.push(`=> TỔNG CẦN THANH TOÁN: ${formatMoneyLabel_(total, 'USD')}`);
  lines.push('=====');
  lines.push('');
  lines.push(
    `Nhờ anh ${CONFIG.MESSAGE.LEAD_MENTION} xác nhận duyệt gia hạn phiếu tool.`
  );
  lines.push('E cám ơn ạ!');

  return lines.join('\n');
}

/**
 * Head renew/upgrade message (flat list + Link BOKT placeholders).
 * @param {Object[]} tickets
 * @returns {string}
 */
function buildHeadRenewMessage_(tickets) {
  const teamLabel = resolveTeamLabel_(tickets);
  const period = resolvePeriodLabel_(tickets);
  const total = sumTicketCosts_(tickets);
  const placeholder = CONFIG.MESSAGE.BOKT_LINK_PLACEHOLDER;

  const lines = [];
  lines.push(`[${teamLabel}] - Đề xuất gia hạn/nâng cấp tool ${period}`);
  lines.push('=====');

  tickets.forEach((t, idx) => {
    lines.push(
      `${idx + 1}. ID phiếu: ${t.idBokt} - ${t.toolName || '(Chưa có tên tool)'} - ${formatMoneyLabel_(t.cost, t.dvt)}`
    );
    lines.push(`Link BOKT:${placeholder === '' ? '' : ' ' + placeholder}`);
  });

  lines.push('=====');
  lines.push(`=> TỔNG CẦN THANH TOÁN: ${formatMoneyLabel_(total, 'USD')}`);
  lines.push('=====');
  lines.push(
    `Nhờ anh ${CONFIG.MESSAGE.HEAD_MENTION} duyệt giúp em các phiếu gia hạn tool trên. Các phiếu này đã được Lead ${CONFIG.MESSAGE.LEAD_MENTION} phê duyệt ạ!`
  );
  lines.push('Cám ơn anh!');

  return lines.join('\n');
}

/**
 * Lead — mua tool mới (chi tiết từ Nội dung phiếu).
 * @param {Object[]} tickets
 * @returns {string}
 */
function buildLeadNewToolMessage_(tickets) {
  const teamLabel = resolveTeamLabel_(tickets);
  const period = resolvePeriodLabel_(tickets);
  const lines = [];

  lines.push(`[${teamLabel}] - Đề xuất mua tool mới ${period}`);

  tickets.forEach((t, idx) => {
    if (idx > 0) {
      lines.push('=====');
    }
    appendNewToolDetailBlock_(lines, t);
  });

  lines.push('__________');
  lines.push(
    `Nhờ anh ${CONFIG.MESSAGE.NEW_TOOL_LEAD_REVIEWERS} review và phê duyệt giúp em phiếu mua mới Tool này ạ. Cám ơn anh!`
  );

  return lines.join('\n');
}

/**
 * Head — mua tool mới (cùng body, closing khác).
 * @param {Object[]} tickets
 * @returns {string}
 */
function buildHeadNewToolMessage_(tickets) {
  const teamLabel = resolveTeamLabel_(tickets);
  const period = resolvePeriodLabel_(tickets);
  const lines = [];

  lines.push(`[${teamLabel}] - Đề xuất mua tool mới ${period}`);

  tickets.forEach((t, idx) => {
    if (idx > 0) lines.push('=====');
    appendNewToolDetailBlock_(lines, t);
  });

  lines.push('__________');
  lines.push(
    `Nhờ anh ${CONFIG.MESSAGE.HEAD_MENTION} duyệt giúp em các phiếu mua tool mới trên. Các phiếu này đã được Lead ${CONFIG.MESSAGE.LEAD_MENTION} review và phê duyệt ạ!`
  );
  lines.push('Cám ơn anh!');

  return lines.join('\n');
}

/**
 * Append one new-tool detail block (shared by Lead/Head).
 * @param {string[]} lines
 * @param {Object} t
 */
function appendNewToolDetailBlock_(lines, t) {
  const deploy =
    t.deployStart && t.deployEnd
      ? `Từ ${t.deployStart} - ${t.deployEnd}`
      : t.deployStart || t.deployEnd || '(Chưa có trong nội dung phiếu)';

  const price =
    t.priceLabel ||
    formatMoneyLabel_(t.cost, t.dvt);

  lines.push(`ID phiếu: ${t.idBokt}`);
  lines.push(`Tên tool: ${t.toolName || '(Chưa có)'}`);
  if (t.features) {
    lines.push('Tính năng:');
    lines.push(t.features);
  } else if (t.packageInfo) {
    lines.push(`Tính năng / Gói: ${t.packageInfo}`);
  } else {
    lines.push('Tính năng: (Chưa trích xuất được từ nội dung phiếu)');
  }
  lines.push(`Thời gian triển khai: ${deploy}`);
  lines.push(`Brand triển khai: ${t.brand || 'All Brand'}`);
  lines.push(`Giá tiền: ${price}`);
  lines.push('__________');

  // Visa defaults always filled for mua-mới messages (override if ticket has values).
  const visa = CONFIG.MESSAGE.DEFAULT_VISA_PAYMENT;
  const method = normalizeText_(t.paymentInfo) || visa.METHOD;
  const stk = normalizeText_(t.stk) || visa.STK;
  const accountName = normalizeText_(t.recipient) || visa.ACCOUNT_NAME;
  const bank = normalizeText_(t.bank) || visa.BANK;

  lines.push(`Thông tin thanh toán: ${method}`);
  lines.push(`STK: ${stk}`);
  lines.push(`Tên TK: ${accountName}`);
  lines.push(`Ngân hàng: ${bank}`);
}

/**
 * Group renew tickets for Lead message.
 * Gia hạn → "📌 Loại: {Loại gia hạn} - Gia hạn"
 * Nâng cấp → "📌 Loại: Nâng cấp" (kèm cycle nếu có và khác mặc định)
 * @param {Object[]} tickets
 * @returns {{header: string, items: Object[]}[]}
 */
function groupRenewTicketsForLead_(tickets) {
  const CAT = CONFIG.MESSAGE.PAYMENT_CATEGORY;
  const order = CONFIG.MESSAGE.RENEW_CATEGORY_ORDER;
  const groups = [];
  const indexByHeader = new Map();

  const sorted = tickets.slice().sort((a, b) => {
    const ra = order.indexOf(a.paymentType);
    const rb = order.indexOf(b.paymentType);
    return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
  });

  sorted.forEach((t) => {
    let header;
    if (t.paymentType === CAT.GIA_HAN) {
      const cycle = t.renewalType || 'Mua theo tháng';
      header = `📌 Loại: ${cycle} - ${CAT.GIA_HAN}`;
    } else if (t.paymentType === CAT.NANG_CAP) {
      header = `📌 Loại: ${CAT.NANG_CAP}`;
    } else {
      header = `📌 Loại: ${t.paymentType || 'Chưa phân loại'}`;
    }

    if (!indexByHeader.has(header)) {
      indexByHeader.set(header, groups.length);
      groups.push({ header, items: [] });
    }
    groups[indexByHeader.get(header)].items.push(t);
  });

  return groups;
}

/**
 * @param {Object[]} tickets
 * @returns {number}
 */
function sumTicketCosts_(tickets) {
  return tickets.reduce((sum, t) => sum + (Number(t.cost) || 0), 0);
}

/**
 * Show copyable preview dialog.
 * @param {string} title
 * @param {string} message
 */
function showMessageDialog_(title, message) {
  try {
    const template = HtmlService.createTemplateFromFile('MessageDialog');
    template.message = message;
    const html = template
      .evaluate()
      .setWidth(760)
      .setHeight(580);
    SpreadsheetApp.getUi().showModalDialog(html, title);
  } catch (err) {
    // Fallback when HTML file missing — still surface the message.
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  }
}
