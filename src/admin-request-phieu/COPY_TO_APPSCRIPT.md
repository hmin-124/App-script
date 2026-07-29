# Copy vào Google Apps Script — PR #6

**Trước khi dán:** xóa hết file cũ trong Apps Script (kể cả `*.gs.gs`).

**Khi tạo file:** chỉ gõ tên **không** có đuôi `.gs` (trừ `appsscript.json`).

| # | Tên tạo trong Apps Script | File nguồn |
|---|---------------------------|------------|
| 1 | `appsscript.json` (Project Settings → Show appsscript.json) | appsscript.json |
| 2 | `Config` | Config.gs |
| 3 | `Utils` | Utils.gs |
| 4 | `DataService` | DataService.gs |
| 5 | `TemplateService` | TemplateService.gs |
| 6 | `SheetGenerator` | SheetGenerator.gs |
| 7 | `RequestService` | RequestService.gs |
| 8 | `MessageService` | MessageService.gs |
| 9 | `NewToolRequestService` | NewToolRequestService.gs |
| 10 | `Menu` | Menu.gs |
| 11 | `Code` | Code.gs |


---

## 1. Tạo file `appsscript.json` — dán TOÀN BỘ khối dưới

```json
{
  "timeZone": "Asia/Ho_Chi_Minh",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets.currentonly"
  ]
}

```

---

## 2. Tạo file `Config` — dán TOÀN BỘ khối dưới

```javascript
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

  /**
   * @returns {string} Name of the sheet that tracks every tool/subscription.
   * Renamed by Admin from "Task_Management_Tracker" to "QUẢN LÝ TOOLS" -
   * every other file resolves this sheet ONLY through this constant (never
   * a hardcoded literal), so this is the one and only place that ever
   * needs to change if the sheet is renamed again in the future.
   */
  static get TRACKER_SHEET_NAME() {
    return 'QUẢN LÝ TOOLS';
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

  /** @returns {string} Menu item label that opens the "Request mua Tool mới" form. */
  static get MENU_ITEM_NEW_TOOL_REQUEST() {
    return '🆕 Tạo tin nhắn Request mua Tool mới';
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
  // Tracker sheet (source, see TRACKER_SHEET_NAME - "QUẢN LÝ TOOLS") headers
  // ---------------------------------------------------------------------

  /**
   * Canonical header names of the tracker sheet (TRACKER_SHEET_NAME).
   * DataService resolves every one of these by NAME (never by column
   * letter), and fails with a clear error if any of them is missing.
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
   * Maps a tracker-sheet section/group label (the divider rows such as
   * "M8 TECH", "Martech", "M6 TECH") to a "Vị trí sử dụng" value.
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
  // Declarative column mapping: tracker sheet -> Request sheet
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
   * Value written right after "Link BOKT:" in every tool entry of the
   * "Head duyệt" message. Left BLANK on purpose (per Admin's explicit
   * request) - the request sheet has no BOKT-link column filled in at that
   * point, so Admin types/pastes the real link directly onto that line by
   * hand before sending; change this constant if a fixed placeholder text
   * is ever wanted again instead.
   * @returns {string}
   */
  static get MESSAGE_BOKT_LINK_PLACEHOLDER() {
    return '';
  }

  /** @returns {string} Closing lines appended to the end of the "Lead duyệt" message. */
  static get MESSAGE_LEAD_CLOSING() {
    return 'Nhờ anh xác nhận duyệt phiếu tool.\nE cám ơn ạ!';
  }

  /** @returns {string} Closing lines appended to the end of the "Head duyệt" message. */
  static get MESSAGE_HEAD_CLOSING() {
    return 'Nhờ anh duyệt giúp em các phiếu tool trên. Các phiếu này đã được Lead phê duyệt ạ!\nCám ơn anh!';
  }

  // ---------------------------------------------------------------------
  // "Request mua Tool mới" message (NewToolRequestService) - built ENTIRELY
  // from an on-screen form, never from any sheet - a brand-new tool has no
  // tracker/request-sheet row yet at the time this message is sent.
  // ---------------------------------------------------------------------

  /** @returns {string} Default "Brand triển khai" value pre-filled in the form. */
  static get NEW_TOOL_REQUEST_DEFAULT_BRAND() {
    return 'All brand';
  }

  /** @returns {string} Default currency pre-filled in the form (Price/GTGT/TOTAL all share one currency). */
  static get NEW_TOOL_REQUEST_DEFAULT_CURRENCY() {
    return 'USD';
  }

  /** @returns {number} Default VAT percentage pre-filled in the form (Vietnam's standard VAT rate). */
  static get NEW_TOOL_REQUEST_DEFAULT_VAT_PERCENT() {
    return 10;
  }

  /** @returns {string} Closing lines appended to the end of the "Request mua Tool mới" message. */
  static get NEW_TOOL_REQUEST_CLOSING() {
    return 'Nhờ anh duyệt giúp em đề xuất mua Tool mới này ạ.\nCám ơn anh!';
  }
}

```

---

## 3. Tạo file `Utils` — dán TOÀN BỘ khối dưới

