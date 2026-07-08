# App-script

Repository chứa các giải pháp tự động hóa Google Workspace (Google Sheets, AppSheet, Google Apps Script).

Các quy tắc kiến trúc & coding convention cho repo này được định nghĩa trong
[`.cursor/rules/google-workspace-solutions-architect.mdc`](.cursor/rules/google-workspace-solutions-architect.mdc)
— mọi code Apps Script mới nên tuân theo các nguyên tắc đó (batch operations,
error handling có cấu trúc, ES6+, validate input, v.v.).

## Cấu trúc project

```
src/
  appsscript.json   # Apps Script manifest (timezone, OAuth scopes, runtime)
  Code.js           # Entry points: triggers (onEdit, time-driven), integrations
  Utils.js          # Batch I/O helpers, retry/backoff fetch, structured error handling
```

## Phát triển với clasp

Project này được thiết kế để dùng với [`clasp`](https://github.com/google/clasp)
(Google's official CLI cho Apps Script).

```bash
npm install -g @google/clasp
clasp login

# Tạo Apps Script project mới (bound hoặc standalone) rồi copy scriptId vào .clasp.json
cp .clasp.json.sample .clasp.json
# Sửa "scriptId" trong .clasp.json thành ID project thật của bạn

clasp push   # đẩy code trong src/ lên Apps Script
clasp open   # mở project trên Apps Script Editor
```

`.clasp.json` chứa `scriptId` riêng của từng người dùng nên được `.gitignore`
— không commit file này.

## Utilities có sẵn (`src/Utils.js`)

| Function | Mục đích |
| --- | --- |
| `readSheetAsObjects(sheetName, ss?)` | Đọc toàn bộ sheet bằng **một lần** `getValues()`, trả về array of objects theo header. |
| `writeObjectsToSheet(sheetName, rows, ss?)` | Ghi array of objects xuống sheet bằng **một lần** `setValues()`. |
| `fetchWithRetry(url, options?, maxRetries?)` | Gọi REST API qua `UrlFetchApp` với exponential backoff cho lỗi 429/5xx. |
| `runSafely(taskName, fn)` | Bọc `try...catch` + logging có cấu trúc cho trigger/menu handlers. |

Xem `src/Code.js` để biết ví dụ sử dụng (time-driven trigger, simple `onEdit`
trigger, gọi API bên thứ ba).
