import React, { useState } from 'react';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ChevronDown,
  ChevronLeft,
  FileText,
  XCircle,
  RotateCcw,
  CreditCard,
  Coins,
} from 'lucide-react';
import {
  AccountNode,
  GLEntryRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  PaymentEntryRecord,
  ChequeRecord,
  CostCenterRecord,
  FixedAssetRecord,
  ShareholderRecord,
  InventoryItemRecord,
  InvoiceLineItem,
  DocStatus,
} from '../data/erpSeedData';
import {
  formatCurrency,
  formatPersianDate,
  getPersianYear,
  addDaysToDate,
  validateJournalEntry,
  calculateInstallments,
  evaluateBudgetControl,
  allocateCostCenterExpense,
  calculateFinancialStatements,
  computeMultiLineInvoiceTotals,
  computeTrialBalance6Col,
  checkRolePermission,
  formatVoucherType,
  stripEnglishTerms,
  SystemRole,
  JournalLine,
} from '../utils/erpEngine';

export type AccountingSubTab =
  | 'coa'
  | 'gl_trial'
  | 'statements'
  | 'journal'
  | 'sales_invoice'
  | 'purchase_invoice'
  | 'payment_cheques'
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
  onCreateSalesInvoice: (inv: SalesInvoiceRecord) => boolean;
  onSubmitSalesInvoice: (id: string) => void;
  onCancelSalesInvoice: (id: string) => void;
  onCreateCreditNote: (id: string) => void;
  purchaseInvoices: PurchaseInvoiceRecord[];
  onCreatePurchaseInvoice: (pinv: PurchaseInvoiceRecord) => boolean;
  onSubmitPurchaseInvoice: (id: string) => void;
  onCancelPurchaseInvoice: (id: string) => void;
  onCreateDebitNote: (id: string) => void;
  paymentEntries: PaymentEntryRecord[];
  onCreatePaymentEntry: (pe: PaymentEntryRecord) => void;
  onCancelPaymentEntry: (id: string) => void;
  cheques: ChequeRecord[];
  onClearCheque: (id: string) => void;
  costCenters: CostCenterRecord[];
  onUpdateCostCenterPolicy: (id: string, policy: 'WARN' | 'STOP') => void;
  fixedAssets: FixedAssetRecord[];
  onScrapOrSellAsset: (id: string, newStatus: FixedAssetRecord['status']) => void;
  shareholders: ShareholderRecord[];
  inventoryItems: InventoryItemRecord[];
  onShowToast: (msg: string) => void;
}

