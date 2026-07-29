/**
 * DataAccess.gs
 * ---------------------------------------------------------------------------
 * Batch read/write against Tool Request + 2026. No per-cell getValue/setValue.
 */

/**
 * Validate that critical headers still match CONFIG expectations.
 * @throws {Error} when a required header is missing / renamed
 */
function assertSheetHeaders_() {
  const source = getSheetByName_(CONFIG.SOURCE_SHEET_NAME, true);
  const target = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);

  const sourceHeaders = source
    .getRange(CONFIG.HEADER_ROW, 1, 1, CONFIG.SOURCE_LAST_COL_INDEX + 1)
    .getValues()[0];
  const targetHeaders = target
    .getRange(CONFIG.HEADER_ROW, 1, 1, CONFIG.TARGET_NUM_COLS)
    .getValues()[0];

  const sourceProblems = matchHeaders_(sourceHeaders, CONFIG.EXPECTED_SOURCE_HEADERS, CONFIG.SOURCE_SHEET_NAME);
  const targetProblems = matchHeaders_(targetHeaders, CONFIG.EXPECTED_TARGET_HEADERS, CONFIG.TARGET_SHEET_NAME);

  const problems = sourceProblems.concat(targetProblems);
  if (problems.length) {
    throw new Error(
      'Cấu hình tiêu đề sheet không khớp:\n- ' + problems.join('\n- ')
    );
  }
}

/**
 * @param {*[]} headers
 * @param {Object<number,string>} expectedMap colIndex → normalized label
 * @param {string} sheetName
 * @returns {string[]}
 */
function matchHeaders_(headers, expectedMap, sheetName) {
  const problems = [];
  Object.keys(expectedMap).forEach((key) => {
    const idx = Number(key);
    const expected = expectedMap[key];
    const actual = normalizeHeaderKey_(headers[idx]);
    // Allow actual to contain expected (handles newlines / longer labels).
    if (!actual || (actual !== expected && actual.indexOf(expected) === -1 && expected.indexOf(actual) === -1)) {
      problems.push(
        `${sheetName} cột ${columnLetter_(idx + 1)}: kỳ vọng chứa "${expected}", thực tế "${headers[idx] || ''}"`
      );
    }
  });
  return problems;
}

/**
 * @param {number} col1Indexed
 * @returns {string}
 */
function columnLetter_(col1Indexed) {
  let n = col1Indexed;
  let letter = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/**
 * Read specific source rows (1-indexed row numbers) in one batch when contiguous,
 * otherwise group by contiguous blocks.
 * @param {number[]} rowNumbers
 * @returns {Object[]} records with {rowNumber, values[21]}
 */
function readSourceRows_(rowNumbers) {
  if (!rowNumbers || rowNumbers.length === 0) return [];

  const sheet = getSheetByName_(CONFIG.SOURCE_SHEET_NAME, true);
  const uniqueSorted = Array.from(new Set(rowNumbers.map(Number)))
    .filter((r) => r >= CONFIG.SOURCE_DATA_START_ROW)
    .sort((a, b) => a - b);

  if (uniqueSorted.length === 0) return [];

  const records = [];
  const blocks = groupContiguous_(uniqueSorted);

  blocks.forEach((block) => {
    const start = block[0];
    const numRows = block.length;
    const values = sheet
      .getRange(start, 1, numRows, CONFIG.SOURCE_LAST_COL_INDEX + 1)
      .getValues();
    for (let i = 0; i < values.length; i++) {
      records.push({
        rowNumber: start + i,
        values: values[i],
      });
    }
  });

  return records;
}

/**
 * Read every non-empty source data row up to the real last data row.
 * @returns {Object[]}
 */
function readAllSourceRows_() {
  const sheet = getSheetByName_(CONFIG.SOURCE_SHEET_NAME, true);
  const lastRow = findLastDataRow_(
    sheet,
    CONFIG.SOURCE_DATA_START_ROW,
    CONFIG.SOURCE_LAST_COL_INDEX + 1
  );
  if (lastRow < CONFIG.SOURCE_DATA_START_ROW) return [];

  const numRows = lastRow - CONFIG.SOURCE_DATA_START_ROW + 1;
  const values = sheet
    .getRange(CONFIG.SOURCE_DATA_START_ROW, 1, numRows, CONFIG.SOURCE_LAST_COL_INDEX + 1)
    .getValues();

  const records = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    // Skip completely blank rows.
    if (row.every((cell) => isBlank_(cell))) continue;
    records.push({
      rowNumber: CONFIG.SOURCE_DATA_START_ROW + i,
      values: row,
    });
  }
  return records;
}

/**
 * Build ID→row map for target sheet column E. Detect duplicate IDs.
 * @returns {{map: Map<string, number>, duplicates: Set<string>, lastDataRow: number}}
 */
function buildTargetIdMap_() {
  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const lastDataRow = findLastDataRow_(sheet, CONFIG.TARGET_DATA_START_ROW, CONFIG.TARGET_NUM_COLS);
  const map = new Map();
  const duplicates = new Set();

  if (lastDataRow < CONFIG.TARGET_DATA_START_ROW) {
    return { map, duplicates, lastDataRow };
  }

  const numRows = lastDataRow - CONFIG.TARGET_DATA_START_ROW + 1;
  // Read only ID column (E) — avoids scanning A:Y for single-row edits.
  const ids = sheet.getRange(CONFIG.TARGET_DATA_START_ROW, CONFIG.TARGET_COLS.ID_BOKT + 1, numRows, 1).getValues();

  for (let i = 0; i < ids.length; i++) {
    const id = normalizeId_(ids[i][0]);
    if (!id) continue;
    const absoluteRow = CONFIG.TARGET_DATA_START_ROW + i;
    if (map.has(id) || duplicates.has(id)) {
      duplicates.add(id);
      map.delete(id);
    } else {
      map.set(id, absoluteRow);
    }
  }

  return { map, duplicates, lastDataRow };
}

