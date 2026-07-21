/**
 * SheetGenerator.gs
 * ---------------------------------------------------------------------------
 * Populates an ALREADY-CREATED (copied-from-template) monthly request sheet
 * with new rows. The writable data area is discovered dynamically by
 * reading the existing TOTAL row's own SUM formula (e.g.
 * "=sum(H3:H11)" -> rows 3..11) - so there is no hardcoded row number
 * anywhere, and the range always matches exactly what the template author
 * defined for that specific month.
 *
 * The TOTAL row's formulas are NEVER rewritten by this class. When more
 * rows are required than are currently available, new rows are inserted
 * directly above the TOTAL row via Sheet.insertRowsBefore() - Google Sheets
 * natively extends a SUM formula's range when rows are inserted immediately
 * adjacent to its end, so the formula keeps working correctly without this
 * code ever touching its text.
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
   * Locates the TOTAL row by scanning the "Tên tool" column for the literal
   * label Config.TOTAL_ROW_LABEL.
   * @returns {number} 1-based row index.
   * @private
   */
  _findTotalRowIndex() {
    const nameColumnIndex = Utils.findColumn(this.headerMap, Config.REQUEST_HEADERS.TEN_TOOL);
    const lastRow = this.sheet.getLastRow();
    const searchHeight = Math.max(lastRow - this.headerRowIndex, 0);
    if (searchHeight === 0) {
      throw new UserFacingError(`Không tìm thấy dòng "${Config.TOTAL_ROW_LABEL}" trong sheet "${this.sheet.getName()}".`);
    }

    const nameColumnValues = this.sheet.getRange(this.headerRowIndex + 1, nameColumnIndex, searchHeight, 1).getValues();
    for (let offset = 0; offset < nameColumnValues.length; offset++) {
      const cellText = String(nameColumnValues[offset][0] || '').trim().toUpperCase();
      if (cellText === Config.TOTAL_ROW_LABEL) {
        return this.headerRowIndex + 1 + offset;
      }
    }

    throw new UserFacingError(`Không tìm thấy dòng "${Config.TOTAL_ROW_LABEL}" trong sheet "${this.sheet.getName()}".`);
  }

  /**
   * Reads the data-range boundaries directly from the TOTAL row's own SUM
   * formula in the "Giá USD" column (e.g. "=sum(H3:H11)" -> {startRow: 3,
   * endRow: 11}), so the writable area always matches the template exactly.
   * @param {number} totalRowIndex
   * @returns {{startRow: number, endRow: number}}
   * @private
   */
  _findDataRange(totalRowIndex) {
    const priceColumnIndex = Utils.findColumn(this.headerMap, Config.REQUEST_HEADERS.GIA_USD);
    const formula = this.sheet.getRange(totalRowIndex, priceColumnIndex).getFormula();
    const match = formula.match(/[A-Za-z]+(\d+):[A-Za-z]+(\d+)/);

    if (!match) {
      throw new UserFacingError(
        `Không đọc được vùng dữ liệu từ công thức của dòng "${Config.TOTAL_ROW_LABEL}" ("${formula}"). Vui lòng kiểm tra lại Template.`
      );
    }
    return { startRow: Number(match[1]), endRow: Number(match[2]) };
  }

  /**
   * Grows the data range - by inserting blank rows directly above the TOTAL
   * row - when there are more approved tools than currently-available rows.
   * The newly inserted rows inherit the formatting of the row above them
   * (native Apps Script behaviour), and the TOTAL row's SUM formula
   * automatically expands to include them.
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
    AppLogger.info(
      `SheetGenerator: inserted ${missingRowCount} row(s) before the TOTAL row to fit ${requiredRowCount} tool(s).`
    );
    return { startRow: dataRange.startRow, endRow: dataRange.endRow + missingRowCount };
  }

  /**
   * Writes the mapped request rows into the sheet:
   *   1. Clears the previous month's leftover data (content only).
   *   2. Grows the data range if needed.
   *   3. Writes every row in a SINGLE batched setValues() call.
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
        this.sheet.getRange(dataRange.startRow, 1, rowValues.length, rowValues[0].length).setValues(rowValues);
      }

      AppLogger.info(`SheetGenerator: wrote ${rowValues.length} row(s) into sheet "${this.sheet.getName()}".`);
      return rowValues.length;
    } catch (error) {
      Utils.rethrow(error, 'SheetGenerator.writeRequestRows');
    }
  }
}
