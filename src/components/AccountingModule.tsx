import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Lock,
  Scale,
  Eye,
  EyeOff,
  FileSpreadsheet,
} from 'lucide-react';
import {
  AccountNode,
  GLEntryRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  CostCenterRecord,
  FixedAssetRecord,
  ShareholderRecord,
  ShareholderRuleSnapshot,
  ShareholderDrawingRecord,
  RecurringExpenseTemplate,
  MonthlyExpenseLedgerRecord,
  InventoryItemRecord,
  CustomerContactRecord,
  MasterOptionsRegistry,
  WarehouseRecord,
} from '../data/erpSeedData';
import {
  formatCurrency,
  calculateFinancialStatements,
  computeTrialBalance6Col,
  formatVoucherType,
  calculateThreeBucketShareholderState,
  SystemRole,
} from '../utils/erpEngine';
import { PolarisButton, PolarisButtonGroup } from './CreatableCombobox';

export type AccountingSubTab =
  | 'coa'
  | 'gl_trial'
  | 'statements'
  | 'journal'
  | 'budget'
  | 'assets';

interface AccountingModuleProps {
  productionMode: boolean;
  activeRole: SystemRole;
  defaultBranch: string;
  activeFiscalYear: string;
  initialSubTab?: AccountingSubTab;
  accounts: AccountNode[];
  onAddAccount?: (acc: AccountNode) => void;
  glEntries: GLEntryRecord[];
  journalEntries: JournalEntryRecord[];
  onSaveJournalEntry?: (je: JournalEntryRecord) => void;
  onSubmitJournalEntry?: (id: string) => void;
  onCancelJournalEntry?: (id: string) => void;
  salesInvoices: SalesInvoiceRecord[];
  onCancelSalesInvoice?: (id: string) => void;
  purchaseInvoices: PurchaseInvoiceRecord[];
  onCreatePurchaseInvoice?: (pinv: PurchaseInvoiceRecord) => boolean;
  onCancelPurchaseInvoice?: (id: string) => void;
  onMarkPurchaseArrived?: (id: string) => void;
  costCenters: CostCenterRecord[];
  recurringTemplates: RecurringExpenseTemplate[];
  monthlyExpenseLedger: MonthlyExpenseLedgerRecord[];
  onAddRecurringTemplate?: (tmpl: Omit<RecurringExpenseTemplate, 'id'>) => void;
  onUpdateRecurringTemplateAmount?: (id: string, newAmount: number) => void;
  onRecordMonthlyFixedExpense?: (record: {
    templateId: string;
    monthYear: string;
    amount: number;
    paidFromAccountCode: string;
    note?: string;
  }) => void;
  fixedAssets: FixedAssetRecord[];
  onAddFixedAsset?: (asset: Omit<FixedAssetRecord, 'id'>) => void;
  onScrapOrSellAsset?: (id: string, newStatus: FixedAssetRecord['status']) => void;
  shareholders: ShareholderRecord[];
  shareholderSnapshots: ShareholderRuleSnapshot[];
  shareholderDrawings: ShareholderDrawingRecord[];
  initialInventoryCapitalBaseline: number;
  onRecordShareholderDrawing?: (drawing: {
    partnerId: string;
    amount: number;
    paidFromAccountCode: string;
    note: string;
  }) => void;
  onRecordShareholderCapitalInjection?: (injection: {
    partnerId: string;
    amount: number;
    toAccountCode: string;
    note: string;
  }) => void;
  onUpdateShareholderPercentagesWithSnapshot?: (params: {
    partner1CapitalPct: number;
    partner1ProfitPct: number;
    partner2CapitalPct: number;
    partner2ProfitPct: number;
    note: string;
  }) => void;
  inventoryItems: InventoryItemRecord[];
  customerContacts: CustomerContactRecord[];
  onQuickAddSupplier?: (supplierName: string, phone?: string) => void;
  masterOptions: MasterOptionsRegistry;
  onAddMasterOption?: (category: keyof MasterOptionsRegistry, value: string) => void;
  warehouses: WarehouseRecord[];
  onNavigateToPos: () => void;
  onNavigateToInventoryBreakdown: (billNo?: string) => void;
  privacyMask: boolean;
  onShowToast: (msg: string) => void;
}

