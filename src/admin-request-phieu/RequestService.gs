/**
 * RequestService.gs
 * ---------------------------------------------------------------------------
 * Orchestrates the full "Generate Request Sheet" business flow described in
 * the spec:
 *   1. Determine the target month (the month AFTER today).
 *   2. Read the tracker and collect the approved (ticked) tools; abort with
 *      a clear message if none were selected.
 *   3. If the target sheet already exists, ask for overwrite confirmation.
 *   4. Copy the closest existing template sheet (format/formulas/etc kept
 *      100% intact).
 *   5. Map every approved tool into a request-sheet row per
 *      Config.COLUMN_MAPPING (Header-Name-based, never hardcoded).
 *   6. Hand the rows to SheetGenerator to write in one batch.
 *
 * This is the ONLY class that knows the ORDER of these steps; each step's
 * actual implementation lives in its own single-responsibility class
 * (DataService, TemplateService, SheetGenerator).
 */

class RequestService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
    this.dataService = new DataService(spreadsheet);
    this.templateService = new TemplateService(spreadsheet);
  }

  /**
   * Runs the entire generate-request-sheet flow.
   * @returns {{sheetName:string, toolCount:number}|null} A summary for the
   *   final success dialog, or null if the admin cancelled an overwrite
   *   confirmation (in which case nothing was changed).
   */
  generateRequestSheet() {
    const today = new Date();
    const targetSheetName = Utils.getNextMonthSheetName(today);
    const targetMonthCode = Utils.getNextMonthCode(today);
    const { month: targetMonth, year: targetYear } = Utils.parseSheetName(targetSheetName);

    AppLogger.info(
      `RequestService: generating "${targetSheetName}" (checkbox "${Config.REQUEST_CHECKBOX_PREFIX}${targetMonthCode}").`
    );

    // Step 2 is performed FIRST (before touching any sheet) so a "no tool
    // selected" failure never leaves a half-created sheet behind.
    const approvedTools = this.dataService.getApprovedTools(targetMonthCode);
    if (approvedTools.length === 0) {
      throw new UserFacingError('Không có Tool nào được chọn để tạo Request.');
    }
    AppLogger.info(`RequestService: step 2 OK — ${approvedTools.length} tool(s) approved.`);

    // Step 3: confirm before overwriting an existing sheet (canonical name
    // or legacy "T{n}.{yyyy}" left over from older deploys).
    const legacySheetName = `${Config.REQUEST_SHEET_PREFIX}${targetMonth}.${targetYear}`;
    const existingCanonical = this.templateService.sheetExists(targetSheetName);
    const existingLegacy = targetSheetName !== legacySheetName && this.templateService.sheetExists(legacySheetName);
    if (existingCanonical || existingLegacy) {
      const existingLabel = existingCanonical ? targetSheetName : legacySheetName;
      const confirmed = Utils.showConfirm(
        'Sheet đã tồn tại.',
        `Sheet "${existingLabel}" đã có. Bạn có muốn ghi đè để tạo "${targetSheetName}" không?`
      );
      if (!confirmed) {
        AppLogger.info('RequestService: cancelled by admin (sheet already exists, overwrite declined).');
        return null;
      }
      if (existingCanonical) this.templateService.deleteSheetIfExists(targetSheetName);
      if (existingLegacy) this.templateService.deleteSheetIfExists(legacySheetName);
      AppLogger.info(`RequestService: step 3 OK — removed existing sheet(s) before recreate.`);
    }

    // Step 4: copy the closest existing template sheet.
    AppLogger.info(`RequestService: step 4 — copying template for ${targetMonth}.${targetYear}...`);
    const newSheet = this.templateService.createSheetFromTemplate(targetSheetName, targetMonth, targetYear);
    AppLogger.info(`RequestService: step 4 OK — created "${newSheet.getName()}".`);

    // Step 4b: ensure columns needed by the "đề xuất mua Tool mới" message
    // exist (older templates may only have the original 21 columns).
    this.ensureMessageColumns_(newSheet);
    AppLogger.info('RequestService: step 4b OK — message columns ensured.');

    // Step 5: map tracker rows -> request rows.
    const rowValues = approvedTools.map((tool, index) => this._buildRequestRow(tool, index + 1));
    AppLogger.info(`RequestService: step 5 OK — mapped ${rowValues.length} row(s).`);

    // Step 6: write everything in a single batched call.
    const sheetGenerator = new SheetGenerator(newSheet);
    const writtenRowCount = sheetGenerator.writeRequestRows(rowValues);

    AppLogger.info(`RequestService: done - ${writtenRowCount} tool(s) written to "${targetSheetName}".`);
    return { sheetName: targetSheetName, toolCount: writtenRowCount };
  }

  /**
   * Builds one request-sheet row (ordered exactly like Config.COLUMN_MAPPING)
   * from a single tracker ToolRecord.
   * @param {ToolRecord} tool
   * @param {number} sequenceNumber - 1-based STT value for this row.
   * @returns {Array<*>}
   * @private
   */
  _buildRequestRow(tool, sequenceNumber) {
    return Config.COLUMN_MAPPING.map((columnRule) => this._resolveColumnValue(columnRule, tool, sequenceNumber));
  }

  /**
   * Resolves a single cell's value according to its mapping strategy (see
   * Config.COLUMN_MAPPING for the full list of supported strategies).
   * @param {Object} columnRule
   * @param {ToolRecord} tool
   * @param {number} sequenceNumber
   * @returns {*}
   * @private
   */
  _resolveColumnValue(columnRule, tool, sequenceNumber) {
    switch (columnRule.strategy) {
      case 'SEQUENCE':
        return sequenceNumber;

      case 'SOURCE': {
        const sourceValue = tool.get(columnRule.sourceHeader);
        return sourceValue === null || sourceValue === undefined ? '' : sourceValue;
      }

      case 'TRANSFORM': {
        const rawValue = tool.get(columnRule.sourceHeader);
        return (columnRule.map && columnRule.map[rawValue]) || columnRule.fallback || '';
      }

      case 'SECTION': {
        const sectionKey = String(tool.section || '').toUpperCase();
        return Config.SECTION_POSITION_MAP[sectionKey] || tool.section || Config.DEFAULT_SECTION_POSITION;
      }

      case 'CONSTANT':
        return columnRule.value;

      case 'DEPLOY_WINDOW': {
        const start = new Date();
        const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
        return `Từ ${Utils.formatDateDDMMYYYY(start)} - ${Utils.formatDateDDMMYYYY(end)}`;
      }

      case 'MANUAL':
        return '';

      default:
        throw new Error(`RequestService._resolveColumnValue: unknown mapping strategy "${columnRule.strategy}".`);
    }
  }

  /**
   * Appends any missing Config.REQUEST_HEADERS to the header row (at the
   * far right) so SheetGenerator's assertHeadersExist passes when the
   * copied template is an older T{n}.{yyyy} sheet without the new-tool
   * message columns. Existing headers/data are never rewritten.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @private
   */
  ensureMessageColumns_(sheet) {
    const coreHeaders = [
      Config.REQUEST_HEADERS.STT,
      Config.REQUEST_HEADERS.TEN_TOOL,
      Config.REQUEST_HEADERS.GIA_USD,
    ];
    const headerRowIndex = Utils.detectHeaderRow(sheet, coreHeaders);
    const headerMap = Utils.getHeaderMap(sheet, headerRowIndex);
    const missing = Object.values(Config.REQUEST_HEADERS).filter((header) => !headerMap[header]);
    if (missing.length === 0) return;

    const startCol = sheet.getLastColumn() + 1;
    sheet.getRange(headerRowIndex, startCol, 1, missing.length).setValues([missing]);
    AppLogger.info(
      `RequestService.ensureMessageColumns_: added ${missing.length} header(s) on "${sheet.getName()}": ${missing.join(', ')}.`
    );
  }
}
