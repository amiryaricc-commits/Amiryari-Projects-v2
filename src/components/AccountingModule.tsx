import React, { useState, useMemo } from 'react';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  FileText,
  XCircle,
  RotateCcw,
  Wallet,
  Building2,
  ShieldAlert,
  Lock,
  Sparkles,
  Scale,
  Truck,
  ArrowUpLeft,
  Eye,
  EyeOff,
  Camera,
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
  formatPersianDate,
  getPersianYear,
  validateJournalEntry,
  calculateFinancialStatements,
  computeTrialBalance6Col,
  formatVoucherType,
  calculateThreeBucketShareholderState,
  SystemRole,
  JournalLine,
} from '../utils/erpEngine';
import { CreatableCombobox } from './CreatableCombobox';

export type AccountingSubTab =
  | 'coa'
  | 'gl_trial'
  | 'statements'
  | 'journal'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'budget'
  | 'assets';

interface AccountingModuleProps {
  productionMode: boolean;
  activeRole: SystemRole;
  defaultBranch: string;
  activeFiscalYear: string;
  initialSubTab?: AccountingSubTab;
  accounts: AccountNode[];
  onAddAccount: (acc: AccountNode) => void;
  glEntries: GLEntryRecord[];
  journalEntries: JournalEntryRecord[];
  onSaveJournalEntry: (je: JournalEntryRecord) => void;
  onSubmitJournalEntry: (id: string) => void;
  onCancelJournalEntry: (id: string) => void;
  salesInvoices: SalesInvoiceRecord[];
  onCancelSalesInvoice: (id: string) => void;
  purchaseInvoices: PurchaseInvoiceRecord[];
  onCreatePurchaseInvoice: (pinv: PurchaseInvoiceRecord) => boolean;
  onCancelPurchaseInvoice: (id: string) => void;
  onMarkPurchaseArrived?: (id: string) => void;
  costCenters: CostCenterRecord[];
  recurringTemplates: RecurringExpenseTemplate[];
  monthlyExpenseLedger: MonthlyExpenseLedgerRecord[];
  onAddRecurringTemplate: (tmpl: Omit<RecurringExpenseTemplate, 'id'>) => void;
  onUpdateRecurringTemplateAmount: (id: string, newAmount: number) => void;
  onRecordMonthlyFixedExpense: (record: {
    templateId: string;
    monthYear: string;
    amount: number;
    paidFromAccountCode: string;
    note?: string;
  }) => void;
  fixedAssets: FixedAssetRecord[];
  onAddFixedAsset: (asset: Omit<FixedAssetRecord, 'id'>) => void;
  onScrapOrSellAsset: (id: string, newStatus: FixedAssetRecord['status']) => void;
  shareholders: ShareholderRecord[];
  shareholderSnapshots: ShareholderRuleSnapshot[];
  shareholderDrawings: ShareholderDrawingRecord[];
  initialInventoryCapitalBaseline: number;
  onRecordShareholderDrawing: (drawing: {
    partnerId: string;
    amount: number;
    paidFromAccountCode: string;
    note: string;
  }) => void;
  onRecordShareholderCapitalInjection: (injection: {
    partnerId: string;
    amount: number;
    toAccountCode: string;
    note: string;
  }) => void;
  onUpdateShareholderPercentagesWithSnapshot: (params: {
    partner1CapitalPct: number;
    partner1ProfitPct: number;
    partner2CapitalPct: number;
    partner2ProfitPct: number;
    note: string;
  }) => void;
  inventoryItems: InventoryItemRecord[];
  customerContacts: CustomerContactRecord[];
  onQuickAddSupplier: (supplierName: string, phone?: string) => void;
  masterOptions: MasterOptionsRegistry;
  onAddMasterOption: (category: keyof MasterOptionsRegistry, value: string) => void;
  warehouses: WarehouseRecord[];
  onNavigateToPos: () => void;
  onNavigateToInventoryBreakdown: (billNo?: string) => void;
  privacyMask: boolean;
  onShowToast: (msg: string) => void;
}

const LIQUIDITY_ACCOUNTS = [
  { code: '110101', label: '۱۱۰۱۰۱ — حساب دستگاه کارتخوان (POS)' },
  { code: '110102', label: '۱۱۰۱۰۲ — حساب کارت بانکی (کارت به کارت)' },
  { code: '110103', label: '۱۱۰۱۰۳ — حساب نقدی (صندوق نقد مغازه)' },
];

