/**
 * DashboardService.gs
 * ---------------------------------------------------------------------------
 * Render toàn bộ Dashboard (trừ chart) lên sheet DASHBOARD: Title, KPI Cards,
 * bảng Brand/Member, Top Performer. KHÔNG tính toán số liệu ở đây — chỉ nhận
 * report đã tính sẵn từ ReportService rồi hiển thị (Merge Cell, Conditional
 * Formatting, Border, Number/Currency Format).
 *
 * Mỗi hàm render trả về SỐ DÒNG KẾ TIẾP còn trống, để hàm gọi sau (bảng khác,
 * ChartService...) biết bắt đầu từ đâu — nhờ vậy layout tự thích ứng với số
 * dòng Brand/Member thay đổi, không hardcode số dòng cố định.
 */

class DashboardService {
  /**
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet DASHBOARD.
   */
  constructor(sheet) {
    if (!sheet) throw new Error('DashboardService: tham số "sheet" là bắt buộc.');
    this.sheet = sheet;
  }

  /**
   * Xóa toàn bộ nội dung, định dạng, conditional formatting cũ trên Dashboard
   * (chart được ChartService xóa riêng) để chuẩn bị render lại từ đầu.
   */
  clear() {
    try {
      this.sheet.clear();
      this.sheet.clearConditionalFormatRules();
      const totalWidth = this._getCardsTotalWidth();
      this.sheet.setColumnWidth(1, 24);
      this.sheet.setColumnWidths(2, totalWidth, 110);
    } catch (error) {
      throw new Error(`DashboardService.clear: ${error.message}`);
    }
  }

  /**
   * Render tiêu đề Dashboard + dòng phụ đề (tháng báo cáo, thời gian cập nhật).
   * @param {string} yearMonth - Tháng đang chọn, định dạng "YYYY-MM".
   * @param {number} startRow
   * @returns {number} Dòng kế tiếp còn trống.
   */
  renderHeader(yearMonth, startRow) {
    try {
      const layout = Config.LAYOUT;
      const colors = Config.COLORS;
      const totalWidth = this._getCardsTotalWidth();

      const titleRow = startRow;
      this.sheet
        .getRange(titleRow, layout.START_COL, 1, totalWidth)
        .merge()
        .setValue('📊 DIG1 ADS PERFORMANCE DASHBOARD')
        .setBackground(colors.TITLE_BG)
        .setFontColor(colors.TITLE_FONT)
        .setFontSize(16)
        .setFontWeight('bold')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
      this.sheet.setRowHeight(titleRow, 36);

      const subtitleRow = titleRow + 1;
      const updatedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      this.sheet
        .getRange(subtitleRow, layout.START_COL, 1, totalWidth)
        .merge()
        .setValue(`Tháng báo cáo: ${Utils.formatMonthLabel(yearMonth)}   •   Cập nhật lần cuối: ${updatedAt}`)
        .setFontColor(colors.SUBTITLE_FONT)
        .setFontStyle('italic')
        .setHorizontalAlignment('center');

      return subtitleRow + 1 + layout.SECTION_GAP_ROWS;
    } catch (error) {
      throw new Error(`DashboardService.renderHeader: ${error.message}`);
    }
  }

  /**
   * Render 6 KPI Card: Total Cost, Total Revenue, Total Profit, ROI, ROAS,
   * Total FTD.
   * @param {{totalCost:number, totalRevenue:number, totalDeposit:number, totalFtd:number, profit:number, roi:number, roas:number}} summary
   * @param {number} startRow
   * @returns {number} Dòng kế tiếp còn trống.
   */
  renderSummaryCards(summary, startRow) {
    try {
      const layout = Config.LAYOUT;
      const formats = Config.NUMBER_FORMATS;

      const cards = [
        { label: '💰 TOTAL COST', value: summary.totalCost, format: formats.CURRENCY },
        { label: '📈 TOTAL REVENUE', value: summary.totalRevenue, format: formats.CURRENCY },
        { label: '💵 TOTAL PROFIT', value: summary.profit, format: formats.CURRENCY, signed: true },
        { label: '📊 ROI', value: summary.roi, format: formats.PERCENT, signed: true },
        { label: '🚀 ROAS', value: summary.roas, format: formats.RATIO },
        { label: '🎯 TOTAL FTD', value: summary.totalFtd, format: formats.INTEGER },
      ];

      const labelRow = startRow;
      const valueRow = startRow + 1;

      cards.forEach((card, index) => {
        const col = layout.START_COL + index * layout.KPI_CARD_WIDTH;
        this._writeCard(labelRow, valueRow, col, layout.KPI_CARD_WIDTH, card);
      });

      this.sheet.setRowHeight(labelRow, 26);
      this.sheet.setRowHeight(valueRow, 34);

      return valueRow + 1 + layout.SECTION_GAP_ROWS;
    } catch (error) {
      throw new Error(`DashboardService.renderSummaryCards: ${error.message}`);
    }
  }

