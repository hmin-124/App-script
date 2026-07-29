# Tool Request → QUẢN LÝ TOOLS 2026 Sync

Google Apps Script **production-ready** đồng bộ tức thời từ sheet `Tool Request` sang sheet `2026` (QUẢN LÝ TOOLS 2026).

## 1. Phân tích kiến trúc

```text
Tool Request (edit/paste)
        │
        ▼
installable onEdit → handleToolRequestEdit
        │
        ▼
SyncService (DocumentLock)
  ├─ ValidationService   (required fields + cost)
  ├─ MappingService      (Cost/DVT/FX + defaults)
  ├─ DataAccess          (batch getValues/setValues + ID Map)
  └─ LoggingService      (SYNC_LOG batch append)
        │
        ▼
Sheet 2026  (INSERT nếu ID BOKT mới / UPDATE nếu đã có)
```

| Quyết định | Lý do |
|---|---|
| Installable `onEdit` (không dùng simple `onEdit`) | Cần `LockService`, `Session.getActiveUser`, ghi log ổn định |
| Khóa duy nhất = `ID BOKT` | Khớp nghiệp vụ BOKT; chuẩn hóa string để tránh lệch number/text |
| Không ghi đè cột Admin | Checkbox duyệt, PIC, Brand, Note, Ngày tạo phiếu giữ nguyên khi UPDATE |
| SKIP im lặng khi thiếu field | Tránh popup phá UX lúc đang nhập từng ô |
| Batch I/O + Map | Tránh `getValue`/`setValue`/`appendRow` trong vòng lặp |

**Giới hạn cần biết**
- Installable trigger chạy với quyền user đã authorize; mỗi edit hợp lệ sẽ sync — tránh paste hàng nghìn dòng một lúc (quota Apps Script ~6 phút/execution).
- `EXCHANGE_RATE` để `null` thì cột Tỷ giá / Thành tiền (USD) trống cho đến khi Admin cấu hình.

---

## 2. Cấu trúc file

```text
src/tool-request-sync-2026/
  Config.gs              # CONFIG (sheet names, columns, defaults, FX)
  Code.gs                # onOpen, handleToolRequestEdit, trigger setup
  Utils.gs               # normalize / parse / notify / sheet helpers
  DataAccess.gs          # read/write batch, ID map, header assert
  ValidationService.gs   # required fields
  MappingService.gs      # Cost/DVT/FX + insert/update patch
  SyncService.gs         # orchestration + menu sync actions
  LoggingService.gs      # SYNC_LOG
  appsscript.json
  README.md
  tests/sync-logic.test.js
```

---

## 3. Dán code vào Apps Script

### Cách A — clasp (khuyến nghị)

```bash
npm install -g @google/clasp
clasp login

# Trong Google Sheet đích: Extensions → Apps Script → copy Script ID từ URL
cp .clasp.json.sample .clasp.json
# Sửa scriptId + đảm bảo rootDir = "src/tool-request-sync-2026"

clasp push
clasp open
```

### Cách B — copy thủ công

1. Mở Google Sheet chứa tab `Tool Request` và `2026`.
2. **Extensions → Apps Script**.
3. Đảm bảo **Project Settings → Runtime** = **V8**.
4. Tạo các file `.gs` đúng tên như trên và dán nội dung tương ứng.
5. Dán `appsscript.json` (hoặc set timezone `Asia/Ho_Chi_Minh` + scopes tương đương).
6. Save.

---

## 4. Cài installable onEdit trigger

1. Reload spreadsheet → menu **🛠 TOOL MANAGEMENT** xuất hiện (nếu chưa thấy: chạy hàm `onOpen` từ editor).
2. Chọn **Cài đặt trigger**.
3. Chấp nhận OAuth lần đầu (xem mục 5).
4. Kiểm tra: Apps Script editor → **Triggers** (đồng hồ) phải có:
   - Function: `handleToolRequestEdit`
   - Event: `From spreadsheet → On edit`

Hoặc tạo tay: Triggers → Add Trigger → `handleToolRequestEdit` / On edit / Head.

**Xóa trigger cũ:** menu **Xóa trigger cũ** (chỉ xóa handler `handleToolRequestEdit`).

---

## 5. Cấp quyền lần đầu

Khi chạy `installSyncTrigger` / `syncSelectedRows` lần đầu, Google hiện màn hình quyền:

- Xem/chỉnh sửa Google Sheets hiện tại
- Quản lý Triggers (`script.scriptapp`)
- Xem email (`userinfo.email` — ghi log người thực hiện)

Chọn tài khoản có quyền edit sheet → **Advanced → Go to … (unsafe)** nếu app chưa verify → Allow.

---

## 6. Test tạo mới (INSERT)

1. Mở sheet `Tool Request`, thêm dòng mới (từ hàng 3).
2. Điền tối thiểu:
   - B Tên tool
   - E Vị trí sử dụng
   - F Loại thanh toán
   - G Loại gia hạn
   - H Giá USD **hoặc** I Giá VNĐ
   - S ID BOKT (unique, chưa có trên `2026`)
3. Tab ra khỏi ô / Enter.
4. Kỳ vọng:
   - Sheet `2026` thêm 1 dòng mới với ID đó.
   - `SYNC_LOG`: action `INSERT`, result `SUCCESS`.
   - Channel = `mkt0008`, Sub channel = `Softwares Licenses`, Status = nguồn hoặc `PENDING`.

---

## 7. Test cập nhật (UPDATE)

