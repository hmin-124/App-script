# Admin Request Phiếu — DevSEO Software Info

Công cụ Google Apps Script tự động tạo Sheet Request thanh toán tool hàng
tháng cho file **M5 - DevSEO - Software Info**, dựa trên checkbox admin tick
trong sheet tracker (`Config.TRACKER_SHEET_NAME`, hiện là **`QUẢN LÝ
TOOLS`** — sheet này ban đầu tên `Task_Management_Tracker`, đã được Admin
đổi tên; toàn bộ code chỉ resolve sheet này qua MỘT hằng số duy nhất
`Config.TRACKER_SHEET_NAME`, nên đổi tên sheet lần sau chỉ cần sửa đúng 1
dòng đó trong `Config.gs`, không phải sửa `DataService`/`RequestService`).

## 1. Phân tích cấu trúc dữ liệu (từ file đã upload)

### Sheet tracker (`QUẢN LÝ TOOLS`, trước đây tên `Task_Management_Tracker`)

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
| `Vị trí sử dụng` | Hằng số `Config.DEFAULT_VI_TRI_SU_DUNG` = `"Dev M5"` | Theo xác nhận trực tiếp của Admin — toàn bộ workbook thuộc team M5, không suy ra theo section trong tracker |
| `Loại thanh toán` | Để trống (`MANUAL`) | Không có cột nguồn đáng tin cậy để phân biệt "Mua mới"/"Gia hạn" tự động — Admin tự chọn từ Dropdown sẵn có trên sheet sau khi tạo |
| `Loại gia hạn` | Dịch từ cột `Gia Hạn` (tiếng Anh) trong tracker qua `Config.RENEWAL_TYPE_MAP` (`Monthly` → `"Mua theo tháng"`, `Yearly` → `"Mua theo năm"`, `Quarterly` → `"Mua theo quý"`) | Dropdown chỉ nhận các giá trị tiếng Việt cụ thể trong danh sách Data Validation thật của sheet (xem đúng danh sách trong comment `RENEWAL_TYPE_MAP`) — copy nguyên tiếng Anh hoặc dịch sai từ ngữ đều bị Google Sheets từ chối. Giá trị không dịch được (ví dụ `"N/A"`) → để **trống** (không viết chữ bừa, vì Dropdown này `allowBlank = true`) |
| `Thông tin thanh toán` | Hằng số `Config.DEFAULT_THONG_TIN_THANH_TOAN` = `"Thẻ visa"` | Giá trị này giống nhau ở MỌI dòng hiện có trong T7.2026/T8.2026 |
| `Giá VNĐ`, `Chi phí thanh toán thực tế`, `Thanh toán vượt Dự Toán`, `Lý do`, `Link tải hóa đơn`, `ID BOKT`, `Tình trạng thanh toán` | Để trống (`MANUAL`) | Đây là các trường Finance/Admin điền SAU KHI duyệt/thanh toán — không có trong tracker vì bản chất là dữ liệu phát sinh sau |

Muốn đổi bất kỳ quy tắc nào ở trên, chỉ cần sửa **`Config.gs`** — không cần
sửa `RequestService`/`SheetGenerator`/`DataService`.

> `Config.SECTION_POSITION_MAP` (map section → "Vị trí sử dụng") vẫn được
> giữ lại trong code (không dùng trong `COLUMN_MAPPING` hiện tại) để dễ dùng
> lại nếu nghiệp vụ thay đổi sau này — `ToolRecord.section` vẫn được theo dõi
> cho từng dòng.

### Bug đã fix (báo cáo ngày 21/07/2026)

