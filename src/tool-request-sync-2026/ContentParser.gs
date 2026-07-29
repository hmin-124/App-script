/**
 * ContentParser.gs
 * ---------------------------------------------------------------------------
 * Extract deployment window, payment coordinates, features, qty, and T-period
 * from "Nội dung phiếu" free text for Admin Tool messages.
 */

/**
 * @param {string} content
 * @returns {{
 *   deployStart: string,
 *   deployEnd: string,
 *   features: string,
 *   packageInfo: string,
 *   qty: number|null,
 *   stk: string,
 *   recipient: string,
 *   bank: string,
 *   periodLabel: string,
 *   priceLabel: string,
 *   toolNameFallback: string
 * }}
 */
function parseTicketContent_(content) {
  const text = content == null ? '' : String(content);
  const result = {
    deployStart: '',
    deployEnd: '',
    features: '',
    packageInfo: '',
    qty: null,
    stk: '',
    recipient: '',
    bank: '',
    periodLabel: '',
    priceLabel: '',
    toolNameFallback: '',
  };
  if (!text.trim()) return result;

  // Period: T8/2026
  const period = text.match(/\bT(\d{1,2})\/(\d{4})\b/i);
  if (period) result.periodLabel = `T${Number(period[1])}/${period[2]}`;

  // Deployment: "Thời gian triển khai: 17/08/2026 - 16/09/2026"
  // also "Từ 29/07/2026 - 28/08/2026"
  const deploy =
    text.match(
      /Thời gian triển khai\s*:\s*(?:Từ\s*)?([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})\s*[-–—]\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})/i
    ) ||
    text.match(
      /Từ\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})\s*[-–—]\s*([0-9]{1,2}[\/.\-][0-9]{1,2}[\/.\-][0-9]{2,4})/i
    );
  if (deploy) {
    result.deployStart = normalizeText_(deploy[1]);
    result.deployEnd = normalizeText_(deploy[2]);
  }

  // Qty
  const qtyMatch = text.match(/Số lượng\s*:\s*(\d+)/i) || text.match(/×\s*(\d+)/);
  if (qtyMatch) {
    const q = Number(qtyMatch[1]);
    if (isFinite(q) && q > 0) result.qty = q;
  }

  // Payment block
  const stk =
    text.match(/STK\s*:\s*([^\n\r]+)/i) ||
    text.match(/Số\s*tài\s*khoản\s*:\s*([^\n\r]+)/i) ||
    text.match(/Wallet\s*:\s*([^\n\r]+)/i);
  if (stk) result.stk = normalizeText_(stk[1]);

  const recipient =
    text.match(/CHỦ\s*TK\s*:\s*([^\n\r]+)/i) ||
    text.match(/Tên người nhận\s*:\s*([^\n\r]+)/i) ||
    text.match(/Chủ tài khoản\s*:\s*([^\n\r]+)/i);
  if (recipient) result.recipient = normalizeText_(recipient[1]);

  const bank =
    text.match(/NH\s*:\s*([^\n\r]+)/i) ||
    text.match(/Ngân hàng\s*:\s*([^\n\r]+)/i) ||
    text.match(/Tên ngân hàng\s*:\s*([^\n\r]+)/i);
  if (bank) result.bank = normalizeText_(bank[1]);

  // Features / purpose
  const purpose =
    text.match(/Mục đích(?:\s*sử dụng|\s*sd|\s*SD)?\s*:\s*([\s\S]*?)(?=\n\s*\d+\.|\n\s*KPI|\n\s*Chi tiết|\n\s*Thời gian|\n\s*Giá|\n\s*=====|$)/i);
  if (purpose) {
    result.features = trimBlock_(purpose[1]);
  } else {
    // Fallback: first bullet block after title line
    const lines = text.split(/\r?\n/);
    if (lines.length > 1) {
      result.features = trimBlock_(lines.slice(1, 8).join('\n'));
    }
  }

  const pkg = text.match(/Thông tin gói[^:]*:\s*([^\n\r]+)/i) || text.match(/Chi tiết gói\s*:\s*([^\n\r]+)/i);
  if (pkg) result.packageInfo = normalizeText_(pkg[1]);

  const price = text.match(/Giá(?:\s*gói|\s*tiền)?\s*:\s*([^\n\r]+)/i);
  if (price) result.priceLabel = normalizeText_(price[1]);

  // Tool name from title line (same logic as sync extract, without fallback arg)
  const extracted = extractToolNameFromContent_(text, '');
  if (extracted.toolName) result.toolNameFallback = extracted.toolName;

  return result;
}

/**
 * @param {string} block
 * @returns {string}
 */
function trimBlock_(block) {
  return String(block || '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Format cost for approval messages: $1,234.56 (keep decimals when needed).
 * @param {number|null} amount
 * @param {string=} dvt
 * @returns {string}
 */
function formatMoneyLabel_(amount, dvt) {
  if (amount === null || amount === undefined || !isFinite(Number(amount))) {
    return '$0';
  }
  const n = Number(amount);
  const abs = Math.abs(n);
  // Keep natural decimals ($20.9, $552.86) — do not force trailing .00.
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const unit = normalizeText_(dvt).toUpperCase();
  if (!unit || unit === 'USD' || unit === '$') return `$${formatted}`;
  if (unit === 'USDT') return `${formatted} USDT`;
  if (unit === 'PNT' || unit === 'VND') return `${formatted} ${unit}`;
  return `${formatted} ${unit}`;
}
