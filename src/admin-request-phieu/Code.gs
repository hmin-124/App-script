/**
 * Code.gs
 * ---------------------------------------------------------------------------
 * Global entry-point functions that Google Apps Script needs to call
 * directly (menu item targets, simple triggers). Deliberately kept THIN:
 * all real logic lives in the *Service classes; this file only wires the UI
 * to them and turns errors into user-facing dialogs.
 *
 * If the custom menu is missing after deploy: open Apps Script → select
 * function createAdminMenu → Run (authorize if prompted) → reload the Sheet.
 */

/**
 * Menu handler for "Admin Tools -> Generate Request Sheet".
 * Creates sheet "Request Tool mới T{n}.{yyyy}" from ticked tools on QUẢN LÝ TOOLS.
 */
function onGenerateRequestSheetClick() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw new UserFacingError(
        'Không lấy được spreadsheet đang mở. Hãy mở file Google Sheet rồi chạy từ menu 🛠️ Admin Tools (không Run từ editor độc lập).'
      );
    }

    const requestService = new RequestService(spreadsheet);
    const result = requestService.generateRequestSheet();

    if (result === null) {
      Utils.showAlert('Đã hủy', 'Không tạo/ghi đè sheet Request (bạn đã chọn Không ghi đè).');
      return;
    }

    Utils.showAlert('Generate Request thành công.', `Tổng số Tool: ${result.toolCount}\n\nSheet: ${result.sheetName}`);
  } catch (error) {
    AppLogger.error(`onGenerateRequestSheetClick: ${error.message}`);

    try {
      if (error instanceof UserFacingError) {
        Utils.showAlert('Thông báo', error.message);
      } else {
        Utils.showAlert('Đã xảy ra lỗi', error.message);
      }
    } catch (uiError) {
      // UI unavailable (typical when pressing Run inside the Apps Script
      // editor) — error is already in Execution log via AppLogger / showAlert.
      AppLogger.error(`onGenerateRequestSheetClick UI notify failed: ${uiError.message}`);
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

/**
 * Menu handler for "Admin Tools -> GỬI TIN NHẮN ĐỀ XUẤT MUA TOOL MỚI".
 * Reads the generated "Request Tool mới T{n}.{yyyy}" sheet and shows a
 * copyable proposal message (one block per tool row).
 */
function onCreateNewToolRequestClick() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    new NewToolRequestService(spreadsheet).createProposalMessages();
  } catch (error) {
    AppLogger.error(`onCreateNewToolRequestClick: ${error.message}`);

    if (error instanceof UserFacingError) {
      Utils.showAlert('Thông báo', error.message);
    } else {
      Utils.showAlert('Đã xảy ra lỗi', error.message);
    }
  }
}

/**
 * Pure message builder exposed for tests.
 * @param {Object} tool
 * @param {number} month
 * @param {number} year
 * @returns {string}
 */
function buildNewToolRequestMessage(tool, month, year) {
  return NewToolRequestService.buildMessage(tool, month, year);
}
