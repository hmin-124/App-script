/**
 * Config.gs
 * ---------------------------------------------------------------------------
 * Single source of truth for every configurable value used by the Admin
 * Request Phieu tool: sheet names, tracker/request header names, the
 * declarative column-mapping table, business-rule constants, and logging
 * flags.
 *
 * Every other file resolves column positions by NAME through Utils/DataService
 * - never by hardcoded letter/index - and every business assumption that
 * cannot be derived 1:1 from the source data (see the comments inside
 * COLUMN_MAPPING) is centralised here so it can be tuned without touching
 * any service class.
 */

class Config {
  // ---------------------------------------------------------------------
  // Sheet names
  // ---------------------------------------------------------------------

  /** @returns {string} Name of the sheet that tracks every tool/subscription. */
  static get TRACKER_SHEET_NAME() {
    return 'Task_Management_Tracker';
  }

  /** @returns {string} Prefix used to build a request-sheet name, e.g. "T9.2026". */
  static get REQUEST_SHEET_PREFIX() {
    return 'T';
  }

  /** @returns {string} Prefix used to build the renewal checkbox header, e.g. "Request Gia hạn T9". */
  static get REQUEST_CHECKBOX_PREFIX() {
    return 'Request Gia hạn ';
  }

  /** @returns {string} Literal label used to locate the TOTAL row inside a request sheet. */
  static get TOTAL_ROW_LABEL() {
    return 'TOTAL';
  }

  // ---------------------------------------------------------------------
  // Menu
  // ---------------------------------------------------------------------

  /**
   * @returns {string} Top-level custom menu name. Apps Script's
   * `createMenu()` has no API for an image icon, so a Unicode emoji prefix
   * is used instead to make the menu easy to spot in the menu bar.
   */
  static get MENU_NAME() {
    return '🛠️ Admin Tools';
  }

  /** @returns {string} Menu item label that triggers the sheet-generation flow. */
  static get MENU_ITEM_GENERATE() {
    return '📄 Generate Request Sheet';
  }

  /** @returns {string} Menu item label that generates the "Lead duyệt" approval message. */
  static get MENU_ITEM_LEAD_MESSAGE() {
    return '💬 Tạo tin nhắn Lead duyệt';
  }

  /** @returns {string} Menu item label that generates the "Head duyệt" approval message. */
  static get MENU_ITEM_HEAD_MESSAGE() {
    return '📨 Tạo tin nhắn Head duyệt';
  }

  // ---------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------

  /** @returns {boolean} Master on/off switch for AppLogger output. */
  static get ENABLE_LOGGING() {
    return true;
  }