1. Đổi **Cost** (H) hoặc **Chi tiết** (D) trên dòng Tool Request đã sync.
2. (Tuỳ chọn) Tick tay `Leader` / sửa `Note` trên dòng `2026` tương ứng trước khi sync.
3. Kỳ vọng:
   - Cost / NCC / Nội dung phiếu trên `2026` đổi theo nguồn.
   - `Leader`, `Note`, `PIC`, `Brand`, `Ngày tạo phiếu`, checkbox group **không** bị ghi đè.
   - Log: `UPDATE`.

---

## 8. Test paste nhiều dòng

1. Copy 3–5 dòng đủ field từ Excel/Sheets.
2. Paste vào `Tool Request` từ hàng trống.
3. Kỳ vọng: tất cả dòng hợp lệ được INSERT/UPDATE trong **một** lần chạy trigger; log có nhiều dòng tương ứng (không chỉ dòng đầu).

---

## 9. Rollback & xử lý lỗi

| Tình huống | Cách xử lý |
|---|---|
| Sync sai dữ liệu | Sửa lại dòng `Tool Request` (trigger UPDATE) hoặc sửa tay `2026` rồi dùng menu đồng bộ lại |
| Trigger tạo trùng / loop | Menu **Xóa trigger cũ** → kiểm tra Triggers → **Cài đặt trigger** lại một lần |
| ID BOKT trùng trên `2026` | Menu **Kiểm tra dữ liệu trùng** → gộp/xóa tay dòng thừa → sync lại |
| Header đổi tên | Sửa sheet về đúng tên cột hoặc cập nhật `EXPECTED_*_HEADERS` trong `Config.gs` |
| Lock timeout | Chờ vài giây, chạy **Đồng bộ dòng đang chọn** |
| Muốn tắt realtime | **Xóa trigger cũ**; vẫn dùng menu sync thủ công |

Rollback code: trong Apps Script → **Version history** / `clasp pull` từ commit trước.

---

## 10. Trường cấu hình cần chỉnh (`Config.gs`)

| Key | Ý nghĩa | Mặc định |
|---|---|---|
| `SOURCE_SHEET_NAME` | Tab nguồn | `Tool Request` |
| `TARGET_SHEET_NAME` | Tab đích (QUẢN LÝ TOOLS 2026) | `2026` |
| `DEFAULT_VALUES.CHANNEL` | Channel mặc định | `mkt0008` |
| `DEFAULT_VALUES.SUB_CHANNEL` | Sub channel | `Softwares Licenses` |
| `DEFAULT_VALUES.PIC` / `BRAND` | PIC / Brand mặc định khi INSERT | `''` |
| `DEFAULT_VALUES.STATUS` | Status khi nguồn trống | `PENDING` |
| `EXCHANGE_RATE` | Tỷ giá USD→PNT | `null` (để trống N/O) |
| `LOCK_WAIT_MS` | Thời gian chờ lock | `30000` |
| `LOG_MAX_ROWS` | Giới hạn dòng log | `5000` |
| `NCC_LOOKUP.ENABLED` | Bật tra cứu sheet `infor` | `false` |

Nếu tab đích được đổi tên thành đúng `QUẢN LÝ TOOLS 2026`, chỉ cần sửa `TARGET_SHEET_NAME`.

---

## 11. Checklist nghiệm thu

- [ ] Menu **🛠 TOOL MANAGEMENT** hiện đủ 6 mục
- [ ] Installable trigger `handleToolRequestEdit` tồn tại đúng 1 cái
- [ ] INSERT dòng mới khi ID BOKT chưa có
- [ ] UPDATE đúng dòng khi ID BOKT đã có (number vs text vẫn khớp)
- [ ] Không tạo dòng trùng ID
- [ ] Paste multi-row sync hết vùng
- [ ] Thiếu field bắt buộc → không ghi `2026`, không popup (trigger)
- [ ] Thiếu cả USD & VNĐ → SKIP + log `Thiếu thông tin chi phí`
- [ ] Có cả USD & VNĐ → ưu tiên USD + warning trong log
- [ ] VNĐ only → DVT=`PNT`, Tỷ giá=`1`, Thành tiền=Cost
- [ ] USD + `EXCHANGE_RATE` → Thành tiền = Cost × tỷ giá
- [ ] Cột Admin (B,C,F,P,Q,R,S,W,X) không bị ghi đè khi UPDATE
- [ ] Status chỉ UPDATE khi Tool Request!T có giá trị
- [ ] `SYNC_LOG` ghi INSERT/UPDATE/SKIP/ERROR/DUPLICATE theo batch
- [ ] Hai user sync cùng lúc: một bên nhận lock timeout an toàn
- [ ] **Kiểm tra dữ liệu trùng** phát hiện ID lặp trên `2026`
- [ ] Unit test: `node src/tool-request-sync-2026/tests/sync-logic.test.js` pass

---

## Mapping nhanh

| Tool Request | 2026 |
|---|---|
| E Vị trí sử dụng | D Team QL |
| S ID BOKT | E ID BOKT |
| (lần đầu sync) | F Ngày tạo phiếu |
| B Tên tool | I NCC |
| D Chi tiết | J Nội dung phiếu |
| Q Thông tin thanh toán | K Thông tin thanh toán |
| H hoặc I | L Cost + M DVT + N Tỷ giá + O Thành tiền |
| T Tình trạng thanh toán | T Status |
| F / G | U / V |
| U Ngày gia hạn | Y Thời gian sử dụng |
