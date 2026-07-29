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
 * Scans by ID BOKT column only so pre-filled template rows (month +
 * checkbox false) do not inflate the working range.
 * @returns {{map: Map<string, number>, duplicates: Set<string>, lastDataRow: number}}
 */
function buildTargetIdMap_() {
  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const idCol = CONFIG.TARGET_COLS.ID_BOKT + 1;
  const lastDataRow = findLastRowByColumn_(sheet, CONFIG.TARGET_DATA_START_ROW, idCol);
  const map = new Map();
  const duplicates = new Set();

  if (lastDataRow < CONFIG.TARGET_DATA_START_ROW) {
    return { map, duplicates, lastDataRow };
  }

  const numRows = lastDataRow - CONFIG.TARGET_DATA_START_ROW + 1;
  const ids = sheet.getRange(CONFIG.TARGET_DATA_START_ROW, idCol, numRows, 1).getValues();

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
 * Allocate destination row numbers for N new records.
 * Reuses template rows whose ID BOKT (col E) is blank before appending
 * past the sheet's last row — avoids writing at I1001+ where dropdown
 * validation on NCC commonly rejects free-text tool names.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} count
 * @returns {number[]} absolute 1-indexed row numbers (length = count)
 */
function allocateTargetInsertRows_(sheet, count) {
  if (count <= 0) return [];

  const idCol = CONFIG.TARGET_COLS.ID_BOKT + 1;
  const start = CONFIG.TARGET_DATA_START_ROW;
  // Scan through the physical last row so blank ID slots inside the
  // pre-seeded template (often ~1000 rows) can be reused.
  const scanEnd = Math.max(sheet.getLastRow(), start - 1);
  const allocated = [];

  if (scanEnd >= start) {
    const numRows = scanEnd - start + 1;
    const ids = sheet.getRange(start, idCol, numRows, 1).getValues();
    for (let i = 0; i < ids.length && allocated.length < count; i++) {
      if (isBlank_(ids[i][0])) {
        allocated.push(start + i);
      }
    }
  }

  let nextAppend = Math.max(sheet.getLastRow() + 1, start);
  // Ensure append rows do not collide with already allocated template rows.
  if (allocated.length) {
    nextAppend = Math.max(nextAppend, allocated[allocated.length - 1] + 1);
  }
  while (allocated.length < count) {
    // Prefer the lowest unused append index.
    while (allocated.indexOf(nextAppend) !== -1) nextAppend++;
    allocated.push(nextAppend);
    nextAppend++;
  }

  return allocated;
}

/**
 * Insert records into sheet 2026 using sparse column patches.
 * Reuses blank ID BOKT template rows; never touches MANUAL columns so
 * checkboxes / NCC dropdown / Thành tiền formulas remain intact.
 * @param {Object<number, *>[]} patches insertPatch objects from MappingService
 * @returns {number[]} absolute row numbers written (same order as patches)
 */
function insertTargetRecords_(patches) {
  if (!patches || patches.length === 0) return [];

  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const targetRows = allocateTargetInsertRows_(sheet, patches.length);
  const allowed = CONFIG.UPDATABLE_TARGET_COLS.concat(CONFIG.INSERT_ONLY_TARGET_COLS);
  const payload = targetRows.map((rowNumber, idx) => ({
    rowNumber,
    patch: filterPatchCols_(patches[idx], allowed),
  }));
  writeTargetColumnPatches_(sheet, payload);
  return targetRows;
}

/**
 * Update existing rows using sparse column patches (UPDATABLE cols only).
 * @param {{rowNumber: number, patch: Object<number, *>}[]} records
 */
function updateTargetRecords_(records) {
  if (!records || records.length === 0) return;
  const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
  const payload = records.map((r) => ({
    rowNumber: r.rowNumber,
    patch: filterPatchCols_(r.patch, CONFIG.UPDATABLE_TARGET_COLS),
  }));
  writeTargetColumnPatches_(sheet, payload);
}

/**
 * Write sparse patches by column to preserve formatting/formulas on untouched cells.
 * Strategy: for each distinct column index, batch-write contiguous row blocks
 * with a single-column setValues (no full-row A:Y overwrite).
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {{rowNumber: number, patch: Object<number, *>}[]} records
 */
function writeTargetColumnPatches_(sheet, records) {
  if (!records || records.length === 0) return;

  // colIdx → [{rowNumber, value}]
  const byCol = new Map();
  records.forEach((rec) => {
    if (!rec || !rec.patch) return;
    Object.keys(rec.patch).forEach((key) => {
      const colIdx = Number(key);
      // Hard block manual columns even if a buggy patch sneaks through.
      if (CONFIG.MANUAL_TARGET_COLS.indexOf(colIdx) !== -1) return;
      if (!byCol.has(colIdx)) byCol.set(colIdx, []);
      byCol.get(colIdx).push({ rowNumber: rec.rowNumber, value: rec.patch[colIdx] });
    });
  });

  byCol.forEach((entries, colIdx) => {
    const sorted = entries.slice().sort((a, b) => a.rowNumber - b.rowNumber);
    let blockStart = 0;
    while (blockStart < sorted.length) {
      let blockEnd = blockStart;
      while (
        blockEnd + 1 < sorted.length &&
        sorted[blockEnd + 1].rowNumber === sorted[blockEnd].rowNumber + 1
      ) {
        blockEnd++;
      }
      const block = sorted.slice(blockStart, blockEnd + 1);
      const matrix = block.map((e) => [e.value]);
      // Write single column — does not clear validations/formulas on other cols.
      writeMatrix_(sheet, block[0].rowNumber, colIdx + 1, matrix);
      blockStart = blockEnd + 1;
    }
  });
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
