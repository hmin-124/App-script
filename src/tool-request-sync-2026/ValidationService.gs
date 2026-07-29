/**
 * ValidationService.gs
 * ---------------------------------------------------------------------------
 * Required-field + cost presence checks for a Tool Request source record.
 */

/**
 * Validate one source record.
 * @param {{rowNumber: number, values: *[]}} record
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   toolName: string,
 *   idBokt: string,
 *   team: string,
 *   paymentType: string,
 *   renewalType: string,
 *   detail: string,
 *   paymentInfo: string,
 *   paymentStatus: string,
 *   renewalDate: *,
 *   priceUsd: number|null,
 *   priceVnd: number|null
 * }}
 */
function validateSourceRecord_(record) {
  const cols = CONFIG.SOURCE_COLS;
  const values = record.values || [];

  const toolName = normalizeText_(values[cols.TOOL_NAME]);
  const team = normalizeText_(values[cols.TEAM]);
  const paymentType = normalizeText_(values[cols.PAYMENT_TYPE]);
  const renewalType = normalizeText_(values[cols.RENEWAL_TYPE]);
  const idBokt = normalizeId_(values[cols.ID_BOKT]);
  const detail = values[cols.DETAIL];
  const paymentInfo = values[cols.PAYMENT_INFO];
  const paymentStatus = normalizeText_(values[cols.PAYMENT_STATUS]);
  const renewalDate = values[cols.RENEWAL_DATE];
  const priceUsd = parseNumber_(values[cols.PRICE_USD]);
  const priceVnd = parseNumber_(values[cols.PRICE_VND]);

  const errors = [];
  const warnings = [];

  if (!toolName) errors.push('Thiếu Tên tool (cột B)');
  if (!team) errors.push('Thiếu Vị trí sử dụng (cột E)');
  if (!paymentType) errors.push('Thiếu Loại thanh toán (cột F)');
  if (!renewalType) errors.push('Thiếu Loại gia hạn (cột G)');
  if (!idBokt) errors.push('Thiếu ID BOKT (cột S)');

  if (priceUsd === null && priceVnd === null) {
    errors.push('Thiếu thông tin chi phí');
  }

  if (priceUsd !== null && priceVnd !== null) {
    warnings.push('Dòng nguồn có cả Giá USD và Giá VNĐ — ưu tiên USD');
  }

  // Completely empty row (no identity at all) → soft skip without ERROR noise.
  const hasAnyIdentity = !!(toolName || team || idBokt || priceUsd !== null || priceVnd !== null);
  if (!hasAnyIdentity) {
    return {
      ok: false,
      softSkip: true,
      errors: ['Dòng trống'],
      warnings,
      toolName,
      idBokt,
      team,
      paymentType,
      renewalType,
      detail,
      paymentInfo,
      paymentStatus,
      renewalDate,
      priceUsd,
      priceVnd,
    };
  }

  return {
    ok: errors.length === 0,
    softSkip: false,
    errors,
    warnings,
    toolName,
    idBokt,
    team,
    paymentType,
    renewalType,
    detail,
    paymentInfo,
    paymentStatus,
    renewalDate,
    priceUsd,
    priceVnd,
  };
}
