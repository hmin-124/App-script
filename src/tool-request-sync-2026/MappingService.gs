/**
 * MappingService.gs
 * ---------------------------------------------------------------------------
 * Map a validated Tool Request record → 2026 row payload (insert / update patch).
 */

/**
 * Resolve Cost / DVT / FX / Thành tiền from USD/VND source prices.
 * @param {number|null} priceUsd
 * @param {number|null} priceVnd
 * @returns {{cost: number|null, dvt: string, fxRate: number|string, amount: number|string, warning: string}}
 */
function resolveCostAndCurrency_(priceUsd, priceVnd) {
  const configuredFx = CONFIG.EXCHANGE_RATE;
  const hasFx =
    configuredFx !== null &&
    configuredFx !== undefined &&
    configuredFx !== '' &&
    isFinite(Number(configuredFx));

  if (priceUsd !== null) {
    const cost = priceUsd;
    const dvt = 'USD';
    const fxRate = hasFx ? Number(configuredFx) : '';
    const amount = hasFx ? cost * Number(configuredFx) : '';
    return {
      cost,
      dvt,
      fxRate,
      amount,
      warning: priceVnd !== null ? 'Ưu tiên Giá USD (nguồn có cả USD và VNĐ)' : '',
    };
  }

  if (priceVnd !== null) {
    return {
      cost: priceVnd,
      dvt: 'PNT',
      fxRate: 1,
      amount: priceVnd,
      warning: '',
    };
  }

  return {
    cost: null,
    dvt: '',
    fxRate: '',
    amount: '',
    warning: '',
  };
}

/**
 * Resolve NCC display value, optionally via exact lookup on `infor`.
 * @param {string} toolName
 * @param {Map<string,string>=} nccMap
 * @returns {{ncc: string, warning: string}}
 */
function resolveNcc_(toolName, nccMap) {
  const display = normalizeText_(toolName);
  if (!CONFIG.NCC_LOOKUP.ENABLED || !nccMap || nccMap.size === 0) {
    return { ncc: display, warning: '' };
  }
  const key = normalizeHeaderKey_(display);
  if (nccMap.has(key)) {
    return { ncc: nccMap.get(key), warning: '' };
  }
  return {
    ncc: display,
    warning: `Không tìm thấy mã NCC khớp exact cho "${display}" — giữ tên tool gốc`,
  };
}

/**
 * Build insert + update payloads from a validated source record.
 * @param {{rowNumber: number, values: *[]}} record
 * @param {ReturnType<typeof validateSourceRecord_>} validated
 * @param {Map<string,string>=} nccMap
 * @returns {{
 *   idBokt: string,
 *   toolName: string,
 *   sourceRow: number,
 *   warnings: string[],
 *   insertRow: *[],
 *   updatePatch: Object<number, *>
 * }}
 */
function mapSourceToTarget_(record, validated, nccMap) {
  const costInfo = resolveCostAndCurrency_(validated.priceUsd, validated.priceVnd);
  const nccInfo = resolveNcc_(validated.toolName, nccMap);
  const createdAt = new Date();
  const month = monthFromDate_(createdAt);
  const status = validated.paymentStatus || CONFIG.DEFAULT_VALUES.STATUS;

  const warnings = (validated.warnings || []).slice();
  if (costInfo.warning) warnings.push(costInfo.warning);
  if (nccInfo.warning) warnings.push(nccInfo.warning);

  const TC = CONFIG.TARGET_COLS;
  const DV = CONFIG.DEFAULT_VALUES;

  /** Full A:Y row for INSERT. */
  const insertRow = new Array(CONFIG.TARGET_NUM_COLS).fill('');
  insertRow[TC.MONTH] = month;
  insertRow[TC.GROUP_INTERNAL] = DV.GROUP_INTERNAL;
  insertRow[TC.GROUP_BUY] = DV.GROUP_BUY;
  insertRow[TC.TEAM] = validated.team;
  insertRow[TC.ID_BOKT] = validated.idBokt;
  insertRow[TC.CREATED_AT] = createdAt;
  insertRow[TC.CHANNEL] = DV.CHANNEL;
  insertRow[TC.SUB_CHANNEL] = DV.SUB_CHANNEL;
  insertRow[TC.NCC] = nccInfo.ncc;
  insertRow[TC.CONTENT] = validated.detail == null ? '' : validated.detail;
  insertRow[TC.PAYMENT_INFO] = validated.paymentInfo == null ? '' : validated.paymentInfo;
  insertRow[TC.COST] = costInfo.cost;
  insertRow[TC.DVT] = costInfo.dvt;
  insertRow[TC.FX_RATE] = costInfo.fxRate;
  insertRow[TC.AMOUNT] = costInfo.amount;
  insertRow[TC.BRAND] = DV.BRAND;
  insertRow[TC.PIC] = DV.PIC;
  insertRow[TC.LEADER] = DV.LEADER;
  insertRow[TC.A_ALEX] = DV.A_ALEX;
  insertRow[TC.STATUS] = status;
  insertRow[TC.PAYMENT_TYPE] = validated.paymentType;
  insertRow[TC.RENEWAL_TYPE] = validated.renewalType;
  insertRow[TC.PREV_BOKT] = '';
  insertRow[TC.NOTE] = '';
  insertRow[TC.USAGE_TIME] = validated.renewalDate == null ? '' : validated.renewalDate;

  /**
   * Sparse patch for UPDATE — keys are 0-indexed target columns.
   * Status is included only when source payment status is non-empty.
   */
  const updatePatch = {};
  updatePatch[TC.TEAM] = validated.team;
  updatePatch[TC.ID_BOKT] = validated.idBokt;
  updatePatch[TC.NCC] = nccInfo.ncc;
  updatePatch[TC.CONTENT] = validated.detail == null ? '' : validated.detail;
  updatePatch[TC.PAYMENT_INFO] = validated.paymentInfo == null ? '' : validated.paymentInfo;
  updatePatch[TC.COST] = costInfo.cost;
  updatePatch[TC.DVT] = costInfo.dvt;
  updatePatch[TC.FX_RATE] = costInfo.fxRate;
  updatePatch[TC.AMOUNT] = costInfo.amount;
  if (validated.paymentStatus) {
    updatePatch[TC.STATUS] = validated.paymentStatus;
  }
  updatePatch[TC.PAYMENT_TYPE] = validated.paymentType;
  updatePatch[TC.RENEWAL_TYPE] = validated.renewalType;
  updatePatch[TC.USAGE_TIME] = validated.renewalDate == null ? '' : validated.renewalDate;

  return {
    idBokt: validated.idBokt,
    toolName: validated.toolName,
    sourceRow: record.rowNumber,
    warnings,
    insertRow,
    updatePatch,
  };
}

/**
 * Apply an update patch onto an existing target row without touching admin columns.
 * @param {*[]} existingRow length TARGET_NUM_COLS
 * @param {Object<number, *>} updatePatch
 * @returns {*[]}
 */
function applyUpdatePatch_(existingRow, updatePatch) {
  const next = existingRow.slice();
  // Ensure row width.
  while (next.length < CONFIG.TARGET_NUM_COLS) next.push('');

  CONFIG.UPDATABLE_TARGET_COLS.forEach((colIdx) => {
    if (Object.prototype.hasOwnProperty.call(updatePatch, colIdx)) {
      next[colIdx] = updatePatch[colIdx];
    }
  });
  return next;
}
