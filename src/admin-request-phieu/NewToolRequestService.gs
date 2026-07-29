/**
 * NewToolRequestService.gs
 * ---------------------------------------------------------------------------
 * Builds the "Request mua Tool mới" approval message entirely from an
 * on-screen input FORM (getFormHtml()) - unlike RequestService/
 * MessageService, this class never reads or writes any sheet: a brand-new
 * tool has no row in the tracker sheet and no monthly request-sheet row
 * yet at the point this message needs to be sent, so every field (tool
 * name, features/package info, price, deployment window, payment method,
 * ...) is collected directly from Admin via the dialog instead.
 *
 * Flow: Code.gs's onCreateNewToolRequestClick() shows getFormHtml() in a
 * modal dialog. The form's own client-side JS calls the global
 * buildNewToolRequestMessage(formData) function (also in Code.gs, since
 * google.script.run can only invoke top-level functions, not class
 * methods) via google.script.run, which just delegates to
 * NewToolRequestService.buildMessage(). On success, the SAME dialog swaps
 * from the form view to a copyable result view - no second dialog is ever
 * opened. On failure (missing required field), the error message is shown
 * INLINE in the form so Admin can fix it without losing anything already
 * typed in.
 */
class NewToolRequestService {
  /**
   * Validates the raw form-submission object and builds the final message
   * text, computing GTGT (VAT) and TOTAL from Price and the VAT percentage.
   * @param {Object} formData - Raw field values submitted by the form (see
   *   getFormHtml()'s client-side JS for the exact field names).
   * @returns {{message: string}}
   */
  static buildMessage(formData) {
    try {
      const data = NewToolRequestService._normalize(formData);
      NewToolRequestService._validate(data);

      const gtgtAmount = Math.round(((data.price * data.vatPercent) / 100) * 100) / 100;
      const totalAmount = Math.round((data.price + gtgtAmount) * 100) / 100;

      const lines = [];
      lines.push(`[${data.teamTag}] Đề xuất giải ngân NCC ${data.tenTool.toUpperCase()} - Tháng ${data.thangDeXuat}`);
      if (data.idPhieu) lines.push(`ID phiếu: ${data.idPhieu}`);
      lines.push(`Thời gian triển khai: ${data.thoiGianTrienKhai}`);
      lines.push(`Brand triển khai: ${data.brandTrienKhai}`);
      lines.push('');
      lines.push(`Thông tin gói: ${data.thongTinGoi}`);
      lines.push(`Price: ${Utils.formatAmount(data.price)} ${data.currency}`);
      lines.push(`GTGT (${Utils.formatAmount(data.vatPercent)}%): ${Utils.formatAmount(gtgtAmount)} ${data.currency}`);
      lines.push(`TOTAL: ${Utils.formatAmount(totalAmount)} ${data.currency}`);
      lines.push('__________');
      lines.push('Hình thức thanh toán:');
      lines.push(`STK: ${data.stk}`);
      lines.push(`Tên người nhận: ${data.tenNguoiNhan}`);
      lines.push(`Tên ngân hàng: ${data.tenNganHang}`);

      if (data.note) {
        lines.push('');
        lines.push(`Note: ${data.note}`);
      }

      lines.push('');
      lines.push(Config.NEW_TOOL_REQUEST_CLOSING);

      const message = lines.join('\n');
      AppLogger.info(
        `NewToolRequestService.buildMessage: "${data.tenTool}" - TOTAL ${Utils.formatAmount(totalAmount)} ${data.currency}.`
      );
      return { message };
    } catch (error) {
      Utils.rethrow(error, 'NewToolRequestService.buildMessage');
    }
  }

