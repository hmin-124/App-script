# App-script

Repository chứa các giải pháp tự động hóa Google Workspace (Google Sheets, AppSheet, Google Apps Script).

## Packages

| Package | Mô tả |
|---|---|
| [`src/tool-request-sync-2026/`](src/tool-request-sync-2026/) | Đồng bộ tức thời **Tool Request → sheet `2026` (QUẢN LÝ TOOLS 2026)** qua installable `onEdit`, chống trùng ID BOKT, bảo vệ cột Admin, ghi `SYNC_LOG`. |

## Phát triển với clasp

```bash
npm install -g @google/clasp
clasp login
cp .clasp.json.sample .clasp.json
# Điền scriptId của Apps Script bound vào Google Sheet đích
clasp push
```

## Tests

```bash
node src/tool-request-sync-2026/tests/sync-logic.test.js
node src/tool-request-sync-2026/tests/admin-message.test.js
```