/**
 * Read full target rows (A:Y) for the given 1-indexed row numbers.
 * @param {number[]} rowNumbers
 * @returns {Map<number, *[]>} rowNumber → values
 */
function readTargetRows_(rowNumbers) {
  const result = new Map();
  if (!rowNumbers || rowNumbers.length === 0) return result;

  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const uniqueSorted = Array.from(new Set(rowNumbers.map(Number))).sort((a, b) => a - b);
  const blocks = groupContiguous_(uniqueSorted);

  blocks.forEach((block) => {
    const start = block[0];
    const values = sheet.getRange(start, 1, block.length, CONFIG.TARGET_NUM_COLS).getValues();
    for (let i = 0; i < values.length; i++) {
      result.set(start + i, values[i]);
    }
  });

  return result;
}

/**
 * Batch-insert new target rows after the current last data row.
 * @param {*[][]} rowsMatrix each row length = TARGET_NUM_COLS
 * @returns {number} first inserted absolute row number (or -1 if empty)
 */
function insertTargetRecords_(rowsMatrix) {
  if (!rowsMatrix || rowsMatrix.length === 0) return -1;

  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const lastDataRow = findLastDataRow_(sheet, CONFIG.TARGET_DATA_START_ROW, CONFIG.TARGET_NUM_COLS);
  const startRow = Math.max(lastDataRow + 1, CONFIG.TARGET_DATA_START_ROW);

  sheet.getRange(startRow, 1, rowsMatrix.length, CONFIG.TARGET_NUM_COLS).setValues(rowsMatrix);
  return startRow;
}

/**
 * Write updated full rows (A:Y) back to their absolute row indexes.
 * Uses contiguous blocks where possible.
 * @param {{rowNumber: number, values: *[]}[]} records
 */
function updateTargetRecords_(records) {
  if (!records || records.length === 0) return;

  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const sorted = records.slice().sort((a, b) => a.rowNumber - b.rowNumber);

  // Group contiguous rows that can be written with one setValues().
  let blockStartIdx = 0;
  while (blockStartIdx < sorted.length) {
    let blockEndIdx = blockStartIdx;
    while (
      blockEndIdx + 1 < sorted.length &&
      sorted[blockEndIdx + 1].rowNumber === sorted[blockEndIdx].rowNumber + 1
    ) {
      blockEndIdx++;
    }
    const block = sorted.slice(blockStartIdx, blockEndIdx + 1);
    const matrix = block.map((r) => r.values);
    sheet
      .getRange(block[0].rowNumber, 1, matrix.length, CONFIG.TARGET_NUM_COLS)
      .setValues(matrix);
    blockStartIdx = blockEndIdx + 1;
  }
}

/**
 * Group sorted integers into contiguous arrays.
 * @param {number[]} sortedNums
 * @returns {number[][]}
 */
function groupContiguous_(sortedNums) {
  const blocks = [];
  if (!sortedNums.length) return blocks;
  let current = [sortedNums[0]];
  for (let i = 1; i < sortedNums.length; i++) {
    if (sortedNums[i] === current[current.length - 1] + 1) {
      current.push(sortedNums[i]);
    } else {
      blocks.push(current);
      current = [sortedNums[i]];
    }
  }
  blocks.push(current);
  return blocks;
}

/**
 * Optional exact NCC lookup from `infor` sheet.
 * Expected cell format examples: "09DIG007 ADOBE" — match on trailing name.
 * @returns {Map<string, string>} normalizedName → full "CODE NAME"
 */
function loadNccLookupMap_() {
  const map = new Map();
  if (!CONFIG.NCC_LOOKUP.ENABLED) return map;

  const sheet = getSheetByName_(CONFIG.INFO_SHEET_NAME, false);
  if (!sheet) return map;

  const lastRow = findLastDataRow_(sheet, CONFIG.NCC_LOOKUP.DATA_START_ROW, CONFIG.NCC_LOOKUP.VALUE_COL + 1);
  if (lastRow < CONFIG.NCC_LOOKUP.DATA_START_ROW) return map;

  const numRows = lastRow - CONFIG.NCC_LOOKUP.DATA_START_ROW + 1;
  const values = sheet
    .getRange(CONFIG.NCC_LOOKUP.DATA_START_ROW, CONFIG.NCC_LOOKUP.VALUE_COL + 1, numRows, 1)
    .getValues();

  for (let i = 0; i < values.length; i++) {
    const raw = normalizeText_(values[i][0]);
    if (!raw) continue;
    // Split "CODE NAME..." → name is everything after first token.
    const spaceIdx = raw.indexOf(' ');
    const namePart = spaceIdx >= 0 ? raw.substring(spaceIdx + 1) : raw;
    const key = normalizeHeaderKey_(namePart);
    if (key && !map.has(key)) {
      map.set(key, raw);
    }
  }
  return map;
}
