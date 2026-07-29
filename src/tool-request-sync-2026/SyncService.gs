/**
 * SyncService.gs
 * ---------------------------------------------------------------------------
 * Orchestrates validate → map → insert/update with LockService + batch I/O.
 */

/**
 * Sync a list of absolute source row numbers.
 * @param {number[]} rowNumbers
 * @param {{showUi?: boolean, validateHeaders?: boolean}=} options
 * @returns {{inserted: number, updated: number, skipped: number, errors: number, duplicates: number}}
 */
function syncSourceRows_(rowNumbers, options) {
  const opts = options || {};
  const showUi = !!opts.showUi;
  const summary = { inserted: 0, updated: 0, skipped: 0, errors: 0, duplicates: 0 };

  if (!rowNumbers || rowNumbers.length === 0) {
    toastUser_(showUi, 'Không có dòng nào để đồng bộ.', CONFIG.MENU.NAME, 3);
    return summary;
  }

  const lock = LockService.getDocumentLock();
  const locked = lock.tryLock(CONFIG.LOCK_WAIT_MS);
  if (!locked) {
    const logs = [
      buildLogEntry_({
        action: CONFIG.ACTIONS.ERROR,
        result: CONFIG.RESULTS.FAILED,
        detail: `Không lấy được DocumentLock sau ${CONFIG.LOCK_WAIT_MS}ms`,
      }),
    ];
    try {
      writeSyncLogs_(logs);
    } catch (logErr) {
      console.error(logErr);
    }
    notifyUser_(
      showUi,
      'Đồng bộ bị khóa',
      'Hệ thống đang bận (người khác đang đồng bộ). Vui lòng thử lại sau vài giây.'
    );
    return summary;
  }

  const logs = [];
  try {
    if (opts.validateHeaders !== false) {
      assertSheetHeaders_();
    }

    const sourceRecords = readSourceRows_(rowNumbers);
    if (sourceRecords.length === 0) {
      toastUser_(showUi, 'Không đọc được dòng nguồn hợp lệ.', CONFIG.MENU.NAME, 3);
      return summary;
    }

    const { map: idMap, duplicates } = buildTargetIdMap_();
    const nccMap = loadNccLookupMap_();

    const inserts = []; // {mapped, logMeta}
    const updates = []; // {targetRow, mapped}
    const updateRowNumbers = [];

    // First pass: validate + decide action (no writes yet).
    sourceRecords.forEach((record) => {
      const validated = validateSourceRecord_(record);

      if (validated.softSkip) {
        summary.skipped++;
        return;
      }

      if (!validated.ok) {
        summary.skipped++;
        // During installable onEdit, incomplete rows are expected while the user
        // is still typing — skip silently (no popup, no log spam).
        // Manual menu sync logs SKIP so the operator can see what's missing.
        if (showUi) {
          logs.push(
            buildLogEntry_({
              action: CONFIG.ACTIONS.SKIP,
              sourceRow: record.rowNumber,
              idBokt: validated.idBokt,
              toolName: validated.toolName,
              result: CONFIG.RESULTS.SKIPPED,
              detail: validated.errors.join('; '),
            })
          );
        }
        return;
      }

      if (duplicates.has(validated.idBokt)) {
        summary.duplicates++;
        logs.push(
          buildLogEntry_({
            action: CONFIG.ACTIONS.DUPLICATE,
            sourceRow: record.rowNumber,
            idBokt: validated.idBokt,
            toolName: validated.toolName,
            result: CONFIG.RESULTS.DUPLICATE,
            detail: `ID BOKT trùng nhiều dòng trong sheet ${CONFIG.TARGET_SHEET_NAME} — không tự cập nhật`,
          })
        );
        return;
      }

      const mapped = mapSourceToTarget_(record, validated, nccMap);
      const existingRow = idMap.get(validated.idBokt);

      if (existingRow) {
        updates.push({ targetRow: existingRow, mapped });
        updateRowNumbers.push(existingRow);
      } else {
        inserts.push({ mapped });
      }
    });

    // Apply updates: read existing rows → merge patch → batch write.
    if (updates.length) {
      const existingMap = readTargetRows_(updateRowNumbers);
      const updatePayload = [];

      updates.forEach((item) => {
        const existing = existingMap.get(item.targetRow);
        if (!existing) {
          summary.errors++;
          logs.push(
            buildLogEntry_({
              action: CONFIG.ACTIONS.ERROR,
              sourceRow: item.mapped.sourceRow,
              idBokt: item.mapped.idBokt,
              toolName: item.mapped.toolName,
              result: CONFIG.RESULTS.FAILED,
              detail: `Không đọc được dòng đích ${item.targetRow}`,
              targetRow: item.targetRow,
            })
          );
          return;
        }

        const merged = applyUpdatePatch_(existing, item.mapped.updatePatch);
        updatePayload.push({ rowNumber: item.targetRow, values: merged });

        // Reserve ID in map for subsequent source rows in same batch (same ID).
        idMap.set(item.mapped.idBokt, item.targetRow);

        summary.updated++;
        logs.push(
          buildLogEntry_({
            action: CONFIG.ACTIONS.UPDATE,
            sourceRow: item.mapped.sourceRow,
            idBokt: item.mapped.idBokt,
            toolName: item.mapped.toolName,
            result: CONFIG.RESULTS.SUCCESS,
            detail: item.mapped.warnings.join('; '),
            targetRow: item.targetRow,
          })
        );
      });

      updateTargetRecords_(updatePayload);
    }

    // Apply inserts in one setValues(); track assigned rows for logs + idMap.
    if (inserts.length) {
      // Deduplicate inserts by ID within this batch (keep first).
      const seenInsertIds = new Set();
      const insertMatrix = [];
      const insertMetas = [];

      inserts.forEach((item) => {
        const id = item.mapped.idBokt;
        if (seenInsertIds.has(id) || idMap.has(id)) {
          // Same batch already inserting / just updated this ID.
          if (seenInsertIds.has(id)) {
            summary.duplicates++;
            logs.push(
              buildLogEntry_({
                action: CONFIG.ACTIONS.DUPLICATE,
                sourceRow: item.mapped.sourceRow,
                idBokt: id,
                toolName: item.mapped.toolName,
                result: CONFIG.RESULTS.DUPLICATE,
                detail: 'Trùng ID BOKT trong cùng batch đồng bộ — bỏ qua dòng sau',
              })
            );
          } else {
            // Race within batch: treat as update opportunity missed → SKIP with note
            summary.skipped++;
            logs.push(
              buildLogEntry_({
                action: CONFIG.ACTIONS.SKIP,
                sourceRow: item.mapped.sourceRow,
                idBokt: id,
                toolName: item.mapped.toolName,
                result: CONFIG.RESULTS.SKIPPED,
                detail: 'ID vừa được xử lý trong cùng batch',
              })
            );
          }
          return;
        }
        seenInsertIds.add(id);
        insertMatrix.push(item.mapped.insertRow);
        insertMetas.push(item.mapped);
      });

      if (insertMatrix.length) {
        const firstRow = insertTargetRecords_(insertMatrix);
        insertMetas.forEach((mapped, idx) => {
          const targetRow = firstRow + idx;
          idMap.set(mapped.idBokt, targetRow);
          summary.inserted++;
          logs.push(
            buildLogEntry_({
              action: CONFIG.ACTIONS.INSERT,
              sourceRow: mapped.sourceRow,
              idBokt: mapped.idBokt,
              toolName: mapped.toolName,
              result: CONFIG.RESULTS.SUCCESS,
              detail: mapped.warnings.join('; '),
              targetRow,
            })
          );
        });
      }
    }

    writeSyncLogs_(logs);

    const msg =
      `Đồng bộ xong — INSERT: ${summary.inserted}, UPDATE: ${summary.updated}, ` +
      `SKIP: ${summary.skipped}, DUPLICATE: ${summary.duplicates}, ERROR: ${summary.errors}`;
    toastUser_(showUi, msg, CONFIG.MENU.NAME, 8);
    return summary;
  } catch (err) {
    const info = describeError_(err);
    summary.errors++;
    try {
      writeSyncLogs_([
        buildLogEntry_({
          action: CONFIG.ACTIONS.ERROR,
          result: CONFIG.RESULTS.FAILED,
          detail: `${info.message}\n${info.stack}`,
        }),
      ]);
    } catch (logErr) {
      console.error(logErr);
    }
    notifyUser_(showUi, 'Lỗi đồng bộ', info.message);
    // Do not rethrow — menu handlers and the installable trigger both
    // treat a returned summary / logged ERROR as the terminal state.
    return summary;
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseErr) {
      console.error(releaseErr);
    }
  }
}

