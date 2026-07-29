/**
 * NewToolRequestService.gs
 * ---------------------------------------------------------------------------
 * Builds the "đề xuất mua Tool mới" approval message from an ALREADY
 * generated sheet named "Request Tool mới T{n}.{yyyy}" (created by
 * Generate Request Sheet from ticked rows on QUẢN LÝ TOOLS).
 *
 * Resolution order for the source sheet:
 *   1. Active sheet if its name matches a request-sheet month token.
 *   2. Otherwise the sheet for the upcoming month
 *      ("Request Tool mới T{n}.{yyyy}").
 *   3. Otherwise the chronologically latest request sheet in the file.
 *
 * Unlike the old modal form, this class never collects input in a dialog —
 * Admin edits STK / ID BOKT / Note… directly on the request sheet, then
 * runs the menu item to preview/copy the message.
 */

class NewToolRequestService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * Reads the request sheet, builds one message per filled tool row, and
   * shows a copyable dialog.
   * @returns {{sheetName:string, toolCount:number, message:string}}
   */
  createProposalMessages() {
    try {
      const { sheet, tools, month, year } = this._readNewToolRows();
      if (tools.length === 0) {
        throw new UserFacingError(
          `Sheet "${sheet.getName()}" chưa có dữ liệu Tool nào để tạo tin nhắn.`
        );
      }

      const messages = tools.map((tool) => NewToolRequestService.buildMessage(tool, month, year));
      const message = messages.join('\n\n====================\n\n');

      Utils.showMessageDialog(`Đề xuất mua Tool mới - ${sheet.getName()}`, message);
      AppLogger.info(
        `NewToolRequestService: built ${tools.length} message(s) from "${sheet.getName()}".`
      );
      return { sheetName: sheet.getName(), toolCount: tools.length, message };
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.createProposalMessages');
    }
  }

  /**
   * Pure builder used by createProposalMessages and by Node tests.
   * @param {Object} tool - Normalized tool fields from the request sheet.
   * @param {number} month - 1-12 (from sheet name).
   * @param {number} year
   * @returns {string}
   */
  static buildMessage(tool, month, year) {
    const vatPercent = Config.NEW_TOOL_REQUEST_DEFAULT_VAT_PERCENT;
    const currency = Config.NEW_TOOL_REQUEST_DEFAULT_CURRENCY;
    const price = Number(tool.price) || 0;
    const gtgtAmount = Math.round(((price * vatPercent) / 100) * 100) / 100;
    const totalAmount = Math.round((price + gtgtAmount) * 100) / 100;
    const monthLabel = `${String(month).padStart(2, '0')}/${year}`;
    const teamTag = tool.teamTag || Config.NEW_TOOL_DEFAULT_TEAM_TAG;
    const brand = tool.brandTrienKhai || Config.NEW_TOOL_REQUEST_DEFAULT_BRAND;
    const deployWindow =
      tool.thoiGianTrienKhai || NewToolRequestService._defaultDeployWindow();

    const lines = [];
    lines.push(`[${teamTag}] Đề xuất giải ngân NCC ${String(tool.tenTool || '').toUpperCase()} - Tháng ${monthLabel}`);
    if (tool.idPhieu) lines.push(`ID phiếu: ${tool.idPhieu}`);
    lines.push(`Thời gian triển khai: ${deployWindow}`);
    lines.push(`Brand triển khai: ${brand}`);
    lines.push('');
    lines.push(`Thông tin gói: ${tool.thongTinGoi || ''}`);
    lines.push(`Price: ${Utils.formatAmount(price)} ${currency}`);
    lines.push(`GTGT (${Utils.formatAmount(vatPercent)}%): ${Utils.formatAmount(gtgtAmount)} ${currency}`);
    lines.push(`TOTAL: ${Utils.formatAmount(totalAmount)} ${currency}`);
    lines.push('__________');
    lines.push('Hình thức thanh toán:');
    lines.push(`STK: ${tool.stk || ''}`);
    lines.push(`Tên người nhận: ${tool.tenNguoiNhan || ''}`);
    lines.push(`Tên ngân hàng: ${tool.tenNganHang || ''}`);

    if (tool.note) {
      lines.push('');
      lines.push(`Note: ${tool.note}`);
    }

    lines.push('');
    lines.push(Config.NEW_TOOL_REQUEST_CLOSING);

    return lines.join('\n');
  }

  /**
   * @returns {{sheet: GoogleAppsScript.Spreadsheet.Sheet, tools: Object[], month:number, year:number}}
   * @private
   */
  _readNewToolRows() {
    const sheet = this._getRequestSheet();
    const { month, year } = Utils.parseSheetName(sheet.getName());
    const REQUEST = Config.REQUEST_HEADERS;

    // Core headers must exist; message-only columns may be missing on a
    // legacy sheet that was never re-generated with ensureMessageColumns_.
    const requiredHeaders = [
      REQUEST.TEN_TOOL,
      REQUEST.CHI_TIET,
      REQUEST.GIA_USD,
    ];
    const headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    const headerMap = Utils.getHeaderMap(sheet, headerRowIndex);
    Utils.assertHeadersExist(headerMap, requiredHeaders, sheet.getName());

    const totalRowIndex = Utils.findTotalRowIndex(sheet, headerMap, headerRowIndex);
    const { startRow, endRow } = Utils.findDataRangeFromTotalFormula(sheet, headerMap, totalRowIndex);
    const rowCount = endRow - startRow + 1;
    if (rowCount <= 0) return { sheet, tools: [], month, year };

    const lastColumn = sheet.getLastColumn();
    const values = sheet.getRange(startRow, 1, rowCount, lastColumn).getValues();

    const idx = (headerName) =>
      Utils.hasColumn(headerMap, headerName) ? Utils.findColumn(headerMap, headerName) - 1 : -1;

    const nameIdx = idx(REQUEST.TEN_TOOL);
    const packageIdx = idx(REQUEST.CHI_TIET);
    const priceIdx = idx(REQUEST.GIA_USD);
    const idIdx = idx(REQUEST.ID_BOKT);
    const noteIdx = idx(REQUEST.LY_DO);
    const teamIdx = idx(REQUEST.TEAM_TAG);
    const brandIdx = idx(REQUEST.BRAND_TRIEN_KHAI);
    const deployIdx = idx(REQUEST.THOI_GIAN_TRIEN_KHAI);
    const stkIdx = idx(REQUEST.STK);
    const recipientIdx = idx(REQUEST.TEN_NGUOI_NHAN);
    const bankIdx = idx(REQUEST.TEN_NGAN_HANG);

    const cell = (row, columnIndex) => {
      if (columnIndex < 0) return '';
      const value = row[columnIndex];
      return value === null || value === undefined ? '' : value;
    };

    const tools = [];
    values.forEach((row) => {
      const tenTool = String(cell(row, nameIdx) || '').trim();
      if (!tenTool) return;

      tools.push({
        tenTool,
        thongTinGoi: String(cell(row, packageIdx) || '').trim(),
        price: Number(cell(row, priceIdx)) || 0,
        idPhieu: String(cell(row, idIdx) || '').trim(),
        note: String(cell(row, noteIdx) || '').trim(),
        teamTag: String(cell(row, teamIdx) || '').trim(),
        brandTrienKhai: String(cell(row, brandIdx) || '').trim(),
        thoiGianTrienKhai: String(cell(row, deployIdx) || '').trim(),
        stk: String(cell(row, stkIdx) || '').trim(),
        tenNguoiNhan: String(cell(row, recipientIdx) || '').trim(),
        tenNganHang: String(cell(row, bankIdx) || '').trim(),
      });
    });

    return { sheet, tools, month, year };
  }

  /**
   * Prefer the active request sheet; else the upcoming-month canonical
   * name; else the latest request sheet in the workbook.
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  _getRequestSheet() {
    const activeSheet = this.spreadsheet.getActiveSheet();
    if (activeSheet && Utils.matchRequestSheetName(activeSheet.getName())) {
      return activeSheet;
    }

    const preferredName = Utils.getNextMonthSheetName(new Date());
    const preferred = this.spreadsheet.getSheetByName(preferredName);
    if (preferred) return preferred;

    let latestSheet = null;
    let latestOrdinal = -Infinity;
    this.spreadsheet.getSheets().forEach((sheet) => {
      const parsed = Utils.matchRequestSheetName(sheet.getName());
      if (!parsed) return;
      const ordinal = parsed.year * 12 + parsed.month;
      if (ordinal > latestOrdinal) {
        latestOrdinal = ordinal;
        latestSheet = sheet;
      }
    });

    if (!latestSheet) {
      throw new UserFacingError(
        `Không tìm thấy sheet "Request Tool mới T{n}.{yyyy}". ` +
          'Hãy chạy 📄 Generate Request Sheet trước, rồi mở sheet vừa tạo và thử lại.'
      );
    }
    return latestSheet;
  }

  /** @returns {string} */
  static _defaultDeployWindow() {
    const start = new Date();
    const end = new Date(start.getFullYear(), start.getMonth() + 1, start.getDate());
    return `Từ ${Utils.formatDateDDMMYYYY(start)} - ${Utils.formatDateDDMMYYYY(end)}`;
  }
}