```javascript
/**
 * Utils.gs
 * ---------------------------------------------------------------------------
 * Shared, stateless helper functions used across the project: header
 * lookup/detection, template copying, month-name computation, money
 * formatting, UI helpers (toast/alert/confirm), and safe clearing of old
 * data ranges. Also hosts two small shared types: UserFacingError (business
 * errors meant to be shown to the admin verbatim) and AppLogger (a leveled
 * logger toggled by Config.ENABLE_LOGGING).
 *
 * No class in this file ever touches business rules (e.g. which column maps
 * to which) - that lives exclusively in Config.gs.
 */

/**
 * A business-rule error whose message is safe (and intended) to be shown
 * directly to the end user, as opposed to an unexpected/system error whose
 * raw message might be too technical. Thrown by service classes for
 * expected failure conditions described in the spec (missing template,
 * missing header, no tool selected, ...).
 */
class UserFacingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/**
 * Minimal leveled logger toggled by Config.ENABLE_LOGGING. Writes to both
 * the Apps Script Logger (visible in the Executions panel) and console
 * (visible in Stackdriver/Cloud Logging).
 */
class AppLogger {
  /** @param {string} message */
  static info(message) {
    AppLogger._write(Config.LOG_LEVEL.INFO, message);
  }

  /** @param {string} message */
  static warning(message) {
    AppLogger._write(Config.LOG_LEVEL.WARNING, message);
  }

  /** @param {string} message */
  static error(message) {
    AppLogger._write(Config.LOG_LEVEL.ERROR, message);
  }

  /**
   * Writes one log line, respecting the Config.ENABLE_LOGGING master switch.
   * @param {string} level - One of Config.LOG_LEVEL.
   * @param {string} message
   * @private
   */
  static _write(level, message) {
    if (!Config.ENABLE_LOGGING) return;

    const line = `[${level}] ${message}`;
    if (level === Config.LOG_LEVEL.ERROR) {
      console.error(line);
    } else if (level === Config.LOG_LEVEL.WARNING) {
      console.warn(line);
    } else {
      console.log(line);
    }
    Logger.log(line);
  }
}

class Utils {
  // ---------------------------------------------------------------------
  // Header lookup (never hardcode a column letter/index anywhere else)
  // ---------------------------------------------------------------------

  /**
   * Normalizes header text for tolerant matching (trims, collapses
   * whitespace/newlines, case-insensitive) so minor formatting differences
   * on the sheet don't break header resolution.
   * @param {*} rawHeader
   * @returns {string}
   */
  static normalizeHeader(rawHeader) {
    return String(rawHeader || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Scans the first N rows of a sheet (Config.HEADER_ROW_SEARCH_LIMIT) to
   * find the row that best matches the given list of required header names,
   * instead of assuming the header is always row 1.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {string[]} requiredHeaderNames
   * @returns {number} 1-based row index of the detected header row.
   */
  static detectHeaderRow(sheet, requiredHeaderNames) {
    try {
      const lastRow = sheet.getLastRow();
      const lastColumn = sheet.getLastColumn();
      if (lastRow < 1 || lastColumn < 1) {
        throw new Error(`Sheet "${sheet.getName()}" has no data.`);
      }

      const searchLimit = Math.min(Config.HEADER_ROW_SEARCH_LIMIT, lastRow);
      const candidateRows = sheet.getRange(1, 1, searchLimit, lastColumn).getValues();
      const requiredKeys = requiredHeaderNames.map(Utils.normalizeHeader);

      let bestRow = 1;
      let bestScore = -1;
      candidateRows.forEach((rowValues, offset) => {
        const normalizedRow = rowValues.map(Utils.normalizeHeader);
        const score = requiredKeys.filter((key) => normalizedRow.includes(key)).length;
        if (score > bestScore) {
          bestScore = score;
          bestRow = offset + 1;
        }
      });

      if (bestScore <= 0) {
        throw new UserFacingError(`Không tìm thấy dòng Header phù hợp trong sheet "${sheet.getName()}".`);
      }
      return bestRow;
    } catch (error) {
      Utils.rethrow(error, 'Utils.detectHeaderRow');
    }
  }

  /**
   * Builds a map of normalized-header-text -> 1-based column index for a
   * given header row.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} headerRowIndex
   * @returns {Object<string, number>}
   */
  static getHeaderMap(sheet, headerRowIndex) {
    try {
      const lastColumn = sheet.getLastColumn();
      const headerValues = sheet.getRange(headerRowIndex, 1, 1, lastColumn).getValues()[0];

      const headerMap = {};
      headerValues.forEach((rawHeader, index) => {
        const normalized = Utils.normalizeHeader(rawHeader);
        if (normalized) headerMap[normalized] = index + 1; // 1-based column index
      });
      return headerMap;
    } catch (error) {
      Utils.rethrow(error, 'Utils.getHeaderMap');
    }
  }

  /**
   * Resolves the 1-based column index for a logical header name.
   * @param {Object<string, number>} headerMap - Result of getHeaderMap().
   * @param {string} headerName
   * @returns {number}
   */
  static findColumn(headerMap, headerName) {
    const columnIndex = headerMap[Utils.normalizeHeader(headerName)];
    if (!columnIndex) {
      throw new UserFacingError(`Không tìm thấy cột "${headerName}". Vui lòng kiểm tra lại Header.`);
    }
    return columnIndex;
  }

  /**
   * @param {Object<string, number>} headerMap
   * @param {string} headerName
   * @returns {boolean} True if the header exists in the map.
   */
  static hasColumn(headerMap, headerName) {
    return Boolean(headerMap[Utils.normalizeHeader(headerName)]);
  }

  /**
   * Asserts that every header in `requiredHeaders` exists in `headerMap`,
   * throwing one clear, combined UserFacingError listing every missing
   * header if not (per spec: "Nếu thiếu Header -> báo lỗi rõ ràng").
   * @param {Object<string, number>} headerMap
   * @param {string[]} requiredHeaders
   * @param {string} sheetName - Used only for the error message.
   */
  static assertHeadersExist(headerMap, requiredHeaders, sheetName) {
    const missing = requiredHeaders.filter((header) => !Utils.hasColumn(headerMap, header));
    if (missing.length > 0) {
      throw new UserFacingError(`Sheet "${sheetName}" thiếu cột: ${missing.map((h) => `"${h}"`).join(', ')}.`);
    }
  }

  // ---------------------------------------------------------------------
  // Request-sheet data-range discovery (shared by SheetGenerator, which
  // WRITES the request sheet, and MessageService, which only READS it -
  // both must agree on exactly the same rows, so the logic lives here once).
  // ---------------------------------------------------------------------

  /**
   * Locates the TOTAL row inside an ALREADY-POPULATED request sheet by
   * scanning the "Tên tool" column for the literal label
   * Config.TOTAL_ROW_LABEL.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object<string, number>} headerMap - Request-sheet header map.
   * @param {number} headerRowIndex
   * @returns {number} 1-based row index.
   */
  static findTotalRowIndex(sheet, headerMap, headerRowIndex) {
    try {
      const nameColumnIndex = Utils.findColumn(headerMap, Config.REQUEST_HEADERS.TEN_TOOL);
      const lastRow = sheet.getLastRow();
      const searchHeight = Math.max(lastRow - headerRowIndex, 0);
      if (searchHeight === 0) {
        throw new UserFacingError(`Không tìm thấy dòng "${Config.TOTAL_ROW_LABEL}" trong sheet "${sheet.getName()}".`);
      }

      const nameColumnValues = sheet.getRange(headerRowIndex + 1, nameColumnIndex, searchHeight, 1).getValues();
      for (let offset = 0; offset < nameColumnValues.length; offset++) {
        const cellText = String(nameColumnValues[offset][0] || '').trim().toUpperCase();
        if (cellText === Config.TOTAL_ROW_LABEL) {
          return headerRowIndex + 1 + offset;
        }
      }

      throw new UserFacingError(`Không tìm thấy dòng "${Config.TOTAL_ROW_LABEL}" trong sheet "${sheet.getName()}".`);
    } catch (error) {
      Utils.rethrow(error, 'Utils.findTotalRowIndex');
    }
  }

  /**
   * Reads the data-range boundaries for a request sheet: `startRow` comes
   * from the TOTAL row's own SUM formula in the "Giá USD" column (e.g.
   * "=sum(H3:H11)" -> startRow 3) - that boundary never moves, since new
   * rows are only ever inserted directly ABOVE the TOTAL row, never above
   * the first data row. `endRow` is ALWAYS `totalRowIndex - 1` (per spec,
   * the TOTAL row immediately follows the last data row with no gap) -
   * deliberately NOT the formula's own end-of-range reference.
   *
   * BUG FIX (reported 21/07/2026 - "18 tool trên sheet nhưng tin nhắn chỉ
   * lọc được 10"): Google Sheets does NOT reliably auto-expand a SUM
   * formula's range when MULTIPLE rows are inserted in a single
   * `insertRowsBefore(row, n)` call. A real request sheet had 18 tool rows
   * (3..20) but its TOTAL formula had stayed exactly "=sum(H3:H12)" - i.e.
   * only the template's original 10-row capacity - after `SheetGenerator`
   * inserted 8 more rows for the extra tools. Every reader that trusted the
   * formula's end reference (this function, and therefore MessageService)
   * silently ignored the last 8 rows - which also happened to be every
   * "Mua mới"/"Topup Credit" tool that month, since those were appended
   * after the "Gia hạn" ones. Using `totalRowIndex - 1` instead makes this
   * immune to that native-Sheets limitation, for both existing sheets with
   * an already-stale formula and any future one - see also
   * `SheetGenerator._growTotalFormulas()`, which now explicitly rewrites
   * the TOTAL row's own formula(s) after growing capacity, so the sheet's
   * displayed TOTAL cell stays correct too, not just this function's read.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {Object<string, number>} headerMap - Request-sheet header map.
   * @param {number} totalRowIndex
   * @returns {{startRow: number, endRow: number}}
   */
  static findDataRangeFromTotalFormula(sheet, headerMap, totalRowIndex) {
    try {
      const priceColumnIndex = Utils.findColumn(headerMap, Config.REQUEST_HEADERS.GIA_USD);
      const formula = sheet.getRange(totalRowIndex, priceColumnIndex).getFormula();
      const match = formula.match(/[A-Za-z]+(\d+):[A-Za-z]+(\d+)/);

      if (!match) {
        throw new UserFacingError(
          `Không đọc được vùng dữ liệu từ công thức của dòng "${Config.TOTAL_ROW_LABEL}" ("${formula}"). Vui lòng kiểm tra lại Template.`
        );
      }

      const startRow = Number(match[1]);
      const endRow = totalRowIndex - 1;
      if (endRow < startRow) {
        throw new UserFacingError(
          `Vùng dữ liệu không hợp lệ trong sheet "${sheet.getName()}" (dòng "${Config.TOTAL_ROW_LABEL}" nằm trước hoặc ngay tại dòng dữ liệu đầu tiên). Vui lòng kiểm tra lại Template.`
        );
      }
      return { startRow, endRow };
    } catch (error) {
      Utils.rethrow(error, 'Utils.findDataRangeFromTotalFormula');
    }
  }

  // ---------------------------------------------------------------------
  // Template copying
  // ---------------------------------------------------------------------

  /**
   * Duplicates `templateSheet` (format, formulas, merges, data validation,
   * conditional formatting, filters, frozen/hidden rows & columns -
   * EVERYTHING, via the native Sheet.copyTo() API), renames the copy, and
   * places it right after the template in the tab order.
   * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet
   * @param {GoogleAppsScript.Spreadsheet.Sheet} templateSheet
   * @param {string} newSheetName
   * @returns {GoogleAppsScript.Spreadsheet.Sheet} The newly created sheet.
   */
  static copyTemplate(spreadsheet, templateSheet, newSheetName) {
    try {
      const newSheet = templateSheet.copyTo(spreadsheet);
      newSheet.setName(newSheetName);
      spreadsheet.setActiveSheet(newSheet);
      spreadsheet.moveActiveSheet(templateSheet.getIndex() + 1);
      return newSheet;
    } catch (error) {
      Utils.rethrow(error, 'Utils.copyTemplate');
    }
  }

  // ---------------------------------------------------------------------
  // Month helpers
  // ---------------------------------------------------------------------

  /**
   * Computes the request-sheet name for the month AFTER `baseDate`, e.g.
   * today = 07/2026 -> "T8.2026".
   * @param {Date} [baseDate]
   * @returns {string}
   */
  static getNextMonthSheetName(baseDate = new Date()) {
    const next = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
    return `${Config.REQUEST_SHEET_PREFIX}${next.getMonth() + 1}.${next.getFullYear()}`;
  }

  /**
   * Computes the checkbox "month code" (no year) for the month AFTER
   * `baseDate`, e.g. today = 07/2026 -> "T8" (used to build the
   * "Request Gia hạn T8" header name).
   * @param {Date} [baseDate]
   * @returns {string}
   */
  static getNextMonthCode(baseDate = new Date()) {
    const next = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
    return `${Config.REQUEST_SHEET_PREFIX}${next.getMonth() + 1}`;
  }

  /**
   * Regex that matches a request-sheet month token at the END of a sheet
   * name. Anchoring at the end (instead of requiring the whole name to be
   * exactly "T{n}.{yyyy}") is intentional: Google Sheets auto-renames
   * duplicates to "Copy of T8.2026", and Admins sometimes add a team/
   * brand prefix ("Dev SEO T7.2026"). Both must still resolve as the
   * request sheet for month 8/7 of 2026.
   * @returns {RegExp}
   */
  static getRequestSheetNamePattern() {
    return new RegExp(`${Config.REQUEST_SHEET_PREFIX}(\\d{1,2})\\.(\\d{4})$`, 'i');
  }

  /**
   * Returns month/year when `sheetName` ends with "T{n}.{yyyy}" (canonical
   * or prefixed), otherwise null. Prefer this over parseSheetName when
   * scanning existing tabs - a non-match is a normal "skip this sheet"
   * case, not an error.
   * @param {string} sheetName
   * @returns {{month:number, year:number}|null}
   */
  static matchRequestSheetName(sheetName) {
    const match = String(sheetName || '').match(Utils.getRequestSheetNamePattern());
    if (!match) return null;
    return { month: Number(match[1]), year: Number(match[2]) };
  }

  /**
   * Parses a request-sheet name such as "T9.2026" (or a prefixed variant
   * like "Copy of T9.2026" / "Dev SEO T9.2026") into its month/year parts.
   * @param {string} sheetName
   * @returns {{month:number, year:number}}
   */
  static parseSheetName(sheetName) {
    const parsed = Utils.matchRequestSheetName(sheetName);
    if (!parsed) {
      throw new Error(`Utils.parseSheetName: cannot parse sheet name "${sheetName}".`);
    }
    return parsed;
  }

  // ---------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------

  /**
   * Formats a number as money with thousand separators and 2 decimals.
   * @param {number} amount
   * @returns {string}
   */
  static formatMoney(amount) {
    try {
      const numeric = Number(amount);
      if (Number.isNaN(numeric)) return String(amount);
      return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric);
    } catch (error) {
      AppLogger.warning(`Utils.formatMoney: ${error.message}`);
      return String(amount);
    }
  }

  /**
   * Formats a plain amount for chat messages - thousand separators, but no
   * forced trailing ".00" (matches the sample messages: "497", "220", not
   * "497.00"), while still showing up to 2 decimals when the amount
   * actually has cents (e.g. "20.9"). No currency symbol/suffix is added -
   * callers append their own (see formatUsdAmount, NewToolRequestService).
   * @param {number} amount
   * @returns {string} e.g. "1,283.5".
   */
  static formatAmount(amount) {
    try {
      const numeric = Number(amount) || 0;
      return numeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    } catch (error) {
      AppLogger.warning(`Utils.formatAmount: ${error.message}`);
      return String(amount);
    }
  }

  /**
   * Formats a USD amount for chat messages, "$"-prefixed - see
   * formatAmount() for the underlying number-formatting rules.
   * @param {number} amount
   * @returns {string} e.g. "$1,283.5".
   */
  static formatUsdAmount(amount) {
    return `$${Utils.formatAmount(amount)}`;
  }

  /**
   * Formats a Date as "dd/MM/yyyy" (Vietnamese convention used in every
   * date shown to Admin, e.g. "Thời gian triển khai: Từ 29/07/2026 - ...").
   * @param {Date} date
   * @returns {string}
   */
  static formatDateDDMMYYYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // ---------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------

  /**
   * Shows a short, non-blocking toast in the bottom-right of the spreadsheet.
   * @param {string} message
   * @param {string} [title]
   */
  static showToast(message, title = Config.MENU_NAME) {
    try {
      SpreadsheetApp.getActiveSpreadsheet().toast(message, title, 5);
    } catch (error) {
      AppLogger.warning(`Utils.showToast: ${error.message}`);
    }
  }

  /**
   * Shows a blocking OK-only alert dialog.
   * @param {string} title
   * @param {string} message
   */
  static showAlert(title, message) {
    try {
      const ui = SpreadsheetApp.getUi();
      ui.alert(title, message, ui.ButtonSet.OK);
    } catch (error) {
      AppLogger.warning(`Utils.showAlert: ${error.message}`);
    }
  }

  /**
   * Shows a blocking Yes/No confirmation dialog.
   * @param {string} title
   * @param {string} message
   * @returns {boolean} True if the user clicked "Yes".
   */
  static showConfirm(title, message) {
    try {
      const ui = SpreadsheetApp.getUi();
      const response = ui.alert(title, message, ui.ButtonSet.YES_NO);
      return response === ui.Button.YES;
    } catch (error) {
      AppLogger.warning(`Utils.showConfirm: ${error.message}`);
      return false;
    }
  }

  /**
   * Shows a modal dialog with the generated message inside a read-only,
   * selectable/copyable textarea plus a one-click "Copy" button. Used by
   * MessageService's Lead/Head approval-message generators - `ui.alert()`
   * cannot be used here because it does not let the admin easily
   * select/copy a long, multi-line message.
   * @param {string} title
   * @param {string} message
   */
  static showMessageDialog(title, message) {
    try {
      const escapedMessage = Utils.escapeHtml(message);
      const html = `
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 12px 16px 16px; }
          textarea {
            width: 100%; height: 380px; box-sizing: border-box; font-family: 'Courier New', monospace;
            font-size: 13px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; resize: vertical;
          }
          .actions { margin-top: 10px; display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
          #copyStatus { color: #188038; font-size: 12px; visibility: hidden; }
          button {
            background: #1a73e8; color: #fff; border: none; padding: 8px 16px; border-radius: 4px;
            cursor: pointer; font-size: 13px;
          }
          button:hover { background: #1558b3; }
        </style>
        <textarea id="messageBox" readonly>${escapedMessage}</textarea>
        <div class="actions">
          <span id="copyStatus">Đã copy!</span>
          <button onclick="copyMessage()">📋 Copy nội dung</button>
        </div>
        <script>
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
      const output = HtmlService.createHtmlOutput(html).setWidth(520).setHeight(500);
      SpreadsheetApp.getUi().showModalDialog(output, title);
    } catch (error) {
      AppLogger.warning(`Utils.showMessageDialog: ${error.message}`);
    }
  }

  /**
   * Escapes text for safe embedding inside an HtmlService template (used
   * only by showMessageDialog - every OTHER dialog in this project uses
   * ui.alert(), which needs no escaping).
   * @param {string} text
   * @returns {string}
   */
  static escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ---------------------------------------------------------------------
  // Data clearing
  // ---------------------------------------------------------------------

  /**
   * Clears the CONTENT (not formatting/validation/formulas outside the
   * range) of a rectangular block of rows - used to wipe last month's
   * leftover data before writing this month's rows.
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
   * @param {number} startRow
   * @param {number} endRow
   * @param {number} numColumns
   */
  static clearOldData(sheet, startRow, endRow, numColumns) {
    try {
      if (endRow < startRow) return;
      sheet.getRange(startRow, 1, endRow - startRow + 1, numColumns).clearContent();
    } catch (error) {
      Utils.rethrow(error, 'Utils.clearOldData');
    }
  }

  // ---------------------------------------------------------------------
  // Error propagation
  // ---------------------------------------------------------------------

  /**
   * Re-throws `error` with additional context, UNLESS it is already a
   * UserFacingError - those are already a clean, intentional business
   * message and must reach the top-level handler unmodified.
   * @param {Error} error
   * @param {string} context - Typically "ClassName.methodName".
   */
  static rethrow(error, context) {
    if (error instanceof UserFacingError) throw error;
    throw new Error(`${context}: ${error.message}`);
  }
}

