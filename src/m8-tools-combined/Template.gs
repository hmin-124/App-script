/**
 * Template.gs
 * ---------------------------------------------------------------------------
 * MessageTemplate quy định CHÍNH XÁC hình thức trình bày (icon, dấu phân
 * cách, thứ tự dòng...) của tin nhắn trình duyệt. Toàn bộ literal string về
 * layout nằm ở đây — MessageBuilder chỉ gọi buildHeader/buildBody/buildFooter
 * và ghép lại, không biết chi tiết định dạng.
 *
 * Muốn thêm một MẪU TIN NHẮN MỚI sau này: tạo class khác (ví dụ
 * `PaymentReminderTemplate`) implement cùng 4 static method
 * (buildSummaryLine/buildHeader/buildBody/buildFooter) rồi cho MessageBuilder
 * nhận template qua constructor — không cần sửa Template.gs hiện tại.
 */

class MessageTemplate {
  /** @returns {string} Icon đặt trước dòng "Loại: Chuyển khoản theo đợt". */
  static get PIN_ICON() {
    return '📌';
  }

  /** @returns {string} Dấu phân cách in một lần sau danh sách ID phiếu ở đầu tin nhắn. */
  static get SUMMARY_DIVIDER() {
    return '='.repeat(9);
  }

  /** @returns {string} Dấu phân cách ngắn dưới dòng "📌 Loại". */
  static get SECTION_DIVIDER() {
    return '='.repeat(5);
  }

  /** @returns {string} Dấu phân cách dài kết thúc mỗi block phiếu. */
  static get BLOCK_DIVIDER() {
    return '='.repeat(30);
  }

  /**
   * Dựng một dòng trong danh sách tổng hợp ID phiếu ở đầu tin nhắn, ví dụ:
   * "ID phiếu: 3494391- 60,000,000 PNT = 2,267.19 USDC".
   * @param {TicketRecord} ticket - Phiếu cần hiển thị.
   * @param {number} usdcAmount - Số tiền đã quy đổi sang USDC.
   * @returns {string}
   */
  static buildSummaryLine(ticket, usdcAmount) {
    try {
      const money = Utils.formatMoney(ticket.cost);
      const usdc = Utils.formatUSDC(usdcAmount);
      return `ID phiếu: ${ticket.ticketId}- ${money} ${ticket.unit} = ${usdc} ${Config.TARGET_CURRENCY}`;
    } catch (error) {
      throw new Error(`MessageTemplate.buildSummaryLine: ${error.message}`);
    }
  }

  /**
   * Dựng phần đầu (header) của một block phiếu: số thứ tự, ID phiếu và
   * tên chiến dịch (dòng đầu tiên của "Nội dung phiếu").
   * @param {TicketRecord} ticket - Phiếu cần hiển thị.
   * @param {number} index - Số thứ tự phiếu trong tin nhắn (bắt đầu từ 1).
   * @returns {string}
   */
  static buildHeader(ticket, index) {
    try {
      const title = Utils.extractFirstLine(ticket.content);
      return `${index}. CHI PHÍ ID phiếu: ${ticket.ticketId}\n${title}`;
    } catch (error) {
      throw new Error(`MessageTemplate.buildHeader: ${error.message}`);
    }
  }

  /**
   * Dựng phần thân (body) của một block phiếu: loại giao dịch, dự án,
   * tổng chi phí giải ngân, payment scheme, các đợt thanh toán (đầy đủ nếu
   * có nhiều đợt) và dòng tổng chi phí đã quy đổi USDC.
   * @param {TicketRecord} ticket - Phiếu cần hiển thị.
   * @param {number} usdcAmount - Số tiền đã quy đổi sang USDC.
   * @returns {string}
   */
  static buildBody(ticket, usdcAmount) {
    try {
      const projectCode = Utils.extractProjectCode(ticket.content);
      const paymentScheme = Utils.extractPaymentScheme(ticket.content);
      const disbursementLines = Utils.extractDisbursementLines(ticket.content);
      const money = Utils.formatMoney(ticket.cost);
      const usdc = Utils.formatUSDC(usdcAmount);

      const lines = [
        `${MessageTemplate.PIN_ICON} Loại: Chuyển khoản theo đợt`,
        MessageTemplate.SECTION_DIVIDER,
        `- Dự án: ${projectCode}`,
        `- Phiếu ID [${ticket.ticketId}]`,
        `- Tổng chi phí giải ngân: ${money} ${ticket.unit}`,
      ];

      if (paymentScheme) {
        lines.push(`()Payment Scheme: ${paymentScheme}`);
      }
      if (disbursementLines.length > 0) {
        lines.push(...disbursementLines);
      }

      lines.push('');
      lines.push(`=> Tổng chi phí chuyển khoản đợt 1: ${money} ${ticket.unit} = ${usdc} ${Config.TARGET_CURRENCY}`);

      return lines.join('\n');
    } catch (error) {
      throw new Error(`MessageTemplate.buildBody: ${error.message}`);
    }
  }

  /**
   * Dựng phần chân (footer) của một block phiếu: số tiền "test ví" và số
   * tiền còn lại, kết thúc bằng dấu phân cách dài.
   * @param {number} usdcAmount - Số tiền đã quy đổi sang USDC.
   * @returns {string}
   */
  static buildFooter(usdcAmount) {
    try {
      const testWallet = Config.TEST_WALLET_USDC;
      const remaining = usdcAmount - testWallet;

      const lines = [
        '',
        `Test ví: ${Utils.formatUSDC(testWallet)} ${Config.TARGET_CURRENCY}`,
        `Số tiền còn lại: ${Utils.formatUSDC(remaining)} ${Config.TARGET_CURRENCY}`,
        MessageTemplate.BLOCK_DIVIDER,
      ];
      return lines.join('\n');
    } catch (error) {
      throw new Error(`MessageTemplate.buildFooter: ${error.message}`);
    }
  }
}