1. **Đếm sai số Tool** ("Tổng số Tool: 21" nhưng chỉ 4 dòng có data thật):
   nguyên nhân là hàm bỏ-qua-dòng-trống cũ kiểm tra "mọi cell đều rỗng", nhưng
   **ô checkbox trong Google Sheets luôn có giá trị boolean (`TRUE`/`FALSE`),
   không bao giờ thực sự rỗng** — nên nếu vùng checkbox bị kéo dài xuống quá
   số dòng dữ liệu thật (rất dễ xảy ra khi kéo-thả checkbox), các dòng trống
   phía dưới vẫn bị tính là "tool hợp lệ" nếu vô tình có checkbox = `TRUE`.
   **Fix**: `DataService._readAllRows()` giờ chỉ coi một dòng là tool thật khi
   cột **"Brand"** có giá trị — không phụ thuộc vào việc mọi cell có rỗng
   hay không.
2. **Lỗi Data Validation ở cột "Loại gia hạn" (2 vòng fix)**:
   - *Vòng 1*: bản đầu tự dịch giá trị `Gia Hạn` sang tiếng Việt qua 1 bảng
     map, nhưng khi tracker có giá trị không nằm trong map (ví dụ `"N/A"`,
     thấy thật trên dòng "Geelark") thì fallback ghi CHỮ `"N/A"` — không phải
     giá trị Dropdown hợp lệ → bị từ chối.
   - *Vòng 2*: tưởng nhầm là do "dịch sai", nên đổi sang copy NGUYÊN giá trị
     gốc tiếng Anh (`Monthly`/`Yearly`) — nhưng Dropdown chỉ nhận tiếng Việt,
     nên **mọi dòng** đều bị từ chối, nặng hơn trước.
   - *Fix cuối cùng*: xác nhận đúng danh sách Dropdown THẬT (đọc trực tiếp từ
     popup lỗi Google Sheets hiển thị: `Mua theo tháng, Mua theo năm, Mua
     credit, Sử dụng trước, thanh toán sau, Theo số lượng users, Theo dung
     lượng sd, Mua theo quý, Mua một lần`), dịch đúng theo danh sách này qua
     `Config.RENEWAL_TYPE_MAP`, và đổi fallback từ `"N/A"` thành **chuỗi
     rỗng** (Dropdown này cho phép để trống — `allowBlank = true`).

### Bug đã fix (báo cáo ngày 21/07/2026, vòng 2) — tin nhắn chỉ đọc được 10/18 tool

**Triệu chứng**: sheet Request có đủ 18 dòng tool thật (dòng 3→20, TOTAL ở
dòng 21), nhưng tin nhắn Lead/Head duyệt chỉ liệt kê đúng 10 tool đầu tiên
(toàn bộ nhóm "Gia hạn") — 8 tool còn lại, TRÙNG với toàn bộ nhóm "Mua mới"
và "Topup Credit" (N8N, GOOGLECLOUD, OPENROUTER), bị thiếu hoàn toàn khỏi cả
2 tin nhắn.

**Nguyên nhân gốc**: `Utils.findDataRangeFromTotalFormula()` (dùng chung bởi
cả `SheetGenerator` và `MessageService`) tin tưởng **hoàn toàn vào chuỗi
công thức SUM hiện tại** ở dòng TOTAL để suy ra dòng cuối của vùng dữ liệu
(ví dụ `=sum(H3:H12)` → `endRow = 12`). Giả định ban đầu là "Google Sheets
tự động giãn vùng tham chiếu của công thức SUM khi chèn dòng ngay phía
trên nó" — giả định này **SAI** khi chèn NHIỀU dòng cùng lúc bằng
`insertRowsBefore(row, n)`: công thức vẫn giữ nguyên y chuỗi cũ
(`=sum(H3:H12)`), dù 8 dòng mới đã được chèn thêm phía trên dòng TOTAL cho
8 tool dư ra so với sức chứa gốc (10 dòng) của Template. Vì `MessageService`
chỉ đọc đúng những dòng nằm trong `startRow..endRow` mà công thức "khai
báo", 8 tool cuối (đúng là toàn bộ "Mua mới"/"Topup Credit", vì chúng được
thêm SAU nhóm "Gia hạn") bị bỏ sót hoàn toàn — không phải do lỗi group logic
(logic nhóm theo `Loại thanh toán` vẫn đúng, chỉ là không có dữ liệu để nhóm).

