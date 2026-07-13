/**
 * DataService.gs
 * ---------------------------------------------------------------------------
 * Chịu trách nhiệm DUY NHẤT cho việc đọc/ghi dữ liệu thô trên Google Sheet:
 * sheet DATA_ADS (nguồn dữ liệu), sheet CONFIG (key-value), và tạo/khởi tạo
 * các sheet còn thiếu. Luôn xác định vị trí cột dựa trên TÊN HEADER (không
 * hardcode chỉ số/chữ cột) và đọc dữ liệu bằng batch getValues().
 * Không có logic tính toán KPI ở đây — xem ReportService.
 */

/**
 * Đại diện cho một dòng dữ liệu ADS đã đọc từ sheet DATA_ADS, truy cập qua
 * tên trường thay vì chỉ số cột.
 */
class AdsRecord {
  /**
   * @param {Object} fields
   * @param {Date} fields.date - Ngày (đã parse từ cột "Date").
   * @param {string} fields.team - Giá trị cột "Team".
   * @param {string} fields.member - Giá trị cột "Member".
   * @param {string} fields.brand - Giá trị cột "Brand".
   * @param {string} fields.campaign - Giá trị cột "Campaign".
   * @param {*} fields.cost - Giá trị cột "Cost".
   * @param {*} fields.revenue - Giá trị cột "Revenue".
   * @param {*} fields.ftd - Giá trị cột "FTD".
   * @param {*} fields.deposit - Giá trị cột "Deposit".
   */
  constructor({ date, team, member, brand, campaign, cost, revenue, ftd, deposit }) {
    this.date = date;
    this.yearMonth = Utils.toYearMonth(date);
    this.team = String(team || '').trim();
    this.member = String(member || '').trim();
    this.brand = String(brand || '').trim();
    this.campaign = String(campaign || '').trim();
    this.cost = Utils.parseNumber(cost);
    this.revenue = Utils.parseNumber(revenue);
    this.ftd = Utils.parseNumber(ftd);
    this.deposit = Utils.parseNumber(deposit);
  }
}

/**
 * Đọc/ghi dữ liệu cho toàn bộ hệ thống Dashboard: DATA_ADS, CONFIG, và tạo
 * các sheet còn thiếu (DASHBOARD/CONFIG/DATA_ADS) khi setup lần đầu.
 */
class DataService {
  constructor() {
    this.spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  }

