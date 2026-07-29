/**
 * Menu.gs
 * ---------------------------------------------------------------------------
 * Builds custom menus. Kept separate from Code.gs so the menu STRUCTURE
 * (labels, items, ordering) can be extended independently from the handler
 * LOGIC that each item triggers.
 *
 * Two menus:
 *   - 🛠️ Admin Tools     → monthly request sheet + Lead/Head messages
 *   - 🛒 Tool Request    → sheet-based "mua Tool mới" Preview/Send/Reset
 */

/**
 * Simple trigger: runs automatically whenever the spreadsheet is opened.
 * Google Apps Script recognizes the name "onOpen" as a special trigger, so
 * this function cannot be a class method.
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();

    ui.createMenu(Config.MENU_NAME)
      .addItem(Config.MENU_ITEM_GENERATE, 'onGenerateRequestSheetClick')
      .addItem(Config.MENU_ITEM_LEAD_MESSAGE, 'onCreateLeadMessageClick')
      .addItem(Config.MENU_ITEM_HEAD_MESSAGE, 'onCreateHeadMessageClick')
      .addToUi();

    ui.createMenu(Config.TOOL_REQUEST_MENU_NAME)
      .addItem(Config.TOOL_REQUEST_MENU_PREVIEW, 'previewNewToolRequest')
      .addItem(Config.TOOL_REQUEST_MENU_SEND, 'sendNewToolRequest')
      .addItem(Config.TOOL_REQUEST_MENU_RESEND, 'resendNewToolRequest')
      .addSeparator()
      .addItem(Config.TOOL_REQUEST_MENU_RESET, 'resetNewToolRequestForm')
      .addItem(Config.TOOL_REQUEST_MENU_SETUP, 'setupNewToolRequestTemplate')
      .addToUi();
  } catch (error) {
    console.error(`onOpen: ${error.message}`);
  }
}
