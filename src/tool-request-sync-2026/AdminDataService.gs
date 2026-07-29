/**
 * AdminDataService.gs
 * ---------------------------------------------------------------------------
 * Read rows ticked in column B (Group nội bộ duyệt) from sheet 2026 for
 * Admin Tool approval-message builders.
 */

/**
 * Load every data row on sheet 2026 where column B is checked (TRUE).
 * @returns {Object[]} ticket objects (see shape below)
 */
function readTickedAdminRows_() {
  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const idCol = CONFIG.TARGET_COLS.ID_BOKT + 1;
  const lastRow = findLastRowByColumn_(sheet, CONFIG.TARGET_DATA_START_ROW, idCol);
  if (lastRow < CONFIG.TARGET_DATA_START_ROW) {
    throw new Error(`Sheet "${CONFIG.TARGET_SHEET_NAME}" chưa có dữ liệu.`);
  }

  const numRows = lastRow - CONFIG.TARGET_DATA_START_ROW + 1;
  const values = sheet
    .getRange(CONFIG.TARGET_DATA_START_ROW, 1, numRows, CONFIG.TARGET_NUM_COLS)
    .getValues();

  const TC = CONFIG.TARGET_COLS;
  const tickets = [];

  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const ticked = row[TC.GROUP_INTERNAL] === true || row[TC.GROUP_INTERNAL] === 'TRUE';
    if (!ticked) continue;

    const idBokt = normalizeId_(row[TC.ID_BOKT]);
    if (!idBokt) continue;

    const content = row[TC.CONTENT] == null ? '' : String(row[TC.CONTENT]);
    const parsed = parseTicketContent_(content);

    tickets.push({
      rowNumber: CONFIG.TARGET_DATA_START_ROW + i,
      month: row[TC.MONTH],
      team: normalizeText_(row[TC.TEAM]),
      idBokt,
      toolName: normalizeText_(row[TC.TOOL_NAME]) || parsed.toolNameFallback || '',
      content,
      paymentInfo: normalizeText_(row[TC.PAYMENT_INFO]),
      cost: parseNumber_(row[TC.COST]),
      dvt: normalizeText_(row[TC.DVT]) || 'USD',
      brand: normalizeText_(row[TC.BRAND]) || 'All Brand',
      paymentType: normalizeText_(row[TC.PAYMENT_TYPE]),
      renewalType: normalizeText_(row[TC.RENEWAL_TYPE]),
      usageTime: row[TC.USAGE_TIME],
      qty: parsed.qty || CONFIG.MESSAGE.DEFAULT_QTY,
      deployStart: parsed.deployStart,
      deployEnd: parsed.deployEnd,
      features: parsed.features,
      packageInfo: parsed.packageInfo,
      stk: parsed.stk,
      recipient: parsed.recipient,
      bank: parsed.bank,
      periodLabel: parsed.periodLabel, // e.g. T8/2026
      priceLabel: parsed.priceLabel,
    });
  }

  return tickets;
}

/**
 * Filter ticked tickets by allowed payment types; throw if none match.
 * @param {Object[]} tickets
 * @param {string[]} allowedTypes
 * @param {string} actionLabel
 * @returns {Object[]}
 */
function filterTicketsByPaymentType_(tickets, allowedTypes, actionLabel) {
  if (!tickets.length) {
    throw new Error(
      'Chưa có dòng nào được tick ở cột B (Group nội bộ duyệt).\n' +
        'Hãy tick các dòng cần đưa vào tin nhắn rồi chạy lại.'
    );
  }

  const allowed = new Set(allowedTypes.map((t) => normalizeText_(t)));
  const matched = tickets.filter((t) => allowed.has(t.paymentType));
  const skipped = tickets.length - matched.length;

  if (!matched.length) {
    throw new Error(
      `${actionLabel}: không có dòng tick nào thuộc loại [${allowedTypes.join(', ')}].\n` +
        `Các dòng đang tick có Loại thanh toán: ${uniquePaymentTypes_(tickets).join(', ') || '(trống)'}`
    );
  }

  if (skipped > 0) {
    console.log(
      `${actionLabel}: bỏ qua ${skipped} dòng tick không thuộc [${allowedTypes.join(', ')}].`
    );
  }

  return matched;
}

/**
 * @param {Object[]} tickets
 * @returns {string[]}
 */
function uniquePaymentTypes_(tickets) {
  const set = new Set();
  tickets.forEach((t) => {
    if (t.paymentType) set.add(t.paymentType);
  });
  return Array.from(set);
}

/**
 * Resolve title team label from ticket Team QL values.
 * @param {Object[]} tickets
 * @returns {string}
 */
function resolveTeamLabel_(tickets) {
  const map = CONFIG.MESSAGE.TEAM_LABEL_BY_TEAM || {};
  for (let i = 0; i < tickets.length; i++) {
    const team = tickets[i].team;
    if (team && map[team]) return map[team];
  }
  // Soft parse "Dev M5" → "M5 - DEV SEO"
  const first = tickets[0] && tickets[0].team ? tickets[0].team : '';
  const m = first.match(/^(Dev|DEV|Seo|SEO)\s*M?(\d+)/i);
  if (m) return `M${m[2]} - DEV SEO`;
  return CONFIG.MESSAGE.DEFAULT_TEAM_LABEL;
}

/**
 * Resolve period label T8/2026 from content, else from month column.
 * @param {Object[]} tickets
 * @returns {string}
 */
function resolvePeriodLabel_(tickets) {
  for (let i = 0; i < tickets.length; i++) {
    if (tickets[i].periodLabel) return tickets[i].periodLabel;
  }
  let month = null;
  for (let i = 0; i < tickets.length; i++) {
    const n = parseNumber_(tickets[i].month);
    if (n !== null) {
      month = n;
      break;
    }
  }
  const now = new Date();
  const m = month || now.getMonth() + 1;
  const y = now.getFullYear();
  return `T${m}/${y}`;
}
