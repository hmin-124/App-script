/**
 * Code.js
 * Example entry points demonstrating the project conventions:
 *   - Batch reads/writes only.
 *   - Installable time-driven trigger (safer than relying on simple onEdit
 *     for anything beyond trivial, fast, non-authenticated logic).
 *   - Simple trigger (onEdit) kept minimal, per Apps Script simple-trigger
 *     restrictions (no UrlFetchApp, no auth-required services).
 */

const CONFIG = {
  SOURCE_SHEET: 'RawData',
  OUTPUT_SHEET: 'Processed',
};

/**
 * Example time-driven job: reads RawData in one batch, transforms it,
 * and writes the result to Processed in one batch. Safe to schedule via
 * Triggers > Add Trigger > Time-driven.
 */
function syncProcessedData() {
  runSafely('syncProcessedData', () => {
    const rows = readSheetAsObjects(CONFIG.SOURCE_SHEET);
    if (rows.length === 0) {
      console.log(`No data found in "${CONFIG.SOURCE_SHEET}".`);
      return;
    }

    const processed = rows
      .filter((row) => row.Status !== 'Archived') // validate/filter input
      .map((row) => ({
        ...row,
        ProcessedAt: new Date(),
      }));

    writeObjectsToSheet(CONFIG.OUTPUT_SHEET, processed);
  });
}

/**
 * Simple trigger example. Keep this fast and side-effect-light: simple
 * triggers run without authorization and cannot call UrlFetchApp or most
 * services that require auth. Use an installable onEdit trigger instead if
 * you need those capabilities.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function onEdit(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== CONFIG.SOURCE_SHEET) return;

  // Lightweight validation only; heavier logic belongs in an installable trigger.
  const value = range.getValue();
  if (value === '') {
    sheet.getRange(range.getRow(), range.getColumn()).setNote('Empty value');
  }
}

/**
 * Example third-party REST integration using the retry-safe fetch helper.
 * @param {string} endpoint - Full URL of the external API.
 * @returns {Object} Parsed JSON response.
 */
function callExternalApi(endpoint) {
  if (!endpoint) throw new Error('callExternalApi: "endpoint" is required.');

  const response = fetchWithRetry(endpoint, {
    method: 'get',
    headers: { Authorization: `Bearer ${PropertiesService.getScriptProperties().getProperty('API_TOKEN')}` },
  });

  return JSON.parse(response.getContentText());
}