```

---

## 4. Tạo file `DataService` — dán TOÀN BỘ khối dưới

```javascript
/**
 * DataService.gs
 * ---------------------------------------------------------------------------
 * Sole owner of reading the tracker sheet (Config.TRACKER_SHEET_NAME, e.g.
 * "QUẢN LÝ TOOLS"). Responsible for:
 *   - Auto-detecting the tracker's header row and resolving every column by
 *     NAME (never a hardcoded letter/index).
 *   - Skipping the tracker's section/group divider rows ("M8 TECH",
 *     "Martech", "M6 TECH", ...) while still remembering which section each
 *     real tool row belongs to (used later for "Vị trí sử dụng").
 *   - Filtering down to only the tools whose "Request Gia hạn T{n}"
 *     checkbox is TRUE for the requested month.
 *
 * Reads happen via a SINGLE batched getValues() call - there is no
 * getValue()-in-a-loop anywhere in this file.
 */

/**
 * Represents one real tool row from the tracker sheet, exposed through
 * header names via get() instead of raw array indexes, plus the
 * section/group label it belongs to.
 */
class ToolRecord {
  /**
   * @param {Array<*>} rowValues - The raw row as returned by getValues().
   * @param {Object<string, number>} headerMap - Tracker header map (see Utils.getHeaderMap).
   * @param {string} section - The nearest section/group label above this row.
   */
  constructor(rowValues, headerMap, section) {
    this.rowValues = rowValues;
    this.headerMap = headerMap;
    this.section = section;
  }

