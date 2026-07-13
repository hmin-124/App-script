/**
 * ApprovalService.gs
 * ---------------------------------------------------------------------------
 * Xử lý mọi thứ liên quan tới việc DUYỆT tin nhắn: xác định câu tag người
 * duyệt dựa trên "PIC phiếu", và (stub để mở rộng sau) gửi tin nhắn đến
 * Google Chat / Telegram từ Dialog UI.
 */

class ApprovalService {
  /**
   * Dựng câu "Nhờ anh/chị ... duyệt phiếu" cuối tin nhắn, dựa trên "PIC
   * phiếu" của từng phiếu trong danh sách. Nếu nhiều phiếu có PIC khác
   * nhau, mỗi câu nhờ duyệt (không lặp) sẽ được nối bằng dòng mới.
   * @param {TicketRecord[]} tickets - Danh sách phiếu trong tin nhắn.
   * @returns {string}
   */
  static buildApprovalFooter(tickets) {
    try {
      if (!Array.isArray(tickets) || tickets.length === 0) {
        throw new Error('Danh sách phiếu trống.');
      }

      const uniquePics = Array.from(
        new Set(
          tickets
            .map((ticket) => String(ticket.pic || '').trim().toLowerCase())
            .filter((pic) => pic.length > 0)
        )
      );

      if (uniquePics.length === 0) return Config.DEFAULT_APPROVAL_MESSAGE;

      const messages = uniquePics.map((pic) => {
        const approver = Config.APPROVER_MAP[pic];
        return approver ? approver.mentionText : Config.DEFAULT_APPROVAL_MESSAGE;
      });

      // Loại trùng để không lặp lại y nguyên câu fallback nhiều lần.
      return Array.from(new Set(messages)).join('\n');
    } catch (error) {
      console.error(`ApprovalService.buildApprovalFooter: ${error.message}`);
      return Config.DEFAULT_APPROVAL_MESSAGE;
    }
  }

  /**
   * Gửi tin nhắn tới Google Chat. CHƯA triển khai thật — hàm này tồn tại
   * để nút "Gửi Google Chat" trên Dialog đã có sẵn luồng gọi, chỉ cần thay
   * phần thân bằng UrlFetchApp tới Google Chat Webhook khi triển khai thật.
   * @param {string} message - Nội dung tin nhắn cần gửi.
   * @returns {{success: boolean, info: string}}
   */
  static sendToGoogleChat(message) {
    try {
      if (!message) throw new Error('Nội dung tin nhắn trống.');

      // TODO (mở rộng sau): lấy webhook URL từ Script Properties rồi gọi:
      // UrlFetchApp.fetch(webhookUrl, {
      //   method: 'post',
      //   contentType: 'application/json',
      //   payload: JSON.stringify({ text: message }),
      // });
      console.log('ApprovalService.sendToGoogleChat: chưa triển khai, chỉ log.');
      return { success: false, info: 'Chức năng Gửi Google Chat sẽ được phát triển sau.' };
    } catch (error) {
      console.error(`ApprovalService.sendToGoogleChat: ${error.message}`);
      return { success: false, info: error.message };
    }
  }

  /**
   * Gửi tin nhắn tới Telegram. CHƯA triển khai thật — xem sendToGoogleChat.
   * @param {string} message - Nội dung tin nhắn cần gửi.
   * @returns {{success: boolean, info: string}}
   */
  static sendToTelegram(message) {
    try {
      if (!message) throw new Error('Nội dung tin nhắn trống.');

      // TODO (mở rộng sau): lấy bot token + chat id từ Script Properties rồi gọi:
      // UrlFetchApp.fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      //   method: 'post',
      //   payload: { chat_id: chatId, text: message },
      // });
      console.log('ApprovalService.sendToTelegram: chưa triển khai, chỉ log.');
      return { success: false, info: 'Chức năng Gửi Telegram sẽ được phát triển sau.' };
    } catch (error) {
      console.error(`ApprovalService.sendToTelegram: ${error.message}`);
      return { success: false, info: error.message };
    }
  }
}