/**
 * Menu: sync currently selected source rows.
 */
function syncSelectedRows() {
  try {
    const range = SpreadsheetApp.getActiveRange();
    if (!range) {
      notifyUser_(true, 'Đồng bộ', 'Không có vùng đang chọn.');
      return;
    }
    const sheet = range.getSheet();
    if (sheet.getName() !== CONFIG.SOURCE_SHEET_NAME) {
      notifyUser_(
        true,
        'Đồng bộ',
        `Hãy chọn dòng trên sheet "${CONFIG.SOURCE_SHEET_NAME}" rồi chạy lại.`
      );
      return;
    }

    const start = range.getRow();
    const numRows = range.getNumRows();
    const rows = [];
    for (let i = 0; i < numRows; i++) {
      const r = start + i;
      if (r >= CONFIG.SOURCE_DATA_START_ROW) rows.push(r);
    }

    if (!rows.length) {
      notifyUser_(true, 'Đồng bộ', `Chỉ đồng bộ từ hàng ${CONFIG.SOURCE_DATA_START_ROW} trở xuống.`);
      return;
    }

    syncSourceRows_(rows, { showUi: true, validateHeaders: true });
  } catch (err) {
    notifyUser_(true, 'Lỗi', describeError_(err).message);
  }
}

/**
 * Menu: sync all Tool Request data rows.
 */
