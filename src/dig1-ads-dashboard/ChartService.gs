/**
 * ChartService.gs
 * ---------------------------------------------------------------------------
 * Tạo 4 chart của Dashboard:
 *   Chart 1 - Revenue theo ngày trong tháng (Line Chart)
 *   Chart 2 - Cost vs Revenue theo ngày (Column Chart, 2 series)
 *   Chart 3 - Revenue theo Brand (Bar Chart)
 *   Chart 4 - Revenue theo Member (Bar Chart)
 *
 * Google Sheets Embedded Chart (EmbeddedChartBuilder) chỉ vẽ được từ dữ liệu
 * NẰM TRONG CÁC Ô của sheet (addRange), không nhận trực tiếp mảng JS. Vì vậy
 * ChartService dùng một sheet ẨN riêng ("_ChartData") để ghi dữ liệu đã tổng
 * hợp (từ ReportService) trước khi build chart — sheet DASHBOARD chính vẫn
 * sạch, không lộ vùng dữ liệu phụ trợ này.
 */

class ChartService {
  /**
   * @param {GoogleAppsScript.Spreadsheet.Sheet} dashboardSheet - Sheet DASHBOARD, nơi chart sẽ hiển thị.
   */
  constructor(dashboardSheet) {
    if (!dashboardSheet) throw new Error('ChartService: tham số "dashboardSheet" là bắt buộc.');
    this.dashboardSheet = dashboardSheet;
    this.dataSheet = this._getOrCreateChartDataSheet();
  }

  /**
   * Lấy (hoặc tạo mới nếu chưa có) sheet ẩn chứa dữ liệu phụ trợ cho chart,
   * và xóa sạch nội dung cũ để chuẩn bị ghi dữ liệu mới của lần refresh này.
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  _getOrCreateChartDataSheet() {
    try {
      const spreadsheet = this.dashboardSheet.getParent();
      let sheet = spreadsheet.getSheetByName(Config.SHEET_NAMES.CHART_DATA);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(Config.SHEET_NAMES.CHART_DATA);
      }
      sheet.hideSheet();
      sheet.clearContents();
      return sheet;
    } catch (error) {
      throw new Error(`ChartService._getOrCreateChartDataSheet: ${error.message}`);
    }
  }

  /**
   * Xóa toàn bộ chart hiện có trên Dashboard trước khi vẽ lại — tránh chart
   * bị chồng/lặp mỗi lần refresh.
   */
  clearCharts() {
    try {
      this.dashboardSheet.getCharts().forEach((chart) => this.dashboardSheet.removeChart(chart));
    } catch (error) {
      throw new Error(`ChartService.clearCharts: ${error.message}`);
    }
  }

  /**
   * Chart 1: Revenue theo ngày trong tháng (Line Chart).
   * @param {Array<{dateLabel:string, cost:number, revenue:number}>} dailyReport
   * @param {number} anchorRow
   * @param {number} anchorCol
   */
  createRevenueTrendChart(dailyReport, anchorRow, anchorCol) {
    try {
      this._writeDailyData(dailyReport);
      if (!dailyReport || dailyReport.length === 0) return;

      const n = dailyReport.length;
      const dateRange = this.dataSheet.getRange(1, 1, n + 1, 1);
      const revenueRange = this.dataSheet.getRange(1, 3, n + 1, 1);

      const chart = this.dashboardSheet
        .newChart()
        .setChartType(Charts.ChartType.LINE)
        .addRange(dateRange)
        .addRange(revenueRange)
        .setPosition(anchorRow, anchorCol, 0, 0)
        .setOption('title', 'Revenue theo ngày trong tháng')
        .setOption('width', Config.LAYOUT.CHART_WIDTH_PX)
        .setOption('height', Config.LAYOUT.CHART_HEIGHT_PX)
        .setOption('legend', { position: 'none' })
        .setOption('colors', [Config.COLORS.TITLE_BG])
        .build();

      this.dashboardSheet.insertChart(chart);
    } catch (error) {
      console.error(`ChartService.createRevenueTrendChart: ${error.message}`);
    }
  }

  /**
   * Chart 2: Cost vs Revenue theo ngày (Column Chart, 2 series).
   * @param {Array<{dateLabel:string, cost:number, revenue:number}>} dailyReport
   * @param {number} anchorRow
   * @param {number} anchorCol
   */
  createCostRevenueChart(dailyReport, anchorRow, anchorCol) {
    try {
      this._writeDailyData(dailyReport);
      if (!dailyReport || dailyReport.length === 0) return;

      const n = dailyReport.length;
      const fullRange = this.dataSheet.getRange(1, 1, n + 1, 3); // Date | Cost | Revenue

      const chart = this.dashboardSheet
        .newChart()
        .setChartType(Charts.ChartType.COLUMN)
        .addRange(fullRange)
        .setPosition(anchorRow, anchorCol, 0, 0)
        .setOption('title', 'Cost vs Revenue')
        .setOption('width', Config.LAYOUT.CHART_WIDTH_PX)
        .setOption('height', Config.LAYOUT.CHART_HEIGHT_PX)
        .setOption('legend', { position: 'top' })
        .setOption('colors', [Config.COLORS.NEGATIVE, Config.COLORS.POSITIVE])
        .build();

      this.dashboardSheet.insertChart(chart);
    } catch (error) {
      console.error(`ChartService.createCostRevenueChart: ${error.message}`);
    }
  }

