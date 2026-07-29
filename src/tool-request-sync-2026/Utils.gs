/**
 * Utils.gs
 * ---------------------------------------------------------------------------
 * Pure helpers + small Spreadsheet accessors shared across services.
 */

/**
 * Normalize ID BOKT for Map keys: trim, stringify, strip trailing .0 from
 * numeric strings so 3513368 and "3513368.0" collide correctly.
 * @param {*} value
 * @returns {string}
 */
function normalizeId_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (!isFinite(value)) return '';
    return Number.isInteger(value) ? String(value) : String(value).trim();
  }
  let text = String(value).trim();
  if (/^\d+\.0+$/.test(text)) {
    text = text.replace(/\.0+$/, '');
  }
  return text;
}

/**
 * Trim + collapse consecutive whitespace. Does NOT change letter case.
 * @param {*} value
 * @returns {string}
 */
function normalizeText_(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/**
 * Lowercase header key for resilient header matching.
 * @param {*} value
 * @returns {string}
 */
function normalizeHeaderKey_(value) {
  return normalizeText_(value).toLowerCase();
}

/**
 * Parse a cost cell that may be number, "1,234.56", or "1.234,56".
 * @param {*} value
 * @returns {number|null} null when empty / unparsable
 */
function parseNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return isFinite(value) ? value : null;
  }
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/[^\d,.\-]/g, '');
  if (!text || text === '-' || text === '.' || text === ',') return null;

  const hasComma = text.indexOf(',') >= 0;
  const hasDot = text.indexOf('.') >= 0;
  if (hasComma && hasDot) {
    // Decide decimal separator by last occurrence.
    if (text.lastIndexOf(',') > text.lastIndexOf('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // "123,45" → decimal; "1,234" ambiguous → treat comma as thousand if 3 digits after
    const parts = text.split(',');
    if (parts.length === 2 && parts[1].length !== 3) {
      text = parts[0] + '.' + parts[1];
    } else {
      text = text.replace(/,/g, '');
    }
  }

  const num = Number(text);
  return isFinite(num) ? num : null;
}

/**
 * True when a cell is considered "empty" for required-field checks.
 * @param {*} value
 * @returns {boolean}
 */
function isBlank_(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

/**
 * Active / effective user email for logging.
 * @returns {string}
 */
function getUserEmail_() {
  try {
    const active = Session.getActiveUser().getEmail();
    if (active) return active;
  } catch (err) {
    // Fall through — simple triggers / restricted scopes may block this.
  }
  try {
    const effective = Session.getEffectiveUser().getEmail();
    if (effective) return effective;
  } catch (err2) {
    // ignore
  }
  return 'unknown';
}

/**
 * Spreadsheet bound to this script.
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Không tìm thấy Spreadsheet đang mở (script phải là container-bound).');
  }
  return ss;
}

/**
 * @param {string} name
 * @param {boolean=} required
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null}
 */
function getSheetByName_(name, required = true) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet && required) {
    throw new Error(`Không tìm thấy sheet "${name}". Kiểm tra lại CONFIG / tên tab.`);
  }
  return sheet;
}

/**
 * Last row that has any content in columns A..lastCol (1-indexed lastCol).
 * Falls back to sheet.getLastRow() when the scan finds nothing useful.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} startRow
 * @param {number} lastCol
 * @returns {number} Absolute row number; may be startRow-1 when empty.
 */
function findLastDataRow_(sheet, startRow, lastCol) {
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return startRow - 1;
  const width = Math.max(1, lastCol);
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, width).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    for (let c = 0; c < row.length; c++) {
      if (!isBlank_(row[c])) return startRow + i;
    }
  }
  return startRow - 1;
}

/**
 * Last row that has a non-blank value in a single column (1-indexed).
 * Ignores template noise in other columns (checkbox false, prefilled month, …).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} startRow
 * @param {number} column1Indexed
 * @returns {number}
 */
function findLastRowByColumn_(sheet, startRow, column1Indexed) {
  const lastRow = sheet.getLastRow();
  if (lastRow < startRow) return startRow - 1;
  const numRows = lastRow - startRow + 1;
  const values = sheet.getRange(startRow, column1Indexed, numRows, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (!isBlank_(values[i][0])) return startRow + i;
  }
  return startRow - 1;
}

/**
 * Ensure the sheet has at least `requiredLastRow` rows (insert if needed).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} requiredLastRow
 */
function ensureSheetRows_(sheet, requiredLastRow) {
  const maxRows = sheet.getMaxRows();
  if (requiredLastRow > maxRows) {
    sheet.insertRowsAfter(maxRows, requiredLastRow - maxRows);
  }
}

/**
 * Write a 2D matrix with one setValues(), clearing data validations on the
 * destination range first so dropdown / checkbox rules cannot block automation
 * (common on sheet 2026 column I – NCC, and on copied SYNC_LOG sheets).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} startRow
 * @param {number} startCol
 * @param {*[][]} matrix
 */
function writeMatrix_(sheet, startRow, startCol, matrix) {
  if (!matrix || matrix.length === 0) return;
  const numRows = matrix.length;
  const numCols = matrix[0].length;
  ensureSheetRows_(sheet, startRow + numRows - 1);
  const range = sheet.getRange(startRow, startCol, numRows, numCols);
  try {
    range.clearDataValidations();
  } catch (err) {
    // Non-fatal — still attempt the write.
    console.log(`clearDataValidations failed at R${startRow}C${startCol}: ${err}`);
  }
  range.setValues(matrix);
}

/**
 * Month number (1–12) from a Date, or null.
 * @param {Date|*} dateValue
 * @returns {number|null}
 */
function monthFromDate_(dateValue) {
  if (!(dateValue instanceof Date) || isNaN(dateValue.getTime())) return null;
  return dateValue.getMonth() + 1;
}

/**
 * Friendly error message + optional stack for logs.
 * @param {*} err
 * @returns {{message: string, stack: string}}
 */
function describeError_(err) {
  if (!err) return { message: 'Unknown error', stack: '' };
  if (typeof err === 'string') return { message: err, stack: '' };
  return {
    message: err.message || String(err),
    stack: err.stack || '',
  };
}

/**
 * Show a UI alert only when an interactive UI is available and requested.
 * @param {boolean} showUi
 * @param {string} title
 * @param {string} message
 */
function notifyUser_(showUi, title, message) {
  if (!showUi) return;
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (err) {
    // Trigger / headless execution — swallow UI errors.
    console.log(`[notifyUser_] ${title}: ${message}`);
  }
}

/**
 * Toast (non-blocking) for interactive runs.
 * @param {boolean} showUi
 * @param {string} message
 * @param {string=} title
 * @param {number=} seconds
 */
function toastUser_(showUi, message, title = 'TOOL MANAGEMENT', seconds = 5) {
  if (!showUi) return;
  try {
    getSpreadsheet_().toast(message, title, seconds);
  } catch (err) {
    console.log(`[toastUser_] ${title}: ${message}`);
  }
}
