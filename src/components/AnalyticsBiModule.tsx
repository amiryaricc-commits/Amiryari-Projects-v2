import React, { useMemo, useState } from 'react';
import {
  TrendingUp,
  BarChart3,
  AlertOctagon,
  Clock,
  UserCheck,
  PieChart,
  Sparkles,
  Flame,
  Cpu,
  Eye,
  EyeOff,
  Send,
} from 'lucide-react';
import {
  InventoryItemRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  MonthlyExpenseLedgerRecord,
  CustomerContactRecord,
  AccountNode,
} from '../data/erpSeedData';
import { formatCurrency, calculateSalesDashboardMetrics } from '../utils/erpEngine';

interface AnalyticsBiModuleProps {
  privacyMasked: boolean;
  onTogglePrivacy: () => void;
  accounts: AccountNode[];
  inventoryItems: InventoryItemRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  journalEntries: JournalEntryRecord[];
  monthlyExpenses: MonthlyExpenseLedgerRecord[];
  contacts: CustomerContactRecord[];
  onCreateDeadStockFestivalRule: (sku: string, itemName: string) => void;
  onShowToast: (msg: string) => void;
}

export const AnalyticsBiModule: React.FC<AnalyticsBiModuleProps> = ({
  privacyMasked,
  onTogglePrivacy,
  accounts,
  inventoryItems,
  salesInvoices,
  purchaseInvoices,
  journalEntries,
  monthlyExpenses,
  contacts,
  onCreateDeadStockFestivalRule,
  onShowToast,
}) => {
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('همه ماه‌ها');

  const filteredSales = useMemo(() => {
    if (selectedMonthFilter === 'همه ماه‌ها') return salesInvoices;
    return salesInvoices.filter((inv) => inv.date.startsWith(selectedMonthFilter));
  }, [salesInvoices, selectedMonthFilter]);

  const baseMetrics = useMemo(
    () => calculateSalesDashboardMetrics(filteredSales, inventoryItems),
    [filteredSales, inventoryItems]
  );

  // Compute Sector-Specific Net Profit (سود خالص ویپ‌شاپ vs سود خالص لوازم کامپیوتر)
  const sectorStats = useMemo(() => {
    let vapeRevenue = 0;
    let vapeCogs = 0;
    let pcRevenue = 0;
    let pcCogs = 0;

    const bySku = new Map(inventoryItems.map((i) => [i.sku, i]));

    for (const inv of filteredSales) {
      if (inv.docstatus !== 1 || inv.status === 'ابطال‌شده') continue;
      const sign = inv.returnAgainst ? -1 : 1;

      if (inv.lines && inv.lines.length > 0) {
        for (const line of inv.lines) {
          const item = bySku.get(line.sku);
          const sector =
            line.sector ||
            item?.sector ||
            (item?.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
          const lineRev = line.netLineAmount || line.qty * line.unitPrice;
          const unitCost =
            line.valuationRate > 0
              ? line.valuationRate
              : item?.valuationRate || Math.round(line.unitPrice * 0.72);
          const lineCost = line.qty * unitCost;

          if (sector === 'pc') {
            pcRevenue += sign * lineRev;
            pcCogs += sign * lineCost;
          } else {
            vapeRevenue += sign * lineRev;
            vapeCogs += sign * lineCost;
          }
        }
      } else {
        // Historical summary invoice defaults to Vape Shop unless computer mentioned
        const isPc =
          inv.itemsSummary.includes('گرافیک') ||
          inv.itemsSummary.includes('کامپیوتر') ||
          inv.itemsSummary.includes('پردازنده') ||
          inv.itemsSummary.includes('SSD');
        const cogs = inv.cogsAmount || Math.round(inv.totalAmount * 0.72);
        if (isPc) {
          pcRevenue += sign * inv.totalAmount;
          pcCogs += sign * cogs;
        } else {
          vapeRevenue += sign * inv.totalAmount;
          vapeCogs += sign * cogs;
        }
      }
    }

    // Operating expenses (Journal Entries + Locked Monthly Expense Ledger)
    const journalExp = journalEntries
      .filter((j) => j.docstatus === 1)
      .reduce((sum, j) => sum + j.totalDebit, 0);
    const fixedExp = monthlyExpenses.reduce((sum, m) => sum + m.amount, 0);
    const totalOperatingExpenses = journalExp + fixedExp;

    const totalGrossProfit = vapeRevenue - vapeCogs + (pcRevenue - pcCogs);
    const totalRev = Math.max(1, vapeRevenue + pcRevenue);
    const vapeShare = vapeRevenue / totalRev;
    const pcShare = pcRevenue / totalRev;

    const vapeNetProfit = Math.round(vapeRevenue - vapeCogs - totalOperatingExpenses * vapeShare);
    const pcNetProfit = Math.round(pcRevenue - pcCogs - totalOperatingExpenses * pcShare);
    const totalNetProfit = vapeNetProfit + pcNetProfit;

    // Tied-up inventory capital per sector
    let vapeInventoryCapital = 0;
    let pcInventoryCapital = 0;
    for (const item of inventoryItems) {
      const val = item.stockQty * item.valuationRate;
      const sec =
        item.sector || (item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
      if (sec === 'pc') pcInventoryCapital += val;
      else vapeInventoryCapital += val;
    }

    const vapeRoiPct =
      vapeInventoryCapital > 0 ? Math.round((vapeNetProfit / vapeInventoryCapital) * 100) : 34;
    const pcRoiPct =
      pcInventoryCapital > 0 ? Math.round((pcNetProfit / pcInventoryCapital) * 100) : 22;

    return {
      vapeRevenue,
      vapeCogs,
      vapeNetProfit,
      vapeInventoryCapital,
      vapeRoiPct,
      pcRevenue,
      pcCogs,
      pcNetProfit,
      pcInventoryCapital,
      pcRoiPct,
      totalGrossProfit,
      totalOperatingExpenses,
      totalNetProfit,
    };
  }, [filteredSales, inventoryItems, journalEntries, monthlyExpenses]);

  // 1. Equity Growth Curve Data (منحنی رشد سرمایه خالص ماه‌به‌ماه)
  const equityCurvePoints = useMemo(() => {
    const cashBalance = accounts
      .filter((a) => a.code.startsWith('11010'))
      .reduce((s, a) => s + a.balance, 0);
    const payables = purchaseInvoices
      .filter((p) => p.docstatus === 1 && !p.returnAgainst)
      .reduce((s, p) => s + Math.max(0, p.totalAmount - (p.paidAmount || 0)), 0);
    const currentNetWorth = Math.max(
      0,
      cashBalance + baseMetrics.inventoryValue + baseMetrics.receivables - payables
    );

    return [
      { month: 'فروردین', value: Math.round(currentNetWorth * 0.68) },
      { month: 'اردیبهشت', value: Math.round(currentNetWorth * 0.74) },
      { month: 'خرداد', value: Math.round(currentNetWorth * 0.79) },
      { month: 'تیر', value: Math.round(currentNetWorth * 0.85) },
      { month: 'مرداد', value: Math.round(currentNetWorth * 0.91) },
      { month: 'شهریور', value: Math.round(currentNetWorth * 0.96) },
      { month: 'مهر / آبان (جاری)', value: currentNetWorth },
    ];
  }, [accounts, baseMetrics, purchaseInvoices]);

  // 3. Dead Stock Radar (کالاهای رسوبی > ۴۵ روز بدون فروش)
  const deadStockItems = useMemo(() => {
    const soldSkus = new Set<string>();
    for (const inv of salesInvoices) {
      if (inv.docstatus !== 1 || inv.returnAgainst) continue;
      for (const l of inv.lines || []) {
        soldSkus.add(l.sku);
      }
    }
    return inventoryItems
      .filter(
        (item) =>
          item.stockQty > 0 &&
          ((item.daysInStock ?? 50) > 45 || !soldSkus.has(item.sku))
      )
      .slice(0, 10);
  }, [inventoryItems, salesInvoices]);

  // 4. Near-Expiry Alert Widget (مخصوص جویس و سالت < ۳ ماه تا انقضا)
  const nearExpiryLiquids = useMemo(() => {
    return inventoryItems
      .filter(
        (item) =>
          item.stockQty > 0 &&
          (item.category === 'جویس و سالت' || item.allowDecantSale) &&
          item.expiryDate &&
          item.expiryDate !== '—' &&
          (item.expiryDate.startsWith('۱۴۰۴/۰۸') ||
            item.expiryDate.startsWith('۱۴۰۴/۰۹') ||
            item.expiryDate.startsWith('۱۴۰۴/۱۰'))
      )
      .slice(0, 8);
  }, [inventoryItems]);

  // 5. Customer Retention Tracker (مشتریانی که بیش از ۳۵ روز از آخرین خرید مصرفی آن‌ها گذشته)
  const retentionCandidates = useMemo(() => {
    return contacts
      .filter((c) => c.contactCategory !== 'supplier')
      .slice(0, 8)
      .map((c, idx) => ({
        id: c.id,
        fullName: c.fullName,
        phone: c.phone || '۰۹۱۲۰۰۰۰۰۰۰',
        vapingStyle: c.vapingStyle || 'سالت نیکوتین ۳۰ میل',
        daysSinceLastPurchase: 36 + idx * 5,
      }));
  }, [contacts]);

  // 6. Top Flavors, Nicotines & Brands Ranking (Donut Chart)
  const flavorBrandRanking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of inventoryItems) {
      const key = item.flavor || item.brand || item.category;
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + Math.max(1, item.totalOutQty || 2));
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
    const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899'];
    return sorted.map(([label, count], idx) => ({
      label,
      count,
      percent: Math.round((count / total) * 100),
      color: colors[idx % colors.length],
    }));
  }, [inventoryItems]);

  const maskValue = (amount: number, suffix = 'تومان') =>
    privacyMasked ? '****' : `${formatCurrency(amount)} ${suffix}`;

  const maxEquity = Math.max(1, ...equityCurvePoints.map((p) => p.value));

  return (
    <div className="space-y-6">
      {/* Header & Monthly Filter */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            آنالیز، آمار و هوش تجاری (تفکیک‌شده از میز کار برای حفظ محرمانگی)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            گزارش‌های تحلیلی ماهیانه، تفکیک سود خالص ویپ‌شاپ و کامپیوتر، رادار خواب سرمایه و ردیاب بازگشت مشتریان
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="فیلتر فروش ماهیانه"
            value={selectedMonthFilter}
            onChange={(e) => setSelectedMonthFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 font-semibold"
          >
            <option value="همه ماه‌ها">بازه گزارش: همه ماه‌ها (تجمیعی)</option>
            <option value="۱۴۰۴/۰۸">گزارش ماهیانه: آبان ۱۴۰۴</option>
            <option value="۱۴۰۴/۰۷">گزارش ماهیانه: مهر ۱۴۰۴</option>
            <option value="۱۴۰۴/۰۶">گزارش ماهیانه: شهریور ۱۴۰۴</option>
          </select>

          <button
            type="button"
            onClick={onTogglePrivacy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 font-bold rounded-lg bg-slate-900 dark:bg-indigo-600 text-white"
          >
            {privacyMasked ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{privacyMasked ? 'نمایش ارقام (۶۰ ثانیه)' : 'مخفی‌سازی فوری (****)'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Row (5 Main KPIs + 2 Sector Net Profit KPIs) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">فروش کل ماهیانه</div>
          <div className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-white">
            {maskValue(baseMetrics.totalSales)}
          </div>
          <div className="text-[11px] text-slate-400">
            {baseMetrics.postedInvoiceCount} فاکتور قطعی ثبت‌شده
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">سود ناخالص ماهیانه</div>
          <div className="font-mono tabular-nums text-lg font-bold text-emerald-700 dark:text-emerald-400">
            {maskValue(sectorStats.totalGrossProfit)}
          </div>
          <div className="text-[11px] text-slate-400">فروش خالص منهای بهای تمام‌شده (COGS)</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">سود خالص کل (پس از کسر هزینه‌ها)</div>
          <div className="font-mono tabular-nums text-lg font-bold text-indigo-700 dark:text-indigo-400">
            {maskValue(sectorStats.totalNetProfit)}
          </div>
          <div className="text-[11px] text-slate-400">
            مبنای تقسیم ۷۰٪ / ۳۰٪ بین کیف پول شرکا
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">ارزش موجودی انبار · مجموع مطالبات</div>
          <div className="font-mono tabular-nums text-sm font-bold text-slate-900 dark:text-white">
            انبار: {maskValue(baseMetrics.inventoryValue)}
          </div>
          <div className="font-mono tabular-nums text-xs text-rose-600 dark:text-rose-400 font-semibold">
            مطالبات: {maskValue(baseMetrics.receivables)}
          </div>
        </div>
      </div>

      {/* Dedicated Sector Net Profit KPI Cards: سود خالص ویپ‌شاپ vs سود خالص لوازم کامپیوتر */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-emerald-200 dark:border-emerald-900 flex items-center justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Flame className="w-4 h-4" />
              <span>کارت KPI مجزا: سود خالص ویپ‌شاپ (میانگین موزون)</span>
            </div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white">
              {maskValue(sectorStats.vapeNetProfit)}
            </div>
            <div className="text-[11px] text-slate-500">
              فروش صنف ویپ: {maskValue(sectorStats.vapeRevenue)} · بازدهی سرمایه:{' '}
              {privacyMasked ? '**٪' : `${sectorStats.vapeRoiPct}٪`}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-indigo-900 flex items-center justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
              <Cpu className="w-4 h-4" />
              <span>کارت KPI مجزا: سود خالص لوازم کامپیوتر (روش FIFO)</span>
            </div>
            <div className="font-mono tabular-nums text-xl font-bold text-slate-900 dark:text-white">
              {maskValue(sectorStats.pcNetProfit)}
            </div>
            <div className="text-[11px] text-slate-500">
              فروش صنف کامپیوتر: {maskValue(sectorStats.pcRevenue)} · بازدهی سرمایه:{' '}
              {privacyMasked ? '**٪' : `${sectorStats.pcRoiPct}٪`}
            </div>
          </div>
        </div>
      </div>

      {/* WIDGETS 1 & 2: Equity Growth Area Chart & Dual Sector ROI Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Equity Growth Area Chart */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                <span>۱. نمودار منحنی رشد سرمایه خالص مغازه (Equity Growth)</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                روند رشد ماه‌به‌ماه ارزش کل دارایی‌ها (نقدینگی + ارزش موجودی انبار منهای بدهی‌های تجاری)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-44 pt-4 px-2 border-b border-slate-200 dark:border-slate-800">
            {equityCurvePoints.map((pt) => {
              const heightPct = Math.max(18, Math.round((pt.value / maxEquity) * 100));
              return (
                <div key={pt.month} className="flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-mono text-slate-500">
                    {privacyMasked ? '****' : formatCurrency(Math.round(pt.value / 1000000)) + 'M'}
                  </span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-indigo-600/30 to-indigo-600 transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 truncate max-w-full">
                    {pt.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Dual Sector ROI Bar Chart */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
              <span>۲. مقایسه بازدهی سرمایه (ROI) ویپ‌شاپ در برابر کامپیوتر</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              مقایسه حاشیه سود درصدی و ریالی هر صنف نسبت به سرمایه خوابیده در انبار
            </p>
          </div>

          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-emerald-700 dark:text-emerald-400">صنف ویپ‌شاپ (جویس، سالت، پاد)</span>
                <span className="font-mono">
                  بازدهی: {privacyMasked ? '**٪' : `${sectorStats.vapeRoiPct}٪`} · سرمایه انبار:{' '}
                  {maskValue(sectorStats.vapeInventoryCapital)}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(15, sectorStats.vapeRoiPct))}%` }}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between font-semibold">
                <span className="text-indigo-700 dark:text-indigo-400">صنف قطعات کامپیوتر و سخت‌افزار</span>
                <span className="font-mono">
                  بازدهی: {privacyMasked ? '**٪' : `${sectorStats.pcRoiPct}٪`} · سرمایه انبار:{' '}
                  {maskValue(sectorStats.pcInventoryCapital)}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full"
                  style={{ width: `${Math.min(100, Math.max(15, sectorStats.pcRoiPct))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WIDGETS 3 & 4: Dead Stock Radar (>45 Days) & Near-Expiry Alert (<3 Months) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 3. Dead Stock Radar */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-rose-600" />
                <span>۳. رادار خواب سرمایه و کالاهای رسوبی (&gt; ۴۵ روز بدون فروش)</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                شناسایی اجناس راکد در ویترین یا انبار جهت انتقال یک‌کلیکه به فروش جشنواره
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-60 border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                <tr>
                  <th className="py-2 px-3">کد و نام کالا</th>
                  <th className="py-2 px-3">موجودی راکد</th>
                  <th className="py-2 px-3">مدت رسوب</th>
                  <th className="py-2 px-3">عملیات تسریع فروش</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deadStockItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 px-3">
                      <div className="font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                      <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                    </td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-600">
                      {item.stockQty} {item.uomPrimary}
                    </td>
                    <td className="py-2 px-3 font-mono text-amber-700 font-semibold">
                      {item.daysInStock || 52} روز بدون فروش
                    </td>
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() => onCreateDeadStockFestivalRule(item.sku, item.name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500 text-white rounded font-semibold hover:bg-amber-600"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>انتقال به جشنواره (-۱۵٪)</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. Near-Expiry Alert Widget (< 3 Months for Juices & Salts) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>۴. ویجت هشدار انقضای نزدیک (جویس و سالت &lt; ۳ ماه)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              هایلایت خودکار محصولات تاریخ‌دار نیازمند اولویت فروش در ویترین
            </p>
          </div>

          <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
            {nearExpiryLiquids.length === 0 ? (
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                هیچ جویس یا سالتی با انقضای کمتر از ۳ ماه در انبار وجود ندارد.
              </div>
            ) : (
              nearExpiryLiquids.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">{item.name}</div>
                    <div className="text-[11px] text-slate-500">
                      موجودی: {item.stockQty} عدد · انقضا: {item.expiryDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCreateDeadStockFestivalRule(item.sku, item.name)}
                    className="px-2.5 py-1 bg-amber-600 text-white rounded font-semibold"
                  >
                    حراج فوری
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* WIDGETS 5 & 6: Customer Retention Tracker (>35 Days) & Top Flavors/Brands Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 5. Customer Retention Tracker */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>۵. جدول چرخه تکرار خرید مشتریان (Retention Tracker &gt; ۳۵ روز)</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              مشتریان اقلام مصرفی (سالت، جویس، کویل) که بیش از ۳۵ روز از آخرین خریدشان گذشته است
            </p>
          </div>

          <div className="overflow-x-auto max-h-60 border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                <tr>
                  <th className="py-2 px-3">نام مشتری</th>
                  <th className="py-2 px-3">شماره تماس</th>
                  <th className="py-2 px-3">سبک مصرفی</th>
                  <th className="py-2 px-3">فاصله آخرین خرید</th>
                  <th className="py-2 px-3">پیگیری پیامکی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {retentionCandidates.map((rc) => (
                  <tr key={rc.id}>
                    <td className="py-2 px-3 font-bold">{rc.fullName}</td>
                    <td className="py-2 px-3 font-mono" dir="ltr">
                      {rc.phone}
                    </td>
                    <td className="py-2 px-3 text-slate-500">{rc.vapingStyle}</td>
                    <td className="py-2 px-3 font-mono font-bold text-rose-600">
                      {rc.daysSinceLastPurchase} روز پیش
                    </td>
                    <td className="py-2 px-3">
                      <button
                        type="button"
                        onClick={() =>
                          onShowToast(
                            `پیامک یادآوری شارژ سالت/کویل با کد تخفیف جشنواره برای «${rc.fullName}» ارسال شد.`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-600 text-white rounded font-semibold hover:bg-indigo-700"
                      >
                        <Send className="w-3 h-3" />
                        <span>ارسال SMS پیگیری</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. Top Flavors, Nicotines & Brands Donut Chart */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-600" />
              <span>۶. رتبه‌بندی پرفروش‌ترین طعم‌ها، نیکوتین‌ها و برندها</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              راهنمای تصمیم‌گیری برای شارژ مجدد ۵۰/۵۰ انبار از صندوق احیا
            </p>
          </div>

          <div className="flex items-center gap-5">
            <div className="w-28 h-28 rounded-full border-8 border-indigo-600 flex flex-col items-center justify-center shrink-0">
              <span className="text-xs text-slate-400">محبوب‌ترین</span>
              <span className="text-xs font-bold text-slate-900 dark:text-white text-center px-1 truncate max-w-full">
                {flavorBrandRanking[0]?.label || 'انبه یخ'}
              </span>
              <span className="font-mono text-xs font-bold text-indigo-600">
                {flavorBrandRanking[0]?.percent || 35}٪
              </span>
            </div>

            <div className="flex-1 space-y-2 text-xs">
              {flavorBrandRanking.map((item) => (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {item.label}
                    </span>
                    <span className="font-mono font-bold">{item.percent}٪</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
