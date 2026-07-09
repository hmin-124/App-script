/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * Điểm vào (entry point) của project: tạo custom menu và nối UI Google
 * Sheets (menu, Dialog) với các class xử lý (DataService, MessageBuilder,
 * ApprovalService). File này CHỦ ĐÍCH giữ mỏng — mọi logic thật nằm ở các
 * module khác.
 */

/**
 * Chạy tự động khi mở Spreadsheet — thêm menu "M8 Tools".
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu(Config.MENU_NAME)
      .addItem(Config.MENU_ITEM_LABEL, 'createBrowserMessage')
      .addToUi();
  } catch (error) {
    console.error(`onOpen: ${error.message}`);
  }
}

/**
 * Handler cho menu "M8 Tools -> Tạo tin nhắn trình duyệt". Đọc vùng đang
 * được chọn, dựng tin nhắn, và mở Dialog hiển thị kết quả.
 */
function createBrowserMessage() {
  const ui = SpreadsheetApp.getUi();
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    const rangeList = sheet.getActiveRangeList();

    const dataService = new DataService(sheet);
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
 * Hàm top-level mỏng này tồn tại vì google.script.run chỉ gọi được hàm
 * global, không gọi trực tiếp static method của class.
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
