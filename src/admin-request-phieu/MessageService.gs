/**
 * MessageService.gs
 * ---------------------------------------------------------------------------
 * Builds ready-to-paste approval messages ("Lead duyệt" / "Head duyệt") from
 * an ALREADY-GENERATED-AND-EDITED monthly request sheet (T{n}.{yyyy}). This
 * class only READS that sheet and returns plain text - it never writes
 * anything back, unlike SheetGenerator/RequestService.
 *
 * Data source resolution (see _getRequestSheet):
 *   1. If the currently ACTIVE sheet's name matches "T{n}.{yyyy}", use it -
 *      the expected flow is Admin opens/edits the request sheet, then picks
 *      the menu item while still on that tab.
 *   2. Otherwise fall back to the most recently created request sheet in
 *      the spreadsheet, so the feature still works from any tab (e.g. the
 *      Tracker or the Dashboard).
 *
 * Grouping rule for the "Lead duyệt" message (per Admin's sample message):
 * tools are grouped by their "Loại thanh toán" value - Gia hạn / Mua mới /
 * Topup Credit (Config.PAYMENT_CATEGORY) - and, for the first two, further
 * sub-grouped by "Loại gia hạn" (Mua theo tháng / Mua theo năm / ...). The
 * "Head duyệt" message is a flat list instead (Head only needs the final
 * ID phiếu / BOKT link / amount to approve payment, not the renewal-type
 * breakdown Lead needs).
 */
