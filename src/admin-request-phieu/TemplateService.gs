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
   * Finds the most recent existing request sheet ("T{n}.{yyyy}", or a
   * common prefixed variant such as "Copy of T{n}.{yyyy}" / "Dev SEO
   * T{n}.{yyyy}") that is chronologically BEFORE the given target
   * month/year - i.e. "tháng gần nhất" relative to the month being
   * generated. This is dynamic on purpose: if an admin ever skips a month,
   * the tool still finds the closest real template instead of assuming a
   * fixed "target - 1" name.
   *
   * Fallback: if no earlier-month sheet exists, reuse a same-month sheet
   * that was renamed away from the canonical target name (e.g. "Copy of
   * T8.2026" when generating "T8.2026"). Without this, a duplicated tab
   * left the workbook with zero matchable templates and threw
   * "Không tìm thấy Template.".
   * @param {number} targetMonth - 1-12.
   * @param {number} targetYear
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @throws {UserFacingError} When no eligible template sheet exists.
   */
  findLatestTemplateSheet(targetMonth, targetYear) {
    const targetOrdinal = targetYear * 12 + targetMonth;
    const targetCanonicalName = `${Config.REQUEST_SHEET_PREFIX}${targetMonth}.${targetYear}`;

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

      // Same month/year but not the exact canonical target name - e.g.
      // "Copy of T8.2026" while we are about to create "T8.2026".
      if (ordinal === targetOrdinal && name !== targetCanonicalName) {
        sameMonthAlternateSheet = sheet;
      }
    });

    const templateSheet = bestBeforeSheet || sameMonthAlternateSheet;
    if (!templateSheet) {
      throw new UserFacingError(
        `Không tìm thấy Template (cần sheet dạng "T{n}.{yyyy}" hoặc "... T{n}.{yyyy}" trước tháng ${targetCanonicalName}).`
      );
    }
    return templateSheet;
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
