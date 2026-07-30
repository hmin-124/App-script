/**
 * ValidationService.gs
 * ---------------------------------------------------------------------------
 * Required-field + cost presence checks for a Tool Request source record.
 */

/**
 * Validate one source record.
 * @param {{rowNumber: number, values: *[]}} record
 * @param {Object=} colMap optional override of CONFIG.SOURCE_COLS (header-resolved)
 * @returns {Object}
 */
function validateSourceRecord_(record, colMap) {
  const cols = colMap || CONFIG.SOURCE_COLS;
  const values = record.values || [];

  const toolName = normalizeText_(values[cols.TOOL_NAME]);
  const team = normalizeText_(values[cols.TEAM]);
  const paymentType = normalizeText_(values[cols.PAYMENT_TYPE]);
  const renewalType = normalizeText_(values[cols.RENEWAL_TYPE]);
  const detail = values[cols.DETAIL];
  const paymentInfo = values[cols.PAYMENT_INFO];
  const paymentStatus = normalizeText_(values[cols.PAYMENT_STATUS]);
  const renewalDate = values[cols.RENEWAL_DATE];

  // ID: cột S trước, fallback parse từ Nội dung phiếu.
  let idBokt = isBlankId_(values[cols.ID_BOKT]) ? '' : normalizeId_(values[cols.ID_BOKT]);
  if (!idBokt) {
    idBokt = extractIdFromContent_(detail);
  }

  // Cost: H USD → I VND → K Cost/First Month (fallback).
  let priceUsd = parseNumber_(values[cols.PRICE_USD]);
  let priceVnd = parseNumber_(values[cols.PRICE_VND]);
  if (priceUsd === null && priceVnd === null && cols.COST_FIRST_MONTH != null) {
    const firstMonth = parseNumber_(values[cols.COST_FIRST_MONTH]);
    if (firstMonth !== null) {
      priceUsd = firstMonth;
    }
  }

  const errors = [];
  const warnings = [];

  if (!toolName) errors.push('Thiếu Tên tool (cột B)');
  if (!team) errors.push('Thiếu Vị trí sử dụng (cột E)');
  if (!paymentType) errors.push('Thiếu Loại thanh toán (cột F)');
  if (!renewalType) errors.push('Thiếu Loại gia hạn (cột G)');
  if (!idBokt) {
    errors.push('Thiếu ID BOKT (cột S) — bắt buộc để upsert sang sheet 2026');
  }

  if (priceUsd === null && priceVnd === null) {
    errors.push('Thiếu thông tin chi phí (cột H Giá USD hoặc I Giá VNĐ)');
  }

  if (priceUsd !== null && priceVnd !== null) {
    warnings.push('Dòng nguồn có cả Giá USD và Giá VNĐ — ưu tiên USD');
  }

  if (idBokt && isBlankId_(values[cols.ID_BOKT])) {
    warnings.push(`ID BOKT lấy từ Nội dung phiếu: ${idBokt}`);
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
