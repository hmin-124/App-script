/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * Global entry-point functions that Google Apps Script needs to call
 * directly (menu item targets, simple triggers). Deliberately kept THIN:
 * all real logic lives in the *Service classes; this file only wires the UI
 * to them and turns errors into user-facing dialogs.
 *
 * ---------------------------------------------------------------------------
 * Extension roadmap (per project spec - add these WITHOUT touching existing
 * files):
 *   - Generate BOKT              -> new BoktService.gs + onGenerateBoktClick()
 *   - Generate Email             -> new EmailService.gs + onSendEmailClick()
 *   - Generate Telegram Message  -> new TelegramService.gs + onSendTelegramClick()
 *   - Generate Approval Message  -> DONE, see MessageService.gs below.
 *   - Export PDF / Export Excel  -> new ExportService.gs + onExportClick()
 *   - Archive Sheet              -> new ArchiveService.gs + onArchiveSheetClick()
 *   - Auto gửi Gmail             -> new GmailService.gs + onSendGmailClick()
 * Each new feature follows the exact same pattern used here: a dedicated
 * *Service class (constructor takes the spreadsheet), a thin global handler
 * in this file, and one extra `.addItem(...)` line in Menu.gs. None of them
 * need to read RequestService.generateRequestSheet()'s summary directly,
 * but they CAN - it already returns { sheetName, toolCount } for reuse.
 * ---------------------------------------------------------------------------
 */

/**
 * Menu handler for "Admin Tools -> Generate Request Sheet". Wraps the whole
 * RequestService flow with error handling so any failure produces a clear
 * dialog for the admin instead of a silent script error.
 */
function onGenerateRequestSheetClick() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const requestService = new RequestService(spreadsheet);
    const result = requestService.generateRequestSheet();

    if (result === null) return; // Admin cancelled the overwrite confirmation.

    Utils.showAlert('Generate Request thành công.', `Tổng số Tool: ${result.toolCount}\n\nSheet: ${result.sheetName}`);
  } catch (error) {
    AppLogger.error(`onGenerateRequestSheetClick: ${error.message}`);

    if (error instanceof UserFacingError) {
      Utils.showAlert('Thông báo', error.message);
    } else {
      Utils.showAlert('Đã xảy ra lỗi', error.message);
    }
  }
}

/**
 * Menu handler for "Admin Tools -> Tạo tin nhắn Lead duyệt". Reads the
 * already-generated (and possibly Admin-edited) request sheet and shows a
 * copyable message grouped by Gia hạn / Mua mới / Topup Credit, per
 * MessageService.buildLeadApprovalMessage().
 */
function onCreateLeadMessageClick() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const messageService = new MessageService(spreadsheet);
    const result = messageService.buildLeadApprovalMessage();

    Utils.showMessageDialog(`Tin nhắn Lead duyệt - ${result.sheetName}`, result.message);
  } catch (error) {
    AppLogger.error(`onCreateLeadMessageClick: ${error.message}`);

    if (error instanceof UserFacingError) {
      Utils.showAlert('Thông báo', error.message);
    } else {
      Utils.showAlert('Đã xảy ra lỗi', error.message);
    }
  }
}

/**
 * Menu handler for "Admin Tools -> Tạo tin nhắn Head duyệt". Reads the same
 * request sheet as the Lead message, but shows a flat list per
 * MessageService.buildHeadApprovalMessage().
 */
function onCreateHeadMessageClick() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const messageService = new MessageService(spreadsheet);
    const result = messageService.buildHeadApprovalMessage();

    Utils.showMessageDialog(`Tin nhắn Head duyệt - ${result.sheetName}`, result.message);
  } catch (error) {
    AppLogger.error(`onCreateHeadMessageClick: ${error.message}`);

    if (error instanceof UserFacingError) {
      Utils.showAlert('Thông báo', error.message);
    } else {
      Utils.showAlert('Đã xảy ra lỗi', error.message);
    }
  }
}