  /**
   * Reads this row's value for a given tracker header name.
   * @param {string} headerName - One of Config.TRACKER_HEADERS values.
   * @returns {*} The raw cell value, or null if the header does not exist.
   */
  get(headerName) {
    if (!Utils.hasColumn(this.headerMap, headerName)) return null;
    const columnIndex = Utils.findColumn(this.headerMap, headerName);
    return this.rowValues[columnIndex - 1];
  }
}

class DataService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  _getTrackerSheet() {
    const sheet = this.spreadsheet.getSheetByName(Config.TRACKER_SHEET_NAME);
    if (!sheet) {
      throw new UserFacingError(`Không tìm thấy sheet "${Config.TRACKER_SHEET_NAME}".`);
    }
    return sheet;
  }

  /**
   * Reads every real tool row from the tracker in one batch call, skipping
   * section-divider rows and fully-blank rows, and tagging each row with
   * the section it belongs to.
   *
   * A row is treated as a section divider when its "Brand" cell has a value
   * but its "Type" cell is empty - this matches every observed divider row
   * ("M8 TECH", "Martech", "M6 TECH") while every real tool row always has
   * "Type" filled in ("Tool"/"Software").
   *
   * @returns {{records: ToolRecord[], headerMap: Object<string, number>}}
   * @private
   */
  _readAllRows() {
    const sheet = this._getTrackerSheet();
    const requiredHeaders = Object.values(Config.TRACKER_HEADERS);

    const headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    const headerMap = Utils.getHeaderMap(sheet, headerRowIndex);

    // Fail fast with one clear, combined message if the tracker is missing
    // any required column (spec: "Nếu thiếu Header -> báo lỗi rõ ràng").
    Utils.assertHeadersExist(headerMap, requiredHeaders, Config.TRACKER_SHEET_NAME);

    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    if (lastRow <= headerRowIndex) {
      return { records: [], headerMap };
    }

    // Single batched read for the entire data area.
    const values = sheet.getRange(headerRowIndex + 1, 1, lastRow - headerRowIndex, lastColumn).getValues();

    const brandColumnIndex = Utils.findColumn(headerMap, Config.TRACKER_HEADERS.BRAND);
    const typeColumnIndex = Utils.findColumn(headerMap, Config.TRACKER_HEADERS.TYPE);

    const records = [];
    let currentSection = Config.DEFAULT_SECTION_POSITION;
    let skippedEmptyRowCount = 0;

    values.forEach((rowValues) => {
      const brand = rowValues[brandColumnIndex - 1];
      const type = rowValues[typeColumnIndex - 1];

      // A row is only treated as real tool data when its "Brand" cell is
      // non-empty. This intentionally REPLACES a naive "every cell is
      // blank" check: checkbox cells are always a boolean TRUE/FALSE, never
      // truly empty, so a row can look "non-blank" purely because it still
      // carries a checkbox value - even when every other cell (Brand, Type,
      // cost, ...) is empty. That mismatch is exactly what let far-below,
      // never-really-used rows (e.g. after a checkbox column was
      // accidentally drag-filled way past the real data) be miscounted as
      // "approved tools" with no actual data to write.
      const hasBrand = Boolean(String(brand || '').trim());
      if (!hasBrand) {
        skippedEmptyRowCount++;
        return;
      }

      const isSectionDividerRow = !type;
      if (isSectionDividerRow) {
        currentSection = String(brand).trim();
        return;
      }

      records.push(new ToolRecord(rowValues, headerMap, currentSection));
    });

    if (skippedEmptyRowCount > 0) {
      AppLogger.info(`DataService._readAllRows: bỏ qua ${skippedEmptyRowCount} dòng trống (không có "Brand").`);
    }

    return { records, headerMap };
  }

  /**
   * Returns only the tool records whose "Request Gia hạn {monthCode}"
   * checkbox is checked (TRUE) - these are the tools Admin approved for a
   * renewal payment request this cycle.
   * @param {string} monthCode - e.g. "T9".
   * @returns {ToolRecord[]}
   */
  getApprovedTools(monthCode) {
    try {
      const { records, headerMap } = this._readAllRows();
      const checkboxHeader = `${Config.REQUEST_CHECKBOX_PREFIX}${monthCode}`;

      if (!Utils.hasColumn(headerMap, checkboxHeader)) {
        throw new UserFacingError(
          `Không tìm thấy cột "${checkboxHeader}" trong sheet "${Config.TRACKER_SHEET_NAME}". ` +
            'Vui lòng thêm cột checkbox này trước khi tạo Request.'
        );
      }

      const approvedTools = records.filter((record) => record.get(checkboxHeader) === true);
      AppLogger.info(
        `DataService.getApprovedTools: "${checkboxHeader}" -> ${approvedTools.length}/${records.length} tool được tick.`
      );
      if (approvedTools.length > 0) {
        const brandColumnName = Config.TRACKER_HEADERS.BRAND;
        const approvedBrandList = approvedTools.map((tool) => tool.get(brandColumnName)).join(', ');
        AppLogger.info(`DataService.getApprovedTools: danh sách tool được tick -> ${approvedBrandList}`);
      }
      return approvedTools;
    } catch (error) {
      Utils.rethrow(error, 'DataService.getApprovedTools');
    }
  }
}