export const AccountingModule: React.FC<AccountingModuleProps> = ({
  defaultBranch,
  initialSubTab = 'coa',
  accounts,
  onAddAccount,
  glEntries,
  journalEntries,
  onSaveJournalEntry,
  onCancelJournalEntry,
  salesInvoices,
  onCancelSalesInvoice,
  purchaseInvoices,
  onCreatePurchaseInvoice,
  onCancelPurchaseInvoice,
  onMarkPurchaseArrived,
  costCenters,
  recurringTemplates,
  monthlyExpenseLedger,
  onAddRecurringTemplate,
  onUpdateRecurringTemplateAmount,
  onRecordMonthlyFixedExpense,
  fixedAssets,
  onAddFixedAsset,
  onScrapOrSellAsset,
  shareholders,
  shareholderSnapshots,
  shareholderDrawings,
  initialInventoryCapitalBaseline,
  onRecordShareholderDrawing,
  onRecordShareholderCapitalInjection,
  onUpdateShareholderPercentagesWithSnapshot,
  inventoryItems,
  customerContacts,
  onQuickAddSupplier,
  masterOptions,
  onAddMasterOption,
  warehouses,
  onNavigateToPos,
  onNavigateToInventoryBreakdown,
  privacyMask,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>(initialSubTab);
  const [localReveal, setLocalReveal] = useState(false);

  React.useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  const isMasked = privacyMask && !localReveal;
  const maskCurrency = (amount: number) =>
    isMasked ? '****' : `${formatCurrency(amount)} ریال`;

  // 1. Chart of Accounts State
  const [selectedCategory, setSelectedCategory] = useState<string>('همه');
  const [collapsedCodes, setCollapsedCodes] = useState<string[]>([]);
  const [showNewAccForm, setShowNewAccForm] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccCat, setNewAccCat] = useState<AccountNode['category']>('دارایی');
  const [newAccLevel, setNewAccLevel] = useState<AccountNode['level']>('معین');
  const [newAccParentCode, setNewAccParentCode] = useState<string>('1100');

  // 2. Trial Balance & GL Filter State
  const [trialBalanceLevel, setTrialBalanceLevel] = useState<'گروه' | 'کل' | 'معین'>('معین');
  const [glFilterAccount, setGlFilterAccount] = useState<string>('همه حساب‌ها');
  const [glFilterMonth, setGlFilterMonth] = useState<string>('همه ماه‌ها');

  // 3. Daily Shop Expense (Journal Entry) State
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseAccountCode, setExpenseAccountCode] = useState('5204');
  const [paidFromAccountCode, setPaidFromAccountCode] = useState('110102');
  const [expenseNote, setExpenseNote] = useState('');
  const [showAdvancedJournal, setShowAdvancedJournal] = useState(false);
  const [jeLines, setJeLines] = useState<JournalLine[]>([]);

  // 4. Two-Table Monthly Fixed Expenses State
  const [selectedMonthYear, setSelectedMonthYear] = useState('۱۴۰۴/۰۸');
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    recurringTemplates[0]?.id || 'tmpl-rent'
  );
  const [monthlyExpenseOverrideAmount, setMonthlyExpenseOverrideAmount] = useState('');
  const [monthlyPaidFromCode, setMonthlyPaidFromCode] = useState('110102');
  const [monthlyExpenseNote, setMonthlyExpenseNote] = useState('');
  const [newTmplName, setNewTmplName] = useState('');
  const [newTmplAmount, setNewTmplAmount] = useState('');
  const [newTmplDay, setNewTmplDay] = useState('1');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateAmount, setEditingTemplateAmount] = useState('');

  // 5. Fixed Assets & Shareholders 3-Bucket State
  const [showAddAssetModal, setShowAddAssetModal] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetCategory, setAssetCategory] =
    useState<FixedAssetRecord['category']>('دکوراسیون و فروشگاهی');
  const [assetPurchaseValue, setAssetPurchaseValue] = useState('');
  const [assetPaidFromCode, setAssetPaidFromCode] = useState('110102');

  const [drawingPartnerId, setDrawingPartnerId] = useState(shareholders[0]?.id || 'sh-1');
  const [drawingAmount, setDrawingAmount] = useState('');
  const [drawingAccountCode, setDrawingAccountCode] = useState('110102');
  const [drawingNote, setDrawingNote] = useState('');

  const [injectPartnerId, setInjectPartnerId] = useState(shareholders[0]?.id || 'sh-1');
  const [injectAmount, setInjectAmount] = useState('');
  const [injectAccountCode, setInjectAccountCode] = useState('110102');
  const [injectNote, setInjectNote] = useState('');

  const [showRuleSnapshotEditor, setShowRuleSnapshotEditor] = useState(false);
  const [p1CapPct, setP1CapPct] = useState(
    String(shareholders[0]?.ownershipPercent ?? 50)
  );
  const [p1ProfPct, setP1ProfPct] = useState(
    String(shareholders[0]?.profitSharePercent ?? 70)
  );
  const [p2CapPct, setP2CapPct] = useState(
    String(shareholders[1]?.ownershipPercent ?? 50)
  );
  const [p2ProfPct, setP2ProfPct] = useState(
    String(shareholders[1]?.profitSharePercent ?? 30)
  );
  const [snapshotNote, setSnapshotNote] = useState('');

  // 6. Stage-1 Purchase Invoice Form State (11 exact fields)
  const [pinvSupplier, setPinvSupplier] = useState('');
  const [pinvItemName, setPinvItemName] = useState('');
  const [pinvParentTag, setPinvParentTag] = useState(masterOptions.tags[0] || 'پاد یکبارمصرف');
  const [pinvCondition, setPinvCondition] = useState(masterOptions.conditions[0] || 'آکبند');
  const [pinvItemType, setPinvItemType] = useState(
    masterOptions.itemTypes[0] || 'جویس و سالت'
  );
  const [pinvTotalQty, setPinvTotalQty] = useState('10');
  const [pinvUnitCost, setPinvUnitCost] = useState('');
  const [pinvDiscountReceived, setPinvDiscountReceived] = useState('0');
  const [pinvDeliveryStatus, setPinvDeliveryStatus] = useState<
    'رسیده' | 'در راه (هنوز نرسیده)'
  >('رسیده');
  const [pinvWarehouseKey, setPinvWarehouseKey] = useState('central_external');
  const [pinvPaymentAccountCode, setPinvPaymentAccountCode] = useState('110102');
  const [pinvPaidAmount, setPinvPaidAmount] = useState('');
  const [pinvPaymentNotes, setPinvPaymentNotes] = useState('');
  const [pinvSettlementDueDate, setPinvSettlementDueDate] = useState('۱۴۰۴/۰۸/۲۵');
  const [showQuickSupplierModal, setShowQuickSupplierModal] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState('');
  const [quickSupplierPhone, setQuickSupplierPhone] = useState('');

  // Computed Financial Statements & Trial Balance
  const financialStatements = useMemo(
    () => calculateFinancialStatements(accounts),
    [accounts]
  );

  const trialBalance = useMemo(
    () => computeTrialBalance6Col(accounts, trialBalanceLevel, glEntries),
    [accounts, trialBalanceLevel, glEntries]
  );

  // Computed Three-Bucket Shareholder State
  const activeSalesInvoices = useMemo(
    () => salesInvoices.filter((s) => s.docstatus === 1 && !s.isHistoricalArchive),
    [salesInvoices]
  );
  const activePurchaseInvoices = useMemo(
    () => purchaseInvoices.filter((p) => p.docstatus === 1),
    [purchaseInvoices]
  );

  const threeBucketState = useMemo(() => {
    const totalRevenue = activeSalesInvoices.reduce((s, inv) => s + inv.totalAmount, 0);
    const totalCogs = activeSalesInvoices.reduce(
      (s, inv) =>
        s +
        (inv.cogsAmount ??
          (inv.lines?.reduce((acc, l) => acc + l.qty * (l.valuationRate || 0), 0) || 0)),
      0
    );
    const totalShopExpenses = accounts
      .filter((a) => a.category === 'هزینه' && a.code !== '5101' && a.level === 'معین')
      .reduce((s, a) => s + a.balance, 0);
    const totalPurchasesReinvested = activePurchaseInvoices.reduce(
      (s, p) => s + p.totalAmount,
      0
    );

    const p1 = shareholders[0] || {
      id: 'sh-1',
      name: 'شریک اول (۷۰٪ سود / ۵۰٪ سرمایه)',
      ownershipPercent: 50,
      profitSharePercent: 70,
      personalCapitalInjected: 0,
      dividendPaid: 0,
    };
    const p2 = shareholders[1] || {
      id: 'sh-2',
      name: 'شریک دوم (۳۰٪ سود / ۵۰٪ سرمایه)',
      ownershipPercent: 50,
      profitSharePercent: 30,
      personalCapitalInjected: 0,
      dividendPaid: 0,
    };

    return calculateThreeBucketShareholderState({
      initialInventoryCapital: initialInventoryCapitalBaseline,
      totalRevenue,
      totalCogs,
      totalOperatingExpenses: totalShopExpenses,
      totalNewPurchasesAmount: totalPurchasesReinvested,
      partners: [
        {
          id: p1.id,
          name: p1.name,
          capitalSharePercent: p1.ownershipPercent || 50,
          profitSharePercent: p1.profitSharePercent ?? 70,
          personalCapitalInjected: p1.personalCapitalInjected ?? 0,
          withdrawals: p1.dividendPaid ?? 0,
        },
        {
          id: p2.id,
          name: p2.name,
          capitalSharePercent: p2.ownershipPercent || 50,
          profitSharePercent: p2.profitSharePercent ?? 30,
          personalCapitalInjected: p2.personalCapitalInjected ?? 0,
          withdrawals: p2.dividendPaid ?? 0,
        },
      ],
    });
  }, [
    activeSalesInvoices,
    activePurchaseInvoices,
    accounts,
    shareholders,
    initialInventoryCapitalBaseline,
  ]);

  const supplierOptions = useMemo(() => {
    const fromCrm = customerContacts
      .filter((c) => c.contactCategory === 'supplier' || c.role.includes('تامین'))
      .map((c) => c.fullName);
    const allContacts = customerContacts.map((c) => c.fullName);
    return Array.from(new Set([...fromCrm, ...allContacts, 'پخش مرکزی ویپ تهران', 'بازرگانی قطعات کامپیوتر پارسیان']));
  }, [customerContacts]);

  const itemNameOptions = useMemo(
    () => Array.from(new Set(inventoryItems.map((i) => i.name))),
    [inventoryItems]
  );

  // Stage-1 Purchase Grand Total Calculation
  const computedPurchaseGross =
    Math.max(0, Number(pinvTotalQty) || 0) * Math.max(0, Number(pinvUnitCost) || 0);
  const computedPurchaseGrandTotal = Math.max(
    0,
    computedPurchaseGross - Math.max(0, Number(pinvDiscountReceived) || 0)
  );
  const computedPurchaseUnpaidDebt = Math.max(
    0,
    computedPurchaseGrandTotal - Math.max(0, Number(pinvPaidAmount) || 0)
  );

  const pendingSkuBreakdownBills = useMemo(
    () =>
      purchaseInvoices.filter(
        (p) => p.docstatus === 1 && !p.skuBreakdownCompleted
      ),
    [purchaseInvoices]
  );

  const postableAccounts = useMemo(
    () =>
      accounts.filter(
        (account) =>
          account.level !== 'گروه' &&
          !accounts.some((candidate) => candidate.parentCode === account.code)
      ),
    [accounts]
  );

  const parentableAccounts = useMemo(
    () => accounts.filter((a) => a.level !== 'تفصیلی'),
    [accounts]
  );

  const isAccountVisibleInTree = (acc: AccountNode): boolean => {
    if (selectedCategory !== 'همه' && acc.category !== selectedCategory) return false;
    let currParent = acc.parentCode;
    const byCode = new Map<string, AccountNode>(accounts.map((a) => [a.code, a]));
    while (currParent) {
      if (collapsedCodes.includes(currParent)) return false;
      currParent = byCode.get(currParent)?.parentCode;
    }
    return true;
  };

  const hasChildren = (code: string) => accounts.some((a) => a.parentCode === code);

  const toggleCollapseCode = (code: string) => {
    setCollapsedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleAddAccountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccCode.trim() || !newAccName.trim()) return;
    onAddAccount({
      id: `acc-${Date.now()}`,
      code: newAccCode.trim(),
      name: newAccName.trim(),
      category: newAccCat,
      level: newAccLevel,
      parentCode: newAccLevel === 'گروه' ? undefined : newAccParentCode,
      openingBalance: 0,
      balance: 0,
      currency: 'IRR',
    });
    setNewAccCode('');
    setNewAccName('');
    setShowNewAccForm(false);
    onShowToast(`سرفصل حساب «${newAccName}» در درخت حساب‌ها ثبت شد.`);
  };

  // Daily Shop Expense Submission (Simple mode)
  const handleQuickExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(expenseAmount);
    if (!expenseTitle.trim() || !(amt > 0)) {
      onShowToast('لطفاً عنوان هزینه جاری و مبلغ معتبر وارد کنید.');
      return;
    }
    const expAcc = accounts.find((a) => a.code === expenseAccountCode);
    const bankAcc = accounts.find((a) => a.code === paidFromAccountCode);
    if (!expAcc || !bankAcc) return;

    const newJe: JournalEntryRecord = {
      id: `je-${Date.now()}`,
      voucherNo: `EXP-${getPersianYear()}-${String(101 + journalEntries.length).padStart(4, '0')}`,
      postingDate: formatPersianDate(new Date()),
      docstatus: 1,
      title: expenseTitle.trim(),
      branchDimension: defaultBranch,
      totalDebit: amt,
      totalCredit: amt,
      expenseCategory: expAcc.name,
      paidFromAccountCode,
      lines: [
        {
          id: `jel-${Date.now()}-1`,
          accountCode: expAcc.code,
          accountName: expAcc.name,
          partyType: '—',
          costCenter: 'خرج‌کرد روزمره (ملزومات، پیک و پذیرایی)',
          dimensionBranch: defaultBranch,
          debit: amt,
          credit: 0,
          note: expenseNote.trim() || expenseTitle.trim(),
        },
        {
          id: `jel-${Date.now()}-2`,
          accountCode: bankAcc.code,
          accountName: bankAcc.name,
          partyType: '—',
          dimensionBranch: defaultBranch,
          debit: 0,
          credit: amt,
          note: `پرداخت از ${bankAcc.name}`,
        },
      ],
    };

    onSaveJournalEntry(newJe);
    setExpenseTitle('');
    setExpenseAmount('');
    setExpenseNote('');
  };

  // Stage-1 Purchase Invoice Submission
  const handleStage1PurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(pinvTotalQty);
    const unitCost = Number(pinvUnitCost);
    if (!pinvSupplier.trim() || !pinvItemName.trim() || !(qty > 0) || !(unitCost > 0)) {
      onShowToast('لطفاً تامین‌کننده، نام کالا، تعداد کل و قیمت خرید واحد را وارد کنید.');
      return;
    }

    const paid = Math.min(
      computedPurchaseGrandTotal,
      Math.max(0, Number(pinvPaidAmount) || 0)
    );
    const unpaid = Math.max(0, computedPurchaseGrandTotal - paid);
    const targetWh =
      warehouses.find((w) => w.key === pinvWarehouseKey) || warehouses[2] || warehouses[0];
    const isComputer = pinvItemType.includes('کامپیوتر') || pinvParentTag.includes('گرافیک');

    const newPurchase: PurchaseInvoiceRecord = {
      id: `pinv-${Date.now()}`,
      billNo: `PINV-${getPersianYear()}-${String(101 + purchaseInvoices.length).padStart(4, '0')}`,
      docstatus: 1,
      supplierName: pinvSupplier.trim(),
      date: formatPersianDate(new Date()),
      warehouse: targetWh?.name || 'انبار خارجی / مرکزی (ورود اولیه بار)',
      branchDimension: defaultBranch,
      status: unpaid > 0 ? 'بدهکار باز' : 'تسویه‌شده',
      totalAmount: computedPurchaseGrandTotal,
      discountReceived: Math.max(0, Number(pinvDiscountReceived) || 0),
      paidAmount: paid,
      landedCostAdded: 0,
      itemsSummary: `${qty} عدد ${pinvItemName.trim()} (${pinvCondition} • ${pinvParentTag})`,
      parentTag: pinvParentTag,
      itemCondition: pinvCondition,
      itemType: pinvItemType,
      sector: isComputer ? 'pc' : 'vape',
      deliveryStatus: pinvDeliveryStatus,
      paymentAccountCode: pinvPaymentAccountCode,
      paymentMode:
        unpaid > 0 && paid === 0
          ? 'نسیه تعهدی'
          : pinvPaymentAccountCode === '110101'
          ? 'کارتخوان (POS)'
          : pinvPaymentAccountCode === '110103'
          ? 'نقد (صندوق مغازه)'
          : 'کارت به کارت',
      paymentNotes: pinvPaymentNotes.trim() || undefined,
      settlementDueDate: unpaid > 0 ? pinvSettlementDueDate.trim() : undefined,
      skuBreakdownCompleted: false,
      lines: [
        {
          id: `pline-${Date.now()}`,
          sku: `STAGE1-${Date.now().toString().slice(-4)}`,
          itemName: pinvItemName.trim(),
          uom: 'عدد',
          qty,
          unitPrice: unitCost,
          discountPercent: 0,
          netLineAmount: computedPurchaseGrandTotal,
          valuationRate: Math.round(computedPurchaseGrandTotal / qty),
          sector: isComputer ? 'pc' : 'vape',
          warehouseKey: pinvWarehouseKey,
        },
      ],
    };

    const ok = onCreatePurchaseInvoice(newPurchase);
    if (ok) {
      setPinvItemName('');
      setPinvUnitCost('');
      setPinvDiscountReceived('0');
      setPinvPaidAmount('');
      setPinvPaymentNotes('');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Sub-Navigation Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl">
          {[
            { id: 'coa', label: 'درخت حساب‌ها (۳ حساب و ۴ انبار)' },
            { id: 'gl_trial', label: 'تراز آزمایشی و دفتر کل ماهیانه' },
            { id: 'statements', label: 'ترازنامه یکپارچه و سود و زیان ماهیانه' },
            { id: 'journal', label: 'ثبت هزینه‌های جاری مغازه' },
            { id: 'budget', label: 'مراکز هزینه و هزینه‌های ثابت (۲ جدولی)' },
            { id: 'assets', label: 'ثبت و مدیریت سهامداران (۳ قلک) و اموال' },
            { id: 'purchase_invoice', label: 'فاکتور خرید (مرحله ۱ مالی)' },
            { id: 'sales_invoice', label: 'آرشیو فاکتورهای فروش (فقط خواندنی)' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id as AccountingSubTab)}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeSubTab === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLocalReveal((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 hover:bg-slate-100 self-start lg:self-auto shrink-0"
          title="نمایش یا مخفی‌سازی موقت اعداد مالی این بخش"
        >
          {isMasked ? <Eye className="w-4 h-4 text-indigo-600" /> : <EyeOff className="w-4 h-4" />}
          <span>{isMasked ? 'نمایش ارقام مالی (****)' : 'مخفی‌سازی ارقام مالی'}</span>
        </button>
      </div>

      {/* =====================================================================
          MODULE 1: CHART OF ACCOUNTS (درخت حساب‌ها)
         ===================================================================== */}
      {activeSubTab === 'coa' && (
        <div className="space-y-5">
          {/* Architecture Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  ۳ حساب اصلی تسویه و نقدینگی مغازه
                </span>
                <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="space-y-1.5 text-xs">
                {accounts
                  .filter((a) => ['110101', '110102', '110103'].includes(a.code))
                  .map((acc) => (
                    <div
                      key={acc.code}
                      className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <span className="font-semibold text-slate-700">
                        {acc.code} — {acc.name}
                      </span>
                      <span className="font-black text-slate-900 tabular-nums">
                        {maskCurrency(acc.balance)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  ۴ انبار استاندارد مغازه در درخت حساب‌ها
                </span>
                <Building2 className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="space-y-1 text-xs">
                {accounts
                  .filter((a) => ['110401', '110402', '110403', '110404'].includes(a.code))
                  .map((acc) => (
                    <div
                      key={acc.code}
                      className="flex items-center justify-between py-1 px-2.5 rounded-lg bg-indigo-50/40 border border-indigo-100"
                    >
                      <span className="font-semibold text-slate-700">{acc.name}</span>
                      <span className="font-black text-indigo-900 tabular-nums">
                        {maskCurrency(acc.balance)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">
                  وضعیت تک‌شعبه‌ای و حساب‌های کلیدی
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xs text-slate-600 space-y-1.5">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-900 font-bold">
                  شعبه فعال پیش‌فرض: {defaultBranch}
                </div>
                <div className="flex items-center justify-between px-1">
                  <span>درآمد فروش خالص کالا (4101):</span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {maskCurrency(accounts.find((a) => a.code === '4101')?.balance || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between px-1">
                  <span>بدهی‌های تجاری به تأمین‌کنندگان (2101):</span>
                  <span className="font-bold text-rose-700 tabular-nums">
                    {maskCurrency(accounts.find((a) => a.code === '2101')?.balance || 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Full COA Tree */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {['همه', 'دارایی', 'بدهی', 'سرمایه', 'درآمد', 'هزینه'].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowNewAccForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                <Plus className="w-4 h-4" />
                <span>افزودن سرفصل جدید</span>
              </button>
            </div>

            {showNewAccForm && (
              <form
                onSubmit={handleAddAccountSubmit}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-6 gap-3 text-xs"
              >
                <input
                  type="text"
                  required
                  placeholder="کد حساب (مثلاً 5205)"
                  value={newAccCode}
                  onChange={(e) => setNewAccCode(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 bg-white tabular-nums"
                />
                <input
                  type="text"
                  required
                  placeholder="نام سرفصل حساب"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 bg-white"
                />
                <select
                  value={newAccCat}
                  onChange={(e) => setNewAccCat(e.target.value as AccountNode['category'])}
                  className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  <option value="دارایی">دارایی</option>
                  <option value="بدهی">بدهی</option>
                  <option value="سرمایه">سرمایه</option>
                  <option value="درآمد">درآمد</option>
                  <option value="هزینه">هزینه</option>
                </select>
                <select
                  value={newAccParentCode}
                  onChange={(e) => setNewAccParentCode(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 bg-white"
                >
                  {parentableAccounts.map((p) => (
                    <option key={p.code} value={p.code}>
                      زیرمجموعه {p.code} - {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 text-white font-bold px-4 py-2 hover:bg-emerald-700"
                >
                  ثبت حساب
                </button>
              </form>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">کد و نام سرفصل حساب</th>
                    <th className="py-3 px-4">طبقه</th>
                    <th className="py-3 px-4">سطح</th>
                    <th className="py-3 px-4 text-left">مانده لحظه‌ای (ریال)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {accounts.filter(isAccountVisibleInTree).map((acc) => {
                    const indent =
                      acc.level === 'گروه'
                        ? 'pr-2 font-black text-slate-900 bg-slate-50/70'
                        : acc.level === 'کل'
                        ? 'pr-6 font-bold text-slate-800'
                        : acc.level === 'معین'
                        ? 'pr-10 font-semibold text-slate-700'
                        : 'pr-14 text-slate-600';
                    const isParent = hasChildren(acc.code);
                    const isCollapsed = collapsedCodes.includes(acc.code);
                    return (
                      <tr key={acc.id} className="hover:bg-slate-50">
                        <td className={`py-2.5 px-4 ${indent}`}>
                          <div className="flex items-center gap-2">
                            {isParent ? (
                              <button
                                type="button"
                                onClick={() => toggleCollapseCode(acc.code)}
                                className="p-0.5 rounded hover:bg-slate-200"
                              >
                                {isCollapsed ? (
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                            ) : (
                              <span className="w-4 inline-block text-center text-slate-300">•</span>
                            )}
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 tabular-nums">
                              {acc.code}
                            </span>
                            <span>{acc.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">{acc.category}</td>
                        <td className="py-2.5 px-4">{acc.level}</td>
                        <td className="py-2.5 px-4 text-left font-bold tabular-nums">
                          {maskCurrency(acc.balance)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 2A: TRIAL BALANCE & GENERAL LEDGER (تراز آزمایشی و دفتر کل ماهیانه)
         ===================================================================== */}
      {activeSubTab === 'gl_trial' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  تراز آزمایشی ۶ ستونی ماهیانه
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  گزارش استاندارد گردش ماهیانه و مانده حساب‌ها در سطوح گروه، کل و معین
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
                {(['گروه', 'کل', 'معین'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setTrialBalanceLevel(lvl)}
                    className={`px-3 py-1.5 rounded-lg font-bold ${
                      trialBalanceLevel === lvl
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    سطح {lvl}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">کد</th>
                    <th className="py-3 px-3">نام حساب</th>
                    <th className="py-3 px-3">گردش بدهکار ماهیانه</th>
                    <th className="py-3 px-3">گردش بستانکار ماهیانه</th>
                    <th className="py-3 px-3">مانده نهایی بدهکار</th>
                    <th className="py-3 px-3">مانده نهایی بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {trialBalance.rows.map((r) => (
                    <tr key={r.code} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono tabular-nums">{r.code}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">{r.name}</td>
                      <td className="py-2.5 px-3 tabular-nums">
                        {maskCurrency(r.periodDebit)}
                      </td>
                      <td className="py-2.5 px-3 tabular-nums">
                        {maskCurrency(r.periodCredit)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-emerald-700 tabular-nums">
                        {maskCurrency(r.closingDebit)}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-indigo-700 tabular-nums">
                        {maskCurrency(r.closingCredit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* General Ledger Rows (ردیف‌های سند و اقلام تراکنش) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  دفتر کل و اقلام تراکنش ماهیانه ({glEntries.length} ردیف سند)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تمامی ردیف‌های سند ثبت‌شده به تفکیک ماه و سرفصل حساب
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={glFilterAccount}
                  onChange={(e) => setGlFilterAccount(e.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
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
                  className="rounded-xl border border-slate-300 px-3 py-1.5 bg-white font-bold"
                >
                  <option value="همه ماه‌ها">فیلتر زمانی: همه ماه‌ها</option>
                  <option value="۰۷">مهرماه</option>
                  <option value="۰۸">آبان‌ماه</option>
                  <option value="۰۹">آذرماه</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">شماره سند</th>
                    <th className="py-2.5 px-3">نوع سند</th>
                    <th className="py-2.5 px-3">سرفصل حساب</th>
                    <th className="py-2.5 px-3">بدهکار</th>
                    <th className="py-2.5 px-3">بستانکار</th>
                    <th className="py-2.5 px-3">شرح ردیف سند</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {glEntries
                    .filter((g) =>
                      glFilterAccount === 'همه حساب‌ها' ? true : g.accountCode === glFilterAccount
                    )
                    .filter((g) =>
                      glFilterMonth === 'همه ماه‌ها' ? true : g.postingDate.includes(`/${glFilterMonth}/`)
                    )
                    .map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 tabular-nums">{g.postingDate}</td>
                        <td className="py-2 px-3 font-mono font-bold">{g.voucherNo}</td>
                        <td className="py-2 px-3">{formatVoucherType(g.voucherType)}</td>
                        <td className="py-2 px-3 font-semibold">
                          {g.accountCode} — {g.accountName}
                        </td>
                        <td className="py-2 px-3 text-emerald-700 font-bold tabular-nums">
                          {g.debit > 0 ? maskCurrency(g.debit) : '—'}
                        </td>
                        <td className="py-2 px-3 text-rose-700 font-bold tabular-nums">
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
          MODULE 2B: UNIFIED BALANCE SHEET & MONTHLY P&L (ترازنامه یکپارچه و معادله حسابداری)
         ===================================================================== */}
      {activeSubTab === 'statements' && (
        <div className="space-y-6">
          {/* Unified Balance Sheet + Live Accounting Equation Indicator Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Scale className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-black text-slate-900">
                    گزارش یکپارچه ترازنامه و معادله اساسی حسابداری (فروش ماهیانه)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  ادغام ترازنامه و معادله اساسی حسابداری در یک نمای استاندارد بدون تکرار، همراه با نوار نشانگر تراز لحظه‌ای
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black ${
                  financialStatements.isBalanceSheetBalanced
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {financialStatements.isBalanceSheetBalanced
                    ? 'تراز کامل: دارایی‌ها = بدهی‌ها + حقوق صاحبان سهام'
                    : 'عدم تراز در معادله حسابداری'}
                </span>
              </span>
            </div>

            {/* Balance Indicator Bar */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="text-slate-400">کل دارایی‌ها (نقدینگی + ۴ انبار + مطالبات): </span>
                  <span className="font-black text-emerald-400 text-sm tabular-nums">
                    {maskCurrency(financialStatements.totalAssets)}
                  </span>
                </div>
                <div className="text-slate-400 font-black">=</div>
                <div>
                  <span className="text-slate-400">کل بدهی‌های تجاری: </span>
                  <span className="font-black text-amber-300 text-sm tabular-nums">
                    {maskCurrency(financialStatements.totalLiabilities)}
                  </span>
                </div>
                <div className="text-slate-400 font-black">+</div>
                <div>
                  <span className="text-slate-400">سرمایه + سود خالص ماهیانه: </span>
                  <span className="font-black text-indigo-300 text-sm tabular-nums">
                    {maskCurrency(
                      financialStatements.totalEquity + financialStatements.netProfit
                    )}
                  </span>
                </div>
              </div>

              <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all"
                  style={{ width: '50%' }}
                  title="دارایی‌ها"
                />
                <div
                  className="bg-indigo-500 h-full transition-all"
                  style={{ width: '50%' }}
                  title="بدهی‌ها و حقوق صاحبان سهام"
                />
              </div>
            </div>

            {/* Monthly Income Statement Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 font-semibold">فروش ماهیانه (درآمد کل)</div>
                <div className="text-base font-black text-slate-900 mt-1 tabular-nums">
                  {maskCurrency(financialStatements.totalRevenue)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 font-semibold">بهای تمام‌شده کالای فروش‌رفته</div>
                <div className="text-base font-black text-rose-700 mt-1 tabular-nums">
                  {maskCurrency(
                    accounts.find((a) => a.code === '5101')?.balance || 0
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs text-slate-500 font-semibold">هزینه‌های ثابت و جاری ماهیانه</div>
                <div className="text-base font-black text-amber-700 mt-1 tabular-nums">
                  {maskCurrency(
                    Math.max(
                      0,
                      financialStatements.totalExpenses -
                        (accounts.find((a) => a.code === '5101')?.balance || 0)
                    )
                  )}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-xs text-emerald-800 font-bold">سود خالص ماهیانه مغازه</div>
                <div className="text-base font-black text-emerald-900 mt-1 tabular-nums">
                  {maskCurrency(financialStatements.netProfit)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 2C & 12: DAILY SHOP EXPENSE JOURNAL (ثبت هزینه‌های جاری مغازه)
         ===================================================================== */}
      {activeSubTab === 'journal' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ثبت هزینه‌های جاری و خرده‌خرج‌های روزانه مغازه
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ثبت سریع هزینه‌های روزمره مغازه (پیک، پذیرایی، ملزومات مصرفی، نایلون، تعمیرات جزئی) با کسر مستقیم از یکی از ۳ حساب نقدینگی
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAdvancedJournal((prev) => !prev)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
              >
                {showAdvancedJournal
                  ? 'بازگشت به فرم ساده هزینه جاری'
                  : 'ثبت سند روزنامه چندردیفه پیشرفته'}
              </button>
            </div>

            {!showAdvancedJournal ? (
              <form
                onSubmit={handleQuickExpenseSubmit}
                className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs items-end"
              >
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    عنوان خرج‌کرد / هزینه جاری *
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    placeholder="مثلاً: کرایه پیک ارسال سفارش یا خرید دستمال و قهوه"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">مبلغ هزینه (ریال) *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="مثلاً: 1500000"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">سرفصل هزینه مغازه</label>
                  <select
                    value={expenseAccountCode}
                    onChange={(e) => setExpenseAccountCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                  >
                    <option value="5204">۵۲۰۴ — هزینه‌های جاری مغازه (ملزومات، پیک، پذیرایی)</option>
                    <option value="5202">۵۲۰۲ — هزینه قبوض (برق، آب، اینترنت)</option>
                    <option value="5203">۵۲۰۳ — هزینه شارژ پاساژ و ساختمان</option>
                    <option value="5201">۵۲۰۱ — هزینه اجاره ماهانه مغازه</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">پرداخت از حساب</label>
                  <select
                    value={paidFromAccountCode}
                    onChange={(e) => setPaidFromAccountCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                  >
                    {LIQUIDITY_ACCOUNTS.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        {acc.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
                >
                  <Plus className="w-4 h-4" />
                  <span>ثبت قطعی هزینه جاری</span>
                </button>
              </form>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="font-bold text-slate-800">
                  ثبت سند دوبل حسابداری (مجموع بدهکار و بستانکار ردیف‌های سند باید برابر باشد)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setJeLines((prev) => [
                        ...prev,
                        {
                          id: `jl-${Date.now()}`,
                          accountCode: postableAccounts[0]?.code || '5204',
                          accountName: postableAccounts[0]?.name || '',
                          debit: 0,
                          credit: 0,
                        },
                      ])
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-bold"
                  >
                    + افزودن ردیف سند
                  </button>
                </div>
                {jeLines.map((line, idx) => (
                  <div key={line.id} className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <select
                      value={line.accountCode}
                      onChange={(e) => {
                        const acc = postableAccounts.find((a) => a.code === e.target.value);
                        setJeLines((prev) =>
                          prev.map((l, i) =>
                            i === idx
                              ? {
                                  ...l,
                                  accountCode: e.target.value,
                                  accountName: acc?.name || '',
                                }
                              : l
                          )
                        );
                      }}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white"
                    >
                      {postableAccounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="بدهکار"
                      value={line.debit || ''}
                      onChange={(e) =>
                        setJeLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, debit: Number(e.target.value) || 0 } : l
                          )
                        )
                      }
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                    <input
                      type="number"
                      placeholder="بستانکار"
                      value={line.credit || ''}
                      onChange={(e) =>
                        setJeLines((prev) =>
                          prev.map((l, i) =>
                            i === idx ? { ...l, credit: Number(e.target.value) || 0 } : l
                          )
                        )
                      }
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setJeLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 font-bold"
                    >
                      حذف ردیف سند
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* List of Recorded Shop Expense Journals with Void Button */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="text-xs font-black text-slate-800">
                فهرست اسناد هزینه‌های جاری ثبت‌شده ({journalEntries.length} سند)
              </div>
              {journalEntries.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                  هنوز سند هزینه جاری در این ماه ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-2">
                  {journalEntries.map((je) => (
                    <div
                      key={je.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                        je.docstatus === 2
                          ? 'bg-rose-50/40 border-rose-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">
                            {je.voucherNo}
                          </span>
                          <span className="font-black text-slate-900">{je.title}</span>
                          {je.docstatus === 2 ? (
                            <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">
                              باطل شد (Void)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              ثبت قطعی
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500">
                          تاریخ: {je.postingDate} • مبلغ:{' '}
                          <span className="font-bold text-slate-800 tabular-nums">
                            {maskCurrency(je.totalDebit)}
                          </span>{' '}
                          • تعداد ردیف سند: {je.lines.length}
                        </div>
                      </div>

                      {je.docstatus === 1 && (
                        <button
                          type="button"
                          onClick={() => onCancelJournalEntry(je.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700 shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>ابطال سند (Void و برگشت پول به حساب)</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 3: TWO-TABLE SHOP COST CENTERS & FIXED MONTHLY EXPENSES
         ===================================================================== */}
      {activeSubTab === 'budget' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* TABLE 1: RECURRING TEMPLATES (قالب‌های تکرارشونده ماهانه) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 space-y-4 h-fit">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900">
                  جدول ۱: قالب‌های تکرارشونده هزینه‌های ثابت (Recurring Templates)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  تغییر مبلغ پیش‌فرض اجاره یا شارژ در این جدول فقط برای ماه‌های آینده اعمال می‌شود و اسناد قفل‌شده ماه‌های قبل را هرگز تغییر نمی‌دهد.
                </p>
              </div>

              <div className="space-y-2.5">
                {recurringTemplates.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-black text-slate-900">{tmpl.name}</span>
                        <span className="text-[11px] text-slate-500 mr-2">
                          (موعد: روز {tmpl.dueDayOfMonth} هر ماه)
                        </span>
                      </div>
                      <span className="font-black text-indigo-700 tabular-nums">
                        {maskCurrency(tmpl.defaultMonthlyAmount)}
                      </span>
                    </div>

                    {editingTemplateId === tmpl.id ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="number"
                          value={editingTemplateAmount}
                          onChange={(e) => setEditingTemplateAmount(e.target.value)}
                          placeholder="مبلغ جدید برای ماه‌های آینده..."
                          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1 bg-white tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = Number(editingTemplateAmount);
                            if (val > 0) {
                              onUpdateRecurringTemplateAmount(tmpl.id, val);
                              setEditingTemplateId(null);
                            }
                          }}
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                        >
                          ذخیره قالب
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>مرکز هزینه: {tmpl.costCenterName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTemplateId(tmpl.id);
                            setEditingTemplateAmount(String(tmpl.defaultMonthlyAmount));
                          }}
                          className="text-indigo-600 font-bold hover:underline"
                        >
                          ویرایش مبلغ ماه‌های آینده
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Add New Recurring Template */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newTmplName.trim() || !(Number(newTmplAmount) > 0)) return;
                  onAddRecurringTemplate({
                    code: `FIX-0${recurringTemplates.length + 1}`,
                    name: newTmplName.trim(),
                    defaultMonthlyAmount: Number(newTmplAmount),
                    accountCode: '5204',
                    dueDayOfMonth: Number(newTmplDay) || 1,
                    costCenterName: 'خرج‌کرد روزمره (ملزومات، پیک و پذیرایی)',
                  });
                  setNewTmplName('');
                  setNewTmplAmount('');
                }}
                className="pt-3 border-t border-slate-100 space-y-2.5 text-xs"
              >
                <div className="font-bold text-slate-800">+ تعریف قالب هزینه ثابت جدید</div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="عنوان (مثلاً اشتراک اینترنت)"
                    value={newTmplName}
                    onChange={(e) => setNewTmplName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                  />
                  <input
                    type="number"
                    placeholder="مبلغ ماهانه"
                    value={newTmplAmount}
                    onChange={(e) => setNewTmplAmount(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 tabular-nums"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 text-white font-bold px-3 py-1.5"
                  >
                    + افزودن قالب
                  </button>
                </div>
              </form>
            </div>

            {/* TABLE 2: MONTHLY EXPENSE LEDGER (دفتر ثبت قطعی هزینه‌های ماهانه - قفل‌شده در تاریخچه) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-black text-slate-900">
                  جدول ۲: دفتر ثبت هزینه‌های قطعی ماهانه (Monthly Expense Ledger)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  هر رکورد با تگ «ماه/سال» به صورت مستقل و قفل‌شده ثبت می‌شود تا تغییر اجاره در ماه جدید، گزارش سود و زیان ماه‌های قبل را دستکاری نکند.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const tmpl = recurringTemplates.find((t) => t.id === selectedTemplateId);
                  if (!tmpl) return;
                  const finalAmt =
                    Number(monthlyExpenseOverrideAmount) > 0
                      ? Number(monthlyExpenseOverrideAmount)
                      : tmpl.defaultMonthlyAmount;
                  onRecordMonthlyFixedExpense({
                    templateId: tmpl.id,
                    monthYear: selectedMonthYear,
                    amount: finalAmt,
                    paidFromAccountCode: monthlyPaidFromCode,
                    note: monthlyExpenseNote.trim() || undefined,
                  });
                  setMonthlyExpenseOverrideAmount('');
                  setMonthlyExpenseNote('');
                }}
                className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs items-end"
              >
                <div>
                  <label className="block font-bold text-slate-700 mb-1">انتخاب قالب هزینه</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  >
                    {recurringTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({formatCurrency(t.defaultMonthlyAmount)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">ماه / سال مالی</label>
                  <select
                    value={selectedMonthYear}
                    onChange={(e) => setSelectedMonthYear(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white tabular-nums"
                  >
                    <option value="۱۴۰۴/۰۷">مهر ۱۴۰۴ (۱۴۰۴/۰۷)</option>
                    <option value="۱۴۰۴/۰۸">آبان ۱۴۰۴ (۱۴۰۴/۰۸)</option>
                    <option value="۱۴۰۴/۰۹">آذر ۱۴۰۴ (۱۴۰۴/۰۹)</option>
                    <option value="۱۴۰۴/۱۰">دی ۱۴۰۴ (۱۴۰۴/۱۰)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    مبلغ قطعی این ماه (اختیاری)
                  </label>
                  <input
                    type="number"
                    value={monthlyExpenseOverrideAmount}
                    onChange={(e) => setMonthlyExpenseOverrideAmount(e.target.value)}
                    placeholder="پیش‌فرض قالب"
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">پرداخت از حساب</label>
                  <select
                    value={monthlyPaidFromCode}
                    onChange={(e) => setMonthlyPaidFromCode(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  >
                    {LIQUIDITY_ACCOUNTS.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="py-2 px-3 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700"
                >
                  ثبت و قفل در ماه
                </button>
              </form>

              <div className="space-y-2">
                {monthlyExpenseLedger.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                    هنوز رکورد هزینه ثابتی در دفتر ماهانه قفل نشده است.
                  </div>
                ) : (
                  monthlyExpenseLedger.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold tabular-nums">
                            {rec.monthYear}
                          </span>
                          <span className="font-black text-slate-900">{rec.expenseName}</span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                            <Lock className="w-3 h-3" />
                            قفل‌شده در تاریخچه
                          </span>
                        </div>
                        <div className="text-slate-500">
                          شماره سند: {rec.voucherNo} • تاریخ پرداخت: {rec.paymentDate} • حساب:{' '}
                          {rec.paidFromAccountCode}
                        </div>
                      </div>
                      <div className="font-black text-slate-900 text-sm tabular-nums">
                        {maskCurrency(rec.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 4 & 1D: THREE-BUCKET SHAREHOLDERS ENGINE & FIXED ASSETS
         ===================================================================== */}
      {activeSubTab === 'assets' && (
        <div className="space-y-6">
          {/* THREE-BUCKET SHAREHOLDER ENGINE (موتور ضدباگ ۳ قلک ۵۰/۵۰ و ۷۰/۳۰) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ثبت و مدیریت سهامداران — موتور ضدباگ ۳ قلک (سرمایه ۵۰/۵۰ و سود ۷۰/۳۰)
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  جداسازی کامل بهای تمام‌شده احیای انبار (۵۰/۵۰) از سود خالص قابل تقسیم (۷۰/۳۰) بر اساس فرمول ریاضی استاندارد
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRuleSnapshotEditor((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold hover:bg-indigo-100 self-start"
              >
                <Camera className="w-4 h-4" />
                <span>تغییر پویای درصد سهامداران + ثبت Snapshot</span>
              </button>
            </div>

            {/* Dynamic Percentage Editor with Automatic Snapshot */}
            {showRuleSnapshotEditor && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdateShareholderPercentagesWithSnapshot({
                    partner1CapitalPct: Number(p1CapPct) || 50,
                    partner1ProfitPct: Number(p1ProfPct) || 70,
                    partner2CapitalPct: Number(p2CapPct) || 50,
                    partner2ProfitPct: Number(p2ProfPct) || 30,
                    note: snapshotNote.trim() || 'تغییر توافق درصد سهامداران با ثبت Snapshot',
                  });
                  setShowRuleSnapshotEditor(false);
                  setSnapshotNote('');
                }}
                className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3 text-xs"
              >
                <div className="font-black text-indigo-950">
                  تغییر درصد سرمایه ($C_i$) و سود ($P_i$) همراه با فریز خودکار حساب‌ها تا این لحظه (Snapshot)
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block font-bold mb-1">سهم سرمایه شریک اول (%)</label>
                    <input
                      type="number"
                      value={p1CapPct}
                      onChange={(e) => setP1CapPct(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">سهم سود شریک اول (%)</label>
                    <input
                      type="number"
                      value={p1ProfPct}
                      onChange={(e) => setP1ProfPct(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">سهم سرمایه شریک دوم (%)</label>
                    <input
                      type="number"
                      value={p2CapPct}
                      onChange={(e) => setP2CapPct(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">سهم سود شریک دوم (%)</label>
                    <input
                      type="number"
                      value={p2ProfPct}
                      onChange={(e) => setP2ProfPct(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white tabular-nums"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700"
                    >
                      فریز تاریخچه و اعمال
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* The 3 Buckets Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Bucket 1: 50/50 Capital Recovery Pool */}
              <div className="p-5 rounded-2xl bg-slate-900 text-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-white/10 text-emerald-300">
                    قلک اول • مالکیت ۵۰٪ / ۵۰٪
                  </span>
                </div>
                <div className="text-sm font-black">
                  صندوق احیای انبار و سرمایه اولیه (Capital Recovery Pool)
                </div>
                <div className="text-xl font-black text-emerald-400 tabular-nums">
                  {maskCurrency(
                    threeBucketState.bucket1InitialInventoryCapital +
                      threeBucketState.bucket1CurrentBalance
                  )}
                </div>
                <div className="text-[11px] text-slate-300 space-y-1 pt-2 border-t border-white/10">
                  <div className="flex justify-between">
                    <span>سرمایه اولیه موجودی کلودی شاپ (۵۰/۵۰):</span>
                    <span className="font-bold tabular-nums">
                      {maskCurrency(threeBucketState.bucket1InitialInventoryCapital)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>اصل پول برگشتی از فروش کالاها (COGS):</span>
                    <span className="font-bold tabular-nums">
                      {maskCurrency(threeBucketState.bucket1RecoveredCogs)}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-300">
                    <span>مصرف‌شده برای شارژ مجدد انبار (۵۰/۵۰):</span>
                    <span className="font-bold tabular-nums">
                      {maskCurrency(threeBucketState.bucket1UsedForPurchases)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bucket 2: Partner 1 (70% Profit / 50% Capital) */}
              {threeBucketState.partners[0] && (
                <div className="p-5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-900 text-white">
                      قلک دوم • شریک اول ({threeBucketState.partners[0].profitSharePercent}٪ سود /{' '}
                      {threeBucketState.partners[0].capitalSharePercent}٪ سرمایه)
                    </span>
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {threeBucketState.partners[0].name}
                  </div>
                  <div className="text-xl font-black text-emerald-900 tabular-nums">
                    {maskCurrency(threeBucketState.partners[0].walletBalance)}
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1 pt-2 border-t border-emerald-200/70">
                    <div className="flex justify-between">
                      <span>
                        سهم سود خالص ({threeBucketState.partners[0].profitSharePercent}٪):
                      </span>
                      <span className="font-bold text-emerald-800 tabular-nums">
                        {maskCurrency(threeBucketState.partners[0].profitAllocated)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        سهم توسعه انبار جدید ({threeBucketState.partners[0].capitalSharePercent}٪):
                      </span>
                      <span className="font-bold text-rose-700 tabular-nums">
                        {maskCurrency(threeBucketState.partners[0].capitalExpansionCharge)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>مجموع برداشت شخصی ($D_1$):</span>
                      <span className="font-bold tabular-nums">
                        {maskCurrency(threeBucketState.partners[0].withdrawals)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Bucket 3: Partner 2 (30% Profit / 50% Capital) */}
              {threeBucketState.partners[1] && (
                <div
                  className={`p-5 rounded-2xl border space-y-3 ${
                    threeBucketState.partners[1].isNegativeDeficit
                      ? 'bg-rose-50 border-rose-300'
                      : 'bg-indigo-50/70 border-indigo-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-900 text-white">
                      قلک سوم • شریک دوم ({threeBucketState.partners[1].profitSharePercent}٪ سود /{' '}
                      {threeBucketState.partners[1].capitalSharePercent}٪ سرمایه)
                    </span>
                    {threeBucketState.partners[1].isNegativeDeficit && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-rose-600 text-white">
                        تراز منفی (بدهکار توسعه انبار)
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {threeBucketState.partners[1].name}
                  </div>
                  <div
                    className={`text-xl font-black tabular-nums ${
                      threeBucketState.partners[1].isNegativeDeficit
                        ? 'text-rose-700'
                        : 'text-indigo-900'
                    }`}
                  >
                    {maskCurrency(threeBucketState.partners[1].walletBalance)}
                  </div>
                  <div className="text-[11px] text-slate-600 space-y-1 pt-2 border-t border-indigo-200/70">
                    <div className="flex justify-between">
                      <span>
                        سهم سود خالص ({threeBucketState.partners[1].profitSharePercent}٪):
                      </span>
                      <span className="font-bold text-indigo-800 tabular-nums">
                        {maskCurrency(threeBucketState.partners[1].profitAllocated)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        سهم توسعه انبار جدید ({threeBucketState.partners[1].capitalSharePercent}٪):
                      </span>
                      <span className="font-bold text-rose-700 tabular-nums">
                        {maskCurrency(threeBucketState.partners[1].capitalExpansionCharge)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>مجموع برداشت شخصی ($D_2$):</span>
                      <span className="font-bold tabular-nums">
                        {maskCurrency(threeBucketState.partners[1].withdrawals)}
                      </span>
                    </div>
                    {threeBucketState.partners[1].isNegativeDeficit && (
                      <div className="p-2 rounded-lg bg-rose-100 text-rose-900 font-bold mt-1">
                        به علت توسعه انبار (سهم ۵۰٪ خرید بیش از سهم ۳۰٪ سود)، شریک دوم مبلغ{' '}
                        {maskCurrency(Math.abs(threeBucketState.partners[1].walletBalance))} به صندوق احیای انبار بدهکار است.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Shareholder Drawings (برداشت سود) & Personal Capital Injection Forms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const amt = Number(drawingAmount);
                  if (!(amt > 0)) return;
                  onRecordShareholderDrawing({
                    partnerId: drawingPartnerId,
                    amount: amt,
                    paidFromAccountCode: drawingAccountCode,
                    note: drawingNote.trim() || 'برداشت سود سهامدار از کیف پول اختصاصی',
                  });
                  setDrawingAmount('');
                  setDrawingNote('');
                }}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
              >
                <div className="font-black text-slate-900">
                  ثبت برداشت سود سهامدار ($D_i$) بدون اختلال در بهای تمام‌شده
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={drawingPartnerId}
                    onChange={(e) => setDrawingPartnerId(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  >
                    {shareholders.map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {sh.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="مبلغ برداشت (ریال)"
                    value={drawingAmount}
                    onChange={(e) => setDrawingAmount(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={drawingAccountCode}
                    onChange={(e) => setDrawingAccountCode(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  >
                    {LIQUIDITY_ACCOUNTS.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 text-white font-bold px-3 py-2 hover:bg-slate-800"
                  >
                    ثبت برداشت سود
                  </button>
                </div>
              </form>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const amt = Number(injectAmount);
                  if (!(amt > 0)) return;
                  onRecordShareholderCapitalInjection({
                    partnerId: injectPartnerId,
                    amount: amt,
                    toAccountCode: injectAccountCode,
                    note: injectNote.trim() || 'آورده نقدی / تسویه بدهی توسعه انبار',
                  });
                  setInjectAmount('');
                  setInjectNote('');
                }}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
              >
                <div className="font-black text-slate-900">
                  ثبت تزریق سرمایه شخصی ($C_{'{i,personal}'}$) / تسویه بدهی توسعه انبار
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={injectPartnerId}
                    onChange={(e) => setInjectPartnerId(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  >
                    {shareholders.map((sh) => (
                      <option key={sh.id} value={sh.id}>
                        {sh.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="مبلغ واریزی (ریال)"
                    value={injectAmount}
                    onChange={(e) => setInjectAmount(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white tabular-nums"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <select
                    value={injectAccountCode}
                    onChange={(e) => setInjectAccountCode(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                  >
                    {LIQUIDITY_ACCOUNTS.map((a) => (
                      <option key={a.code} value={a.code}>
                        واریز به {a.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 text-white font-bold px-3 py-2 hover:bg-emerald-700"
                  >
                    ثبت افزایش سرمایه
                  </button>
                </div>
              </form>
            </div>

            {shareholderSnapshots.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                <div className="font-bold text-slate-700">
                  تاریخچه Snapshotهای فریز شده تغییر درصد سهامداران:
                </div>
                {shareholderSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      تاریخ: {snap.effectiveDate} • شریک اول: سرمایه {snap.partner1CapitalPct}٪ / سود{' '}
                      {snap.partner1ProfitPct}٪ • شریک دوم: سرمایه {snap.partner2CapitalPct}٪ / سود{' '}
                      {snap.partner2ProfitPct}٪
                    </span>
                    <span className="text-slate-500">{snap.note}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FIXED ASSETS SECTION (اموال و ماشین‌آلات مغازه — خالی به صورت پیش‌فرض با دکمه + ثبت دارایی جدید) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  اموال، ماشین‌آلات و تجهیزات ثابت مغازه
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  لیست دارایی‌های ثابت به صورت پیش‌فرض خالی است؛ در هر زمان می‌توانید تجهیزات مغازه (کولر، دکوراسیون، سیستم صندوق و...) را ثبت کنید.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddAssetModal((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
              >
                <Plus className="w-4 h-4" />
                <span>+ ثبت دارایی جدید</span>
              </button>
            </div>

            {showAddAssetModal && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = Number(assetPurchaseValue);
                  if (!assetName.trim() || !(val > 0)) return;
                  onAddFixedAsset({
                    assetTag: `AST-${String(101 + fixedAssets.length)}`,
                    name: assetName.trim(),
                    category: assetCategory,
                    location: defaultBranch,
                    purchaseDate: formatPersianDate(new Date()),
                    purchaseValue: val,
                    currentBookValue: val,
                    paidFromAccountCode: assetPaidFromCode,
                    status: 'فعال در بهره‌برداری',
                  });
                  setAssetName('');
                  setAssetPurchaseValue('');
                  setShowAddAssetModal(false);
                }}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs items-end"
              >
                <div>
                  <label className="block font-bold mb-1">نام تجهیز / دارایی ثابت *</label>
                  <input
                    type="text"
                    required
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="مثلاً: ویترین شیشه‌ای LED یا اسپلیت مغازه"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">دسته‌بندی</label>
                  <select
                    value={assetCategory}
                    onChange={(e) =>
                      setAssetCategory(e.target.value as FixedAssetRecord['category'])
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                  >
                    <option value="دکوراسیون و فروشگاهی">دکوراسیون و فروشگاهی</option>
                    <option value="تجهیزات فناوری">تجهیزات فناوری</option>
                    <option value="وسایل نقلیه">وسایل نقلیه</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">ارزش خرید (ریال) *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={assetPurchaseValue}
                    onChange={(e) => setAssetPurchaseValue(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">محل پرداخت</label>
                  <select
                    value={assetPaidFromCode}
                    onChange={(e) => setAssetPaidFromCode(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white"
                  >
                    {LIQUIDITY_ACCOUNTS.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                >
                  ثبت دارایی در اموال
                </button>
              </form>
            )}

            {fixedAssets.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                لیست اموال و دارایی‌های ثابت مغازه خالی است. برای افزودن تجهیزات روی دکمه «+ ثبت دارایی جدید» کلیک کنید.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fixedAssets.map((ast) => (
                  <div
                    key={ast.id}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-black text-slate-900">
                        {ast.name} ({ast.assetTag})
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        {ast.category} • تاریخ خرید: {ast.purchaseDate} • ارزش دفتری:{' '}
                        <span className="font-bold text-slate-800 tabular-nums">
                          {maskCurrency(ast.currentBookValue)}
                        </span>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold">
                      {ast.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 5 & 7: STAGE-1 PURCHASE INVOICES (فاکتور خرید مرحله اول با ۱۱ فیلد)
         ===================================================================== */}
      {activeSubTab === 'purchase_invoice' && (
        <div className="space-y-6">
          {/* Urgent Alert for Pending Stage-2 SKU Breakdown */}
          {pendingSkuBreakdownBills.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-black text-amber-950">
                    هشدار فوری: {pendingSkuBreakdownBills.length} فاکتور خرید در انتظار تفکیک طعم/رنگ/نیکوتین (مرحله دوم در انبارگردانی) است!
                  </div>
                  <div className="text-amber-800 mt-0.5">
                    موجودی کل فاکتور ثبت شده است؛ برای تخصیص جزییات SKU به تک‌تک اقلام وارد بخش «انبارگردانی» شوید.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onNavigateToInventoryBreakdown(pendingSkuBreakdownBills[0]?.billNo)
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-900 text-white text-xs font-bold hover:bg-amber-800 shrink-0"
              >
                <span>تکمیل مرحله ۲ (تفکیک در انبارگردانی)</span>
                <ArrowUpLeft className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Stage-1 Purchase Form (11 Fields + CreatableCombobox) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
            <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  ثبت فاکتور خرید (مرحله اول: ثبت مالی کلان و وضعیت تحویل بار)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ثبت سریع فاکتور خرید با ۱۱ فیلد استاندارد و لیست‌های هوشمند (Tag Select). تفکیک طعم، رنگ و مقاومت در مرحله دوم (انبارگردانی) انجام می‌شود.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickSupplierModal((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold hover:bg-indigo-100"
              >
                + ثبت سریع تأمین‌کننده جدید در مخاطبین
              </button>
            </div>

            {showQuickSupplierModal && (
              <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 flex flex-wrap items-center gap-2.5 text-xs">
                <input
                  type="text"
                  placeholder="نام تامین‌کننده / پخش..."
                  value={quickSupplierName}
                  onChange={(e) => setQuickSupplierName(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 bg-white"
                />
                <input
                  type="text"
                  placeholder="شماره تماس..."
                  value={quickSupplierPhone}
                  onChange={(e) => setQuickSupplierPhone(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 bg-white tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!quickSupplierName.trim()) return;
                    onQuickAddSupplier(quickSupplierName.trim(), quickSupplierPhone.trim());
                    setPinvSupplier(quickSupplierName.trim());
                    setQuickSupplierName('');
                    setQuickSupplierPhone('');
                    setShowQuickSupplierModal(false);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white font-bold"
                >
                  افزودن به مخاطبین و انتخاب
                </button>
              </div>
            )}

            <form onSubmit={handleStage1PurchaseSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Supplier Name */}
                <CreatableCombobox
                  label="۱. نام فروشنده / تأمین‌کننده *"
                  value={pinvSupplier}
                  onChange={setPinvSupplier}
                  options={supplierOptions}
                  onAddNewOption={(newSup) => {
                    onQuickAddSupplier(newSup);
                    setPinvSupplier(newSup);
                  }}
                  placeholder="جستجو یا + افزودن تأمین‌کننده..."
                />

                {/* 2. Item Name */}
                <CreatableCombobox
                  label="۲. نام کالا / پارت خریداری‌شده *"
                  value={pinvItemName}
                  onChange={setPinvItemName}
                  options={itemNameOptions}
                  placeholder="مثلاً: سالت ویگاد ۳۰ میل یا پاد گیگ‌ویپ..."
                />

                {/* 3. Parent Tag */}
                <CreatableCombobox
                  label="۳. تگ اصلی کالا (Parent Tag)"
                  value={pinvParentTag}
                  onChange={setPinvParentTag}
                  options={masterOptions.tags}
                  onAddNewOption={(val) => onAddMasterOption('tags', val)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 4. Item Condition */}
                <CreatableCombobox
                  label="۴. وضعیت کالا (آکبند / استوک)"
                  value={pinvCondition}
                  onChange={setPinvCondition}
                  options={masterOptions.conditions}
                  onAddNewOption={(val) => onAddMasterOption('conditions', val)}
                />

                {/* 5. Item Type */}
                <CreatableCombobox
                  label="۵. نوع کالا (ویپ‌شاپ / قطعات کامپیوتر)"
                  value={pinvItemType}
                  onChange={setPinvItemType}
                  options={masterOptions.itemTypes}
                  onAddNewOption={(val) => onAddMasterOption('itemTypes', val)}
                />

                {/* 6. Total Quantity */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ۶. تعداد کل پارت خرید *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={pinvTotalQty}
                    onChange={(e) => setPinvTotalQty(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </div>

                {/* 7. Manual Unit Purchase Cost */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ۷. قیمت خرید واحد (دستی - ریال) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={pinvUnitCost}
                    onChange={(e) => setPinvUnitCost(e.target.value)}
                    placeholder="مثلاً: 420000"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* 8. Manual Discount Received */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ۸. تخفیف دریافتی از تامین‌کننده (ریال)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pinvDiscountReceived}
                    onChange={(e) => setPinvDiscountReceived(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </div>

                {/* 9. Auto Grand Total */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ۹. قیمت کل نهایی فاکتور (محاسبه خودکار)
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 font-black text-slate-900 tabular-nums">
                    {formatCurrency(computedPurchaseGrandTotal)} ریال
                  </div>
                </div>

                {/* 10. Delivery Status (رسیده / در راه) */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ۱۰. وضعیت تحویل بار
                  </label>
                  <select
                    value={pinvDeliveryStatus}
                    onChange={(e) =>
                      setPinvDeliveryStatus(
                        e.target.value as 'رسیده' | 'در راه (هنوز نرسیده)'
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white font-bold text-slate-900"
                  >
                    <option value="رسیده">رسیده (افزایش فوری موجودی انبار)</option>
                    <option value="در راه (هنوز نرسیده)">
                      در راه - هنوز نرسیده (ثبت مالی بدون افزایش موجودی قابل فروش)
                    </option>
                  </select>
                </div>

                {/* Target Warehouse */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    انبار مقصد ورود بار
                  </label>
                  <select
                    value={pinvWarehouseKey}
                    onChange={(e) => setPinvWarehouseKey(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white text-slate-900"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.key}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 11. Settlement & Supplier Debt Section */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="font-black text-slate-900">
                  ۱۱. بخش تسویه فاکتور خرید و ثبت تعهدی بدهی تجاری (متصل به CRM و تقویم عملیاتی)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      حساب پرداخت‌کننده
                    </label>
                    <select
                      value={pinvPaymentAccountCode}
                      onChange={(e) => setPinvPaymentAccountCode(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                    >
                      {LIQUIDITY_ACCOUNTS.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      مبلغ پرداختی نقد/کارت (ریال)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={computedPurchaseGrandTotal}
                      value={pinvPaidAmount}
                      onChange={(e) => setPinvPaidAmount(e.target.value)}
                      placeholder="0 = تمام نسیه"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      مانده بدهی تجاری (حساب ۲۱۰۱)
                    </label>
                    <div className="w-full rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 font-black text-rose-800 tabular-nums">
                      {formatCurrency(computedPurchaseUnpaidDebt)} ریال
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      تاریخ سررسید تسویه (یادآور تقویم)
                    </label>
                    <input
                      type="text"
                      value={pinvSettlementDueDate}
                      onChange={(e) => setPinvSettlementDueDate(e.target.value)}
                      placeholder="۱۴۰۴/۰۸/۲۵"
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      توضیحات پرداخت
                    </label>
                    <input
                      type="text"
                      value={pinvPaymentNotes}
                      onChange={(e) => setPinvPaymentNotes(e.target.value)}
                      placeholder="شماره پیگیری یا شرایط تسویه..."
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت قطعی فاکتور خرید (مرحله ۱) و ارسال به صف تفکیک انبار</span>
              </button>
            </form>
          </div>

          {/* Purchase Invoices History with Void Button & Mark Arrived */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <h4 className="text-sm font-black text-slate-900">
              فهرست فاکتورهای خرید ثبت‌شده ({purchaseInvoices.length} سند)
            </h4>
            {purchaseInvoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                هنوز فاکتور خریدی ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-2.5">
                {purchaseInvoices.map((pi) => (
                  <div
                    key={pi.id}
                    className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs ${
                      pi.docstatus === 2
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-slate-900">
                          {pi.billNo}
                        </span>
                        <span className="font-bold text-slate-800">
                          تأمین‌کننده: {pi.supplierName}
                        </span>
                        {pi.docstatus === 2 ? (
                          <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold">
                            باطل شد (Void)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            {pi.status}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            pi.deliveryStatus === 'در راه (هنوز نرسیده)'
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {pi.deliveryStatus || 'رسیده'}
                        </span>
                      </div>
                      <div className="text-slate-600">
                        {pi.itemsSummary} • جمع کل:{' '}
                        <span className="font-black text-slate-900 tabular-nums">
                          {maskCurrency(pi.totalAmount)}
                        </span>{' '}
                        • پرداخت‌شده:{' '}
                        <span className="font-bold text-emerald-700 tabular-nums">
                          {maskCurrency(pi.paidAmount ?? 0)}
                        </span>
                        {pi.settlementDueDate && (
                          <span className="mr-2 text-rose-700 font-bold">
                            • سررسید تسویه: {pi.settlementDueDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {pi.docstatus === 1 && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {pi.deliveryStatus === 'در راه (هنوز نرسیده)' &&
                          onMarkPurchaseArrived && (
                            <button
                              type="button"
                              onClick={() => onMarkPurchaseArrived(pi.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 text-white font-bold hover:bg-sky-700"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>تایید رسیدن بار به انبار</span>
                            </button>
                          )}
                        {!pi.skuBreakdownCompleted && (
                          <button
                            type="button"
                            onClick={() => onNavigateToInventoryBreakdown(pi.billNo)}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700"
                          >
                            تفکیک طعم/رنگ (مرحله ۲)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onCancelPurchaseInvoice(pi.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white font-bold hover:bg-rose-700"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>ابطال سند (Void)</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 5 & 12: READ-ONLY SALES INVOICES ARCHIVE + VOID (فقط خواندنی + ابطال سند)
         ===================================================================== */}
      {activeSubTab === 'sales_invoice' && (
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-800" />
                <h3 className="text-base font-black text-slate-900">
                  آرشیو و گزارش فاکتورهای فروش (حالت فقط خواندنی — Read-Only)
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                صدور فاکتور فروش جدید منحصراً از طریق «صندوق فروشگاهی (POS)» انجام می‌شود. حذف فیزیکی فاکتورها ممنوع است و تنها از طریق دکمه «ابطال سند (Void)» با ثبت سند معکوس خودکار امکان‌پذیر است.
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToPos}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shrink-0"
            >
              <span>رفتن به صندوق فروشگاهی (POS) برای ثبت فروش</span>
              <ArrowUpLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="text-xs font-black text-slate-800">
              فهرست کامل فاکتورهای فروش ({salesInvoices.length} سند)
            </div>
            <div className="space-y-2.5 max-h-[560px] overflow-y-auto">
              {salesInvoices.map((inv) => {
                const isVoided = inv.docstatus === 2 || inv.status === 'ابطال‌شده';
                return (
                  <div
                    key={inv.id}
                    className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs ${
                      isVoided
                        ? 'bg-rose-50/50 border-rose-200'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-black text-slate-900">
                          {inv.invoiceNo}
                        </span>
                        <span className="font-bold text-slate-800">{inv.customerName}</span>
                        {isVoided ? (
                          <span className="px-2.5 py-0.5 rounded-md bg-rose-600 text-white font-black">
                            باطل شد (Void)
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
                            {inv.status}
                          </span>
                        )}
                        {inv.pricingMode && (
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                            {inv.pricingMode === 'festival'
                              ? 'فروش جشنواره'
                              : inv.pricingMode === 'reseller'
                              ? 'فروش همکاری (ریسلر)'
                              : 'فروش عادی'}
                          </span>
                        )}
                        {inv.isHistoricalArchive && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            آرشیو تاریخی کلودی شاپ
                          </span>
                        )}
                      </div>
                      <div className="text-slate-600">
                        تاریخ: {inv.date} • اقلام: {inv.itemsSummary} • مبلغ کل:{' '}
                        <span className="font-black text-slate-900 tabular-nums">
                          {maskCurrency(inv.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {!isVoided && !inv.isHistoricalArchive && (
                      <button
                        type="button"
                        onClick={() => onCancelSalesInvoice(inv.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 shrink-0"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>ابطال سند (Void و برگشت کالا به انبار)</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
