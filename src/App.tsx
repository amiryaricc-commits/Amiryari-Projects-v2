import React, { useState, useEffect } from 'react';
import {
  Home,
  Calculator,
  ShoppingCart,
  Package,
  Store,
  Users,
  Globe,
  Settings,
  Search,
  CheckCircle2,
  Building2,
  Calendar,
  ChevronLeft,
  ArrowUpLeft,
} from 'lucide-react';

import {
  INITIAL_ACCOUNTS,
  INITIAL_GL_ENTRIES,
  INITIAL_SALES_INVOICES,
  INITIAL_PURCHASE_INVOICES,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_PAYMENT_ENTRIES,
  INITIAL_CHEQUES,
  INITIAL_COST_CENTERS,
  INITIAL_FIXED_ASSETS,
  INITIAL_SHAREHOLDERS,
  INITIAL_CRM_LEADS,
  INITIAL_AUDIT_LOGS,
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
  CustomerContactRecord,
  CrmLeadRecord,
  AuditLogRecord,
} from './data/erpSeedData';
import { CLOUDY_SHOP_CONTACTS, CLOUDY_SHOP_INVENTORY } from './data/cloudyShopData';

import {
  SystemRole,
  formatCurrency,
  formatPersianDate,
  getPersianYear,
  formatRoleName,
  calculateSalesDashboardMetrics,
  postDoubleEntryToAccounts,
  deductStockWithBundles,
  aggregateInvoiceLines,
  validateSettlementAmount,
  restoreStockWithBundles,
  calculateMovingAverageValuation,
  validateJournalEntry,
  buildSalesInvoiceLedgerLines,
  buildPurchaseInvoiceReversalLines,
  buildCustomerRefundLedgerLines,
} from './utils/erpEngine';

import { AccountingModule, AccountingSubTab } from './components/AccountingModule';
import { SellingPosModule } from './components/SellingPosModule';
import { CrmMarketingModule } from './components/CrmMarketingModule';
import { InventoryWmsModule } from './components/InventoryWmsModule';
import { SupportWebshopModule } from './components/SupportWebshopModule';
import { FrappeCoreModule } from './components/FrappeCoreModule';
import { usePersistentArrayState } from './hooks/usePersistentArrayState';
import {
  parseHesabfaImportPayload,
  summarizeHesabfaImport,
} from './utils/hesabfaImport';

type WorkspaceId =
  | 'home'
  | 'accounting'
  | 'selling'
  | 'stock'
  | 'pos'
  | 'crm'
  | 'webshop'
  | 'settings';

const fiscalYearOptions = (() => {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const currentYear = Number(
    getPersianYear().replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
  );
  return Array.from({ length: 3 }, (_, index) =>
    new Intl.NumberFormat('fa-IR', { useGrouping: false }).format(currentYear - index)
  );
})();

const getPostableAccountCodes = (accounts: AccountNode[]) =>
  new Set(
    accounts
      .filter(
        (account) =>
          account.level !== 'گروه' &&
          !accounts.some((candidate) => candidate.parentCode === account.code)
      )
      .map((account) => account.code)
  );

const PRODUCTION_MODE_KEY = 'farapay.v1.production-mode';
const CLOUDY_SHOP_IMPORT_KEY = 'farapay.v3.cloudy-shop-import';