```

---

## 5. Tạo file `TemplateService` — dán TOÀN BỘ khối dưới

```javascript
/**
 * TemplateService.gs
 * ---------------------------------------------------------------------------
 * Owns everything about locating and duplicating the monthly request-sheet
 * TEMPLATE. The actual duplication is delegated to Utils.copyTemplate()
 * (which uses the native Sheet.copyTo() API), so format, formulas, merges,
 * data validation, conditional formatting, filters, frozen rows/columns and
 * hidden rows/columns are ALL preserved automatically - nothing is ever
 * rebuilt by code, per the project requirement.
 *
 * This class only decides WHICH sheet is the correct template to copy from
 * ("tháng gần nhất" - the closest existing month sheet before the target
 * month) and exposes small helpers for checking/removing an existing sheet
 * with the target name.
 */

class TemplateService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * @param {string} sheetName
   * @returns {boolean} True if a sheet with this exact name already exists.
   */
  sheetExists(sheetName) {
    return Boolean(this.spreadsheet.getSheetByName(sheetName));
  }

  /**
   * Deletes the sheet with the given name, if it exists. Used right before
   * re-creating it, after the admin confirms the overwrite.
   * @param {string} sheetName
   */
  deleteSheetIfExists(sheetName) {
    const sheet = this.spreadsheet.getSheetByName(sheetName);
    if (sheet) this.spreadsheet.deleteSheet(sheet);
  }

  /**
   * Finds the most recent existing request sheet ("T{n}.{yyyy}", or a
   * common prefixed variant such as "Copy of T{n}.{yyyy}" / "Dev SEO
   * T{n}.{yyyy}") that is chronologically BEFORE the given target
   * month/year - i.e. "tháng gần nhất" relative to the month being
   * generated. This is dynamic on purpose: if an admin ever skips a month,
   * the tool still finds the closest real template instead of assuming a
   * fixed "target - 1" name.
   *
   * Fallback: if no earlier-month sheet exists, reuse a same-month sheet
   * that was renamed away from the canonical target name (e.g. "Copy of
   * T8.2026" when generating "T8.2026"). Without this, a duplicated tab
   * left the workbook with zero matchable templates and threw
   * "Không tìm thấy Template.".
   * @param {number} targetMonth - 1-12.
   * @param {number} targetYear
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @throws {UserFacingError} When no eligible template sheet exists.
   */
  findLatestTemplateSheet(targetMonth, targetYear) {
    const targetOrdinal = targetYear * 12 + targetMonth;
    const targetCanonicalName = `${Config.REQUEST_SHEET_PREFIX}${targetMonth}.${targetYear}`;

    let bestBeforeSheet = null;
    let bestBeforeOrdinal = -Infinity;
    let sameMonthAlternateSheet = null;

    this.spreadsheet.getSheets().forEach((sheet) => {
      const name = sheet.getName();
      const parsed = Utils.matchRequestSheetName(name);
      if (!parsed) return;

      const ordinal = parsed.year * 12 + parsed.month;
      if (ordinal < targetOrdinal && ordinal > bestBeforeOrdinal) {
        bestBeforeOrdinal = ordinal;
        bestBeforeSheet = sheet;
        return;
      }

      // Same month/year but not the exact canonical target name - e.g.
      // "Copy of T8.2026" while we are about to create "T8.2026".
      if (ordinal === targetOrdinal && name !== targetCanonicalName) {
        sameMonthAlternateSheet = sheet;
      }
    });

    const templateSheet = bestBeforeSheet || sameMonthAlternateSheet;
    if (!templateSheet) {
      throw new UserFacingError(
        `Không tìm thấy Template (cần sheet dạng "T{n}.{yyyy}" hoặc "... T{n}.{yyyy}" trước tháng ${targetCanonicalName}).`
      );
    }
    return templateSheet;
  }

  /**
   * Creates the new month's sheet by copying the closest existing template
   * sheet, renaming it, and placing it right after the template.
   * @param {string} newSheetName - e.g. "T9.2026".
   * @param {number} targetMonth
   * @param {number} targetYear
   * @returns {GoogleAppsScript.Spreadsheet.Sheet} The newly created sheet.
   */
  createSheetFromTemplate(newSheetName, targetMonth, targetYear) {
    try {
      const templateSheet = this.findLatestTemplateSheet(targetMonth, targetYear);
      AppLogger.info(`TemplateService: copying template "${templateSheet.getName()}" -> "${newSheetName}".`);
      return Utils.copyTemplate(this.spreadsheet, templateSheet, newSheetName);
    } catch (error) {
      Utils.rethrow(error, 'TemplateService.createSheetFromTemplate');
    }
  }
}

```

---

## 6. Tạo file `SheetGenerator` — dán TOÀN BỘ khối dưới

```javascript
/**
 * SheetGenerator.gs
 * ---------------------------------------------------------------------------
 * Populates an ALREADY-CREATED (copied-from-template) monthly request sheet
 * with new rows. The writable data area is discovered dynamically - the
 * data END is always "the row directly above TOTAL", and the data START
 * comes from the TOTAL row's own SUM formula (e.g. "=sum(H3:H11)" -> data
 * starts at row 3) - so there is no hardcoded row number anywhere, and the
 * range always matches exactly what the template author defined for that
 * specific month. See Utils.findDataRangeFromTotalFormula() for why the
 * data END is no longer taken from the formula's own end-of-range reference.
 *
 * When more rows are required than are currently available, new rows are
 * inserted directly above the TOTAL row via Sheet.insertRowsBefore(), and
 * every formula in the TOTAL row that references a range is EXPLICITLY
 * rewritten (_growTotalFormulas()) to cover the grown range - Google Sheets
 * does NOT reliably auto-expand a SUM formula's range when MULTIPLE rows
 * are inserted in a single insertRowsBefore(row, n) call (confirmed by a
 * real bug: a formula stayed exactly "=sum(H3:H12)" after 8 more rows were
 * inserted above it for 8 extra tools, silently excluding them from the
 * sheet's own TOTAL cell), so this class can no longer assume that behaviour.
 */

class SheetGenerator {
  /** @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The freshly copied month sheet. */
  constructor(sheet) {
    this.sheet = sheet;

    const requiredHeaders = Object.values(Config.REQUEST_HEADERS);
    this.headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    this.headerMap = Utils.getHeaderMap(sheet, this.headerRowIndex);

    Utils.assertHeadersExist(this.headerMap, requiredHeaders, sheet.getName());
  }

  /**
   * @returns {Object<string, number>} The request sheet's header map.
   */
  getHeaderMap() {
    return this.headerMap;
  }

  /**
   * Locates the TOTAL row and reads its data-range from the SUM formula.
   * Delegates to Utils - the exact same logic MessageService uses to READ
   * this sheet later, so both classes always agree on which rows are data.
   * @returns {number} 1-based row index.
   * @private
   */
  _findTotalRowIndex() {
    return Utils.findTotalRowIndex(this.sheet, this.headerMap, this.headerRowIndex);
  }

  /**
   * @param {number} totalRowIndex
   * @returns {{startRow: number, endRow: number}}
   * @private
   */
  _findDataRange(totalRowIndex) {
    return Utils.findDataRangeFromTotalFormula(this.sheet, this.headerMap, totalRowIndex);
  }

