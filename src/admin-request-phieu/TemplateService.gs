/**
 * TemplateService.gs
 * ---------------------------------------------------------------------------
 * Owns everything about locating and duplicating the monthly request-sheet
 * TEMPLATE. The actual duplication is delegated to Utils.copyTemplate()
 * (which uses the native Sheet.copyTo() API), so format, formulas, merges,
 * data validation, conditional formatting, filters, frozen rows/columns and
 * hidden rows/columns are ALL preserved automatically - nothing is ever
 * rebuilt by code, per the project requirement.
 *
 * This class only decides WHICH sheet is the correct template to copy from
 * ("tháng gần nhất" - the closest existing month sheet before the target
 * month) and exposes small helpers for checking/removing an existing sheet
 * with the target name.
 */

class TemplateService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * @param {string} sheetName
   * @returns {boolean} True if a sheet with this exact name already exists.
   */
  sheetExists(sheetName) {
    return Boolean(this.spreadsheet.getSheetByName(sheetName));
  }

  /**
   * Deletes the sheet with the given name, if it exists. Used right before
   * re-creating it, after the admin confirms the overwrite.
   * @param {string} sheetName
   */
  deleteSheetIfExists(sheetName) {
    const sheet = this.spreadsheet.getSheetByName(sheetName);
    if (sheet) this.spreadsheet.deleteSheet(sheet);
  }

  /**
   * Finds the most recent existing request sheet ("T{n}.{yyyy}") that is
   * chronologically BEFORE the given target month/year - i.e. "tháng gần
   * nhất" relative to the month being generated. This is dynamic on
   * purpose: if an admin ever skips a month, the tool still finds the
   * closest real template instead of assuming a fixed "target - 1" name.
   * @param {number} targetMonth - 1-12.
   * @param {number} targetYear
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @throws {UserFacingError} When no eligible template sheet exists.
   */
  findLatestTemplateSheet(targetMonth, targetYear) {
    const namePattern = new RegExp(`^${Config.REQUEST_SHEET_PREFIX}(\\d{1,2})\\.(\\d{4})$`, 'i');
    const targetOrdinal = targetYear * 12 + targetMonth;

    let bestSheet = null;
    let bestOrdinal = -Infinity;

    this.spreadsheet.getSheets().forEach((sheet) => {
      const match = sheet.getName().match(namePattern);
      if (!match) return;

      const month = Number(match[1]);
      const year = Number(match[2]);
      const ordinal = year * 12 + month;

      if (ordinal < targetOrdinal && ordinal > bestOrdinal) {
        bestOrdinal = ordinal;
        bestSheet = sheet;
      }
    });

    if (!bestSheet) {
      throw new UserFacingError('Không tìm thấy Template.');
    }
    return bestSheet;
  }

  /**
   * Creates the new month's sheet by copying the closest existing template
   * sheet, renaming it, and placing it right after the template.
   * @param {string} newSheetName - e.g. "T9.2026".
   * @param {number} targetMonth
   * @param {number} targetYear
   * @returns {GoogleAppsScript.Spreadsheet.Sheet} The newly created sheet.
   */
  createSheetFromTemplate(newSheetName, targetMonth, targetYear) {
    try {
      const templateSheet = this.findLatestTemplateSheet(targetMonth, targetYear);
      AppLogger.info(`TemplateService: copying template "${templateSheet.getName()}" -> "${newSheetName}".`);
      return Utils.copyTemplate(this.spreadsheet, templateSheet, newSheetName);
    } catch (error) {
      Utils.rethrow(error, 'TemplateService.createSheetFromTemplate');
    }
  }
}
