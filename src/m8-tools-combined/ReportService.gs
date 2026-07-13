/**
 * ReportService.gs
 * ---------------------------------------------------------------------------
 * Tính toán THUẦN (pure) từ danh sách AdsRecord — không đọc/ghi Sheet, không
 * render UI. Nhận vào mảng record đã lọc theo tháng (từ DashboardDataService), trả về
 * các cấu trúc report đã tổng hợp cho DashboardService/ChartService hiển thị.
 * Tách riêng để dễ test độc lập và dễ thêm KPI mới (chỉ cần thêm 1 method,
 * không ảnh hưởng phần đọc dữ liệu hay phần render).
 */

class ReportService {
  /**
   * Tính các KPI tổng quan: Total Cost/Revenue/Deposit/FTD, Profit, ROI, ROAS.
   * Công thức: Profit = Revenue - Cost; ROI = Profit/Cost*100; ROAS = Revenue/Cost.
   * @param {AdsRecord[]} records
   * @returns {{totalCost:number, totalRevenue:number, totalDeposit:number, totalFtd:number, profit:number, roi:number, roas:number}}
   */
  static calculateSummary(records) {
    try {
      const totals = ReportService._sumRecords(records);
      const profit = totals.revenue - totals.cost;
      const roi = DashboardUtils.safeDivide(profit, totals.cost) * 100;
      const roas = DashboardUtils.safeDivide(totals.revenue, totals.cost);

      return {
        totalCost: totals.cost,
        totalRevenue: totals.revenue,
        totalDeposit: totals.deposit,
        totalFtd: totals.ftd,
        profit,
        roi,
        roas,
      };
    } catch (error) {
      throw new Error(`ReportService.calculateSummary: ${error.message}`);
    }
  }

  /**
   * Báo cáo tổng hợp theo Brand: Cost/Revenue/Profit/ROI/FTD, sắp xếp theo
   * Revenue giảm dần.
   * @param {AdsRecord[]} records
   * @returns {Array<{label:string, cost:number, revenue:number, ftd:number, profit:number, roi:number}>}
   */
  static calculateBrandReport(records) {
    try {
      return ReportService._groupBy(records, (record) => record.brand);
    } catch (error) {
      throw new Error(`ReportService.calculateBrandReport: ${error.message}`);
    }
  }

  /**
   * Báo cáo tổng hợp theo Member: Cost/Revenue/Profit/ROI/FTD, sắp xếp theo
   * Revenue giảm dần.
   * @param {AdsRecord[]} records
   * @returns {Array<{label:string, cost:number, revenue:number, ftd:number, profit:number, roi:number}>}
   */
  static calculateMemberReport(records) {
    try {
      return ReportService._groupBy(records, (record) => record.member);
    } catch (error) {
      throw new Error(`ReportService.calculateMemberReport: ${error.message}`);
    }
  }

  /**
   * Tổng hợp Cost/Revenue theo từng ngày trong tháng, sắp xếp tăng dần theo
   * ngày — dùng cho Chart 1 (Revenue trend) và Chart 2 (Cost vs Revenue).
   * @param {AdsRecord[]} records
   * @returns {Array<{date:Date, dateLabel:string, cost:number, revenue:number}>}
   */
  static calculateDailyReport(records) {
    try {
      const groups = new Map();

      records.forEach((record) => {
        const dayKey = Utilities.formatDate(record.date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (!groups.has(dayKey)) {
          groups.set(dayKey, { date: record.date, dateLabel: DashboardUtils.toDayLabel(record.date), cost: 0, revenue: 0 });
        }
        const bucket = groups.get(dayKey);
        bucket.cost += record.cost;
        bucket.revenue += record.revenue;
      });

      return Array.from(groups.values()).sort((a, b) => a.date - b.date);
    } catch (error) {
      throw new Error(`ReportService.calculateDailyReport: ${error.message}`);
    }
  }

  /**
   * Lấy Top N Member và Top N Brand theo Revenue cao nhất. Vì brandReport và
   * memberReport đã được sắp xếp giảm dần theo Revenue, chỉ cần cắt N phần tử đầu.
   * @param {Array<Object>} memberReport - Kết quả từ calculateMemberReport().
   * @param {Array<Object>} brandReport - Kết quả từ calculateBrandReport().
   * @param {number} [topN=DashboardConfig.TOP_N]
   * @returns {{topMembers:Array<Object>, topBrands:Array<Object>}}
   */
  static getTopPerformers(memberReport, brandReport, topN = DashboardConfig.TOP_N) {
    try {
      return {
        topMembers: (memberReport || []).slice(0, topN),
        topBrands: (brandReport || []).slice(0, topN),
      };
    } catch (error) {
      throw new Error(`ReportService.getTopPerformers: ${error.message}`);
    }
  }

  /**
   * Cộng dồn Cost/Revenue/FTD/Deposit của toàn bộ record.
   * @param {AdsRecord[]} records
   * @returns {{cost:number, revenue:number, ftd:number, deposit:number}}
   * @private
   */
  static _sumRecords(records) {
    return (records || []).reduce(
      (acc, record) => {
        acc.cost += record.cost;
        acc.revenue += record.revenue;
        acc.ftd += record.ftd;
        acc.deposit += record.deposit;
        return acc;
      },
      { cost: 0, revenue: 0, ftd: 0, deposit: 0 }
    );
  }

  /**
   * Gom nhóm record theo một key (Brand hoặc Member), tính Cost/Revenue/FTD/
   * Profit/ROI cho từng nhóm, sắp xếp giảm dần theo Revenue.
   * @param {AdsRecord[]} records
   * @param {function(AdsRecord): string} keySelector
   * @returns {Array<{label:string, cost:number, revenue:number, ftd:number, profit:number, roi:number}>}
   * @private
   */
  static _groupBy(records, keySelector) {
    const groups = new Map();

    (records || []).forEach((record) => {
      const rawKey = String(keySelector(record) || '').trim();
      const key = rawKey || '(Không xác định)';
      if (!groups.has(key)) {
        groups.set(key, { label: key, cost: 0, revenue: 0, ftd: 0 });
      }
      const bucket = groups.get(key);
      bucket.cost += record.cost;
      bucket.revenue += record.revenue;
      bucket.ftd += record.ftd;
    });

    return Array.from(groups.values())
      .map((bucket) => {
        const profit = bucket.revenue - bucket.cost;
        const roi = DashboardUtils.safeDivide(profit, bucket.cost) * 100;
        return { ...bucket, profit, roi };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }
}