  /**
   * Grows the data range - by inserting blank rows directly above the TOTAL
   * row - when there are more approved tools than currently-available rows.
   * The newly inserted rows inherit the formatting of the row above them
   * (native Apps Script behaviour). The TOTAL row's own formula(s) are then
   * EXPLICITLY rewritten via _growTotalFormulas() - see this file's header
   * comment for why native auto-expansion can no longer be trusted here.
   * @param {number} totalRowIndex
   * @param {{startRow:number, endRow:number}} dataRange
   * @param {number} requiredRowCount
   * @returns {{startRow:number, endRow:number}} The (possibly grown) data range.
   * @private
   */
  _ensureCapacity(totalRowIndex, dataRange, requiredRowCount) {
    const availableRowCount = dataRange.endRow - dataRange.startRow + 1;
    const missingRowCount = requiredRowCount - availableRowCount;
    if (missingRowCount <= 0) return dataRange;

    this.sheet.insertRowsBefore(totalRowIndex, missingRowCount);
    const newTotalRowIndex = totalRowIndex + missingRowCount;
    const newDataRange = { startRow: dataRange.startRow, endRow: dataRange.endRow + missingRowCount };

    this._growTotalFormulas(newTotalRowIndex, newDataRange.endRow);

    AppLogger.info(
      `SheetGenerator: inserted ${missingRowCount} row(s) before the TOTAL row to fit ${requiredRowCount} tool(s), ` +
        `and grew the TOTAL row's formula(s) to match.`
    );
    return newDataRange;
  }

  /**
   * Rewrites every formula in the TOTAL row that references a `START:END`
   * range (e.g. "=sum(H3:H12)" -> "=sum(H3:H20)"), extending ONLY the end
   * of the range to `newEndRow` while keeping the start row and everything
   * else about the formula untouched. Cells in the TOTAL row that do NOT
   * contain such a formula (the "TOTAL" label itself, blank cells, ...) are
   * never written to - `getFormula()` returns '' for those, which is
   * filtered out before any write happens.
   * @param {number} totalRowIndex - The TOTAL row's index AFTER insertion.
   * @param {number} newEndRow - The new last data row (totalRowIndex - 1).
   * @private
   */
  _growTotalFormulas(totalRowIndex, newEndRow) {
    const lastColumn = this.sheet.getLastColumn();
    const rowRange = this.sheet.getRange(totalRowIndex, 1, 1, lastColumn);
    const formulas = rowRange.getFormulas()[0];

    formulas.forEach((formula, offset) => {
      if (!formula) return; // Not a formula cell (label/blank) - leave untouched.

      const match = formula.match(/([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/);
      if (!match) return; // Formula doesn't reference a START:END range - leave untouched.

      const [, startCol, startRowText, endCol] = match;
      const rewritten = formula.replace(
        /([A-Za-z]+)(\d+):([A-Za-z]+)(\d+)/,
        `${startCol}${startRowText}:${endCol}${newEndRow}`
      );
      this.sheet.getRange(totalRowIndex, offset + 1).setFormula(rewritten);
    });
  }

  /**
   * Writes the mapped request rows into the sheet:
   *   1. Clears the previous month's leftover data (content only).
   *   2. Grows the data range if needed.
   *   3. Writes every row in a SINGLE batched setValues() call.
   * The TOTAL row and its formulas are never touched directly.
   * @param {Array<Array<*>>} rowValues - One row per approved tool, ordered
   *   exactly like Config.COLUMN_MAPPING.
   * @returns {number} Number of rows written.
   */
  writeRequestRows(rowValues) {
    try {
      const totalRowIndex = this._findTotalRowIndex();
      let dataRange = this._findDataRange(totalRowIndex);
      const columnCount = this.sheet.getLastColumn();

      dataRange = this._ensureCapacity(totalRowIndex, dataRange, rowValues.length);

      // Wipe ALL of last month's data first - formatting/validation stays,
      // only the cell content is cleared.
      Utils.clearOldData(this.sheet, dataRange.startRow, dataRange.endRow, columnCount);

      if (rowValues.length > 0) {
        this.sheet.getRange(dataRange.startRow, 1, rowValues.length, rowValues[0].length).setValues(rowValues);
      }

      AppLogger.info(`SheetGenerator: wrote ${rowValues.length} row(s) into sheet "${this.sheet.getName()}".`);
      return rowValues.length;
    } catch (error) {
      Utils.rethrow(error, 'SheetGenerator.writeRequestRows');
    }
  }
}

```

---

## 7. Tạo file `RequestService` — dán TOÀN BỘ khối dưới

```javascript
/**
 * RequestService.gs
 * ---------------------------------------------------------------------------
 * Orchestrates the full "Generate Request Sheet" business flow described in
 * the spec:
 *   1. Determine the target month (the month AFTER today).
 *   2. Read the tracker and collect the approved (ticked) tools; abort with
 *      a clear message if none were selected.
 *   3. If the target sheet already exists, ask for overwrite confirmation.
 *   4. Copy the closest existing template sheet (format/formulas/etc kept
 *      100% intact).
 *   5. Map every approved tool into a request-sheet row per
 *      Config.COLUMN_MAPPING (Header-Name-based, never hardcoded).
 *   6. Hand the rows to SheetGenerator to write in one batch.
 *
 * This is the ONLY class that knows the ORDER of these steps; each step's
 * actual implementation lives in its own single-responsibility class
 * (DataService, TemplateService, SheetGenerator).
 */

class RequestService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
    this.dataService = new DataService(spreadsheet);
    this.templateService = new TemplateService(spreadsheet);
  }

  /**
   * Runs the entire generate-request-sheet flow.
   * @returns {{sheetName:string, toolCount:number}|null} A summary for the
   *   final success dialog, or null if the admin cancelled an overwrite
   *   confirmation (in which case nothing was changed).
   */
  generateRequestSheet() {
    const today = new Date();
    const targetSheetName = Utils.getNextMonthSheetName(today);
    const targetMonthCode = Utils.getNextMonthCode(today);
    const { month: targetMonth, year: targetYear } = Utils.parseSheetName(targetSheetName);

    AppLogger.info(
      `RequestService: generating "${targetSheetName}" (checkbox "${Config.REQUEST_CHECKBOX_PREFIX}${targetMonthCode}").`
    );

    // Step 2 is performed FIRST (before touching any sheet) so a "no tool
    // selected" failure never leaves a half-created sheet behind.
    const approvedTools = this.dataService.getApprovedTools(targetMonthCode);
    if (approvedTools.length === 0) {
      throw new UserFacingError('Không có Tool nào được chọn để tạo Request.');
    }

    // Step 3: confirm before overwriting an existing sheet.
    if (this.templateService.sheetExists(targetSheetName)) {
      const confirmed = Utils.showConfirm('Sheet đã tồn tại.', 'Bạn có muốn ghi đè không?');
      if (!confirmed) {
        AppLogger.info('RequestService: cancelled by admin (sheet already exists, overwrite declined).');
        return null;
      }
      this.templateService.deleteSheetIfExists(targetSheetName);
    }

    // Step 4: copy the closest existing template sheet.
    const newSheet = this.templateService.createSheetFromTemplate(targetSheetName, targetMonth, targetYear);

    // Step 5: map tracker rows -> request rows.
    const rowValues = approvedTools.map((tool, index) => this._buildRequestRow(tool, index + 1));

    // Step 6: write everything in a single batched call.
    const sheetGenerator = new SheetGenerator(newSheet);
    const writtenRowCount = sheetGenerator.writeRequestRows(rowValues);

    AppLogger.info(`RequestService: done - ${writtenRowCount} tool(s) written to "${targetSheetName}".`);
    return { sheetName: targetSheetName, toolCount: writtenRowCount };
  }

  /**
   * Builds one request-sheet row (ordered exactly like Config.COLUMN_MAPPING)
   * from a single tracker ToolRecord.
   * @param {ToolRecord} tool
   * @param {number} sequenceNumber - 1-based STT value for this row.
   * @returns {Array<*>}
   * @private
   */
  _buildRequestRow(tool, sequenceNumber) {
    return Config.COLUMN_MAPPING.map((columnRule) => this._resolveColumnValue(columnRule, tool, sequenceNumber));
  }