  /**
   * Chart 3: Revenue theo Brand (Bar Chart).
   * @param {Array<{label:string, revenue:number}>} brandReport
   * @param {number} anchorRow
   * @param {number} anchorCol
   */
  createBrandChart(brandReport, anchorRow, anchorCol) {
    try {
      const startCol = 5; // Cột E:F trong sheet _ChartData
      this._writeGroupData(brandReport, startCol);
      if (!brandReport || brandReport.length === 0) return;

      const n = brandReport.length;
      const range = this.dataSheet.getRange(1, startCol, n + 1, 2);

      const chart = this.dashboardSheet
        .newChart()
        .setChartType(Charts.ChartType.BAR)
        .addRange(range)
        .setPosition(anchorRow, anchorCol, 0, 0)
        .setOption('title', 'Revenue theo Brand')
        .setOption('width', Config.LAYOUT.CHART_WIDTH_PX)
        .setOption('height', Config.LAYOUT.CHART_HEIGHT_PX)
        .setOption('legend', { position: 'none' })
        .setOption('colors', [Config.COLORS.CARD_LABEL_BG])
        .build();

      this.dashboardSheet.insertChart(chart);
    } catch (error) {
      console.error(`ChartService.createBrandChart: ${error.message}`);
    }
  }

  /**
   * Chart 4: Revenue theo Member (Bar Chart).
   * @param {Array<{label:string, revenue:number}>} memberReport
   * @param {number} anchorRow
   * @param {number} anchorCol
   */
  createMemberChart(memberReport, anchorRow, anchorCol) {
    try {
      const startCol = 8; // Cột H:I trong sheet _ChartData
      this._writeGroupData(memberReport, startCol);
      if (!memberReport || memberReport.length === 0) return;

      const n = memberReport.length;
      const range = this.dataSheet.getRange(1, startCol, n + 1, 2);

      const chart = this.dashboardSheet
        .newChart()
        .setChartType(Charts.ChartType.BAR)
        .addRange(range)
        .setPosition(anchorRow, anchorCol, 0, 0)
        .setOption('title', 'Revenue theo Member')
        .setOption('width', Config.LAYOUT.CHART_WIDTH_PX)
        .setOption('height', Config.LAYOUT.CHART_HEIGHT_PX)
        .setOption('legend', { position: 'none' })
        .setOption('colors', [Config.COLORS.POSITIVE])
        .build();

      this.dashboardSheet.insertChart(chart);
    } catch (error) {
      console.error(`ChartService.createMemberChart: ${error.message}`);
    }
  }

  /**
   * Xóa chart cũ rồi vẽ lại toàn bộ 4 chart theo lưới 2x2, bắt đầu từ startRow.
   * @param {Array<{dateLabel:string, cost:number, revenue:number}>} dailyReport
   * @param {Array<{label:string, revenue:number}>} brandReport
   * @param {Array<{label:string, revenue:number}>} memberReport
   * @param {number} startRow
   */
  createAllCharts(dailyReport, brandReport, memberReport, startRow) {
    try {
      this.clearCharts();
      const layout = Config.LAYOUT;
      const col1 = layout.START_COL;
      const col2 = col1 + layout.CHART_COL_GAP;
      const row1 = startRow;
      const row2 = startRow + layout.CHART_ROW_GAP;

      this.createRevenueTrendChart(dailyReport, row1, col1);
      this.createCostRevenueChart(dailyReport, row1, col2);
      this.createBrandChart(brandReport, row2, col1);
      this.createMemberChart(memberReport, row2, col2);

      Logger.log('ChartService.createAllCharts: đã vẽ 4 chart.');
    } catch (error) {
      throw new Error(`ChartService.createAllCharts: ${error.message}`);
    }
  }

  /**
   * Ghi dữ liệu Date|Cost|Revenue vào cột A:C của sheet dữ liệu phụ trợ.
   * @param {Array<{dateLabel:string, cost:number, revenue:number}>} dailyReport
   * @private
   */
  _writeDailyData(dailyReport) {
    try {
      this.dataSheet.getRange(1, 1, 1, 3).setValues([['Date', 'Cost', 'Revenue']]);
      if (!dailyReport || dailyReport.length === 0) return;
      const rows = dailyReport.map((d) => [d.dateLabel, d.cost, d.revenue]);
      this.dataSheet.getRange(2, 1, rows.length, 3).setValues(rows);
    } catch (error) {
      throw new Error(`ChartService._writeDailyData: ${error.message}`);
    }
  }

  /**
   * Ghi dữ liệu Label|Revenue của brand/member report vào 1 cặp cột bắt đầu
   * từ `startCol` của sheet dữ liệu phụ trợ.
   * @param {Array<{label:string, revenue:number}>} report
   * @param {number} startCol
   * @private
   */
  _writeGroupData(report, startCol) {
    try {
      this.dataSheet.getRange(1, startCol, 1, 2).setValues([['Label', 'Revenue']]);
      if (!report || report.length === 0) return;
      const rows = report.map((item) => [item.label, item.revenue]);
      this.dataSheet.getRange(2, startCol, rows.length, 2).setValues(rows);
    } catch (error) {
      throw new Error(`ChartService._writeGroupData: ${error.message}`);
    }
  }
}
