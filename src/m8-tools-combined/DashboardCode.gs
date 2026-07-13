/**
 * DashboardCode.gs
 * ---------------------------------------------------------------------------
 * Logic phía Dashboard (setup, refresh, onEdit trigger). KHÔNG chứa
 * onOpen() — khi kết hợp 2 tool trong cùng 1 project, chỉ được có DUY NHẤT
 * một hàm onOpen() toàn cục (xem Code.gs), nơi đã gộp cả 2 menu ("🛠️ M8 Tools"
 * và "📊 DIG1 Reports") vào cùng một chỗ.
 */

/**
 * Menu "⚙️ Khởi tạo Dashboard (Setup)". Tạo các sheet còn thiếu (DATA_ADS
 * kèm dữ liệu mẫu, CONFIG, DASHBOARD), gắn Dropdown chọn tháng, rồi render
 * Dashboard lần đầu. An toàn để chạy nhiều lần (không xóa dữ liệu đã có).
 */
function setupDashboardProject() {
  const ui = SpreadsheetApp.getUi();
  try {
    const dataService = new DashboardDataService();
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
    const dataService = new DashboardDataService();
    const yearMonth = dataService.getSelectedMonth();
    const availableMonths = dataService.getAvailableMonths();
    const records = dataService.getDataByMonth(yearMonth);

    const summary = ReportService.calculateSummary(records);
    const brandReport = ReportService.calculateBrandReport(records);
    const memberReport = ReportService.calculateMemberReport(records);
    const dailyReport = ReportService.calculateDailyReport(records);
    const { topMembers, topBrands } = ReportService.getTopPerformers(memberReport, brandReport);

    Logger.log(
      `refreshDashboard: Tháng=${yearMonth} | Records=${records.length} | ` +
        `Cost=${DashboardUtils.formatCurrency(summary.totalCost)} | Revenue=${DashboardUtils.formatCurrency(summary.totalRevenue)} | ` +
        `Profit=${DashboardUtils.formatCurrency(summary.profit)} | ROI=${DashboardUtils.formatPercent(summary.roi)} | ` +
        `ROAS=${DashboardUtils.formatNumber(summary.roas, 2)}x | FTD=${DashboardUtils.formatNumber(summary.totalFtd)}`
    );

    const dashboardSheet = dataService.getDashboardSheet();
    const dashboardService = new DashboardService(dashboardSheet);
    const chartStartRow = dashboardService.renderAll(
      yearMonth,
      availableMonths,
      summary,
      brandReport,
      memberReport,
      topMembers,
      topBrands
    );

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
 * Simple Trigger onEdit: tự động refresh toàn bộ Dashboard khi tháng được
 * chọn thay đổi — KHÔNG cần chạy thủ công. Nhận diện 2 nơi có thể đổi tháng:
 *   1) Ô "Value" của dòng SelectedMonth trên sheet CONFIG (cách cũ).
 *   2) Ô filter dropdown NGAY TRÊN sheet DASHBOARD (cách mới, thuận tiện
 *      hơn — không cần chuyển sheet). Khi đổi ở đây, giá trị được đồng bộ
 *      ngược lại vào CONFIG (qua DashboardDataService.setSelectedMonth) để
 *      CONFIG luôn là nơi lưu trữ chính thức của lựa chọn hiện tại.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    const editedSheet = e.range.getSheet();
    const dataService = new DashboardDataService();

    if (editedSheet.getName() === DashboardConfig.SHEET_NAMES.CONFIG) {
      const selectedMonthCell = dataService.getConfigValueCell(DashboardConfig.CONFIG_KEYS.SELECTED_MONTH);
      if (!selectedMonthCell) return;

      if (DashboardUtils.isCellWithinRange(selectedMonthCell.getRow(), selectedMonthCell.getColumn(), e.range)) {
        Logger.log(`onEdit: SelectedMonth (CONFIG) thay đổi thành "${e.value || e.range.getValue()}" -> refreshDashboard().`);
        refreshDashboard();
      }
      return;
    }

    if (editedSheet.getName() === DashboardConfig.SHEET_NAMES.DASHBOARD) {
      const filterRange = DashboardService.getMonthFilterValueRange(editedSheet);
      if (!DashboardUtils.isCellWithinRange(filterRange.getRow(), filterRange.getColumn(), e.range)) return;

      const newMonth = String(e.range.getValue() || '').trim();
      if (!DashboardUtils.isValidYearMonth(newMonth)) {
        Logger.log(`onEdit: Giá trị tháng "${newMonth}" trên Dashboard không hợp lệ (định dạng YYYY-MM), bỏ qua.`);
        return;
      }

      Logger.log(`onEdit: Đổi tháng trực tiếp trên Dashboard thành "${newMonth}" -> đồng bộ CONFIG -> refreshDashboard().`);
      dataService.setSelectedMonth(newMonth);
      refreshDashboard();
      return;
    }
  } catch (error) {
    console.error(`onEdit: ${error.message}`);
  }
}
