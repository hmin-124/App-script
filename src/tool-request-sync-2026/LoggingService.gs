/**
 * LoggingService.gs
 * ---------------------------------------------------------------------------
 * Ensures SYNC_LOG exists and writes log rows in a single batch setValues().
 * Clears data validations so a sheet copied from 2026 (NCC dropdown on col I)
 * cannot reject long error-detail strings.
 */

const LOG_HEADERS_ = [
  'Timestamp',
  'Người thực hiện',
  'Hành động',
  'Sheet nguồn',
  'Dòng nguồn',
  'ID BOKT',
  'Tên tool',
  'Kết quả',
  'Chi tiết lỗi',
  'Dòng đích',
];

/**
 * Create SYNC_LOG sheet with headers if missing; sanitize validations.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function ensureLogSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  let created = false;

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    created = true;
  }

  // Always strip validations on the log used range — SYNC_LOG is often created
  // by duplicating sheet 2026, which carries NCC dropdown rules on column I.
  sanitizeLogSheet_(sheet);

  if (created || sheet.getLastRow() === 0) {
    writeMatrix_(sheet, 1, 1, [LOG_HEADERS_]);
    sheet.setFrozenRows(1);
    try {
      sheet.getRange(1, 1, 1, LOG_HEADERS_.length).setFontWeight('bold');
    } catch (err) {
      // Non-critical formatting failure.
    }
  } else {
    // Ensure header row exists / is readable even if sheet pre-existed empty-ish.
    const header = sheet.getRange(1, 1, 1, LOG_HEADERS_.length).getValues()[0];
    const missingHeader = header.every((cell) => isBlank_(cell));
    if (missingHeader) {
      writeMatrix_(sheet, 1, 1, [LOG_HEADERS_]);
    }
  }

  return sheet;
}

/**
 * Clear data validations on SYNC_LOG columns A:J for the sheet's used grid.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function sanitizeLogSheet_(sheet) {
  try {
    const maxRows = Math.max(sheet.getMaxRows(), 1000);
    sheet.getRange(1, 1, maxRows, LOG_HEADERS_.length).clearDataValidations();
  } catch (err) {
    console.log(`sanitizeLogSheet_ failed: ${err}`);
  }
}

/**
 * Build a log entry object (not yet written).
 * @param {Object} partial
 * @returns {Object}
 */
function buildLogEntry_(partial) {
  return {
    timestamp: partial.timestamp || new Date(),
    user: partial.user || getUserEmail_(),
    action: partial.action || '',
    sourceSheet: partial.sourceSheet || CONFIG.SOURCE_SHEET_NAME,
    sourceRow: partial.sourceRow != null ? partial.sourceRow : '',
    idBokt: partial.idBokt != null ? String(partial.idBokt) : '',
    toolName: partial.toolName || '',
    result: partial.result || '',
    detail: partial.detail || '',
    targetRow: partial.targetRow != null ? partial.targetRow : '',
  };
}

/**
 * Append log entries with one setValues() call. Optionally trim old rows.
 * @param {Object[]} logs
 */
function writeSyncLogs_(logs) {
  if (!logs || logs.length === 0) return;

  const sheet = ensureLogSheet_();
  const matrix = logs.map((entry) => {
    const e = entry.timestamp ? entry : buildLogEntry_(entry);
    return [
      e.timestamp,
      e.user,
      e.action,
      e.sourceSheet,
      e.sourceRow,
      e.idBokt,
      e.toolName,
      e.result,
      e.detail,
      e.targetRow,
    ];
  });

  // Append after last Timestamp value — ignore template noise in other cols.
  const lastTsRow = findLastRowByColumn_(sheet, 1, 1);
  const startRow = Math.max(lastTsRow + 1, CONFIG.LOG_DATA_START_ROW);
  writeMatrix_(sheet, startRow, 1, matrix);

  if (CONFIG.LOG_MAX_ROWS > 0) {
    trimLogSheet_(sheet);
  }
}

/**
 * Keep only the newest CONFIG.LOG_MAX_ROWS data rows.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 */
function trimLogSheet_(sheet) {
  const lastRow = findLastRowByColumn_(sheet, CONFIG.LOG_DATA_START_ROW, 1);
  const dataRows = Math.max(0, lastRow - 1);
  if (dataRows <= CONFIG.LOG_MAX_ROWS) return;

  const removeCount = dataRows - CONFIG.LOG_MAX_ROWS;
  sheet.deleteRows(CONFIG.LOG_DATA_START_ROW, removeCount);
}

/**
 * Activate SYNC_LOG for the "Xem log đồng bộ" menu action.
 */
function viewSyncLog() {
  const sheet = ensureLogSheet_();
  sheet.activate();
  toastUser_(true, `Đã mở sheet ${CONFIG.LOG_SHEET_NAME}.`, CONFIG.MENU.NAME, 3);
}
