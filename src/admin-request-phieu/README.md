# Admin Request Phiếu — DevSEO Software Info

Công cụ Google Apps Script tự động tạo Sheet Request thanh toán tool hàng
tháng cho file **M5 - DevSEO - Software Info**, dựa trên checkbox admin tick
trong sheet `Task_Management_Tracker`.

## 1. Phân tích cấu trúc dữ liệu (từ file đã upload)

### Sheet `Task_Management_Tracker`

- **Header thật nằm ở dòng 12** (dòng 1-11 là một bảng khác — danh sách tài
  khoản 2FA — không liên quan đến luồng Request). Vì vậy code luôn **tự dò
  dòng header** (`Utils.detectHeaderRow`), không giả định cố định dòng 1.
- Các cột quan trọng (đọc theo tên, xem `Config.TRACKER_HEADERS`): `Brand`,
  `Type`, `Link mua`, `Mô tả Công Cụ`, `Mục đích sử dụng`, `Cost/month (USD)`,
  `MONTH`, `Số lượng`, `TOTAL COST/term(USD)`, `Gia Hạn`, `Lịch Gia Hạn`,
  `Email`, `PW`, `Status`, `Request Gia hạn T8`, `Ghi Chú`.
- Dữ liệu được **nhóm theo section** bằng các dòng chỉ có cột `Brand` (ví dụ
  `M8 TECH`, `Martech`, `M6 TECH`) — các dòng này có `Type` trống, khác với
  dòng dữ liệu thật luôn có `Type` = `Tool`/`Software`. `DataService` nhận
  diện và bỏ qua các dòng này, nhưng vẫn ghi nhớ section để suy ra
  **"Vị trí sử dụng"** cho các dòng thuộc section đó.
- Cột checkbox tên **"Request Gia hạn T{n}"** đổi theo tháng (T8, T9, T10...).

### Sheet mẫu `T7.2026` / `T8.2026`

- 21 cột, header giống nhau 100% giữa 2 sheet (xem `Config.REQUEST_HEADERS`).
- Bố cục: dòng 1 = header, dòng 2 = dòng trống (spacer), dòng 3.. = dữ liệu,
  sau đó là dòng **`TOTAL`** với công thức `=sum(H3:H11)` (hoặc `H3:H12` ở
  T7.2026) — **vùng dữ liệu ghi được luôn được suy ra trực tiếp từ chính công
  thức này**, không hardcode số dòng.
- Có Data Validation (dropdown) trên `Loại thanh toán`, `Loại gia hạn`,
  `Tình trạng thanh toán`; Conditional Formatting trên `Tình trạng thanh
  toán`; Freeze Column tới cột D. Toàn bộ được giữ nguyên 100% vì công cụ
  dùng `Sheet.copyTo()` (native Apps Script) để nhân bản sheet — **không có
  dòng code nào tự dựng lại format**.

### Mapping không 1:1 (đã surface rõ trong `Config.COLUMN_MAPPING`)

Một số cột của sheet Request không có cột nguồn tương ứng trực tiếp trong
tracker — đây là các trường hợp cần quyết định nghiệp vụ, được tài liệu hoá
minh bạch ngay trong `Config.gs` (không giấu trong logic service):

| Cột Request | Cách xử lý | Vì sao |
| --- | --- | --- |
| `Vị trí sử dụng` | Suy ra từ **section** trong tracker qua `Config.SECTION_POSITION_MAP` (`M6 TECH` → `Dev M6`, ...) | Không có cột riêng trong tracker, nhưng khớp đúng dữ liệu quan sát được (mọi tool thuộc M6 TECH đều có "Vị trí sử dụng" = "Dev M6") |
| `Loại thanh toán` | Hằng số `Config.DEFAULT_LOAI_THANH_TOAN` = `"Gia hạn"` | Toàn bộ flow này xuất phát từ checkbox **"Request Gia hạn"**, nên theo định nghĩa là yêu cầu gia hạn |
| `Thông tin thanh toán` | Hằng số `Config.DEFAULT_THONG_TIN_THANH_TOAN` = `"Thẻ visa"` | Giá trị này giống nhau ở MỌI dòng hiện có trong T7.2026/T8.2026 |
| `Giá VNĐ`, `Chi phí thanh toán thực tế`, `Thanh toán vượt Dự Toán`, `Lý do`, `Link tải hóa đơn`, `ID BOKT`, `Tình trạng thanh toán` | Để trống (`MANUAL`) | Đây là các trường Finance/Admin điền SAU KHI duyệt/thanh toán — không có trong tracker vì bản chất là dữ liệu phát sinh sau |

