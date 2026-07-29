/**
 * MappingService.gs
 * ---------------------------------------------------------------------------
 * Map a validated Tool Request record → sparse column patches for sheet 2026.
 *
 * Manual columns (Ngày tạo phiếu, NCC, Tỷ giá, Thành tiền formula, Brand,
 * PIC, approvals, Status, Note, …) are NEVER included in patches.
 *
 * G – Tên tool is parsed from Nội dung phiếu, e.g.
 *   "[Dev SEO M5] - Request gia hạn tool Cloudflare T8/2026" → "Cloudflare"
 */

/**
 * Resolve Cost + DVT from USD/VND source prices.
 * Tỷ giá / Thành tiền are NOT computed here — staff enter FX manually;
 * Thành tiền uses a sheet formula.
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
 * Extract tool display name from phiếu content / title text.
 *
 * Primary pattern (case-insensitive):
 *   ... tool <NAME> T8/2026
 *   ... tool <NAME>
 *
 * Also accepts "Tool:" / "tools" variants near "gia hạn".
 *
 * @param {*} content Nội dung phiếu (Tool Request!D)
 * @param {string=} fallbackName Tool Request!B when parse fails
 * @returns {{toolName: string, warning: string}}
 */
function extractToolNameFromContent_(content, fallbackName) {
  const text = content == null ? '' : String(content);
  if (!text.trim()) {
    const fb = normalizeText_(fallbackName);
    return {
      toolName: fb,
      warning: fb ? 'Nội dung phiếu trống — dùng Tên tool cột B làm fallback' : 'Không trích được Tên tool',
    };
  }

  // Prefer the first line / title-like segment (chi tiết often has long body).
  const firstLine = text.split(/\r?\n/)[0];

  const patterns = [
    // "... tool Cloudflare T8/2026"
    /\btools?\s*[:\-]?\s*(.+?)\s+T\d{1,2}\/\d{4}\b/i,
    // "... gia hạn tool Cloudflare" (no period code)
    /\bgia\s*hạn\s+tools?\s*[:\-]?\s*(.+?)(?:\s*[-–—]|\s*$)/i,
    // generic "... tool Cloudflare" until end / dash / period code
    /\btools?\s*[:\-]?\s*(.+?)(?:\s+T\d{1,2}\/\d{4}\b|\s*[-–—]|$)/i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = firstLine.match(patterns[i]) || text.match(patterns[i]);
    if (match && match[1]) {
      const extracted = normalizeText_(match[1].replace(/[.,;:]+$/g, ''));
      if (extracted) {
        return { toolName: extracted, warning: '' };
      }
    }
  }

  const fb = normalizeText_(fallbackName);
  return {
    toolName: fb,
    warning: fb
      ? 'Không parse được Tên tool từ Nội dung phiếu — dùng cột B làm fallback'
      : 'Không trích được Tên tool từ Nội dung phiếu',
  };
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
  const extracted = extractToolNameFromContent_(validated.detail, validated.toolName);
  const createdAt = new Date();
  const month = monthFromDate_(createdAt);

  const warnings = (validated.warnings || []).slice();
  if (costInfo.warning) warnings.push(costInfo.warning);
  if (extracted.warning) warnings.push(extracted.warning);

  const TC = CONFIG.TARGET_COLS;
  const DV = CONFIG.DEFAULT_VALUES;

  /** Shared fields written on both INSERT and UPDATE. */
  const sharedPatch = {};
  sharedPatch[TC.TEAM] = validated.team;
  sharedPatch[TC.ID_BOKT] = validated.idBokt;
  sharedPatch[TC.TOOL_NAME] = extracted.toolName;
  sharedPatch[TC.CONTENT] = validated.detail == null ? '' : validated.detail;
  sharedPatch[TC.PAYMENT_INFO] = validated.paymentInfo == null ? '' : validated.paymentInfo;
  sharedPatch[TC.COST] = costInfo.cost;
  sharedPatch[TC.DVT] = costInfo.dvt;
  sharedPatch[TC.PAYMENT_TYPE] = validated.paymentType;
  sharedPatch[TC.RENEWAL_TYPE] = validated.renewalType;
  sharedPatch[TC.USAGE_TIME] = validated.renewalDate == null ? '' : validated.renewalDate;

  /** INSERT adds defaults only — never touches MANUAL cols (incl. F Ngày tạo phiếu). */
  const insertPatch = Object.assign({}, sharedPatch);
  insertPatch[TC.MONTH] = month;
  insertPatch[TC.CHANNEL] = DV.CHANNEL;
  insertPatch[TC.SUB_CHANNEL] = DV.SUB_CHANNEL;

  /** UPDATE = shared only. */
  const updatePatch = Object.assign({}, sharedPatch);

  assertPatchAvoidsManualCols_(insertPatch, 'insertPatch');
  assertPatchAvoidsManualCols_(updatePatch, 'updatePatch');

  return {
    idBokt: validated.idBokt,
    toolName: extracted.toolName || validated.toolName,
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
