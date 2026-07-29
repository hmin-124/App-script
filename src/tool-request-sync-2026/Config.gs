/**
 * Config.gs
 * ---------------------------------------------------------------------------
 * Single source of truth for sheet names, column indexes, defaults, quotas,
 * and feature flags. Business logic MUST read from CONFIG — never hardcode
 * sheet names / column letters / default values inline.
 *
 * Sheet 2026 column layout (after adding G – Tên tool):
 *   A Tháng | B/C Groups | D Team | E ID BOKT | F Ngày tạo phiếu (manual)
 *   G Tên tool (synced, parsed from Nội dung phiếu)
 *   H Channel | I Sub channel | J NCC (manual) | K Nội dung | …
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
    DETAIL: 3, // D → maps to Nội dung phiếu
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

  /** Target columns (0-indexed) — A:Z after inserting G Tên tool. */
  TARGET_COLS: {
    MONTH: 0, // A – insert only
    GROUP_INTERNAL: 1, // B – manual
    GROUP_BUY: 2, // C – manual
    TEAM: 3, // D – synced
    ID_BOKT: 4, // E – synced
    CREATED_AT: 5, // F – manual (Nhân viên điền)
    TOOL_NAME: 6, // G – synced (parse từ Nội dung phiếu)
    CHANNEL: 7, // H – insert only (default)
    SUB_CHANNEL: 8, // I – insert only (default)
    NCC: 9, // J – manual
    CONTENT: 10, // K – synced
    PAYMENT_INFO: 11, // L – synced
    COST: 12, // M – synced
    DVT: 13, // N – synced
    FX_RATE: 14, // O – manual
    AMOUNT: 15, // P – formula
    BRAND: 16, // Q – manual
    PIC: 17, // R – manual
    LEADER: 18, // S – manual
    A_ALEX: 19, // T – manual
    STATUS: 20, // U – manual (Admin)
    PAYMENT_TYPE: 21, // V – synced
    RENEWAL_TYPE: 22, // W – synced
    PREV_BOKT: 23, // X – manual
    NOTE: 24, // Y – manual
    USAGE_TIME: 25, // Z – synced
  },

  TARGET_NUM_COLS: 26, // A:Z

  /**
   * Columns employees fill manually on sheet 2026.
   * Sync NEVER writes these — preserves values, formulas, formatting,
   * checkboxes and data validation.
   */
  MANUAL_TARGET_COLS: [
    1, // B Group nội bộ duyệt
    2, // C Group Mua tool
    5, // F Ngày tạo phiếu
    9, // J NCC
    14, // O Tỷ giá
    15, // P Thành tiền (formula)
    16, // Q Brand
    17, // R PIC phiếu
    18, // S Leader
    19, // T A Alex
    20, // U Status (Admin update)
    23, // X ID BOKT tháng trước
    24, // Y Note
  ],

  /**
   * Columns written on INSERT only (defaults / first-create metadata).
   * Not overwritten on subsequent UPDATE.
   */
  INSERT_ONLY_TARGET_COLS: [
    0, // A Tháng
    7, // H Channel
    8, // I Sub channel
  ],

  /**
   * Columns that MAY be written on both INSERT and UPDATE (0-indexed).
   * Must not intersect MANUAL_TARGET_COLS.
   */
  UPDATABLE_TARGET_COLS: [
    3, // D Team QL
    4, // E ID BOKT
    6, // G Tên tool
    10, // K Nội dung phiếu
    11, // L Thông tin thanh toán
    12, // M Cost
    13, // N DVT
    21, // V Loại thanh toán
    22, // W Loại gia hạn
    25, // Z Thời gian sử dụng
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
    6: 'tên tool',
    10: 'nội dung phiếu',
    12: 'cost',
    13: 'dvt',
    21: 'loại thanh toán',
    22: 'loại gia hạn',
  },

  DEFAULT_VALUES: {
    CHANNEL: 'mkt0008',
    SUB_CHANNEL: 'Softwares Licenses',
  },

  /**
   * @deprecated FX / Thành tiền are manual + sheet formula — kept for
   * backward compatibility only; sync no longer writes those cols.
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