  /** @returns {{INFO:string, WARNING:string, ERROR:string}} Supported log levels. */
  static get LOG_LEVEL() {
    return { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR' };
  }

  // ---------------------------------------------------------------------
  // Header detection
  // ---------------------------------------------------------------------

  /** @returns {number} Max number of rows scanned when auto-detecting a header row. */
  static get HEADER_ROW_SEARCH_LIMIT() {
    return 20;
  }

  // ---------------------------------------------------------------------
  // Task_Management_Tracker (source) headers
  // ---------------------------------------------------------------------

  /**
   * Canonical header names of the Task_Management_Tracker sheet. DataService
   * resolves every one of these by NAME (never by column letter), and fails
   * with a clear error if any of them is missing.
   * @returns {Object<string,string>}
   */
  static get TRACKER_HEADERS() {
    return {
      BRAND: 'Brand',
      TYPE: 'Type',
      LINK_MUA: 'Link mua',
      MO_TA_CONG_CU: 'Mô tả Công Cụ',
      MUC_DICH_SU_DUNG: 'Mục đích sử dụng',
      COST_PER_MONTH: 'Cost/month (USD)',
      MONTH: 'MONTH',
      SO_LUONG: 'Số lượng',
      TOTAL_COST_TERM: 'TOTAL COST/term(USD)',
      GIA_HAN: 'Gia Hạn',
      LICH_GIA_HAN: 'Lịch Gia Hạn',
      EMAIL: 'Email',
      PW: 'PW',
      STATUS: 'Status',
      GHI_CHU: 'Ghi Chú',
    };
  }

  // ---------------------------------------------------------------------
  // Request (target) sheet headers - must match T7.2026 / T8.2026 EXACTLY
  // ---------------------------------------------------------------------

  /**
   * Canonical header names of a monthly request sheet (T{n}.{yyyy}).
   * @returns {Object<string,string>}
   */
  static get REQUEST_HEADERS() {
    return {
      STT: 'STT',
      TEN_TOOL: 'Tên tool',
      MUC_DICH_SU_DUNG: 'Mục đích sử dụng',
      CHI_TIET: 'Chi tiết\n(Tên gói dịch vụ, thông tin gói, link mua)',
      VI_TRI_SU_DUNG: 'Vị trí sử dụng',
      LOAI_THANH_TOAN: 'Loại thanh toán',
      LOAI_GIA_HAN: 'Loại gia hạn',
      GIA_USD: 'Giá USD (bao gồm thuế)',
      GIA_VND: 'Giá VNĐ',
      SO_LUONG: 'Số lượng',
      COST_FIRST_MONTH: 'Cost/First Month',
      REMAIN_MONTHLY: 'Remain Monthly',
      EMAIL_TOOL: 'Email Tool',
      CHI_PHI_THUC_TE: 'Chi phí thanh toán thực tế',
      VUOT_DU_TOAN: 'Thanh toán vượt Dự Toán',
      LY_DO: 'Lý do',
      THONG_TIN_THANH_TOAN: 'Thông tin thanh toán',
      LINK_HOA_DON: 'Link tải hóa đơn',
      ID_BOKT: 'ID BOKT',
      TINH_TRANG_THANH_TOAN: 'Tình trạng thanh toán',
      NGAY_GIA_HAN: 'Ngày gia hạn',
    };
  }

  // ---------------------------------------------------------------------
  // Business-rule defaults (used by the 'CONSTANT' mapping strategy below)
  // ---------------------------------------------------------------------

  /**
   * Fixed value for "Vị trí sử dụng" on every generated request row. Per
   * Admin's explicit instruction, this workbook belongs to team M5, so
   * every row is always "Dev M5" - it is NOT derived from the tracker's
   * section/group label (that earlier assumption was wrong and has been
   * removed from COLUMN_MAPPING; see SECTION_POSITION_MAP below for why it
   * is kept, unused, for possible future reuse).
   * @returns {string}
   */
  static get DEFAULT_VI_TRI_SU_DUNG() {
    return 'Dev M5';
  }

  /**
   * Default value for "Thông tin thanh toán". Observed to be constant
   * ("Thẻ visa") across every existing row in T7.2026/T8.2026 - i.e. the
   * company's standard internal card payment method for tool renewals.
   * @returns {string}
   */
  static get DEFAULT_THONG_TIN_THANH_TOAN() {
    return 'Thẻ visa';
  }

  /**
   * Translates the tracker's "Gia Hạn" cycle (English: Monthly/Yearly/
   * Quarterly/...) into the request sheet's "Loại gia hạn" wording.
   *
   * IMPORTANT: these Vietnamese labels are copied VERBATIM from the sheet's
   * own Data Validation error message (the exact list Google Sheets showed
   * when rejecting an invalid entry): "Mua theo tháng, Mua theo năm, Mua
   * credit, Sử dụng trước, thanh toán sau, Theo số lượng users, Theo dung
   * lượng sd, Mua theo quý, Mua một lần". Do NOT guess new wording here -
   * always confirm against the sheet's real dropdown list first (Data →
   * Data validation on the "Loại gia hạn" column), otherwise Google Sheets
   * will reject the value exactly like it did before this fix.
   * @returns {Object<string,string>}
   */
  static get RENEWAL_TYPE_MAP() {
    return {
      Monthly: 'Mua theo tháng',
      Yearly: 'Mua theo năm',
      Quarterly: 'Mua theo quý',
    };
  }

  /**
   * Fallback for "Loại gia hạn" when the tracker's raw "Gia Hạn" value has
   * no entry in RENEWAL_TYPE_MAP (e.g. it is empty, or literally "N/A" as
   * seen on some real tracker rows). MUST be a value the sheet's dropdown
   * accepts - every observed "Loại gia hạn"/"Loại thanh toán"/"Tình trạng
   * thanh toán" validation rule on this sheet has `allowBlank = true`, so
   * an empty string is always safe. Writing an arbitrary placeholder like
   * "N/A" here previously caused a data-validation rejection.
   * @returns {string}
   */
  static get DEFAULT_RENEWAL_TYPE() {
    return '';
  }

  /**
   * Maps a Task_Management_Tracker section/group label (the divider rows
   * such as "M8 TECH", "Martech", "M6 TECH") to a "Vị trí sử dụng" value.
   * NOT currently used by COLUMN_MAPPING (see DEFAULT_VI_TRI_SU_DUNG) -
   * kept here, and still tracked per-row on ToolRecord.section, in case a
   * future extension needs it again. Keys are matched case-insensitively.
   * @returns {Object<string,string>}
   */
  static get SECTION_POSITION_MAP() {
    return {
      'M8 TECH': 'Dev M8',
      MARTECH: 'Dev Martech',
      'M6 TECH': 'Dev M6',
    };
  }

  /** @returns {string} Fallback section label before the first divider row is seen. */
  static get DEFAULT_SECTION_POSITION() {
    return 'Dev';
  }

  // ---------------------------------------------------------------------
  // Declarative column mapping: Task_Management_Tracker -> Request sheet
  // ---------------------------------------------------------------------

  /**
   * Defines, for every single column of the request sheet, HOW its value is
   * produced. This is the ONLY place that encodes the business mapping -
   * RequestService simply iterates this table, so adding/removing/re-mapping
   * a column never requires touching RequestService, SheetGenerator or
   * DataService.
   *
   * Supported `strategy` values:
   *  - 'SEQUENCE'  : auto-incrementing row number (1, 2, 3, ...)
   *  - 'SOURCE'    : copy the raw value of `sourceHeader` from the tracker row
   *  - 'TRANSFORM' : copy `sourceHeader`'s value, then translate it through `map`
   *                  (falls back to `fallback` when the value has no entry)
   *  - 'SECTION'   : derive the value from the tool's tracker section/group,
   *                  via SECTION_POSITION_MAP
   *  - 'CONSTANT'  : always write the fixed `value`
   *  - 'MANUAL'    : leave the cell blank - these are fields Finance/Admin
   *                  fill in AFTER the request has been reviewed/paid
   *                  (e.g. actual cost, invoice link, payment status), so
   *                  there is intentionally no source data for them yet.
   *
   * @returns {Array<Object>}
   */
  static get COLUMN_MAPPING() {
    const REQUEST = Config.REQUEST_HEADERS;
    const TRACKER = Config.TRACKER_HEADERS;

    return [
      { target: REQUEST.STT, strategy: 'SEQUENCE' },
      { target: REQUEST.TEN_TOOL, strategy: 'SOURCE', sourceHeader: TRACKER.BRAND },
      { target: REQUEST.MUC_DICH_SU_DUNG, strategy: 'SOURCE', sourceHeader: TRACKER.MUC_DICH_SU_DUNG },
      { target: REQUEST.CHI_TIET, strategy: 'SOURCE', sourceHeader: TRACKER.MO_TA_CONG_CU },
      { target: REQUEST.VI_TRI_SU_DUNG, strategy: 'CONSTANT', value: Config.DEFAULT_VI_TRI_SU_DUNG },
      // "Loại thanh toán" (Mua mới / Gia hạn) has no reliable source column
      // in the tracker - left MANUAL so Admin picks it from the sheet's own
      // dropdown after generation, instead of the tool guessing wrong.
      { target: REQUEST.LOAI_THANH_TOAN, strategy: 'MANUAL' },
      // Translated from the tracker's "Gia Hạn" column via RENEWAL_TYPE_MAP
      // (English Monthly/Yearly/Quarterly -> the sheet's real Vietnamese
      // dropdown wording). A raw/verbatim copy was tried previously and
      // rejected by Google Sheets' Data Validation (the tracker stores
      // English, the dropdown only accepts Vietnamese) - see
      // RENEWAL_TYPE_MAP's comment for exactly which wording is valid.
      {
        target: REQUEST.LOAI_GIA_HAN,
        strategy: 'TRANSFORM',
        sourceHeader: TRACKER.GIA_HAN,
        map: Config.RENEWAL_TYPE_MAP,
        fallback: Config.DEFAULT_RENEWAL_TYPE,
      },
      { target: REQUEST.GIA_USD, strategy: 'SOURCE', sourceHeader: TRACKER.TOTAL_COST_TERM },
      { target: REQUEST.GIA_VND, strategy: 'MANUAL' },
      { target: REQUEST.SO_LUONG, strategy: 'SOURCE', sourceHeader: TRACKER.SO_LUONG },
      { target: REQUEST.COST_FIRST_MONTH, strategy: 'SOURCE', sourceHeader: TRACKER.TOTAL_COST_TERM },
      { target: REQUEST.REMAIN_MONTHLY, strategy: 'SOURCE', sourceHeader: TRACKER.TOTAL_COST_TERM },
      { target: REQUEST.EMAIL_TOOL, strategy: 'SOURCE', sourceHeader: TRACKER.EMAIL },
      { target: REQUEST.CHI_PHI_THUC_TE, strategy: 'MANUAL' },
      { target: REQUEST.VUOT_DU_TOAN, strategy: 'MANUAL' },
      { target: REQUEST.LY_DO, strategy: 'MANUAL' },
      { target: REQUEST.THONG_TIN_THANH_TOAN, strategy: 'CONSTANT', value: Config.DEFAULT_THONG_TIN_THANH_TOAN },
      { target: REQUEST.LINK_HOA_DON, strategy: 'MANUAL' },
      { target: REQUEST.ID_BOKT, strategy: 'MANUAL' },
      { target: REQUEST.TINH_TRANG_THANH_TOAN, strategy: 'MANUAL' },
      { target: REQUEST.NGAY_GIA_HAN, strategy: 'SOURCE', sourceHeader: TRACKER.LICH_GIA_HAN },
    ];
  }

  // ---------------------------------------------------------------------
  // Approval messages (Lead duyệt / Head duyệt) - read from an ALREADY
  // generated-and-edited request sheet, never written back to it.
  // ---------------------------------------------------------------------

  /**
   * Team label used in both message subjects ("Chi phí mua tool cho team
   * {MESSAGE_TEAM_LABEL} - File Tools request - T{n}/{yyyy}"). Change here
   * if this workbook is ever reused for a different team.
   * @returns {string}
   */
  static get MESSAGE_TEAM_LABEL() {
    return 'Tech M5';
  }

  /**
   * Exact "Loại thanh toán" values (must match the request sheet's own
   * dropdown for that column) that MessageService groups tools by when
   * building the "Lead duyệt" message. Any tool whose "Loại thanh toán" is
   * empty or NOT one of these three still gets its own group in the
   * message (see MessageService) - it is never silently dropped.
   * @returns {{GIA_HAN:string, MUA_MOI:string, TOPUP_CREDIT:string}}
   */
  static get PAYMENT_CATEGORY() {
    return {
      GIA_HAN: 'Gia hạn',
      MUA_MOI: 'Mua mới',
      TOPUP_CREDIT: 'Topup Credit',
    };
  }

  /**
   * Display order of the 3 known payment categories inside the "Lead
   * duyệt" message (per Admin's sample: Gia hạn -> Mua mới -> Topup
   * Credit), regardless of the order the rows happen to be in on the sheet.
   * @returns {string[]}
   */
  static get PAYMENT_CATEGORY_ORDER() {
    return [Config.PAYMENT_CATEGORY.GIA_HAN, Config.PAYMENT_CATEGORY.MUA_MOI, Config.PAYMENT_CATEGORY.TOPUP_CREDIT];
  }

  /**
   * Placeholder line Admin manually replaces with the real BOKT link, in
   * every tool entry of the "Head duyệt" message - the request sheet has
   * no BOKT-link column filled in at that point, this is expected to be
   * pasted by hand right before sending.
   * @returns {string}
   */
  static get MESSAGE_BOKT_LINK_PLACEHOLDER() {
    return 'Admin tự copy link';
  }

  /** @returns {string} Closing lines appended to the end of the "Lead duyệt" message. */
  static get MESSAGE_LEAD_CLOSING() {
    return 'Nhờ anh xác nhận duyệt phiếu tool.\nE cám ơn ạ!';
  }

  /** @returns {string} Closing lines appended to the end of the "Head duyệt" message. */
  static get MESSAGE_HEAD_CLOSING() {
    return 'Nhờ anh duyệt giúp em các phiếu tool trên. Các phiếu này đã được Lead phê duyệt ạ!\nCám ơn anh!';
  }
}
