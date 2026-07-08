/**
 * Utils.js
 * Shared helpers enforcing the performance & error-handling rules defined in
 * .cursor/rules/google-workspace-solutions-architect.mdc:
 *   - Batch operations only (never per-row getValue/setValue).
 *   - Structured error handling with clear logging.
 *   - Safe REST calls with retry/backoff.
 */

/**
 * Reads an entire sheet's data in a single call and returns it as an array
 * of objects keyed by the header row. Avoids any row-by-row getValue() calls.
 *
 * @param {string} sheetName - Name of the sheet/tab to read.
 * @param {SpreadsheetApp.Spreadsheet} [ss] - Optional spreadsheet, defaults to the active one.
 * @returns {Array<Object>} Rows as objects, e.g. [{ Name: 'A', Email: 'a@x.com' }, ...].
 */
function readSheetAsObjects(sheetName, ss = SpreadsheetApp.getActiveSpreadsheet()) {
  if (!sheetName) throw new Error('readSheetAsObjects: "sheetName" is required.');

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error(`readSheetAsObjects: Sheet "${sheetName}" not found.`);

  const range = sheet.getDataRange();
  const values = range.getValues(); // single batch read
  if (values.length < 2) return []; // header only or empty sheet

  const [headers, ...rows] = values;
  return rows.map((row) =>
    headers.reduce((obj, header, colIndex) => {
      obj[header] = row[colIndex];
      return obj;
    }, {})
  );
}

/**
 * Writes an array of objects back to a sheet in a single batch call.
 * The sheet is fully rewritten (headers + rows) starting at A1.
 *
 * @param {string} sheetName - Target sheet/tab name.
 * @param {Array<Object>} rows - Data rows; keys of the first object become headers.
 * @param {SpreadsheetApp.Spreadsheet} [ss] - Optional spreadsheet, defaults to the active one.
 */
function writeObjectsToSheet(sheetName, rows, ss = SpreadsheetApp.getActiveSpreadsheet()) {
  if (!sheetName) throw new Error('writeObjectsToSheet: "sheetName" is required.');
  if (!Array.isArray(rows)) throw new Error('writeObjectsToSheet: "rows" must be an array.');
  if (rows.length === 0) return; // nothing to write

  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  const headers = Object.keys(rows[0]);
  const values = rows.map((row) => headers.map((header) => row[header] ?? ''));

  sheet.clearContents();
  // Single batch write for headers + data (no loop over setValue()).
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

/**
 * Calls an external REST API via UrlFetchApp with retry + exponential backoff,
 * so transient failures (429/5xx, network blips) don't kill the whole run.
 *
 * @param {string} url - Endpoint URL.
 * @param {Object} [options] - UrlFetchApp fetch options (method, headers, payload, ...).
 * @param {number} [maxRetries=3] - Max retry attempts before giving up.
 * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse}
 */
function fetchWithRetry(url, options = {}, maxRetries = 3) {
  if (!url) throw new Error('fetchWithRetry: "url" is required.');

  const fetchOptions = { muteHttpExceptions: true, ...options };
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = UrlFetchApp.fetch(url, fetchOptions);
      const statusCode = response.getResponseCode();

      if (statusCode < 500 && statusCode !== 429) {
        return response; // success or a non-retryable client error
      }
      lastError = new Error(`HTTP ${statusCode}: ${response.getContentText()}`);
    } catch (err) {
      lastError = err;
    }

    if (attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, ...
      Utilities.sleep(backoffMs);
    }
  }

  throw new Error(`fetchWithRetry: failed after ${maxRetries + 1} attempts. Last error: ${lastError}`);
}

/**
 * Wraps a function with structured try/catch + logging, so callers (triggers,
 * menu items) get consistent error reporting instead of silent failures.
 *
 * @param {string} taskName - Human-readable name used in log messages.
 * @param {Function} fn - The function to execute.
 * @returns {*} Whatever `fn` returns, or `undefined` if it throws.
 */
function runSafely(taskName, fn) {
  try {
    console.log(`[START] ${taskName}`);
    const result = fn();
    console.log(`[SUCCESS] ${taskName}`);
    return result;
  } catch (error) {
    console.error(`[FAILED] ${taskName}: ${error.message}\n${error.stack}`);
    // Re-throw so installable triggers surface the failure in the Executions log,
    // instead of swallowing errors silently.
    throw error;
  }
}