class MessageService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * Resolves the request sheet to read from - see class doc for the
   * resolution order.
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  _getRequestSheet() {
    const activeSheet = this.spreadsheet.getActiveSheet();
    if (activeSheet && Utils.matchRequestSheetName(activeSheet.getName())) {
      return activeSheet;
    }

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
        `Không tìm thấy sheet Request nào (dạng "Request Tool mới T{n}.{yyyy}" hoặc "T{n}.{yyyy}"). ` +
          'Vui lòng mở sheet Request cần tạo tin nhắn rồi thử lại.'
      );
    }
    return latestSheet;
  }

  /**
   * Reads every FILLED tool row (skips blank template slots past the last
   * real row) from the resolved request sheet, using the exact same
   * TOTAL-formula-derived data range SheetGenerator wrote into - so this
   * always matches what Admin actually generated/edited, never a stale or
   * guessed range.
   * @returns {{sheet: GoogleAppsScript.Spreadsheet.Sheet, tools: Array<Object>}}
   * @private
   */
  _readApprovalRows() {
    const sheet = this._getRequestSheet();
    const REQUEST = Config.REQUEST_HEADERS;
    const requiredHeaders = Object.values(REQUEST);

    const headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    const headerMap = Utils.getHeaderMap(sheet, headerRowIndex);
    Utils.assertHeadersExist(headerMap, requiredHeaders, sheet.getName());

    const totalRowIndex = Utils.findTotalRowIndex(sheet, headerMap, headerRowIndex);
    const { startRow, endRow } = Utils.findDataRangeFromTotalFormula(sheet, headerMap, totalRowIndex);
    const rowCount = endRow - startRow + 1;
    if (rowCount <= 0) {
      return { sheet, tools: [] };
    }

    const lastColumn = sheet.getLastColumn();
    const values = sheet.getRange(startRow, 1, rowCount, lastColumn).getValues();

    const nameIdx = Utils.findColumn(headerMap, REQUEST.TEN_TOOL) - 1;
    const qtyIdx = Utils.findColumn(headerMap, REQUEST.SO_LUONG) - 1;
    const paymentTypeIdx = Utils.findColumn(headerMap, REQUEST.LOAI_THANH_TOAN) - 1;
    const renewalTypeIdx = Utils.findColumn(headerMap, REQUEST.LOAI_GIA_HAN) - 1;
    const priceIdx = Utils.findColumn(headerMap, REQUEST.GIA_USD) - 1;
    const idBoktIdx = Utils.findColumn(headerMap, REQUEST.ID_BOKT) - 1;
    const reasonIdx = Utils.findColumn(headerMap, REQUEST.LY_DO) - 1;

    const tools = [];
    values.forEach((row) => {
      const tenTool = String(row[nameIdx] || '').trim();
      if (!tenTool) return; // Blank template slot - never filled this month.

      tools.push({
        tenTool,
        soLuong: row[qtyIdx] || 1,
        loaiThanhToan: String(row[paymentTypeIdx] || '').trim(),
        loaiGiaHan: String(row[renewalTypeIdx] || '').trim(),
        giaUsd: Number(row[priceIdx]) || 0,
        idPhieu: row[idBoktIdx] || '',
        lyDo: String(row[reasonIdx] || '').trim(),
      });
    });

    return { sheet, tools };
  }

  /**
   * Groups tools per Config.PAYMENT_CATEGORY_ORDER (Gia hạn -> Mua mới ->
   * Topup Credit), sub-grouping "Gia hạn"/"Mua mới" by "Loại gia hạn" so
   * each combination gets its own "📌 Loại: ..." header - mirroring Admin's
   * sample message exactly. Any "Loại thanh toán" outside those three
   * (including blank) still gets its own group instead of being dropped.
   * @param {Array<Object>} tools
   * @returns {Array<{header:string, tools:Array<Object>}>}
   * @private
   */
  _groupToolsForLeadMessage(tools) {
    const CATEGORY = Config.PAYMENT_CATEGORY;
    const orderedCategories = Config.PAYMENT_CATEGORY_ORDER;

    // Cluster by TOP-level category first (Gia hạn / Mua mới / Topup Credit
    // / other), in Config's display order - a stable sort keeps each
    // category's tools in their original sheet order, so sub-groups below
    // naturally appear in "first seen" order (e.g. "Mua theo tháng" before
    // "Mua theo năm") without hardcoding a cycle order.
    const sortedTools = [...tools].sort((toolA, toolB) => {
      const rank = (category) => {
        const index = orderedCategories.indexOf(category);
        return index === -1 ? orderedCategories.length : index;
      };
      return rank(toolA.loaiThanhToan) - rank(toolB.loaiThanhToan);
    });

    const groups = [];
    const groupIndexByHeader = new Map();
    const pushToGroup = (header, tool) => {
      if (!groupIndexByHeader.has(header)) {
        groupIndexByHeader.set(header, groups.length);
        groups.push({ header, tools: [] });
      }
      groups[groupIndexByHeader.get(header)].tools.push(tool);
    };

    sortedTools.forEach((tool) => {
      if (tool.loaiThanhToan === CATEGORY.TOPUP_CREDIT) {
        pushToGroup('📌 Loại: Mua topup credit', tool);
        return;
      }

      if (tool.loaiThanhToan === CATEGORY.GIA_HAN || tool.loaiThanhToan === CATEGORY.MUA_MOI) {
        const cycleLabel = tool.loaiGiaHan;
        const header = cycleLabel ? `📌 Loại: ${cycleLabel} - ${tool.loaiThanhToan}` : `📌 Loại: ${tool.loaiThanhToan}`;
        pushToGroup(header, tool);
        return;
      }

      // Fallback for any "Loại thanh toán" outside the 3 known ones
      // (including blank, if Admin has not picked one yet) - still shown.
      pushToGroup(`📌 Loại: ${tool.loaiThanhToan || 'Chưa phân loại'}`, tool);
    });

    return groups;
  }

  /**
   * Builds the "Lead duyệt" approval message.
   * @returns {{sheetName:string, message:string, toolCount:number, totalUsd:number}}
   */
  buildLeadApprovalMessage() {
    try {
      const { sheet, tools } = this._readApprovalRows();
      if (tools.length === 0) {
        throw new UserFacingError(`Sheet "${sheet.getName()}" chưa có dữ liệu Tool nào để tạo tin nhắn.`);
      }

      const { month, year } = Utils.parseSheetName(sheet.getName());
      const groups = this._groupToolsForLeadMessage(tools);
      const totalUsd = tools.reduce((sum, tool) => sum + tool.giaUsd, 0);

      const lines = [];
      lines.push(`Chi phí mua tool cho team ${Config.MESSAGE_TEAM_LABEL} - File Tools request - T${month}/${year}`);
      lines.push('');

      groups.forEach((group) => {
        lines.push(group.header);
        lines.push('=====');
        group.tools.forEach((tool, index) => {
          lines.push(`${index + 1}. ${tool.tenTool}`);
          lines.push(`- Số lượng: ${tool.soLuong}`);
          lines.push(`- ID phiếu: ${tool.idPhieu}`);
          const note = tool.lyDo ? ` (${tool.lyDo})` : '';
          lines.push(`- Chi phí: ${Utils.formatUsdAmount(tool.giaUsd)}${note}`);
          if (index < group.tools.length - 1) lines.push('');
        });
        lines.push('=====');
      });

      lines.push('');
      lines.push(`=> TỔNG CẦN THANH TOÁN: ${Utils.formatUsdAmount(totalUsd)}`);
      lines.push('=====');
      lines.push('');
      lines.push(Config.MESSAGE_LEAD_CLOSING);

      const message = lines.join('\n');
      AppLogger.info(
        `MessageService.buildLeadApprovalMessage: "${sheet.getName()}" - ${tools.length} tool(s), tổng ${totalUsd} USD.`
      );
      return { sheetName: sheet.getName(), message, toolCount: tools.length, totalUsd };
    } catch (error) {
      Utils.rethrow(error, 'MessageService.buildLeadApprovalMessage');
    }
  }

  /**
   * Builds the "Head duyệt" approval message - a flat, NUMBERED list of
   * every tool (no category grouping), since Head only needs the ID phiếu
   * / BOKT link / amount to approve payment. Each entry is exactly 2 lines
   * ("N. ID phiếu: ... - Tên tool - Giá" then "Link BOKT: ") with NO blank
   * line between entries - Admin fills the real BOKT link in by hand right
   * after "Link BOKT:" for each one before sending.
   * @returns {{sheetName:string, message:string, toolCount:number, totalUsd:number}}
   */
  buildHeadApprovalMessage() {
    try {
      const { sheet, tools } = this._readApprovalRows();
      if (tools.length === 0) {
        throw new UserFacingError(`Sheet "${sheet.getName()}" chưa có dữ liệu Tool nào để tạo tin nhắn.`);
      }

      const { month, year } = Utils.parseSheetName(sheet.getName());
      const totalUsd = tools.reduce((sum, tool) => sum + tool.giaUsd, 0);

      const lines = [];
      lines.push(`📌 Chi phí mua tool cho team ${Config.MESSAGE_TEAM_LABEL} - File Tools request - T${month}/${year}`);
      lines.push('');

      tools.forEach((tool, index) => {
        lines.push(`${index + 1}. ID phiếu: ${tool.idPhieu} - ${tool.tenTool} - ${Utils.formatUsdAmount(tool.giaUsd)}`);
        lines.push(`Link BOKT: ${Config.MESSAGE_BOKT_LINK_PLACEHOLDER}`);
      });

      lines.push('');
      lines.push(`=> TỔNG CẦN THANH TOÁN: ${Utils.formatUsdAmount(totalUsd)}`);
      lines.push('');
      lines.push(Config.MESSAGE_HEAD_CLOSING);

      const message = lines.join('\n');
      AppLogger.info(
        `MessageService.buildHeadApprovalMessage: "${sheet.getName()}" - ${tools.length} tool(s), tổng ${totalUsd} USD.`
      );
      return { sheetName: sheet.getName(), message, toolCount: tools.length, totalUsd };
    } catch (error) {
      Utils.rethrow(error, 'MessageService.buildHeadApprovalMessage');
    }
  }
}
