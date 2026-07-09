/**
 * Utils.gs
 * ---------------------------------------------------------------------------
 * Hàm thuần (pure functions), không phụ thuộc Sheet/UI: format số hiển thị
 * (formatCurrency/formatPercent/formatNumber), parse số an toàn, xử lý
 * ngày/tháng (parse "dd/MM/yyyy", quy đổi "YYYY-MM", tạo danh sách tháng...).
 * Tách riêng để test độc lập và dùng lại ở DataService/ReportService.
 */

class Utils {
  /**
   * Format số tiền kèm ký hiệu tiền tệ, có dấu phẩy ngăn cách hàng nghìn,
   * không số lẻ. Ví dụ: 12345 -> "$12,345".
   * @param {number} amount
   * @returns {string}
   */
  static formatCurrency(amount) {
    try {
      const numericAmount = Number(amount) || 0;
      const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(numericAmount);
      return `${Config.CURRENCY_SYMBOL}${formatted}`;
    } catch (error) {
      console.error(`Utils.formatCurrency: ${error.message}`);
      return String(amount);
    }
  }

  /**
   * Format số thành chuỗi phần trăm. Ví dụ: 15.326 -> "15.33%".
   * @param {number} value - Giá trị phần trăm (đã nhân 100, ví dụ ROI=15.3 nghĩa là 15.3%).
   * @param {number} [decimals=2] - Số chữ số sau dấu phẩy.
   * @returns {string}
   */
  static formatPercent(value, decimals = 2) {
    try {
      const numericValue = Number(value) || 0;
      return `${numericValue.toFixed(decimals)}%`;
    } catch (error) {
      console.error(`Utils.formatPercent: ${error.message}`);
      return String(value);
    }
  }

  /**
   * Format số có dấu phẩy ngăn cách hàng nghìn, số chữ số lẻ tùy chọn.
   * Ví dụ: formatNumber(2267.1, 2) -> "2,267.10".
   * @param {number} value
   * @param {number} [decimals=0]
   * @returns {string}
   */
  static formatNumber(value, decimals = 0) {
    try {
      const numericValue = Number(value) || 0;
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(numericValue);
    } catch (error) {
      console.error(`Utils.formatNumber: ${error.message}`);
      return String(value);
    }
  }

  /**
   * Parse một giá trị (số, chuỗi có dấu phẩy, rỗng...) thành số an toàn.
   * Trả về 0 nếu không parse được — tránh NaN lan truyền vào các phép tính
   * KPI (ROI/ROAS/Profit).
   * @param {*} value
   * @returns {number}
   */
  static parseNumber(value) {
    try {
      if (typeof value === 'number') return Number.isNaN(value) ? 0 : value;
      const cleaned = String(value === null || value === undefined ? '' : value)
        .replace(/,/g, '')
        .trim();
      if (cleaned === '') return 0;
      const parsed = Number(cleaned);
      return Number.isNaN(parsed) ? 0 : parsed;
    } catch (error) {
      console.error(`Utils.parseNumber: ${error.message}`);
      return 0;
    }
  }

  /**
   * Chia an toàn, tránh chia cho 0 (trả về giá trị fallback thay vì Infinity/NaN).
   * @param {number} numerator
   * @param {number} denominator
   * @param {number} [fallback=0]
   * @returns {number}
   */
  static safeDivide(numerator, denominator, fallback = 0) {
    const n = Number(numerator);
    const d = Number(denominator);
    if (!d) return fallback;
    return n / d;
  }