function syncAllToolRequests() {
  try {
    assertSheetHeaders_();
    const records = readAllSourceRows_();
    const rows = records.map((r) => r.rowNumber);
    if (!rows.length) {
      notifyUser_(true, 'Đồng bộ toàn bộ', 'Sheet Tool Request không có dữ liệu.');
      return;
    }
    syncSourceRows_(rows, { showUi: true, validateHeaders: false });
  } catch (err) {
    notifyUser_(true, 'Lỗi', describeError_(err).message);
  }
}

/**
 * Menu: report duplicate ID BOKT values inside sheet 2026.
 */
function checkDuplicateIds() {
  try {
    const { duplicates, map } = buildTargetIdMap_();
    // buildTargetIdMap_ removes dups from map — re-scan for counts.
    const sheet = getSheetByName_(CONFIG.TARGET_SHEET_NAME, true);
    const lastDataRow = findLastDataRow_(sheet, CONFIG.TARGET_DATA_START_ROW, CONFIG.TARGET_NUM_COLS);
    if (lastDataRow < CONFIG.TARGET_DATA_START_ROW) {
      notifyUser_(true, 'Kiểm tra trùng', 'Sheet 2026 chưa có dữ liệu.');
      return;
    }

    const numRows = lastDataRow - CONFIG.TARGET_DATA_START_ROW + 1;
    const ids = sheet
      .getRange(CONFIG.TARGET_DATA_START_ROW, CONFIG.TARGET_COLS.ID_BOKT + 1, numRows, 1)
      .getValues();

    const counts = new Map();
    const rowsById = new Map();
    for (let i = 0; i < ids.length; i++) {
      const id = normalizeId_(ids[i][0]);
      if (!id) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
      if (!rowsById.has(id)) rowsById.set(id, []);
      rowsById.get(id).push(CONFIG.TARGET_DATA_START_ROW + i);
    }

    const dupIds = [];
    counts.forEach((count, id) => {
      if (count > 1) dupIds.push(id);
    });

    const logs = [];
    dupIds.forEach((id) => {
      logs.push(
        buildLogEntry_({
          action: CONFIG.ACTIONS.DUPLICATE,
          idBokt: id,
          result: CONFIG.RESULTS.DUPLICATE,
          detail: `Xuất hiện ${counts.get(id)} lần tại các dòng: ${rowsById.get(id).join(', ')}`,
        })
      );
    });
    writeSyncLogs_(logs);

    if (!dupIds.length) {
      notifyUser_(
        true,
        'Kiểm tra trùng',
        `Không phát hiện ID BOKT trùng. Tổng ID unique đang map: ${map.size}.`
      );
    } else {
      notifyUser_(
        true,
        'Kiểm tra trùng',
        `Phát hiện ${dupIds.length} ID BOKT bị trùng. Chi tiết đã ghi vào ${CONFIG.LOG_SHEET_NAME}.\n` +
          dupIds.slice(0, 10).map((id) => `${id} → rows ${rowsById.get(id).join(', ')}`).join('\n')
      );
    }

    // Silence unused warning in some linters.
    return duplicates;
  } catch (err) {
    notifyUser_(true, 'Lỗi', describeError_(err).message);
  }
}
