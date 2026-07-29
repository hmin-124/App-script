/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * Entry points: onOpen menu, installable onEdit handler, trigger install/remove.
 *
 * IMPORTANT: Use installable trigger pointing at handleToolRequestEdit
 * (not the simple onEdit). Installable triggers can use LockService,
 * Session email, and are not subject to simple-trigger auth limits.
 */

/**
 * Simple trigger — builds the custom menus when the spreadsheet opens.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu(CONFIG.MENU.NAME)
    .addItem(CONFIG.MENU.ITEMS.SYNC_SELECTED, 'syncSelectedRows')
    .addItem(CONFIG.MENU.ITEMS.SYNC_ALL, 'syncAllToolRequests')
    .addSeparator()
    .addItem(CONFIG.MENU.ITEMS.CHECK_DUPLICATES, 'checkDuplicateIds')
    .addItem(CONFIG.MENU.ITEMS.VIEW_LOG, 'viewSyncLog')
    .addSeparator()
    .addItem(CONFIG.MENU.ITEMS.INSTALL_TRIGGER, 'installSyncTrigger')
    .addItem(CONFIG.MENU.ITEMS.REMOVE_TRIGGERS, 'removeSyncTriggers')
    .addToUi();

  // Admin Tool: tin nhắn trình duyệt Lead/Head trên sheet 2026 (tick cột B).
  ui.createMenu(CONFIG.ADMIN_MENU.NAME)
    .addItem(CONFIG.ADMIN_MENU.ITEMS.LEAD_RENEW, 'buildLeadRenewMessage')
    .addItem(CONFIG.ADMIN_MENU.ITEMS.HEAD_RENEW, 'buildHeadRenewMessage')
    .addSeparator()
    .addItem(CONFIG.ADMIN_MENU.ITEMS.LEAD_NEW, 'buildLeadNewToolMessage')
    .addItem(CONFIG.ADMIN_MENU.ITEMS.HEAD_NEW, 'buildHeadNewToolMessage')
    .addToUi();
}

/**
 * Installable onEdit handler (wired by installSyncTrigger).
 * Processes single-cell edits and multi-row pastes via e.range.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 */
function handleToolRequestEdit(e) {
  try {
    if (!e || !e.range) return;

    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SOURCE_SHEET_NAME) return;

    const startRow = e.range.getRow();
    const numRows = e.range.getNumRows();
    const startCol = e.range.getColumn();
    const numCols = e.range.getNumColumns();
    const endCol = startCol + numCols - 1;
    const endRow = startRow + numRows - 1;

    // Ignore header / spacer rows above data.
    if (endRow < CONFIG.SOURCE_DATA_START_ROW) return;

    // Ignore edits outside A:U.
    const maxCol = CONFIG.SOURCE_LAST_COL_INDEX + 1; // 1-indexed
    if (startCol > maxCol) return;
    if (endCol < 1) return;

    const rows = [];
    for (let r = startRow; r <= endRow; r++) {
      if (r >= CONFIG.SOURCE_DATA_START_ROW) rows.push(r);
    }
    if (!rows.length) return;

    // Trigger path: never show blocking UI popups.
    syncSourceRows_(rows, { showUi: false, validateHeaders: true });
  } catch (err) {
    // Last-resort logging — never throw out of a trigger uncaught without log.
    const info = describeError_(err);
    console.error(info.message, info.stack);
    try {
      writeSyncLogs_([
        buildLogEntry_({
          action: CONFIG.ACTIONS.ERROR,
          result: CONFIG.RESULTS.FAILED,
          detail: `handleToolRequestEdit: ${info.message}\n${info.stack}`,
        }),
      ]);
    } catch (logErr) {
      console.error(logErr);
    }
  }
}

/**
 * Create (or recreate) the installable onEdit trigger for handleToolRequestEdit.
 */
function installSyncTrigger() {
  try {
    removeSyncTriggers_(false);

    ScriptApp.newTrigger(CONFIG.TRIGGER_HANDLER_NAME)
      .forSpreadsheet(getSpreadsheet_())
      .onEdit()
      .create();

    writeSyncLogs_([
      buildLogEntry_({
        action: 'SETUP',
        result: CONFIG.RESULTS.SUCCESS,
        detail: `Đã cài installable onEdit → ${CONFIG.TRIGGER_HANDLER_NAME}`,
      }),
    ]);

    notifyUser_(
      true,
      'Cài đặt trigger',
      `Đã cài installable onEdit trigger cho hàm "${CONFIG.TRIGGER_HANDLER_NAME}".\n` +
        'Nếu đây là lần đầu, hãy chấp nhận quyền OAuth khi được hỏi.'
    );
  } catch (err) {
    notifyUser_(true, 'Lỗi cài trigger', describeError_(err).message);
  }
}

/**
 * Menu wrapper: remove all installable triggers for this handler.
 */
function removeSyncTriggers() {
  try {
    const removed = removeSyncTriggers_(true);
    notifyUser_(
      true,
      'Xóa trigger',
      removed > 0
        ? `Đã xóa ${removed} trigger liên quan tới "${CONFIG.TRIGGER_HANDLER_NAME}".`
        : 'Không tìm thấy trigger nào để xóa.'
    );
  } catch (err) {
    notifyUser_(true, 'Lỗi xóa trigger', describeError_(err).message);
  }
}

/**
 * @param {boolean} writeLog
 * @returns {number} number of triggers deleted
 */
function removeSyncTriggers_(writeLog) {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  triggers.forEach((trigger) => {
    if (trigger.getHandlerFunction() === CONFIG.TRIGGER_HANDLER_NAME) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });

  if (writeLog) {
    writeSyncLogs_([
      buildLogEntry_({
        action: 'SETUP',
        result: CONFIG.RESULTS.SUCCESS,
        detail: `Đã xóa ${removed} trigger(s) cho ${CONFIG.TRIGGER_HANDLER_NAME}`,
      }),
    ]);
  }
  return removed;
}
