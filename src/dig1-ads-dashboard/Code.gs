/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * Điểm vào (entry point) của project: tạo custom menu, xử lý trigger onEdit,
 * và orchestrate toàn bộ pipeline DataService -> ReportService ->
 * DashboardService -> ChartService khi cần refresh Dashboard. File này CHỦ
 * ĐÍCH giữ mỏng — mọi logic thật nằm ở các module khác.
 */

/**
 * Chạy tự động khi mở Spreadsheet — thêm menu "📊 DIG1 Reports".
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu(Config.MENU_NAME)
      .addItem(Config.MENU_ITEMS.REFRESH, 'refreshDashboard')
      .addItem(Config.MENU_ITEMS.SETUP, 'setupDashboardProject')
      .addToUi();
  } catch (error) {
    console.error(`onOpen: ${error.message}`);
  }
}

/**
 * Menu "⚙️ Khởi tạo Dashboard (Setup)". Tạo các sheet còn thiếu (DATA_ADS
 * kèm dữ liệu mẫu, CONFIG, DASHBOARD), gắn Dropdown chọn tháng, rồi render
 * Dashboard lần đầu. An toàn để chạy nhiều lần (không xóa dữ liệu đã có).
 */
function setupDashboardProject() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dataService = new DataService();
    dataService.ensureSheetsReady();
    refreshDashboard();
    ui.alert(
      'Setup hoàn tất',
      'Đã kiểm tra/tạo các sheet DATA_ADS, CONFIG, DASHBOARD, gắn Dropdown chọn tháng và cập nhật Dashboard.\n\n' +
        'Nếu DATA_ADS vừa được tạo mới, sheet đó đang chứa DỮ LIỆU MẪU (demo) — hãy thay bằng dữ liệu thật.',
      ui.ButtonSet.OK
    );
  } catch (error) {
    console.error(`setupDashboardProject: ${error.message}`);
    ui.alert('Lỗi Setup', error.message, ui.ButtonSet.OK);
  }
}

/**
 * Tính toán lại toàn bộ report cho tháng đang được chọn trong CONFIG, rồi
 * render lại Dashboard (cards, bảng, top performer) và vẽ lại 4 chart.
 * Được gọi từ menu "🔄 Cập nhật Dashboard" hoặc tự động từ onEdit() khi
 * SelectedMonth thay đổi.
 */
function refreshDashboard() {
  try {
    const dataService = new DataService();
    const yearMonth = dataService.getSelectedMonth();
    const records = dataService.getDataByMonth(yearMonth);

    const summary = ReportService.calculateSummary(records);
    const brandReport = ReportService.calculateBrandReport(records);
    const memberReport = ReportService.calculateMemberReport(records);
    const dailyReport = ReportService.calculateDailyReport(records);
    const { topMembers, topBrands } = ReportService.getTopPerformers(memberReport, brandReport);

    Logger.log(
      `refreshDashboard: Tháng=${yearMonth} | Records=${records.length} | ` +
        `Cost=${Utils.formatCurrency(summary.totalCost)} | Revenue=${Utils.formatCurrency(summary.totalRevenue)} | ` +
        `Profit=${Utils.formatCurrency(summary.profit)} | ROI=${Utils.formatPercent(summary.roi)} | ` +
        `ROAS=${Utils.formatNumber(summary.roas, 2)}x | FTD=${Utils.formatNumber(summary.totalFtd)}`
    );

    const dashboardSheet = dataService.getDashboardSheet();
    const dashboardService = new DashboardService(dashboardSheet);
    const chartStartRow = dashboardService.renderAll(yearMonth, summary, brandReport, memberReport, topMembers, topBrands);

    const chartService = new ChartService(dashboardSheet);
    chartService.createAllCharts(dailyReport, brandReport, memberReport, chartStartRow);

    Logger.log('refreshDashboard: hoàn tất.');
  } catch (error) {
    console.error(`refreshDashboard: ${error.message}`);
    try {
      SpreadsheetApp.getUi().alert('Lỗi cập nhật Dashboard', error.message, SpreadsheetApp.getUi().ButtonSet.OK);
    } catch (uiError) {
      // Không có UI khả dụng (ví dụ chạy từ trigger nền) — chỉ log lỗi.
      console.error(`refreshDashboard (không hiện được UI alert): ${uiError.message}`);
    }
  }
}

/**
 * Simple Trigger onEdit: khi người dùng đổi giá trị ô "SelectedMonth" trên
 * sheet CONFIG, tự động refresh toàn bộ Dashboard — không cần chạy thủ công.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const editedSheet = e.range.getSheet();
    if (editedSheet.getName() !== Config.SHEET_NAMES.CONFIG) return;

    const dataService = new DataService();
    const selectedMonthCell = dataService.getConfigValueCell(Config.CONFIG_KEYS.SELECTED_MONTH);
    if (!selectedMonthCell) return;

    const isSelectedMonthEdited = Utils.isCellWithinRange(
      selectedMonthCell.getRow(),
      selectedMonthCell.getColumn(),
      e.range
    );

    if (isSelectedMonthEdited) {
      Logger.log(`onEdit: SelectedMonth thay đổi thành "${e.value || e.range.getValue()}" -> refreshDashboard().`);
      refreshDashboard();
    }
  } catch (error) {
    console.error(`onEdit: ${error.message}`);
  }
}
