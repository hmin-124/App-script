/**
 * Menu.gs
 * ---------------------------------------------------------------------------
 * Builds the "Admin Tools" custom menu. Kept separate from Code.gs so the
 * menu STRUCTURE (labels, items, ordering) can be extended independently
 * from the handler LOGIC that each item triggers.
 *
 * Extending the menu later (see the roadmap in Code.gs) is just one more
 * `.addItem(...)` line here plus one new handler function in Code.gs - no
 * existing code needs to change.
 */

/**
 * Simple trigger: runs automatically whenever the spreadsheet is opened.
 * Google Apps Script recognizes the name "onOpen" as a special trigger, so
 * this function cannot be a class method.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu(Config.MENU_NAME)
      .addItem(Config.MENU_ITEM_GENERATE, 'onGenerateRequestSheetClick')
      // Future menu items can be appended here, e.g.:
      // .addItem('Generate BOKT', 'onGenerateBoktClick')
      // .addItem('Archive Sheet', 'onArchiveSheetClick')
      .addToUi();
  } catch (error) {
    console.error(`onOpen: ${error.message}`);
  }
}
