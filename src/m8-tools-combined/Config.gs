/**
 * Config.gs
 * ---------------------------------------------------------------------------
 * Nơi tập trung TOÀN BỘ cấu hình của chức năng "Tạo tin nhắn trình duyệt"
 * (M8 Tools). Nhờ vậy, các file còn lại (DataService, MessageBuilder,
 * Template, ApprovalService...) không bao giờ hardcode tên cột, icon, tỷ giá
 * hay danh sách người duyệt — muốn mở rộng (thêm PIC mới, đổi tỷ giá, đổi
 * nhãn menu...) chỉ cần sửa file này.
 */

/**
 * @typedef {Object} ApproverInfo
 * @property {string} mentionText - Câu tag/nhờ duyệt đầy đủ sẽ chèn vào cuối tin nhắn.
 */

class Config {
  /**
   * Tên menu cấp 1 hiển thị trên Google Sheets. Google Apps Script
   * (`SpreadsheetApp.getUi().createMenu()`) KHÔNG hỗ trợ icon ảnh thật, nên
   * ta chèn icon dạng emoji Unicode ngay trong chuỗi tên menu để dễ nhận
   * diện — cách này vẫn hiển thị đúng trên thanh menu Sheets.
   * @returns {string}
   */
  static get MENU_NAME() {
    return '🛠️ M8 Tools';
  }

  /** @returns {string} Tên menu item kích hoạt chức năng tạo tin nhắn (kèm icon). */
  static get MENU_ITEM_LABEL() {
    return '💬 Tạo tin nhắn trình duyệt';
  }

  /**
   * Khóa logic -> tên cột (header) cần đọc. DataService sẽ chuẩn hóa
   * (trim, bỏ xuống dòng, viết thường) rồi so khớp với header thật trên
   * sheet, nên không cần khớp tuyệt đối 100% ký tự xuống dòng "\n".
   */
  static get HEADER_KEYS() {
    return {
      TICKET_ID: 'ID phiếu',
      CONTENT: 'Nội dung phiếu',
      COST: 'Cost',
      UNIT: 'DVT',
      PIC: 'PIC phiếu',
    };
  }

  /** @returns {number} Số dòng tối đa được quét để tự dò dòng header (vì có sheet header ở dòng 1, có sheet ở dòng 2). */
  static get HEADER_ROW_SEARCH_LIMIT() {
    return 10;
  }

  /** @returns {string} Đơn vị tiền tệ đích hiển thị trong tin nhắn. */
  static get TARGET_CURRENCY() {
    return 'USDC';
  }

  /**
   * Tỷ giá PNT/USDC mặc định, dùng khi không tìm được tỷ giá riêng trong
   * nội dung phiếu (xem Utils.extractExchangeRate). Có thể thay bằng API
   * lấy tỷ giá thực tế sau này mà không cần sửa các file khác.
   * @returns {number}
   */
  static get DEFAULT_EXCHANGE_RATE_PNT_PER_USDC() {
    return 26461.03;
  }

  /** @returns {number} Số USDC "Test ví" bị trừ trước khi tính số tiền còn lại. */
  static get TEST_WALLET_USDC() {
    return 10;
  }

  /**
   * Bảng map PIC (đã chuẩn hóa lowercase) -> câu nhờ duyệt cuối tin nhắn.
   * Thêm PIC mới ở đây, KHÔNG cần sửa ApprovalService.gs.
   * @returns {Object<string, ApproverInfo>}
   */
  static get APPROVER_MAP() {
    return {
      nlime: {
        mentionText:
          'Nhờ anh A Dyrus.SLead.DIG2.M8🤑🎯 xem phiếu và duyệt phiếu. Khi duyệt nhờ Anh tag thêm cấp trên để phê duyệt bước tiếp theo nhé.',
      },
      naly: {
        mentionText:
          'Nhờ chị Naly.SLead.DIG1.M8🤑🎯 xem phiếu và duyệt phiếu. Khi duyệt nhờ Chị tag thêm cấp trên để phê duyệt bước tiếp theo nhé.',
      },
    };
  }

  /** @returns {string} Câu nhờ duyệt mặc định khi PIC không có trong APPROVER_MAP. */
  static get DEFAULT_APPROVAL_MESSAGE() {
    return 'Nhờ Anh/Chị xem phiếu và duyệt phiếu. Khi duyệt nhờ tag thêm cấp trên để phê duyệt bước tiếp theo nhé.';
  }
}