Muốn đổi bất kỳ quy tắc nào ở trên, chỉ cần sửa **`Config.gs`** — không cần
sửa `RequestService`/`SheetGenerator`/`DataService`.

## 2. Kiến trúc đề xuất

```
Config.gs           - Hằng số, tên header, bảng mapping cột (single source of truth)
Utils.gs            - Header lookup, copy template, format ngày/tiền, UI helper, Logger
DataService.gs      - Đọc Task_Management_Tracker, lọc tool được tick
TemplateService.gs  - Tìm & copy sheet mẫu "tháng gần nhất"
SheetGenerator.gs   - Ghi dữ liệu vào sheet mới (tự tìm vùng ghi từ công thức TOTAL)
RequestService.gs   - Orchestrator: nối toàn bộ luồng nghiệp vụ
Menu.gs             - onOpen() - tạo menu "Admin Tools"
Code.gs             - Global handler cho menu (mỏng, chỉ gọi RequestService + hiển thị Dialog)
```

Nguyên tắc SOLID áp dụng:
- **Single Responsibility**: mỗi class chỉ làm đúng 1 việc (đọc dữ liệu / tìm
  template / ghi sheet / điều phối).
- **Open/Closed**: thêm KPI/cột mới chỉ cần thêm 1 dòng vào
  `Config.COLUMN_MAPPING`, không sửa logic.
- **Dependency Injection**: mọi Service nhận `spreadsheet`/`sheet` qua
  constructor, không tự gọi `SpreadsheetApp.getActiveSpreadsheet()` bên
  trong nhiều nơi — dễ test, dễ tái sử dụng.

## 3. Danh sách class

| Class | File | Vai trò |
| --- | --- | --- |
| `Config` | Config.gs | Cấu hình & bảng mapping (static, không state) |
| `Utils` | Utils.gs | Hàm dùng chung (header, copy, format, UI, clear) |
| `AppLogger` | Utils.gs | Logger INFO/WARNING/ERROR, bật/tắt qua `Config.ENABLE_LOGGING` |
| `UserFacingError` | Utils.gs | Lỗi nghiệp vụ hiển thị trực tiếp cho Admin |
| `ToolRecord` | DataService.gs | 1 dòng tool trong tracker, truy cập theo tên cột |
| `DataService` | DataService.gs | Đọc & lọc tool được tick |
| `TemplateService` | TemplateService.gs | Tìm & copy sheet mẫu |
| `SheetGenerator` | SheetGenerator.gs | Ghi dữ liệu vào sheet mới |
| `RequestService` | RequestService.gs | Điều phối toàn bộ luồng |

## 4. Luồng xử lý (Generate Request Sheet)

```
onGenerateRequestSheetClick()  [Code.gs]
  └─ RequestService.generateRequestSheet()
        1. Utils.getNextMonthSheetName()/getNextMonthCode() -> "T9.2026" / "T9"
        2. DataService.getApprovedTools("T9")
             - detect header row trong Task_Management_Tracker
             - bỏ qua section-divider rows, ghi nhớ section
             - lọc rowValues["Request Gia hạn T9"] === true
             -> throw UserFacingError nếu rỗng hoặc thiếu cột checkbox
        3. Nếu "T9.2026" đã tồn tại -> Utils.showConfirm(...)
             - Không đồng ý -> return null (không đổi gì)
             - Đồng ý -> TemplateService.deleteSheetIfExists("T9.2026")
        4. TemplateService.createSheetFromTemplate("T9.2026", 9, 2026)
             - tìm sheet "T{n}.{yyyy}" gần nhất TRƯỚC tháng đích
             - throw UserFacingError('Không tìm thấy Template.') nếu không có
             - Utils.copyTemplate() -> Sheet.copyTo() (giữ 100% format/formula/validation/...)
        5. approvedTools.map(tool => _buildRequestRow(tool, ...))
             - áp dụng Config.COLUMN_MAPPING cho từng cột
        6. SheetGenerator.writeRequestRows(rowValues)
             - tìm dòng "TOTAL" (theo cột "Tên tool")
             - đọc công thức SUM ở dòng TOTAL -> suy ra vùng dữ liệu ghi được
             - insertRowsBefore() nếu thiếu chỗ (công thức SUM tự giãn theo cơ chế native của Sheets)
             - Utils.clearOldData() rồi setValues() MỘT LẦN duy nhất
  └─ Utils.showAlert('Generate Request thành công.', 'Tổng số Tool: N\n\nSheet: T9.2026')
```

