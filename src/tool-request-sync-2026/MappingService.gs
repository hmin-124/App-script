/**
 * MappingService.gs
 * ---------------------------------------------------------------------------
 * Map a validated Tool Request record → sparse column patches for sheet 2026.
 *
 * Manual columns (NCC, Tỷ giá, Thành tiền formula, Brand, PIC, approvals,
 * Status, Note, …) are NEVER included in patches so sheet formatting /
 * formulas / dropdowns stay intact.
 */

/**
 * Resolve Cost + DVT from USD/VND source prices.
 * Tỷ giá (N) and Thành tiền (O) are NOT computed here — staff enter FX
 * manually; Thành tiền uses a sheet formula.
 * @param {number|null} priceUsd
 * @param {number|null} priceVnd
 * @returns {{cost: number|null, dvt: string, warning: string}}
 */
function resolveCostAndCurrency_(priceUsd, priceVnd) {
  if (priceUsd !== null) {
    return {
      cost: priceUsd,
      dvt: 'USD',
      warning: priceVnd !== null ? 'Ưu tiên Giá USD (nguồn có cả USD và VNĐ)' : '',
    };
  }

  if (priceVnd !== null) {
    return {
      cost: priceVnd,
      dvt: 'PNT',
      warning: '',
    };
  }

  return { cost: null, dvt: '', warning: '' };
}

/**
 * Build INSERT + UPDATE sparse patches from a validated source record.
 * @param {{rowNumber: number, values: *[]}} record
 * @param {Object} validated result of validateSourceRecord_
 * @returns {{
 *   idBokt: string,
 *   toolName: string,
 *   sourceRow: number,
 *   warnings: string[],
 *   insertPatch: Object<number, *>,
 *   updatePatch: Object<number, *>
 * }}
 */
function mapSourceToTarget_(record, validated) {
  const costInfo = resolveCostAndCurrency_(validated.priceUsd, validated.priceVnd);
  const createdAt = new Date();
  const month = monthFromDate_(createdAt);

  const warnings = (validated.warnings || []).slice();
  if (costInfo.warning) warnings.push(costInfo.warning);

  const TC = CONFIG.TARGET_COLS;
  const DV = CONFIG.DEFAULT_VALUES;

  /** Shared fields written on both INSERT and UPDATE. */
  const sharedPatch = {};
  sharedPatch[TC.TEAM] = validated.team;
  sharedPatch[TC.ID_BOKT] = validated.idBokt;
  sharedPatch[TC.CONTENT] = validated.detail == null ? '' : validated.detail;
  sharedPatch[TC.PAYMENT_INFO] = validated.paymentInfo == null ? '' : validated.paymentInfo;
  sharedPatch[TC.COST] = costInfo.cost;
  sharedPatch[TC.DVT] = costInfo.dvt;
  sharedPatch[TC.PAYMENT_TYPE] = validated.paymentType;
  sharedPatch[TC.RENEWAL_TYPE] = validated.renewalType;
  sharedPatch[TC.USAGE_TIME] = validated.renewalDate == null ? '' : validated.renewalDate;

  /** INSERT adds first-create metadata only — never touches MANUAL cols. */
  const insertPatch = Object.assign({}, sharedPatch);
  insertPatch[TC.MONTH] = month;
  insertPatch[TC.CREATED_AT] = createdAt;
  insertPatch[TC.CHANNEL] = DV.CHANNEL;
  insertPatch[TC.SUB_CHANNEL] = DV.SUB_CHANNEL;

  /** UPDATE = shared only (preserves F/G/H + all manual columns). */
  const updatePatch = Object.assign({}, sharedPatch);

  assertPatchAvoidsManualCols_(insertPatch, 'insertPatch');
  assertPatchAvoidsManualCols_(updatePatch, 'updatePatch');

  return {
    idBokt: validated.idBokt,
    toolName: validated.toolName,
    sourceRow: record.rowNumber,
    warnings,
    insertPatch,
    updatePatch,
  };
}

/**
 * Dev-time guard: refuse to ship a patch that touches manual columns.
 * @param {Object<number, *>} patch
 * @param {string} label
 */
function assertPatchAvoidsManualCols_(patch, label) {
  const manual = new Set(CONFIG.MANUAL_TARGET_COLS);
  Object.keys(patch).forEach((key) => {
    const colIdx = Number(key);
    if (manual.has(colIdx)) {
      throw new Error(
        `${label} không được ghi cột manual index ${colIdx}. Kiểm tra MappingService/CONFIG.`
      );
    }
  });
}

/**
 * Filter a patch down to allowed column indexes (defense in depth).
 * @param {Object<number, *>} patch
 * @param {number[]} allowedCols
 * @returns {Object<number, *>}
 */
function filterPatchCols_(patch, allowedCols) {
  const allowed = new Set(allowedCols);
  const out = {};
  Object.keys(patch).forEach((key) => {
    const colIdx = Number(key);
    if (allowed.has(colIdx)) out[colIdx] = patch[colIdx];
  });
  return out;
}