export const AccountingModule: React.FC<AccountingModuleProps> = ({
  defaultBranch,
  activeFiscalYear,
  initialSubTab = 'coa',
  accounts,
  glEntries,
  journalEntries,
  salesInvoices,
  purchaseInvoices,
  recurringTemplates,
  monthlyExpenseLedger,
  fixedAssets,
  shareholders,
  shareholderSnapshots,
  shareholderDrawings,
  initialInventoryCapitalBaseline,
  privacyMask,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>(initialSubTab);
  const [localReveal, setLocalReveal] = useState(false);

  React.useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const isMasked = privacyMask && !localReveal;
  const maskCurrency = (amount: number) =>
    isMasked ? '****' : `${formatCurrency(amount)} ریال`;

  // 1. Chart of Accounts Read-Only Filter State
  const [selectedCategory, setSelectedCategory] = useState<string>('همه');
  const [collapsedCodes, setCollapsedCodes] = useState<string[]>([]);

  // 2. Trial Balance & GL Read-Only Filter State
  const [trialBalanceLevel, setTrialBalanceLevel] = useState<'گروه' | 'کل' | 'معین'>('معین');
  const [glFilterAccount, setGlFilterAccount] = useState<string>('همه حساب‌ها');
  const [glFilterMonth, setGlFilterMonth] = useState<string>('همه ماه‌ها');

  // Financial Statements & Trial Balance Calculations
  const financialStatements = useMemo(
    () => calculateFinancialStatements(accounts),
    [accounts]
  );

  const trialBalance = useMemo(
    () =>
      computeTrialBalance6Col(accounts, trialBalanceLevel, glEntries, 'همه شعب', activeFiscalYear),
    [accounts, trialBalanceLevel, glEntries, activeFiscalYear]
  );

  // Three-Bucket Shareholder State (50/50 Recovery + 70/30 Net Profit)
  const threeBucketState = useMemo(() => {
    const activeSales = salesInvoices.filter(
      (i) => i.docstatus === 1 && !i.returnAgainst && i.status !== 'ابطال‌شده'
    );
    const totalSalesRevenue = activeSales.reduce((s, i) => s + i.totalAmount, 0);
    const totalCogs = activeSales.reduce(
      (s, i) => s + (i.cogsAmount ?? Math.round(i.totalAmount * 0.7)),
      0
    );
    const totalPurchases = purchaseInvoices
      .filter((p) => p.docstatus === 1 && !p.returnAgainst)
      .reduce((s, p) => s + p.totalAmount, 0);
    const totalDailyExpenses = journalEntries
      .filter((j) => j.docstatus === 1)
      .reduce((s, j) => s + j.totalDebit, 0);
    const totalMonthlyFixed = monthlyExpenseLedger.reduce((s, m) => s + m.amount, 0);

    const p1 = shareholders[0];
    const p2 = shareholders[1];

    return calculateThreeBucketShareholderState({
      initialInventoryCapital: initialInventoryCapitalBaseline,
      totalRevenue: totalSalesRevenue,
      totalCogs,
      totalOperatingExpenses: totalDailyExpenses + totalMonthlyFixed,
      totalNewPurchasesAmount: totalPurchases,
      partners: [
        {
          id: p1?.id || 'sh-1',
          name: p1?.name || 'شریک اول (۷۰٪)',
          capitalSharePercent: p1?.ownershipPercent ?? 50,
          profitSharePercent: p1?.profitSharePercent ?? 70,
          personalCapitalInjected: p1?.personalCapitalInjected ?? 0,
          withdrawals: p1?.dividendPaid ?? 0,
        },
        {
          id: p2?.id || 'sh-2',
          name: p2?.name || 'شریک دوم (۳۰٪)',
          capitalSharePercent: p2?.ownershipPercent ?? 50,
          profitSharePercent: p2?.profitSharePercent ?? 30,
          personalCapitalInjected: p2?.personalCapitalInjected ?? 0,
          withdrawals: p2?.dividendPaid ?? 0,
        },
      ],
    });
  }, [
    salesInvoices,
    purchaseInvoices,
    journalEntries,
    monthlyExpenseLedger,
    shareholders,
    initialInventoryCapitalBaseline,
  ]);

  const hasChildren = (code: string) => accounts.some((a) => a.parentCode === code);

  const toggleCollapseCode = (code: string) => {
    setCollapsedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const isAccountVisibleInTree = (acc: AccountNode): boolean => {
    if (selectedCategory !== 'همه' && acc.category !== selectedCategory) return false;
    let currParent = acc.parentCode;
    while (currParent) {
      if (collapsedCodes.includes(currParent)) return false;
      const parentObj = accounts.find((a) => a.code === currParent);
      currParent = parentObj?.parentCode;
    }
    return true;
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Read-Only Segmented Sub-Navigation (Zero Invoice Forms) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-4 h-4 text-indigo-600 shrink-0" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              گزارش‌های مالی و دفاتر حسابداری (Read-Only) — {defaultBranch} ({activeFiscalYear})
            </h2>
            <p className="text-[11px] text-slate-500">
              محیط گزارش‌گیری استاندارد بدون فرم صدور فاکتور؛ تمامی فاکتورها منحصراً در صندوق (/pos) صادر می‌شوند.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PolarisButtonGroup segmented>
            {[
              { id: 'coa' as const, label: 'درخت حساب‌ها' },
              { id: 'gl_trial' as const, label: 'تراز آزمایشی و دفتر کل' },
              { id: 'statements' as const, label: 'ترازنامه یکپارچه' },
              { id: 'journal' as const, label: 'دفتر اسناد روزانه' },
              { id: 'budget' as const, label: 'دفتر هزینه‌های ثابت' },
              { id: 'assets' as const, label: 'گزارش ۳ قلک سهامداری و اموال' },
            ].map((tab) => (
              <PolarisButton
                key={tab.id}
                size="slim"
                primary={activeSubTab === tab.id}
                onClick={() => setActiveSubTab(tab.id)}
              >
                {tab.label}
              </PolarisButton>
            ))}
          </PolarisButtonGroup>

          <PolarisButton
            size="slim"
            icon={localReveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            onClick={() => setLocalReveal((prev) => !prev)}
          >
            {localReveal ? 'ماسک ارقام' : 'نمایش ارقام'}
          </PolarisButton>
        </div>
      </div>

      {/* =====================================================================
          VIEW 1: CHART OF ACCOUNTS (Read-Only Polaris IndexTable)
         ===================================================================== */}
      {activeSubTab === 'coa' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
              درخت حساب‌های استاندارد (۳ حساب تسویه + ۴ انبار کالا + سرفصل‌های مالی)
            </span>
            <PolarisButtonGroup segmented>
              {['همه', 'دارایی', 'بدهی', 'سرمایه', 'درآمد', 'هزینه'].map((cat) => (
                <PolarisButton
                  key={cat}
                  size="slim"
                  primary={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </PolarisButton>
              ))}
            </PolarisButtonGroup>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[520px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3">کد و نام سرفصل حساب</th>
                  <th className="py-2 px-3">طبقه</th>
                  <th className="py-2 px-3">سطح</th>
                  <th className="py-2 px-3 text-left">مانده لحظه‌ای (ریال)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {accounts.filter(isAccountVisibleInTree).map((acc) => {
                  const indent =
                    acc.level === 'گروه'
                      ? 'pr-2 font-bold text-slate-900 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-800/40'
                      : acc.level === 'کل'
                        ? 'pr-6 font-semibold text-slate-800 dark:text-slate-200'
                        : acc.level === 'معین'
                          ? 'pr-10 text-slate-700 dark:text-slate-300'
                          : 'pr-14 text-slate-600 dark:text-slate-400';
                  const isParent = hasChildren(acc.code);
                  const isCollapsed = collapsedCodes.includes(acc.code);
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className={`py-2 px-3 ${indent}`}>
                        <div className="flex items-center gap-2">
                          {isParent ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapseCode(acc.code)}
                              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                            >
                              {isCollapsed ? (
                                <ChevronLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 inline-block text-center text-slate-300">·</span>
                          )}
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {acc.code}
                          </span>
                          <span>{acc.name}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3">{acc.category}</td>
                      <td className="py-2 px-3">{acc.level}</td>
                      <td className="py-2 px-3 text-left font-mono font-bold tabular-nums">
                        {maskCurrency(acc.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 2: 6-COLUMN TRIAL BALANCE & GENERAL LEDGER (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'gl_trial' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                تراز آزمایشی ۶ ستونی ماهیانه (Read-Only)
              </span>
              <PolarisButtonGroup segmented>
                {(['گروه', 'کل', 'معین'] as const).map((lvl) => (
                  <PolarisButton
                    key={lvl}
                    size="slim"
                    primary={trialBalanceLevel === lvl}
                    onClick={() => setTrialBalanceLevel(lvl)}
                  >
                    سطح {lvl}
                  </PolarisButton>
                ))}
              </PolarisButtonGroup>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">کد</th>
                    <th className="py-2 px-3">نام حساب</th>
                    <th className="py-2 px-3">گردش بدهکار ماهیانه</th>
                    <th className="py-2 px-3">گردش بستانکار ماهیانه</th>
                    <th className="py-2 px-3">مانده نهایی بدهکار</th>
                    <th className="py-2 px-3">مانده نهایی بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {trialBalance.rows.map((r) => (
                    <tr key={r.code} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-mono tabular-nums">{r.code}</td>
                      <td className="py-2 px-3 font-semibold">{r.name}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">
                        {maskCurrency(r.periodDebit)}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums">
                        {maskCurrency(r.periodCredit)}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-700 tabular-nums">
                        {maskCurrency(r.closingDebit)}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-indigo-700 tabular-nums">
                        {maskCurrency(r.closingCredit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* General Ledger IndexTable */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                دفتر کل و اقلام تراکنش ({glEntries.length} ردیف سند)
              </span>
              <div className="flex items-center gap-2">
                <select
                  value={glFilterAccount}
                  onChange={(e) => setGlFilterAccount(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-800"
                >
                  <option value="همه حساب‌ها">همه حساب‌ها</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
                <select
                  value={glFilterMonth}
                  onChange={(e) => setGlFilterMonth(e.target.value)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-800"
                >
                  <option value="همه ماه‌ها">همه ماه‌ها</option>
                  <option value="۰۷">مهرماه</option>
                  <option value="۰۸">آبان‌ماه</option>
                  <option value="۰۹">آذرماه</option>
                </select>
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-96 overflow-y-auto overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">تاریخ</th>
                    <th className="py-2 px-3">شماره سند</th>
                    <th className="py-2 px-3">نوع سند</th>
                    <th className="py-2 px-3">سرفصل حساب</th>
                    <th className="py-2 px-3">بدهکار</th>
                    <th className="py-2 px-3">بستانکار</th>
                    <th className="py-2 px-3">شرح ردیف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {glEntries
                    .filter((g) =>
                      glFilterAccount === 'همه حساب‌ها' ? true : g.accountCode === glFilterAccount
                    )
                    .filter((g) =>
                      glFilterMonth === 'همه ماه‌ها'
                        ? true
                        : g.postingDate.includes(`/${glFilterMonth}/`)
                    )
                    .map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-mono tabular-nums">{g.postingDate}</td>
                        <td className="py-2 px-3 font-mono font-bold">{g.voucherNo}</td>
                        <td className="py-2 px-3">{formatVoucherType(g.voucherType)}</td>
                        <td className="py-2 px-3 font-semibold">
                          {g.accountCode} — {g.accountName}
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-700 font-bold tabular-nums">
                          {g.debit > 0 ? maskCurrency(g.debit) : '—'}
                        </td>
                        <td className="py-2 px-3 font-mono text-rose-700 font-bold tabular-nums">
                          {g.credit > 0 ? maskCurrency(g.credit) : '—'}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{g.remarks || '—'}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 3: UNIFIED BALANCE SHEET & P&L REPORT (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'statements' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                گزارش یکپارچه ترازنامه، معادله اساسی حسابداری و سود و زیان (Read-Only)
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {financialStatements.isBalanceSheetBalanced
                  ? 'تراز کامل: دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام'
                  : 'بررسی تراز معادله حسابداری'}
              </span>
            </span>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2 px-3">سرفصل ترازنامه و صورت سود و زیان</th>
                  <th className="py-2 px-3">نقش در معادله حسابداری</th>
                  <th className="py-2 px-3 text-left">مبلغ (ریال)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                <tr>
                  <td className="py-2.5 px-3 font-bold">کل دارایی‌ها (نقدینگی + ۴ انبار + مطالبات)</td>
                  <td className="py-2.5 px-3 text-slate-500">سمت راست معادله (Assets)</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 tabular-nums">
                    {maskCurrency(financialStatements.totalAssets)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">کل بدهی‌های تجاری</td>
                  <td className="py-2.5 px-3 text-slate-500">سمت چپ معادله (Liabilities)</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-amber-700 tabular-nums">
                    {maskCurrency(financialStatements.totalLiabilities)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-bold">حقوق صاحبان سهام + سود خالص انباشته</td>
                  <td className="py-2.5 px-3 text-slate-500">سمت چپ معادله (Equity + Net Profit)</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-indigo-700 tabular-nums">
                    {maskCurrency(financialStatements.totalEquity + financialStatements.netProfit)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold">فروش کل دوره (Total Revenue)</td>
                  <td className="py-2.5 px-3 text-slate-500">صورت سود و زیان</td>
                  <td className="py-2.5 px-3 text-left font-mono tabular-nums">
                    {maskCurrency(financialStatements.totalRevenue)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold">بهای تمام‌شده کالای فروش‌رفته (COGS)</td>
                  <td className="py-2.5 px-3 text-slate-500">کسر به قلک احیای انبار ۵۰/۵۰</td>
                  <td className="py-2.5 px-3 text-left font-mono text-rose-700 tabular-nums">
                    {maskCurrency(accounts.find((a) => a.code === '5101')?.balance || 0)}
                  </td>
                </tr>
                <tr className="bg-emerald-50/50 dark:bg-emerald-950/20">
                  <td className="py-2.5 px-3 font-bold text-emerald-900 dark:text-emerald-300">
                    سود خالص قابل تقسیم دوره
                  </td>
                  <td className="py-2.5 px-3 text-emerald-700">توزیع ۷۰٪ / ۳۰٪ در کیف پول شرکا</td>
                  <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
                    {maskCurrency(financialStatements.netProfit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 4: DAILY JOURNAL ENTRIES LEDGER (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'journal' && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              دفتر اسناد روزنامه و هزینه‌های جاری ثبت‌شده ({journalEntries.length} سند — Read-Only)
            </h3>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[460px] overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                <tr>
                  <th className="py-2 px-3">شماره سند</th>
                  <th className="py-2 px-3">تاریخ</th>
                  <th className="py-2 px-3">شرح سند</th>
                  <th className="py-2 px-3">جمع بدهکار / بستانکار</th>
                  <th className="py-2 px-3">وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {journalEntries.map((je) => (
                  <tr key={je.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2 px-3 font-mono font-bold">{je.voucherNo}</td>
                    <td className="py-2 px-3 font-mono tabular-nums">{je.postingDate}</td>
                    <td className="py-2 px-3 font-semibold">{je.title}</td>
                    <td className="py-2 px-3 font-mono font-bold tabular-nums">
                      {maskCurrency(je.totalDebit)}
                    </td>
                    <td className="py-2 px-3">
                      {je.docstatus === 2 ? 'Cancelled (باطل‌شده)' : 'ثبت قطعی در دفتر کل'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 5: TWO-TABLE MONTHLY FIXED EXPENSES REPORT (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'budget' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              جدول ۱: فهرست قالب‌های هزینه ثابت ماهانه (Read-Only)
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-2.5">عنوان هزینه ثابت</th>
                    <th className="py-2 px-2.5">موعد</th>
                    <th className="py-2 px-2.5 text-left">مبلغ پیش‌فرض</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recurringTemplates.map((tmpl) => (
                    <tr key={tmpl.id}>
                      <td className="py-2 px-2.5 font-semibold">{tmpl.name}</td>
                      <td className="py-2 px-2.5 font-mono tabular-nums">
                        روز {tmpl.dueDayOfMonth}
                      </td>
                      <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                        {maskCurrency(tmpl.defaultMonthlyAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
              جدول ۲: دفتر هزینه‌های قطعی قفل‌شده در تاریخچه (Monthly Expense Ledger)
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-2.5">ماه/سال</th>
                    <th className="py-2 px-2.5">عنوان هزینه</th>
                    <th className="py-2 px-2.5">شماره سند</th>
                    <th className="py-2 px-2.5">وضعیت</th>
                    <th className="py-2 px-2.5 text-left">مبلغ قطعی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyExpenseLedger.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        رکوردی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    monthlyExpenseLedger.map((rec) => (
                      <tr key={rec.id}>
                        <td className="py-2 px-2.5 font-mono font-bold tabular-nums">
                          {rec.monthYear}
                        </td>
                        <td className="py-2 px-2.5 font-semibold">{rec.expenseName}</td>
                        <td className="py-2 px-2.5 font-mono">{rec.voucherNo}</td>
                        <td className="py-2 px-2.5 text-emerald-700 font-semibold">
                          <span className="inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>قفل‌شده</span>
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                          {maskCurrency(rec.amount)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 6: THREE-BUCKET SHAREHOLDERS & FIXED ASSETS REPORT (Read-Only IndexTable)
         ===================================================================== */}
      {activeSubTab === 'assets' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              گزارش موتور ۳ قلک سهامداران (قلک احیای انبار ۵۰/۵۰ و کیف پول سود ۷۰/۳۰ — Read-Only)
            </h3>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden overflow-x-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">ردیف قلک / کیف پول سهامدار</th>
                    <th className="py-2 px-3">نسبت مالکیت / سود</th>
                    <th className="py-2 px-3">سهم سود خالص دوره</th>
                    <th className="py-2 px-3">کسر توسعه انبار</th>
                    <th className="py-2 px-3 text-left">مانده نهایی قابل برداشت (ریال)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr className="bg-slate-50/80 dark:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-bold">
                      قلک ۱: صندوق احیای انبار (Capital Recovery Pool — کسر مستقیم COGS)
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">۵۰٪ / ۵۰٪</td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      حق انبار (COGS): {maskCurrency(threeBucketState.inventoryRecoveryShare)}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      توسعه: {maskCurrency(threeBucketState.totalNewCapitalNeeded)}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono font-bold text-emerald-700 tabular-nums">
                      {maskCurrency(
                        threeBucketState.bucket1InitialInventoryCapital +
                          threeBucketState.bucket1CurrentBalance
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold">
                      قلک ۲: کیف پول {shareholders[0]?.name || 'شریک اول (۷۰٪)'}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      سرمایه {shareholders[0]?.ownershipPercent ?? 50}% · سود{' '}
                      {shareholders[0]?.profitSharePercent ?? 70}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700 tabular-nums">
                      +{maskCurrency(threeBucketState.partners[0]?.profitAllocated ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-rose-600 tabular-nums">
                      -{maskCurrency(threeBucketState.partners[0]?.capitalExpansionCharge ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 text-left font-mono font-bold text-indigo-700 tabular-nums">
                      {maskCurrency(threeBucketState.partnerWallets.partner70)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-bold">
                      قلک ۳: کیف پول {shareholders[1]?.name || 'شریک دوم (۳۰٪)'}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums">
                      سرمایه {shareholders[1]?.ownershipPercent ?? 50}% · سود{' '}
                      {shareholders[1]?.profitSharePercent ?? 30}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700 tabular-nums">
                      +{maskCurrency(threeBucketState.partners[1]?.profitAllocated ?? 0)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-rose-600 tabular-nums">
                      -{maskCurrency(threeBucketState.partners[1]?.capitalExpansionCharge ?? 0)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-left font-mono font-bold tabular-nums ${
                        threeBucketState.partners[1]?.isNegativeDeficit ? 'text-rose-600' : 'text-indigo-700'
                      }`}
                    >
                      {maskCurrency(threeBucketState.partnerWallets.partner30)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Fixed Assets & Drawings Read-Only IndexTables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                فهرست اموال و دارایی‌های ثابت مغازه ({fixedAssets.length} مورد)
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2 px-2.5">کد</th>
                      <th className="py-2 px-2.5">نام دارایی</th>
                      <th className="py-2 px-2.5">طبقه</th>
                      <th className="py-2 px-2.5 text-left">ارزش خرید</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {fixedAssets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-slate-400">
                          موردی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      fixedAssets.map((ast) => (
                        <tr key={ast.id}>
                          <td className="py-2 px-2.5 font-mono">{ast.assetTag}</td>
                          <td className="py-2 px-2.5 font-semibold">{ast.name}</td>
                          <td className="py-2 px-2.5">{ast.category}</td>
                          <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                            {maskCurrency(ast.purchaseValue)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
              <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                تاریخچه برداشت‌های سود و Snapshot توافقات ({shareholderDrawings.length + shareholderSnapshots.length})
              </h4>
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-right border-collapse">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2 px-2.5">تاریخ</th>
                      <th className="py-2 px-2.5">شریک</th>
                      <th className="py-2 px-2.5">شرح</th>
                      <th className="py-2 px-2.5 text-left">مبلغ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {shareholderDrawings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-5 text-center text-slate-400">
                          برداشتی ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      shareholderDrawings.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2 px-2.5 font-mono tabular-nums">{d.date}</td>
                          <td className="py-2 px-2.5 font-semibold">{d.partnerName}</td>
                          <td className="py-2 px-2.5 text-slate-500">{d.note}</td>
                          <td className="py-2 px-2.5 font-mono font-bold text-left tabular-nums">
                            {maskCurrency(d.amount)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
