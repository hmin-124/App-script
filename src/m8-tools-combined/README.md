# M8 Tools + DIG1 ADS Dashboard — bản Combined (1 Google Sheet)

Bộ file này gộp **2 chức năng độc lập** vào **1 Apps Script project duy nhất**,
dùng khi cả "Tạo tin nhắn trình duyệt" (M8 Tools) và "DIG1 ADS Dashboard"
cùng cần chạy trên **1 file Google Sheet** (vì mỗi Spreadsheet chỉ gắn được
1 Apps Script project — không thể có 2 project riêng cho cùng 1 Sheet).

Nếu 2 tool này chạy trên **2 Sheet khác nhau**, KHÔNG cần dùng bộ file này —
dùng trực tiếp `src/browser-message-tool/` và `src/dig1-ads-dashboard/`
(mỗi project độc lập, không đổi tên gì).

## Vì sao phải đổi tên một số class?

2 project gốc dùng trùng tên `Config`, `Utils`, `DataService` (mỗi bên có
nội dung khác nhau) và cùng có hàm `onOpen()`. Apps Script coi TẤT CẢ file
`.gs` trong 1 project là **1 global scope chung**, nên nếu giữ nguyên tên sẽ
gặp lỗi `Identifier 'X' has already been declared` (giống lỗi đã từng gặp).

Bộ file này xử lý bằng cách:

| Class/Hàm gốc (Dashboard) | Đổi thành | Lý do |
| --- | --- | --- |
| `Config` (dig1-ads-dashboard) | `DashboardConfig` | Trùng `Config` của M8 Tools |
| `Utils` (dig1-ads-dashboard) | `DashboardUtils` | Trùng `Utils` của M8 Tools |
| `DataService` (dig1-ads-dashboard) | `DashboardDataService` | Trùng `DataService` của M8 Tools |
| `onOpen()` (dig1-ads-dashboard, trong `Code.gs`) | Gộp vào `onOpen()` chung trong `Code.gs` | Chỉ được có 1 `onOpen()`/project |

Các class không trùng tên (`ReportService`, `DashboardService`, `ChartService`,
`MessageBuilder`, `MessageTemplate`, `ApprovalService`, `AdsRecord`,
`TicketRecord`) giữ nguyên, không đổi.

## Danh sách 14 file cần tạo trong Apps Script Editor

Của **M8 Tools** (giữ nguyên, không đổi):

| File | Nội dung |
| --- | --- |
| `Config.gs` | Config gốc của M8 Tools |
| `Utils.gs` | Utils gốc của M8 Tools |
| `DataService.gs` | `TicketRecord` + `DataService` gốc của M8 Tools |
| `MessageBuilder.gs` | Không đổi |
| `Template.gs` | Không đổi |
| `ApprovalService.gs` | Không đổi |
| `Dialog.html` | Không đổi |

Của **DIG1 ADS Dashboard** (đã đổi tên):

| File | Nội dung |
| --- | --- |
| `DashboardConfig.gs` | Config của Dashboard, class đổi tên `DashboardConfig` |
| `DashboardUtils.gs` | Utils của Dashboard, class đổi tên `DashboardUtils` |
| `DashboardDataService.gs` | `AdsRecord` (không đổi) + `DataService` đổi tên `DashboardDataService` |
| `ReportService.gs` | Không đổi tên class, chỉ cập nhật tham chiếu `DashboardConfig`/`DashboardUtils` |
| `DashboardService.gs` | Không đổi tên class, chỉ cập nhật tham chiếu |
| `ChartService.gs` | Không đổi tên class, chỉ cập nhật tham chiếu |
| `DashboardCode.gs` | `setupDashboardProject()`, `refreshDashboard()`, `onEdit()` — **KHÔNG có `onOpen()`** |

File dùng chung, đã sửa để tạo cả 2 menu:

| File | Nội dung |
| --- | --- |
| `Code.gs` | `onOpen()` tạo CẢ 2 menu ("🛠️ M8 Tools" + "📊 DIG1 Reports") + toàn bộ hàm gốc của M8 Tools (`createBrowserMessage`, `showMessageDialog_`, `sendMessageToGoogleChat`, `sendMessageToTelegram`) |

`appsscript.json` dùng chung 1 bản (cả 2 project gốc dùng cùng OAuth scope
`spreadsheets.currentonly`, không cần gộp thêm gì).

## Cài đặt

1. Mở Google Sheet dùng chung cho cả 2 chức năng (sheet này cần có cả các
   tab dữ liệu phiếu — ví dụ `DIG1-ADS`/`DIG1-ANW` — và sẽ tự có thêm
   `DATA_ADS`/`CONFIG`/`DASHBOARD` sau khi chạy Setup Dashboard).
2. **Extensions → Apps Script**.
3. Tạo đủ 14 file Script + 1 file HTML (`Dialog`) theo đúng tên trong 2 bảng
   trên, copy nội dung tương ứng từ thư mục `src/m8-tools-combined/`.
4. Bật hiển thị manifest (**Project Settings ⚙️ → Show 'appsscript.json'**),
   paste nội dung `appsscript.json`.
5. Lưu (`Ctrl+S`), tải lại Sheet.
6. Sẽ thấy **2 menu**: **🛠️ M8 Tools** và **📊 DIG1 Reports**.
7. Với Dashboard: **📊 DIG1 Reports → ⚙️ Khởi tạo Dashboard (Setup)** để tạo
   sheet + dữ liệu mẫu lần đầu.
8. Với tin nhắn trình duyệt: bôi đen dòng phiếu → **🛠️ M8 Tools → 💬 Tạo tin
   nhắn trình duyệt**.
9. Đổi tháng báo cáo: dùng ngay ô **🔎 Chọn tháng** (nền vàng amber) ở dòng
   thứ 2 trên sheet `DASHBOARD` — không cần mở sheet `CONFIG`. Chọn tháng
   khác rồi Enter, Dashboard tự động cập nhật toàn bộ (KPI, bảng, chart).

## Lưu ý khi cập nhật code sau này

Nếu cần sửa logic của Dashboard, nhớ áp dụng đúng 3 quy tắc đổi tên ở trên
(`Config`→`DashboardConfig`, `Utils`→`DashboardUtils`, `DataService`→
`DashboardDataService`) trước khi paste vào project combined — bản gốc ở
`src/dig1-ads-dashboard/` vẫn giữ tên class gốc (dùng khi deploy độc lập trên
Sheet riêng), không tự động đồng bộ với bản combined này.
