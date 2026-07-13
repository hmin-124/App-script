/**
 * DataService.gs
 * ---------------------------------------------------------------------------
 * Chịu trách nhiệm DUY NHẤT cho việc đọc dữ liệu thô từ Google Sheet: tự dò
 * dòng header, map tên header -> chỉ số cột, và đọc các dòng người dùng đã
 * chọn bằng batch getValues() (không bao giờ getValue() từng ô/từng dòng).
 * Không xử lý format hay dựng tin nhắn ở file này.
 */

/**
 * Đại diện cho một dòng phiếu đã đọc từ sheet, truy cập qua tên trường
 * (ticketId, cost...) thay vì chỉ số cột — nhờ đó phần code phía trên
 * (MessageBuilder, Template) không cần biết cột nằm ở đâu.
 */
class TicketRecord {
  /**
   * @param {Object} fields
   * @param {string|number} fields.ticketId - Giá trị cột "ID phiếu".
   * @param {string} fields.content - Giá trị cột "Nội dung phiếu".
   * @param {number} fields.cost - Giá trị cột "Cost".
   * @param {string} fields.unit - Giá trị cột "DVT".
   * @param {string} fields.pic - Giá trị cột "PIC phiếu".
   * @param {number} fields.rowNumber - Số dòng (1-based) trên sheet, dùng để debug/báo lỗi.
   */
  constructor({ ticketId, content, cost, unit, pic, rowNumber }) {
    this.ticketId = ticketId;
    this.content = content || '';
    this.cost = Number(cost) || 0;
    this.unit = String(unit || '').trim();
    this.pic = String(pic || '').trim();
    this.rowNumber = rowNumber;
  }
}

/**
 * Đọc dữ liệu phiếu từ một Sheet, xác định vị trí cột hoàn toàn dựa trên
 * TÊN HEADER (không hardcode chỉ số/chữ cột).
 */
class DataService {
  /**
   * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Sheet cần đọc.
   */
  constructor(sheet) {
    if (!sheet) throw new Error('DataService: tham số "sheet" là bắt buộc.');
    this.sheet = sheet;
    this.headerRowIndex = this._detectHeaderRow();
    this.headerMap = this._buildHeaderMap(this.headerRowIndex);
  }