  /**
   * Chuẩn hóa text header để so khớp "khoan dung" (khác biệt khoảng trắng /
   * xuống dòng / hoa-thường) giữa Config và header thật trên sheet.
   * @param {*} rawHeader
   * @returns {string}
   */
  static normalizeHeader(rawHeader) {
    return String(rawHeader || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Tự động dò dòng header thật của một sheet (đề phòng sheet có dòng
   * trống/tiêu đề phụ phía trên header thật).
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string[]} requiredHeaderNames - Danh sách tên header cần tìm.
   * @returns {number} Chỉ số dòng header (1-based).
   */
  static detectHeaderRow(sheet, requiredHeaderNames) {
    try {
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      if (lastRow < 1 || lastColumn < 1) {
        throw new Error(`Sheet "${sheet.getName()}" không có dữ liệu.`);
      }

      const searchLimit = Math.min(Config.HEADER_ROW_SEARCH_LIMIT, lastRow);
      const candidateValues = sheet.getRange(1, 1, searchLimit, lastColumn).getValues();
      const requiredKeys = requiredHeaderNames.map(DataService.normalizeHeader);

      let bestRow = 1;
      let bestScore = -1;
      candidateValues.forEach((rowValues, offset) => {
        const normalizedRow = rowValues.map(DataService.normalizeHeader);
        const score = requiredKeys.filter((key) => normalizedRow.includes(key)).length;
        if (score > bestScore) {
          bestScore = score;
          bestRow = offset + 1;
        }
      });

      if (bestScore <= 0) {
        throw new Error(`Không tìm thấy dòng header phù hợp trong sheet "${sheet.getName()}".`);
      }
      return bestRow;
    } catch (error) {
      throw new Error(`DataService.detectHeaderRow: ${error.message}`);
    }
  }

  /**
   * Dựng bảng map "header đã chuẩn hóa" -> chỉ số cột (1-based) cho một sheet.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} headerRowIndex
   * @returns {Object<string, number>}
   */
  static buildHeaderMap(sheet, headerRowIndex) {
    try {
      const lastColumn = sheet.getLastColumn();
      const headerValues = sheet.getRange(headerRowIndex, 1, 1, lastColumn).getValues()[0];
      const map = {};
      headerValues.forEach((rawHeader, index) => {
        const normalized = DataService.normalizeHeader(rawHeader);
        if (normalized) map[normalized] = index + 1;
      });
      return map;
    } catch (error) {
      throw new Error(`DataService.buildHeaderMap: ${error.message}`);
    }
  }

  /** @returns {GoogleAppsScript.Spreadsheet.Sheet} */
  _getDataSheet() {
    const sheet = this.spreadsheet.getSheetByName(Config.SHEET_NAMES.DATA);
    if (!sheet) {
      throw new Error(
        `Không tìm thấy sheet "${Config.SHEET_NAMES.DATA}". Hãy chạy menu "${Config.MENU_NAME} → ${Config.MENU_ITEMS.SETUP}" trước.`
      );
    }
    return sheet;
  }

  /** @returns {GoogleAppsScript.Spreadsheet.Sheet} */
  _getConfigSheet() {
    const sheet = this.spreadsheet.getSheetByName(Config.SHEET_NAMES.CONFIG);
    if (!sheet) {
      throw new Error(
        `Không tìm thấy sheet "${Config.SHEET_NAMES.CONFIG}". Hãy chạy menu "${Config.MENU_NAME} → ${Config.MENU_ITEMS.SETUP}" trước.`
      );
    }
    return sheet;
  }

  /** @returns {GoogleAppsScript.Spreadsheet.Sheet} */
  getDashboardSheet() {
    const sheet = this.spreadsheet.getSheetByName(Config.SHEET_NAMES.DASHBOARD);
    if (!sheet) {
      throw new Error(
        `Không tìm thấy sheet "${Config.SHEET_NAMES.DASHBOARD}". Hãy chạy menu "${Config.MENU_NAME} → ${Config.MENU_ITEMS.SETUP}" trước.`
      );
    }
    return sheet;
  }

  /**
   * Đọc TOÀN BỘ dữ liệu hợp lệ từ sheet DATA_ADS (1 lần getValues() duy
   * nhất), trả về danh sách AdsRecord. Dòng có ngày không hợp lệ sẽ bị bỏ qua.
   * @returns {AdsRecord[]}
   */
  getAllData() {
    try {
      const sheet = this._getDataSheet();
      const requiredHeaders = Object.values(Config.DATA_HEADER_KEYS);
      const headerRowIndex = DataService.detectHeaderRow(sheet, requiredHeaders);
      const headerMap = DataService.buildHeaderMap(sheet, headerRowIndex);

      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      if (lastRow <= headerRowIndex) return [];

      const values = sheet.getRange(headerRowIndex + 1, 1, lastRow - headerRowIndex, lastColumn).getValues();

      const columnIndexOf = (headerKey) => {
        const idx = headerMap[DataService.normalizeHeader(headerKey)];
        if (!idx) {
          throw new Error(`Không tìm thấy cột "${headerKey}" trong sheet "${Config.SHEET_NAMES.DATA}".`);
        }
        return idx - 1;
      };

      const dateCol = columnIndexOf(Config.DATA_HEADER_KEYS.DATE);
      const teamCol = columnIndexOf(Config.DATA_HEADER_KEYS.TEAM);
      const memberCol = columnIndexOf(Config.DATA_HEADER_KEYS.MEMBER);
      const brandCol = columnIndexOf(Config.DATA_HEADER_KEYS.BRAND);
      const campaignCol = columnIndexOf(Config.DATA_HEADER_KEYS.CAMPAIGN);
      const costCol = columnIndexOf(Config.DATA_HEADER_KEYS.COST);
      const revenueCol = columnIndexOf(Config.DATA_HEADER_KEYS.REVENUE);
      const ftdCol = columnIndexOf(Config.DATA_HEADER_KEYS.FTD);
      const depositCol = columnIndexOf(Config.DATA_HEADER_KEYS.DEPOSIT);

      const records = [];
      values.forEach((row) => {
        const date = Utils.toDate(row[dateCol]);
        if (!date) return; // bỏ qua dòng trống hoặc ngày không hợp lệ

        records.push(
          new AdsRecord({
            date,
            team: row[teamCol],
            member: row[memberCol],
            brand: row[brandCol],
            campaign: row[campaignCol],
            cost: row[costCol],
            revenue: row[revenueCol],
            ftd: row[ftdCol],
            deposit: row[depositCol],
          })
        );
      });

      Logger.log(`DataService.getAllData: đọc được ${records.length} dòng hợp lệ.`);
      return records;
    } catch (error) {
      throw new Error(`DataService.getAllData: ${error.message}`);
    }
  }

  /**
   * Lấy dữ liệu của một tháng cụ thể.
   * @param {string} month - Định dạng "YYYY-MM".
   * @returns {AdsRecord[]}
   */
  getDataByMonth(month) {
    try {
      if (!Utils.isValidYearMonth(month)) {
        throw new Error(`Giá trị tháng "${month}" không hợp lệ (định dạng cần là YYYY-MM).`);
      }
      const records = this.getAllData().filter((record) => record.yearMonth === month);
      Logger.log(`DataService.getDataByMonth(${month}): ${records.length} dòng.`);
      return records;
    } catch (error) {
      throw new Error(`DataService.getDataByMonth: ${error.message}`);
    }
  }

  /**
   * Lấy danh sách các tháng có dữ liệu (sắp xếp tăng dần), dùng để dựng
   * Dropdown chọn tháng.
   * @returns {string[]}
   */
  getAvailableMonths() {
    try {
      const months = new Set(this.getAllData().map((record) => record.yearMonth));
      return Array.from(months).sort();
    } catch (error) {
      console.error(`DataService.getAvailableMonths: ${error.message}`);
      return [];
    }
  }

  /**
   * Đọc header map (Key/Value) của sheet CONFIG.
   * @returns {Object<string, number>}
   */
  _getConfigHeaderMap() {
    const sheet = this._getConfigSheet();
    const requiredHeaders = Object.values(Config.CONFIG_HEADER_KEYS);
    const headerRowIndex = DataService.detectHeaderRow(sheet, requiredHeaders);
    return { sheet, headerRowIndex, headerMap: DataService.buildHeaderMap(sheet, headerRowIndex) };
  }

  /**
   * Đọc toàn bộ cấu hình trong sheet CONFIG thành một object { Key: Value }.
   * @returns {Object<string, *>}
   */
  getConfigMap() {
    try {
      const { sheet, headerRowIndex, headerMap } = this._getConfigHeaderMap();
      const keyCol = headerMap[DataService.normalizeHeader(Config.CONFIG_HEADER_KEYS.KEY)];
      const valueCol = headerMap[DataService.normalizeHeader(Config.CONFIG_HEADER_KEYS.VALUE)];
      if (!keyCol || !valueCol) {
        throw new Error(`Sheet "${Config.SHEET_NAMES.CONFIG}" thiếu cột "Key" hoặc "Value".`);
      }

      const lastRow = sheet.getLastRow();
      if (lastRow <= headerRowIndex) return {};

      const values = sheet.getRange(headerRowIndex + 1, 1, lastRow - headerRowIndex, sheet.getLastColumn()).getValues();
      const map = {};
      values.forEach((row) => {
        const key = String(row[keyCol - 1] || '').trim();
        if (key) map[key] = row[valueCol - 1];
      });
      return map;
    } catch (error) {
      throw new Error(`DataService.getConfigMap: ${error.message}`);
    }
  }

  /**
   * Trả về Range của ô "Value" tương ứng với một key trong sheet CONFIG
   * (dùng cho onEdit để so khớp ô vừa sửa, và để gắn Dropdown validation).
   * @param {string} key
   * @returns {GoogleAppsScript.Spreadsheet.Range|null}
   */
  getConfigValueCell(key) {
    try {
      const { sheet, headerRowIndex, headerMap } = this._getConfigHeaderMap();
      const keyCol = headerMap[DataService.normalizeHeader(Config.CONFIG_HEADER_KEYS.KEY)];
      const valueCol = headerMap[DataService.normalizeHeader(Config.CONFIG_HEADER_KEYS.VALUE)];
      if (!keyCol || !valueCol) return null;

      const lastRow = sheet.getLastRow();
      if (lastRow <= headerRowIndex) return null;

      const keyValues = sheet.getRange(headerRowIndex + 1, keyCol, lastRow - headerRowIndex, 1).getValues();
      for (let i = 0; i < keyValues.length; i++) {
        if (String(keyValues[i][0] || '').trim() === key) {
          return sheet.getRange(headerRowIndex + 1 + i, valueCol);
        }
      }
      return null;
    } catch (error) {
      console.error(`DataService.getConfigValueCell: ${error.message}`);
      return null;
    }
  }

  /**
   * Lấy tháng đang được chọn trên sheet CONFIG. Nếu giá trị không hợp lệ
   * hoặc chưa cấu hình, fallback về tháng hiện tại.
   * @returns {string} "YYYY-MM"
   */
  getSelectedMonth() {
    try {
      const map = this.getConfigMap();
      const raw = String(map[Config.CONFIG_KEYS.SELECTED_MONTH] || '').trim();
      if (Utils.isValidYearMonth(raw)) return raw;
      Logger.log(`DataService.getSelectedMonth: giá trị "${raw}" không hợp lệ, dùng tháng hiện tại.`);
      return Utils.toYearMonth(new Date());
    } catch (error) {
      console.error(`DataService.getSelectedMonth: ${error.message}`);
      return Utils.toYearMonth(new Date());
    }
  }

  /**
   * Ghi tháng mới vào ô "Value" của dòng SelectedMonth trên sheet CONFIG.
   * Dùng để đồng bộ khi người dùng đổi filter trực tiếp trên Dashboard
   * (CONFIG vẫn là nơi lưu trữ chính thức của lựa chọn hiện tại).
   * @param {string} month - Định dạng "YYYY-MM".
   */
  setSelectedMonth(month) {
    try {
      if (!Utils.isValidYearMonth(month)) {
        throw new Error(`Giá trị tháng "${month}" không hợp lệ (định dạng cần là YYYY-MM).`);
      }
      const cell = this.getConfigValueCell(Config.CONFIG_KEYS.SELECTED_MONTH);
      if (!cell) {
        throw new Error(
          `Không tìm thấy dòng cấu hình "${Config.CONFIG_KEYS.SELECTED_MONTH}" trong sheet "${Config.SHEET_NAMES.CONFIG}".`
        );
      }
      cell.setValue(month);
    } catch (error) {
      throw new Error(`DataService.setSelectedMonth: ${error.message}`);
    }
  }

  /**
   * Gắn Dropdown validation (danh sách tháng) vào ô SelectedMonth, dựa trên
   * các tháng thực tế có trong DATA_ADS (hoặc fallback 12 tháng của năm hiện
   * tại nếu chưa có dữ liệu).
   */
  setupMonthDropdown() {
    try {
      const cell = this.getConfigValueCell(Config.CONFIG_KEYS.SELECTED_MONTH);
      if (!cell) {
        throw new Error(
          `Không tìm thấy dòng cấu hình "${Config.CONFIG_KEYS.SELECTED_MONTH}" trong sheet "${Config.SHEET_NAMES.CONFIG}".`
        );
      }

      let months = this.getAvailableMonths();
      if (months.length === 0) {
        months = Utils.generateYearMonths(new Date().getFullYear());
      }

      const rule = SpreadsheetApp.newDataValidation().requireValueInList(months, true).setAllowInvalid(false).build();
      cell.setDataValidation(rule);
      Logger.log(`DataService.setupMonthDropdown: đã gắn dropdown với ${months.length} tháng.`);
    } catch (error) {
      throw new Error(`DataService.setupMonthDropdown: ${error.message}`);
    }
  }

  /**
   * Đảm bảo đủ 3 sheet DATA_ADS/CONFIG/DASHBOARD. Tạo mới (kèm dữ liệu mẫu
   * cho DATA_ADS) nếu chưa tồn tại, rồi gắn Dropdown chọn tháng.
   */
  ensureSheetsReady() {
    try {
      const createdSheets = [];

      if (!this.spreadsheet.getSheetByName(Config.SHEET_NAMES.DATA)) {
        this._createDataSheetWithSample();
        createdSheets.push(Config.SHEET_NAMES.DATA);
      }
      if (!this.spreadsheet.getSheetByName(Config.SHEET_NAMES.CONFIG)) {
        this._createConfigSheet();
        createdSheets.push(Config.SHEET_NAMES.CONFIG);
      }
      if (!this.spreadsheet.getSheetByName(Config.SHEET_NAMES.DASHBOARD)) {
        this.spreadsheet.insertSheet(Config.SHEET_NAMES.DASHBOARD);
        createdSheets.push(Config.SHEET_NAMES.DASHBOARD);
      }

      if (createdSheets.length > 0) {
        Logger.log(`DataService.ensureSheetsReady: đã tạo sheet: ${createdSheets.join(', ')}`);
      }
      this.setupMonthDropdown();
    } catch (error) {
      throw new Error(`DataService.ensureSheetsReady: ${error.message}`);
    }
  }

  /**
   * Tạo sheet DATA_ADS mới với header đúng chuẩn + dữ liệu mẫu (demo).
   * @private
   */
  _createDataSheetWithSample() {
    const sheet = this.spreadsheet.insertSheet(Config.SHEET_NAMES.DATA);
    const headers = Object.values(Config.DATA_HEADER_KEYS);
    const sampleRows = Utils.buildSampleAdsRows();

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (sampleRows.length > 0) {
      sheet.getRange(2, 1, sampleRows.length, headers.length).setValues(sampleRows);
    }
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    Logger.log(`DataService._createDataSheetWithSample: đã tạo ${sampleRows.length} dòng dữ liệu mẫu (demo).`);
  }

  /**
   * Tạo sheet CONFIG mới với header Key/Value + seed SelectedMonth = tháng hiện tại.
   * @private
   */
  _createConfigSheet() {
    const sheet = this.spreadsheet.insertSheet(Config.SHEET_NAMES.CONFIG);
    const headers = [Config.CONFIG_HEADER_KEYS.KEY, Config.CONFIG_HEADER_KEYS.VALUE];
    sheet.getRange(1, 1, 1, 2).setValues([headers]).setFontWeight('bold');
    sheet.getRange(2, 1, 1, 2).setValues([[Config.CONFIG_KEYS.SELECTED_MONTH, Utils.toYearMonth(new Date())]]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, 2);
  }
}