  /**
   * Normalizes the raw form object: trims strings, applies Config defaults
   * for optional fields, and parses the HTML5 `<input type="month">` value
   * ("YYYY-MM") into the message's own "MM/YYYY" wording.
   * @param {Object} formData
   * @returns {Object}
   * @private
   */
  static _normalize(formData) {
    const raw = formData || {};
    const monthValue = String(raw.thangDeXuat || '').trim();
    const monthMatch = monthValue.match(/^(\d{4})-(\d{1,2})$/);

    let thangDeXuat;
    if (monthMatch) {
      thangDeXuat = `${monthMatch[2].padStart(2, '0')}/${monthMatch[1]}`;
    } else if (monthValue) {
      thangDeXuat = monthValue; // Already free-text (e.g. manually typed "08/2026").
    } else {
      const now = new Date();
      thangDeXuat = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    }

    return {
      teamTag: String(raw.teamTag || '').trim(),
      tenTool: String(raw.tenTool || '').trim(),
      thongTinGoi: String(raw.thongTinGoi || '').trim(),
      thangDeXuat,
      thoiGianTrienKhai: String(raw.thoiGianTrienKhai || '').trim(),
      brandTrienKhai: String(raw.brandTrienKhai || '').trim() || Config.NEW_TOOL_REQUEST_DEFAULT_BRAND,
      idPhieu: String(raw.idPhieu || '').trim(),
      price: Number(raw.price) || 0,
      currency: String(raw.currency || '').trim() || Config.NEW_TOOL_REQUEST_DEFAULT_CURRENCY,
      vatPercent:
        raw.vatPercent === '' || raw.vatPercent === undefined || raw.vatPercent === null
          ? Config.NEW_TOOL_REQUEST_DEFAULT_VAT_PERCENT
          : Number(raw.vatPercent),
      stk: String(raw.stk || '').trim(),
      tenNguoiNhan: String(raw.tenNguoiNhan || '').trim(),
      tenNganHang: String(raw.tenNganHang || '').trim(),
      note: String(raw.note || '').trim(),
    };
  }

  /**
   * Throws one clear, combined UserFacingError listing every missing
   * required field - per spec, the 5 required groups are: Tên tool, Tính
   * năng (= "Thông tin gói"), Giá, Thời gian triển khai, and Phương thức
   * thanh toán (= STK + Tên người nhận + Tên ngân hàng together).
   * @param {Object} data - Result of _normalize().
   * @private
   */
  static _validate(data) {
    const missing = [];
    if (!data.teamTag) missing.push('Team/Phòng ban');
    if (!data.tenTool) missing.push('Tên tool');
    if (!data.thongTinGoi) missing.push('Thông tin gói / Tính năng');
    if (!data.price || data.price <= 0) missing.push('Giá');
    if (!data.thoiGianTrienKhai) missing.push('Thời gian triển khai');
    if (!data.stk || !data.tenNguoiNhan || !data.tenNganHang) {
      missing.push('Phương thức thanh toán (STK / Tên người nhận / Tên ngân hàng)');
    }

    if (missing.length > 0) {
      throw new UserFacingError(`Vui lòng điền đầy đủ: ${missing.join(', ')}.`);
    }
  }

