/**
 * MessageBuilder.gs
 * ---------------------------------------------------------------------------
 * "Nhạc trưởng" ghép DataService (dữ liệu thô) + Utils (tính toán) +
 * MessageTemplate (định dạng) + ApprovalService (câu nhờ duyệt) thành tin
 * nhắn hoàn chỉnh. Đây là nơi DUY NHẤT biết THỨ TỰ ghép các phần — chi tiết
 * hiển thị nằm ở Template.gs, chi tiết đọc dữ liệu nằm ở DataService.gs.
 */

class MessageBuilder {
  /**
   * @param {TicketRecord[]} tickets - Danh sách phiếu cần đưa vào tin nhắn.
   * @param {number} [defaultExchangeRate] - Tỷ giá PNT/USDC dùng khi phiếu không có tỷ giá riêng.
   */
  constructor(tickets, defaultExchangeRate = Config.DEFAULT_EXCHANGE_RATE_PNT_PER_USDC) {
    if (!Array.isArray(tickets) || tickets.length === 0) {
      throw new Error('MessageBuilder: cần ít nhất một phiếu để tạo tin nhắn.');
    }
    this.tickets = tickets;
    this.defaultExchangeRate = defaultExchangeRate;
  }

  /**
   * Dựng toàn bộ tin nhắn trình duyệt cho danh sách phiếu đã cung cấp.
   * @returns {string} Tin nhắn hoàn chỉnh, sẵn sàng để copy/gửi.
   */
  build() {
    try {
      const summarySection = this._buildSummarySection();
      const ticketSections = this.tickets.map((ticket, index) => this._buildTicketSection(ticket, index + 1));
      const approvalFooter = ApprovalService.buildApprovalFooter(this.tickets);

      return [summarySection, ticketSections.join('\n\n'), approvalFooter]
        .filter((section) => Boolean(section && section.length > 0))
        .join('\n\n');
    } catch (error) {
      throw new Error(`MessageBuilder.build: ${error.message}`);
    }
  }

  /**
   * Dựng phần đầu tin nhắn: danh sách "ID phiếu: ... = ... USDC" và dấu
   * phân cách tổng hợp.
   * @returns {string}
   */
  _buildSummarySection() {
    try {
      const summaryLines = this.tickets.map((ticket) =>
        MessageTemplate.buildSummaryLine(ticket, this._getUsdcAmount(ticket))
      );
      return [...summaryLines, MessageTemplate.SUMMARY_DIVIDER].join('\n');
    } catch (error) {
      throw new Error(`MessageBuilder._buildSummarySection: ${error.message}`);
    }
  }

  /**
   * Dựng đầy đủ một block phiếu (header + body + footer).
   * @param {TicketRecord} ticket - Phiếu cần dựng.
   * @param {number} index - Số thứ tự phiếu trong tin nhắn (bắt đầu từ 1).
   * @returns {string}
   */
  _buildTicketSection(ticket, index) {
    try {
      const usdcAmount = this._getUsdcAmount(ticket);
      const header = MessageTemplate.buildHeader(ticket, index);
      const body = MessageTemplate.buildBody(ticket, usdcAmount);
      const footer = MessageTemplate.buildFooter(usdcAmount);
      return `${header}\n\n${body}\n${footer}`;
    } catch (error) {
      throw new Error(`MessageBuilder._buildTicketSection (phiếu ${ticket.ticketId}): ${error.message}`);
    }
  }

  /**
   * Quy đổi chi phí của một phiếu sang USDC, ưu tiên dùng tỷ giá riêng của
   * phiếu (nếu trích xuất được từ nội dung) trước khi rơi về tỷ giá mặc định.
   * @param {TicketRecord} ticket - Phiếu cần quy đổi.
   * @returns {number}
   */
  _getUsdcAmount(ticket) {
    const perTicketRate = Utils.extractExchangeRate(ticket.content);
    const effectiveRate = perTicketRate || this.defaultExchangeRate;
    return Utils.convertToUsdc(ticket.cost, ticket.unit, effectiveRate);
  }
}