export function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('home');
  const [accountingInitialTab, setAccountingInitialTab] = useState<AccountingSubTab>('coa');
  const [activeRole, setActiveRole] = useState<SystemRole>('ادمین کل (Super Admin)');
  const [activeFiscalYear, setActiveFiscalYear] = useState(() => `سال مالی ${getPersianYear()}`);
  const [defaultBranch, setDefaultBranch] = useState('همه شعب سازمان');
  const [productionMode, setProductionMode] = useState(
    () => window.localStorage.getItem(PRODUCTION_MODE_KEY) === 'true'
  );
  const productionInitialValue = <T,>(value: T[]): T[] => (productionMode ? [] : value);

  // Global Command Bar (Ctrl+K)
  const [showAwesomebar, setShowAwesomebar] = useState(false);
  const [awesomeQuery, setAwesomeQuery] = useState('');

  // Central Double-Entry & Perpetual Inventory State
  const [accounts, setAccounts, accountsStorageError, recoverAccounts] = usePersistentArrayState<AccountNode>(
    'farapay.v1.accounts',
    productionMode
      ? INITIAL_ACCOUNTS.map((account) => ({ ...account, openingBalance: 0, balance: 0 }))
      : INITIAL_ACCOUNTS
  );
  const [glEntries, setGlEntries, glStorageError, recoverGl] = usePersistentArrayState<GLEntryRecord>('farapay.v1.gl-entries', productionInitialValue(INITIAL_GL_ENTRIES));
  const [journalEntries, setJournalEntries, journalStorageError, recoverJournal] = usePersistentArrayState<JournalEntryRecord>(
    'farapay.v1.journal-entries',
    productionInitialValue(INITIAL_JOURNAL_ENTRIES)
  );
  const [salesInvoices, setSalesInvoices, salesStorageError, recoverSales] = usePersistentArrayState<SalesInvoiceRecord>(
    'farapay.v1.sales-invoices',
    productionInitialValue(INITIAL_SALES_INVOICES)
  );
  const [purchaseInvoices, setPurchaseInvoices, purchaseStorageError, recoverPurchases] = usePersistentArrayState<PurchaseInvoiceRecord>(
    'farapay.v1.purchase-invoices',
    productionInitialValue(INITIAL_PURCHASE_INVOICES)
  );
  const [paymentEntries, setPaymentEntries, paymentStorageError, recoverPayments] = usePersistentArrayState<PaymentEntryRecord>(
    'farapay.v1.payment-entries',
    productionInitialValue(INITIAL_PAYMENT_ENTRIES)
  );
  const [cheques, setCheques, chequeStorageError, recoverCheques] = usePersistentArrayState<ChequeRecord>(
    'farapay.v1.cheques',
    productionInitialValue(INITIAL_CHEQUES)
  );
  const [costCenters, setCostCenters, costCenterStorageError, recoverCostCenters] = usePersistentArrayState<CostCenterRecord>(
    'farapay.v1.cost-centers',
    productionInitialValue(INITIAL_COST_CENTERS)
  );
  const [fixedAssets, setFixedAssets, fixedAssetStorageError, recoverFixedAssets] = usePersistentArrayState<FixedAssetRecord>(
    'farapay.v1.fixed-assets',
    productionInitialValue(INITIAL_FIXED_ASSETS)
  );
  const [shareholders, setShareholders, shareholderStorageError, recoverShareholders] = usePersistentArrayState<ShareholderRecord>(
    'farapay.v1.shareholders',
    productionInitialValue(INITIAL_SHAREHOLDERS)
  );
  const [inventoryItems, setInventoryItems, inventoryStorageError, recoverInventory] = usePersistentArrayState<InventoryItemRecord>(
    'farapay.v1.inventory-items',
    CLOUDY_SHOP_INVENTORY
  );
  const [customerContacts, setCustomerContacts, contactStorageError, recoverContacts] = usePersistentArrayState<CustomerContactRecord>(
    'farapay.v1.customer-contacts',
    CLOUDY_SHOP_CONTACTS
  );
  const [crmLeads, setCrmLeads, crmStorageError, recoverCrm] = usePersistentArrayState<CrmLeadRecord>(
    'farapay.v1.crm-leads',
    productionInitialValue(INITIAL_CRM_LEADS)
  );
  const [auditLogs, setAuditLogs, auditStorageError, recoverAuditLogs] = usePersistentArrayState<AuditLogRecord>(
    'farapay.v1.audit-logs',
    productionInitialValue(INITIAL_AUDIT_LOGS)
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(CLOUDY_SHOP_IMPORT_KEY) === '1') return;

    const emptyKeys = [
      'farapay.v1.gl-entries',
      'farapay.v1.journal-entries',
      'farapay.v1.purchase-invoices',
      'farapay.v1.payment-entries',
      'farapay.v1.cheques',
      'farapay.v1.cost-centers',
      'farapay.v1.fixed-assets',
      'farapay.v1.shareholders',
      'farapay.v1.crm-leads',
      'farapay.v1.audit-logs',
    ];
    for (const key of emptyKeys) {
      window.localStorage.setItem(key, '[]');
    }

    const cleanAccounts = accounts.map((account) => ({
      ...account,
      openingBalance: 0,
      balance: 0,
    }));
    const historicalInvoices = salesInvoices
      .filter((invoice) => invoice.docstatus === 1)
      .map((invoice) => ({
        ...invoice,
        isHistoricalArchive: true,
        updateStock: false,
      }));
    window.localStorage.setItem('farapay.v1.accounts', JSON.stringify(cleanAccounts));
    window.localStorage.setItem(
      'farapay.v1.inventory-items',
      JSON.stringify(CLOUDY_SHOP_INVENTORY)
    );
    window.localStorage.setItem(
      'farapay.v1.customer-contacts',
      JSON.stringify(CLOUDY_SHOP_CONTACTS)
    );
    window.localStorage.setItem(
      'farapay.v1.sales-invoices',
      JSON.stringify(historicalInvoices)
    );
    window.localStorage.removeItem('farapay.pending-pos-sales');
    window.localStorage.setItem(PRODUCTION_MODE_KEY, 'true');

    setAccounts(cleanAccounts);
    setGlEntries([]);
    setJournalEntries([]);
    setPurchaseInvoices([]);
    setPaymentEntries([]);
    setCheques([]);
    setCostCenters([]);
    setFixedAssets([]);
    setShareholders([]);
    setCrmLeads([]);
    setAuditLogs([]);
    setSalesInvoices(historicalInvoices);
    setInventoryItems(CLOUDY_SHOP_INVENTORY);
    setCustomerContacts(CLOUDY_SHOP_CONTACTS);
    setProductionMode(true);
    window.localStorage.setItem(CLOUDY_SHOP_IMPORT_KEY, '1');
    setToastMessage(
      historicalInvoices.length === 201
        ? 'داده Cloudy Shop وارد شد: ۳۲۵ کالا، ۲۸ مخاطب و ۲۰۱ فاکتور تاریخی حفظ شد.'
        : `داده Cloudy Shop وارد شد، اما ${historicalInvoices.length} فاکتور ثبت‌شده یافت شد؛ تعداد مورد انتظار ۲۰۱ است.`
    );
  }, [
    accounts,
    salesInvoices,
    setAuditLogs,
    setAccounts,
    setCheques,
    setCostCenters,
    setCrmLeads,
    setFixedAssets,
    setGlEntries,
    setJournalEntries,
    setPaymentEntries,
    setPurchaseInvoices,
    setSalesInvoices,
    setShareholders,
    setInventoryItems,
    setCustomerContacts,
    setProductionMode,
    setToastMessage,
  ]);

  const storageRecoveryIssues = [
    { key: 'farapay.v1.accounts', error: accountsStorageError, recover: recoverAccounts },
    { key: 'farapay.v1.gl-entries', error: glStorageError, recover: recoverGl },
    { key: 'farapay.v1.journal-entries', error: journalStorageError, recover: recoverJournal },
    { key: 'farapay.v1.sales-invoices', error: salesStorageError, recover: recoverSales },
    { key: 'farapay.v1.purchase-invoices', error: purchaseStorageError, recover: recoverPurchases },
    { key: 'farapay.v1.payment-entries', error: paymentStorageError, recover: recoverPayments },
    { key: 'farapay.v1.cheques', error: chequeStorageError, recover: recoverCheques },
    { key: 'farapay.v1.cost-centers', error: costCenterStorageError, recover: recoverCostCenters },
    { key: 'farapay.v1.fixed-assets', error: fixedAssetStorageError, recover: recoverFixedAssets },
    { key: 'farapay.v1.shareholders', error: shareholderStorageError, recover: recoverShareholders },
    { key: 'farapay.v1.inventory-items', error: inventoryStorageError, recover: recoverInventory },
    { key: 'farapay.v1.customer-contacts', error: contactStorageError, recover: recoverContacts },
    { key: 'farapay.v1.crm-leads', error: crmStorageError, recover: recoverCrm },
    { key: 'farapay.v1.audit-logs', error: auditStorageError, recover: recoverAuditLogs },
  ].filter((issue) => issue.error !== null);

  const downloadCorruptedStorage = () => {
    try {
      const recoveryData = Object.fromEntries(
        storageRecoveryIssues.map(({ key }) => [key, window.localStorage.getItem(key)])
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(recoveryData, null, 2)], { type: 'application/json' })
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'farapay-corrupted-storage-recovery.json';
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Could not export corrupted FaraPay storage.', error);
      showToast('خروجی گرفتن از داده‌ی خراب‌شده ناموفق بود؛ داده‌ها دست‌نخورده باقی ماندند.');
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  const handleImportHesabfaData = (value: unknown) => {
    try {
      const payload = parseHesabfaImportPayload(value);
      const summary = summarizeHesabfaImport(payload);
      window.localStorage.setItem(PRODUCTION_MODE_KEY, 'true');
      setProductionMode(true);
      setAccounts((currentAccounts) =>
        currentAccounts.map((account) => ({ ...account, openingBalance: 0, balance: 0 }))
      );
      setGlEntries([]);
      setJournalEntries([]);
      setSalesInvoices(payload.salesInvoices);
      setPurchaseInvoices([]);
      setPaymentEntries([]);
      setCheques([]);
      setCostCenters([]);
      setFixedAssets([]);
      setShareholders([]);
      setInventoryItems(payload.products);
      setCustomerContacts(payload.contacts);
      setCrmLeads([]);
      setAuditLogs([]);
      showToast(
        `ورود انجام شد: ${summary.productCount} کالا، ${summary.contactCount} مخاطب و ${summary.invoiceCount} فاکتور تاریخی.`
      );
    } catch (error) {
      console.error('Hesabfa import failed; existing records were not replaced.', error);
      showToast(
        error instanceof Error
          ? `ورود انجام نشد: ${error.message}`
          : 'ورود انجام نشد؛ داده‌های قبلی دست‌نخورده باقی ماندند.'
      );
    }
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 4200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowAwesomebar((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setShowAwesomebar(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const appendAudit = (
    docType: string,
    docId: string,
    fieldChanged: string,
    oldValue: string,
    newValue: string
  ) => {
    setAuditLogs((prev) => [
      {
        id: `aud-${Date.now()}`,
        timestamp: `${formatPersianDate()} — اکنون`,
        user: 'کاربر فعال',
        role: formatRoleName(activeRole),
        docType,
        docId,
        fieldChanged,
        oldValue,
        newValue,
      },
      ...prev,
    ]);
  };

  const appendGLEntries = (entries: Omit<GLEntryRecord, 'id'>[]) => {
    const withIds: GLEntryRecord[] = entries.map((e, i) => ({
      ...e,
      id: `gle-${Date.now()}-${i}`,
    }));
    setGlEntries((prev) => [...withIds, ...prev]);
  };

  // =========================================================================
  // 1. SALES INVOICE ENGINE (Draft / Submit / Cancel / Credit Note — NO TAX)
  // =========================================================================
  const postSalesInvoiceGLAndStock = (
    inv: SalesInvoiceRecord,
    isReverse = false,
    voucherNo = inv.invoiceNo,
    postingMode: 'invoice' | 'return' = 'invoice'
  ) => {
    const sign = isReverse ? -1 : 1;

    if (!isReverse) {
      const inactiveLine = inv.lines?.find((line) =>
        inventoryItems.some((item) => item.sku === line.sku && item.isActive === false)
      );
      if (inactiveLine) {
        showToast(`کالای ${inactiveLine.sku} غیرفعال است و در فروش جدید قابل انتخاب نیست.`);
        return false;
      }
    }

    let cogsAmount = inv.cogsAmount || 0;
    if (inv.updateStock && (!inv.lines || inv.lines.length === 0)) {
      showToast(`فاکتور ${inv.invoiceNo} ردیف کالای ساخت‌یافته ندارد؛ ثبت یا برگشت انبار امن نیست.`);
      return false;
    }
    if (inv.updateStock) {
      if (!isReverse) {
        const soldLines = inv.lines!.map((l) => ({ sku: l.sku, qty: l.qty }));

        const deduction = deductStockWithBundles(inventoryItems, soldLines);
        if (deduction.insufficientStockError) {
          showToast(deduction.insufficientStockError);
          return false;
        }
        setInventoryItems(deduction.updatedInventory);
        cogsAmount = deduction.totalCogs || cogsAmount;
      } else {
        const soldLines = inv.lines!.map((l) => ({ sku: l.sku, qty: l.qty }));
        setInventoryItems((prev) => restoreStockWithBundles(prev, soldLines));
      }
    }

    const netRevenue = inv.totalAmount;
    const doubleEntryLines = buildSalesInvoiceLedgerLines({
      totalAmount: netRevenue,
      paidAmount: inv.paidAmount,
      cogsAmount,
      updateStock: inv.updateStock,
      isReverse,
      postingMode,
    });

    setAccounts((prev) => postDoubleEntryToAccounts(prev, doubleEntryLines));

    const byCode = new Map<string, AccountNode>(accounts.map((a) => [a.code, a]));
    appendGLEntries(
      doubleEntryLines.map((l) => ({
        postingDate: inv.date,
        accountCode: l.accountCode,
        accountName: byCode.get(l.accountCode)?.name || l.accountCode,
        partyType: 'مشتری',
        partyName: inv.customerName,
        debit: l.debit,
        credit: l.credit,
        voucherType: 'Sales Invoice',
        voucherNo,
        costCenter: inv.costCenter || 'فروشگاه و شوروم شعبه الهیه',
        branchDimension: inv.branchDimension,
        remarks: isReverse
          ? `سند معکوس ابطال/برگشت فاکتور ${inv.invoiceNo}`
          : `ثبت قطعی فاکتور فروش ${inv.invoiceNo}`,
        isReversal: isReverse,
      }))
    );

    if (inv.costCenter) {
      setCostCenters((prev) =>
        prev.map((cc) =>
          cc.name === inv.costCenter
            ? { ...cc, revenueGenerated: Math.max(0, cc.revenueGenerated + sign * netRevenue) }
            : cc
        )
      );
    }

    return true;
  };

  const handleCreateSalesInvoice = (newInv: SalesInvoiceRecord): boolean => {
    const inactiveLine = newInv.lines?.find((line) =>
      inventoryItems.some((item) => item.sku === line.sku && item.isActive === false)
    );
    if (inactiveLine) {
      showToast(`کالای ${inactiveLine.sku} غیرفعال است و در فاکتور فروش جدید قابل استفاده نیست.`);
      return false;
    }
    if (newInv.docstatus === 1) {
      const ok = postSalesInvoiceGLAndStock(newInv, false);
      if (!ok) return false;
    }
    setSalesInvoices((prev) => [newInv, ...prev]);
    appendAudit(
      'فاکتور فروش',
      newInv.invoiceNo,
      'وضعیت سند',
      '—',
      newInv.docstatus === 1 ? 'ثبت قطعی' : 'پیش‌نویس'
    );
    showToast(
      newInv.docstatus === 1
        ? `فاکتور فروش ${newInv.invoiceNo} ثبت قطعی شد و اسناد درآمد و بهای تمام‌شده در دفتر کل صادر گردید.`
        : `فاکتور فروش ${newInv.invoiceNo} به صورت پیش‌نویس ذخیره شد.`
    );
    return true;
  };

  const handleSubmitSalesInvoice = (id: string) => {
    const target = salesInvoices.find((s) => s.id === id);
    if (!target || target.docstatus !== 0) return;
    if (target.isHistoricalArchive) {
      showToast('فاکتور بایگانی تاریخی فقط‌خواندنی است و قابل ثبت قطعی نیست.');
      return;
    }
    const submittedInv: SalesInvoiceRecord = {
      ...target,
      docstatus: 1,
      status: target.paidAmount >= target.totalAmount ? 'پرداخت‌شده' : 'اقساطی فعال',
    };
    const ok = postSalesInvoiceGLAndStock(submittedInv, false);
    if (!ok) return;
    setSalesInvoices((prev) => prev.map((s) => (s.id === id ? submittedInv : s)));
    appendAudit('فاکتور فروش', target.invoiceNo, 'وضعیت سند', 'پیش‌نویس', 'ثبت قطعی');
    showToast(`فاکتور ${target.invoiceNo} از پیش‌نویس به ثبت قطعی تغییر یافت و در دفتر کل ثبت شد.`);
  };

  const handleCancelSalesInvoice = (id: string) => {
    const target = salesInvoices.find((s) => s.id === id);
    if (!target || target.docstatus !== 1) return;
    if (target.isHistoricalArchive) {
      showToast('فاکتور بایگانی تاریخی فقط‌خواندنی است و قابل ابطال یا برگشت نیست.');
      return;
    }
    if (target.returnAgainst) {
      const source = salesInvoices.find((invoice) => invoice.invoiceNo === target.returnAgainst);
      if (!source) {
        showToast(`سند مبنا برای برگشت ${target.invoiceNo} پیدا نشد؛ ابطال انجام نشد.`);
        return;
      }
      if ((target.creditedAmount || 0) > 0) {
        showToast('ابتدا یادداشت بستانکاری مرتبط را ابطال کنید؛ سپس فاکتور اصلی قابل ابطال است.');
        return;
      }
      if (
        paymentEntries.some(
          (entry) =>
            entry.docstatus === 1 &&
            entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
            entry.referenceVoucherNo === target.invoiceNo
        )
      ) {
        showToast('ابتدا اسناد بازپرداخت مرتبط را ابطال کنید؛ سپس یادداشت بستانکاری قابل ابطال است.');
        return;
      }
      if (!postSalesInvoiceGLAndStock(target, false, target.invoiceNo, 'return')) return;
      setSalesInvoices((prev) =>
        prev.map((invoice) =>
          invoice.invoiceNo === source.invoiceNo
            ? { ...invoice, creditedAmount: 0 }
            : invoice.invoiceNo === target.invoiceNo
              ? { ...invoice, docstatus: 2, status: 'ابطال‌شده' }
              : invoice
        )
      );
      appendAudit('یادداشت بستانکاری', target.invoiceNo, 'وضعیت سند', 'ثبت قطعی', 'ابطال‌شده');
      showToast(`یادداشت بستانکاری ${target.invoiceNo} ابطال و اثر آن در دفترکل و انبار معکوس شد.`);
      return;
    }
    if ((target.creditedAmount || 0) > 0) {
      showToast('ابتدا یادداشت بستانکاری مرتبط را ابطال کنید؛ سپس فاکتور اصلی قابل ابطال است.');
      return;
    }
    if (target.paidAmount > 0) {
      showToast('ابتدا اسناد دریافت مرتبط را ابطال کنید؛ فاکتور دارای دریافت را نمی‌توان مستقیم ابطال کرد.');
      return;
    }
    if (!postSalesInvoiceGLAndStock(target, true)) return;
    setSalesInvoices((prev) =>
      prev.map((s) => (s.id === id ? { ...s, docstatus: 2, status: 'ابطال‌شده' } : s))
    );
    appendAudit('فاکتور فروش', target.invoiceNo, 'وضعیت سند', 'ثبت قطعی', 'ابطال‌شده');
    showToast(`فاکتور ${target.invoiceNo} ابطال شد و سند معکوس در دفتر کل و انبار صادر گردید.`);
  };

  const handleCreateCreditNote = (id: string) => {
    const orig = salesInvoices.find((s) => s.id === id);
    if (orig?.isHistoricalArchive) {
      showToast('برای فاکتور بایگانی تاریخی نمی‌توان یادداشت بستانکاری ثبت کرد.');
      return;
    }
    if (
      !orig ||
      orig.docstatus !== 1 ||
      orig.returnAgainst ||
      orig.status === 'مرجوعی (یادداشت بستانکاری)' ||
      (orig.creditedAmount || 0) > 0
    ) {
      showToast('برای این فاکتور یادداشت بستانکاری ثبت‌شده است یا فاکتور قابل برگشت نیست.');
      return;
    }
    const creditNoteNo = `CN-${getPersianYear()}-${String(13 + salesInvoices.length).padStart(4, '0')}`;
    const cn: SalesInvoiceRecord = {
      ...orig,
      id: `cn-${Date.now()}`,
      invoiceNo: creditNoteNo,
      returnAgainst: orig.invoiceNo,
      creditedAmount: 0,
      paidAmount: 0,
      docstatus: 1,
      status: 'مرجوعی (یادداشت بستانکاری)',
      itemsSummary: `برگشت کامل عطف به ${orig.invoiceNo} (${orig.itemsSummary})`,
    };
    if (!postSalesInvoiceGLAndStock(orig, true, creditNoteNo, 'return')) return;
    setSalesInvoices((prev) => [
      cn,
      ...prev.map((invoice) =>
        invoice.invoiceNo === orig.invoiceNo
          ? { ...invoice, creditedAmount: invoice.totalAmount }
          : invoice
      ),
    ]);
    appendAudit('یادداشت بستانکاری', creditNoteNo, 'مبلغ برگشت', '۰ تومان', `${formatCurrency(orig.totalAmount)} تومان`);
    showToast(`یادداشت بستانکاری ${cn.invoiceNo} صادر شد و کالا به انبار بازگشت.`);
  };

  // =========================================================================
  // 2. PURCHASE INVOICE ENGINE (Multi-Line + Landed Cost 2104 + Moving Avg)
  // =========================================================================
  const postPurchaseInvoiceGLAndStock = (
    pinv: PurchaseInvoiceRecord,
    isReverse = false,
    voucherNo = pinv.billNo
  ): boolean => {
    const purchaseLines = aggregateInvoiceLines(pinv.lines || []);

    if (purchaseLines.length === 0) {
      showToast(`فاکتور ${pinv.billNo} ردیف کالای ساخت‌یافته ندارد؛ ثبت یا برگشت انبار امن نیست.`);
      return false;
    }

    if (isReverse) {
      const shortages = purchaseLines
        .map((line) => ({
          line,
          currentQty: inventoryItems.find((item) => item.sku === line.sku)?.stockQty,
        }))
        .filter(({ line, currentQty }) => currentQty === undefined || currentQty < line.qty);
      if (shortages.length > 0) {
        const details = shortages
          .map(({ line, currentQty }) => `${line.sku}: ${currentQty ?? 0} موجود، ${line.qty} لازم`)
          .join('؛ ');
        showToast(`ابطال خرید امن نیست؛ موجودی کالا برای برگشت کافی نیست (${details}).`);
        return false;
      }
    }

    const reverseInventoryValue = isReverse
      ? purchaseLines.reduce((total, line) => {
          const item = inventoryItems.find((candidate) => candidate.sku === line.sku);
          return total + line.qty * (item?.valuationRate || 0);
        }, 0)
      : pinv.totalAmount;
    const supplierNet = Math.max(0, pinv.totalAmount - pinv.landedCostAdded);

    const lines: { accountCode: string; debit: number; credit: number }[] = isReverse
      ? buildPurchaseInvoiceReversalLines(
          pinv.totalAmount,
          pinv.landedCostAdded,
          reverseInventoryValue
        )
      : [
          { accountCode: '1104', debit: pinv.totalAmount, credit: 0 },
          { accountCode: '2101', debit: 0, credit: supplierNet },
          ...(pinv.landedCostAdded > 0
            ? [{ accountCode: '2104', debit: 0, credit: pinv.landedCostAdded }]
            : []),
        ];

    setAccounts((prev) => postDoubleEntryToAccounts(prev, lines));

    const byCode = new Map<string, AccountNode>(accounts.map((a) => [a.code, a]));
    appendGLEntries(
      lines.map((l) => ({
        postingDate: pinv.date,
        accountCode: l.accountCode,
        accountName: byCode.get(l.accountCode)?.name || l.accountCode,
        partyType: 'تامین‌کننده',
        partyName: l.accountCode === '2104' ? 'گمرک و ترخیص‌کار رسمی' : pinv.supplierName,
        debit: l.debit,
        credit: l.credit,
        voucherType: 'Purchase Invoice',
        voucherNo,
        costCenter: pinv.costCenter || 'انبار مرکزی و لجستیک کهریزک',
        branchDimension: pinv.branchDimension || 'انبار مرکزی کهریزک',
        remarks: isReverse
          ? `سند معکوس ابطال/برگشت خرید ${pinv.billNo}`
          : `ورود کالا به انبار و ثبت تعهد خرید ${pinv.billNo}`,
        isReversal: isReverse,
      }))
    );

    if (purchaseLines.length > 0) {
      const totalGoodsNet = purchaseLines.reduce((s, l) => s + l.netLineAmount, 0) || 1;
      setInventoryItems((prev) =>
        prev.map((item) => {
          const pl = purchaseLines.find((l) => l.sku === item.sku);
          if (!pl) return item;
          if (isReverse) {
            const newQty = item.stockQty - pl.qty;
            return {
              ...item,
              stockQty: newQty,
              valuationRate: item.valuationRate,
            };
          }
          const shareOfLanded = Math.round(
            pinv.landedCostAdded * (pl.netLineAmount / totalGoodsNet)
          );
          const effectiveIncomingUnitRate = Math.round(
            (pl.netLineAmount + shareOfLanded) / Math.max(1, pl.qty)
          );
          const mov = calculateMovingAverageValuation(
            item.stockQty,
            item.valuationRate,
            pl.qty,
            effectiveIncomingUnitRate
          );
          return {
            ...item,
            stockQty: mov.newQty,
            valuationRate: mov.newValuationRate,
          };
        })
      );
    }
    return true;
  };

  const handleCreatePurchaseInvoice = (newPinv: PurchaseInvoiceRecord): boolean => {
    if (newPinv.docstatus === 1 && !postPurchaseInvoiceGLAndStock(newPinv, false)) {
      return false;
    }
    setPurchaseInvoices((prev) => [newPinv, ...prev]);
    appendAudit(
      'فاکتور خرید',
      newPinv.billNo,
      'مبلغ کل خرید',
      '۰ تومان',
      `${formatCurrency(newPinv.totalAmount)} تومان`
    );
    showToast(
      newPinv.docstatus === 1
        ? `فاکتور خرید ${newPinv.billNo} ثبت قطعی شد؛ موجودی انبار (۱۱۰۴)، حساب تامین‌کننده (۲۱۰۱) و گمرک (۲۱۰۴) به‌روز شدند.`
        : `فاکتور خرید ${newPinv.billNo} به صورت پیش‌نویس ذخیره شد.`
    );
    return true;
  };

  const handleSubmitPurchaseInvoice = (id: string) => {
    const target = purchaseInvoices.find((p) => p.id === id);
    if (!target || target.docstatus !== 0) return;
    const submitted: PurchaseInvoiceRecord = {
      ...target,
      docstatus: 1,
      status: 'بدهکار باز',
    };
    if (!postPurchaseInvoiceGLAndStock(submitted, false)) return;
    setPurchaseInvoices((prev) => prev.map((p) => (p.id === id ? submitted : p)));
    showToast(`فاکتور خرید ${target.billNo} ثبت قطعی شد و به انبار و دفتر کل منتقل گردید.`);
  };

  const handleCancelPurchaseInvoice = (id: string) => {
    const target = purchaseInvoices.find((p) => p.id === id);
    if (!target || target.docstatus !== 1) return;
    if (target.returnAgainst) {
      const source = purchaseInvoices.find((invoice) => invoice.billNo === target.returnAgainst);
      if (!source) {
        showToast(`سند مبنا برای برگشت ${target.billNo} پیدا نشد؛ ابطال انجام نشد.`);
        return;
      }
      if ((target.creditedAmount || 0) > 0) {
        showToast('ابتدا یادداشت بدهکاری مرتبط را ابطال کنید؛ سپس فاکتور اصلی قابل ابطال است.');
        return;
      }
      if (!postPurchaseInvoiceGLAndStock(target, false)) return;
      setPurchaseInvoices((prev) =>
        prev.map((invoice) =>
          invoice.billNo === source.billNo
            ? { ...invoice, creditedAmount: 0 }
            : invoice.billNo === target.billNo
              ? { ...invoice, docstatus: 2, status: 'ابطال‌شده' }
              : invoice
        )
      );
      showToast(`یادداشت بدهکاری ${target.billNo} ابطال و اثر آن در دفترکل و انبار معکوس شد.`);
      return;
    }
    if ((target.creditedAmount || 0) > 0) {
      showToast('ابتدا یادداشت بدهکاری مرتبط را ابطال کنید؛ سپس فاکتور اصلی قابل ابطال است.');
      return;
    }
    if ((target.paidAmount || 0) > 0) {
      showToast('ابتدا اسناد پرداخت مرتبط را ابطال کنید؛ فاکتور دارای پرداخت را نمی‌توان مستقیم ابطال کرد.');
      return;
    }
    if (!postPurchaseInvoiceGLAndStock(target, true)) return;
    setPurchaseInvoices((prev) =>
      prev.map((p) => (p.id === id ? { ...p, docstatus: 2, status: 'ابطال‌شده' } : p))
    );
    showToast(`فاکتور خرید ${target.billNo} ابطال شد و سند معکوس صادر گردید.`);
  };

  const handleCreateDebitNote = (id: string) => {
    const orig = purchaseInvoices.find((p) => p.id === id);
    if (
      !orig ||
      orig.docstatus !== 1 ||
      orig.returnAgainst ||
      orig.status === 'برگشت از خرید (یادداشت بدهکاری)' ||
      (orig.creditedAmount || 0) > 0
    ) {
      showToast('برای این فاکتور یادداشت بدهکاری ثبت‌شده است یا فاکتور قابل برگشت نیست.');
      return;
    }
    const debitNoteNo = `DN-${getPersianYear()}-${String(10 + purchaseInvoices.length).padStart(4, '0')}`;
    if (!postPurchaseInvoiceGLAndStock(orig, true, debitNoteNo)) return;
    const dn: PurchaseInvoiceRecord = {
      ...orig,
      id: `dn-${Date.now()}`,
      billNo: debitNoteNo,
      returnAgainst: orig.billNo,
      creditedAmount: 0,
      docstatus: 1,
      status: 'برگشت از خرید (یادداشت بدهکاری)',
      itemsSummary: `برگشت کامل از خرید عطف به ${orig.billNo}`,
    };
    setPurchaseInvoices((prev) => [
      dn,
      ...prev.map((invoice) =>
        invoice.billNo === orig.billNo
          ? { ...invoice, creditedAmount: invoice.totalAmount }
          : invoice
      ),
    ]);
    showToast(`یادداشت بدهکاری (برگشت از خرید) ${dn.billNo} ثبت شد.`);
  };

  // =========================================================================
  // 3. JOURNAL ENTRY ENGINE (Draft / Submit / Cancel + Cost Center Spend)
  // =========================================================================
  const postJournalGL = (je: JournalEntryRecord, isReverse = false) => {
    const lines = je.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: isReverse ? l.credit : l.debit,
      credit: isReverse ? l.debit : l.credit,
    }));
    setAccounts((prev) => postDoubleEntryToAccounts(prev, lines));

    appendGLEntries(
      je.lines.map((l) => ({
        postingDate: je.postingDate,
        accountCode: l.accountCode,
        accountName: l.accountName,
        partyType: l.partyType || '—',
        partyName: l.partyName || '—',
        debit: isReverse ? l.credit : l.debit,
        credit: isReverse ? l.debit : l.credit,
        voucherType: 'Journal Entry',
        voucherNo: je.voucherNo,
        costCenter: l.costCenter || 'فروشگاه و شوروم شعبه الهیه',
        branchDimension: l.dimensionBranch || je.branchDimension,
        remarks: isReverse ? `ابطال سند روزنامه: ${je.title}` : l.note || je.title,
        isReversal: isReverse,
      }))
    );

    const sign = isReverse ? -1 : 1;
    setCostCenters((prev) =>
      prev.map((cc) => {
        const ccExpenseDelta = je.lines
          .filter((l) => l.costCenter === cc.name && l.accountCode.startsWith('5'))
          .reduce((s, l) => s + (l.debit - l.credit), 0);
        const ccRevDelta = je.lines
          .filter((l) => l.costCenter === cc.name && l.accountCode.startsWith('4'))
          .reduce((s, l) => s + (l.credit - l.debit), 0);
        return {
          ...cc,
          spentAmount: Math.max(0, cc.spentAmount + sign * ccExpenseDelta),
          revenueGenerated: Math.max(0, cc.revenueGenerated + sign * ccRevDelta),
        };
      })
    );
  };

  const handleSaveJournalEntry = (je: JournalEntryRecord) => {
    const validAccountCodes = getPostableAccountCodes(accounts);
    const validation = validateJournalEntry(je.lines, validAccountCodes);
    if (!validation.isValid) {
      showToast(validation.errorMessage || 'سند روزنامه معتبر نیست و ذخیره نشد.');
      return;
    }
    if (je.docstatus === 1) {
      postJournalGL(je, false);
    }
    setJournalEntries((prev) => [je, ...prev]);
    appendAudit(
      'سند روزنامه',
      je.voucherNo,
      'ثبت سند',
      '—',
      `${je.docstatus === 1 ? 'ثبت قطعی' : 'پیش‌نویس'} (${formatCurrency(je.totalDebit)} تومان)`
    );
    showToast(
      je.docstatus === 1
        ? `سند روزنامه ${je.voucherNo} در دفتر کل ثبت قطعی شد و مراکز هزینه به‌روز گردیدند.`
        : `سند روزنامه ${je.voucherNo} به صورت پیش‌نویس ذخیره شد.`
    );
  };

  const handleSubmitJournalEntry = (id: string) => {
    const target = journalEntries.find((j) => j.id === id);
    if (!target || target.docstatus !== 0) return;
    const validAccountCodes = getPostableAccountCodes(accounts);
    const validation = validateJournalEntry(target.lines, validAccountCodes);
    if (!validation.isValid) {
      showToast(validation.errorMessage || 'سند روزنامه معتبر نیست و ثبت قطعی نشد.');
      return;
    }
    const submitted: JournalEntryRecord = { ...target, docstatus: 1 };
    postJournalGL(submitted, false);
    setJournalEntries((prev) => prev.map((j) => (j.id === id ? submitted : j)));
    showToast(`سند روزنامه ${target.voucherNo} ثبت قطعی شد.`);
  };

  const handleCancelJournalEntry = (id: string) => {
    const target = journalEntries.find((j) => j.id === id);
    if (!target || target.docstatus !== 1) return;
    postJournalGL(target, true);
    setJournalEntries((prev) =>
      prev.map((j) => (j.id === id ? { ...j, docstatus: 2 } : j))
    );
    showToast(`سند روزنامه ${target.voucherNo} ابطال شد و آرتیکل معکوس در دفتر کل صادر گردید.`);
  };

  // =========================================================================
  // 4. PAYMENT ENTRY & CHEQUE CLEARANCE ENGINE
  // =========================================================================
  const handleCreatePaymentEntry = (pe: PaymentEntryRecord) => {
    const bankAccount = accounts.find((account) => account.code === pe.bankAccountCode);
    if (!bankAccount || bankAccount.level === 'گروه' || bankAccount.category !== 'دارایی') {
      showToast('حساب دریافت/پرداخت باید یک حساب جزئی از گروه دارایی‌ها باشد.');
      return;
    }
    if (pe.docstatus !== 1) {
      showToast('سند دریافت/پرداخت جدید باید با وضعیت ثبت قطعی ارسال شود.');
      return;
    }
    const isCustomerRefund = pe.paymentType === 'بازپرداخت به مشتری (Refund)';
    const isReceive = pe.paymentType === 'دریافت از مشتری (Receive)';
    const salesInvoice = isReceive || isCustomerRefund
      ? salesInvoices.find((invoice) => invoice.invoiceNo === pe.referenceVoucherNo)
      : undefined;
    if (salesInvoice?.isHistoricalArchive) {
      showToast('برای فاکتور بایگانی تاریخی نمی‌توان دریافت یا بازپرداخت ثبت کرد.');
      return;
    }
    const purchaseInvoice = !isReceive && !isCustomerRefund
      ? purchaseInvoices.find((invoice) => invoice.billNo === pe.referenceVoucherNo)
      : undefined;
    const invoice = salesInvoice || purchaseInvoice;
    const refundedAmount = isCustomerRefund
      ? paymentEntries
          .filter(
            (entry) =>
              entry.docstatus === 1 &&
              entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
              entry.referenceVoucherNo === pe.referenceVoucherNo
          )
          .reduce((total, entry) => total + entry.amount, 0)
      : 0;
    const refundSourceInvoice =
      isCustomerRefund && salesInvoice?.returnAgainst
        ? salesInvoices.find((candidate) => candidate.invoiceNo === salesInvoice.returnAgainst)
        : undefined;
    const refundableAmount = Math.min(
      invoice?.totalAmount || 0,
      refundSourceInvoice?.paidAmount || 0
    );
    const outstanding = invoice
      ? isCustomerRefund
        ? refundableAmount - refundedAmount
        : invoice.totalAmount - (invoice.paidAmount || 0) - (invoice.creditedAmount || 0)
      : 0;
    const settlementValidation = validateSettlementAmount(pe.amount, outstanding);

    if (
      !settlementValidation.isValid ||
      !invoice ||
      invoice.docstatus !== 1 ||
      (isCustomerRefund
        ? !invoice.returnAgainst ||
          !refundSourceInvoice ||
          invoice.status !== 'مرجوعی (یادداشت بستانکاری)'
        : Boolean(invoice.returnAgainst) || invoice.status === 'مرجوعی (یادداشت بستانکاری)') ||
      invoice.status === 'برگشت از خرید (یادداشت بدهکاری)' ||
      invoice.status === 'ابطال‌شده'
    ) {
      showToast(
        settlementValidation.errorMessage ||
          'فاکتور مرجع برای دریافت/پرداخت معتبر نیست؛ مانده فاکتور را بررسی کنید.'
      );
      return;
    }

    const expectedParty = isReceive || isCustomerRefund
      ? (salesInvoice as SalesInvoiceRecord).customerName
      : (purchaseInvoice as PurchaseInvoiceRecord).supplierName;
    if (pe.partyName.trim() !== expectedParty) {
      showToast('نام طرف حساب با فاکتور مرجع یکسان نیست؛ سند تسویه ثبت نشد.');
      return;
    }

    setPaymentEntries((prev) => [pe, ...prev]);
    const lines = isReceive
      ? [
          { accountCode: pe.bankAccountCode, debit: pe.amount, credit: 0 },
          { accountCode: '1102', debit: 0, credit: pe.amount },
        ]
      : isCustomerRefund
        ? buildCustomerRefundLedgerLines(pe.bankAccountCode, pe.amount)
        : [
          { accountCode: '2101', debit: pe.amount, credit: 0 },
          { accountCode: pe.bankAccountCode, debit: 0, credit: pe.amount },
        ];

    setAccounts((prev) => postDoubleEntryToAccounts(prev, lines));

    const byCode = new Map<string, AccountNode>(accounts.map((a) => [a.code, a]));
    appendGLEntries(
      lines.map((l) => ({
        postingDate: pe.postingDate,
        accountCode: l.accountCode,
        accountName: byCode.get(l.accountCode)?.name || l.accountCode,
        partyType: isReceive || isCustomerRefund ? 'مشتری' : 'تامین‌کننده',
        partyName: pe.partyName,
        debit: l.debit,
        credit: l.credit,
        voucherType: 'Payment Entry',
        voucherNo: pe.paymentNo,
        costCenter: pe.costCenter,
        branchDimension: pe.branchDimension,
        remarks: `${isCustomerRefund ? 'بازپرداخت یادداشت بستانکاری' : 'تسویه فاکتور'} ${pe.referenceVoucherNo} از طریق ${pe.modeOfPayment}`,
      }))
    );

    if (isReceive || isCustomerRefund) {
      setSalesInvoices((prev) =>
        prev.map((s) => {
          if (s.invoiceNo !== pe.referenceVoucherNo) return s;
          const nextPaid = isCustomerRefund ? refundedAmount + pe.amount : s.paidAmount + pe.amount;
          return {
            ...s,
            paidAmount: nextPaid,
            status:
              !isCustomerRefund && nextPaid + (s.creditedAmount || 0) >= s.totalAmount
                ? 'پرداخت‌شده'
                : s.status,
          };
        })
      );
    } else {
      setPurchaseInvoices((prev) =>
        prev.map((p) => {
          if (p.billNo !== pe.referenceVoucherNo) return p;
        const nextPaid = (p.paidAmount || 0) + pe.amount;
          return {
            ...p,
            paidAmount: nextPaid,
          status:
            nextPaid + (p.creditedAmount || 0) >= p.totalAmount ? 'تسویه‌شده' : p.status,
        };
      })
      );
    }

    showToast(
      `سند خزانه ${pe.paymentNo} ثبت شد و مانده فاکتور ${pe.referenceVoucherNo} کاهش یافت.`
    );
  };

  const handleCancelPaymentEntry = (id: string) => {
    const target = paymentEntries.find((entry) => entry.id === id);
    if (!target || target.docstatus !== 1) return;
    const bankAccount = accounts.find((account) => account.code === target.bankAccountCode);
    if (
      !Number.isFinite(target.amount) ||
      target.amount <= 0 ||
      !bankAccount ||
      bankAccount.level === 'گروه' ||
      bankAccount.category !== 'دارایی'
    ) {
      showToast('مبلغ یا حساب دریافت/پرداخت معتبر نیست؛ سند ابطال نشد.');
      return;
    }

    const isCustomerRefund = target.paymentType === 'بازپرداخت به مشتری (Refund)';
    const isReceive = target.paymentType === 'دریافت از مشتری (Receive)';
    const salesInvoice = isReceive || isCustomerRefund
      ? salesInvoices.find((invoice) => invoice.invoiceNo === target.referenceVoucherNo)
      : undefined;
    const purchaseInvoice = !isReceive && !isCustomerRefund
      ? purchaseInvoices.find((invoice) => invoice.billNo === target.referenceVoucherNo)
      : undefined;
    const invoice = salesInvoice || purchaseInvoice;
    if (!invoice || invoice.docstatus !== 1) {
      showToast('فاکتور مرجع معتبر یا ثبت‌شده نیست؛ سند پرداخت ابطال نشد.');
      return;
    }
    const activeRefundAmount = isCustomerRefund
      ? paymentEntries
          .filter(
            (entry) =>
              entry.docstatus === 1 &&
              entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
              entry.referenceVoucherNo === target.referenceVoucherNo
          )
          .reduce((total, entry) => total + entry.amount, 0)
      : invoice.paidAmount || 0;
    if (activeRefundAmount < target.amount) {
      showToast('مانده پرداخت‌شده فاکتور با این سند تطبیق ندارد؛ ابطال برای جلوگیری از مانده نادرست متوقف شد.');
      return;
    }
    if (isReceive && salesInvoice?.creditedAmount) {
      const creditNoteNumbers = new Set(
        salesInvoices
          .filter((candidate) => candidate.returnAgainst === salesInvoice.invoiceNo)
          .map((candidate) => candidate.invoiceNo)
      );
      const refundedAgainstInvoice = paymentEntries
        .filter(
          (entry) =>
            entry.docstatus === 1 &&
            entry.paymentType === 'بازپرداخت به مشتری (Refund)' &&
            creditNoteNumbers.has(entry.referenceVoucherNo)
        )
        .reduce((total, entry) => total + entry.amount, 0);
      if (salesInvoice.paidAmount - target.amount < refundedAgainstInvoice) {
        showToast('ابتدا بازپرداخت‌های انجام‌شده را ابطال کنید؛ دریافت مبنا برای این بازپرداخت لازم است.');
        return;
      }
    }

    const reversalLines = isReceive
      ? [
          { accountCode: target.bankAccountCode, debit: 0, credit: target.amount },
          { accountCode: '1102', debit: target.amount, credit: 0 },
        ]
      : isCustomerRefund
        ? buildCustomerRefundLedgerLines(target.bankAccountCode, target.amount, true)
        : [
          { accountCode: '2101', debit: 0, credit: target.amount },
          { accountCode: target.bankAccountCode, debit: target.amount, credit: 0 },
        ];
    setAccounts((prev) => postDoubleEntryToAccounts(prev, reversalLines));

    const byCode = new Map(accounts.map((account) => [account.code, account.name]));
    appendGLEntries(
      reversalLines.map((line) => ({
        postingDate: formatPersianDate(),
        accountCode: line.accountCode,
        accountName: byCode.get(line.accountCode) || line.accountCode,
        partyType: isReceive || isCustomerRefund ? 'مشتری' : 'تامین‌کننده',
        partyName: target.partyName,
        debit: line.debit,
        credit: line.credit,
        voucherType: 'Payment Entry',
        voucherNo: target.paymentNo,
        costCenter: target.costCenter,
        branchDimension: target.branchDimension,
        remarks: `ابطال سند دریافت/پرداخت ${target.paymentNo}`,
        isReversal: true,
      }))
    );
    setPaymentEntries((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, docstatus: 2 } : entry))
    );

    const nextPaid = activeRefundAmount - target.amount;
    if (salesInvoice && isCustomerRefund) {
      setSalesInvoices((prev) =>
        prev.map((item) =>
          item.id === salesInvoice.id ? { ...item, paidAmount: nextPaid } : item
        )
      );
    } else if (salesInvoice) {
      setSalesInvoices((prev) =>
        prev.map((item) =>
          item.id === salesInvoice.id
            ? {
                ...item,
                paidAmount: nextPaid,
                status:
                  nextPaid + (item.creditedAmount || 0) >= item.totalAmount
                    ? 'پرداخت‌شده'
                    : 'اقساطی فعال',
              }
            : item
        )
      );
    } else if (purchaseInvoice) {
      setPurchaseInvoices((prev) =>
        prev.map((item) =>
          item.id === purchaseInvoice.id
            ? {
                ...item,
                paidAmount: nextPaid,
                status:
                  nextPaid + (item.creditedAmount || 0) >= item.totalAmount
                    ? 'تسویه‌شده'
                    : 'بدهکار باز',
              }
            : item
        )
      );
    }

    appendAudit(
      'سند دریافت و پرداخت',
      target.paymentNo,
      'وضعیت سند',
      'ثبت قطعی',
      'ابطال‌شده'
    );
    showToast(`سند خزانه ${target.paymentNo} ابطال و اثر حسابداری آن معکوس شد.`);
  };

  const handleClearCheque = (id: string) => {
    const target = cheques.find((c) => c.id === id);
    if (!target || target.status !== 'در جریان وصول') return;
    if (!Number.isFinite(target.amount) || target.amount <= 0) {
      showToast('مبلغ چک معتبر نیست؛ وصول ثبت نشد.');
      return;
    }

    const lines =
      target.type === 'دریافتنی از مشتری'
        ? [
            { accountCode: '110101', debit: target.amount, credit: 0 },
            { accountCode: '1103', debit: 0, credit: target.amount },
          ]
        : [
            { accountCode: '2101', debit: target.amount, credit: 0 },
            { accountCode: '110101', debit: 0, credit: target.amount },
          ];
    if (lines.some((line) => !accounts.some((account) => account.code === line.accountCode))) {
      showToast('حساب بانکی یا حساب اسناد در کدینگ پیدا نشد؛ وصول ثبت نشد.');
      return;
    }

    setCheques((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, status: 'وصول‌شده (پاس‌شده)', clearanceDate: formatPersianDate() }
          : c
      )
    );

    appendGLEntries(
      lines.map((line) => ({
        postingDate: formatPersianDate(),
        accountCode: line.accountCode,
        accountName:
          accounts.find((account) => account.code === line.accountCode)?.name ||
          line.accountCode,
        partyType: target.type === 'دریافتنی از مشتری' ? 'مشتری' : 'تامین‌کننده',
        partyName: target.partyName,
        debit: line.debit,
        credit: line.credit,
        voucherType: 'Cheque Clearance',
        voucherNo: target.sayadiNo,
        costCenter: 'فروشگاه و شوروم شعبه الهیه',
        branchDimension: 'شعبه مرکزی تهران',
        remarks: `وصول چک صیادی ${target.sayadiNo} از طریق بانک ملت`,
      }))
    );
    setAccounts((prev) => postDoubleEntryToAccounts(prev, lines));
    showToast(`چک صیادی ${target.sayadiNo} پاس شد و سند انتقال به بانک ملت در دفتر کل ثبت گردید.`);
  };

  // =========================================================================
  // 5. POS & WEBSHOP CHECKOUT HANDLERS (NO TAX)
  // =========================================================================
  const handleCompletePosSale = (
    sales: {
      cartItems: { sku: string; name: string; qty: number; unitPrice: number }[];
      netTotal: number;
      customerName: string;
    }[]
  ): boolean => {
    if (sales.length === 0) return false;

    let updatedInventory = inventoryItems;
    const invoices: SalesInvoiceRecord[] = [];
    const glEntriesToAppend: Omit<GLEntryRecord, 'id'>[] = [];
    const accountingLines: { accountCode: string; debit: number; credit: number }[] = [];
    const totalRevenueByCostCenter = new Map<string, number>();
    const accountNames = new Map(accounts.map((account) => [account.code, account.name]));
    const now = Date.now();

    for (const [index, sale] of sales.entries()) {
      const inactiveItem = sale.cartItems.find((saleItem) =>
        updatedInventory.some(
          (stockItem) => stockItem.sku === saleItem.sku && stockItem.isActive === false
        )
      );
      if (inactiveItem) {
        showToast(`کالای ${inactiveItem.sku} غیرفعال است و در فروش جدید قابل استفاده نیست.`);
        return false;
      }
      if (
        !Number.isFinite(sale.netTotal) ||
        sale.netTotal < 0 ||
        sale.cartItems.length === 0 ||
        sale.cartItems.some(
          (item) =>
            !Number.isFinite(item.qty) ||
            item.qty <= 0 ||
            !updatedInventory.some(
              (stockItem) => stockItem.sku === item.sku && stockItem.isActive !== false
            )
        )
      ) {
        showToast('اطلاعات فیش معتبر نیست؛ فروش ثبت نشد.');
        return false;
      }

      const deduction = deductStockWithBundles(
        updatedInventory,
        sale.cartItems.map((item) => ({ sku: item.sku, qty: item.qty }))
      );
      if (deduction.insufficientStockError) {
        showToast(deduction.insufficientStockError);
        return false;
      }
      updatedInventory = deduction.updatedInventory;

      const invoiceNo = `POS-${getPersianYear()}-${String(210 + salesInvoices.length + index).padStart(4, '0')}`;
      const invoice: SalesInvoiceRecord = {
        id: `pos-${now}-${index}`,
        invoiceNo,
        docstatus: 1,
        customerName: sale.customerName,
        date: formatPersianDate(),
        dueDate: formatPersianDate(),
        branchDimension: 'شعبه الهیه',
        costCenter: 'فروشگاه و شوروم شعبه الهیه',
        channelDimension: 'صندوق فروشگاهی',
        paymentTermsTemplate: 'تسویه آنی کارتخوان',
        updateStock: true,
        isSubscription: false,
        status: 'پرداخت‌شده',
        totalAmount: sale.netTotal,
        paidAmount: sale.netTotal,
        cogsAmount: deduction.totalCogs,
        itemsSummary: sale.cartItems.map((item) => `${item.qty}× ${item.name}`).join(' + '),
      };
      invoices.push(invoice);
      totalRevenueByCostCenter.set(
        invoice.costCenter!,
        (totalRevenueByCostCenter.get(invoice.costCenter!) || 0) + invoice.totalAmount
      );

      const lines = [
        { accountCode: '110102', debit: sale.netTotal, credit: 0 },
        { accountCode: '4101', debit: 0, credit: sale.netTotal },
        { accountCode: '5101', debit: deduction.totalCogs, credit: 0 },
        { accountCode: '1104', debit: 0, credit: deduction.totalCogs },
      ];
      accountingLines.push(...lines);
      glEntriesToAppend.push(
        ...lines.map((line) => ({
          postingDate: invoice.date,
          accountCode: line.accountCode,
          accountName: accountNames.get(line.accountCode) || line.accountCode,
          partyType: 'مشتری' as const,
          partyName: sale.customerName,
          debit: line.debit,
          credit: line.credit,
          voucherType: 'POS Invoice' as const,
          voucherNo: invoiceNo,
          costCenter: invoice.costCenter!,
          branchDimension: invoice.branchDimension,
          remarks: `ثبت فیش صندوق ${invoiceNo}`,
        }))
      );
    }

    setInventoryItems(updatedInventory);
    setSalesInvoices((prev) => [...invoices, ...prev]);
    setAccounts((prev) => postDoubleEntryToAccounts(prev, accountingLines));
    appendGLEntries(glEntriesToAppend);
    setCostCenters((prev) =>
      prev.map((center) => ({
        ...center,
        revenueGenerated:
          center.revenueGenerated + (totalRevenueByCostCenter.get(center.name) || 0),
      }))
    );
    setAuditLogs((prev) => [
      ...invoices.map((invoice, index) => ({
        id: `aud-${now}-${index}`,
        timestamp: '۱۴۰۴/۰۸/۰۲ — اکنون',
        user: 'کاربر فعال',
        role: formatRoleName(activeRole),
        docType: 'فیش صندوق',
        docId: invoice.invoiceNo,
        fieldChanged: 'وضعیت سند',
        oldValue: '—',
        newValue: 'ثبت قطعی',
      })),
      ...prev,
    ]);

    showToast(
      `${invoices.length} فیش صندوق ثبت شد؛ موجودی، دفتر کل و تاریخچه تغییرات به‌روز شدند.`
    );
    return true;
  };

  const handleWebshopOrderCheckout = (item: InventoryItemRecord) => {
    handleCompletePosSale(
      [
        {
          cartItems: [{ sku: item.sku, name: item.name, qty: 1, unitPrice: item.retailPrice }],
          netTotal: item.retailPrice,
          customerName: 'مشتری آنلاین وب‌شاپ',
        },
      ]
    );
  };

  // =========================================================================
  // NAVIGATION & FRAPPE DESK WORKSPACE DEFINITIONS (PRUNED)
  // =========================================================================
  const sidebarWorkspaces: {
    id: WorkspaceId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'home', label: 'میزکار', icon: Home },
    { id: 'accounting', label: 'حسابداری', icon: Calculator },
    { id: 'selling', label: 'فروش', icon: ShoppingCart },
    { id: 'pos', label: 'صندوق فروشگاهی', icon: Store },
    { id: 'crm', label: 'ارتباط با مشتری', icon: Users },
    { id: 'stock', label: 'انبار و کالا', icon: Package },
    { id: 'webshop', label: 'وبسایت و فروشگاه اینترنتی', icon: Globe },
    { id: 'settings', label: 'تنظیمات و هسته سیستم', icon: Settings },
  ];

  const openWorkspaceWithTab = (ws: WorkspaceId, accTab?: AccountingSubTab) => {
    if (accTab) {
      setAccountingInitialTab(accTab);
    }
    setActiveWorkspace(ws);
    setShowAwesomebar(false);
  };

  const awesomebarCommands = [
    { title: 'صدور فاکتور فروش چندردیفه جدید', category: 'فروش و حسابداری', action: () => openWorkspaceWithTab('accounting', 'sales_invoice') },
    { title: 'ثبت فاکتور خرید و هزینه گمرک (حساب ۲۱۰۴)', category: 'خرید و حسابداری', action: () => openWorkspaceWithTab('accounting', 'purchase_invoice') },
    { title: 'ثبت سند روزنامه دوبل', category: 'حسابداری', action: () => openWorkspaceWithTab('accounting', 'journal') },
    { title: 'مشاهده تراز آزمایشی ۶ ستونی و دفتر کل', category: 'گزارش‌های مالی', action: () => openWorkspaceWithTab('accounting', 'gl_trial') },
    { title: 'درخت حساب‌ها', category: 'حسابداری', action: () => openWorkspaceWithTab('accounting', 'coa') },
    { title: 'خزانه‌داری، چک صیادی و تسعیر ارز', category: 'خزانه‌داری', action: () => openWorkspaceWithTab('accounting', 'payment_cheques') },
    { title: 'باز کردن صندوق فروشگاهی لمسی', category: 'فروش حضوری', action: () => openWorkspaceWithTab('pos') },
    { title: 'انبار، کاردکس کالا و درخواست شارژ کالا', category: 'انبار و کالا', action: () => openWorkspaceWithTab('stock') },
    { title: 'قیف سرنخ‌ها و فرصت‌های فروش', category: 'ارتباط با مشتری', action: () => openWorkspaceWithTab('crm') },
    { title: 'فروشگاه اینترنتی و پورتال مشتریان', category: 'وبسایت و فروشگاه اینترنتی', action: () => openWorkspaceWithTab('webshop') },
    { title: 'تنظیمات هسته، گزارش‌ساز، اکسل و دسترسی‌ها', category: 'تنظیمات سیستم', action: () => openWorkspaceWithTab('settings') },
  ];

  const filteredCommands = awesomebarCommands.filter(
    (c) =>
      c.title.includes(awesomeQuery) ||
      c.category.includes(awesomeQuery)
  );

  const dashboardMetrics = calculateSalesDashboardMetrics(salesInvoices, inventoryItems);
  const dashboardCards = [
    {
      label: 'درآمد دوره',
      value: dashboardMetrics.totalSales,
      detail: `${dashboardMetrics.postedInvoiceCount} فاکتور قطعی، شامل آرشیو تاریخی`,
    },
    {
      label: 'فروش کل',
      value: dashboardMetrics.totalSales,
      detail: 'جمع مبلغ فاکتورهای دارای وضعیت ثبت قطعی',
    },
    {
      label: 'مجموع وصولی‌های فاکتور',
      value: dashboardMetrics.cashReceived,
      detail: 'جمع پرداخت درج‌شده روی فاکتورها؛ نه مانده فعلی صندوق و بانک',
    },
    {
      label: 'مطالبات تاریخی',
      value: dashboardMetrics.receivables,
      detail: 'فروش قطعی منهای دریافتی درج‌شده روی فاکتورها',
    },
    {
      label: 'سود برآوردی دوره',
      value: dashboardMetrics.estimatedProfit,
      detail: [
        dashboardMetrics.estimatedCostLineCount > 0
          ? `بهای ${dashboardMetrics.estimatedCostLineCount} ردیف با فرض ۷۵٪ مبلغ فروش تخمین زده شده`
          : 'بهای ردیف‌ها از نرخ‌های ثبت‌شده محاسبه شده',
        dashboardMetrics.missingCostLineCount > 0
          ? `بهای ${dashboardMetrics.missingCostLineCount} ردیف هنوز نامشخص است`
          : 'سود تاریخی به‌دلیل نبود بهای خرید واقعی قطعی نیست',
      ].join('؛ '),
    },
    {
      label: 'ارزش موجودی انبار',
      value: dashboardMetrics.inventoryValue,
      detail: 'مجموع تعداد موجودی × بهای ارزش‌گذاری ثبت‌شده',
    },
    {
      label: 'دارایی محاسباتی',
      value: dashboardMetrics.estimatedAssets,
      detail: 'ارزش موجودی + دریافتی تاریخی + مطالبات تاریخی؛ نه ترازنامه',
    },
    {
      label: 'گردش دفتر کل',
      value: glEntries.length,
      detail: 'آرتیکل ثبت‌شده؛ فاکتورهای آرشیوی در دفتر کل ثبت نشده‌اند',
      isCount: true,
    },
  ];
  const currentWorkspaceObj =
    sidebarWorkspaces.find((w) => w.id === activeWorkspace) || sidebarWorkspaces[0];

  const handleExportFullDatabase = () => {
    const dataStr = JSON.stringify(
      {
        company: 'سامانه جامع برنامه‌ریزی منابع سازمانی امکان',
        fiscalYear: activeFiscalYear,
        accounts,
        glEntries,
        salesInvoices,
        purchaseInvoices,
        inventoryItems,
      },
      null,
      2
    );
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cloudy-shop-data-export.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('نسخه پشتیبان کامل پایگاه داده با موفقیت دانلود شد.');
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200 h-16 px-3 md:px-4 lg:px-8 flex items-center justify-between gap-2 md:gap-4">
        {/* Right: Brand + Breadcrumb */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveWorkspace('home')}
            className="flex items-center gap-2.5 text-right group"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base">
              ا
            </div>
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">
              امکان
            </span>
          </button>

          <ChevronLeft className="w-4 h-4 text-slate-300 hidden sm:block" />

          <span className="text-sm font-semibold text-slate-700 hidden sm:inline-block whitespace-nowrap">
            {currentWorkspaceObj.label}
          </span>
        </div>

        {/* Center: Command Search Bar (Ctrl+K) */}
        <div className="flex-1 min-w-0 max-w-md">
          <button
            type="button"
            aria-label="جستجو در بخش‌ها، اسناد و گزارش‌ها"
            onClick={() => setShowAwesomebar(true)}
            className="w-full min-w-0 px-3.5 py-2 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200/70 border border-slate-200/80 rounded-lg flex items-center justify-between transition-colors"
          >
            <span className="inline-flex min-w-0 items-center gap-2 truncate">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="hidden sm:inline truncate">جستجو در بخش‌ها، اسناد و گزارش‌ها...</span>
            </span>
            <kbd className="hidden sm:block px-2 py-0.5 text-[11px] font-medium bg-white text-slate-600 rounded border border-slate-200 shrink-0">
              جستجو
            </kbd>
          </button>
        </div>

        {/* Left: Fiscal Year, Branch Selector & Role Selector */}
        <div className="flex items-center gap-2.5 text-xs shrink-0">
          <div className="hidden md:flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/80">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              aria-label="انتخاب سال مالی"
              value={activeFiscalYear}
              onChange={(e) => setActiveFiscalYear(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
            >
              {fiscalYearOptions.map((year) => (
                <option key={year} value={`سال مالی ${year}`}>
                  سال مالی {year}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200/80">
            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              aria-label="انتخاب شعبه فعال"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
            >
              <option value="همه شعب سازمان">همه شعب سازمان</option>
              <option value="شعبه مرکزی تهران">شعبه مرکزی تهران</option>
              <option value="شعبه الهیه">شعبه الهیه</option>
              <option value="انبار مرکزی کهریزک">انبار مرکزی کهریزک</option>
            </select>
          </div>

          <select
            aria-label="انتخاب نقش کاربری"
            value={activeRole}
            onChange={(e) => setActiveRole(e.target.value as SystemRole)}
            className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg focus:outline-none"
          >
            <option value="ادمین کل (Super Admin)">نقش: مدیر کل سامانه</option>
            <option value="مدیر مالی (Accounts Manager)">نقش: مدیر مالی</option>
            <option value="سرپرست انبار (Stock Manager)">نقش: سرپرست انبار</option>
            <option value="صندوقدار POS">نقش: صندوقدار</option>
          </select>
        </div>
      </header>

      {storageRecoveryIssues.length > 0 && (
        <section className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h2 className="font-bold">ذخیره‌ی محلی قابل خواندن نیست</h2>
          <p className="mt-1">
            داده‌ی مشکل‌دار بازنویسی نشده است. ابتدا از مقادیر خام نسخه‌ی پشتیبان بگیرید؛ سپس
            می‌توانید فقط بخش‌های خراب را با داده‌ی اولیه جایگزین کنید. تغییرات جدید در آن بخش‌ها
            تا زمان بازیابی/جایگزینی ذخیره نخواهند شد.
          </p>
          <button
            type="button"
            onClick={downloadCorruptedStorage}
            className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
          >
            دانلود نسخه‌ی بازیابی داده‌های خراب
          </button>
          <ul className="mt-3 space-y-2">
            {storageRecoveryIssues.map((issue) => (
              <li key={issue.key} className="flex flex-wrap items-center justify-between gap-2">
                <span>{issue.error}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `ذخیره‌ی خراب "${issue.key}" با داده‌ی اولیه جایگزین شود؟ ابتدا نسخه‌ی بازیابی را دانلود کنید.`
                      )
                    ) {
                      issue.recover();
                    }
                  }}
                  className="rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-amber-100"
                >
                  جایگزینی این بخش با داده‌ی اولیه
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Main Layout */}
      <div className="flex-1 max-w-[1600px] w-full mx-auto flex gap-6 p-4 lg:p-6 items-start">
        {/* Sidebar Navigation */}
        <aside className="w-64 shrink-0 hidden md:flex flex-col gap-1.5 bg-white p-3.5 rounded-xl border border-slate-200/90 sticky top-22">
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-400">
            بخش‌های سامانه
          </div>
          {sidebarWorkspaces.map((ws) => {
            const Icon = ws.icon;
            const isActive = activeWorkspace === ws.id;
            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => {
                  if (ws.id === 'selling') {
                    openWorkspaceWithTab('selling', 'sales_invoice');
                  } else if (ws.id === 'accounting') {
                    openWorkspaceWithTab('accounting', 'coa');
                  } else {
                    setActiveWorkspace(ws.id);
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white font-semibold'
                    : 'text-slate-700 font-medium hover:bg-slate-100'
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">{ws.label}</span>
                </span>
              </button>
            );
          })}
        </aside>

        {/* Main Workspace Content */}
        <main className="flex-1 min-w-0 space-y-6">
          {productionMode && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              <strong>آمار تاریخی از فاکتورهای حسابفا محاسبه می‌شود:</strong> فاکتورهای آرشیوی در فروش، دریافتی و مطالبات داشبورد شمرده می‌شوند، اما همچنان فقط‌خواندنی‌اند و بر دفتر کل یا موجودی اثر ندارند. دریافتی و مطالبات، مانده واقعی صندوق/بانک یا دفتر کل نیستند؛ سود نیز در صورت نبود بهای خرید بعضی اقلام، برآوردی است.
            </div>
          )}
          {/* Mobile Quick Switcher */}
          <div className="flex md:hidden overflow-x-auto gap-2 pb-1">
            {sidebarWorkspaces.map((ws) => (
              <button
                key={ws.id}
                type="button"
                onClick={() => setActiveWorkspace(ws.id)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                  activeWorkspace === ws.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {ws.label}
              </button>
            ))}
          </div>

          {/* WORKSPACE 1: HOME DASHBOARD */}
          {activeWorkspace === 'home' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h1 className="text-lg font-bold text-slate-900">
                    میزکار مدیریتی سازمان
                  </h1>
                  <p className="text-sm text-slate-500">
                    نمای کلی شاخص‌های مالی، وضعیت موجودی انبار و دسترسی سریع به عملیات روزانه
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openWorkspaceWithTab('accounting', 'sales_invoice')}
                    className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                  >
                    + صدور فاکتور فروش
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkspaceWithTab('accounting', 'journal')}
                    className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                  >
                    + ثبت سند روزنامه
                  </button>
                  <button
                    type="button"
                    onClick={() => openWorkspaceWithTab('pos')}
                    className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap"
                  >
                    صندوق فروشگاهی
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {dashboardCards.map((card) => (
                  <div key={card.label} className="bg-white p-5 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-xs font-medium text-slate-500">{card.label}</div>
                    <div className="font-mono tabular-nums font-bold text-lg text-slate-900">
                      {card.isCount ? card.value : formatCurrency(card.value)}{' '}
                      <span className="text-xs font-normal text-slate-500">
                        {card.isCount ? 'آرتیکل' : 'تومان'}
                      </span>
                    </div>
                    <div className="text-xs leading-5 text-slate-500">{card.detail}</div>
                  </div>
                ))}
              </div>

              {/* Shortcut Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  {
                    title: 'حسابداری و مدیریت مالی',
                    desc: 'درخت حساب‌ها، تراز آزمایشی، اسناد روزنامه و خزانه‌داری',
                    links: [
                      { label: 'درخت حساب‌ها', act: () => openWorkspaceWithTab('accounting', 'coa') },
                      { label: 'دفتر کل و تراز آزمایشی', act: () => openWorkspaceWithTab('accounting', 'gl_trial') },
                      { label: 'ثبت سند روزنامه', act: () => openWorkspaceWithTab('accounting', 'journal') },
                      { label: 'خزانه‌داری، چک و ارز', act: () => openWorkspaceWithTab('accounting', 'payment_cheques') },
                    ],
                  },
                  {
                    title: 'فروش، خرید و صندوق',
                    desc: 'فاکتورهای فروش و خرید، صندوق فروشگاهی و مشتریان',
                    links: [
                      { label: 'فاکتورهای فروش و اقساط', act: () => openWorkspaceWithTab('selling', 'sales_invoice') },
                      { label: 'فاکتورهای خرید کالا', act: () => openWorkspaceWithTab('accounting', 'purchase_invoice') },
                      { label: 'صندوق فروشگاهی و پیش‌فاکتور', act: () => openWorkspaceWithTab('pos') },
                      { label: 'ارتباط با مشتری و کمپین‌ها', act: () => openWorkspaceWithTab('crm') },
                    ],
                  },
                  {
                    title: 'انبار، وب‌شاپ و تنظیمات',
                    desc: 'کاردکس کالا، درخواست شارژ انبار، فروشگاه آنلاین و هسته',
                    links: [
                      { label: 'انبار، کاردکس و شارژ کالا', act: () => openWorkspaceWithTab('stock') },
                      { label: 'وبسایت و فروشگاه اینترنتی', act: () => openWorkspaceWithTab('webshop') },
                      { label: 'گزارش‌ساز، اکسل و دسترسی‌ها', act: () => openWorkspaceWithTab('settings') },
                      { label: 'دارایی‌های ثابت و سهامداران', act: () => openWorkspaceWithTab('accounting', 'assets') },
                    ],
                  },
                ].map((box) => (
                  <div
                    key={box.title}
                    className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-slate-900">{box.title}</h3>
                      <p className="text-xs text-slate-500">{box.desc}</p>
                    </div>
                    <div className="space-y-1.5 pt-3 border-t border-slate-100">
                      {box.links.map((lnk) => (
                        <button
                          key={lnk.label}
                          type="button"
                          onClick={lnk.act}
                          className="w-full py-2 px-3 text-xs font-medium text-slate-700 hover:text-indigo-700 hover:bg-slate-50 rounded-lg flex items-center justify-between transition-colors"
                        >
                          <span>{lnk.label}</span>
                          <ArrowUpLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WORKSPACE 2 & 3: ACCOUNTING / SELLING */}
          {(activeWorkspace === 'accounting' || activeWorkspace === 'selling') && (
            <AccountingModule
              productionMode={productionMode}
              activeRole={activeRole}
              defaultBranch={defaultBranch}
              activeFiscalYear={activeFiscalYear}
              initialSubTab={accountingInitialTab}
              accounts={accounts}
              onAddAccount={(newAcc) => setAccounts((prev) => [...prev, newAcc])}
              glEntries={glEntries}
              journalEntries={journalEntries}
              onSaveJournalEntry={handleSaveJournalEntry}
              onSubmitJournalEntry={handleSubmitJournalEntry}
              onCancelJournalEntry={handleCancelJournalEntry}
              salesInvoices={salesInvoices}
              onCreateSalesInvoice={handleCreateSalesInvoice}
              onSubmitSalesInvoice={handleSubmitSalesInvoice}
              onCancelSalesInvoice={handleCancelSalesInvoice}
              onCreateCreditNote={handleCreateCreditNote}
              purchaseInvoices={purchaseInvoices}
              onCreatePurchaseInvoice={handleCreatePurchaseInvoice}
              onSubmitPurchaseInvoice={handleSubmitPurchaseInvoice}
              onCancelPurchaseInvoice={handleCancelPurchaseInvoice}
              onCreateDebitNote={handleCreateDebitNote}
              paymentEntries={paymentEntries}
              onCreatePaymentEntry={handleCreatePaymentEntry}
              onCancelPaymentEntry={handleCancelPaymentEntry}
              cheques={cheques}
              onClearCheque={handleClearCheque}
              costCenters={costCenters}
              onUpdateCostCenterPolicy={(id, policy) => {
                setCostCenters((prev) =>
                  prev.map((c) => (c.id === id ? { ...c, controlPolicy: policy } : c))
                );
                showToast(`سیاست کنترل بودجه مرکز هزینه به «${policy === 'STOP' ? 'توقف کامل ثبت' : 'هشدار'}» تغییر یافت.`);
              }}
              fixedAssets={fixedAssets}
              onScrapOrSellAsset={(id, newStatus) => {
                setFixedAssets((prev) =>
                  prev.map((a) =>
                    a.id === id
                      ? {
                          ...a,
                          status: newStatus,
                          currentBookValue:
                            newStatus === 'تجدید ارزیابی‌شده'
                              ? Math.round(a.currentBookValue * 1.25)
                              : a.currentBookValue,
                        }
                      : a
                  )
                );
                showToast(`وضعیت دارایی ثابت به «${newStatus}» تغییر یافت و سند مربوطه صادر شد.`);
              }}
              shareholders={shareholders}
              inventoryItems={inventoryItems}
              onShowToast={showToast}
            />
          )}

          {/* WORKSPACE 4: STOCK & MATERIAL REQUEST */}
          {activeWorkspace === 'stock' && (
            <InventoryWmsModule
              productionMode={productionMode}
              activeRole={activeRole}
              items={inventoryItems}
              onUpdateItemStock={(sku, newPhysicalQty, varianceValue) => {
                const voucherNo = `STK-${getPersianYear()}-${Date.now()}`;
                const absoluteVariance = Math.abs(Math.round(varianceValue));
                const isSurplus = varianceValue > 0;
                const adjustmentLines =
                  absoluteVariance === 0
                    ? []
                    : [
                        {
                          accountCode: isSurplus ? '1104' : '5203',
                          debit: absoluteVariance,
                          credit: 0,
                        },
                        {
                          accountCode: isSurplus ? '4103' : '1104',
                          debit: 0,
                          credit: absoluteVariance,
                        },
                      ];

                if (adjustmentLines.length > 0) {
                  setAccounts((prev) => postDoubleEntryToAccounts(prev, adjustmentLines));
                  const byCode = new Map(accounts.map((account) => [account.code, account]));
                  appendGLEntries(
                    adjustmentLines.map((line) => ({
                      postingDate: formatPersianDate(),
                      accountCode: line.accountCode,
                      accountName: byCode.get(line.accountCode)?.name || line.accountCode,
                      partyType: '—',
                      partyName: 'انبار مرکزی کهریزک',
                      debit: line.debit,
                      credit: line.credit,
                      voucherType: 'Stock Reconciliation',
                      voucherNo,
                      costCenter: 'انبار مرکزی و لجستیک کهریزک',
                      branchDimension: 'انبار مرکزی کهریزک',
                      remarks: `تعدیل موجودی کالا ${sku}`,
                    }))
                  );
                }

                setInventoryItems((prev) =>
                  prev.map((item) =>
                    item.sku === sku ? { ...item, stockQty: newPhysicalQty } : item
                  )
                );
                const currentQty = inventoryItems.find((item) => item.sku === sku)?.stockQty;
                appendAudit(
                  'انبارگردانی',
                  voucherNo,
                  `موجودی ${sku}`,
                  `${currentQty ?? 'نامشخص'} عدد`,
                  `${newPhysicalQty} عدد`
                );
                return voucherNo;
              }}
              onAddGeneratedVariants={(newVars) =>
                setInventoryItems((prev) => {
                  const existingSkus = new Set(prev.map((item) => item.sku));
                  const uniqueVariants = newVars.filter((item) => {
                    if (existingSkus.has(item.sku)) return false;
                    existingSkus.add(item.sku);
                    return true;
                  });
                  return [...uniqueVariants, ...prev];
                })
              }
              onShowToast={showToast}
            />
          )}

          {/* WORKSPACE 5: POS */}
          {activeWorkspace === 'pos' && (
            <SellingPosModule
              productionMode={productionMode}
              contacts={customerContacts}
              inventoryItems={inventoryItems}
              onCompletePosSale={handleCompletePosSale}
              onShowToast={showToast}
            />
          )}

          {/* WORKSPACE 6: CRM */}
          {activeWorkspace === 'crm' && (
            <CrmMarketingModule
              productionMode={productionMode}
              leads={crmLeads}
              contacts={customerContacts}
              onAddLead={(lead) => setCrmLeads((prev) => [lead, ...prev])}
              onAdvanceLeadStage={(id) => {
                setCrmLeads((prev) =>
                  prev.map((l) =>
                    l.id === id
                      ? { ...l, stage: 'ارسال پیش‌فاکتور', probability: Math.min(95, l.probability + 20) }
                      : l
                  )
                );
                showToast('مرحله فرصت فروش در قیف ارتباط با مشتری ارتقا یافت.');
              }}
              onShowToast={showToast}
            />
          )}

          {/* WORKSPACE 7: WEBSITE, WEBSHOP & PORTAL */}
          {activeWorkspace === 'webshop' && (
            <SupportWebshopModule
              productionMode={productionMode}
              inventoryItems={inventoryItems}
              salesInvoices={salesInvoices}
              onWebshopOrderCheckout={handleWebshopOrderCheckout}
              onShowToast={showToast}
            />
          )}

          {/* WORKSPACE 8: SETTINGS & CORE */}
          {activeWorkspace === 'settings' && (
            <FrappeCoreModule
              auditLogs={auditLogs}
              onExportFullData={handleExportFullDatabase}
              onShowToast={showToast}
              onImportHesabfaData={handleImportHesabfaData}
            />
          )}
        </main>
      </div>

      {/* Global Search Modal */}
      {showAwesomebar && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-20 p-4"
          onClick={() => setShowAwesomebar(false)}
        >
          <div
            className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                placeholder="جستجوی فرم، گزارش، سند یا فرمان..."
                value={awesomeQuery}
                onChange={(e) => setAwesomeQuery(e.target.value)}
                className="w-full text-xs text-slate-900 focus:outline-none"
              />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {filteredCommands.map((cmd) => (
                <button
                  key={cmd.title}
                  type="button"
                  onClick={cmd.action}
                  className="w-full px-4 py-2.5 text-right text-xs hover:bg-slate-50 flex items-center justify-between"
                >
                  <span className="font-medium text-slate-800">{cmd.title}</span>
                  <span className="text-[11px] text-slate-400">{cmd.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2.5 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default App;