  /**
   * Render bảng "Báo cáo theo Brand".
   * @param {Array<{label:string, cost:number, revenue:number, profit:number, roi:number, ftd:number}>} brandReport
   * @param {number} startRow
   * @returns {number} Dòng kế tiếp còn trống.
   */
  renderBrandTable(brandReport, startRow) {
    try {
      return this._renderGroupTable('📈 BÁO CÁO THEO BRAND', 'Brand', brandReport, startRow);
    } catch (error) {
      throw new Error(`DashboardService.renderBrandTable: ${error.message}`);
    }
  }

  /**
   * Render bảng "Báo cáo theo Member".
   * @param {Array<{label:string, cost:number, revenue:number, profit:number, roi:number, ftd:number}>} memberReport
   * @param {number} startRow
   * @returns {number} Dòng kế tiếp còn trống.
   */
  renderMemberTable(memberReport, startRow) {
    try {
      return this._renderGroupTable('👤 BÁO CÁO THEO MEMBER', 'Member', memberReport, startRow);
    } catch (error) {
      throw new Error(`DashboardService.renderMemberTable: ${error.message}`);
    }
  }

  /**
   * Render khu vực Top Performer: Top N Member và Top N Brand theo Revenue
   * cao nhất, hiển thị song song 2 bảng nhỏ.
   * @param {Array<{label:string, revenue:number}>} topMembers
   * @param {Array<{label:string, revenue:number}>} topBrands
   * @param {number} startRow
   * @returns {number} Dòng kế tiếp còn trống — cũng là dòng bắt đầu cho khu vực Chart.
   */
  renderTopPerformer(topMembers, topBrands, startRow) {
    try {
      const layout = Config.LAYOUT;
      const colors = Config.COLORS;
      const totalWidth = layout.TOP_TABLE_WIDTH_COLS * 2 + layout.TOP_TABLE_GAP_COLS;

      const titleRow = startRow;
      this.sheet
        .getRange(titleRow, layout.START_COL, 1, totalWidth)
        .merge()
        .setValue(`🏆 TOP ${Config.TOP_N} PERFORMERS`)
        .setBackground(colors.TABLE_TITLE_BG)
        .setFontColor(colors.TABLE_TITLE_FONT)
        .setFontWeight('bold')
        .setFontSize(12)
        .setHorizontalAlignment('left')
        .setVerticalAlignment('middle');
      this.sheet.setRowHeight(titleRow, 28);

      const headerRow = titleRow + 1;
      const memberCol = layout.START_COL;
      const brandCol = layout.START_COL + layout.TOP_TABLE_WIDTH_COLS + layout.TOP_TABLE_GAP_COLS;

      const memberLastRow = this._renderTopTable('👤 Top Member', 'Member', topMembers, headerRow, memberCol);
      const brandLastRow = this._renderTopTable('🏢 Top Brand', 'Brand', topBrands, headerRow, brandCol);

      const nextRow = Math.max(memberLastRow, brandLastRow);
      return nextRow + 1 + layout.SECTION_GAP_ROWS;
    } catch (error) {
      throw new Error(`DashboardService.renderTopPerformer: ${error.message}`);
    }
  }

  /**
   * Tổng chiều rộng (số cột) của khu vực KPI Card — dùng làm chiều rộng
   * merge cho Title/Subtitle để căn đều với các card phía dưới.
   * @returns {number}
   * @private
   */
  _getCardsTotalWidth() {
    const layout = Config.LAYOUT;
    return layout.KPI_CARD_WIDTH * layout.KPI_CARD_COUNT;
  }

