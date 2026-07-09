# M8 Tools — Tạo tin nhắn trình duyệt

Google Apps Script project sinh tin nhắn trình duyệt (payment approval message)
từ các dòng người dùng chọn trên Google Sheets, theo mẫu chuẩn của team M8.

## Chức năng

1. Người dùng bôi đen một hoặc nhiều dòng phiếu trên sheet.
2. Menu **M8 Tools → Tạo tin nhắn trình duyệt**.
3. Script đọc các dòng đã chọn (batch, theo header — không hardcode cột),
   tính tổng & quy đổi USDC cho từng phiếu, sinh tin nhắn theo mẫu.
4. Mở Dialog hiển thị tin nhắn với 3 nút: **Copy**, **Gửi Google Chat**
   (stub, để mở rộng sau), **Gửi Telegram** (stub, để mở rộng sau).

## Cấu trúc file

| File | Vai trò |
| --- | --- |
| `Config.gs` | Toàn bộ hằng số: tên menu, tên cột (logic key), tỷ giá mặc định, số tiền test ví, bảng map người duyệt theo PIC. |
| `DataService.gs` | Đọc dữ liệu từ Sheet: tự dò dòng header, map header -> cột, đọc các dòng được chọn bằng `getValues()` theo batch. Xuất `TicketRecord`. |
| `Utils.gs` | Hàm thuần: `formatMoney`, `formatUSDC`, `convertToUsdc`, và các hàm trích xuất từ text tự do (`extractProjectCode`, `extractPaymentScheme`, `extractDisbursementLines`, `extractExchangeRate`, `extractFirstLine`). |
| `Template.gs` | `MessageTemplate` — định dạng chính xác từng phần: `buildSummaryLine`, `buildHeader`, `buildBody`, `buildFooter`, các dấu phân cách/icon. |
| `MessageBuilder.gs` | Ghép DataService + Utils + Template + ApprovalService thành tin nhắn hoàn chỉnh. |
| `ApprovalService.gs` | Sinh câu "nhờ duyệt" theo PIC phiếu; stub `sendToGoogleChat` / `sendToTelegram` để mở rộng sau. |
| `Code.gs` | `onOpen` (tạo menu), handler menu, mở Dialog, wrapper cho `google.script.run`. |
| `Dialog.html` | UI Dialog: textarea + 3 nút hành động. |
| `appsscript.json` | Manifest riêng cho project này. |

## Cài đặt

1. Mở Google Sheet chứa dữ liệu phiếu (cột tối thiểu cần có, tên có thể lệch
   khoảng trắng/xuống dòng nhưng phải chứa các từ khóa sau — xem
   `Config.HEADER_KEYS`):
   - `ID phiếu`
   - `Nội dung phiếu`
   - `Cost`
   - `DVT`
   - `PIC phiếu`
2. Extensions → Apps Script.
3. Tạo các file `.gs`/`.html` đúng tên như trong bảng trên, copy nội dung
   tương ứng vào (hoặc dùng `clasp push` nếu đã cấu hình `.clasp.json` với
   `rootDir` chỉ tới thư mục này).
4. Lưu, tải lại Sheet — menu **M8 Tools** sẽ xuất hiện.
5. Bôi đen 1+ dòng phiếu → **M8 Tools → Tạo tin nhắn trình duyệt**.

## Các điểm cấu hình / mở rộng

- **Tỷ giá PNT → USDC**: `Config.DEFAULT_EXCHANGE_RATE_PNT_PER_USDC`. Nếu nội
  dung phiếu có dòng dạng `Tỷ giá USDT: 27,900 PNT`, hệ thống tự lấy tỷ giá
  đó cho riêng phiếu này (`Utils.extractExchangeRate`) — không cần sửa code.
- **Số tiền "Test ví"**: `Config.TEST_WALLET_USDC`.
- **Người duyệt theo PIC**: thêm key mới vào `Config.APPROVER_MAP` (key là
  giá trị cột "PIC phiếu", viết thường). PIC không có trong map sẽ dùng
  `Config.DEFAULT_APPROVAL_MESSAGE`.
- **Mẫu tin nhắn mới**: tạo class khác cùng interface với `MessageTemplate`
  (`buildSummaryLine/buildHeader/buildBody/buildFooter`), rồi cho phép
  `MessageBuilder` nhận template qua constructor.
- **Gửi thật tới Google Chat / Telegram**: điền phần `TODO` trong
  `ApprovalService.sendToGoogleChat` / `sendToTelegram` (dùng `UrlFetchApp`,
  lấy webhook/token từ `PropertiesService.getScriptProperties()` — KHÔNG
  hardcode secret trong code).

## Giới hạn đã biết

- `Utils.extractProjectCode` nhận diện nhãn `Dự án:` và `Brand code:`.
  `Utils.extractDisbursementLines` chỉ nhận diện dòng dạng
  `Đợt NN: ... - Status: ...`. Nếu team khác dùng format khác cho "Nội dung
  phiếu", bổ sung pattern tương ứng vào `Utils.gs` — không cần sửa
  `Template.gs`/`MessageBuilder.gs`.
- Nếu vùng chọn không có phiếu hợp lệ (thiếu "ID phiếu") hoặc thiếu cột bắt
  buộc, hệ thống báo lỗi rõ ràng qua `ui.alert()` thay vì tạo tin nhắn rỗng/sai.
