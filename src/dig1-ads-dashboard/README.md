# 📊 DIG1 Reports — Dashboard ADS trên Google Sheets

Hệ thống Dashboard báo cáo hiệu suất ADS của team DIG1, chạy hoàn toàn trong
Google Sheets bằng Google Apps Script (không dùng Looker Studio). Chọn tháng
qua Dropdown trên sheet `CONFIG`, Dashboard tự động refresh (KPI cards, bảng
Brand/Member, Top Performer, 4 chart) — không cần chạy thủ công.

## Cấu trúc file

| File | Vai trò |
| --- | --- |
| `Config.gs` | Tên sheet, tên cột (logic key), layout Dashboard (vị trí/kích thước động), màu sắc, định dạng số. |
| `DataService.gs` | Đọc/ghi Sheet: `getAllData()`, `getDataByMonth(month)`, đọc/ghi CONFIG, tạo sheet còn thiếu + dữ liệu mẫu. |
| `ReportService.gs` | Tính toán thuần: `calculateSummary()`, `calculateBrandReport()`, `calculateMemberReport()`, `calculateDailyReport()`, `getTopPerformers()`. |
| `DashboardService.gs` | Render Dashboard: `renderSummaryCards()`, `renderBrandTable()`, `renderMemberTable()`, `renderTopPerformer()`. |
| `ChartService.gs` | Vẽ 4 chart: `createRevenueTrendChart()`, `createCostRevenueChart()`, `createBrandChart()`, `createMemberChart()`. |
| `Utils.gs` | `formatCurrency()`, `formatPercent()`, `formatNumber()`, parse ngày/số, sinh dữ liệu mẫu. |
| `Code.gs` | `onOpen()` (menu), `onEdit()` (trigger đơn giản), `refreshDashboard()` (orchestrator), `setupDashboardProject()`. |

## Cấu trúc Sheet cần có

### `DATA_ADS` (dữ liệu nguồn)

| Date | Team | Member | Brand | Campaign | Cost | Revenue | FTD | Deposit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01/06/2026 | DIG1 | John | BU88 | FB001 | 1200 | 3000 | 20 | 5000 |

- Cột `Date` nên format là Date thật trên Sheets (hoặc chuỗi `dd/MM/yyyy`).
- Tên cột phải chứa đúng các từ khóa trên (không phân biệt hoa/thường,
  khoảng trắng/xuống dòng dư không ảnh hưởng) — xem `Config.DATA_HEADER_KEYS`
  nếu muốn đổi tên cột.

### `CONFIG` (key-value)

| Key | Value |
| --- | --- |
| SelectedMonth | 2026-06 |

- Ô `Value` của dòng `SelectedMonth` sẽ được gắn Dropdown (danh sách các
  tháng có dữ liệu thật trong `DATA_ADS`) sau khi chạy Setup.

### `DASHBOARD` (sheet trống, để hệ thống tự render)

Không cần tạo sẵn nội dung — `DashboardService`/`ChartService` sẽ tự vẽ mỗi
lần refresh.

### `_ChartData` (tự động tạo, ẨN)

Sheet phụ trợ do `ChartService` tự tạo/ẩn, chỉ chứa dữ liệu tổng hợp để vẽ
chart (Embedded Chart của Sheets chỉ vẽ được từ ô thật, không nhận mảng JS
trực tiếp). Không cần đụng vào sheet này.

## Cài đặt

1. Mở Google Sheet (có thể trống hoàn toàn, hoặc đã có sẵn `DATA_ADS` với dữ
   liệu thật theo cấu trúc trên).
2. **Extensions → Apps Script**.
3. Tạo 7 file Script với tên đúng: `Config`, `Utils`, `DataService`,
   `ReportService`, `DashboardService`, `ChartService`, `Code` (Apps Script
   tự thêm phần mở rộng `.gs`). Copy nội dung tương ứng từ repo vào từng file.
4. Bật hiển thị manifest: **Project Settings (⚙️) → tick "Show
   'appsscript.json' manifest file in editor"**, mở file `appsscript.json` và
   paste nội dung từ `appsscript.json` trong thư mục này.
