/**
 * Menu.gs
 * ---------------------------------------------------------------------------
 * Builds the "Admin Tools" custom menu. Kept separate from Code.gs so the
 * menu STRUCTURE (labels, items, ordering) can be extended independently
 * from the handler LOGIC that each item triggers.
 *
 * IMPORTANT: onOpen used to fail SILENTLY when Config (or any dependency)
 * threw during menu build — the catch only wrote console.error, so the
 * custom menu vanished from the spreadsheet with no popup. createAdminMenu()
 * is now resilient: Config labels when available, hard-coded fallbacks
 * otherwise, and a last-resort literal menu if even that fails.
 */

/**
 * Simple trigger: runs automatically whenever the spreadsheet is opened.
 * Google Apps Script recognizes the name "onOpen" as a special trigger, so
 * this function cannot be a class method.
 */
function onOpen() {
  createAdminMenu();
}

/**
 * Runs once when the script is installed / authorized (add-on style). Also
 * safe to leave in a container-bound project — ensures the menu is created
 * right after the first permission grant.
 * @param {Object} [e]
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Creates (or recreates) the 🛠️ Admin Tools menu.
 * Safe to run manually from the Apps Script editor (Run → createAdminMenu)
 * if the menu is missing after a code deploy / permission change.
 */
function createAdminMenu() {
  try {
    const ui = SpreadsheetApp.getUi();
    const menuName = _safeMenuLabel_(function () {
      return Config.MENU_NAME;
    }, '🛠️ Admin Tools');

    ui.createMenu(menuName)
      .addItem(
        _safeMenuLabel_(function () {
          return Config.MENU_ITEM_GENERATE;
        }, '📄 Generate Request Sheet'),
        'onGenerateRequestSheetClick'
      )
      .addItem(
        _safeMenuLabel_(function () {
          return Config.MENU_ITEM_LEAD_MESSAGE;
        }, '💬 Tạo tin nhắn Lead duyệt'),
        'onCreateLeadMessageClick'
      )
      .addItem(
        _safeMenuLabel_(function () {
          return Config.MENU_ITEM_HEAD_MESSAGE;
        }, '📨 Tạo tin nhắn Head duyệt'),
        'onCreateHeadMessageClick'
      )
      .addItem(
        _safeMenuLabel_(function () {
          return Config.MENU_ITEM_NEW_TOOL_REQUEST;
        }, '🆕 GỬI TIN NHẮN ĐỀ XUẤT MUA TOOL MỚI'),
        'onCreateNewToolRequestClick'
      )
      .addToUi();
  } catch (error) {
    // Last resort: never leave the spreadsheet without a menu just because
    // Config.gs failed to load or a label getter threw.
    console.error('createAdminMenu: ' + (error && error.message ? error.message : error));
    try {
      SpreadsheetApp.getUi()
        .createMenu('🛠️ Admin Tools')
        .addItem('📄 Generate Request Sheet', 'onGenerateRequestSheetClick')
        .addItem('💬 Tạo tin nhắn Lead duyệt', 'onCreateLeadMessageClick')
        .addItem('📨 Tạo tin nhắn Head duyệt', 'onCreateHeadMessageClick')
        .addItem('🆕 GỬI TIN NHẮN ĐỀ XUẤT MUA TOOL MỚI', 'onCreateNewToolRequestClick')
        .addToUi();
    } catch (fallbackError) {
      console.error(
        'createAdminMenu fallback failed: ' +
          (fallbackError && fallbackError.message ? fallbackError.message : fallbackError)
      );
    }
  }
}

/**
 * Reads a Config menu label; returns `fallback` if Config is missing or throws.
 * @param {function(): string} getter
 * @param {string} fallback
 * @returns {string}
 * @private
 */
function _safeMenuLabel_(getter, fallback) {
  try {
    const value = getter();
    if (value === null || value === undefined || value === '') return fallback;
    return String(value);
  } catch (error) {
    return fallback;
  }
}
