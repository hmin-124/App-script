/**
 * DataService.gs
 * ---------------------------------------------------------------------------
 * Sole owner of reading Task_Management_Tracker. Responsible for:
 *   - Auto-detecting the tracker's header row and resolving every column by
 *     NAME (never a hardcoded letter/index).
 *   - Skipping the tracker's section/group divider rows ("M8 TECH",
 *     "Martech", "M6 TECH", ...) while still remembering which section each
 *     real tool row belongs to (used later for "Vị trí sử dụng").
 *   - Filtering down to only the tools whose "Request Gia hạn T{n}"
 *     checkbox is TRUE for the requested month.
 *
 * Reads happen via a SINGLE batched getValues() call - there is no
 * getValue()-in-a-loop anywhere in this file.
 */

/**
 * Represents one real tool row from Task_Management_Tracker, exposed
 * through header names via get() instead of raw array indexes, plus the
 * section/group label it belongs to.
 */
class ToolRecord {
  /**
   * @param {Array<*>} rowValues - The raw row as returned by getValues().
   * @param {Object<string, number>} headerMap - Tracker header map (see Utils.getHeaderMap).
   * @param {string} section - The nearest section/group label above this row.
   */
  constructor(rowValues, headerMap, section) {
    this.rowValues = rowValues;
    this.headerMap = headerMap;
    this.section = section;
  }

  /**
   * Reads this row's value for a given tracker header name.
   * @param {string} headerName - One of Config.TRACKER_HEADERS values.
   * @returns {*} The raw cell value, or null if the header does not exist.
   */
  get(headerName) {
    if (!Utils.hasColumn(this.headerMap, headerName)) return null;
    const columnIndex = Utils.findColumn(this.headerMap, headerName);
    return this.rowValues[columnIndex - 1];
  }
}

class DataService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  _getTrackerSheet() {
    const sheet = this.spreadsheet.getSheetByName(Config.TRACKER_SHEET_NAME);
    if (!sheet) {
      throw new UserFacingError(`Không tìm thấy sheet "${Config.TRACKER_SHEET_NAME}".`);
    }
    return sheet;
  }

  /**
   * Reads every real tool row from the tracker in one batch call, skipping
   * section-divider rows and fully-blank rows, and tagging each row with
   * the section it belongs to.
   *
   * A row is treated as a section divider when its "Brand" cell has a value
   * but its "Type" cell is empty - this matches every observed divider row
   * ("M8 TECH", "Martech", "M6 TECH") while every real tool row always has
   * "Type" filled in ("Tool"/"Software").
   *
   * @returns {{records: ToolRecord[], headerMap: Object<string, number>}}
   * @private
   */
  _readAllRows() {
    const sheet = this._getTrackerSheet();
    const requiredHeaders = Object.values(Config.TRACKER_HEADERS);

    const headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    const headerMap = Utils.getHeaderMap(sheet, headerRowIndex);

    // Fail fast with one clear, combined message if the tracker is missing
    // any required column (spec: "Nếu thiếu Header -> báo lỗi rõ ràng").
    Utils.assertHeadersExist(headerMap, requiredHeaders, Config.TRACKER_SHEET_NAME);

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow <= headerRowIndex) {
      return { records: [], headerMap };
    }

    // Single batched read for the entire data area.
    const values = sheet.getRange(headerRowIndex + 1, 1, lastRow - headerRowIndex, lastColumn).getValues();

    const brandColumnIndex = Utils.findColumn(headerMap, Config.TRACKER_HEADERS.BRAND);
    const typeColumnIndex = Utils.findColumn(headerMap, Config.TRACKER_HEADERS.TYPE);

    const records = [];
    let currentSection = Config.DEFAULT_SECTION_POSITION;
    let skippedEmptyRowCount = 0;

    values.forEach((rowValues) => {
      const brand = rowValues[brandColumnIndex - 1];
      const type = rowValues[typeColumnIndex - 1];

      // A row is only treated as real tool data when its "Brand" cell is
      // non-empty. This intentionally REPLACES a naive "every cell is
      // blank" check: checkbox cells are always a boolean TRUE/FALSE, never
      // truly empty, so a row can look "non-blank" purely because it still
      // carries a checkbox value - even when every other cell (Brand, Type,
      // cost, ...) is empty. That mismatch is exactly what let far-below,
      // never-really-used rows (e.g. after a checkbox column was
      // accidentally drag-filled way past the real data) be miscounted as
      // "approved tools" with no actual data to write.
      const hasBrand = Boolean(String(brand || '').trim());
      if (!hasBrand) {
        skippedEmptyRowCount++;
        return;
      }

      const isSectionDividerRow = !type;
      if (isSectionDividerRow) {
        currentSection = String(brand).trim();
        return;
      }

      records.push(new ToolRecord(rowValues, headerMap, currentSection));
    });

    if (skippedEmptyRowCount > 0) {
      AppLogger.info(`DataService._readAllRows: bỏ qua ${skippedEmptyRowCount} dòng trống (không có "Brand").`);
    }

    return { records, headerMap };
  }

  /**
   * Returns only the tool records whose "Request Gia hạn {monthCode}"
   * checkbox is checked (TRUE) - these are the tools Admin approved for a
   * renewal payment request this cycle.
   * @param {string} monthCode - e.g. "T9".
   * @returns {ToolRecord[]}
   */
  getApprovedTools(monthCode) {
    try {
      const { records, headerMap } = this._readAllRows();
      const checkboxHeader = `${Config.REQUEST_CHECKBOX_PREFIX}${monthCode}`;

      if (!Utils.hasColumn(headerMap, checkboxHeader)) {
        throw new UserFacingError(
          `Không tìm thấy cột "${checkboxHeader}" trong sheet "${Config.TRACKER_SHEET_NAME}". ` +
            'Vui lòng thêm cột checkbox này trước khi tạo Request.'
        );
      }

      const approvedTools = records.filter((record) => record.get(checkboxHeader) === true);
      AppLogger.info(
        `DataService.getApprovedTools: "${checkboxHeader}" -> ${approvedTools.length}/${records.length} tool được tick.`
      );
      if (approvedTools.length > 0) {
        const brandColumnName = Config.TRACKER_HEADERS.BRAND;
        const approvedBrandList = approvedTools.map((tool) => tool.get(brandColumnName)).join(', ');
        AppLogger.info(`DataService.getApprovedTools: danh sách tool được tick -> ${approvedBrandList}`);
      }
      return approvedTools;
    } catch (error) {
      Utils.rethrow(error, 'DataService.getApprovedTools');
    }
  }
}
