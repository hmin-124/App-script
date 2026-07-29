/**
 * SheetGenerator.gs
 * ---------------------------------------------------------------------------
 * Populates an ALREADY-CREATED (copied-from-template) monthly request sheet
 * with new rows. The writable data area is discovered dynamically - the
 * data END is always "the row directly above TOTAL", and the data START
 * comes from the TOTAL row's own SUM formula (e.g. "=sum(H3:H11)" -> data
 * starts at row 3) - so there is no hardcoded row number anywhere, and the
 * range always matches exactly what the template author defined for that
 * specific month. See Utils.findDataRangeFromTotalFormula() for why the
 * data END is no longer taken from the formula's own end-of-range reference.
 *
 * When more rows are required than are currently available, new rows are
 * inserted directly above the TOTAL row via Sheet.insertRowsBefore(), and
 * every formula in the TOTAL row that references a range is EXPLICITLY
 * rewritten (_growTotalFormulas()) to cover the grown range - Google Sheets
 * does NOT reliably auto-expand a SUM formula's range when MULTIPLE rows
 * are inserted in a single insertRowsBefore(row, n) call (confirmed by a
 * real bug: a formula stayed exactly "=sum(H3:H12)" after 8 more rows were
 * inserted above it for 8 extra tools, silently excluding them from the
 * sheet's own TOTAL cell), so this class can no longer assume that behaviour.
 */

class SheetGenerator {
  /** @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The freshly copied month sheet. */
  constructor(sheet) {
    this.sheet = sheet;

    const requiredHeaders = Object.values(Config.REQUEST_HEADERS);
    this.headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    this.headerMap = Utils.getHeaderMap(sheet, this.headerRowIndex);

    Utils.assertHeadersExist(this.headerMap, requiredHeaders, sheet.getName());
  }

  /**
   * @returns {Object<string, number>} The request sheet's header map.
   */
  getHeaderMap() {
    return this.headerMap;
  }

  /**
   * Locates the TOTAL row and reads its data-range from the SUM formula.
   * Delegates to Utils - the exact same logic MessageService uses to READ
   * this sheet later, so both classes always agree on which rows are data.
   * @returns {number} 1-based row index.
   * @private
   */
  _findTotalRowIndex() {
    return Utils.findTotalRowIndex(this.sheet, this.headerMap, this.headerRowIndex);
  }

  /**
   * @param {number} totalRowIndex
   * @returns {{startRow: number, endRow: number}}
   * @private
   */
  _findDataRange(totalRowIndex) {
    return Utils.findDataRangeFromTotalFormula(this.sheet, this.headerMap, totalRowIndex);
  }

  /**
   * Grows the data range - by inserting blank rows directly above the TOTAL
   * row - when there are more approved tools than currently-available rows.
   * The newly inserted rows inherit the formatting of the row above them
   * (native Apps Script behaviour). The TOTAL row's own formula(s) are then
   * EXPLICITLY rewritten via _growTotalFormulas() - see this file's header
   * comment for why native auto-expansion can no longer be trusted here.
   * @param {number} totalRowIndex
   * @param {{startRow:number, endRow:number}} dataRange
   * @param {number} requiredRowCount
   * @returns {{startRow:number, endRow:number}} The (possibly grown) data range.
   * @private
   */
  _ensureCapacity(totalRowIndex, dataRange, requiredRowCount) {
    const availableRowCount = dataRange.endRow - dataRange.startRow + 1;
    const missingRowCount = requiredRowCount - availableRowCount;
    if (missingRowCount <= 0) return dataRange;

    this.sheet.insertRowsBefore(totalRowIndex, missingRowCount);
    const newTotalRowIndex = totalRowIndex + missingRowCount;
    const newDataRange = { startRow: dataRange.startRow, endRow: dataRange.endRow + missingRowCount };

    this._growTotalFormulas(newTotalRowIndex, newDataRange.endRow);

    AppLogger.info(
      `SheetGenerator: inserted ${missingRowCount} row(s) before the TOTAL row to fit ${requiredRowCount} tool(s), ` +
        `and grew the TOTAL row's formula(s) to match.`
    );
    return newDataRange;
  }

  /**
   * Rewrites every formula in the TOTAL row that references a `START:END`
   * range (e.g. "=sum(H3:H12)" -> "=sum(H3:H20)"), extending ONLY the end
   * of the range to `newEndRow` while keeping the start row and everything
   * else about the formula untouched. Cells in the TOTAL row that do NOT
   * contain such a formula (the "TOTAL" label itself, blank cells, ...) are
   * never written to - `getFormula()` returns '' for those, which is
   * filtered out before any write happens.
   * @param {number} totalRowIndex - The TOTAL row's index AFTER insertion.
   * @param {number} newEndRow - The new last data row (totalRowIndex - 1).
   * @private
   */
  _growTotalFormulas(totalRowIndex, newEndRow) {
    const lastColumn = this.sheet.getLastColumn();
    const rowRange = this.sheet.getRange(totalRowIndex, 1, 1, lastColumn);
    const formulas = rowRange.getFormulas()[0];

    formulas.forEach((formula, offset) => {
      if (!formula) return; // Not a formula cell (label/blank) - leave untouched.

      const match = formula.match(/([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/);
      if (!match) return; // Formula doesn't reference a START:END range - leave untouched.

      const [, startCol, startRowText, endCol] = match;
      const rewritten = formula.replace(
        /([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/,
        `${startCol}${startRowText}:${endCol}${newEndRow}`
      );
      this.sheet.getRange(totalRowIndex, offset + 1).setFormula(rewritten);
    });
  }

  /**
   * Writes the mapped request rows into the sheet:
   *   1. Clears the previous month's leftover data (content only).
   *   2. Grows the data range if needed.
   *   3. Places each COLUMN_MAPPING value into its header column (so newly
   *      appended message columns at the far right still receive the right
   *      data), then writes the full grid in ONE setValues() call.
   * The TOTAL row and its formulas are never touched directly.
   * @param {Array<Array<*>>} rowValues - One row per approved tool, ordered
   *   exactly like Config.COLUMN_MAPPING.
   * @returns {number} Number of rows written.
   */
  writeRequestRows(rowValues) {
    try {
      const totalRowIndex = this._findTotalRowIndex();
      let dataRange = this._findDataRange(totalRowIndex);
      const columnCount = this.sheet.getLastColumn();

      dataRange = this._ensureCapacity(totalRowIndex, dataRange, rowValues.length);

      // Wipe ALL of last month's data first - formatting/validation stays,
      // only the cell content is cleared.
      Utils.clearOldData(this.sheet, dataRange.startRow, dataRange.endRow, columnCount);

      if (rowValues.length > 0) {
        const mapping = Config.COLUMN_MAPPING;
        const columnIndexes = mapping.map((rule) => Utils.findColumn(this.headerMap, rule.target) - 1);
        const grid = rowValues.map((mappedRow) => {
          const line = new Array(columnCount).fill('');
          mappedRow.forEach((value, mapIndex) => {
            const colIndex = columnIndexes[mapIndex];
            if (colIndex >= 0 && colIndex < columnCount) line[colIndex] = value;
          });
          return line;
        });
        this.sheet.getRange(dataRange.startRow, 1, grid.length, columnCount).setValues(grid);
      }

      AppLogger.info(`SheetGenerator: wrote ${rowValues.length} row(s) into sheet "${this.sheet.getName()}".`);
      return rowValues.length;
    } catch (error) {
      Utils.rethrow(error, 'SheetGenerator.writeRequestRows');
    }
  }
}