**Fix**:
1. `Utils.findDataRangeFromTotalFormula()`: **không còn tin `endRow` từ công
   thức nữa**. `endRow` giờ luôn = `totalRowIndex - 1` (đúng theo spec: dòng
   TOTAL luôn nằm ngay sau dòng dữ liệu cuối, không có dòng trống ở giữa) —
   bất kể công thức SUM có được cập nhật đúng hay không. `startRow` vẫn lấy
   từ công thức vì mốc này không bao giờ dịch (chèn dòng luôn xảy ra ngay
   TRƯỚC dòng TOTAL, không bao giờ trước dòng dữ liệu đầu tiên).
2. `SheetGenerator._ensureCapacity()`: sau khi `insertRowsBefore()`, giờ
   **chủ động ghi lại (rewrite)** MỌI công thức ở dòng TOTAL có tham chiếu
   dạng `START:END` (không chỉ cột "Giá USD" — cột "Giá VNĐ" hoặc cột khác
   nếu có công thức tương tự cũng được cập nhật), thay vì tin vào hành vi
   tự giãn không đáng tin cậy của Google Sheets. Nhờ vậy, chính ô TOTAL
   hiển thị trên sheet cũng luôn đúng cho các lần Generate về sau — không
   chỉ riêng phần đọc của `MessageService`.
3. Sheet Request **đã tồn tại từ trước** khi fix này được áp dụng (công
   thức TOTAL cũ bị "kẹt" ở vùng nhỏ hơn thực tế) vẫn được đọc ĐÚNG ngay lập
   tức bởi `MessageService` sau khi cập nhật code — không cần Generate lại
   sheet đó (tránh mất các cột Admin đã điền tay như `ID BOKT`, `Loại thanh
   toán`). Tuy vậy, **ô TOTAL hiển thị trên chính sheet đó** sẽ vẫn hiển thị
   sai (do công thức cũ chưa được sửa) cho tới khi Admin tự sửa lại công
   thức đó bằng tay, hoặc Generate lại sheet.

## 2. Kiến trúc đề xuất

```
Config.gs               - Hằng số, tên header, bảng mapping cột (single source of truth)
Utils.gs                - Header lookup, copy template, format ngày/tiền, UI helper, Logger
DataService.gs          - Đọc sheet tracker (QUẢN LÝ TOOLS), lọc tool được tick
TemplateService.gs      - Tìm & copy sheet mẫu "tháng gần nhất"
SheetGenerator.gs       - Ghi dữ liệu vào sheet mới (tự tìm vùng ghi từ công thức TOTAL)
RequestService.gs       - Orchestrator: nối toàn bộ luồng nghiệp vụ Generate Request Sheet
MessageService.gs       - Đọc sheet Request đã tạo/đã sửa -> build tin nhắn Lead/Head duyệt
NewToolRequestService.gs- Đọc sheet "Request Tool mới T{n}.{yyyy}" -> tin nhắn đề xuất mua Tool mới
Menu.gs                 - onOpen() - tạo menu "🛠️ Admin Tools"
Code.gs                 - Global handler cho menu (mỏng, chỉ gọi *Service + hiển thị Dialog)
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
| `RequestService` | RequestService.gs | Điều phối toàn bộ luồng Generate Request Sheet |
| `MessageService` | MessageService.gs | Đọc sheet Request đã generate/đã sửa, build tin nhắn Lead/Head duyệt |
| `NewToolRequestService` | NewToolRequestService.gs | Đọc sheet `Request Tool mới T{n}.{yyyy}` → tin nhắn đề xuất mua Tool mới |

## 4. Luồng xử lý (Generate Request Sheet)

```
onGenerateRequestSheetClick()  [Code.gs]
  └─ RequestService.generateRequestSheet()
        1. Utils.getNextMonthSheetName()/getNextMonthCode()
             -> "Request Tool mới T9.2026" / "T9"
        2. DataService.getApprovedTools("T9") trên QUẢN LÝ TOOLS
             (checkbox "Request Gia hạn T9")
        3. Nếu sheet đích đã tồn tại -> confirm ghi đè
        4. TemplateService.createSheetFromTemplate(...)
             - nhận "Request Tool mới T{n}.{yyyy}" / legacy "T{n}.{yyyy}" / prefix
        4b. RequestService.ensureMessageColumns_() thêm cột thiếu
             (Team, Brand, Thời gian triển khai, STK, ...)
        5. Map COLUMN_MAPPING -> SheetGenerator.writeRequestRows
             (ghi theo TÊN HEADER, không theo thứ tự cột cứng)
  └─ Utils.showAlert(... Sheet: Request Tool mới T9.2026)