## 5. Cài đặt

1. Mở Google Sheet **M5 - DevSEO - Software Info** → **Extensions → Apps Script**.
2. Tạo 8 file Script đúng tên: `Config`, `Utils`, `DataService`,
   `TemplateService`, `SheetGenerator`, `RequestService`, `Menu`, `Code`.
   Copy nội dung tương ứng từ thư mục này vào từng file.
3. Bật hiển thị manifest (**Project Settings ⚙️ → Show 'appsscript.json'**),
   paste nội dung `appsscript.json`.
4. Lưu (`Ctrl+S`), tải lại Google Sheet.
5. Menu **Admin Tools → Generate Request Sheet** xuất hiện.
6. Trong `Task_Management_Tracker`, tick các checkbox ở cột
   `Request Gia hạn T{tháng kế tiếp}` cho tool cần tạo Request.
7. Chạy **Admin Tools → Generate Request Sheet**. Lần đầu chạy sẽ có popup
   xác thực quyền — Review permissions → Advanced → Go to [project] (unsafe) → Allow.

## 6. Hiệu năng & Logging

- Đọc dữ liệu: đúng **1 lần** `getValues()` cho toàn bộ tracker.
- Ghi dữ liệu: đúng **1 lần** `setValues()` cho toàn bộ các dòng mới — không
  có `setValue()` trong vòng lặp ở đâu trong project.
- `AppLogger.info/warning/error` ghi log mỗi bước quan trọng (đọc dữ liệu,
  copy template, mở rộng vùng ghi, ghi dữ liệu) — tắt hoàn toàn bằng
  `Config.ENABLE_LOGGING = false` nếu cần.

## 7. Kiểm thử

Do không thể chạy trực tiếp trên Google Apps Script trong môi trường phát
triển này, toàn bộ luồng đã được mô phỏng bằng Node.js (`vm` module chạy
trực tiếp các file `.gs`, mock đầy đủ `Sheet`/`Range`/`Spreadsheet`/`Ui` kể cả
`copyTo()` và `insertRowsBefore()` với cơ chế tự giãn công thức SUM giống
Google Sheets thật) **sử dụng dữ liệu THẬT trích xuất từ file Excel đã
upload** (`Task_Management_Tracker`, `T7.2026`, `T8.2026`):

- **Happy path**: tick 3 tool (CONTENTFUL, DIGITALOCEAN, N8N) → sheet mới có
  đúng 3 dòng, mapping đúng từng cột (SOURCE/SECTION/TRANSFORM/CONSTANT/
  MANUAL), dòng TOTAL và công thức được giữ nguyên, dữ liệu cũ (tool tháng
  trước) bị xoá sạch.
- **Mở rộng vùng ghi**: tick 12 tool (nhiều hơn 9 dòng trống có sẵn của
  template) → tool tự chèn thêm dòng trước TOTAL, công thức SUM tự giãn từ
  `H3:H11` thành `H3:H14` đúng như hành vi thật của Google Sheets.
- **Không tool nào được tick** → `UserFacingError` đúng message
  "Không có Tool nào được chọn để tạo Request.".
- **Thiếu cột checkbox tháng đích** (chưa tạo cột "Request Gia hạn T9") →
  `UserFacingError` báo rõ tên cột thiếu.
- **Không có Template phù hợp** (xoá hết sheet T*.2026) → `UserFacingError`
  "Không tìm thấy Template.".
- **Từ chối ghi đè** khi sheet đã tồn tại → trả về `null`, không tạo/sửa gì.

Toàn bộ 8 file `.gs` pass `node --check`.

## 8. Mở rộng (roadmap, xem chi tiết trong `Code.gs`)

Thêm tính năng mới (Generate BOKT, Generate Email, Generate Telegram Message,
Generate Approval Message, Export PDF/Excel, Archive Sheet, Auto gửi Gmail)
chỉ cần:
1. Tạo 1 file `.gs` mới chứa 1 class Service mới (constructor nhận
   `spreadsheet`, giống pattern của `RequestService`).
2. Thêm 1 hàm handler global mỏng trong `Code.gs`.
3. Thêm 1 dòng `.addItem(...)` trong `Menu.gs`.

Không cần sửa `Config`/`DataService`/`TemplateService`/`SheetGenerator`/
`RequestService` hiện có. `RequestService.generateRequestSheet()` đã trả về
`{ sheetName, toolCount }` để các tính năng sau (ví dụ Generate BOKT) có thể
tái sử dụng ngay nếu cần.
