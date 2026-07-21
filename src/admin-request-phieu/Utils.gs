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
   * Parses a request-sheet name such as "T9.2026" into its month/year parts.
   * @param {string} sheetName
   * @returns {{month:number, year:number}}
   */
  static parseSheetName(sheetName) {
    const pattern = new RegExp(`^${Config.REQUEST_SHEET_PREFIX}(\\d{1,2})\\.(\\d{4})$`, 'i');
    const match = String(sheetName || '').match(pattern);
    if (!match) {
      throw new Error(`Utils.parseSheetName: cannot parse sheet name "${sheetName}".`);
    }
    return { month: Number(match[1]), year: Number(match[2]) };
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
   * Formats a USD amount for chat messages - thousand separators, but no
   * forced trailing ".00" (matches the sample messages: "$497", "$220",
   * not "$497.00"), while still showing up to 2 decimals when the amount
   * actually has cents (e.g. "$20.9").
   * @param {number} amount
   * @returns {string} e.g. "$1,283.5".
   */
  static formatUsdAmount(amount) {
    try {
      const numeric = Number(amount) || 0;
      const formatted = numeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      return `$${formatted}`;
    } catch (error) {
      AppLogger.warning(`Utils.formatUsdAmount: ${error.message}`);
      return `$${amount}`;
    }
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