  /**
   * Returns the full HTML for the input-form dialog: a "form" view
   * (collects every field) and a "result" view (readonly textarea + Copy
   * button, reusing the same look as Utils.showMessageDialog) toggled
   * in-place by client-side JS - no second dialog is ever opened.
   * @returns {string}
   */
  static getFormHtml() {
    const today = new Date();
    const deployEnd = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    const defaultMonthValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const defaultDeployRange = `Từ ${Utils.formatDateDDMMYYYY(today)} - ${Utils.formatDateDDMMYYYY(deployEnd)}`;
    const defaultBrand = Config.NEW_TOOL_REQUEST_DEFAULT_BRAND;
    const defaultCurrency = Config.NEW_TOOL_REQUEST_DEFAULT_CURRENCY;
    const defaultVat = Config.NEW_TOOL_REQUEST_DEFAULT_VAT_PERCENT;

    return `
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 12px 16px 16px; font-size: 13px; }
        h3 { font-size: 13px; color: #5f6368; text-transform: uppercase; letter-spacing: 0.03em;
             margin: 16px 0 8px; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; }
        h3:first-of-type { margin-top: 4px; }
        label { display: block; margin-top: 10px; margin-bottom: 3px; color: #333; }
        label .required { color: #d93025; }
        input, textarea { width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid #ccc;
             border-radius: 4px; font-size: 13px; font-family: inherit; }
        textarea { resize: vertical; }
        .row { display: flex; gap: 10px; }
        .row > div { flex: 1; }
        .actions { margin-top: 16px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
        #formError { color: #d93025; font-size: 12px; flex: 1; }
        #copyStatus { color: #188038; font-size: 12px; visibility: hidden; }
        button { background: #1a73e8; color: #fff; border: none; padding: 8px 16px; border-radius: 4px;
             cursor: pointer; font-size: 13px; }
        button:hover { background: #1558b3; }
        button.secondary { background: #fff; color: #1a73e8; border: 1px solid #1a73e8; }
        button.secondary:hover { background: #f1f6fe; }
        #resultView textarea { height: 420px; font-family: 'Courier New', monospace; }
      </style>

      <div id="formView">
        <h3>Thông tin Tool</h3>
        <label>Team / Phòng ban <span class="required">*</span></label>
        <input id="teamTag" type="text" placeholder="VD: SEO TECH">

        <label>Tên tool <span class="required">*</span></label>
        <input id="tenTool" type="text" placeholder="VD: Ahrefs">

        <label>Thông tin gói / Tính năng <span class="required">*</span></label>
        <input id="thongTinGoi" type="text" placeholder="VD: Ahrefs Standard - Monthly">

        <div class="row">
          <div>
            <label>Tháng đề xuất</label>
            <input id="thangDeXuat" type="month" value="${defaultMonthValue}">
          </div>
          <div>
            <label>ID phiếu</label>
            <input id="idPhieu" type="text" placeholder="VD: 3513368">
          </div>
        </div>

        <label>Thời gian triển khai <span class="required">*</span></label>
        <input id="thoiGianTrienKhai" type="text" value="${defaultDeployRange}">

        <label>Brand triển khai</label>
        <input id="brandTrienKhai" type="text" value="${defaultBrand}">

        <h3>Chi phí</h3>
        <div class="row">
          <div>
            <label>Giá <span class="required">*</span></label>
            <input id="price" type="number" step="0.01" min="0" placeholder="VD: 249">
          </div>
          <div>
            <label>Đơn vị tiền</label>
            <input id="currency" type="text" value="${defaultCurrency}">
          </div>
          <div>
            <label>GTGT (%)</label>
            <input id="vatPercent" type="number" step="0.1" min="0" value="${defaultVat}">
          </div>
        </div>

        <h3>Hình thức thanh toán <span class="required">*</span></h3>
        <label>STK (Số tài khoản)</label>
        <input id="stk" type="text" placeholder="VD: 4GWJL268DKZRC8L">

        <div class="row">
          <div>
            <label>Tên người nhận</label>
            <input id="tenNguoiNhan" type="text" placeholder="VD: NGUYEN VAN A">
          </div>
          <div>
            <label>Tên ngân hàng</label>
            <input id="tenNganHang" type="text" placeholder="VD: VIETINBANK">
          </div>
        </div>

        <h3>Khác</h3>
        <label>Note</label>
        <textarea id="note" rows="2" placeholder="VD: Phục vụ SEO Tech dự án A"></textarea>

        <div class="actions">
          <span id="formError"></span>
          <button onclick="submitForm()">Tạo tin nhắn</button>
        </div>
      </div>

      <div id="resultView" style="display:none;">
        <textarea id="messageBox" readonly></textarea>
        <div class="actions">
          <button class="secondary" onclick="backToForm()">&larr; Quay lại</button>
          <span id="copyStatus">Đã copy!</span>
          <button onclick="copyMessage()">📋 Copy nội dung</button>
        </div>
      </div>

      <script>
        function submitForm() {
          const data = {
            teamTag: document.getElementById('teamTag').value,
            tenTool: document.getElementById('tenTool').value,
            thongTinGoi: document.getElementById('thongTinGoi').value,
            thangDeXuat: document.getElementById('thangDeXuat').value,
            idPhieu: document.getElementById('idPhieu').value,
            thoiGianTrienKhai: document.getElementById('thoiGianTrienKhai').value,
            brandTrienKhai: document.getElementById('brandTrienKhai').value,
            price: document.getElementById('price').value,
            currency: document.getElementById('currency').value,
            vatPercent: document.getElementById('vatPercent').value,
            stk: document.getElementById('stk').value,
            tenNguoiNhan: document.getElementById('tenNguoiNhan').value,
            tenNganHang: document.getElementById('tenNganHang').value,
            note: document.getElementById('note').value,
          };
          document.getElementById('formError').textContent = '';
          google.script.run
            .withSuccessHandler(onBuildSuccess)
            .withFailureHandler(onBuildError)
            .buildNewToolRequestMessage(data);
        }

        function onBuildSuccess(result) {
          document.getElementById('messageBox').value = result.message;
          document.getElementById('formView').style.display = 'none';
          document.getElementById('resultView').style.display = 'block';
        }

        function onBuildError(error) {
          document.getElementById('formError').textContent = (error && error.message) || String(error);
        }

        function backToForm() {
          document.getElementById('resultView').style.display = 'none';
          document.getElementById('formView').style.display = 'block';
        }

        function copyMessage() {
          const box = document.getElementById('messageBox');
          box.focus();
          box.select();
          document.execCommand('copy');
          const status = document.getElementById('copyStatus');
          status.style.visibility = 'visible';
          setTimeout(function () { status.style.visibility = 'hidden'; }, 2000);
        }
      </script>
    `;
  }
}