  /**
   * Ghi 1 KPI Card (label row + value row, đã merge, đã format số/màu).
   * @param {number} labelRow
   * @param {number} valueRow
   * @param {number} col
   * @param {number} width
   * @param {{label:string, value:number, format:string, signed?:boolean}} card
   * @private
   */
  _writeCard(labelRow, valueRow, col, width, card) {
    const colors = Config.COLORS;

    this.sheet
      .getRange(labelRow, col, 1, width)
      .merge()
      .setValue(card.label)
      .setBackground(colors.CARD_LABEL_BG)
      .setFontColor(colors.CARD_LABEL_FONT)
      .setFontWeight('bold')
      .setFontSize(10)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    const valueRange = this.sheet
      .getRange(valueRow, col, 1, width)
      .merge()
      .setValue(card.value)
      .setNumberFormat(card.format)
      .setBackground(colors.CARD_VALUE_BG)
      .setFontWeight('bold')
      .setFontSize(14)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBorder(true, true, true, true, false, false, colors.BORDER, SpreadsheetApp.BorderStyle.SOLID);

    valueRange.setFontColor(card.signed ? (card.value >= 0 ? colors.POSITIVE : colors.NEGATIVE) : colors.CARD_VALUE_FONT);
  }

  /**
   * Render một bảng report theo nhóm (Brand hoặc Member): title, header, dữ
   * liệu (kèm zebra-stripe + border), Number/Currency Format theo cột, và
   * Conditional Formatting thật cho cột Profit/ROI.
   * @param {string} title
   * @param {string} labelHeader - "Brand" hoặc "Member".
   * @param {Array<{label:string, cost:number, revenue:number, profit:number, roi:number, ftd:number}>} report
   * @param {number} startRow
   * @returns {number} Dòng kế tiếp còn trống.
   * @private
   */
  _renderGroupTable(title, labelHeader, report, startRow) {
    const layout = Config.LAYOUT;
    const colors = Config.COLORS;
    const formats = Config.NUMBER_FORMATS;
    const width = layout.TABLE_WIDTH_COLS;

    const titleRow = startRow;
    this.sheet
      .getRange(titleRow, layout.START_COL, 1, width)
      .merge()
      .setValue(title)
      .setBackground(colors.TABLE_TITLE_BG)
      .setFontColor(colors.TABLE_TITLE_FONT)
      .setFontWeight('bold')
      .setFontSize(12)
      .setHorizontalAlignment('left')
      .setVerticalAlignment('middle');
    this.sheet.setRowHeight(titleRow, 28);

    const headerRow = titleRow + 1;
    const headers = [labelHeader, 'Cost', 'Revenue', 'Profit', 'ROI', 'FTD'];
    this.sheet
      .getRange(headerRow, layout.START_COL, 1, width)
      .setValues([headers])
      .setBackground(colors.TABLE_HEADER_BG)
      .setFontColor(colors.TABLE_HEADER_FONT)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    if (!report || report.length === 0) {
      const emptyRow = headerRow + 1;
      this.sheet
        .getRange(emptyRow, layout.START_COL, 1, width)
        .merge()
        .setValue('Không có dữ liệu trong tháng đã chọn')
        .setFontStyle('italic')
        .setFontColor(colors.SUBTITLE_FONT)
        .setHorizontalAlignment('center');
      return emptyRow + 1 + layout.SECTION_GAP_ROWS;
    }

    const dataRows = report.map((item) => [item.label, item.cost, item.revenue, item.profit, item.roi, item.ftd]);
    const firstDataRow = headerRow + 1;
    const dataRange = this.sheet.getRange(firstDataRow, layout.START_COL, dataRows.length, width);
    dataRange.setValues(dataRows);

    this.sheet.getRange(firstDataRow, layout.START_COL + 1, dataRows.length, 1).setNumberFormat(formats.CURRENCY); // Cost
    this.sheet.getRange(firstDataRow, layout.START_COL + 2, dataRows.length, 1).setNumberFormat(formats.CURRENCY); // Revenue
    this.sheet.getRange(firstDataRow, layout.START_COL + 3, dataRows.length, 1).setNumberFormat(formats.CURRENCY); // Profit
    this.sheet.getRange(firstDataRow, layout.START_COL + 4, dataRows.length, 1).setNumberFormat(formats.PERCENT); // ROI
    this.sheet.getRange(firstDataRow, layout.START_COL + 5, dataRows.length, 1).setNumberFormat(formats.INTEGER); // FTD

    for (let i = 0; i < dataRows.length; i++) {
      if (i % 2 === 1) {
        this.sheet.getRange(firstDataRow + i, layout.START_COL, 1, width).setBackground(colors.TABLE_ROW_ALT_BG);
      }
    }
    dataRange.setBorder(true, true, true, true, true, true, colors.BORDER, SpreadsheetApp.BorderStyle.SOLID);

    // Conditional Formatting THẬT (native Sheets) cho cột Profit + ROI: xanh
    // khi dương, đỏ khi âm — áp dụng cho toàn bộ N dòng dữ liệu, tự thích ứng
    // khi số dòng brand/member thay đổi ở lần refresh sau.
    this._applyProfitConditionalFormatting(this.sheet.getRange(firstDataRow, layout.START_COL + 3, dataRows.length, 2));

    return firstDataRow + dataRows.length + layout.SECTION_GAP_ROWS;
  }