  /**
   * Chuyển một giá trị cell (Date object hoặc chuỗi "dd/MM/yyyy") thành Date.
   * @param {*} value - Giá trị thô đọc từ cell.
   * @returns {Date|null} Null nếu không parse được.
   */
  static toDate(value) {
    try {
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmy) {
          const [, day, month, year] = dmy;
          const parsed = new Date(Number(year), Number(month) - 1, Number(day));
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        const fallbackParsed = new Date(trimmed);
        return Number.isNaN(fallbackParsed.getTime()) ? null : fallbackParsed;
      }
      return null;
    } catch (error) {
      console.error(`Utils.toDate: ${error.message}`);
      return null;
    }
  }

  /**
   * Quy đổi một Date thành chuỗi "YYYY-MM" (dùng để so khớp với SelectedMonth).
   * @param {Date} date
   * @returns {string}
   */
  static toYearMonth(date) {
    try {
      return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM');
    } catch (error) {
      console.error(`Utils.toYearMonth: ${error.message}`);
      return '';
    }
  }

  /**
   * Quy đổi một Date thành nhãn ngắn "dd/MM" — dùng làm label trục X của chart.
   * @param {Date} date
   * @returns {string}
   */
  static toDayLabel(date) {
    try {
      return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM');
    } catch (error) {
      console.error(`Utils.toDayLabel: ${error.message}`);
      return '';
    }
  }

  /**
   * Chuyển "YYYY-MM" thành nhãn hiển thị "Tháng MM/YYYY".
   * @param {string} yearMonth
   * @returns {string}
   */
  static formatMonthLabel(yearMonth) {
    try {
      const [year, month] = String(yearMonth || '').split('-');
      if (!year || !month) return String(yearMonth || '');
      return `Tháng ${month}/${year}`;
    } catch (error) {
      console.error(`Utils.formatMonthLabel: ${error.message}`);
      return String(yearMonth || '');
    }
  }

  /**
   * Kiểm tra một chuỗi có đúng định dạng "YYYY-MM" hợp lệ không.
   * @param {*} value
   * @returns {boolean}
   */
  static isValidYearMonth(value) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '').trim());
  }

  /**
   * Sinh danh sách 12 tháng "YYYY-MM" của một năm — dùng làm fallback cho
   * Dropdown chọn tháng khi sheet DATA_ADS chưa có dữ liệu.
   * @param {number} year
   * @returns {string[]}
   */
  static generateYearMonths(year) {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      months.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    return months;
  }

  /**
   * Kiểm tra một ô (row, column) có nằm trong một Range đã cho không — dùng
   * trong onEdit để xác định người dùng có sửa đúng ô SelectedMonth hay không,
   * kể cả khi họ paste/sửa nhiều ô cùng lúc.
   * @param {number} row - Chỉ số dòng (1-based) của ô cần kiểm tra.
   * @param {number} column - Chỉ số cột (1-based) của ô cần kiểm tra.
   * @param {GoogleAppsScript.Spreadsheet.Range} range - Vùng vừa được sửa.
   * @returns {boolean}
   */
  static isCellWithinRange(row, column, range) {
    try {
      return (
        row >= range.getRow() &&
        row <= range.getLastRow() &&
        column >= range.getColumn() &&
        column <= range.getLastColumn()
      );
    } catch (error) {
      console.error(`Utils.isCellWithinRange: ${error.message}`);
      return false;
    }
  }

  /**
   * Sinh dữ liệu mẫu (random) cho sheet DATA_ADS, dùng khi setup lần đầu để
   * người dùng có ngay dữ liệu demo trong THÁNG HIỆN TẠI (theo ngày chạy
   * script) — giúp Dashboard hiển thị có dữ liệu ngay, không bị trống.
   * ⚠️ Đây là dữ liệu giả lập, hãy thay bằng dữ liệu thật sau khi setup.
   * @returns {Array<Array<*>>} Mảng các dòng, đúng thứ tự cột DATA_HEADER_KEYS.
   */
  static buildSampleAdsRows() {
    try {
      const timezone = Session.getScriptTimeZone();
      const today = new Date();
      const members = ['John', 'Anna', 'Mike'];
      const brands = ['BU88', 'GO88', 'F168'];
      const rows = [];

      for (let dayOffset = 0; dayOffset < 20; dayOffset++) {
        const date = new Date(today.getFullYear(), today.getMonth(), 1 + dayOffset);
        if (date.getMonth() !== today.getMonth()) break; // chỉ sinh dữ liệu trong tháng hiện tại

        members.forEach((member, idx) => {
          const brand = brands[idx % brands.length];
          const cost = 800 + Math.round(Math.random() * 800);
          const revenue = cost + Math.round(Math.random() * 1500);
          const ftd = 5 + Math.round(Math.random() * 20);
          const deposit = 2000 + Math.round(Math.random() * 4000);

          rows.push([
            Utilities.formatDate(date, timezone, 'dd/MM/yyyy'),
            'DIG1',
            member,
            brand,
            `${brand}-CAMP-${dayOffset + 1}`,
            cost,
            revenue,
            ftd,
            deposit,
          ]);
        });
      }
      return rows;
    } catch (error) {
      console.error(`Utils.buildSampleAdsRows: ${error.message}`);
      return [];
    }
  }
}