  /**
   * Resolves a single cell's value according to its mapping strategy (see
   * Config.COLUMN_MAPPING for the full list of supported strategies).
   * @param {Object} columnRule
   * @param {ToolRecord} tool
   * @param {number} sequenceNumber
   * @returns {*}
   * @private
   */
  _resolveColumnValue(columnRule, tool, sequenceNumber) {
    switch (columnRule.strategy) {
      case 'SEQUENCE':
        return sequenceNumber;

      case 'SOURCE':
        return tool.get(columnRule.sourceHeader) ?? '';

      case 'TRANSFORM': {
        const rawValue = tool.get(columnRule.sourceHeader);
        return (columnRule.map && columnRule.map[rawValue]) || columnRule.fallback || '';
      }

      case 'SECTION': {
        const sectionKey = String(tool.section || '').toUpperCase();
        return Config.SECTION_POSITION_MAP[sectionKey] || tool.section || Config.DEFAULT_SECTION_POSITION;
      }

      case 'CONSTANT':
        return columnRule.value;

      case 'MANUAL':
        return '';

      default:
        throw new Error(`RequestService._resolveColumnValue: unknown mapping strategy "${columnRule.strategy}".`);
    }
  }
}

```

---

## 8. Tạo file `MessageService` — dán TOÀN BỘ khối dưới

```javascript
/**
 * MessageService.gs
 * ---------------------------------------------------------------------------
 * Builds ready-to-paste approval messages ("Lead duyệt" / "Head duyệt") from
 * an ALREADY-GENERATED-AND-EDITED monthly request sheet (T{n}.{yyyy}). This
 * class only READS that sheet and returns plain text - it never writes
 * anything back, unlike SheetGenerator/RequestService.
 *
 * Data source resolution (see _getRequestSheet):
 *   1. If the currently ACTIVE sheet's name matches "T{n}.{yyyy}", use it -
 *      the expected flow is Admin opens/edits the request sheet, then picks
 *      the menu item while still on that tab.
 *   2. Otherwise fall back to the most recently created request sheet in
 *      the spreadsheet, so the feature still works from any tab (e.g. the
 *      Tracker or the Dashboard).
 *
 * Grouping rule for the "Lead duyệt" message (per Admin's sample message):
 * tools are grouped by their "Loại thanh toán" value - Gia hạn / Mua mới /
 * Topup Credit (Config.PAYMENT_CATEGORY) - and, for the first two, further
 * sub-grouped by "Loại gia hạn" (Mua theo tháng / Mua theo năm / ...). The
 * "Head duyệt" message is a flat list instead (Head only needs the final
 * ID phiếu / BOKT link / amount to approve payment, not the renewal-type
 * breakdown Lead needs).
 */
class MessageService {
  /** @param {GoogleAppsScript.Spreadsheet.Spreadsheet} spreadsheet */
  constructor(spreadsheet) {
    this.spreadsheet = spreadsheet;
  }

  /**
   * Resolves the request sheet to read from - see class doc for the
   * resolution order.
   * @returns {GoogleAppsScript.Spreadsheet.Sheet}
   * @private
   */
  _getRequestSheet() {
    const activeSheet = this.spreadsheet.getActiveSheet();
    if (activeSheet && Utils.matchRequestSheetName(activeSheet.getName())) {
      return activeSheet;
    }

    let latestSheet = null;
    let latestOrdinal = -Infinity;
    this.spreadsheet.getSheets().forEach((sheet) => {
      const parsed = Utils.matchRequestSheetName(sheet.getName());
      if (!parsed) return;
      const ordinal = parsed.year * 12 + parsed.month;
      if (ordinal > latestOrdinal) {
        latestOrdinal = ordinal;
        latestSheet = sheet;
      }
    });

    if (!latestSheet) {
      throw new UserFacingError(
        `Không tìm thấy sheet Request nào (dạng "${Config.REQUEST_SHEET_PREFIX}n.yyyy" hoặc "... ${Config.REQUEST_SHEET_PREFIX}n.yyyy"). ` +
          'Vui lòng mở sheet Request cần tạo tin nhắn rồi thử lại.'
      );
    }
    return latestSheet;
  }

  /**
   * Reads every FILLED tool row (skips blank template slots past the last
   * real row) from the resolved request sheet, using the exact same
   * TOTAL-formula-derived data range SheetGenerator wrote into - so this
   * always matches what Admin actually generated/edited, never a stale or
   * guessed range.
   * @returns {{sheet: GoogleAppsScript.Spreadsheet.Sheet, tools: Array<Object>}}
   * @private
   */
  _readApprovalRows() {
    const sheet = this._getRequestSheet();
    const REQUEST = Config.REQUEST_HEADERS;
    const requiredHeaders = Object.values(REQUEST);

    const headerRowIndex = Utils.detectHeaderRow(sheet, requiredHeaders);
    const headerMap = Utils.getHeaderMap(sheet, headerRowIndex);
    Utils.assertHeadersExist(headerMap, requiredHeaders, sheet.getName());

    const totalRowIndex = Utils.findTotalRowIndex(sheet, headerMap, headerRowIndex);
    const { startRow, endRow } = Utils.findDataRangeFromTotalFormula(sheet, headerMap, totalRowIndex);
    const rowCount = endRow - startRow + 1;
    if (rowCount <= 0) {
      return { sheet, tools: [] };
    }

    const lastColumn = sheet.getLastColumn();
    const values = sheet.getRange(startRow, 1, rowCount, lastColumn).getValues();

    const nameIdx = Utils.findColumn(headerMap, REQUEST.TEN_TOOL) - 1;
    const qtyIdx = Utils.findColumn(headerMap, REQUEST.SO_LUONG) - 1;
    const paymentTypeIdx = Utils.findColumn(headerMap, REQUEST.LOAI_THANH_TOAN) - 1;
    const renewalTypeIdx = Utils.findColumn(headerMap, REQUEST.LOAI_GIA_HAN) - 1;
    const priceIdx = Utils.findColumn(headerMap, REQUEST.GIA_USD) - 1;
    const idBoktIdx = Utils.findColumn(headerMap, REQUEST.ID_BOKT) - 1;
    const reasonIdx = Utils.findColumn(headerMap, REQUEST.LY_DO) - 1;

    const tools = [];
    values.forEach((row) => {
      const tenTool = String(row[nameIdx] || '').trim();
      if (!tenTool) return; // Blank template slot - never filled this month.

      tools.push({
        tenTool,
        soLuong: row[qtyIdx] || 1,
        loaiThanhToan: String(row[paymentTypeIdx] || '').trim(),
        loaiGiaHan: String(row[renewalTypeIdx] || '').trim(),
        giaUsd: Number(row[priceIdx]) || 0,
        idPhieu: row[idBoktIdx] || '',
        lyDo: String(row[reasonIdx] || '').trim(),
      });
    });

    return { sheet, tools };
  }

  /**
   * Groups tools per Config.PAYMENT_CATEGORY_ORDER (Gia hạn -> Mua mới ->
   * Topup Credit), sub-grouping "Gia hạn"/"Mua mới" by "Loại gia hạn" so
   * each combination gets its own "📌 Loại: ..." header - mirroring Admin's
   * sample message exactly. Any "Loại thanh toán" outside those three
   * (including blank) still gets its own group instead of being dropped.
   * @param {Array<Object>} tools
   * @returns {Array<{header:string, tools:Array<Object>}>}
   * @private
   */
  _groupToolsForLeadMessage(tools) {
    const CATEGORY = Config.PAYMENT_CATEGORY;
    const orderedCategories = Config.PAYMENT_CATEGORY_ORDER;

    // Cluster by TOP-level category first (Gia hạn / Mua mới / Topup Credit
    // / other), in Config's display order - a stable sort keeps each
    // category's tools in their original sheet order, so sub-groups below
    // naturally appear in "first seen" order (e.g. "Mua theo tháng" before
    // "Mua theo năm") without hardcoding a cycle order.
    const sortedTools = [...tools].sort((toolA, toolB) => {
      const rank = (category) => {
        const index = orderedCategories.indexOf(category);
        return index === -1 ? orderedCategories.length : index;
      };
      return rank(toolA.loaiThanhToan) - rank(toolB.loaiThanhToan);
    });

    const groups = [];
    const groupIndexByHeader = new Map();
    const pushToGroup = (header, tool) => {
      if (!groupIndexByHeader.has(header)) {
        groupIndexByHeader.set(header, groups.length);
        groups.push({ header, tools: [] });
      }
      groups[groupIndexByHeader.get(header)].tools.push(tool);
    };

    sortedTools.forEach((tool) => {
      if (tool.loaiThanhToan === CATEGORY.TOPUP_CREDIT) {
        pushToGroup('📌 Loại: Mua topup credit', tool);
        return;
      }

      if (tool.loaiThanhToan === CATEGORY.GIA_HAN || tool.loaiThanhToan === CATEGORY.MUA_MOI) {
        const cycleLabel = tool.loaiGiaHan;
        const header = cycleLabel ? `📌 Loại: ${cycleLabel} - ${tool.loaiThanhToan}` : `📌 Loại: ${tool.loaiThanhToan}`;
        pushToGroup(header, tool);
        return;
      }

      // Fallback for any "Loại thanh toán" outside the 3 known ones
      // (including blank, if Admin has not picked one yet) - still shown.
      pushToGroup(`📌 Loại: ${tool.loaiThanhToan || 'Chưa phân loại'}`, tool);
    });

    return groups;
  }

