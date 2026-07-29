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
 * in this file, and one extra `.addItem(...)` line in Menu.gs.
 * ---------------------------------------------------------------------------
 */

/**
 * Menu handler for "Admin Tools -> Generate Request Sheet".
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
 * Menu handler for "Admin Tools -> Tạo tin nhắn Lead duyệt".
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
 * Menu handler for "Admin Tools -> Tạo tin nhắn Head duyệt".
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

// ===========================================================================
// 🛒 Tool Request menu handlers (sheet-based NEW_TOOL_REQUEST workflow)
// ===========================================================================

function setupNewToolRequestTemplate() {
  try {
    new NewToolRequestService(SpreadsheetApp.getActiveSpreadsheet()).setupTemplate();
  } catch (error) {
    AppLogger.error(`setupNewToolRequestTemplate: ${error.message}`);
    Utils.showAlert(error instanceof UserFacingError ? 'Thông báo' : 'Đã xảy ra lỗi', error.message);
  }
}

function previewNewToolRequest() {
  try {
    new NewToolRequestService(SpreadsheetApp.getActiveSpreadsheet()).preview();
  } catch (error) {
    AppLogger.error(`previewNewToolRequest: ${error.message}`);
    Utils.showAlert(error instanceof UserFacingError ? 'Thông báo' : 'Đã xảy ra lỗi', error.message);
  }
}

function sendNewToolRequest() {
  try {
    new NewToolRequestService(SpreadsheetApp.getActiveSpreadsheet()).send({ forceResend: false });
  } catch (error) {
    AppLogger.error(`sendNewToolRequest: ${error.message}`);
    Utils.showAlert(error instanceof UserFacingError ? 'Thông báo' : 'Đã xảy ra lỗi', error.message);
  }
}

function resendNewToolRequest() {
  try {
    new NewToolRequestService(SpreadsheetApp.getActiveSpreadsheet()).resend();
  } catch (error) {
    AppLogger.error(`resendNewToolRequest: ${error.message}`);
    Utils.showAlert(error instanceof UserFacingError ? 'Thông báo' : 'Đã xảy ra lỗi', error.message);
  }
}

function resetNewToolRequestForm() {
  try {
    new NewToolRequestService(SpreadsheetApp.getActiveSpreadsheet()).resetForm();
  } catch (error) {
    AppLogger.error(`resetNewToolRequestForm: ${error.message}`);
    Utils.showAlert(error instanceof UserFacingError ? 'Thông báo' : 'Đã xảy ra lỗi', error.message);
  }
}

/**
 * Pure message builder exposed for tests / reuse. Accepts a normalized data
 * object (already validated + calculateRequestAmounts_ applied).
 * @param {Object} data
 * @returns {string}
 */
function buildNewToolRequestMessage(data) {
  return NewToolRequestService.buildNewToolRequestMessage(data);
}
