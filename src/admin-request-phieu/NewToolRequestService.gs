/**
 * NewToolRequestService.gs
 * ---------------------------------------------------------------------------
 * Sheet-based "Request mua Tool mới" workflow:
 *   1. Admin fills NEW_TOOL_REQUEST (A=label, B=value, C=example).
 *   2. Preview Request → validate + show copyable message (no Chat send).
 *   3. Send Request → validate, anti-duplicate, Google Chat webhook, log.
 *   4. Resend Request → same as Send after explicit confirmation.
 *   5. Reset Form → clear inputs only; restore VAT/Status defaults + formulas.
 *   6. Setup Template → create form + log sheets with validation/format.
 *
 * Webhook URLs live in Script Properties (keyed by "Chat Webhook Key"),
 * never hard-coded. All Spreadsheet reads/writes are batched.
 */

class NewToolRequestService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  // =====================================================================
  // Public flows
  // =====================================================================

  /** Creates / refreshes NEW_TOOL_REQUEST + NEW_TOOL_REQUEST_LOG templates. */
  setupTemplate() {
    try {
      const formExists = Boolean(this.spreadsheet.getSheetByName(Config.NEW_TOOL_FORM_SHEET_NAME));
      const logExists = Boolean(this.spreadsheet.getSheetByName(Config.NEW_TOOL_LOG_SHEET_NAME));

      if (formExists || logExists) {
        const confirmed = Utils.showConfirm(
          'Setup Template',
          'Sheet form/log đã tồn tại. Tiếp tục sẽ tạo lại layout (dữ liệu Value hiện tại trên form có thể bị ghi đè). Bạn có muốn tiếp tục?'
        );
        if (!confirmed) return;
      }

      this._setupFormSheet();
      this._setupLogSheet();
      SpreadsheetApp.flush();
      Utils.showAlert(
        'Setup Template thành công',
        `Đã sẵn sàng:\n- ${Config.NEW_TOOL_FORM_SHEET_NAME}\n- ${Config.NEW_TOOL_LOG_SHEET_NAME}\n\nNhập liệu ở cột Value, rồi dùng menu 🛒 Tool Request.`
      );
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.setupTemplate');
    }
  }

  /**
   * Validates the form and shows a preview dialog (does NOT send Chat).
   * @returns {{message:string, data:Object}}
   */
  preview() {
    try {
      const data = this.readRequestForm_();
      this.validateRequestData_(data, { checkWebhook: false, checkDuplicate: false, allowResend: true });
      this.calculateRequestAmounts_(data);
      const message = NewToolRequestService.buildNewToolRequestMessage(data);
      this.showPreviewDialog_(message);
      AppLogger.info(`NewToolRequestService.preview: Request ID ${data.requestId}`);
      return { message, data };
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.preview');
    }
  }

  /**
   * Validates, sends to Google Chat, updates Status / log.
   * @param {{forceResend?:boolean}} [options]
   * @returns {{messageId:string, httpStatus:number}}
   */
  send(options = {}) {
    const forceResend = Boolean(options.forceResend);
    const lock = LockService.getDocumentLock();
    try {
      lock.waitLock(30000);

      const data = this.readRequestForm_();
      this.validateRequestData_(data, {
        checkWebhook: true,
        checkDuplicate: !forceResend,
        allowResend: forceResend,
      });
      this.calculateRequestAmounts_(data);

      const messageId = forceResend && data.messageId ? data.messageId : this.generateMessageId_();
      data.messageId = messageId;
      const message = NewToolRequestService.buildNewToolRequestMessage(data);
      const webhookUrl = this.getWebhookUrl_(data.chatWebhookKey);

      let httpStatus = 0;
      let responseBody = '';
      try {
        const response = this.sendGoogleChatMessage_(message, webhookUrl);
        httpStatus = response.getResponseCode();
        responseBody = response.getContentText();
      } catch (fetchError) {
        this.updateRequestStatus_(Config.NEW_TOOL_STATUS.ERROR, '', messageId);
        this.writeRequestLog_({
          data,
          message,
          status: Config.NEW_TOOL_STATUS.ERROR,
          httpStatus: 0,
          errorMessage: fetchError.message,
        });
        throw new UserFacingError(
          `Không thể gửi đề xuất mua Tool.\n\nLý do: Lỗi kết nối Google Chat (${fetchError.message}).`
        );
      }

      if (httpStatus < 200 || httpStatus > 299) {
        const safeBody = String(responseBody || '').slice(0, 300);
        this.updateRequestStatus_(Config.NEW_TOOL_STATUS.ERROR, '', messageId);
        this.writeRequestLog_({
          data,
          message,
          status: Config.NEW_TOOL_STATUS.ERROR,
          httpStatus,
          errorMessage: safeBody,
        });
        AppLogger.error(
          `NewToolRequestService.send: HTTP ${httpStatus} for Request ID ${data.requestId}. Body: ${safeBody}`
        );
        throw new UserFacingError(
          `Không thể gửi đề xuất mua Tool.\n\nLý do: Google Chat trả về HTTP ${httpStatus}.`
        );
      }

      const sentAt = new Date();
      this.updateRequestStatus_(Config.NEW_TOOL_STATUS.SENT, sentAt, messageId);
      this.writeRequestLog_({
        data,
        message,
        status: Config.NEW_TOOL_STATUS.SENT,
        httpStatus,
        errorMessage: '',
        timestamp: sentAt,
      });
      SpreadsheetApp.flush();

      Utils.showAlert(
        'Gửi đề xuất thành công',
        `Request ID: ${data.requestId}\nMessage ID: ${messageId}\nHTTP: ${httpStatus}`
      );
      AppLogger.info(`NewToolRequestService.send: sent Request ID ${data.requestId}, Message ID ${messageId}`);
      return { messageId, httpStatus };
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.send');
    } finally {
      try {
        lock.releaseLock();
      } catch (lockError) {
        AppLogger.warning(`NewToolRequestService.send: releaseLock failed: ${lockError.message}`);
      }
    }
  }

  /** Resend after Yes/No confirmation (bypasses Status=Sent guard). */
  resend() {
    try {
      const confirmed = Utils.showConfirm(
        'Resend Request',
        'Request có thể đã được gửi trước đó. Bạn có chắc muốn gửi LẠI tin nhắn này lên Google Chat?'
      );
      if (!confirmed) return null;
      return this.send({ forceResend: true });
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.resend');
    }
  }

  /** Clears input cells only; restores VAT default, Draft status, formulas. */
  resetForm() {
    try {
      const confirmed = Utils.showConfirm(
        'Reset Form',
        'Xóa toàn bộ dữ liệu nhập trên form? (Label / công thức / format được giữ nguyên.)'
      );
      if (!confirmed) return;

      const sheet = this._getFormSheet();
      const fields = Config.NEW_TOOL_FORM_FIELDS;
      const firstRow = fields[0].row;
      const lastRow = fields[fields.length - 1].row;
      const height = lastRow - firstRow + 1;
      const values = sheet.getRange(firstRow, 2, height, 1).getValues();

      fields.forEach((field, index) => {
        if (field.kind === 'input') {
          if (field.key === 'vatRate') {
            values[index][0] = '10%';
          } else if (field.key === 'brandProject') {
            values[index][0] = Config.NEW_TOOL_DEFAULT_BRAND;
          } else if (field.key === 'currency') {
            values[index][0] = Config.NEW_TOOL_DEFAULT_CURRENCY;
          } else {
            values[index][0] = '';
          }
        } else if (field.kind === 'system') {
          if (field.key === 'status') values[index][0] = Config.NEW_TOOL_STATUS.DRAFT;
          else values[index][0] = '';
        }
        // computed cells keep formulas — rewritten below via setFormulas
      });

      sheet.getRange(firstRow, 2, height, 1).setValues(values);
      this._applyComputedFormulas(sheet);
      SpreadsheetApp.flush();
      Utils.showToast('Đã reset form NEW_TOOL_REQUEST.', Config.TOOL_REQUEST_MENU_NAME);
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.resetForm');
    }
  }

  // =====================================================================
  // Form I/O
  // =====================================================================

  /**
   * Reads the whole form value column in ONE getValues() call.
   * @returns {Object}
   */
  readRequestForm_() {
    const sheet = this._getFormSheet();
    const fields = Config.NEW_TOOL_FORM_FIELDS;
    const firstRow = fields[0].row;
    const lastRow = fields[fields.length - 1].row;
    const height = lastRow - firstRow + 1;
    const values = sheet.getRange(firstRow, 2, height, 1).getValues();

    const data = {};
    fields.forEach((field, index) => {
      data[field.key] = values[index][0];
    });

    data.department = String(data.department || '').trim();
    data.requestTitle = String(data.requestTitle || '').trim();
    data.requestId = String(data.requestId || '').trim();
    data.toolName = String(data.toolName || '').trim();
    data.toolFeatures = String(data.toolFeatures || '').trim();
    data.packageInformation = String(data.packageInformation || '').trim();
    data.brandProject = String(data.brandProject || '').trim();
    data.currency = String(data.currency || '').trim().toUpperCase();
    data.paymentMethod = String(data.paymentMethod || '').trim();
    data.accountNumber = String(data.accountNumber || '').trim();
    data.recipientName = String(data.recipientName || '').trim();
    data.bankName = String(data.bankName || '').trim();
    data.paymentNote = String(data.paymentNote || '').trim();
    data.businessPurpose = String(data.businessPurpose || '').trim();
    data.approverName = String(data.approverName || '').trim();
    data.requesterName = String(data.requesterName || '').trim();
    data.chatWebhookKey = String(data.chatWebhookKey || '').trim();
    data.status = String(data.status || '').trim() || Config.NEW_TOOL_STATUS.DRAFT;
    data.messageId = String(data.messageId || '').trim();
    data.basePrice = NewToolRequestService._toNumber(data.basePrice);
    data.vatRate = NewToolRequestService._parseVatRate(data.vatRate);
    data.deploymentStartDate = NewToolRequestService._toDate(data.deploymentStartDate);
    data.deploymentEndDate = NewToolRequestService._toDate(data.deploymentEndDate);

    return data;
  }

  /**
   * @param {Object} data
   * @param {{checkWebhook?:boolean, checkDuplicate?:boolean, allowResend?:boolean}} [options]
   */
  validateRequestData_(data, options = {}) {
    const checkWebhook = options.checkWebhook !== false;
    const checkDuplicate = options.checkDuplicate !== false;
    const allowResend = Boolean(options.allowResend);

    const missing = [];
    const requiredLabels = {
      department: 'Department / Team',
      requestTitle: 'Request Title',
      requestId: 'Request ID',
      toolName: 'Tool Name',
      toolFeatures: 'Tool Features',
      packageInformation: 'Package Information',
      brandProject: 'Brand / Project',
      currency: 'Currency',
      paymentMethod: 'Payment Method',
      businessPurpose: 'Business Purpose / Note',
      requesterName: 'Requester Name',
      chatWebhookKey: 'Chat Webhook Key',
    };

    Object.keys(requiredLabels).forEach((key) => {
      if (!data[key]) missing.push(requiredLabels[key]);
    });

    if (!(data.deploymentStartDate instanceof Date) || Number.isNaN(data.deploymentStartDate.getTime())) {
      missing.push('Deployment Start Date');
    }
    if (!(data.deploymentEndDate instanceof Date) || Number.isNaN(data.deploymentEndDate.getTime())) {
      missing.push('Deployment End Date');
    }
    if (!(data.basePrice > 0)) missing.push('Base Price (> 0)');
    if (data.vatRate === null || data.vatRate === undefined || Number.isNaN(data.vatRate)) {
      missing.push('VAT Rate');
    }

    if (missing.length > 0) {
      throw new UserFacingError(`Không thể gửi đề xuất mua Tool.\n\nLý do: Thiếu hoặc không hợp lệ: ${missing.join(', ')}.`);
    }

    if (data.vatRate < 0 || data.vatRate > 1) {
      throw new UserFacingError('Không thể gửi đề xuất mua Tool.\n\nLý do: VAT Rate phải từ 0% đến 100%.');
    }

    if (data.deploymentEndDate.getTime() < data.deploymentStartDate.getTime()) {
      throw new UserFacingError(
        'Không thể gửi đề xuất mua Tool.\n\nLý do: Deployment End Date không được nhỏ hơn Start Date.'
      );
    }

    if (!allowResend && data.status === Config.NEW_TOOL_STATUS.SENT) {
      throw new UserFacingError(
        `Không thể gửi đề xuất mua Tool.\n\nLý do: Status đang là Sent. Dùng "Resend Request" nếu muốn gửi lại.`
      );
    }

    if (checkDuplicate && this.isDuplicateRequest_(data.requestId, data.messageId)) {
      throw new UserFacingError(
        `Không thể gửi đề xuất mua Tool.\n\nLý do: Request ID ${data.requestId} đã được gửi trước đó.`
      );
    }

    if (checkWebhook) {
      this.getWebhookUrl_(data.chatWebhookKey); // throws UserFacingError if missing
    }
  }

  /** Mutates data with vatAmount, totalAmount, deploymentDuration. */
  calculateRequestAmounts_(data) {
    const vatAmount = data.basePrice * data.vatRate;
    const totalAmount = data.basePrice + vatAmount;
    data.vatAmount = vatAmount;
    data.totalAmount = totalAmount;

    const msPerDay = 24 * 60 * 60 * 1000;
    const start = NewToolRequestService._dateOnly(data.deploymentStartDate);
    const end = NewToolRequestService._dateOnly(data.deploymentEndDate);
    data.deploymentDuration = Math.round((end - start) / msPerDay) + 1;
    return data;
  }

  /**
   * Pure message builder (also exposed as global buildNewToolRequestMessage).
   * @param {Object} data
   * @returns {string}
   */
  static buildNewToolRequestMessage(data) {
    const currency = data.currency;
    const vatPercentDisplay = NewToolRequestService._formatVatPercent(data.vatRate);
    const lines = [];

    lines.push(`[${data.department}] ${data.requestTitle}`);
    lines.push('');
    lines.push(`ID phiếu: ${data.requestId}`);
    lines.push('');
    lines.push(`Tên Tool: ${data.toolName}`);
    lines.push('');
    lines.push('Tính năng / Mục đích:');
    lines.push(data.toolFeatures);
    lines.push('');
    lines.push(
      `Thời gian triển khai: Từ ${NewToolRequestService.formatDate_(data.deploymentStartDate)} - ${NewToolRequestService.formatDate_(data.deploymentEndDate)}`
    );
    lines.push(`Thời lượng triển khai: ${data.deploymentDuration} ngày`);
    lines.push('');
    lines.push(`Brand triển khai: ${data.brandProject}`);
    lines.push('');
    lines.push(`Thông tin gói: ${data.packageInformation}`);
    lines.push('');
    lines.push(`Price: ${NewToolRequestService.formatMoney_(data.basePrice)} ${currency}`);
    lines.push('');
    lines.push(`GTGT (${vatPercentDisplay}%): ${NewToolRequestService.formatMoney_(data.vatAmount)} ${currency}`);
    lines.push('');
    lines.push(`TOTAL: ${NewToolRequestService.formatMoney_(data.totalAmount)} ${currency}`);
    lines.push('');
    lines.push('__________');
    lines.push('');
    lines.push(`Hình thức thanh toán: ${data.paymentMethod}`);
    lines.push('');

    if (data.accountNumber) {
      lines.push(`STK / Wallet: ${data.accountNumber}`);
      lines.push('');
    }
    if (data.recipientName) {
      lines.push(`Tên người nhận: ${data.recipientName}`);
      lines.push('');
    }
    if (data.bankName) {
      lines.push(`Tên ngân hàng / Network: ${data.bankName}`);
      lines.push('');
    }
    if (data.paymentNote) {
      lines.push(`Nội dung thanh toán: ${data.paymentNote}`);
      lines.push('');
    }

    lines.push(`Note: ${data.businessPurpose}`);
    lines.push('');

    if (data.approverName) {
      lines.push(`Nhờ ${data.approverName} duyệt giúp em đề xuất mua Tool mới này ạ.`);
    } else {
      lines.push('Nhờ anh duyệt giúp em đề xuất mua Tool mới này ạ.');
    }
    lines.push('');
    lines.push('Cám ơn anh!');

    return lines.join('\n');
  }

  // =====================================================================
  // Chat / Properties / Log / Status
  // =====================================================================

  /**
   * @param {string} message
   * @param {string} webhookUrl
   * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse}
   */
  sendGoogleChatMessage_(message, webhookUrl) {
    return UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: message }),
      muteHttpExceptions: true,
    });
  }

  /**
   * @param {string} webhookKey
   * @returns {string}
   */
  getWebhookUrl_(webhookKey) {
    const key = String(webhookKey || '').trim();
    if (!key) {
      throw new UserFacingError(
        'Không thể gửi đề xuất mua Tool.\n\nLý do: Chat Webhook Key đang trống.'
      );
    }
    const url = PropertiesService.getScriptProperties().getProperty(key);
    if (!url) {
      throw new UserFacingError(
        `Không thể gửi đề xuất mua Tool.\n\nLý do: Chat Webhook chưa được cấu hình cho key ${key}.`
      );
    }
    return url;
  }

  /**
   * @param {string} requestId
   * @param {string} messageId
   * @returns {boolean}
   */
  isDuplicateRequest_(requestId, messageId) {
    const logSheet = this.spreadsheet.getSheetByName(Config.NEW_TOOL_LOG_SHEET_NAME);
    if (!logSheet || logSheet.getLastRow() < 2) return false;

    const lastRow = logSheet.getLastRow();
    // Columns: Timestamp, Message ID, Request ID, ... Status (13)
    const values = logSheet.getRange(2, 1, lastRow - 1, 13).getValues();
    const targetRequestId = String(requestId || '').trim();
    const targetMessageId = String(messageId || '').trim();

    return values.some((row) => {
      const rowMessageId = String(row[1] || '').trim();
      const rowRequestId = String(row[2] || '').trim();
      const rowStatus = String(row[12] || '').trim();
      if (targetMessageId && rowMessageId === targetMessageId && rowStatus === Config.NEW_TOOL_STATUS.SENT) {
        return true;
      }
      if (targetRequestId && rowRequestId === targetRequestId && rowStatus === Config.NEW_TOOL_STATUS.SENT) {
        return true;
      }
      return false;
    });
  }

  /**
   * @param {{data:Object, message:string, status:string, httpStatus:number, errorMessage:string, timestamp?:Date}} logData
   */
  writeRequestLog_(logData) {
    const sheet = this._ensureLogSheet();
    const data = logData.data;
    const timestamp = logData.timestamp || new Date();
    const row = [
      timestamp,
      data.messageId || '',
      data.requestId || '',
      data.department || '',
      data.toolName || '',
      data.packageInformation || '',
      data.basePrice,
      data.vatAmount,
      data.totalAmount,
      data.currency || '',
      data.paymentMethod || '',
      data.requesterName || '',
      logData.status,
      logData.httpStatus,
      logData.errorMessage || '',
      logData.message || '',
    ];
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
  }

  /**
   * Batch-updates Status / Sent At / Message ID cells.
   * @param {string} status
   * @param {Date|string} sentAt
   * @param {string} messageId
   */
  updateRequestStatus_(status, sentAt, messageId) {
    const sheet = this._getFormSheet();
    const byKey = NewToolRequestService._fieldIndexByKey();
    const statusRow = byKey.status.row;
    const sentAtRow = byKey.sentAt.row;
    const messageIdRow = byKey.messageId.row;

    // Contiguous block rows 27-29 → one setValues
    const minRow = Math.min(statusRow, sentAtRow, messageIdRow);
    const maxRow = Math.max(statusRow, sentAtRow, messageIdRow);
    const height = maxRow - minRow + 1;
    const block = sheet.getRange(minRow, 2, height, 1).getValues();
    block[statusRow - minRow][0] = status;
    block[sentAtRow - minRow][0] =
      sentAt instanceof Date ? NewToolRequestService.formatDateTime_(sentAt) : sentAt || '';
    block[messageIdRow - minRow][0] = messageId || '';
    sheet.getRange(minRow, 2, height, 1).setValues(block);
  }

  /** @returns {string} */
  generateMessageId_() {
    return Utilities.getUuid();
  }

  /** @param {number} value @returns {string} */
  static formatMoney_(value) {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return String(value);
    return numeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** @param {Date} date @returns {string} */
  static formatDate_(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    try {
      const tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
      return Utilities.formatDate(date, tz, Config.NEW_TOOL_DATE_FORMAT);
    } catch (error) {
      return Utils.formatDateDDMMYYYY(date);
    }
  }

  /** @param {Date} date @returns {string} */
  static formatDateTime_(date) {
    try {
      const tz = Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';
      return Utilities.formatDate(date, tz, `${Config.NEW_TOOL_DATE_FORMAT} HH:mm:ss`);
    } catch (error) {
      return String(date);
    }
  }

  /** @param {string} message */
  showPreviewDialog_(message) {
    try {
      const template = HtmlService.createTemplateFromFile('NewToolRequestPreview');
      template.message = message;
      const output = template.evaluate().setWidth(560).setHeight(560);
      SpreadsheetApp.getUi().showModalDialog(output, '🛒 Preview Request');
    } catch (fileError) {
      // Fallback when HTML file is not present in the Apps Script project yet.
      AppLogger.warning(`showPreviewDialog_ template file missing, fallback dialog: ${fileError.message}`);
      Utils.showMessageDialog('🛒 Preview Request', message);
    }
  }

  // =====================================================================
  // Template setup (private)
  // =====================================================================

  _setupFormSheet() {
    let sheet = this.spreadsheet.getSheetByName(Config.NEW_TOOL_FORM_SHEET_NAME);
    if (!sheet) {
      sheet = this.spreadsheet.insertSheet(Config.NEW_TOOL_FORM_SHEET_NAME);
    } else {
      sheet.clear();
    }

    sheet.getRange(1, 1, 1, 3).merge().setValue('🛒 NEW TOOL REQUEST FORM').setFontWeight('bold').setFontSize(14);
    sheet.getRange(2, 1, 1, 3).setValues([['Field', 'Value', 'Description / Example']]);
    sheet.getRange(2, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');

    const fields = Config.NEW_TOOL_FORM_FIELDS;
    const labels = fields.map((field) => [field.label]);
    const values = fields.map((field) => {
      if (field.key === 'vatRate') return ['10%'];
      if (field.key === 'status') return [Config.NEW_TOOL_STATUS.DRAFT];
      if (Object.prototype.hasOwnProperty.call(field, 'defaultValue') && field.kind === 'input') {
        return [field.defaultValue];
      }
      return [''];
    });
    const examples = fields.map((field) => [field.example || '']);

    const firstRow = fields[0].row;
    const height = fields.length;
    sheet.getRange(firstRow, 1, height, 1).setValues(labels).setFontWeight('bold');
    sheet.getRange(firstRow, 2, height, 1).setValues(values);
    sheet.getRange(firstRow, 3, height, 1).setValues(examples).setFontColor('#5f6368');

    this._applyComputedFormulas(sheet);
    this._applyFormValidations(sheet);
    this._applyFormFormats(sheet);

    sheet.setColumnWidth(1, 220);
    sheet.setColumnWidth(2, 360);
    sheet.setColumnWidth(3, 360);
    sheet.setFrozenRows(2);
    sheet.getRange(firstRow, 2, height, 1).setBackground('#fffde7');
    // System + computed slightly different tint
    fields.forEach((field) => {
      if (field.kind !== 'input') {
        sheet.getRange(field.row, 2).setBackground('#f1f3f4');
      }
    });
  }

  _setupLogSheet() {
    let sheet = this.spreadsheet.getSheetByName(Config.NEW_TOOL_LOG_SHEET_NAME);
    if (!sheet) {
      sheet = this.spreadsheet.insertSheet(Config.NEW_TOOL_LOG_SHEET_NAME);
    }
    const headers = Config.NEW_TOOL_LOG_HEADERS;
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
    sheet.setFrozenRows(1);
  }

  _applyComputedFormulas(sheet) {
    const byKey = NewToolRequestService._fieldIndexByKey();
    const start = byKey.deploymentStartDate.row;
    const end = byKey.deploymentEndDate.row;
    const price = byKey.basePrice.row;
    const vat = byKey.vatRate.row;
    const vatAmount = byKey.vatAmount.row;
    const total = byKey.totalAmount.row;
    const duration = byKey.deploymentDuration.row;

    // VAT Rate is stored as dropdown text ("10%") so the sheet formula must
    // coerce it; script-side calculateRequestAmounts_ parses independently.
    const vatFraction = `IF(ISNUMBER(B${vat}),IF(B${vat}>1,B${vat}/100,B${vat}),VALUE(SUBSTITUTE(B${vat},"%",""))/100)`;
    sheet.getRange(duration, 2).setFormula(`=IF(OR(B${start}="",B${end}=""),"",B${end}-B${start}+1)`);
    sheet.getRange(vatAmount, 2).setFormula(`=IF(OR(B${price}="",B${vat}=""),"",B${price}*(${vatFraction}))`);
    sheet.getRange(total, 2).setFormula(`=IF(B${price}="","",B${price}+B${vatAmount})`);
  }

  _applyFormValidations(sheet) {
    const byKey = NewToolRequestService._fieldIndexByKey();
    const currencyRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Config.NEW_TOOL_CURRENCIES, true)
      .setAllowInvalid(false)
      .build();
    const paymentRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Config.NEW_TOOL_PAYMENT_METHODS, true)
      .setAllowInvalid(false)
      .build();
    const vatRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Config.NEW_TOOL_VAT_RATE_LABELS, true)
      .setAllowInvalid(false)
      .build();
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(
        [Config.NEW_TOOL_STATUS.DRAFT, Config.NEW_TOOL_STATUS.SENT, Config.NEW_TOOL_STATUS.ERROR],
        true
      )
      .setAllowInvalid(false)
      .build();

    sheet.getRange(byKey.currency.row, 2).setDataValidation(currencyRule);
    sheet.getRange(byKey.paymentMethod.row, 2).setDataValidation(paymentRule);
    sheet.getRange(byKey.vatRate.row, 2).setDataValidation(vatRule);
    sheet.getRange(byKey.status.row, 2).setDataValidation(statusRule);
  }

  _applyFormFormats(sheet) {
    const byKey = NewToolRequestService._fieldIndexByKey();
    sheet.getRange(byKey.deploymentStartDate.row, 2).setNumberFormat(Config.NEW_TOOL_DATE_FORMAT);
    sheet.getRange(byKey.deploymentEndDate.row, 2).setNumberFormat(Config.NEW_TOOL_DATE_FORMAT);
    sheet.getRange(byKey.basePrice.row, 2).setNumberFormat('#,##0.00');
    sheet.getRange(byKey.vatAmount.row, 2).setNumberFormat('#,##0.00');
    sheet.getRange(byKey.totalAmount.row, 2).setNumberFormat('#,##0.00');
    sheet.getRange(byKey.vatRate.row, 2).setNumberFormat('@'); // text: "10%"
    sheet.getRange(byKey.deploymentDuration.row, 2).setNumberFormat('0');
  }

  _getFormSheet() {
    const sheet = this.spreadsheet.getSheetByName(Config.NEW_TOOL_FORM_SHEET_NAME);
    if (!sheet) {
      throw new UserFacingError(
        `Không tìm thấy sheet "${Config.NEW_TOOL_FORM_SHEET_NAME}". Chạy menu 🛒 Tool Request → Setup Template trước.`
      );
    }
    return sheet;
  }

  _ensureLogSheet() {
    let sheet = this.spreadsheet.getSheetByName(Config.NEW_TOOL_LOG_SHEET_NAME);
    if (!sheet) {
      this._setupLogSheet();
      sheet = this.spreadsheet.getSheetByName(Config.NEW_TOOL_LOG_SHEET_NAME);
    }
    return sheet;
  }

  static _fieldIndexByKey() {
    const map = {};
    Config.NEW_TOOL_FORM_FIELDS.forEach((field) => {
      map[field.key] = field;
    });
    return map;
  }

  static _toNumber(value) {
    if (typeof value === 'number') return value;
    if (value === '' || value === null || value === undefined) return 0;
    const cleaned = String(value).replace(/,/g, '').trim();
    const numeric = Number(cleaned);
    return Number.isNaN(numeric) ? 0 : numeric;
  }

  /**
   * Accepts 0.1, 10, "10%", "0.1".
   * @param {*} value
   * @returns {number|null}
   */
  static _parseVatRate(value) {
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value === 'number') {
      // Sheets percent cells return 0.1 for 10%. Plain "10" typed without % → 10.
      return value > 1 ? value / 100 : value;
    }
    const text = String(value).trim();
    if (!text) return null;
    if (text.endsWith('%')) {
      return Number(text.slice(0, -1)) / 100;
    }
    const numeric = Number(text.replace(/,/g, ''));
    if (Number.isNaN(numeric)) return null;
    return numeric > 1 ? numeric / 100 : numeric;
  }

  static _formatVatPercent(vatRate) {
    const pct = Math.round(vatRate * 10000) / 100; // avoid 9.999999
    return Number.isInteger(pct) ? String(pct) : String(pct);
  }

  static _toDate(value) {
    if (value instanceof Date) return value;
    if (value === '' || value === null || value === undefined) return null;
    if (typeof value === 'number') {
      // Sheets serial date — Apps Script usually already returns Date; keep fallback.
      const epoch = new Date(Date.UTC(1899, 11, 30));
      return new Date(epoch.getTime() + value * 24 * 60 * 60 * 1000);
    }
    const text = String(value).trim();
    const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
      return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  static _dateOnly(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }
}