```

## 5. Luồng xử lý (Tạo tin nhắn Lead/Head duyệt)

`MessageService` KHÔNG đọc lại tracker — nó đọc trực tiếp sheet Request
**đã được Generate và Admin đã chỉnh sửa xong** (điền `Loại thanh toán`, `ID
BOKT`, ...), dùng đúng vùng dữ liệu mà `SheetGenerator` đã ghi (suy ra lại từ
công thức SUM ở dòng TOTAL — `Utils.findTotalRowIndex`/
`findDataRangeFromTotalFormula`, code CHUNG với `SheetGenerator` để 2 class
này luôn đồng nhất "dòng nào là dữ liệu thật").

```
onCreateLeadMessageClick() / onCreateHeadMessageClick()  [Code.gs]
  └─ MessageService.buildLeadApprovalMessage() / buildHeadApprovalMessage()
        1. _getRequestSheet()
             - Ưu tiên sheet ĐANG MỞ nếu tên khớp "T{n}.{yyyy}"
             - Không thì tự tìm sheet Request MỚI NHẤT trong toàn bộ file
             - throw UserFacingError nếu không có sheet Request nào
        2. _readApprovalRows() - đọc đúng vùng dữ liệu (giống SheetGenerator),
           bỏ qua các dòng slot còn trống (chưa dùng tới tháng này)
        3a. [Lead] _groupToolsForLeadMessage() - nhóm theo "Loại thanh toán"
            (Gia hạn/Mua mới/Topup Credit - Config.PAYMENT_CATEGORY_ORDER),
            "Gia hạn"/"Mua mới" nhóm nhỏ tiếp theo "Loại gia hạn"
        3b. [Head] Danh sách phẳng (không nhóm) - Head chỉ cần ID phiếu/BOKT/
            số tiền để duyệt thanh toán
        4. Build text theo mẫu Admin cung cấp, cộng tổng "Giá USD" mọi dòng
  └─ Utils.showMessageDialog(title, message)  - dialog có Textarea + nút "Copy"