  /**
   * Builds the "Lead duyệt" approval message.
   * @returns {{sheetName:string, message:string, toolCount:number, totalUsd:number}}
   */
  buildLeadApprovalMessage() {
    try {
      const { sheet, tools } = this._readApprovalRows();
      if (tools.length === 0) {
        throw new UserFacingError(`Sheet "${sheet.getName()}" chưa có dữ liệu Tool nào để tạo tin nhắn.`);
      }

      const { month, year } = Utils.parseSheetName(sheet.getName());
      const groups = this._groupToolsForLeadMessage(tools);
      const totalUsd = tools.reduce((sum, tool) => sum + tool.giaUsd, 0);

      const lines = [];
      lines.push(`Chi phí mua tool cho team ${Config.MESSAGE_TEAM_LABEL} - File Tools request - T${month}/${year}`);
      lines.push('');

      groups.forEach((group) => {
        lines.push(group.header);
        lines.push('=====');
        group.tools.forEach((tool, index) => {
          lines.push(`${index + 1}. ${tool.tenTool}`);
          lines.push(`- Số lượng: ${tool.soLuong}`);
          lines.push(`- ID phiếu: ${tool.idPhieu}`);
          const note = tool.lyDo ? ` (${tool.lyDo})` : '';
          lines.push(`- Chi phí: ${Utils.formatUsdAmount(tool.giaUsd)}${note}`);
          if (index < group.tools.length - 1) lines.push('');
        });
        lines.push('=====');
      });

      lines.push('');
      lines.push(`=> TỔNG CẦN THANH TOÁN: ${Utils.formatUsdAmount(totalUsd)}`);
      lines.push('=====');
      lines.push('');
      lines.push(Config.MESSAGE_LEAD_CLOSING);

      const message = lines.join('\n');
      AppLogger.info(
        `MessageService.buildLeadApprovalMessage: "${sheet.getName()}" - ${tools.length} tool(s), tổng ${totalUsd} USD.`
      );
      return { sheetName: sheet.getName(), message, toolCount: tools.length, totalUsd };
    } catch (error) {
      Utils.rethrow(error, 'MessageService.buildLeadApprovalMessage');
    }
  }

  /**
   * Builds the "Head duyệt" approval message - a flat, NUMBERED list of
   * every tool (no category grouping), since Head only needs the ID phiếu
   * / BOKT link / amount to approve payment. Each entry is exactly 2 lines
   * ("N. ID phiếu: ... - Tên tool - Giá" then "Link BOKT: ") with NO blank
   * line between entries - Admin fills the real BOKT link in by hand right
   * after "Link BOKT:" for each one before sending.
   * @returns {{sheetName:string, message:string, toolCount:number, totalUsd:number}}
   */
  buildHeadApprovalMessage() {
    try {
      const { sheet, tools } = this._readApprovalRows();
      if (tools.length === 0) {
        throw new UserFacingError(`Sheet "${sheet.getName()}" chưa có dữ liệu Tool nào để tạo tin nhắn.`);
      }

      const { month, year } = Utils.parseSheetName(sheet.getName());
      const totalUsd = tools.reduce((sum, tool) => sum + tool.giaUsd, 0);

      const lines = [];
      lines.push(`📌 Chi phí mua tool cho team ${Config.MESSAGE_TEAM_LABEL} - File Tools request - T${month}/${year}`);
      lines.push('');

      tools.forEach((tool, index) => {
        lines.push(`${index + 1}. ID phiếu: ${tool.idPhieu} - ${tool.tenTool} - ${Utils.formatUsdAmount(tool.giaUsd)}`);
        lines.push(`Link BOKT: ${Config.MESSAGE_BOKT_LINK_PLACEHOLDER}`);
      });

      lines.push('');
      lines.push(`=> TỔNG CẦN THANH TOÁN: ${Utils.formatUsdAmount(totalUsd)}`);
      lines.push('');
      lines.push(Config.MESSAGE_HEAD_CLOSING);

      const message = lines.join('\n');
      AppLogger.info(
        `MessageService.buildHeadApprovalMessage: "${sheet.getName()}" - ${tools.length} tool(s), tổng ${totalUsd} USD.`
      );
      return { sheetName: sheet.getName(), message, toolCount: tools.length, totalUsd };
    } catch (error) {
      Utils.rethrow(error, 'MessageService.buildHeadApprovalMessage');
    }
  }
}

```

---

## 9. Tạo file `NewToolRequestService` — dán TOÀN BỘ khối dưới

```javascript
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

```

---

## 10. Tạo file `Menu` — dán TOÀN BỘ khối dưới

```javascript
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
      .addItem(Config.MENU_ITEM_LEAD_MESSAGE, 'onCreateLeadMessageClick')
      .addItem(Config.MENU_ITEM_HEAD_MESSAGE, 'onCreateHeadMessageClick')
      .addItem(Config.MENU_ITEM_NEW_TOOL_REQUEST, 'onCreateNewToolRequestClick')
      // Future menu items can be appended here, e.g.:
      // .addItem('Generate BOKT', 'onGenerateBoktClick')
      // .addItem('Archive Sheet', 'onArchiveSheetClick')
      .addToUi();
  } catch (error) {
    console.error(`onOpen: ${error.message}`);
  }
}

```

---

## 11. Tạo file `Code` — dán TOÀN BỘ khối dưới

```javascript
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

/**
 * Menu handler for "Admin Tools -> Tạo tin nhắn Request mua Tool mới".
 * Opens NewToolRequestService's input-form dialog. Unlike every other menu
 * handler in this file, no sheet is read here - the form itself calls
 * buildNewToolRequestMessage() (below) via google.script.run and swaps to
 * a copyable result view in-place, so this function's only job is to show
 * the initial HTML.
 */
function onCreateNewToolRequestClick() {
  try {
    const html = NewToolRequestService.getFormHtml();
    const output = HtmlService.createHtmlOutput(html).setWidth(480).setHeight(680);
    SpreadsheetApp.getUi().showModalDialog(output, '🆕 Request mua Tool mới');
  } catch (error) {
    AppLogger.error(`onCreateNewToolRequestClick: ${error.message}`);
    Utils.showAlert('Đã xảy ra lỗi', error.message);
  }
}

/**
 * google.script.run endpoint called by NewToolRequestService.getFormHtml()'s
 * client-side JS when Admin clicks "Tạo tin nhắn". Must be a top-level
 * function (google.script.run cannot call a class's static method
 * directly) - deliberately does NOT catch errors with Utils.showAlert()
 * like every other handler above: a thrown UserFacingError (e.g. a missing
 * required field) is serialized straight back to the dialog's own
 * withFailureHandler() and shown INLINE in the form, instead of stacking a
 * second alert dialog on top of the still-open form dialog.
 * @param {Object} formData - Raw field values submitted by the form.
 * @returns {{message: string}}
 */
function buildNewToolRequestMessage(formData) {
  return NewToolRequestService.buildMessage(formData);
}

```
