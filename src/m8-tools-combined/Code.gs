/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * Điểm vào (entry point) chung cho CẢ 2 chức năng trong project này:
 *   1) "Tạo tin nhắn trình duyệt" (menu 🛠️ M8 Tools)
 *   2) "DIG1 ADS Dashboard"       (menu 📊 DIG1 Reports, logic ở DashboardCode.gs)
 *
 * Google Apps Script chỉ cho phép DUY NHẤT một hàm onOpen() toàn cục trong
 * một project — vì vậy onOpen() ở đây tạo CẢ 2 menu. Các hàm còn lại của tool
 * tin nhắn (createBrowserMessage, showMessageDialog_, sendMessageToGoogleChat,
 * sendMessageToTelegram) giữ nguyên như bản gốc, không đổi gì.
 */

/**
 * Chạy tự động khi mở Spreadsheet — tạo cả 2 menu: "🛠️ M8 Tools" (tin nhắn
 * trình duyệt) và "📊 DIG1 Reports" (Dashboard ADS).
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();

    ui.createMenu(Config.MENU_NAME).addItem(Config.MENU_ITEM_LABEL, 'createBrowserMessage').addToUi();

    ui.createMenu(DashboardConfig.MENU_NAME)
      .addItem(DashboardConfig.MENU_ITEMS.REFRESH, 'refreshDashboard')
      .addItem(DashboardConfig.MENU_ITEMS.SETUP, 'setupDashboardProject')
      .addToUi();
  } catch (error) {
    console.error(`onOpen: ${error.message}`);
  }
}

/**
 * Menu handler cho "🛠️ M8 Tools -> 💬 Tạo tin nhắn trình duyệt". Đọc vùng
 * đang được chọn, dựng tin nhắn, và mở Dialog hiển thị kết quả.
 */
function createBrowserMessage() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const rangeList = sheet.getActiveRangeList();

    const dataService = new DataService();
    const tickets = dataService.getTicketsFromRangeList(rangeList);

    const message = new MessageBuilder(tickets).build();

    showMessageDialog_(message);
  } catch (error) {
    console.error(`createBrowserMessage: ${error.message}`);
    ui.alert('Không thể tạo tin nhắn', error.message, ui.ButtonSet.OK);
  }
}

/**
 * Mở Dialog hiển thị tin nhắn đã dựng, kèm nút Copy / Gửi Google Chat /
 * Gửi Telegram.
 * @param {string} message - Nội dung tin nhắn cần hiển thị.
 */
function showMessageDialog_(message) {
  try {
    const template = HtmlService.createTemplateFromFile('Dialog');
    template.message = message;

    const html = template.evaluate().setWidth(560).setHeight(620);
    SpreadsheetApp.getUi().showModalDialog(html, 'Tin nhắn trình duyệt');
  } catch (error) {
    throw new Error(`showMessageDialog_: ${error.message}`);
  }
}

/**
 * Được gọi từ Dialog.html qua google.script.run khi bấm "Gửi Google Chat".
 * @param {string} message - Nội dung tin nhắn cần gửi.
 * @returns {{success: boolean, info: string}}
 */
function sendMessageToGoogleChat(message) {
  return ApprovalService.sendToGoogleChat(message);
}

/**
 * Được gọi từ Dialog.html qua google.script.run khi bấm "Gửi Telegram".
 * @param {string} message - Nội dung tin nhắn cần gửi.
 * @returns {{success: boolean, info: string}}
 */
function sendMessageToTelegram(message) {
  return ApprovalService.sendToTelegram(message);
}