```

**Quy ước dữ liệu quan trọng** (đọc kỹ trước khi dùng thật):

- **"ID phiếu"** trong cả 2 mẫu tin nhắn được lấy từ cột **"ID BOKT"** của
  sheet Request — đây là cột GẦN NHẤT với khái niệm "mã phiếu" hiện có
  trong 21 cột của Template; nếu công ty có ý nghĩa khác cho "ID phiếu"
  (không phải "ID BOKT"), chỉ cần đổi `REQUEST.ID_BOKT` thành cột đúng trong
  `MessageService._readApprovalRows()` — không phải sửa gì khác.
- **"Link BOKT"** trong tin Head KHÔNG đọc từ sheet — luôn để TRỐNG
  (`Config.MESSAGE_BOKT_LINK_PLACEHOLDER = ''`, theo yêu cầu của Admin) vì
  sheet chưa có cột lưu link BOKT lúc này; Admin gõ/dán link thật trực tiếp
  vào ngay sau "Link BOKT:" của từng dòng, trước khi gửi.
- Tin **Head duyệt** là danh sách **có số thứ tự** (`1.`, `2.`, ...), mỗi
  tool gồm đúng 2 dòng liên tiếp KHÔNG có dòng trống ở giữa các tool
  (`N. ID phiếu: ... - Tên tool - Giá` rồi `Link BOKT: `) — chỉ có 1 dòng
  trống duy nhất, ngay trước dòng `=> TỔNG CẦN THANH TOÁN`.
- Ghi chú trong ngoặc sau "Chi phí" (ví dụ "(giá sau khi hết khuyến mãi)")
  được lấy từ cột **"Lý do"** nếu có nội dung — để trống thì không hiện.
- "TỔNG CẦN THANH TOÁN" luôn là tổng cột "Giá USD" của **toàn bộ** tool đã
  điền (cả 2 tin nhắn dùng cùng 1 tổng, kể cả Topup Credit).

## 6. Luồng xử lý (GỬI TIN NHẮN ĐỀ XUẤT MUA TOOL MỚI)

**Không dùng modal/form riêng.** Toàn bộ dữ liệu lấy từ sheet
`Request Tool mới T{n}.{yyyy}` (do Generate tạo từ QUẢN LÝ TOOLS).

```
1. User thêm tool mới vào QUẢN LÝ TOOLS (cùng tháng) → tick "Request Gia hạn T8"
2. 🛠️ Admin Tools → 📄 Generate Request Sheet
     → tạo sheet "Request Tool mới T8.2026"
3. User bổ sung trên sheet vừa tạo (nếu cần): ID BOKT, STK, Tên người nhận,
   Tên ngân hàng, Lý do (Note), chỉnh Thời gian triển khai…
4. 🛠️ Admin Tools → 🆕 GỬI TIN NHẮN ĐỀ XUẤT MUA TOOL MỚI
     └─ NewToolRequestService.createProposalMessages()
           - đọc sheet Request Tool mới (active / tháng kế / mới nhất)
           - mỗi dòng tool → 1 khối tin theo mẫu Admin
           - GTGT = Price × 10%, TOTAL = Price + GTGT
           - hiện dialog textarea + Copy
