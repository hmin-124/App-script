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
   * Finds the most recent existing request sheet that is chronologically
   * BEFORE the target month/year. Accepts "Request Tool mới T{n}.{yyyy}",
   * legacy "T{n}.{yyyy}", and common prefixed variants ("Copy of …",
   * "Dev SEO …") via Utils.matchRequestSheetName().
   * @param {number} targetMonth - 1-12.
   * @param {number} targetYear
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @throws {UserFacingError} When no eligible template sheet exists.
   */
  findLatestTemplateSheet(targetMonth, targetYear) {
    const targetOrdinal = targetYear * 12 + targetMonth;
    const targetName = `${Config.REQUEST_SHEET_TITLE_PREFIX}${Config.REQUEST_SHEET_PREFIX}${targetMonth}.${targetYear}`;
    const legacyTargetName = `${Config.REQUEST_SHEET_PREFIX}${targetMonth}.${targetYear}`;

    let bestBeforeSheet = null;
    let bestBeforeOrdinal = -Infinity;
    let sameMonthAlternateSheet = null;

    this.spreadsheet.getSheets().forEach((sheet) => {
      const name = sheet.getName();
      const parsed = Utils.matchRequestSheetName(name);
      if (!parsed) return;

      const ordinal = parsed.year * 12 + parsed.month;
      if (ordinal < targetOrdinal && ordinal > bestBeforeOrdinal) {
        bestBeforeOrdinal = ordinal;
        bestBeforeSheet = sheet;
        return;
      }

      if (ordinal === targetOrdinal && name !== targetName && name !== legacyTargetName) {
        sameMonthAlternateSheet = sheet;
      }
    });

    const templateSheet = bestBeforeSheet || sameMonthAlternateSheet;
    if (!templateSheet) {
      throw new UserFacingError(
        `Không tìm thấy Template (cần sheet dạng "Request Tool mới T{n}.{yyyy}" hoặc "T{n}.{yyyy}" trước tháng đích).`
      );
    }
    return templateSheet;
  }

  /**
   * Creates the new month's sheet by copying the closest existing template
   * sheet, renaming it, and placing it right after the template.
   * @param {string} newSheetName - e.g. "Request Tool mới T9.2026".
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