5. Lưu (`Ctrl+S`), tải lại Google Sheet.
6. Menu **📊 DIG1 Reports** xuất hiện → bấm **⚙️ Khởi tạo Dashboard (Setup)**:
   - Tự tạo `DATA_ADS` (kèm ~60 dòng dữ liệu mẫu trong tháng hiện tại, nếu
     sheet chưa tồn tại), `CONFIG`, `DASHBOARD` (nếu chưa tồn tại).
   - Gắn Dropdown chọn tháng vào ô `SelectedMonth`.
   - Render Dashboard lần đầu.
7. Lần đầu chạy, Google sẽ yêu cầu **Authorization** → **Review permissions**
   → chọn account → **Advanced → Go to [project] (unsafe)** → **Allow**.
8. Thay dữ liệu mẫu trong `DATA_ADS` bằng dữ liệu thật (giữ đúng tên cột).
   Sau khi có dữ liệu thật, chạy lại **⚙️ Khởi tạo Dashboard (Setup)** một
   lần nữa để Dropdown cập nhật đúng danh sách tháng thực tế (an toàn, không
   xóa sheet đã có).

## Trigger

- **`onEdit(e)`** là **Simple Trigger** (không cần cấu hình gì thêm trong
  menu Triggers của Apps Script — Google tự nhận diện hàm tên `onEdit` là
  trigger đơn giản). Khi ô `Value` của dòng `SelectedMonth` trên sheet
  `CONFIG` bị sửa (gõ tay hoặc chọn từ Dropdown), Dashboard tự động
  `refreshDashboard()` — không cần chạy thủ công.
- Nếu vì lý do nào đó Simple Trigger không kích hoạt (một số trường hợp hiếm
  do giới hạn của Simple Trigger), menu **🔄 Cập nhật Dashboard** luôn có sẵn
  để refresh thủ công.

## Công thức KPI

```
Profit = Revenue - Cost
ROI    = Profit / Cost × 100   (%)
ROAS   = Revenue / Cost        (lần, hiển thị dạng "x")
```

Khi `Cost = 0`, `ROI`/`ROAS` trả về `0` (tránh chia cho 0) thay vì lỗi/`NaN`
— xem `Utils.safeDivide()`.

## Layout Dashboard (tự tính vị trí động)

```
┌───────────────────────────────────────────────────────────┐
│         📊 DIG1 ADS PERFORMANCE DASHBOARD (title)          │
│              Tháng báo cáo: ... • Cập nhật: ...            │
│                                                             │
│  [💰Cost] [📈Revenue] [💵Profit] [📊ROI] [🚀ROAS] [🎯FTD]   │  ← KPI Cards
│                                                             │
│  📈 BÁO CÁO THEO BRAND (table, sort theo Revenue giảm dần)  │
│  👤 BÁO CÁO THEO MEMBER (table, sort theo Revenue giảm dần) │
│  🏆 TOP 5 PERFORMERS  (Top Member | Top Brand song song)   │
│                                                             │
│  [Chart 1: Revenue trend]     [Chart 2: Cost vs Revenue]   │
│  [Chart 3: Revenue theo Brand][Chart 4: Revenue theo Member]│
└───────────────────────────────────────────────────────────┘
```

Mỗi hàm `render*()` trong `DashboardService` trả về dòng kế tiếp còn trống,
nên số dòng Brand/Member thay đổi giữa các tháng không làm vỡ layout hay
chồng lấp chart.

## Mở rộng thêm KPI mới

1. Thêm phép tính vào `ReportService.calculateSummary()` (hoặc thêm method
   mới nếu là KPI theo nhóm).
2. Thêm 1 object `{label, value, format}` vào mảng `cards` trong
   `DashboardService.renderSummaryCards()`.
3. Nếu cần định dạng số mới, thêm pattern vào `Config.NUMBER_FORMATS`.

Không cần sửa `DataService`/`Code.gs`.

## Giới hạn đã biết

- `Utils.buildSampleAdsRows()` chỉ dùng cho mục đích demo lúc setup lần đầu
  (dữ liệu ngẫu nhiên trong tháng hiện tại) — luôn thay bằng dữ liệu thật.
- Ký hiệu tiền tệ mặc định là `$` (`Config.CURRENCY_SYMBOL`); đổi giá trị
  này để dùng ký hiệu khác, các format Currency sẽ tự cập nhật theo.
- Chart dùng sheet ẩn `_ChartData` làm vùng dữ liệu trung gian — không xóa
  sheet này (sẽ được tự tạo lại ở lần refresh kế tiếp nếu bị xóa nhầm).
