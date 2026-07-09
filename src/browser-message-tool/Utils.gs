/**
 * Utils.gs
 * ---------------------------------------------------------------------------
 * Các hàm thuần (pure functions), không phụ thuộc Sheet/UI: format tiền,
 * quy đổi USDC và trích xuất thông tin từ text tự do trong cột "Nội dung
 * phiếu". Tách riêng để dễ test độc lập và dùng lại ở nhiều nơi.
 */

class Utils {
  /**
   * Format số tiền có dấu phẩy ngăn cách hàng nghìn, không có số lẻ.
   * Dùng cho các đơn vị dạng PNT/VND. Ví dụ: 60000000 -> "60,000,000".
   * @param {number} amount - Số tiền cần format.
   * @returns {string}
   */
  static formatMoney(amount) {
    try {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount)) {
        throw new Error(`Giá trị "${amount}" không phải là số hợp lệ.`);
      }
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(numericAmount);
    } catch (error) {
      console.error(`Utils.formatMoney: ${error.message}`);
      return String(amount);
    }
  }

  /**
   * Format số tiền USDC: có dấu phẩy ngăn cách hàng nghìn và LUÔN có đúng
   * 2 số lẻ. Ví dụ: 2267.1 -> "2,267.10".
   * @param {number} amount - Số USDC cần format.
   * @returns {string}
   */
  static formatUSDC(amount) {
    try {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount)) {
        throw new Error(`Giá trị "${amount}" không phải là số hợp lệ.`);
      }
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(numericAmount);
    } catch (error) {
      console.error(`Utils.formatUSDC: ${error.message}`);
      return String(amount);
    }
  }

  /**
   * Quy đổi một số tiền từ `unit` sang USDC.
   * - USDC/USDT: coi như quy đổi ~1:1 (stablecoin).
   * - Còn lại (PNT, VND...): chia cho tỷ giá PNT-per-USDC được cung cấp.
   * Muốn hỗ trợ thêm đơn vị mới, chỉ cần thêm vào STABLECOIN_UNITS hoặc bổ
   * sung nhánh xử lý riêng — không cần sửa nơi gọi hàm.
   * @param {number} amount - Số tiền gốc.
   * @param {string} unit - Đơn vị gốc (PNT, USDC, USDT...).
   * @param {number} [exchangeRatePntPerUsdc] - Tỷ giá PNT cho 1 USDC.
   * @returns {number} Số tiền đã quy đổi sang USDC.
   */
  static convertToUsdc(amount, unit, exchangeRatePntPerUsdc = Config.DEFAULT_EXCHANGE_RATE_PNT_PER_USDC) {
    try {
      const numericAmount = Number(amount);
      if (Number.isNaN(numericAmount)) {
        throw new Error(`Giá trị "${amount}" không phải là số hợp lệ.`);
      }

      const normalizedUnit = String(unit || '').trim().toUpperCase();
      const STABLECOIN_UNITS = ['USDC', 'USDT'];
      if (STABLECOIN_UNITS.includes(normalizedUnit)) {
        return numericAmount;
      }

      if (!exchangeRatePntPerUsdc || exchangeRatePntPerUsdc <= 0) {
        throw new Error('Tỷ giá quy đổi không hợp lệ (phải > 0).');
      }
      return numericAmount / exchangeRatePntPerUsdc;
    } catch (error) {
      console.error(`Utils.convertToUsdc: ${error.message}`);
      return 0;
    }
  }

  /**
   * Lấy dòng đầu tiên không trống của một đoạn text — dùng làm "tiêu đề"
   * ngắn của phiếu (thường là tên chiến dịch).
   * @param {string} content - Nội dung phiếu.
   * @returns {string}
   */
  static extractFirstLine(content) {
    try {
      const lines = String(content || '')
        .split('\n')
        .map((line) => line.trim());
      return lines.find((line) => line.length > 0) || '';
    } catch (error) {
      console.error(`Utils.extractFirstLine: ${error.message}`);
      return '';
    }
  }

  /**
   * Trích xuất mã dự án từ nội dung phiếu. Ưu tiên nhãn "Dự án:"; nếu
   * không có, thử nhãn "Brand code:" (một số team dùng thuật ngữ khác cho
   * cùng khái niệm). Muốn hỗ trợ thêm nhãn mới, chỉ cần bổ sung vào
   * PROJECT_CODE_PATTERNS.
   * @param {string} content - Nội dung phiếu.
   * @returns {string} Mã dự án, hoặc 'N/A' nếu không tìm thấy.
   */
  static extractProjectCode(content) {
    const PROJECT_CODE_PATTERNS = [/Dự án:\s*([^\n]+)/i, /Brand code:\s*([^\n]+)/i];
    try {
      const text = String(content || '');
      for (const pattern of PROJECT_CODE_PATTERNS) {
        const match = text.match(pattern);
        if (match) return match[1].trim();
      }
      return 'N/A';
    } catch (error) {
      console.error(`Utils.extractProjectCode: ${error.message}`);
      return 'N/A';
    }
  }

  /**
   * Trích xuất mô tả Payment Scheme, ví dụ "01 đợt thanh toán".
   * @param {string} content - Nội dung phiếu.
   * @returns {string} Chuỗi rỗng nếu không tìm thấy.
   */
  static extractPaymentScheme(content) {
    try {
      const match = String(content || '').match(/Payment Scheme:\s*([^\n]+)/i);
      return match ? match[1].trim() : '';
    } catch (error) {
      console.error(`Utils.extractPaymentScheme: ${error.message}`);
      return '';
    }
  }

  /**
   * Trích xuất TOÀN BỘ các dòng "Đợt N: ..." trong nội dung phiếu, để hiển
   * thị đầy đủ khi phiếu có nhiều đợt thanh toán (theo đúng yêu cầu format).
   *
   * Lưu ý: KHÔNG dùng flag "i" (case-insensitive) ở đây, vì nội dung phiếu
   * thường có thêm câu văn dạng "...chuyển khoản đợt 1: ..." (chữ "đợt"
   * thường, nằm giữa câu) — nếu match không phân biệt hoa/thường sẽ vô tình
   * lấy nhầm câu đó. Các dòng liệt kê đợt thật luôn bắt đầu bằng "Đợt" viết
   * hoa ở đầu dòng và có chứa "Status:".
   * @param {string} content - Nội dung phiếu.
   * @returns {string[]} Danh sách các dòng "Đợt N: ...", đã trim.
   */
  static extractDisbursementLines(content) {
    try {
      const matches = String(content || '').match(/^\s*Đợt\s*\d+:.*$/gm);
      if (!matches) return [];
      return matches.map((line) => line.trim()).filter((line) => /Status/i.test(line));
    } catch (error) {
      console.error(`Utils.extractDisbursementLines: ${error.message}`);
      return [];
    }
  }

  /**
   * Cố gắng đọc tỷ giá riêng của phiếu từ nội dung, ví dụ dòng
   * "Tỷ giá USDT: 27,900 PNT" (thực tế xuất hiện ở sheet DIG1-ANW). Nếu có,
   * tỷ giá này sẽ được ưu tiên dùng thay cho tỷ giá mặc định trong Config —
   * đây là điểm mở rộng để hệ thống tự thích ứng theo dữ liệu thật.
   * @param {string} content - Nội dung phiếu.
   * @returns {number|null} Tỷ giá PNT-per-USDC/USDT, hoặc null nếu không có.
   */
  static extractExchangeRate(content) {
    try {
      const match = String(content || '').match(/Tỷ giá[^:\n]*:\s*([\d.,]+)\s*PNT/i);
      if (!match) return null;
      const numeric = Number(match[1].replace(/,/g, ''));
      return Number.isNaN(numeric) ? null : numeric;
    } catch (error) {
      console.error(`Utils.extractExchangeRate: ${error.message}`);
      return null;
    }
  }
}
