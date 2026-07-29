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

    // Step 3: confirm before overwriting an existing sheet.
    if (this.templateService.sheetExists(targetSheetName)) {
      const confirmed = Utils.showConfirm('Sheet đã tồn tại.', 'Bạn có muốn ghi đè không?');
      if (!confirmed) {
        AppLogger.info('RequestService: cancelled by admin (sheet already exists, overwrite declined).');
        return null;
      }
      this.templateService.deleteSheetIfExists(targetSheetName);
    }

    // Step 4: copy the closest existing template sheet.
    const newSheet = this.templateService.createSheetFromTemplate(targetSheetName, targetMonth, targetYear);

    // Step 5: map tracker rows -> request rows.
    const rowValues = approvedTools.map((tool, index) => this._buildRequestRow(tool, index + 1));

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

      case 'SOURCE':
        return tool.get(columnRule.sourceHeader) ?? '';

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

      case 'MANUAL':
        return '';

      default:
        throw new Error(`RequestService._resolveColumnValue: unknown mapping strategy "${columnRule.strategy}".`);
    }
  }
}
