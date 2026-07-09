/**
 * DashboardConfig.gs
 * ---------------------------------------------------------------------------
 * Toàn bộ cấu hình của hệ thống Dashboard Report DIG1 ADS: tên sheet, tên
 * cột (đọc theo header), vị trí/kích thước layout Dashboard, màu sắc, định
 * dạng số. Các module khác (DashboardDataService, ReportService, DashboardService,
 * ChartService) KHÔNG hardcode bất kỳ giá trị nào trong số này — muốn đổi
 * tên cột, đổi màu, đổi vị trí, thêm KPI... chỉ cần sửa file này.
 */

class DashboardConfig {
  /** @returns {Object<string,string>} Tên các sheet dùng trong hệ thống. */
  static get SHEET_NAMES() {
    return {
      DATA: 'DATA_ADS',
      DASHBOARD: 'DASHBOARD',
      CONFIG: 'CONFIG',
      // Sheet ẨN, chỉ chứa dữ liệu phụ trợ để vẽ chart (xem ChartService).
      CHART_DATA: '_ChartData',
    };
  }

  /** @returns {string} Tên menu cấp 1 trên Google Sheets. */
  static get MENU_NAME() {
    return '📊 DIG1 Reports';
  }

  /** @returns {Object<string,string>} Nhãn các menu item. */
  static get MENU_ITEMS() {
    return {
      REFRESH: '🔄 Cập nhật Dashboard',
      SETUP: '⚙️ Khởi tạo Dashboard (Setup)',
    };
  }

  /** @returns {Object<string,string>} Tên 2 cột của sheet CONFIG (key-value). */
  static get CONFIG_HEADER_KEYS() {
    return { KEY: 'Key', VALUE: 'Value' };
  }

  /** @returns {Object<string,string>} Các key cấu hình dùng trong sheet CONFIG. */
  static get CONFIG_KEYS() {
    return { SELECTED_MONTH: 'SelectedMonth' };
  }

  /**
   * Tên các cột (header) cần đọc trong sheet DATA_ADS. DashboardDataService luôn đọc
   * dữ liệu theo TÊN header này, không theo chỉ số/chữ cột cố định.
   * @returns {Object<string,string>}
   */
  static get DATA_HEADER_KEYS() {
    return {
      DATE: 'Date',
      TEAM: 'Team',
      MEMBER: 'Member',
      BRAND: 'Brand',
      CAMPAIGN: 'Campaign',
      COST: 'Cost',
      REVENUE: 'Revenue',
      FTD: 'FTD',
      DEPOSIT: 'Deposit',
    };
  }

  /** @returns {number} Số dòng tối đa quét để tự dò dòng header của 1 sheet. */
  static get HEADER_ROW_SEARCH_LIMIT() {
    return 10;
  }

  /** @returns {number} Số lượng Top Performer hiển thị (Top N Member/Brand). */
  static get TOP_N() {
    return 5;
  }

  /** @returns {string} Ký hiệu tiền tệ hiển thị trong các định dạng Currency. */
  static get CURRENCY_SYMBOL() {
    return '$';
  }

  /**
   * Các pattern định dạng số áp dụng trực tiếp lên cell qua setNumberFormat(),
   * để Google Sheets tự hiển thị Currency/Percent/Number "native" (giữ giá
   * trị là số thật, sort/tính toán/vẽ chart được — không phải chuỗi text).
   * @returns {Object<string,string>}
   */
  static get NUMBER_FORMATS() {
    const symbol = DashboardConfig.CURRENCY_SYMBOL;
    return {
      CURRENCY: `"${symbol}"#,##0`,
      INTEGER: '#,##0',
      PERCENT: '0.00"%"',
      RATIO: '0.00"x"',
    };
  }

  /** @returns {Object<string,string>} Bảng màu dùng xuyên suốt Dashboard. */
  static get COLORS() {
    return {
      TITLE_BG: '#0b3d91',
      TITLE_FONT: '#ffffff',
      SUBTITLE_FONT: '#5f6368',
      CARD_LABEL_BG: '#1a73e8',
      CARD_LABEL_FONT: '#ffffff',
      CARD_VALUE_BG: '#e8f0fe',
      CARD_VALUE_FONT: '#0b3d91',
      TABLE_TITLE_BG: '#0b3d91',
      TABLE_TITLE_FONT: '#ffffff',
      TABLE_HEADER_BG: '#1a73e8',
      TABLE_HEADER_FONT: '#ffffff',
      TABLE_ROW_ALT_BG: '#f1f6fd',
      BORDER: '#c9d6e3',
      POSITIVE: '#137333',
      NEGATIVE: '#c5221f',
    };
  }

  /**
   * Layout Dashboard: vị trí bắt đầu, kích thước card/bảng, khoảng cách giữa
   * các khu vực. DashboardService/ChartService tính vị trí từng phần dựa
   * trên các hằng số này + số dòng thực tế của dữ liệu (không hardcode số
   * dòng cố định), nên thêm/bớt Brand/Member không làm vỡ layout.
   * @returns {Object<string,number>}
   */
  static get LAYOUT() {
    return {
      START_ROW: 1,
      START_COL: 2, // Cột B (cột A để làm lề trống)
      KPI_CARD_WIDTH: 2, // Mỗi KPI card rộng 2 cột (merge)
      KPI_CARD_COUNT: 6,
      TABLE_WIDTH_COLS: 6, // Brand/Member table: Label|Cost|Revenue|Profit|ROI|FTD
      TOP_TABLE_WIDTH_COLS: 3, // Top Performer: #|Tên|Revenue
      TOP_TABLE_GAP_COLS: 1, // Khoảng cách giữa bảng Top Member và Top Brand
      SECTION_GAP_ROWS: 2, // Số dòng trống giữa 2 khu vực
      CHART_WIDTH_PX: 480,
      CHART_HEIGHT_PX: 280,
      CHART_ROW_GAP: 17, // Số dòng cách nhau giữa 2 hàng chart (đủ cao cho 1 chart)
      CHART_COL_GAP: 8, // Số cột cách nhau giữa 2 chart cùng hàng
    };
  }
}