export const AccountingModule: React.FC<AccountingModuleProps> = ({
  productionMode,
  activeRole,
  defaultBranch,
  activeFiscalYear,
  initialSubTab = 'coa',
  accounts,
  onAddAccount,
  glEntries,
  journalEntries,
  onSaveJournalEntry,
  onSubmitJournalEntry,
  onCancelJournalEntry,
  salesInvoices,
  onCreateSalesInvoice,
  onSubmitSalesInvoice,
  onCancelSalesInvoice,
  onCreateCreditNote,
  purchaseInvoices,
  onCreatePurchaseInvoice,
  onSubmitPurchaseInvoice,
  onCancelPurchaseInvoice,
  onCreateDebitNote,
  paymentEntries,
  onCreatePaymentEntry,
  onCancelPaymentEntry,
  cheques,
  onClearCheque,
  costCenters,
  onUpdateCostCenterPolicy,
  fixedAssets,
  onScrapOrSellAsset,
  shareholders,
  inventoryItems,
  onShowToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>(initialSubTab);

  React.useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);

  // Chart of Accounts Tree State
  const [selectedCategory, setSelectedCategory] = useState<string>('همه');
  const [collapsedCodes, setCollapsedCodes] = useState<string[]>([]);
  const [showNewAccForm, setShowNewAccForm] = useState(false);
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccCat, setNewAccCat] = useState<AccountNode['category']>('دارایی');
  const [newAccLevel, setNewAccLevel] = useState<AccountNode['level']>('معین');
  const [newAccParentCode, setNewAccParentCode] = useState<string>('1100');

  // General Ledger & Trial Balance State
  const [trialBalanceLevel, setTrialBalanceLevel] = useState<'گروه' | 'کل' | 'معین'>('معین');
  const [glFilterAccount, setGlFilterAccount] = useState<string>('همه حساب‌ها');
  const [glFilterBranch, setGlFilterBranch] = useState<string>('همه شعب سازمان');
  const [glFilterVoucherType, setGlFilterVoucherType] = useState<string>('همه اسناد');

  // Multi-Currency Revaluation State (حسابداری چندارزی و تسعیر ارز)
  const [fxCurrency, setFxCurrency] = useState<'دلار آمریکا' | 'درهم امارات' | 'یوان چین' | 'تتر'>('دلار آمریکا');
  const [fxBalanceAmount, setFxBalanceAmount] = useState(0);
  const [fxBookRate, setFxBookRate] = useState(0);
  const [fxCurrentRate, setFxCurrentRate] = useState(0);

  // Journal Entry Form State
  const [jeTitle, setJeTitle] = useState('');
  const [jeLines, setJeLines] = useState<JournalLine[]>([]);

  // Multi-Line Sales Invoice Modal State
  const [showNewSalesModal, setShowNewSalesModal] = useState(false);
  const [invCustomer, setInvCustomer] = useState('');
  const [invBranch, setInvBranch] = useState(defaultBranch);
  const [invCostCenter, setInvCostCenter] = useState('');
  const [invChannel, setInvChannel] = useState('');
  const [invTermsType, setInvTermsType] = useState<'cash' | 'installment3' | 'subscription'>('cash');
  const [invUpdateStock, setInvUpdateStock] = useState(true);
  const [invDocStatusMode, setInvDocStatusMode] = useState<DocStatus>(1);
  const [salesLines, setSalesLines] = useState<InvoiceLineItem[]>([]);

  // Multi-Line Purchase Invoice Form State
  const [showNewPurchaseForm, setShowNewPurchaseForm] = useState(false);
  const [pinvSupplier, setPinvSupplier] = useState('');
  const [pinvWarehouse, setPinvWarehouse] = useState('');
  const [pinvBranch] = useState('');
  const [pinvLandedCost, setPinvLandedCost] = useState(0);
  const [pinvDocStatusMode, setPinvDocStatusMode] = useState<DocStatus>(1);
  const [purchaseLines, setPurchaseLines] = useState<InvoiceLineItem[]>([]);

  // Payment Entry Form State
  const [showNewPaymentForm, setShowNewPaymentForm] = useState(false);
  const [payType, setPayType] = useState<PaymentEntryRecord['paymentType']>(
    'دریافت از مشتری (Receive)'
  );
  const [payRefVoucher, setPayRefVoucher] = useState('');
  const [payParty, setPayParty] = useState('');
  const [payMode, setPayMode] = useState<PaymentEntryRecord['modeOfPayment']>('حواله بانکی پایا/ساتنا');
  const [payBankCode, setPayBankCode] = useState('110101');
  const [payAmount, setPayAmount] = useState(0);

  // Document Form View (Inspector Drawer/Modal) State
  const [selectedDocView, setSelectedDocView] = useState<
    | { type: 'sales'; doc: SalesInvoiceRecord }
    | { type: 'purchase'; doc: PurchaseInvoiceRecord }
    | { type: 'journal'; doc: JournalEntryRecord }
    | null
  >(null);

  // Budget & Cost Center Simulator State
  const [sharedBillAmount, setSharedBillAmount] = useState(0);
  const [testBudgetCenterId, setTestBudgetCenterId] = useState('');
  const [testExpenseInput, setTestExpenseInput] = useState(0);

  const postableAccounts = accounts.filter(
    (account) =>
      account.level !== 'گروه' &&
      !accounts.some((candidate) => candidate.parentCode === account.code)
  );
  const parentableAccounts = accounts.filter((a) => a.level !== 'تفصیلی');

  // Helper: Tree visibility check
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

  // Multi-Line Sales Invoice live calculation (Tax Completely Removed)
  const salesCalc = computeMultiLineInvoiceTotals(salesLines);
  const installmentPreview = calculateInstallments(salesCalc.grandTotal, [
    { label: 'پیش‌پرداخت نقد (۳۰٪)', percentage: 30, dueDays: 0 },
    { label: 'قسط اول - یک ماهه (۳۵٪)', percentage: 35, dueDays: 30 },
    { label: 'قسط دوم - دو ماهه (۳۵٪)', percentage: 35, dueDays: 60 },
  ]);

  // Multi-Line Purchase Invoice live calculation (Purchase Goods + Landed Cost)
  const purchaseGoodsCalc = computeMultiLineInvoiceTotals(purchaseLines);
  const totalPurchaseCommitment = purchaseGoodsCalc.netTotal + pinvLandedCost;

  // Journal validation
  const journalValidation = validateJournalEntry(
    jeLines,
    new Set(postableAccounts.map((account) => account.code))
  );

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
    onShowToast(`سرفصل حساب «${newAccName}» زیرمجموعه کد ${newAccParentCode} اضافه شد.`);
  };

  const handleCreateSalesInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invCustomer.trim() || salesLines.length === 0 || salesCalc.grandTotal <= 0) {
      onShowToast('نام مشتری و حداقل یک ردیف با مبلغ معتبر برای فاکتور لازم است.');
      return;
    }

    const summary = salesLines
      .map((l) => `${l.qty} ${l.uom} ${l.itemName}`)
      .join(' + ');
    const postingDate = new Date();
    const dueDate = addDaysToDate(postingDate, invTermsType === 'cash' ? 0 : 60);

    const newInv: SalesInvoiceRecord = {
      id: `sinv-${Date.now()}`,
      invoiceNo: `SINV-${getPersianYear()}-${String(111 + salesInvoices.length).padStart(4, '0')}`,
      docstatus: invDocStatusMode,
      customerName: invCustomer,
      date: formatPersianDate(postingDate),
      dueDate: formatPersianDate(dueDate),
      branchDimension: invBranch,
      costCenter: invCostCenter,
      channelDimension: invChannel,
      paymentTermsTemplate:
        invTermsType === 'cash'
          ? 'تسویه نقد در لحظه'
          : invTermsType === 'installment3'
            ? '۳۰٪ نقد، ۳۵٪ یک ماهه، ۳۵٪ دو ماهه'
            : 'اشتراک خودکار ماهانه',
      updateStock: invUpdateStock,
      isSubscription: invTermsType === 'subscription',
      subscriptionInterval: invTermsType === 'subscription' ? 'ماهانه' : undefined,
      status:
        invDocStatusMode === 0
          ? 'پیش‌نویس'
          : invTermsType === 'cash'
            ? 'پرداخت‌شده'
            : 'اقساطی فعال',
      totalAmount: salesCalc.grandTotal,
      paidAmount:
        invDocStatusMode === 0
          ? 0
          : invTermsType === 'cash'
            ? salesCalc.grandTotal
            : Math.round(salesCalc.grandTotal * 0.3),
      cogsAmount: salesCalc.totalCogs,
      itemsSummary: summary,
      lines: salesLines,
    };

    if (onCreateSalesInvoice(newInv)) {
      setShowNewSalesModal(false);
    }
  };

  const handleCreatePurchaseInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinvSupplier.trim() || purchaseLines.length === 0 || totalPurchaseCommitment <= 0) {
      onShowToast('نام تامین‌کننده و حداقل یک ردیف خرید با مبلغ معتبر لازم است.');
      return;
    }

    const summary = purchaseLines
      .map((l) => `${l.qty} ${l.uom} ${l.itemName}`)
      .join(' + ');
    const postingDate = formatPersianDate();

    const newPinv: PurchaseInvoiceRecord = {
      id: `pinv-${Date.now()}`,
      billNo: `PINV-${getPersianYear()}-${String(91 + purchaseInvoices.length).padStart(4, '0')}`,
      docstatus: pinvDocStatusMode,
      supplierName: pinvSupplier,
      date: postingDate,
      warehouse: pinvWarehouse,
      branchDimension: pinvBranch,
      costCenter: 'انبار مرکزی و لجستیک کهریزک',
      status: pinvDocStatusMode === 0 ? 'پیش‌نویس' : 'بدهکار باز',
      totalAmount: totalPurchaseCommitment,
      paidAmount: 0,
      landedCostAdded: pinvLandedCost,
      itemsSummary: summary,
      lines: purchaseLines,
    };

    if (onCreatePurchaseInvoice(newPinv)) {
      setShowNewPurchaseForm(false);
    }
  };

  const handleCreatePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(payAmount) || payAmount <= 0 || !payParty.trim() || !payRefVoucher) {
      onShowToast('مبلغ، طرف حساب و فاکتور مرجع را برای ثبت تسویه بررسی کنید.');
      return;
    }
    const newPe: PaymentEntryRecord = {
      id: `pay-${Date.now()}`,
      paymentNo: `ACC-PAY-${getPersianYear()}-${String(43 + paymentEntries.length).padStart(4, '0')}`,
      postingDate: formatPersianDate(),
      docstatus: 1,
      paymentType: payType,
      partyName: payParty,
      modeOfPayment: payMode,
      bankAccountCode: payBankCode,
      referenceVoucherNo: payRefVoucher,
      amount: payAmount,
      branchDimension: defaultBranch !== 'همه شعب سازمان' ? defaultBranch : 'شعبه مرکزی تهران',
      costCenter: costCenters[0]?.name || 'فروشگاه و شوروم شعبه الهیه',
    };
    onCreatePaymentEntry(newPe);
    setShowNewPaymentForm(false);
  };

  const openQuickPaymentForInvoice = (
    type: 'دریافت از مشتری (Receive)' | 'پرداخت به تامین‌کننده (Pay)',
    voucherNo: string,
    party: string,
    outstanding: number
  ) => {
    setPayType(type);
    setPayRefVoucher(voucherNo);
    setPayParty(party);
    setPayAmount(outstanding);
    setSelectedDocView(null);
    setActiveSubTab('payment_cheques');
    setShowNewPaymentForm(true);
  };

  const renderDocStatusBadge = (docstatus: DocStatus) => {
    if (docstatus === 0) {
      return (
        <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-amber-50 text-amber-800 border border-amber-200">
          پیش‌نویس
        </span>
      );
    }
    if (docstatus === 1) {
      return (
        <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200">
          ثبت قطعی
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[11px] font-medium rounded-md bg-rose-50 text-rose-800 border border-rose-200">
        ابطال‌شده
      </span>
    );
  };

  const selectedBudgetCenter =
    costCenters.find((c) => c.id === testBudgetCenterId) || costCenters[0];
  const budgetEval = selectedBudgetCenter
    ? evaluateBudgetControl(
        selectedBudgetCenter.allocatedBudget,
        selectedBudgetCenter.spentAmount,
        testExpenseInput,
        selectedBudgetCenter.controlPolicy
      )
    : null;

  const sharedExpenseAllocations = allocateCostCenterExpense(
    sharedBillAmount,
    costCenters.map((c) => ({
      costCenterName: c.name,
      percentage: c.autoAllocationPercent,
    }))
  );

  const fxGainLoss = fxBalanceAmount * (fxCurrentRate - fxBookRate);

  const subTabs: { id: AccountingSubTab; label: string }[] = [
    { id: 'coa', label: 'درخت حساب‌ها' },
    { id: 'gl_trial', label: 'دفتر کل و تراز آزمایشی' },
    { id: 'statements', label: 'صورت‌های مالی و راس‌گیری' },
    { id: 'journal', label: 'اسناد روزنامه' },
    { id: 'sales_invoice', label: 'فاکتورهای فروش' },
    { id: 'purchase_invoice', label: 'فاکتورهای خرید' },
    { id: 'payment_cheques', label: 'خزانه‌داری، چک و ارز' },
    { id: 'budget', label: 'مراکز هزینه و بودجه' },
    { id: 'assets', label: 'دارایی ثابت و سهامداران' },
  ];

  return (
    <div className="space-y-6">
      {/* Module Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            حسابداری و مدیریت مالی
          </h2>
          <p className="text-sm text-slate-500">
            دفاتر کل، اسناد روزنامه دوبل، چرخه مالی فروش و خرید، خزانه‌داری، مراکز هزینه و دارایی‌های ثابت
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowNewSalesModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>صدور فاکتور فروش جدید</span>
          </button>
        </div>
      </div>

      {/* 9 Accounting Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl">
        {subTabs.map((tab) => {
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          TAB 1: CHART OF ACCOUNTS (درخت حساب‌ها)
         ===================================================================== */}
      {activeSubTab === 'coa' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                درختواره حساب‌ها
              </h3>
              <p className="text-xs text-slate-500">
                سرفصل‌های حسابداری در سطوح گروه، کل، معین و تفصیلی به تفکیک ۵ دسته اصلی
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCollapsedCodes([])}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                باز کردن همه
              </button>
              <button
                type="button"
                onClick={() =>
                  setCollapsedCodes(accounts.filter((a) => a.level === 'کل').map((a) => a.code))
                }
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                جمع کردن سطح کل
              </button>
              <button
                type="button"
                onClick={() => setShowNewAccForm(!showNewAccForm)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                + تعریف سرفصل جدید
              </button>
            </div>
          </div>

          {showNewAccForm && (
            <form
              onSubmit={handleAddAccountSubmit}
              className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-6 gap-3 items-end text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">کد حساب</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً 1105"
                  value={newAccCode}
                  onChange={(e) => setNewAccCode(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">عنوان سرفصل حسابداری</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً تنخواه گردان شعبه الهیه"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">طبقه و سطح</label>
                <div className="flex gap-1">
                  <select
                    aria-label="طبقه اصلی حساب"
                    value={newAccCat}
                    onChange={(e) => setNewAccCat(e.target.value as AccountNode['category'])}
                    className="w-1/2 px-2 py-1.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="دارایی">دارایی</option>
                    <option value="بدهی">بدهی</option>
                    <option value="سرمایه">سرمایه</option>
                    <option value="درآمد">درآمد</option>
                    <option value="هزینه">هزینه</option>
                  </select>
                  <select
                    aria-label="سطح حساب"
                    value={newAccLevel}
                    onChange={(e) => setNewAccLevel(e.target.value as AccountNode['level'])}
                    className="w-1/2 px-2 py-1.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="گروه">گروه</option>
                    <option value="کل">کل</option>
                    <option value="معین">معین</option>
                    <option value="تفصیلی">تفصیلی</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  حساب مادر
                </label>
                <select
                  aria-label="انتخاب حساب مادر"
                  disabled={newAccLevel === 'گروه'}
                  value={newAccParentCode}
                  onChange={(e) => setNewAccParentCode(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg disabled:opacity-50"
                >
                  {parentableAccounts.map((pa) => (
                    <option key={pa.id} value={pa.code}>
                      {pa.code} — {pa.name} ({pa.level})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 whitespace-nowrap"
              >
                ذخیره در درخت حساب‌ها
              </button>
            </form>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {['همه', 'دارایی', 'بدهی', 'سرمایه', 'درآمد', 'هزینه'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-3 font-semibold">کدینگ حساب</th>
                  <th className="py-2.5 px-3 font-semibold">نام سرفصل حساب (درختواره)</th>
                  <th className="py-2.5 px-3 font-semibold">حساب مادر</th>
                  <th className="py-2.5 px-3 font-semibold">دسته · سطح</th>
                  <th className="py-2.5 px-3 font-semibold text-left">مانده اول دوره</th>
                  <th className="py-2.5 px-3 font-semibold text-left">مانده واقعی دفتر کل (تومان)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {accounts.filter(isAccountVisibleInTree).map((acc) => {
                  const isParent = hasChildren(acc.code);
                  const isCollapsed = collapsedCodes.includes(acc.code);
                  const indentClass =
                    acc.level === 'گروه'
                      ? 'font-bold text-slate-900'
                      : acc.level === 'کل'
                        ? 'pr-6 font-semibold text-slate-800'
                        : acc.level === 'معین'
                          ? 'pr-12 text-slate-700'
                          : 'pr-18 text-slate-600';
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/90 transition-colors">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                        {acc.code}
                      </td>
                      <td className={`py-2.5 px-3 ${indentClass}`}>
                        <div className="inline-flex items-center gap-1.5">
                          {isParent ? (
                            <button
                              type="button"
                              onClick={() => toggleCollapseCode(acc.code)}
                              className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
                              title={isCollapsed ? 'باز کردن زیرشاخه' : 'بستن زیرشاخه'}
                            >
                              {isCollapsed ? (
                                <ChevronLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-4 inline-block text-slate-300">•</span>
                          )}
                          <span>{acc.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">
                        {acc.parentCode || 'ریشه اصلی'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        <span>{acc.category}</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>سطح {acc.level}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-slate-500">
                        {formatCurrency(acc.openingBalance ?? 0)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-left text-slate-900">
                        {formatCurrency(acc.balance)}
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
          TAB 2: GENERAL LEDGER & 6-COL TRIAL BALANCE (دفتر کل و تراز آزمایشی ۶ ستونی)
         ===================================================================== */}
      {activeSubTab === 'gl_trial' && (() => {
        const normalizeDigits = (value: string) =>
          value.replace(/[۰-۹٠-٩]/g, (digit) => {
            const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
            const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
            const persianIndex = persianDigits.indexOf(digit);
            return String(persianIndex >= 0 ? persianIndex : arabicDigits.indexOf(digit));
          });
        const selectedFiscalYear = normalizeDigits(activeFiscalYear).match(/\d{4}/)?.[0];
        const tb = computeTrialBalance6Col(
          accounts,
          trialBalanceLevel,
          glEntries,
          glFilterBranch,
          activeFiscalYear
        );
        const filteredGLEntries = glEntries.filter((g) => {
          const entryYear = normalizeDigits(g.postingDate).match(/\d{4}/)?.[0];
          if (selectedFiscalYear && entryYear !== selectedFiscalYear) return false;
          if (glFilterAccount !== 'همه حساب‌ها' && g.accountCode !== glFilterAccount) return false;
          if (glFilterBranch !== 'همه شعب سازمان' && g.branchDimension !== glFilterBranch)
            return false;
          if (glFilterVoucherType !== 'همه اسناد' && g.voucherType !== glFilterVoucherType)
            return false;
          return true;
        });

        return (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    تراز آزمایشی ۶ ستونی استاندارد و ابعاد حسابداری
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    گزارش‌گیری متقاطع بر اساس سطح حساب (گروه، کل، معین) و ابعاد تحلیلی (شعبه، کانال فروش و مرکز هزینه)
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-500">سطح گزارش تراز:</span>
                  {(['گروه', 'کل', 'معین'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setTrialBalanceLevel(lvl)}
                      className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        trialBalanceLevel === lvl
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      سطح {lvl}
                    </button>
                  ))}
                  <select
                    aria-label="فیلتر شعبه در تراز آزمایشی"
                    value={glFilterBranch}
                    onChange={(e) => setGlFilterBranch(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                  >
                    <option value="همه شعب سازمان">همه شعب سازمان (کل شرکت)</option>
                    <option value="شعبه مرکزی تهران">فقط گردش شعبه مرکزی تهران</option>
                    <option value="شعبه الهیه">فقط گردش شعبه الهیه</option>
                    <option value="انبار مرکزی کهریزک">فقط گردش انبار مرکزی کهریزک</option>
                  </select>
                </div>
              </div>

              {!tb.hasBranchOpeningBalance && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  مانده اول دوره شعبه فقط از آرتیکل‌های دفترکلِ سال‌های قبل محاسبه می‌شود. مانده افتتاحیه تفکیکی شعبه در داده‌های فعلی ثبت نشده است؛ برای تراز قطعی شعبه باید افتتاحیه‌های شعبه نیز وارد شوند.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-2.5 px-3">کد حساب</th>
                      <th className="py-2.5 px-3">نام سرفصل ({trialBalanceLevel})</th>
                      <th className="py-2.5 px-3 text-left">مانده اول دوره (بدهکار)</th>
                      <th className="py-2.5 px-3 text-left">مانده اول دوره (بستانکار)</th>
                      <th className="py-2.5 px-3 text-left">گردش بدهکار دوره</th>
                      <th className="py-2.5 px-3 text-left">گردش بستانکار دوره</th>
                      <th className="py-2.5 px-3 text-left">مانده نهایی بدهکار</th>
                      <th className="py-2.5 px-3 text-left">مانده نهایی بستانکار</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tb.rows.map((r) => (
                      <tr key={r.code} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-slate-600">{r.code}</td>
                        <td className="py-2 px-3 font-medium text-slate-900">
                          {r.name}{' '}
                          <span className="text-[11px] text-slate-400">({r.category})</span>
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-left text-slate-600">
                          {formatCurrency(r.openingDebit)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-left text-slate-600">
                          {formatCurrency(r.openingCredit)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-left text-emerald-700">
                          {formatCurrency(r.periodDebit)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-left text-indigo-700">
                          {formatCurrency(r.periodCredit)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums font-semibold text-left text-slate-900">
                          {formatCurrency(r.closingDebit)}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums font-semibold text-left text-slate-900">
                          {formatCurrency(r.closingCredit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
                      <td colSpan={2} className="py-3 px-3">
                        جمع کل تراز آزمایشی (سطح {trialBalanceLevel}) —{' '}
                        <span className="text-emerald-700">
                          {tb.totals.isBalanced ? 'تراز کامل (بدهکار = بستانکار)' : 'اختلاف تراز'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-left">
                        {formatCurrency(tb.totals.openingDebit)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-left">
                        {formatCurrency(tb.totals.openingCredit)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-left text-emerald-700">
                        {formatCurrency(tb.totals.periodDebit)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-left text-indigo-700">
                        {formatCurrency(tb.totals.periodCredit)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-left text-slate-950">
                        {formatCurrency(tb.totals.closingDebit)}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-left text-slate-950">
                        {formatCurrency(tb.totals.closingCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Real General Ledger Report (GL Entries Table) */}
            <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    گزارش ریز گردش دفتر کل
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    تمامی آرتیکل‌های صادرشده از فاکتورهای فروش، بهای تمام‌شده، فاکتورهای خرید، اسناد روزنامه و دریافت و پرداخت‌ها
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    aria-label="فیلتر حساب در دفتر کل"
                    value={glFilterAccount}
                    onChange={(e) => setGlFilterAccount(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="همه حساب‌ها">همه حساب‌ها</option>
                    {postableAccounts.map((a) => (
                      <option key={a.id} value={a.code}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="فیلتر نوع سند در دفتر کل"
                    value={glFilterVoucherType}
                    onChange={(e) => setGlFilterVoucherType(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                  >
                    <option value="همه اسناد">همه انواع اسناد</option>
                    <option value="Sales Invoice">فاکتور فروش و بهای تمام‌شده</option>
                    <option value="Purchase Invoice">فاکتور خرید و هزینه‌های گمرک</option>
                    <option value="Journal Entry">سند حسابداری روزنامه</option>
                    <option value="Payment Entry">سند دریافت و پرداخت خزانه</option>
                    <option value="POS Invoice">فیش صندوق فروشگاهی</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-2.5 px-3">تاریخ</th>
                      <th className="py-2.5 px-3">نوع و شماره سند</th>
                      <th className="py-2.5 px-3">کد و نام حساب</th>
                      <th className="py-2.5 px-3">طرف حساب</th>
                      <th className="py-2.5 px-3">شعبه · مرکز هزینه</th>
                      <th className="py-2.5 px-3 text-left">بدهکار (تومان)</th>
                      <th className="py-2.5 px-3 text-left">بستانکار (تومان)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredGLEntries.map((g) => (
                      <tr
                        key={g.id}
                        className={`hover:bg-slate-50 ${
                          g.isCancelled &&
                          !g.isReversal &&
                          !/سند معکوس|ابطال سند/.test(g.remarks || '')
                            ? 'opacity-50 line-through'
                            : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-slate-500">{g.postingDate}</td>
                        <td className="py-2 px-3 font-mono">
                          <span className="font-semibold text-slate-900">{g.voucherNo}</span>
                          {(g.isReversal ||
                            (g.isCancelled && /سند معکوس|ابطال سند/.test(g.remarks || ''))) && (
                            <span className="mr-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-800">
                              آرتیکل معکوس
                            </span>
                          )}
                          <div className="text-[11px] text-slate-400 font-sans">
                            {formatVoucherType(g.voucherType)}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-slate-500 ml-1.5">{g.accountCode}</span>
                          <span className="font-medium text-slate-900">{g.accountName}</span>
                          {g.remarks && (
                            <div className="text-[11px] text-slate-400 mt-0.5">{g.remarks}</div>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {g.partyName || '—'}
                          {g.partyType && g.partyType !== '—' && (
                            <span className="text-[11px] text-slate-400 mr-1">({g.partyType})</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-500">
                          <div>{g.branchDimension}</div>
                          <div className="text-[11px] text-slate-400">{g.costCenter}</div>
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums font-semibold text-left text-emerald-700">
                          {g.debit > 0 ? formatCurrency(g.debit) : '۰'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums font-semibold text-left text-indigo-700">
                          {g.credit > 0 ? formatCurrency(g.credit) : '۰'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          TAB 3: FINANCIAL STATEMENTS, CASH FLOW & AGING REPORT (صورت‌های مالی، جریان وجوه نقد و راس‌گیری)
         ===================================================================== */}
      {activeSubTab === 'statements' && (() => {
        const fin = calculateFinancialStatements(accounts);
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="text-xs text-slate-400">صورت سود و زیان دوره</div>
                <div className="text-sm font-bold text-slate-900">
                  درآمد کل عملیاتی: <span className="font-mono">{formatCurrency(fin.totalRevenue)}</span> تومان
                </div>
                <div className="text-xs text-rose-700">
                  بهای تمام‌شده و هزینه‌ها: <span className="font-mono">-{formatCurrency(fin.totalExpenses)}</span> تومان
                </div>
                <div className="pt-2 border-t border-slate-100 text-sm font-bold text-emerald-700">
                  سود خالص دوره: <span className="font-mono">{formatCurrency(fin.netProfit)}</span> تومان
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="text-xs text-slate-400">ترازنامه (دارایی‌ها)</div>
                <div className="text-sm font-bold text-slate-900">
                  جمع کل دارایی‌ها: <span className="font-mono">{formatCurrency(fin.totalAssets)}</span> تومان
                </div>
                <div className="text-xs text-slate-500">
                  شامل نقد و بانک، حساب‌های دریافتنی، موجودی انبار و اموال ثابت
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-2">
                <div className="text-xs text-slate-400">معادله اساسی حسابداری (بدهی + سرمایه + سود)</div>
                <div className="text-xs text-slate-700">
                  بدهی‌ها (<span className="font-mono">{formatCurrency(fin.totalLiabilities)}</span>) + سرمایه (<span className="font-mono">{formatCurrency(fin.totalEquity)}</span>) + سود دوره (<span className="font-mono">{formatCurrency(fin.netProfit)}</span>)
                </div>
                <div className="pt-2 border-t border-slate-100 text-sm font-bold text-slate-900">
                  جمع سمت چپ ترازنامه: <span className="font-mono">{formatCurrency(fin.equityPlusLiabilitiesAndProfit)}</span> تومان ({fin.isBalanceSheetBalanced ? 'تراز کامل' : 'نیاز به بررسی'})
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
              گزارش جریان نقد و سن مطالبات/بدهی پس از ثبت اسناد واقعی در دسترس خواهد بود.
            </div>
          </div>
        );
      })()}

      {/* =====================================================================
          TAB 4: JOURNAL ENTRY (اسناد روزنامه دوبل)
         ===================================================================== */}
      {activeSubTab === 'journal' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ثبت سند حسابداری روزنامه دوبل
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ثبت اسناد دستی دوبل برای تسویه‌ها، تهاترها، انتقال بین حساب‌ها و برداشت یا واریز شرکا
                </p>
              </div>
            </div>

            <div className="max-w-md">
              <label className="block text-xs font-medium text-slate-700 mb-1">عنوان و شرح کلی سند روزنامه</label>
              <input
                type="text"
                value={jeTitle}
                onChange={(e) => setJeTitle(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-2">سرفصل حساب (معین / تفصیلی / کل)</th>
                    <th className="py-2.5 px-2">نوع و نام طرف حساب</th>
                    <th className="py-2.5 px-2">مرکز هزینه و شعبه</th>
                    <th className="py-2.5 px-2">شرح آرتیکل</th>
                    <th className="py-2.5 px-2">بدهکار (تومان)</th>
                    <th className="py-2.5 px-2">بستانکار (تومان)</th>
                    <th className="py-2.5 px-2 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {jeLines.map((line, idx) => (
                    <tr key={line.id}>
                      <td className="py-2 px-2">
                        <select
                          aria-label={`انتخاب حساب ردیف ${idx + 1}`}
                          value={line.accountCode}
                          onChange={(e) => {
                            const accObj = accounts.find((a) => a.code === e.target.value);
                            const updated = [...jeLines];
                            updated[idx] = {
                              ...line,
                              accountCode: e.target.value,
                              accountName: accObj?.name || '',
                            };
                            setJeLines(updated);
                          }}
                          className="w-56 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                        >
                          {postableAccounts.map((acc) => (
                            <option key={acc.id} value={acc.code}>
                              {acc.code} — {acc.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          <select
                            aria-label={`نوع طرف حساب ردیف ${idx + 1}`}
                            value={line.partyType || '—'}
                            onChange={(e) => {
                              const updated = [...jeLines];
                              updated[idx] = {
                                ...line,
                                partyType: e.target.value as JournalLine['partyType'],
                              };
                              setJeLines(updated);
                            }}
                            className="w-24 px-1.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                          >
                            <option value="—">—</option>
                            <option value="مشتری">مشتری</option>
                            <option value="تامین‌کننده">تامین‌کننده</option>
                            <option value="سهامدار">سهامدار</option>
                          </select>
                          <input
                            type="text"
                            placeholder="نام طرف حساب..."
                            value={line.partyName || ''}
                            onChange={(e) => {
                              const updated = [...jeLines];
                              updated[idx] = { ...line, partyName: e.target.value };
                              setJeLines(updated);
                            }}
                            className="w-32 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex gap-1">
                          <select
                            aria-label={`مرکز هزینه ردیف ${idx + 1}`}
                            value={line.costCenter || costCenters[0]?.name}
                            onChange={(e) => {
                              const updated = [...jeLines];
                              updated[idx] = { ...line, costCenter: e.target.value };
                              setJeLines(updated);
                            }}
                            className="w-36 px-1.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                          >
                            {costCenters.map((cc) => (
                              <option key={cc.id} value={cc.name}>
                                {cc.name}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`شعبه ردیف ${idx + 1}`}
                            value={line.dimensionBranch || 'شعبه مرکزی تهران'}
                            onChange={(e) => {
                              const updated = [...jeLines];
                              updated[idx] = { ...line, dimensionBranch: e.target.value };
                              setJeLines(updated);
                            }}
                            className="w-32 px-1.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                          >
                            <option value="شعبه مرکزی تهران">شعبه مرکزی تهران</option>
                            <option value="شعبه الهیه">شعبه الهیه</option>
                            <option value="انبار مرکزی کهریزک">انبار مرکزی کهریزک</option>
                          </select>
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          aria-label={`شرح آرتیکل ردیف ${idx + 1}`}
                          value={line.note || ''}
                          onChange={(e) => {
                            const updated = [...jeLines];
                            updated[idx] = { ...line, note: e.target.value };
                            setJeLines(updated);
                          }}
                          className="w-36 px-2 py-1.5 text-xs border border-slate-200 rounded-md"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          aria-label={`مبلغ بدهکار ردیف ${idx + 1}`}
                          value={line.debit}
                          onChange={(e) => {
                            const updated = [...jeLines];
                            updated[idx] = { ...line, debit: Number(e.target.value) || 0 };
                            setJeLines(updated);
                          }}
                          className="w-32 px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="number"
                          aria-label={`مبلغ بستانکار ردیف ${idx + 1}`}
                          value={line.credit}
                          onChange={(e) => {
                            const updated = [...jeLines];
                            updated[idx] = { ...line, credit: Number(e.target.value) || 0 };
                            setJeLines(updated);
                          }}
                          className="w-32 px-2 py-1.5 text-xs font-mono tabular-nums border border-slate-200 rounded-md"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => setJeLines(jeLines.filter((_, i) => i !== idx))}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                          title="حذف ردیف آرتیکل"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-200">
              <div className="flex items-center gap-4 text-xs">
                <span>
                  جمع بدهکار:{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {formatCurrency(journalValidation.totalDebit)}
                  </strong>{' '}
                  تومان
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  جمع بستانکار:{' '}
                  <strong className="font-mono tabular-nums text-slate-900">
                    {formatCurrency(journalValidation.totalCredit)}
                  </strong>{' '}
                  تومان
                </span>
                <span aria-hidden="true">·</span>
                {journalValidation.isValid ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>سند تراز است (اختلاف: ۰)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-rose-700 font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{journalValidation.errorMessage}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setJeLines([
                      ...jeLines,
                      {
                        id: `jl-${Date.now()}`,
                        accountCode: '110102',
                        accountName: 'صندوق فروشگاهی و کارتخوان شعبه الهیه',
                        partyType: '—',
                        partyName: '',
                        costCenter: costCenters[0]?.name || 'فروشگاه و شوروم شعبه الهیه',
                        dimensionBranch: 'شعبه الهیه',
                        debit: 0,
                        credit: 0,
                        note: 'ردیف آرتیکل جدید',
                      },
                    ])
                  }
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  + افزودن ردیف آرتیکل
                </button>
                <button
                  type="button"
                  disabled={!journalValidation.isValid}
                  onClick={() => {
                    onSaveJournalEntry({
                      id: `je-${Date.now()}`,
                      voucherNo: `ACC-JV-${getPersianYear()}-${String(15 + journalEntries.length).padStart(4, '0')}`,
                      postingDate: formatPersianDate(),
                      docstatus: 0,
                      title: jeTitle,
                      branchDimension: jeLines[0]?.dimensionBranch || 'شعبه مرکزی تهران',
                      totalDebit: journalValidation.totalDebit,
                      totalCredit: journalValidation.totalCredit,
                      lines: jeLines,
                    });
                  }}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40"
                >
                  ذخیره پیش‌نویس
                </button>
                <button
                  type="button"
                  disabled={!journalValidation.isValid}
                  onClick={() => {
                    if (!checkRolePermission(activeRole, 'post_journal')) {
                      onShowToast('خطای دسترسی: نقش فعلی شما مجوز ثبت قطعی سند روزنامه در دفتر کل را ندارد.');
                      return;
                    }
                    onSaveJournalEntry({
                      id: `je-${Date.now()}`,
                      voucherNo: `ACC-JV-${getPersianYear()}-${String(15 + journalEntries.length).padStart(4, '0')}`,
                      postingDate: formatPersianDate(),
                      docstatus: 1,
                      title: jeTitle,
                      branchDimension: jeLines[0]?.dimensionBranch || 'شعبه مرکزی تهران',
                      totalDebit: journalValidation.totalDebit,
                      totalCredit: journalValidation.totalCredit,
                      lines: jeLines,
                    });
                  }}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40"
                >
                  ثبت قطعی در دفتر کل
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-3">
            <h4 className="text-sm font-bold text-slate-900">
              لیست اسناد روزنامه (کلیک روی هر ردیف جهت باز کردن فرم کامل سند، ثبت قطعی یا ابطال)
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">شماره سند</th>
                    <th className="py-2.5 px-3">عنوان و شرح سند</th>
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">وضعیت چرخه سند</th>
                    <th className="py-2.5 px-3 text-left">جمع بدهکار / بستانکار</th>
                    <th className="py-2.5 px-3 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {journalEntries.map((je) => (
                    <tr
                      key={je.id}
                      onClick={() => setSelectedDocView({ type: 'journal', doc: je })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {je.voucherNo}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{je.title}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{je.postingDate}</td>
                      <td className="py-2.5 px-3">{renderDocStatusBadge(je.docstatus)}</td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-left">
                        {formatCurrency(je.totalDebit)} تومان
                      </td>
                      <td className="py-2.5 px-3 text-left">
                        <span className="text-indigo-700 font-medium">مشاهده فرم سند ←</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 5: SALES INVOICES (فاکتورهای فروش، اقساط، برگشت از فروش و اشتراکی - بدون مالیات)
         ===================================================================== */}
      {activeSubTab === 'sales_invoice' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                فاکتورهای فروش، تقسیط نسیه (۳۰/۳۵/۳۵)، اشتراک دوره‌ای و برگشت از فروش
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                روی هر فاکتور کلیک کنید تا نمای کامل سند باز شود و عملیات ثبت قطعی، ثبت دریافت، برگشت از فروش یا ابطال را انجام دهید
              </p>
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
                محاسبه و ثبت مالیات در این نسخه غیرفعال است؛ مبلغ فاکتور بدون مالیات محاسبه می‌شود.
                پیش از استفاده برای صورتحساب قانونی، تنظیمات مالیاتی کسب‌وکار باید تأیید و پیکربندی شود.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewSalesModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              + صدور فاکتور فروش چندردیفه جدید
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-3">شماره فاکتور</th>
                  <th className="py-2.5 px-3">مشتری · اقلام</th>
                  <th className="py-2.5 px-3">وضعیت سند · الگوی پرداخت</th>
                  <th className="py-2.5 px-3 text-left">مبلغ خالص فاکتور</th>
                  <th className="py-2.5 px-3 text-left">بهای تمام‌شده</th>
                  <th className="py-2.5 px-3 text-left">
                    {productionMode ? 'مانده تاریخی (غیرحسابداری)' : 'مانده دریافتنی'}
                  </th>
                  <th className="py-2.5 px-3 text-left">عملیات سریع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesInvoices.map((inv) => {
                  const remaining =
                    inv.docstatus === 2 || inv.returnAgainst
                      ? 0
                      : Math.max(0, inv.totalAmount - inv.paidAmount - (inv.creditedAmount || 0));
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => setSelectedDocView({ type: 'sales', doc: inv })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {inv.invoiceNo}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{inv.customerName}</div>
                        <div className="text-slate-500 mt-0.5">
                          {inv.branchDimension} · {inv.itemsSummary}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          {renderDocStatusBadge(inv.docstatus)}
                          <span className="text-[11px] text-slate-500">
                            {inv.isHistoricalArchive
                              ? `بایگانی فقط‌خواندنی · وضعیت منبع: ${inv.sourceStatus || inv.status}`
                              : `${inv.status} (${inv.paymentTermsTemplate})`}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-left">
                        {formatCurrency(inv.totalAmount)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-slate-500">
                        {checkRolePermission(activeRole, 'view_buying_cost')
                          ? formatCurrency(inv.cogsAmount || 0)
                          : 'مخفی'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-rose-700 font-semibold">
                        {formatCurrency(remaining)}
                      </td>
                      <td
                        className="py-2.5 px-3 text-left"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {inv.docstatus === 0 && !inv.isHistoricalArchive && (
                            <button
                              type="button"
                              onClick={() => onSubmitSalesInvoice(inv.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              ثبت قطعی
                            </button>
                          )}
                          {inv.docstatus === 1 && remaining > 0 && !inv.isHistoricalArchive && (
                            <button
                              type="button"
                              onClick={() =>
                                openQuickPaymentForInvoice(
                                  'دریافت از مشتری (Receive)',
                                  inv.invoiceNo,
                                  inv.customerName,
                                  remaining
                                )
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100"
                            >
                              ثبت دریافت
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedDocView({ type: 'sales', doc: inv })}
                            className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900"
                          >
                            فرم سند ←
                          </button>
                        </div>
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
          TAB 6: PURCHASE INVOICES (فاکتورهای خرید چندردیفه و برگشت از خرید)
         ===================================================================== */}
      {activeSubTab === 'purchase_invoice' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                فاکتورهای خرید، یادداشت بدهکاری (برگشت از خرید) و بهای تمام‌شده
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ثبت بدهی به تامین‌کننده، افزایش موجودی انبار و ثبت بهای تمام‌شده کالا در دفتر کل
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewPurchaseForm(!showNewPurchaseForm)}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              + ثبت فاکتور خرید چندردیفه جدید
            </button>
          </div>

          {showNewPurchaseForm && (
            <form
              onSubmit={handleCreatePurchaseInvoiceSubmit}
              className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4 text-xs"
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">نام تامین‌کننده</label>
                  <input
                    type="text"
                    required
                    value={pinvSupplier}
                    onChange={(e) => setPinvSupplier(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">انبار مقصد ورود کالا</label>
                  <select
                    aria-label="انبار مقصد فاکتور خرید"
                    value={pinvWarehouse}
                    onChange={(e) => setPinvWarehouse(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="انبار مرکزی کهریزک">انبار مرکزی کهریزک</option>
                    <option value="انبار شعبه الهیه">انبار شعبه الهیه</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    هزینه گمرک و حمل (حساب ۲۱۰۴ - تومان)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={pinvLandedCost}
                    onChange={(e) => setPinvLandedCost(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">وضعیت ثبت اولیه</label>
                  <select
                    aria-label="وضعیت ثبت فاکتور خرید"
                    value={pinvDocStatusMode}
                    onChange={(e) => setPinvDocStatusMode(Number(e.target.value) as DocStatus)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value={1}>ثبت قطعی (ورود به انبار و دفتر کل)</option>
                    <option value={0}>ذخیره پیش‌نویس (بدون اثر مالی)</option>
                  </select>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3">کالای خریداری‌شده (کد کالا)</th>
                      <th className="py-2 px-3">تعداد</th>
                      <th className="py-2 px-3">فی خرید واحد (تومان)</th>
                      <th className="py-2 px-3">تخفیف ردیف (٪)</th>
                      <th className="py-2 px-3 text-left">مبلغ خالص ردیف</th>
                      <th className="py-2 px-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseLines.map((pl, idx) => (
                      <tr key={pl.id}>
                        <td className="py-2 px-3">
                          <select
                            aria-label={`کالای خرید ردیف ${idx + 1}`}
                            value={pl.sku}
                            onChange={(e) => {
                              const found = inventoryItems.find((i) => i.sku === e.target.value);
                              if (!found) return;
                              const updated = [...purchaseLines];
                              updated[idx] = {
                                ...pl,
                                sku: found.sku,
                                itemName: found.name,
                                uom: found.uomPrimary,
                                unitPrice: found.valuationRate,
                                netLineAmount: pl.qty * found.valuationRate,
                              };
                              setPurchaseLines(updated);
                            }}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded"
                          >
                            {inventoryItems.map((it) => (
                              <option key={it.id} value={it.sku}>
                                {it.sku} — {it.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={1}
                            value={pl.qty}
                            onChange={(e) => {
                              const qty = Math.max(1, Number(e.target.value) || 1);
                              const updated = [...purchaseLines];
                              updated[idx] = {
                                ...pl,
                                qty,
                                netLineAmount: Math.round(
                                  qty * pl.unitPrice * (1 - pl.discountPercent / 100)
                                ),
                              };
                              setPurchaseLines(updated);
                            }}
                            className="w-20 px-2 py-1 font-mono border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            value={pl.unitPrice}
                            onChange={(e) => {
                              const unitPrice = Math.max(0, Number(e.target.value) || 0);
                              const updated = [...purchaseLines];
                              updated[idx] = {
                                ...pl,
                                unitPrice,
                                netLineAmount: Math.round(
                                  pl.qty * unitPrice * (1 - pl.discountPercent / 100)
                                ),
                              };
                              setPurchaseLines(updated);
                            }}
                            className="w-32 px-2 py-1 font-mono border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={pl.discountPercent}
                            onChange={(e) => {
                              const discountPercent = Math.min(
                                100,
                                Math.max(0, Number(e.target.value) || 0)
                              );
                              const updated = [...purchaseLines];
                              updated[idx] = {
                                ...pl,
                                discountPercent,
                                netLineAmount: Math.round(
                                  pl.qty * pl.unitPrice * (1 - discountPercent / 100)
                                ),
                              };
                              setPurchaseLines(updated);
                            }}
                            className="w-16 px-2 py-1 font-mono border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-left">
                          {formatCurrency(pl.netLineAmount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            disabled={purchaseLines.length <= 1}
                            onClick={() =>
                              setPurchaseLines(purchaseLines.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const def = inventoryItems[1] || inventoryItems[0];
                    setPurchaseLines([
                      ...purchaseLines,
                      {
                        id: `pline-${Date.now()}`,
                        sku: def.sku,
                        itemName: def.name,
                        uom: def.uomPrimary,
                        qty: 10,
                        unitPrice: def.valuationRate,
                        discountPercent: 0,
                        netLineAmount: 10 * def.valuationRate,
                        valuationRate: def.valuationRate,
                      },
                    ]);
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-lg hover:bg-slate-100 w-fit"
                >
                  + افزودن ردیف کالای جدید
                </button>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <span>
                    بهای خالص کالاها (بستانکار ۲۱۰۱):{' '}
                    <strong className="font-mono">{formatCurrency(purchaseGoodsCalc.netTotal)}</strong> ت
                  </span>
                  <span>
                    هزینه گمرک (بستانکار ۲۱۰۴):{' '}
                    <strong className="font-mono text-indigo-700">{formatCurrency(pinvLandedCost)}</strong> ت
                  </span>
                  <span>
                    ورودی انبار (بدهکار ۱۱۰۴):{' '}
                    <strong className="font-mono text-emerald-700">{formatCurrency(totalPurchaseCommitment)}</strong> ت
                  </span>
                  <button
                    type="submit"
                    className="px-4 py-2 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                  >
                    ثبت فاکتور خرید چندردیفه
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-3">شماره فاکتور خرید</th>
                  <th className="py-2.5 px-3">تامین‌کننده · اقلام</th>
                  <th className="py-2.5 px-3">وضعیت سند</th>
                  <th className="py-2.5 px-3 text-left">هزینه گمرک (۲۱۰۴)</th>
                  <th className="py-2.5 px-3 text-left">مبلغ کل تعهد</th>
                  <th className="py-2.5 px-3 text-left">مانده پرداختنی</th>
                  <th className="py-2.5 px-3 text-left">عملیات سریع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseInvoices.map((pinv) => {
                  const remaining =
                    pinv.docstatus === 2 || pinv.returnAgainst
                      ? 0
                      : Math.max(
                          0,
                          pinv.totalAmount - (pinv.paidAmount || 0) - (pinv.creditedAmount || 0)
                        );
                  return (
                    <tr
                      key={pinv.id}
                      onClick={() => setSelectedDocView({ type: 'purchase', doc: pinv })}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">
                        {pinv.billNo}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{pinv.supplierName}</div>
                        <div className="text-slate-500 mt-0.5">
                          {pinv.warehouse} · {pinv.itemsSummary}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-1 items-start">
                          {renderDocStatusBadge(pinv.docstatus)}
                          <span className="text-[11px] text-slate-500">{pinv.status}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-indigo-700">
                        {formatCurrency(pinv.landedCostAdded)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-left">
                        {formatCurrency(pinv.totalAmount)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-semibold text-left text-rose-700">
                        {formatCurrency(remaining)}
                      </td>
                      <td
                        className="py-2.5 px-3 text-left"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {pinv.docstatus === 0 && (
                            <button
                              type="button"
                              onClick={() => onSubmitPurchaseInvoice(pinv.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              ثبت قطعی
                            </button>
                          )}
                          {pinv.docstatus === 1 && remaining > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                openQuickPaymentForInvoice(
                                  'پرداخت به تامین‌کننده (Pay)',
                                  pinv.billNo,
                                  pinv.supplierName,
                                  remaining
                                )
                              }
                              className="px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded hover:bg-indigo-100"
                            >
                              ثبت پرداخت
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelectedDocView({ type: 'purchase', doc: pinv })}
                            className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900"
                          >
                            فرم سند ←
                          </button>
                        </div>
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
          TAB 7: TREASURY, PAYMENT ENTRY, CHEQUES, GATEWAY LINKS & MULTI-CURRENCY
         ===================================================================== */}
      {activeSubTab === 'payment_cheques' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ثبت دریافت و پرداخت خزانه‌داری و لینک تسویه درگاه پرداخت آنلاین
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تسویه فاکتورها به صورت نقدی، کارتخوان، حواله بانکی (پایا/ساتنا)، چک یا ارسال لینک درگاه پرداخت آنلاین
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewPaymentForm(!showNewPaymentForm)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                >
                  + ثبت سند دریافت / پرداخت جدید
                </button>
              </div>
            </div>

            {showNewPaymentForm && (
              <form
                onSubmit={handleCreatePaymentSubmit}
                className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-6 gap-3 items-end text-xs"
              >
                <div>
                  <label className="block font-medium text-slate-700 mb-1">نوع تراکنش خزانه</label>
                  <select
                    aria-label="نوع تراکنش دریافت یا پرداخت"
                    value={payType}
                    onChange={(e) => {
                      const nextType = e.target.value as typeof payType;
                      setPayType(nextType);
                      if (nextType === 'بازپرداخت به مشتری (Refund)') {
                        const creditNote = salesInvoices.find(
                          (invoice) => {
                            const source = salesInvoices.find(
                              (candidate) => candidate.invoiceNo === invoice.returnAgainst
                            );
                            const refunded = paymentEntries
                              .filter(
                                (entry) =>
                                  entry.docstatus === 1 &&
                                  entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
                                  entry.referenceVoucherNo === invoice.invoiceNo
                              )
                              .reduce((total, entry) => total + entry.amount, 0);
                            return (
                              invoice.docstatus === 1 &&
                              Boolean(invoice.returnAgainst) &&
                              invoice.status === 'مرجوعی (یادداشت بستانکاری)' &&
                              refunded < Math.min(invoice.totalAmount, source?.paidAmount || 0)
                            );
                          }
                        );
                        if (creditNote) {
                          const source = salesInvoices.find(
                            (invoice) => invoice.invoiceNo === creditNote.returnAgainst
                          );
                          const refunded = paymentEntries
                            .filter(
                              (entry) =>
                                entry.docstatus === 1 &&
                                entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
                                entry.referenceVoucherNo === creditNote.invoiceNo
                            )
                            .reduce((total, entry) => total + entry.amount, 0);
                          setPayRefVoucher(creditNote.invoiceNo);
                          setPayParty(creditNote.customerName);
                          setPayAmount(
                            Math.max(
                              0,
                              Math.min(creditNote.totalAmount, source?.paidAmount || 0) - refunded
                            )
                          );
                        } else {
                          setPayRefVoucher('');
                          setPayParty('');
                          setPayAmount(0);
                        }
                      } else if (nextType === 'دریافت از مشتری (Receive)') {
                        const openSinv = salesInvoices.find(
                          (s) =>
                            s.docstatus === 1 &&
                            !s.returnAgainst &&
                            s.totalAmount > s.paidAmount + (s.creditedAmount || 0)
                        );
                        if (openSinv) {
                          setPayRefVoucher(openSinv.invoiceNo);
                          setPayParty(openSinv.customerName);
                          setPayAmount(
                            openSinv.totalAmount -
                              openSinv.paidAmount -
                              (openSinv.creditedAmount || 0)
                          );
                        }
                      } else {
                        const openPinv = purchaseInvoices.find(
                          (p) =>
                            p.docstatus === 1 &&
                            !p.returnAgainst &&
                            p.totalAmount > (p.paidAmount || 0) + (p.creditedAmount || 0)
                        );
                        if (openPinv) {
                          setPayRefVoucher(openPinv.billNo);
                          setPayParty(openPinv.supplierName);
                          setPayAmount(
                            openPinv.totalAmount -
                              (openPinv.paidAmount || 0) -
                              (openPinv.creditedAmount || 0)
                          );
                        }
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="دریافت از مشتری (Receive)">دریافت از مشتری</option>
                    <option value="پرداخت به تامین‌کننده (Pay)">پرداخت به تامین‌کننده</option>
                    <option value="بازپرداخت به مشتری (Refund)">بازپرداخت به مشتری بابت برگشت</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    {payType === 'بازپرداخت به مشتری (Refund)'
                      ? 'عطف به یادداشت بستانکاری'
                      : 'عطف به فاکتور باز'}
                  </label>
                  <select
                    aria-label="انتخاب فاکتور مرجع تسویه"
                    value={payRefVoucher}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPayRefVoucher(val);
                      const sinv = salesInvoices.find((s) => s.invoiceNo === val);
                      if (
                        sinv &&
                        (payType === 'بازپرداخت به مشتری (Refund)'
                          ? Boolean(sinv.returnAgainst)
                          : !sinv.returnAgainst)
                      ) {
                        setPayParty(sinv.customerName);
                        if (payType === 'بازپرداخت به مشتری (Refund)') {
                          const source = salesInvoices.find(
                            (invoice) => invoice.invoiceNo === sinv.returnAgainst
                          );
                          const refunded = paymentEntries
                            .filter(
                              (entry) =>
                                entry.docstatus === 1 &&
                                entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
                                entry.referenceVoucherNo === sinv.invoiceNo
                            )
                            .reduce((total, entry) => total + entry.amount, 0);
                          setPayAmount(
                            Math.max(
                              0,
                              Math.min(sinv.totalAmount, source?.paidAmount || 0) - refunded
                            )
                          );
                        } else {
                          setPayAmount(
                            Math.max(
                              0,
                              sinv.totalAmount - sinv.paidAmount - (sinv.creditedAmount || 0)
                            )
                          );
                        }
                      }
                      const pinv = purchaseInvoices.find((p) => p.billNo === val);
                      if (pinv && !pinv.returnAgainst) {
                        setPayParty(pinv.supplierName);
                        setPayAmount(
                          Math.max(
                            0,
                            pinv.totalAmount - (pinv.paidAmount || 0) - (pinv.creditedAmount || 0)
                          )
                        );
                      }
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                  >
                    {payType === 'بازپرداخت به مشتری (Refund)'
                      ? salesInvoices
                          .filter((invoice) => {
                            const source = salesInvoices.find(
                              (candidate) => candidate.invoiceNo === invoice.returnAgainst
                            );
                            const refunded = paymentEntries
                              .filter(
                                (entry) =>
                                  entry.docstatus === 1 &&
                                  entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
                                  entry.referenceVoucherNo === invoice.invoiceNo
                              )
                              .reduce((total, entry) => total + entry.amount, 0);
                            return (
                              invoice.docstatus === 1 &&
                              Boolean(invoice.returnAgainst) &&
                              invoice.status === 'مرجوعی (یادداشت بستانکاری)' &&
                              refunded < Math.min(invoice.totalAmount, source?.paidAmount || 0)
                            );
                          })
                          .map((invoice) => {
                            const source = salesInvoices.find(
                              (candidate) => candidate.invoiceNo === invoice.returnAgainst
                            );
                            const refunded = paymentEntries
                              .filter(
                                (entry) =>
                                  entry.docstatus === 1 &&
                                  entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
                                  entry.referenceVoucherNo === invoice.invoiceNo
                              )
                              .reduce((total, entry) => total + entry.amount, 0);
                            return (
                              <option key={invoice.id} value={invoice.invoiceNo}>
                                {invoice.invoiceNo} — بازپرداخت باقی‌مانده:{' '}
                                {formatCurrency(
                                  Math.min(invoice.totalAmount, source?.paidAmount || 0) -
                                    refunded
                                )}
                              </option>
                            );
                          })
                      : payType === 'دریافت از مشتری (Receive)'
                        ? salesInvoices
                          .filter(
                            (s) =>
                              s.docstatus === 1 &&
                              !s.returnAgainst &&
                              s.totalAmount > s.paidAmount + (s.creditedAmount || 0)
                          )
                          .map((s) => (
                            <option key={s.id} value={s.invoiceNo}>
                              {s.invoiceNo} — مانده:{' '}
                              {formatCurrency(
                                s.totalAmount - s.paidAmount - (s.creditedAmount || 0)
                              )}
                            </option>
                          ))
                        : purchaseInvoices
                          .filter(
                            (p) =>
                              p.docstatus === 1 &&
                              !p.returnAgainst &&
                              p.totalAmount > (p.paidAmount || 0) + (p.creditedAmount || 0)
                          )
                          .map((p) => (
                            <option key={p.id} value={p.billNo}>
                              {p.billNo} — مانده:{' '}
                              {formatCurrency(
                                p.totalAmount - (p.paidAmount || 0) - (p.creditedAmount || 0)
                              )}
                            </option>
                          ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">نام طرف حساب</label>
                  <input
                    type="text"
                    value={payParty}
                    onChange={(e) => setPayParty(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">روش و حساب بانک</label>
                  <div className="flex gap-1">
                    <select
                      aria-label="روش پرداخت"
                      value={payMode}
                      onChange={(e) =>
                        setPayMode(e.target.value as PaymentEntryRecord['modeOfPayment'])
                      }
                      className="w-1/2 px-1.5 py-1.5 bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="حواله بانکی پایا/ساتنا">پایا/ساتنا</option>
                      <option value="کارتخوان (POS)">کارتخوان</option>
                      <option value="نقد (صندوق)">نقد</option>
                      <option value="چک صیادی">چک صیادی</option>
                    </select>
                    <select
                      aria-label="حساب بانکی"
                      value={payBankCode}
                      onChange={(e) => setPayBankCode(e.target.value)}
                      className="w-1/2 px-1.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                    >
                      <option value="110101">110101 بانک ملت</option>
                      <option value="110102">110102 صندوق الهیه</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">مبلغ تسویه (تومان)</label>
                  <input
                    type="number"
                    min={1000}
                    value={payAmount}
                    onChange={(e) => setPayAmount(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono bg-white border border-slate-300 rounded-lg"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-1.5 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 whitespace-nowrap"
                >
                  ثبت قطعی سند تسویه
                </button>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2 px-3">شماره سند پرداخت</th>
                    <th className="py-2 px-3">نوع تراکنش</th>
                    <th className="py-2 px-3">طرف حساب</th>
                    <th className="py-2 px-3">فاکتور مرجع</th>
                    <th className="py-2 px-3">روش و بانک</th>
                    <th className="py-2 px-3 text-left">مبلغ / عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paymentEntries.map((pe) => (
                    <tr key={pe.id} className={`hover:bg-slate-50 ${pe.docstatus === 2 ? 'opacity-60' : ''}`}>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-900">
                        {pe.paymentNo}
                      </td>
                      <td className="py-2 px-3 text-slate-700">{stripEnglishTerms(pe.paymentType)}</td>
                      <td className="py-2 px-3 font-medium text-slate-900">{pe.partyName}</td>
                      <td className="py-2 px-3 font-mono text-indigo-700">
                        {pe.referenceVoucherNo}
                      </td>
                      <td className="py-2 px-3 text-slate-500">
                        {stripEnglishTerms(pe.modeOfPayment)} ({pe.bankAccountCode})
                      </td>
                      <td className="py-2 px-3 text-left">
                        <div className={`font-mono tabular-nums font-bold ${pe.docstatus === 2 ? 'text-slate-500 line-through' : 'text-emerald-700'}`}>
                          {formatCurrency(pe.amount)} تومان
                        </div>
                        {pe.docstatus === 1 ? (
                          <button
                            type="button"
                            onClick={() => onCancelPaymentEntry(pe.id)}
                            className="mt-1 inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <XCircle className="h-3 w-3" />
                            ابطال سند
                          </button>
                        ) : (
                          <span className="mt-1 inline-block text-[10px] text-slate-500">ابطال‌شده</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cheques Tracking & Multi-Currency Revaluation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                مدیریت چک و سفته (در جریان وصول، پاس‌شده، خرج‌شده و برگشتی)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cheques.map((chq) => (
                  <div
                    key={chq.id}
                    className="p-4 rounded-xl border border-slate-200 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1 text-xs">
                      <div className="font-mono font-bold text-slate-900">
                        صیادی: {chq.sayadiNo}
                      </div>
                      <div className="font-semibold text-slate-800">
                        {chq.partyName} ({chq.type})
                      </div>
                      <div className="text-slate-500">
                        {chq.bankName} · سررسید: {chq.dueDate}
                      </div>
                      <div className="text-slate-600">وضعیت: {chq.status}</div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="font-mono font-bold text-sm text-slate-900">
                        {formatCurrency(chq.amount)} ت
                      </span>
                      {chq.status === 'در جریان وصول' && (
                        <button
                          type="button"
                          onClick={() => onClearCheque(chq.id)}
                          className="px-3 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100"
                        >
                          ثبت وصول چک
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-Currency Accounting & Exchange Gain/Loss */}
            <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    برآورد دستی تغییر ارزش ارز
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ماشین‌حساب بر اساس مقادیر واردشده (دلار، درهم، یوان و تتر)
                  </p>
                </div>
              </div>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs leading-5 text-amber-900">
                این برآورد فقط نمایشی است؛ مانده حساب ارزی را نمی‌خواند و هیچ سندی در دفتر کل ثبت
                نمی‌کند. مقدار پیش‌فرض صفر است.
              </p>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">ارز خارجی</label>
                  <select
                    aria-label="انتخاب ارز خارجی"
                    value={fxCurrency}
                    onChange={(e) => setFxCurrency(e.target.value as typeof fxCurrency)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="دلار آمریکا">دلار آمریکا</option>
                    <option value="درهم امارات">درهم امارات</option>
                    <option value="یوان چین">یوان چین</option>
                    <option value="تتر">تتر</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">موجودی ارزی</label>
                  <input
                    type="number"
                    value={fxBalanceAmount}
                    onChange={(e) => setFxBalanceAmount(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">نرخ ثبت اولیه (تومان)</label>
                  <input
                    type="number"
                    value={fxBookRate}
                    onChange={(e) => setFxBookRate(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">نرخ روز تسعیر (تومان)</label>
                  <input
                    type="number"
                    value={fxCurrentRate}
                    onChange={(e) => setFxCurrentRate(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">ارزش روز دارایی ارزی:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {formatCurrency(fxBalanceAmount * fxCurrentRate)} تومان
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">تفاوت ارزش محاسباتی ({fxCurrency}):</span>
                  <span
                    className={`font-mono font-bold ${
                      fxGainLoss >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {fxGainLoss >= 0 ? `+${formatCurrency(fxGainLoss)}` : formatCurrency(fxGainLoss)} تومان
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 8: COST CENTERS & BUDGET (مراکز هزینه و کنترل بودجه)
         ===================================================================== */}
      {activeSubTab === 'budget' && (
        <div className="space-y-6">
          {productionMode && costCenters.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              مرکز هزینه و بودجه‌ی واقعی وارد نشده است؛ اطلاعات نمونه و شبیه‌ساز بودجه نمایش داده نمی‌شوند.
            </div>
          )}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              درخت مراکز هزینه و کنترل بودجه (هشدار / توقف ثبت)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">کد و نام مرکز هزینه</th>
                    <th className="py-2.5 px-3">سهم تسهیم خودکار</th>
                    <th className="py-2.5 px-3 text-left">بودجه مصوب</th>
                    <th className="py-2.5 px-3 text-left">هزینه مصرف‌شده</th>
                    <th className="py-2.5 px-3">سیاست عبور از سقف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {costCenters.map((cc) => (
                    <tr key={cc.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {cc.code} — {cc.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono">{cc.autoAllocationPercent}٪</td>
                      <td className="py-2.5 px-3 font-mono text-left">
                        {formatCurrency(cc.allocatedBudget)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-left">
                        {formatCurrency(cc.spentAmount)}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateCostCenterPolicy(
                              cc.id,
                              cc.controlPolicy === 'STOP' ? 'WARN' : 'STOP'
                            )
                          }
                          className="px-2.5 py-1 text-xs rounded border border-slate-200 bg-slate-50 hover:bg-slate-100"
                        >
                          {cc.controlPolicy === 'STOP'
                            ? 'توقف کامل ثبت فاکتور'
                            : 'هشدار سیستمی'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {costCenters.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-3 text-xs">
              <h4 className="text-sm font-bold text-slate-900">شبیه‌ساز کنترل بودجه هنگام ثبت هزینه</h4>
              <div className="grid grid-cols-2 gap-3">
                <select
                  aria-label="انتخاب مرکز هزینه جهت تست بودجه"
                  value={testBudgetCenterId}
                  onChange={(e) => setTestBudgetCenterId(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  aria-label="مبلغ هزینه جدید جهت تست بودجه"
                  value={testExpenseInput}
                  onChange={(e) => setTestExpenseInput(Number(e.target.value) || 0)}
                  className="px-3 py-1.5 font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-medium">
                {budgetEval
                  ? stripEnglishTerms(budgetEval.message)
                  : 'مرکز هزینه‌ای برای ارزیابی بودجه انتخاب نشده است.'}
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-3 text-xs">
              <h4 className="text-sm font-bold text-slate-900">
                تسهیم خودکار قبض و هزینه مشترک بین مراکز هزینه
              </h4>
              <input
                type="number"
                aria-label="مبلغ هزینه مشترک جهت تسهیم"
                value={sharedBillAmount}
                onChange={(e) => setSharedBillAmount(Number(e.target.value) || 0)}
                className="w-full px-3 py-1.5 font-mono bg-slate-50 border border-slate-200 rounded-lg"
              />
              <div className="space-y-1">
                {sharedExpenseAllocations.map((al) => (
                  <div key={al.costCenterName} className="flex justify-between py-1 border-b border-slate-100">
                    <span>
                      {al.costCenterName} ({al.percentage}٪)
                    </span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(al.allocatedAmount)} تومان
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 9: FIXED ASSETS & SHAREHOLDERS (چرخه عمر دارایی، فروش/اسقاط/تجدید ارزیابی و مدیریت سهامداران)
         ===================================================================== */}
      {activeSubTab === 'assets' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                چرخه عمر دارایی‌های ثابت، فروش، اسقاط و تجدید ارزیابی دارایی
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ثبت خرید تجهیزات، خودرو و دکوراسیون فروشگاهی تا مرحله بهره‌برداری، فروش، اسقاط یا تجدید ارزیابی
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">کد پلاک اموال · نام دارایی</th>
                    <th className="py-2.5 px-3">دسته · محل استقرار</th>
                    <th className="py-2.5 px-3">تاریخ خرید</th>
                    <th className="py-2.5 px-3 text-left">بهای تمام‌شده خرید</th>
                    <th className="py-2.5 px-3 text-left">ارزش دفتری فعلی</th>
                    <th className="py-2.5 px-3">وضعیت · عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fixedAssets.map((ast) => (
                    <tr key={ast.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{ast.name}</div>
                        <div className="text-slate-500 font-mono">{ast.assetTag}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {ast.category} · {ast.location}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">{ast.purchaseDate}</td>
                      <td className="py-2.5 px-3 font-mono text-left">
                        {formatCurrency(ast.purchaseValue)} ت
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-left text-slate-900">
                        {formatCurrency(ast.currentBookValue)} ت
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-indigo-700">{ast.status}</span>
                          {ast.status === 'فعال در بهره‌برداری' && (
                            <>
                              <button
                                type="button"
                                onClick={() => onScrapOrSellAsset(ast.id, 'تجدید ارزیابی‌شده')}
                                className="px-2 py-1 text-[11px] bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded"
                              >
                                تجدید ارزیابی
                              </button>
                              <button
                                type="button"
                                onClick={() => onScrapOrSellAsset(ast.id, 'فروخته‌شده')}
                                className="px-2 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 rounded"
                              >
                                فروش
                              </button>
                              <button
                                type="button"
                                onClick={() => onScrapOrSellAsset(ast.id, 'اسقاط‌شده')}
                                className="px-2 py-1 text-[11px] bg-rose-50 text-rose-700 hover:bg-rose-100 rounded"
                              >
                                اسقاط
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Shareholders & Share Ledger */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                مدیریت سهامداران، درصد سهام، انتقال سرمایه و تقسیم سود پایان سال
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ثبت دفتر سهام شرکا، میزان آورده سرمایه‌ای و سود تقسیمی مصوب
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shareholders.map((sh) => (
                <div key={sh.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5 text-xs">
                  <div className="font-bold text-slate-900">{sh.name}</div>
                  <div className="text-slate-500 font-mono">
                    کد سهامداری: {sh.folioNo} · سهم الشرکه: {sh.ownershipPercent}٪ ({formatCurrency(sh.sharesCount)} سهم)
                  </div>
                  <div className="pt-2 border-t border-slate-200/80 flex justify-between">
                    <span className="text-slate-500">سرمایه ثبت‌شده:</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrency(sh.capitalBalance)} ت</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">سود تقسیمی پرداخت‌شده:</span>
                    <span className="font-mono font-semibold text-emerald-700">{formatCurrency(sh.dividendPaid)} ت</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: MULTI-LINE NEW SALES INVOICE (فاکتور فروش چندردیفه بدون مالیات)
         ===================================================================== */}
      {showNewSalesModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-sales-invoice-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-4xl w-full p-6 space-y-5 shadow-xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 id="modal-sales-invoice-title" className="text-base font-bold text-slate-900">
                صدور فاکتور فروش چندردیفه
              </h3>
              <button
                type="button"
                onClick={() => setShowNewSalesModal(false)}
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                بستن ✕
              </button>
            </div>

            <form onSubmit={handleCreateSalesInvoiceSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">نام مشتری / خریدار</label>
                  <input
                    type="text"
                    required
                    value={invCustomer}
                    onChange={(e) => setInvCustomer(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">بعد تحلیلی شعبه</label>
                  <select
                    aria-label="شعبه فاکتور فروش"
                    value={invBranch}
                    onChange={(e) => setInvBranch(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="شعبه مرکزی تهران">شعبه مرکزی تهران</option>
                    <option value="شعبه الهیه">شعبه الهیه</option>
                    <option value="انبار مرکزی کهریزک">انبار مرکزی کهریزک</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">الگوی تسویه و اقساط</label>
                  <select
                    aria-label="الگوی پرداخت فاکتور"
                    value={invTermsType}
                    onChange={(e) =>
                      setInvTermsType(
                        e.target.value as 'cash' | 'installment3' | 'subscription'
                      )
                    }
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value="installment3">اقساطی (۳۰٪ نقد، ۳۵٪ یک‌ماهه، ۳۵٪ دوماهه)</option>
                    <option value="cash">تسویه نقد / کارتخوان (۱۰۰٪ در لحظه)</option>
                    <option value="subscription">اشتراک خودکار ماهانه</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">وضعیت ثبت سند</label>
                  <select
                    aria-label="وضعیت ثبت سند فروش"
                    value={invDocStatusMode}
                    onChange={(e) => setInvDocStatusMode(Number(e.target.value) as DocStatus)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg"
                  >
                    <option value={1}>ثبت قطعی (ثبت در دفتر کل و کسر انبار)</option>
                    <option value={0}>پیش‌نویس (بدون اثر در دفتر کل و انبار)</option>
                  </select>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-right text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <th className="py-2 px-3">کالا / پکیج باندل</th>
                      <th className="py-2 px-3">تعداد</th>
                      <th className="py-2 px-3">فی واحد (تومان)</th>
                      <th className="py-2 px-3">تخفیف (٪)</th>
                      <th className="py-2 px-3 text-left">مبلغ خالص ردیف</th>
                      <th className="py-2 px-3 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salesLines.map((sl, idx) => (
                      <tr key={sl.id}>
                        <td className="py-2 px-3">
                          <select
                            aria-label={`انتخاب کالای ردیف ${idx + 1}`}
                            value={sl.sku}
                            onChange={(e) => {
                              const found = inventoryItems.find((i) => i.sku === e.target.value);
                              if (!found) return;
                              const unitPrice = found.wholesalePrice || found.retailPrice;
                              const updated = [...salesLines];
                              updated[idx] = {
                                ...sl,
                                sku: found.sku,
                                itemName: found.name,
                                uom: found.uomPrimary,
                                unitPrice,
                                valuationRate: found.valuationRate,
                                netLineAmount: Math.round(
                                  sl.qty * unitPrice * (1 - sl.discountPercent / 100)
                                ),
                              };
                              setSalesLines(updated);
                            }}
                            className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded"
                          >
                            {inventoryItems.filter((item) => item.isActive !== false).map((item) => (
                              <option key={item.id} value={item.sku}>
                                {item.name} (موجودی: {item.stockQty})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={1}
                            value={sl.qty}
                            onChange={(e) => {
                              const qty = Math.max(1, Number(e.target.value) || 1);
                              const updated = [...salesLines];
                              updated[idx] = {
                                ...sl,
                                qty,
                                netLineAmount: Math.round(
                                  qty * sl.unitPrice * (1 - sl.discountPercent / 100)
                                ),
                              };
                              setSalesLines(updated);
                            }}
                            className="w-20 px-2 py-1 font-mono border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            value={sl.unitPrice}
                            onChange={(e) => {
                              const unitPrice = Math.max(0, Number(e.target.value) || 0);
                              const updated = [...salesLines];
                              updated[idx] = {
                                ...sl,
                                unitPrice,
                                netLineAmount: Math.round(
                                  sl.qty * unitPrice * (1 - sl.discountPercent / 100)
                                ),
                              };
                              setSalesLines(updated);
                            }}
                            className="w-32 px-2 py-1 font-mono border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={sl.discountPercent}
                            onChange={(e) => {
                              const discountPercent = Math.min(
                                100,
                                Math.max(0, Number(e.target.value) || 0)
                              );
                              const updated = [...salesLines];
                              updated[idx] = {
                                ...sl,
                                discountPercent,
                                netLineAmount: Math.round(
                                  sl.qty * sl.unitPrice * (1 - discountPercent / 100)
                                ),
                              };
                              setSalesLines(updated);
                            }}
                            className="w-16 px-2 py-1 font-mono border border-slate-200 rounded"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-left">
                          {formatCurrency(sl.netLineAmount)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            disabled={salesLines.length <= 1}
                            onClick={() =>
                              setSalesLines(salesLines.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    const def = inventoryItems[0];
                    if (!def) {
                      onShowToast('برای افزودن ردیف، ابتدا کالاهای واقعی را وارد کنید.');
                      return;
                    }
                    const unitPrice = def.wholesalePrice || def.retailPrice;
                    setSalesLines([
                      ...salesLines,
                      {
                        id: `sline-${Date.now()}`,
                        sku: def.sku,
                        itemName: def.name,
                        uom: def.uomPrimary,
                        qty: 1,
                        unitPrice,
                        discountPercent: 0,
                        netLineAmount: unitPrice,
                        valuationRate: def.valuationRate,
                      },
                    ]);
                  }}
                  className="px-3 py-1.5 font-medium bg-slate-100 rounded-lg hover:bg-slate-200"
                >
                  + افزودن ردیف کالا
                </button>

                <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invUpdateStock}
                    onChange={(e) => setInvUpdateStock(e.target.checked)}
                    className="rounded text-slate-900"
                  />
                  <span>کسر مستقیم کالا از انبار و صدور خودکار سند بهای تمام‌شده</span>
                </label>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <div className="text-slate-500">جمع ناخالص اقلام:</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                    {formatCurrency(salesCalc.grossAmount)} تومان
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">مجموع تخفیف ردیف‌ها:</div>
                  <div className="font-mono font-bold text-indigo-700 mt-0.5">
                    {formatCurrency(salesCalc.totalDiscount)} تومان
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">بهای تمام‌شده (حساب ۵۱۰۱):</div>
                  <div className="font-mono font-bold text-slate-700 mt-0.5">
                    {formatCurrency(salesCalc.totalCogs)} تومان
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">مبلغ خالص قابل پرداخت:</div>
                  <div className="font-mono font-bold text-emerald-700 text-sm mt-0.5">
                    {formatCurrency(salesCalc.grandTotal)} تومان
                  </div>
                </div>
              </div>

              {invTermsType === 'installment3' && (
                <div className="grid grid-cols-3 gap-2">
                  {installmentPreview.map((inst) => (
                    <div key={inst.label} className="p-2.5 rounded-lg border border-slate-200 bg-white">
                      <div className="text-slate-500">{inst.label}</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {formatCurrency(inst.amount)} تومان
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewSalesModal(false)}
                  className="px-4 py-2 text-slate-600 bg-slate-100 rounded-lg"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                >
                  {invDocStatusMode === 1
                    ? 'ثبت قطعی فاکتور و صدور سند دفتر کل'
                    : 'ذخیره به عنوان پیش‌نویس'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: DOCUMENT FORM VIEW (نمای کامل سند و دکمه‌های چرخه حیات)
         ===================================================================== */}
      {selectedDocView && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="doc-form-view-title"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-3xl w-full p-6 space-y-5 shadow-xl my-8 text-xs">
            {selectedDocView.type === 'sales' && (() => {
              const doc =
                salesInvoices.find((s) => s.id === selectedDocView.doc.id) ||
                selectedDocView.doc;
              const remaining =
                doc.docstatus === 2 || doc.returnAgainst
                  ? 0
                  : Math.max(0, doc.totalAmount - doc.paidAmount - (doc.creditedAmount || 0));
              const voucherGL = glEntries.filter((g) => g.voucherNo === doc.invoiceNo);
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-700" />
                      <div>
                        <h3 id="doc-form-view-title" className="text-base font-bold text-slate-900 font-mono">
                          {doc.invoiceNo} — {doc.customerName}
                        </h3>
                        <div className="text-slate-500 mt-0.5">
                          فاکتور فروش · شعبه: {doc.branchDimension}
                        </div>
                      </div>
                      {renderDocStatusBadge(doc.docstatus)}
                      {doc.isHistoricalArchive && (
                        <span className="rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                          آرشیو تاریخی · بدون اثر مالی
                        </span>
                      )}
                    </div>
                    {doc.isHistoricalArchive && (
                      <p className="mt-2 rounded bg-amber-50 p-2 text-[11px] text-amber-900">
                        {doc.archiveNote} مانده‌ی نمایش‌داده‌شده، مانده‌ی تاریخی فایل منبع است و دریافتنی دفتر کل محسوب نمی‌شود.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {doc.docstatus === 0 && !doc.isHistoricalArchive && (
                        <button
                          type="button"
                          onClick={() => onSubmitSalesInvoice(doc.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ثبت قطعی</span>
                        </button>
                      )}
                      {doc.docstatus === 1 && remaining > 0 && !doc.isHistoricalArchive && (
                        <button
                          type="button"
                          onClick={() =>
                            openQuickPaymentForInvoice(
                              'دریافت از مشتری (Receive)',
                              doc.invoiceNo,
                              doc.customerName,
                              remaining
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>ثبت دریافت</span>
                        </button>
                      )}
                      {doc.docstatus === 1 &&
                        !doc.isHistoricalArchive &&
                        !doc.returnAgainst &&
                        doc.status !== 'مرجوعی (یادداشت بستانکاری)' &&
                        (doc.creditedAmount || 0) === 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onCreateCreditNote(doc.id);
                              setSelectedDocView(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>برگشت از فروش</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancelSalesInvoice(doc.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>ابطال سند</span>
                          </button>
                        </>
                      )}
                      {doc.docstatus === 1 && doc.returnAgainst && !doc.isHistoricalArchive && (
                        <button
                          type="button"
                          onClick={() => onCancelSalesInvoice(doc.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>ابطال یادداشت بستانکاری</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedDocView(null)}
                        className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900"
                      >
                        بستن ✕
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <div className="text-slate-400">مبلغ کل فاکتور:</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {formatCurrency(doc.totalAmount)} تومان
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">دریافت‌شده تاکنون:</div>
                      <div className="font-mono font-semibold text-emerald-700 mt-0.5">
                        {formatCurrency(doc.paidAmount)} تومان
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">مانده بدهی مشتری:</div>
                      <div className="font-mono font-bold text-rose-700 mt-0.5">
                        {formatCurrency(remaining)} تومان
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-bold text-slate-900">
                      آرتیکل‌های صادرشده در دفتر کل برای این سند:
                    </div>
                    {voucherGL.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                        {doc.isHistoricalArchive
                          ? 'این فاکتور آرشیو تاریخی است و عمداً هیچ آرتیکلی در دفتر کل ندارد.'
                          : doc.docstatus === 0
                            ? 'این سند در وضعیت «پیش‌نویس» است و هنوز هیچ آرتیکلی در دفتر کل صادر نکرده است.'
                            : 'برای این سند هنوز هیچ آرتیکلی در دفتر کل صادر نشده است.'}
                      </div>
                    ) : (
                      <table className="w-full text-right border-collapse border border-slate-200">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <th className="py-2 px-3">کد و نام حساب</th>
                            <th className="py-2 px-3">شرح آرتیکل</th>
                            <th className="py-2 px-3 text-left">بدهکار</th>
                            <th className="py-2 px-3 text-left">بستانکار</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {voucherGL.map((g) => (
                            <tr key={g.id}>
                              <td className="py-2 px-3 font-medium">
                                <span className="font-mono text-slate-500 ml-1">{g.accountCode}</span>
                                {g.accountName}
                              </td>
                              <td className="py-2 px-3 text-slate-500">{g.remarks}</td>
                              <td className="py-2 px-3 font-mono text-left text-emerald-700">
                                {formatCurrency(g.debit)}
                              </td>
                              <td className="py-2 px-3 font-mono text-left text-indigo-700">
                                {formatCurrency(g.credit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              );
            })()}

            {selectedDocView.type === 'purchase' && (() => {
              const doc =
                purchaseInvoices.find((p) => p.id === selectedDocView.doc.id) ||
                selectedDocView.doc;
              const remaining =
                doc.docstatus === 2 || doc.returnAgainst
                  ? 0
                  : Math.max(
                      0,
                      doc.totalAmount - (doc.paidAmount || 0) - (doc.creditedAmount || 0)
                    );
              const voucherGL = glEntries.filter((g) => g.voucherNo === doc.billNo);
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-700" />
                      <div>
                        <h3 id="doc-form-view-title" className="text-base font-bold text-slate-900 font-mono">
                          {doc.billNo} — {doc.supplierName}
                        </h3>
                        <div className="text-slate-500 mt-0.5">
                          فاکتور خرید · انبار: {doc.warehouse}
                        </div>
                      </div>
                      {renderDocStatusBadge(doc.docstatus)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {doc.docstatus === 0 && (
                        <button
                          type="button"
                          onClick={() => onSubmitPurchaseInvoice(doc.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>ثبت قطعی</span>
                        </button>
                      )}
                      {doc.docstatus === 1 && remaining > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            openQuickPaymentForInvoice(
                              'پرداخت به تامین‌کننده (Pay)',
                              doc.billNo,
                              doc.supplierName,
                              remaining
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>ثبت پرداخت</span>
                        </button>
                      )}
                      {doc.docstatus === 1 &&
                        !doc.returnAgainst &&
                        doc.status !== 'برگشت از خرید (یادداشت بدهکاری)' &&
                        (doc.creditedAmount || 0) === 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onCreateDebitNote(doc.id);
                              setSelectedDocView(null);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>برگشت از خرید</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onCancelPurchaseInvoice(doc.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>ابطال سند</span>
                          </button>
                        </>
                      )}
                      {doc.docstatus === 1 && doc.returnAgainst && (
                        <button
                          type="button"
                          onClick={() => onCancelPurchaseInvoice(doc.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>ابطال یادداشت بدهکاری</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedDocView(null)}
                        className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900"
                      >
                        بستن ✕
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <div className="text-slate-400">جمع کل ورود به انبار (۱۱۰۴):</div>
                      <div className="font-mono font-bold text-slate-900 mt-0.5">
                        {formatCurrency(doc.totalAmount)} تومان
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">سهم گمرک و ترخیص (۲۱۰۴):</div>
                      <div className="font-mono font-semibold text-indigo-700 mt-0.5">
                        {formatCurrency(doc.landedCostAdded)} تومان
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400">مانده پرداختنی:</div>
                      <div className="font-mono font-bold text-rose-700 mt-0.5">
                        {formatCurrency(remaining)} تومان
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-bold text-slate-900">آرتیکل‌های دفتر کل:</div>
                    {voucherGL.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                        سند پیش‌نویس است؛ برای صدور آرتیکل در دفتر کل دکمه «ثبت قطعی» را بزنید.
                      </div>
                    ) : (
                      <table className="w-full text-right border-collapse border border-slate-200">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <th className="py-2 px-3">حساب</th>
                            <th className="py-2 px-3">شرح</th>
                            <th className="py-2 px-3 text-left">بدهکار</th>
                            <th className="py-2 px-3 text-left">بستانکار</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {voucherGL.map((g) => (
                            <tr key={g.id}>
                              <td className="py-2 px-3">
                                <span className="font-mono text-slate-500 ml-1">{g.accountCode}</span>
                                {g.accountName}
                              </td>
                              <td className="py-2 px-3 text-slate-500">{g.remarks}</td>
                              <td className="py-2 px-3 font-mono text-left text-emerald-700">
                                {formatCurrency(g.debit)}
                              </td>
                              <td className="py-2 px-3 font-mono text-left text-indigo-700">
                                {formatCurrency(g.credit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              );
            })()}

            {selectedDocView.type === 'journal' && (() => {
              const doc =
                journalEntries.find((j) => j.id === selectedDocView.doc.id) ||
                selectedDocView.doc;
              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-slate-700" />
                      <div>
                        <h3 id="doc-form-view-title" className="text-base font-bold text-slate-900 font-mono">
                          {doc.voucherNo} — {doc.title}
                        </h3>
                        <div className="text-slate-500 mt-0.5">سند حسابداری روزنامه</div>
                      </div>
                      {renderDocStatusBadge(doc.docstatus)}
                    </div>

                    <div className="flex items-center gap-2">
                      {doc.docstatus === 0 && (
                        <button
                          type="button"
                          onClick={() => onSubmitJournalEntry(doc.id)}
                          className="px-3 py-1.5 font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                        >
                          ثبت قطعی
                        </button>
                      )}
                      {doc.docstatus === 1 && (
                        <button
                          type="button"
                          onClick={() => onCancelJournalEntry(doc.id)}
                          className="px-3 py-1.5 font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100"
                        >
                          ابطال سند
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSelectedDocView(null)}
                        className="px-2.5 py-1.5 text-slate-500 hover:text-slate-900"
                      >
                        بستن ✕
                      </button>
                    </div>
                  </div>

                  <table className="w-full text-right border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <th className="py-2 px-3">حساب</th>
                        <th className="py-2 px-3">طرف حساب</th>
                        <th className="py-2 px-3">مرکز هزینه</th>
                        <th className="py-2 px-3 text-left">بدهکار</th>
                        <th className="py-2 px-3 text-left">بستانکار</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {doc.lines.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 px-3 font-medium">
                            <span className="font-mono text-slate-500 ml-1">{l.accountCode}</span>
                            {l.accountName}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{l.partyName || '—'}</td>
                          <td className="py-2 px-3 text-slate-500">{l.costCenter || '—'}</td>
                          <td className="py-2 px-3 font-mono text-left text-emerald-700">
                            {formatCurrency(l.debit)}
                          </td>
                          <td className="py-2 px-3 font-mono text-left text-indigo-700">
                            {formatCurrency(l.credit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
