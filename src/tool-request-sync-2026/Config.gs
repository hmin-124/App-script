/**
 * Config.gs
 * ---------------------------------------------------------------------------
 * Single source of truth for sheet names, column indexes, defaults, quotas,
 * and feature flags. Business logic MUST read from CONFIG — never hardcode
 * sheet names / column letters / default values inline.
 */

const CONFIG = {
  /** Source sheet (Tool Request form / catalog). */
  SOURCE_SHEET_NAME: 'Tool Request',

  /**
   * Destination sheet. Business name: "QUẢN LÝ TOOLS 2026".
   * Physical tab name in the workbook is currently "2026".
   */
  TARGET_SHEET_NAME: '2026',

  /** Sync activity log sheet (auto-created if missing). */
  LOG_SHEET_NAME: 'SYNC_LOG',

  /** Optional vendor lookup sheet (feature-flagged; not written to target). */
  INFO_SHEET_NAME: 'infor',

  /** First data row on each sheet (1-indexed). */
  SOURCE_DATA_START_ROW: 3,
  TARGET_DATA_START_ROW: 2,
  LOG_DATA_START_ROW: 2,

  /** Header row (1-indexed). */
  HEADER_ROW: 1,

  /** Source columns (0-indexed within getValues() arrays). */
  SOURCE_COLS: {
    STT: 0, // A
    TOOL_NAME: 1, // B
    PURPOSE: 2, // C
    DETAIL: 3, // D
    TEAM: 4, // E – Vị trí sử dụng
    PAYMENT_TYPE: 5, // F
    RENEWAL_TYPE: 6, // G
    PRICE_USD: 7, // H
    PRICE_VND: 8, // I
    QTY: 9, // J
    COST_FIRST_MONTH: 10, // K
    REMAIN_MONTHLY: 11, // L
    EMAIL: 12, // M
    ACTUAL_COST: 13, // N
    OVER_BUDGET: 14, // O
    REASON: 15, // P
    PAYMENT_INFO: 16, // Q
    INVOICE_LINK: 17, // R
    ID_BOKT: 18, // S
    PAYMENT_STATUS: 19, // T
    RENEWAL_DATE: 20, // U
  },

  /** Last source column index included in edit/sync scope (U = 20). */
  SOURCE_LAST_COL_INDEX: 20,

  /** Target columns (0-indexed). */
  TARGET_COLS: {
    MONTH: 0, // A
    GROUP_INTERNAL: 1, // B – manual
    GROUP_BUY: 2, // C – manual
    TEAM: 3, // D – synced
    ID_BOKT: 4, // E – synced
    CREATED_AT: 5, // F – insert only
    CHANNEL: 6, // G – insert only (default)
    SUB_CHANNEL: 7, // H – insert only (default)
    NCC: 8, // I – manual
    CONTENT: 9, // J – synced
    PAYMENT_INFO: 10, // K – synced
    COST: 11, // L – synced
    DVT: 12, // M – synced
    FX_RATE: 13, // N – manual
    AMOUNT: 14, // O – formula (manual / sheet formula)
    BRAND: 15, // P – manual
    PIC: 16, // Q – manual
    LEADER: 17, // R – manual
    A_ALEX: 18, // S – manual
    STATUS: 19, // T – manual (Admin)
    PAYMENT_TYPE: 20, // U – synced
    RENEWAL_TYPE: 21, // V – synced
    PREV_BOKT: 22, // W – manual
    NOTE: 23, // X – manual
    USAGE_TIME: 24, // Y – synced
  },

  TARGET_NUM_COLS: 25, // A:Y

  /**
   * Columns employees fill manually on sheet 2026.
   * Sync NEVER writes these — preserves values, formulas, formatting,
   * checkboxes and data validation (e.g. NCC dropdown, Thành tiền formula).
   */
  MANUAL_TARGET_COLS: [
    1, // B Group nội bộ duyệt
    2, // C Group Mua tool
    8, // I NCC
    13, // N Tỷ giá
    14, // O Thành tiền (formula)
    15, // P Brand
    16, // Q PIC phiếu
    17, // R Leader
    18, // S A Alex
    19, // T Status (Admin update)
    22, // W ID BOKT tháng trước
    23, // X Note
  ],

  /**
   * Columns written on INSERT only (defaults / first-create metadata).
   * Not overwritten on subsequent UPDATE.
   */
  INSERT_ONLY_TARGET_COLS: [
    0, // A Tháng
    5, // F Ngày tạo phiếu
    6, // G Channel
    7, // H Sub channel
  ],

  /**
   * Columns that MAY be written on both INSERT and UPDATE (0-indexed).
   * Must not intersect MANUAL_TARGET_COLS.
   */
  UPDATABLE_TARGET_COLS: [
    3, // D Team QL
    4, // E ID BOKT
    9, // J Nội dung phiếu
    10, // K Thông tin thanh toán
    11, // L Cost
    12, // M DVT
    20, // U Loại thanh toán
    21, // V Loại gia hạn
    24, // Y Thời gian sử dụng
  ],

  /**
   * Expected header labels used for configuration validation.
   * Comparison is normalizeText_ (trim + collapse spaces + lowercase).
   */
  EXPECTED_SOURCE_HEADERS: {
    1: 'tên tool',
    4: 'vị trí sử dụng',
    5: 'loại thanh toán',
    6: 'loại gia hạn',
    7: 'giá usd (bao gồm thuế)',
    8: 'giá vnd',
    16: 'thông tin thanh toán',
    18: 'id bokt',
    20: 'ngày gia hạn',
  },

  EXPECTED_TARGET_HEADERS: {
    3: 'team ql',
    4: 'id bokt',
    5: 'ngày tạo phiếu',
    9: 'nội dung phiếu',
    11: 'cost',
    12: 'dvt',
    20: 'loại thanh toán',
    21: 'loại gia hạn',
  },

  DEFAULT_VALUES: {
    CHANNEL: 'mkt0008',
    SUB_CHANNEL: 'Softwares Licenses',
  },

  /**
   * @deprecated FX / Thành tiền are manual + sheet formula — kept for
   * backward compatibility only; sync no longer writes N/O.
   */
  EXCHANGE_RATE: null,

  /** Lock wait (ms) before giving up on concurrent sync. */
  LOCK_WAIT_MS: 30000,

  /** Keep at most this many log rows (oldest trimmed). 0 = unlimited. */
  LOG_MAX_ROWS: 5000,

  MENU: {
    NAME: '🛠 TOOL MANAGEMENT',
    ITEMS: {
      SYNC_SELECTED: 'Đồng bộ dòng đang chọn',
      SYNC_ALL: 'Đồng bộ toàn bộ Tool Request',
      CHECK_DUPLICATES: 'Kiểm tra dữ liệu trùng',
      VIEW_LOG: 'Xem log đồng bộ',
      INSTALL_TRIGGER: 'Cài đặt trigger',
      REMOVE_TRIGGERS: 'Xóa trigger cũ',
    },
  },

  /** Installable onEdit handler function name (must match global function). */
  TRIGGER_HANDLER_NAME: 'handleToolRequestEdit',

  ACTIONS: {
    INSERT: 'INSERT',
    UPDATE: 'UPDATE',
    SKIP: 'SKIP',
    ERROR: 'ERROR',
    DUPLICATE: 'DUPLICATE',
  },

  RESULTS: {
    SUCCESS: 'SUCCESS',
    SKIPPED: 'SKIPPED',
    FAILED: 'FAILED',
    DUPLICATE: 'DUPLICATE',
  },

  /**
   * Optional NCC lookup against sheet `infor`.
   * Disabled — NCC on sheet 2026 is filled manually by staff.
   */
  NCC_LOOKUP: {
    ENABLED: false,
    VALUE_COL: 0,
    DATA_START_ROW: 2,
  },
};