  /**
   * Render một bảng Top Performer nhỏ (#, Tên, Revenue).
   * @param {string} title - Không dùng để render (đã có title chung ở renderTopPerformer), giữ lại cho JSDoc rõ nghĩa.
   * @param {string} labelHeader - "Member" hoặc "Brand".
   * @param {Array<{label:string, revenue:number}>} items
   * @param {number} headerRow
   * @param {number} col
   * @returns {number} Dòng cuối cùng có dữ liệu (không phải dòng kế tiếp).
   * @private
   */
  _renderTopTable(title, labelHeader, items, headerRow, col) {
    const layout = Config.LAYOUT;
    const colors = Config.COLORS;
    const formats = Config.NUMBER_FORMATS;
    const width = layout.TOP_TABLE_WIDTH_COLS;

    this.sheet
      .getRange(headerRow, col, 1, width)
      .setValues([['#', labelHeader, 'Revenue']])
      .setBackground(colors.TABLE_HEADER_BG)
      .setFontColor(colors.TABLE_HEADER_FONT)
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    if (!items || items.length === 0) {
      const emptyRow = headerRow + 1;
      this.sheet
        .getRange(emptyRow, col, 1, width)
        .merge()
        .setValue('Không có dữ liệu')
        .setFontStyle('italic')
        .setFontColor(colors.SUBTITLE_FONT)
        .setHorizontalAlignment('center');
      return emptyRow;
    }

    const rows = items.map((item, index) => [index + 1, item.label, item.revenue]);
    const firstDataRow = headerRow + 1;
    const range = this.sheet.getRange(firstDataRow, col, rows.length, width);
    range.setValues(rows);

    this.sheet.getRange(firstDataRow, col, rows.length, 1).setHorizontalAlignment('center');
    this.sheet.getRange(firstDataRow, col + 2, rows.length, 1).setNumberFormat(formats.CURRENCY);
    range.setBorder(true, true, true, true, true, true, colors.BORDER, SpreadsheetApp.BorderStyle.SOLID);

    return firstDataRow + rows.length - 1;
  }

  /**
   * Gắn 2 Conditional Format Rule (native Sheets) lên một range: font xanh
   * khi giá trị >= 0, font đỏ khi < 0. Dùng cho cột Profit/ROI.
   * @param {GoogleAppsScript.Spreadsheet.Range} range
   * @private
   */
  _applyProfitConditionalFormatting(range) {
    const colors = Config.COLORS;
    const rules = this.sheet.getConditionalFormatRules();

    const positiveRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThanOrEqualTo(0)
      .setFontColor(colors.POSITIVE)
      .setRanges([range])
      .build();
    const negativeRule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setFontColor(colors.NEGATIVE)
      .setRanges([range])
      .build();

    rules.push(positiveRule, negativeRule);
    this.sheet.setConditionalFormatRules(rules);
  }

  /**
   * Orchestrator: render toàn bộ Dashboard (header, cards, bảng, top
   * performer) theo đúng thứ tự, tự tính vị trí dòng cho từng phần.
   * @param {string} yearMonth
   * @param {Object} summary - Kết quả ReportService.calculateSummary().
   * @param {Array} brandReport - Kết quả ReportService.calculateBrandReport().
   * @param {Array} memberReport - Kết quả ReportService.calculateMemberReport().
   * @param {Array} topMembers
   * @param {Array} topBrands
   * @returns {number} Dòng bắt đầu của khu vực Chart (dùng cho ChartService).
   */
  renderAll(yearMonth, summary, brandReport, memberReport, topMembers, topBrands) {
    try {
      this.clear();
      let row = Config.LAYOUT.START_ROW;
      row = this.renderHeader(yearMonth, row);
      row = this.renderSummaryCards(summary, row);
      row = this.renderBrandTable(brandReport, row);
      row = this.renderMemberTable(memberReport, row);
      row = this.renderTopPerformer(topMembers, topBrands, row);
      return row;
    } catch (error) {
      throw new Error(`DashboardService.renderAll: ${error.message}`);
    }
  }
}