  /**
   * Chuẩn hóa text header để so khớp "khoan dung" (chấp nhận khác biệt về
   * khoảng trắng / xuống dòng / hoa-thường) giữa Config.HEADER_KEYS và
   * header thật trên sheet.
   * @param {*} rawHeader - Giá trị ô header thô.
   * @returns {string}
   */
  static normalizeHeader(rawHeader) {
    return String(rawHeader || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /**
   * Tự động dò dòng header thật của sheet, thay vì giả định luôn là dòng 1.
   * Cần thiết vì trong file dữ liệu thực tế, sheet "DIG1-ANW" có dòng 1 là
   * ô trống/merge, header thật nằm ở dòng 2.
   * @returns {number} Chỉ số dòng header (1-based).
   */
  _detectHeaderRow() {
    try {
      const lastRow = this.sheet.getLastRow();
      const lastColumn = this.sheet.getLastColumn();
      if (lastRow < 1 || lastColumn < 1) {
        throw new Error('Sheet không có dữ liệu.');
      }

      const searchLimit = Math.min(Config.HEADER_ROW_SEARCH_LIMIT, lastRow);
      const candidateValues = this.sheet.getRange(1, 1, searchLimit, lastColumn).getValues();
      const requiredKeys = Object.values(Config.HEADER_KEYS).map(DataService.normalizeHeader);

      let bestRow = 1;
      let bestScore = -1;
      candidateValues.forEach((rowValues, offset) => {
        const normalizedRow = rowValues.map(DataService.normalizeHeader);
        const score = requiredKeys.filter((key) => normalizedRow.includes(key)).length;
        if (score > bestScore) {
          bestScore = score;
          bestRow = offset + 1;
        }
      });

      if (bestScore <= 0) {
        throw new Error('Không tìm thấy dòng header phù hợp trong sheet.');
      }
      return bestRow;
    } catch (error) {
      throw new Error(`DataService._detectHeaderRow: ${error.message}`);
    }
  }

  /**
   * Dựng bảng map "header đã chuẩn hóa" -> chỉ số cột (1-based).
   * @param {number} headerRowIndex - Dòng header đã dò được.
   * @returns {Object<string, number>}
   */
  _buildHeaderMap(headerRowIndex) {
    try {
      const lastColumn = this.sheet.getLastColumn();
      const headerValues = this.sheet.getRange(headerRowIndex, 1, 1, lastColumn).getValues()[0];

      const map = {};
      headerValues.forEach((rawHeader, index) => {
        const normalized = DataService.normalizeHeader(rawHeader);
        if (normalized) map[normalized] = index + 1; // chỉ số cột 1-based
      });
      return map;
    } catch (error) {
      throw new Error(`DataService._buildHeaderMap: ${error.message}`);
    }
  }

  /**
   * Tra chỉ số cột (1-based) tương ứng với một khóa header logic.
   * @param {string} headerKey - Một trong các giá trị của Config.HEADER_KEYS.
   * @returns {number}
   */
  getColumnIndex(headerKey) {
    const normalized = DataService.normalizeHeader(headerKey);
    const columnIndex = this.headerMap[normalized];
    if (!columnIndex) {
      throw new Error(`DataService.getColumnIndex: Không tìm thấy cột "${headerKey}" trên sheet.`);
    }
    return columnIndex;
  }

  /**
   * Đọc toàn bộ các dòng người dùng đang chọn (có thể nhiều vùng chọn rời
   * rạc) và chuyển thành danh sách TicketRecord. Mỗi vùng chọn liên tục chỉ
   * gọi getValues() MỘT LẦN (batch) — không có bất kỳ vòng lặp getValue()
   * theo từng ô/từng dòng nào.
   * @param {GoogleAppsScript.Spreadsheet.RangeList} rangeList - Vùng chọn hiện tại.
   * @returns {TicketRecord[]} Danh sách phiếu, sắp theo thứ tự dòng trên sheet.
   */
  getTicketsFromRangeList(rangeList) {
    try {
      if (!rangeList) {
        throw new Error('Vui lòng chọn ít nhất một dòng dữ liệu trước khi tạo tin nhắn.');
      }

      const lastColumn = this.sheet.getLastColumn();
      const rowsByNumber = new Map();

      rangeList.getRanges().forEach((range) => {
        const startRow = range.getRow();
        const numRows = range.getNumRows();
        // Đọc trọn chiều rộng của các dòng được chọn trong MỘT lần gọi,
        // bất kể người dùng chỉ bôi đen một vài cột.
        const values = this.sheet.getRange(startRow, 1, numRows, lastColumn).getValues();

        values.forEach((rowValues, offset) => {
          const rowNumber = startRow + offset;
          if (rowNumber <= this.headerRowIndex) return; // bỏ qua dòng header/spacer nếu vô tình được chọn
          rowsByNumber.set(rowNumber, rowValues);
        });
      });

      const ticketIdCol = this.getColumnIndex(Config.HEADER_KEYS.TICKET_ID);
      const contentCol = this.getColumnIndex(Config.HEADER_KEYS.CONTENT);
      const costCol = this.getColumnIndex(Config.HEADER_KEYS.COST);
      const unitCol = this.getColumnIndex(Config.HEADER_KEYS.UNIT);
      const picCol = this.getColumnIndex(Config.HEADER_KEYS.PIC);

      const sortedRowNumbers = Array.from(rowsByNumber.keys()).sort((a, b) => a - b);

      const tickets = sortedRowNumbers
        .map((rowNumber) => {
          const rowValues = rowsByNumber.get(rowNumber);
          const ticketId = rowValues[ticketIdCol - 1];
          if (!ticketId) return null; // bỏ qua dòng trống lọt vào vùng chọn
          return new TicketRecord({
            ticketId,
            content: rowValues[contentCol - 1],
            cost: rowValues[costCol - 1],
            unit: rowValues[unitCol - 1],
            pic: rowValues[picCol - 1],
            rowNumber,
          });
        })
        .filter(Boolean);

      if (tickets.length === 0) {
        throw new Error('Không có phiếu hợp lệ trong vùng đã chọn (thiếu giá trị "ID phiếu").');
      }
      return tickets;
    } catch (error) {
      throw new Error(`DataService.getTicketsFromRangeList: ${error.message}`);
    }
  }
}