```

**Map cột → tin nhắn:**

| Tin nhắn | Cột sheet / nguồn |
| --- | --- |
| `[SEO TECH]` | `Team / Phòng ban` (Generate default `SEO TECH`) |
| `NCC AHREFS` + tháng | `Tên tool` + tháng từ tên sheet |
| `ID phiếu` | `ID BOKT` (ẩn dòng nếu trống) |
| `Thời gian triển khai` | `Thời gian triển khai` (Generate prefill Từ hôm nay → +1 tháng) |
| `Brand triển khai` | `Brand triển khai` (default `All brand`) |
| `Thông tin gói` | `Chi tiết (Tên gói…)` |
| `Price` | `Giá USD (bao gồm thuế)` dùng làm base price trong tin |
| `GTGT / TOTAL` | Tính 10% trong code |
| `STK / Tên người nhận / Tên ngân hàng` | các cột cùng tên (Admin điền) |
| `Note` | `Lý do` (ẩn khối Note nếu trống) |

## 7. Cài đặt

1. Mở Google Sheet **M5 - DevSEO - Software Info** → **Extensions → Apps Script**
   (phải là project **gắn với spreadsheet**, không phải project standalone
   "Untitled project" tách rời — menu custom chỉ hiện trên bound script).
2. Copy đủ các file `.gs` + `appsscript.json` từ thư mục này. Kiểm tra
   `appsscript.json` có `"runtimeVersion": "V8"`.
3. Lưu → reload sheet. Menu **🛠️ Admin Tools** phải hiện bên phải Help.
4. **Đặt tên file đúng:** khi tạo file trong Apps Script chỉ gõ tên không
   có đuôi (vd. `SheetGenerator`, `Menu`, `Config`). Editor tự thêm `.gs`.
   Nếu gõ `SheetGenerator.gs` sẽ ra file `SheetGenerator.gs.gs` → lỗi
   `Identifier 'SheetGenerator' has already been declared` và **mất hết menu**.
5. **Nếu không thấy menu / bị SyntaxError trùng class:**
   - Xóa file trùng có đuôi kép (vd. `SheetGenerator.gs.gs`) — giữ lại
     đúng 1 file `SheetGenerator.gs`.
   - Lưu → chọn hàm `createAdminMenu` → **Run** → Allow → reload Sheet.
6. **Chạy tool từ menu trên Sheet** (`🛠️ Admin Tools → …`), **không** bấm
   Run `onGenerateRequestSheetClick` trong Apps Script editor — editor thường
   không mở được hộp thoại confirm/alert nên Generate dừng im sau khi đọc tool.
7. Thêm tool trên `QUẢN LÝ TOOLS` → tick `Request Gia hạn T{n}`.
8. **Generate Request Sheet** → mở `Request Tool mới T{n}.{yyyy}`
   (log phải hiện đúng tên này; nếu còn thấy `"T8.2026"` là đang dùng code cũ —
   copy lại toàn bộ file từ `src/admin-request-phieu`).
9. Điền STK / ID BOKT / Note nếu cần → chạy **GỬI TIN NHẮN ĐỀ XUẤT MUA TOOL MỚI**
   → Copy tin nhắn.

## 8. Hiệu năng & Logging

- Đọc dữ liệu: đúng **1 lần** `getValues()` cho toàn bộ tracker.
- Ghi dữ liệu: đúng **1 lần** `setValues()` cho toàn bộ các dòng mới — không
  có `setValue()` trong vòng lặp ở đâu trong project.
- `AppLogger.info/warning/error` ghi log mỗi bước quan trọng (đọc dữ liệu,
  copy template, mở rộng vùng ghi, ghi dữ liệu) — tắt hoàn toàn bằng
  `Config.ENABLE_LOGGING = false` nếu cần.

## 9. Kiểm thử

Do không thể chạy trực tiếp trên Google Apps Script trong môi trường phát
triển này, toàn bộ luồng đã được mô phỏng bằng Node.js (`vm` module chạy
trực tiếp các file `.gs`, mock đầy đủ `Sheet`/`Range`/`Spreadsheet`/`Ui` kể cả
`copyTo()` và `insertRowsBefore()`) **sử dụng dữ liệu THẬT trích xuất từ file
Excel đã upload** (`Task_Management_Tracker`, `T7.2026`, `T8.2026`). Mock
`insertRowsBefore()` cố tình **KHÔNG** tự giãn công thức SUM (đúng hành vi
thật của Google Sheets đã xác nhận qua bug thật — xem mục "Bug đã fix" ở
trên) — mọi phép giãn công thức trong test phải đến từ chính
`SheetGenerator._growTotalFormulas()`, không phải từ giả định sai của mock:

- **Happy path**: tick 3 tool (CONTENTFUL, DIGITALOCEAN, N8N) → sheet mới có
  đúng 3 dòng, mapping đúng từng cột (SOURCE/SECTION/TRANSFORM/CONSTANT/
  MANUAL), dòng TOTAL và công thức được giữ nguyên, dữ liệu cũ (tool tháng
  trước) bị xoá sạch.
- **Mở rộng vùng ghi + công thức TOTAL**: tick nhiều tool hơn sức chứa gốc
  của template (ví dụ 18 tool trên template chỉ có 10 dòng trống) → tool tự
  chèn thêm dòng trước TOTAL, VÀ `SheetGenerator` chủ động ghi lại MỌI công
  thức SUM ở dòng TOTAL (cả "Giá USD" và "Giá VNĐ") sang đúng vùng mới (ví
  dụ `H3:H12` → `H3:H20`) — không dựa vào việc Google Sheets tự giãn.
- **Regression cho đúng bug thật đã báo cáo** (18 tool trên sheet, công
  thức TOTAL "kẹt" ở `=sum(H3:H12)` — 10 dòng đầu): `MessageService` vẫn
  đọc ĐÚNG **cả 18 tool**, gồm cả nhóm "Mua mới" (N8N, GOOGLECLOUD) và
  "Topup Credit" (OPENROUTER) mà bug cũ làm mất hoàn toàn, tổng tiền cộng
  đúng $12,721.9 (không phải $11,282.9 như tin nhắn lỗi cũ).
- **Không tool nào được tick** → `UserFacingError` đúng message
  "Không có Tool nào được chọn để tạo Request.".
- **Thiếu cột checkbox tháng đích** (chưa tạo cột "Request Gia hạn T9") →
  `UserFacingError` báo rõ tên cột thiếu.
- **Không có Template phù hợp** (xoá hết sheet T*.2026) → `UserFacingError`
  "Không tìm thấy Template.".
- **Từ chối ghi đè** khi sheet đã tồn tại → trả về `null`, không tạo/sửa gì.

**`MessageService` (tin nhắn Lead/Head duyệt)** — cũng mô phỏng bằng Node.js
`vm`, dữ liệu mock theo đúng format mẫu Admin cung cấp (Mosaiker/Similarweb
(Pro)/Claude Max/N8N/Cursor với `Gia hạn`/`Mua mới`/`Topup Credit`):

- **Nhóm đúng theo mẫu**: sinh đúng 4 nhóm `📌 Loại: ...` (Mua theo tháng -
  Gia hạn / Mua theo năm - Gia hạn / Mua theo tháng - Mua mới / Mua topup
  credit), số thứ tự (`1.`, `2.`...) reset lại ở đầu mỗi nhóm, ghi chú "Lý
  do" được nối sau "Chi phí", tổng tiền cuối tin nhắn cộng đúng cả 5 tool.
- **Bỏ qua slot còn trống**: các dòng chưa được Generate/Admin chưa điền
  (`Tên tool` rỗng) trong vùng dữ liệu suy ra từ công thức TOTAL không xuất
  hiện trong tin nhắn.
- **Tin Head là danh sách phẳng có số thứ tự** (`1.`, `2.`, ...), KHÔNG có
  dòng trống giữa các tool, dòng "Link BOKT:" luôn để trống (không còn chữ
  "Admin tự copy link"), vẫn cộng đúng tổng tiền giống tin Lead.
- **Không có sheet Request nào** (`T{n}.{yyyy}`) trong toàn bộ file →
  `UserFacingError` yêu cầu mở đúng sheet.
- **Sheet Request tồn tại nhưng chưa có Tool nào** (mọi slot còn trống) →
  `UserFacingError` báo rõ tên sheet.

**`NewToolRequestService` (đề xuất mua Tool mới từ sheet)** — chạy:
`node src/admin-request-phieu/tests/new-tool-proposal-message.test.js`

- Tên sheet Generate = `Request Tool mới T8.2026` (từ 07/2026).
- Message mẫu AHREFS khớp 100% (`===`) với spec Admin.
- Parse được cả legacy `T7.2026` / `Dev SEO T7.2026` làm template.

Toàn bộ file `.gs` pass `node --check`.

## 10. Mở rộng (roadmap, xem chi tiết trong `Code.gs`)

Thêm tính năng mới (Generate BOKT, Generate Email, Generate Telegram Message,
Export PDF/Excel, Archive Sheet, Auto gửi Gmail) chỉ cần:
1. Tạo 1 file `.gs` mới chứa 1 class Service mới (constructor nhận
   `spreadsheet`, giống pattern của `RequestService`).
2. Thêm 1 hàm handler global mỏng trong `Code.gs`.
3. Thêm 1 dòng `.addItem(...)` trong `Menu.gs`.

Không cần sửa `Config`/`DataService`/`TemplateService`/`SheetGenerator`/
`RequestService` hiện có. `RequestService.generateRequestSheet()` đã trả về
`{ sheetName, toolCount }` để các tính năng sau (ví dụ Generate BOKT) có thể
tái sử dụng ngay nếu cần.
