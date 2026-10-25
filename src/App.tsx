import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Home,
  Calculator,
  Package,
  Store,
  Users,
  Globe,
  Settings,
  Search,
  CheckCircle2,
  Calendar as CalendarIcon,
  BarChart3,
  Sparkles,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Undo2,
  Redo2,
  Save,
  AlertTriangle,
  ArrowUpLeft,
  ShieldCheck,
  Truck,
} from 'lucide-react';

import {
  INITIAL_ACCOUNTS,
  INITIAL_GL_ENTRIES,
  INITIAL_SALES_INVOICES,
  INITIAL_PURCHASE_INVOICES,
  INITIAL_JOURNAL_ENTRIES,
  INITIAL_PAYMENT_ENTRIES,
  INITIAL_COST_CENTERS,
  INITIAL_FIXED_ASSETS,
  INITIAL_SHAREHOLDERS,
  INITIAL_CRM_LEADS,
  INITIAL_AUDIT_LOGS,
  INITIAL_WAREHOUSES,
  INITIAL_MASTER_OPTIONS,
  INITIAL_RECURRING_EXPENSE_TEMPLATES,
  INITIAL_PROMOTION_RULES,
  DEFAULT_BRANCH_NAME,
  AccountNode,
  GLEntryRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  JournalEntryRecord,
  PaymentEntryRecord,
  CostCenterRecord,
  FixedAssetRecord,
  ShareholderRecord,
  ShareholderRuleSnapshot,
  ShareholderDrawingRecord,
  RecurringExpenseTemplate,
  MonthlyExpenseLedgerRecord,
  InventoryItemRecord,
  CustomerContactRecord,
  BulkSmsContactRecord,
  CrmLeadRecord,
  AuditLogRecord,
  WarehouseRecord,
  MasterOptionsRegistry,
  PromotionRuleRecord,
  OperationalCalendarEvent,
  CustomerWishlistRecord,
  WarehouseKey,
} from './data/erpSeedData';
import { CLOUDY_SHOP_CONTACTS, CLOUDY_SHOP_INVENTORY } from './data/cloudyShopData';

import {
  SystemRole,
  formatCurrency,
  formatPersianDate,
  getPersianYear,
  postDoubleEntryToAccounts,
  deductStockWithBundles,
  restoreStockWithBundles,
  calculateMovingAverageValuation,
  deductDecantMlFromBottle,
  consumeFifoLayers,
  calculateThreeBucketShareholderState,
  voidInvoice,
} from './utils/erpEngine';

import { AccountingModule, AccountingSubTab } from './components/AccountingModule';
import {
  SellingPosModule,
  PosCheckoutPayload,
  PosReturnPayload,
} from './components/SellingPosModule';
import { CrmMarketingModule } from './components/CrmMarketingModule';
import { InventoryWmsModule } from './components/InventoryWmsModule';
import { AnalyticsBiModule } from './components/AnalyticsBiModule';
import { OperationalCalendarModule } from './components/OperationalCalendarModule';
import { SupportWebshopModule } from './components/SupportWebshopModule';
import { FrappeCoreModule } from './components/FrappeCoreModule';
import { usePersistentArrayState } from './hooks/usePersistentArrayState';
import {
  parseHesabfaImportPayload,
  summarizeHesabfaImport,
} from './utils/hesabfaImport';

type WorkspaceId =
  | 'home'
  | 'pos'
  | 'stock'
  | 'festivals'
  | 'accounting'
  | 'analytics'
  | 'crm'
  | 'calendar'
  | 'webshop'
  | 'settings';

const WORKSPACE_TO_PATH: Record<WorkspaceId, string> = {
  home: '/',
  pos: '/pos',
  stock: '/stock',
  festivals: '/festivals',
  accounting: '/accounting',
  analytics: '/analytics',
  crm: '/crm',
  calendar: '/calendar',
  webshop: '/webshop',
  settings: '/settings',
};

const getWorkspaceFromPath = (pathname: string): WorkspaceId => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const entry = (Object.entries(WORKSPACE_TO_PATH) as [WorkspaceId, string][]).find(
    ([, p]) => p === clean
  );
  return entry ? entry[0] : 'home';
};

interface SystemBackupSnapshot {
  id: string;
  timestamp: string;
  label: string;
  accounts: AccountNode[];
  glEntries: GLEntryRecord[];
  journalEntries: JournalEntryRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  inventoryItems: InventoryItemRecord[];
  customerContacts: CustomerContactRecord[];
  shareholders: ShareholderRecord[];
}

const PRODUCTION_MODE_KEY = 'farapay.v1.production-mode';
const CLOUDY_SHOP_V4_KEY = 'farapay.v4.cloudy-shop-4wh-init';

// Normalize Cloudy Shop inventory into Central External warehouse by default
const normalizeCloudyShopInventory = (
  items: InventoryItemRecord[]
): InventoryItemRecord[] =>
  items.map((item) => {
    const isPc =
      item.category === 'قطعات کامپیوتر و سخت‌افزار' ||
      item.name.toLowerCase().includes('rtx') ||
      item.name.toLowerCase().includes('ssd');
    const existingWh = item.warehouseStock;
    const hasWhSum =
      existingWh &&
      Object.values(existingWh).reduce((acc, v) => acc + (Number(v) || 0), 0) > 0;
    return {
      ...item,
      sector: item.sector || (isPc ? 'pc' : 'vape'),
      condition: item.condition || 'آکبند',
      warehouseStock: hasWhSum
        ? existingWh
        : {
            central_external: item.stockQty,
            vitrine: 0,
            shop_storage: 0,
            consignment: 0,
          },
      totalInQty: item.totalInQty ?? item.stockQty,
      totalOutQty: item.totalOutQty ?? 0,
      resellerPrice: item.resellerPrice ?? item.partnerPrice ?? item.wholesalePrice,
    };
  });

export function App() {
  const [activeWorkspace, setActiveWorkspaceState] = useState<WorkspaceId>(() =>
    getWorkspaceFromPath(window.location.pathname)
  );
  const [accountingInitialTab] =
    useState<AccountingSubTab>('coa');
  const [posInitialView, setPosInitialView] = useState<
    'pos' | 'purchase_invoice' | 'returns' | 'reseller_pricelist' | 'invoices_archive'
  >('pos');
  const [inventoryInitialTab, setInventoryInitialTab] = useState<
    'stocktaking' | 'sku_allocation' | 'festivals_bundles'
  >('stocktaking');

  const setActiveWorkspace = useCallback((ws: WorkspaceId) => {
    setActiveWorkspaceState(ws);
    const targetPath = WORKSPACE_TO_PATH[ws] || '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ workspace: ws }, '', targetPath);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setActiveWorkspaceState(getWorkspaceFromPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const [activeRole] = useState<SystemRole>('ادمین کل (Super Admin)');
  const [activeFiscalYear] = useState(() => `سال مالی ${getPersianYear()}`);
  const [branches, setBranches] = useState<string[]>([DEFAULT_BRANCH_NAME]);
  const [defaultBranch, setDefaultBranch] = useState<string>(DEFAULT_BRANCH_NAME);
  const [productionMode, setProductionMode] = useState(
    () => window.localStorage.getItem(PRODUCTION_MODE_KEY) === 'true'
  );

  // Theme & Auto-Hide Privacy Mode (60s inactivity timer)
  const [darkMode, setDarkMode] = useState(false);
  const [privacyMask, setPrivacyMask] = useState(true); // Masked (****) by default

  useEffect(() => {
    if (privacyMask) return;
    let timeoutId: number;
    const resetTimer = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        setPrivacyMask(true);
      }, 60000); // 60 seconds auto-hide
    };
    resetTimer();
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
    };
  }, [privacyMask]);

  // Global Command Bar (Ctrl+K)
  const [showAwesomebar, setShowAwesomebar] = useState(false);
  const [awesomeQuery, setAwesomeQuery] = useState('');

  // Central Persistent States
  const [accounts, setAccounts] = usePersistentArrayState<AccountNode>(
    'farapay.v4.accounts',
    INITIAL_ACCOUNTS
  );
  const [glEntries, setGlEntries] = usePersistentArrayState<GLEntryRecord>(
    'farapay.v1.gl-entries',
    INITIAL_GL_ENTRIES
  );
  const [journalEntries, setJournalEntries] =
    usePersistentArrayState<JournalEntryRecord>(
      'farapay.v1.journal-entries',
      INITIAL_JOURNAL_ENTRIES
    );
  const [salesInvoices, setSalesInvoices] =
    usePersistentArrayState<SalesInvoiceRecord>(
      'farapay.v1.sales-invoices',
      INITIAL_SALES_INVOICES
    );
  const [purchaseInvoices, setPurchaseInvoices] =
    usePersistentArrayState<PurchaseInvoiceRecord>(
      'farapay.v1.purchase-invoices',
      INITIAL_PURCHASE_INVOICES
    );
  const [paymentEntries, setPaymentEntries] =
    usePersistentArrayState<PaymentEntryRecord>(
      'farapay.v1.payment-entries',
      INITIAL_PAYMENT_ENTRIES
    );
  const [costCenters, setCostCenters] = usePersistentArrayState<CostCenterRecord>(
    'farapay.v4.cost-centers',
    INITIAL_COST_CENTERS
  );
  const [fixedAssets, setFixedAssets] = usePersistentArrayState<FixedAssetRecord>(
    'farapay.v4.fixed-assets',
    INITIAL_FIXED_ASSETS
  );
  const [shareholders, setShareholders] =
    usePersistentArrayState<ShareholderRecord>(
      'farapay.v4.shareholders',
      INITIAL_SHAREHOLDERS
    );
  const [shareholderSnapshots, setShareholderSnapshots] =
    usePersistentArrayState<ShareholderRuleSnapshot>(
      'farapay.v4.shareholder-snapshots',
      []
    );
  const [shareholderDrawings, setShareholderDrawings] =
    usePersistentArrayState<ShareholderDrawingRecord>(
      'farapay.v4.shareholder-drawings',
      []
    );
  const [recurringTemplates, setRecurringTemplates] =
    usePersistentArrayState<RecurringExpenseTemplate>(
      'farapay.v4.recurring-templates',
      INITIAL_RECURRING_EXPENSE_TEMPLATES
    );
  const [monthlyExpenseLedger, setMonthlyExpenseLedger] =
    usePersistentArrayState<MonthlyExpenseLedgerRecord>(
      'farapay.v4.monthly-expense-ledger',
      []
    );
  const [warehouses, setWarehouses] = usePersistentArrayState<WarehouseRecord>(
    'farapay.v4.warehouses',
    INITIAL_WAREHOUSES
  );
  const [promotionRules, setPromotionRules] =
    usePersistentArrayState<PromotionRuleRecord>(
      'farapay.v4.promotion-rules',
      INITIAL_PROMOTION_RULES
    );
  const [inventoryItems, setInventoryItems] =
    usePersistentArrayState<InventoryItemRecord>(
      'farapay.v1.inventory-items',
      normalizeCloudyShopInventory(CLOUDY_SHOP_INVENTORY)
    );
  const [customerContacts, setCustomerContacts] =
    usePersistentArrayState<CustomerContactRecord>(
      'farapay.v1.customer-contacts',
      CLOUDY_SHOP_CONTACTS
    );
  const [bulkSmsPool, setBulkSmsPool] =
    usePersistentArrayState<BulkSmsContactRecord>(
      'farapay.v4.bulk-sms-pool',
      []
    );
  const [crmLeads, setCrmLeads] = usePersistentArrayState<CrmLeadRecord>(
    'farapay.v1.crm-leads',
    INITIAL_CRM_LEADS
  );
  const [calendarEvents, setCalendarEvents] =
    usePersistentArrayState<OperationalCalendarEvent>(
      'farapay.v4.calendar-events',
      [
        {
          id: 'ev-init-1',
          title: 'انبارگردانی هفتگی ویترین و شارژ سالت‌های پرفروش',
          date: '۱۴۰۴/۰۸/۱۵',
          time: '11:00',
          category: 'task',
          isCompleted: false,
          notes: 'انتقال از انبار مرکزی به ویترین مغازه',
        },
      ]
    );
  const [customerWishlist, setCustomerWishlist] =
    usePersistentArrayState<CustomerWishlistRecord>(
      'farapay.v4.customer-wishlist',
      [
        {
          id: 'wish-init-1',
          customerName: 'کیوان رضایی',
          customerPhone: '09123456789',
          requestedItemName: 'سالت ویگاد بمب انبه یخ 25mg',
          category: 'جویس و سالت',
          flavorOrSpec: 'نیکوتین ۲۵ میلی‌گرم',
          requestedDate: '۱۴۰۴/۰۸/۱۰',
          promiseDate: '۱۴۰۴/۰۸/۱۸',
          status: 'در انتظار تامین',
          notes: 'مشتری ثابت مغازه — به محض رسیدن بار تماس گرفته شود',
        },
      ]
    );
  const [auditLogs, setAuditLogs] = usePersistentArrayState<AuditLogRecord>(
    'farapay.v1.audit-logs',
    INITIAL_AUDIT_LOGS
  );
  const [masterOptions, setMasterOptions] = useState<MasterOptionsRegistry>(() => {
    try {
      const raw = window.localStorage.getItem('farapay.v4.master-options');
      return raw ? JSON.parse(raw) : INITIAL_MASTER_OPTIONS;
    } catch {
      return INITIAL_MASTER_OPTIONS;
    }
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Bidirectional Backup Snapshots (Undo / Redo without deleting latest snapshot)
  const [backupSnapshots, setBackupSnapshots] = useState<SystemBackupSnapshot[]>([]);
  const [currentSnapshotIndex, setCurrentSnapshotIndex] = useState<number>(-1);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  // Ensure Cloudy Shop Inventory is placed in Central External warehouse & COA is synced
  useEffect(() => {
    if (window.localStorage.getItem(CLOUDY_SHOP_V4_KEY) === '1') return;
    const normalized = normalizeCloudyShopInventory(
      inventoryItems.length > 0 ? inventoryItems : CLOUDY_SHOP_INVENTORY
    );
    const totalCentralValuation = normalized.reduce(
      (sum, item) => sum + item.stockQty * (item.valuationRate || 0),
      0
    );

    const syncedAccounts = INITIAL_ACCOUNTS.map((acc) => {
      if (acc.code === '1000' || acc.code === '1100' || acc.code === '1104' || acc.code === '110403') {
        return { ...acc, balance: totalCentralValuation };
      }
      if (acc.code === '3000' || acc.code === '3100' || acc.code === '3101') {
        return { ...acc, balance: totalCentralValuation };
      }
      return acc;
    });

    setInventoryItems(normalized);
    setAccounts(syncedAccounts);
    setShareholders(INITIAL_SHAREHOLDERS);
    setWarehouses(INITIAL_WAREHOUSES);
    window.localStorage.setItem(CLOUDY_SHOP_V4_KEY, '1');
  }, [inventoryItems, setAccounts, setInventoryItems, setShareholders, setWarehouses]);

  // Calculate Initial 50/50 Capital Baseline from Cloudy Shop Inventory
  const initialInventoryCapitalBaseline = useMemo(() => {
    return CLOUDY_SHOP_INVENTORY.reduce(
      (sum, item) => sum + item.stockQty * (item.valuationRate || 0),
      0
    );
  }, []);

  // Save a Backup Snapshot
  const handleCreateSnapshot = (customLabel?: string) => {
    const snap: SystemBackupSnapshot = {
      id: `snap-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('fa-IR'),
      label: customLabel || `بکاپ لحظه‌ای (${backupSnapshots.length + 1})`,
      accounts: structuredClone(accounts),
      glEntries: structuredClone(glEntries),
      journalEntries: structuredClone(journalEntries),
      salesInvoices: structuredClone(salesInvoices),
      purchaseInvoices: structuredClone(purchaseInvoices),
      inventoryItems: structuredClone(inventoryItems),
      customerContacts: structuredClone(customerContacts),
      shareholders: structuredClone(shareholders),
    };
    setBackupSnapshots((prev) => {
      const next = [...prev, snap];
      setCurrentSnapshotIndex(next.length - 1);
      return next;
    });
    showToast(`نقطه بازیابی «${snap.label}» ذخیره شد (امکان عقبگرد و جلوگرد بدون حذف).`);
  };

  const applySnapshotAtIndex = (idx: number) => {
    const snap = backupSnapshots[idx];
    if (!snap) return;
    setAccounts(snap.accounts);
    setGlEntries(snap.glEntries);
    setJournalEntries(snap.journalEntries);
    setSalesInvoices(snap.salesInvoices);
    setPurchaseInvoices(snap.purchaseInvoices);
    setInventoryItems(snap.inventoryItems);
    setCustomerContacts(snap.customerContacts);
    setShareholders(snap.shareholders);
    setCurrentSnapshotIndex(idx);
  };

  const handleUndoSnapshot = () => {
    if (backupSnapshots.length === 0) {
      showToast('ابتدا با دکمه «ثبت بکاپ» یک نقطه بازیابی ذخیره کنید.');
      return;
    }
    const targetIdx = Math.max(0, currentSnapshotIndex - 1);
    applySnapshotAtIndex(targetIdx);
    showToast(
      `عقبگرد (Rollback) به «${backupSnapshots[targetIdx].label}» انجام شد؛ آخرین بکاپ حذف نشد و قابل جلوگرد است.`
    );
  };

  const handleRedoSnapshot = () => {
    if (
      backupSnapshots.length === 0 ||
      currentSnapshotIndex >= backupSnapshots.length - 1
    ) {
      showToast('شما در آخرین نسخه بکاپ قرار دارید.');
      return;
    }
    const targetIdx = currentSnapshotIndex + 1;
    applySnapshotAtIndex(targetIdx);
    showToast(`جلوگرد (Roll-Forward) به «${backupSnapshots[targetIdx].label}» انجام شد.`);
  };

  const handleAddMasterOption = (
    category: keyof MasterOptionsRegistry,
    newValue: string
  ) => {
    const trimmed = newValue.trim();
    if (!trimmed) return;
    setMasterOptions((prev) => {
      if (prev[category].includes(trimmed)) return prev;
      const updated = {
        ...prev,
        [category]: [...prev[category], trimmed],
      };
      window.localStorage.setItem('farapay.v4.master-options', JSON.stringify(updated));
      return updated;
    });
    showToast(`مقدار «${trimmed}» به لیست جامع اضافه شد.`);
  };

  // POS Checkout Handler (handles Normal/Festival/Reseller, Bottle/Decant ml, Services, 3 Liquidity Accounts, Credit Receivables)
  const handleCompletePosCheckout = (payload: PosCheckoutPayload): boolean => {
    let updatedInventory = [...inventoryItems];
    let vapeCogs = 0;
    let pcCogs = 0;
    let vapeRev = 0;
    let pcRev = 0;

    for (const line of payload.cartLines) {
      const idx = updatedInventory.findIndex((i) => i.sku === line.sku);
      if (idx === -1) continue;
      const item = updatedInventory[idx];

      if (line.isDecantMl) {
        const decantRes = deductDecantMlFromBottle({
          stockBottles: item.stockQty,
          openBottleRemainingMl: item.openBottleRemainingMl ?? 0,
          bottleVolumeMl: item.bottleVolumeMl || item.liquidVolumeMl || 60,
          soldMl: line.qty,
          bottleValuationRate: item.valuationRate,
        });
        if (!decantRes.success) {
          showToast(decantRes.errorMessage || 'موجودی میلی‌لیتری بطری کافی نیست.');
          return false;
        }
        const bottlesOpened = Math.max(0, item.stockQty - decantRes.newStockBottles);
        updatedInventory[idx] = {
          ...item,
          stockQty: decantRes.newStockBottles,
          openBottleRemainingMl: decantRes.newOpenBottleRemainingMl,
          totalOutQty: (item.totalOutQty ?? 0) + bottlesOpened,
        };
        vapeCogs += decantRes.lineCogs;
        vapeRev += line.qty * line.finalManualUnitPrice;
      } else {
        if (item.stockQty < line.qty) {
          showToast(`موجودی کالای «${item.name}» کافی نیست.`);
          return false;
        }
        const whKey = line.warehouseKey || 'vitrine';
        const currWhStock = { ...(item.warehouseStock || {}) };
        currWhStock[whKey] = Math.max(0, (currWhStock[whKey] ?? item.stockQty) - line.qty);

        if (item.sector === 'pc' && item.fifoLayers && item.fifoLayers.length > 0) {
          const fifo = consumeFifoLayers(
            item.fifoLayers,
            line.qty,
            item.valuationRate || 0
          );
          pcCogs += fifo.totalCogs;
          pcRev += line.qty * line.finalManualUnitPrice;
          updatedInventory[idx] = {
            ...item,
            stockQty: item.stockQty - line.qty,
            warehouseStock: currWhStock,
            totalOutQty: (item.totalOutQty ?? 0) + line.qty,
            fifoLayers: fifo.remainingLayers,
            lastSoldDate: formatPersianDate(new Date()),
            daysInStock: 0,
          };
        } else {
          const lineCogs = line.qty * (item.valuationRate || 0);
          if (item.sector === 'pc') {
            pcCogs += lineCogs;
            pcRev += line.qty * line.finalManualUnitPrice;
          } else {
            vapeCogs += lineCogs;
            vapeRev += line.qty * line.finalManualUnitPrice;
          }
          updatedInventory[idx] = {
            ...item,
            stockQty: item.stockQty - line.qty,
            warehouseStock: currWhStock,
            totalOutQty: (item.totalOutQty ?? 0) + line.qty,
            lastSoldDate: formatPersianDate(new Date()),
            daysInStock: 0,
          };
        }
      }
    }

    // Deduct service consumables if linked
    let serviceConsumableCogs = 0;
    for (const sLine of payload.serviceLines) {
      if (sLine.linkedConsumableSku && (sLine.linkedConsumableQty || 0) > 0) {
        const cIdx = updatedInventory.findIndex((i) => i.sku === sLine.linkedConsumableSku);
        if (cIdx !== -1) {
          const cItem = updatedInventory[cIdx];
          const deductQty = sLine.linkedConsumableQty || 1;
          updatedInventory[cIdx] = {
            ...cItem,
            stockQty: Math.max(0, cItem.stockQty - deductQty),
            totalOutQty: (cItem.totalOutQty ?? 0) + deductQty,
          };
          serviceConsumableCogs += deductQty * (cItem.valuationRate || 0);
        }
      }
    }

    const totalCogs = vapeCogs + pcCogs + serviceConsumableCogs;
    const serviceRev = payload.serviceLines.reduce((s, l) => s + l.feeAmount, 0);
    const productRev = Math.max(0, payload.netTotal - serviceRev);
    const invNo = `POS-${getPersianYear()}-${String(1001 + salesInvoices.length).padStart(4, '0')}`;
    const todayStr = formatPersianDate(new Date());

    const newInvoice: SalesInvoiceRecord = {
      id: `sinv-${Date.now()}`,
      invoiceNo: invNo,
      docstatus: 1,
      customerName: payload.customerName || 'مشتری حضوری',
      customerPhone: payload.customerPhone,
      referralName: payload.referralName,
      pricingMode: payload.pricingMode,
      paymentAccountCode: payload.paymentAccountCode,
      paymentMethodLabel: payload.paymentMethodLabel,
      date: todayStr,
      dueDate: todayStr,
      branchDimension: defaultBranch,
      channelDimension: 'فروش حضوری POS',
      paymentTermsTemplate:
        payload.creditReceivableAmount > 0 ? 'نسیه (بدهکار)' : 'تسویه نقد/کارت در لحظه',
      updateStock: true,
      isSubscription: false,
      status: payload.creditReceivableAmount > 0 ? 'نسیه (بدهکار)' : 'پرداخت‌شده',
      totalAmount: payload.netTotal,
      paidAmount: payload.paidAmount,
      cogsAmount: totalCogs,
      vapeCogsAmount: vapeCogs + serviceConsumableCogs,
      pcCogsAmount: pcCogs,
      vapeRevenueAmount: vapeRev + serviceRev,
      pcRevenueAmount: pcRev,
      itemsSummary: [
        ...payload.cartLines.map((l) => `${l.qty} ${l.uom} ${l.name}`),
        ...payload.serviceLines.map((s) => `خدمات: ${s.serviceTitle}`),
      ].join(' + '),
      lines: payload.cartLines.map((l, idx) => ({
        id: `line-${Date.now()}-${idx}`,
        sku: l.sku,
        itemName: l.name,
        uom: l.uom,
        qty: l.qty,
        unitPrice: l.finalManualUnitPrice,
        discountPercent: 0,
        netLineAmount: l.qty * l.finalManualUnitPrice,
        valuationRate: l.unitValuationCost,
        isDecantMl: l.isDecantMl,
        sector: l.sector,
        warehouseKey: l.warehouseKey,
      })),
      serviceLines: payload.serviceLines,
    };

    // Double-entry lines
    const ledgerLines: { accountCode: string; debit: number; credit: number }[] = [];
    if (payload.paidAmount > 0) {
      ledgerLines.push({
        accountCode: payload.paymentAccountCode,
        debit: payload.paidAmount,
        credit: 0,
      });
    }
    if (payload.creditReceivableAmount > 0) {
      ledgerLines.push({
        accountCode: '1102',
        debit: payload.creditReceivableAmount,
        credit: 0,
      });
    }
    if (productRev > 0) {
      ledgerLines.push({
        accountCode: '4101',
        debit: 0,
        credit: productRev,
      });
    }
    if (serviceRev > 0) {
      ledgerLines.push({
        accountCode: '4105',
        debit: 0,
        credit: serviceRev,
      });
    }
    if (totalCogs > 0) {
      ledgerLines.push(
        { accountCode: '5101', debit: totalCogs, credit: 0 },
        { accountCode: '110401', debit: 0, credit: totalCogs }
      );
    }

    setAccounts((curr) => postDoubleEntryToAccounts(curr, ledgerLines));
    setInventoryItems(updatedInventory);
    setSalesInvoices((prev) => [newInvoice, ...prev]);

    // Update Customer Contact Debit Balance if Credit Sale
    if (payload.creditReceivableAmount > 0 && payload.customerName) {
      setCustomerContacts((prev) =>
        prev.map((c) =>
          c.fullName === payload.customerName
            ? {
                ...c,
                debitBalance: (c.debitBalance ?? 0) + payload.creditReceivableAmount,
              }
            : c
        )
      );
    }

    showToast(`فاکتور فروش «${invNo}» با موفقیت در صندوق و دفتر کل ثبت شد.`);
    return true;
  };

  // POS Return 3-Option Handler
  const handleProcessPosReturn = (payload: PosReturnPayload): boolean => {
    const inv = salesInvoices.find((s) => s.id === payload.sourceInvoiceId);
    if (!inv || inv.docstatus === 2) {
      showToast('فاکتور مبدا برای مرجوعی معتبر نیست.');
      return false;
    }

    // Restore returned items to stock
    if (inv.lines && inv.lines.length > 0) {
      const restored = restoreStockWithBundles(
        inventoryItems,
        inv.lines.map((l) => ({ sku: l.sku, qty: l.qty }))
      );
      setInventoryItems(restored);
    }

    const returnAmount = inv.totalAmount;
    const cogsReverse = inv.cogsAmount || 0;
    const ledgerLines: { accountCode: string; debit: number; credit: number }[] = [
      { accountCode: '4101', debit: returnAmount, credit: 0 },
    ];

    if (payload.resolutionMode === 'credit_balance') {
      ledgerLines.push({ accountCode: '2102', debit: 0, credit: returnAmount });
      setCustomerContacts((prev) =>
        prev.map((c) =>
          c.fullName === inv.customerName
            ? { ...c, creditBalance: (c.creditBalance ?? 0) + returnAmount }
            : c
        )
      );
    } else if (payload.resolutionMode === 'cash_refund') {
      ledgerLines.push({
        accountCode: payload.refundAccountCode || '110102',
        debit: 0,
        credit: returnAmount,
      });
    } else {
      // Exchange item
      ledgerLines.push({ accountCode: '2102', debit: 0, credit: returnAmount });
    }

    if (cogsReverse > 0) {
      ledgerLines.push(
        { accountCode: '110401', debit: cogsReverse, credit: 0 },
        { accountCode: '5101', debit: 0, credit: cogsReverse }
      );
    }

    setAccounts((curr) => postDoubleEntryToAccounts(curr, ledgerLines));
    setSalesInvoices((prev) =>
      prev.map((s) =>
        s.id === inv.id
          ? {
              ...s,
              status: 'مرجوعی (یادداشت بستانکاری)',
              returnResolutionMode: payload.resolutionMode,
            }
          : s
      )
    );

    showToast(
      `مرجوعی فاکتور «${inv.invoiceNo}» با سناریوی انتخاب‌شده ثبت و کالا به انبار بازگردانده شد.`
    );
    return true;
  };

  // Void Sales Invoice using voidInvoice engine (تغییر وضعیت به Cancelled و رکورد جبرانی معکوس)
  const handleVoidSalesInvoice = (id: string) => {
    const inv = salesInvoices.find((s) => s.id === id);
    if (!inv || inv.docstatus === 2) return;

    const voidRes = voidInvoice({
      invoice: inv,
      invoiceType: 'sales',
      inventory: inventoryItems,
    });

    setInventoryItems(voidRes.restoredInventory);
    setAccounts((curr) => postDoubleEntryToAccounts(curr, voidRes.reversalLedgerLines));
    setSalesInvoices((prev) =>
      prev.map((s) => (s.id === id ? voidRes.voidedInvoice : s))
    );
    showToast(voidRes.auditSummary);
  };

  // Stage-1 Purchase Creation
  const handleCreatePurchaseInvoice = (pinv: PurchaseInvoiceRecord): boolean => {
    const paid = pinv.paidAmount ?? 0;
    const unpaid = Math.max(0, pinv.totalAmount - paid);
    const ledgerLines: { accountCode: string; debit: number; credit: number }[] = [
      { accountCode: '110403', debit: pinv.totalAmount, credit: 0 },
    ];
    if (paid > 0) {
      ledgerLines.push({
        accountCode: pinv.paymentAccountCode || '110102',
        debit: 0,
        credit: paid,
      });
    }
    if (unpaid > 0) {
      ledgerLines.push({ accountCode: '2101', debit: 0, credit: unpaid });
      // Update supplier creditBalance in CRM
      setCustomerContacts((prev) =>
        prev.map((c) =>
          c.fullName === pinv.supplierName
            ? { ...c, creditBalance: (c.creditBalance ?? 0) + unpaid }
            : c
        )
      );
    }

    setAccounts((curr) => postDoubleEntryToAccounts(curr, ledgerLines));
    setPurchaseInvoices((prev) => [pinv, ...prev]);
    showToast(
      `فاکتور خرید «${pinv.billNo}» ثبت شد. اکنون می‌توانید در صفحه «پذیرش و برچسب‌گذاری SKU» طعم و مشخصات فنی را ثبت کنید.`
    );
    return true;
  };

  // Void Purchase Invoice using voidInvoice engine
  const handleVoidPurchaseInvoice = (id: string) => {
    const pinv = purchaseInvoices.find((p) => p.id === id);
    if (!pinv || pinv.docstatus === 2) return;

    const voidRes = voidInvoice({
      invoice: pinv,
      invoiceType: 'purchase',
      inventory: inventoryItems,
    });

    setInventoryItems(voidRes.restoredInventory);
    setAccounts((curr) => postDoubleEntryToAccounts(curr, voidRes.reversalLedgerLines));
    setPurchaseInvoices((prev) =>
      prev.map((p) => (p.id === id ? voidRes.voidedInvoice : p))
    );
    showToast(voidRes.auditSummary);
  };

  // Stage-2 SKU Breakdown Completion
  const handleCompleteSkuBreakdown = (
    purchaseId: string | null,
    allocatedItems: InventoryItemRecord[]
  ) => {
    setInventoryItems((curr) => {
      const updated = [...curr];
      for (const newItem of allocatedItems) {
        const existingIdx = updated.findIndex((i) => i.sku === newItem.sku);
        if (existingIdx !== -1) {
          const ex = updated[existingIdx];
          const newAvgRes = calculateMovingAverageValuation(
            ex.stockQty,
            ex.valuationRate,
            newItem.stockQty,
            newItem.valuationRate
          );
          const whStock = { ...(ex.warehouseStock || {}) };
          const targetWh = Object.keys(newItem.warehouseStock || {})[0] || 'vitrine';
          whStock[targetWh] = (whStock[targetWh] || 0) + newItem.stockQty;
          updated[existingIdx] = {
            ...ex,
            stockQty: ex.stockQty + newItem.stockQty,
            totalInQty: (ex.totalInQty ?? ex.stockQty) + newItem.stockQty,
            valuationRate: newAvgRes.newValuationRate,
            retailPrice: newItem.retailPrice || ex.retailPrice,
            resellerPrice: newItem.resellerPrice || ex.resellerPrice,
            warehouseStock: whStock,
            fifoLayers:
              ex.sector === 'pc'
                ? [
                    ...(ex.fifoLayers || []),
                    {
                      qty: newItem.stockQty,
                      unitCost: newItem.valuationRate,
                      date: formatPersianDate(new Date()),
                    },
                  ]
                : ex.fifoLayers,
          };
        } else {
          updated.unshift(newItem);
        }
      }
      return updated;
    });

    if (purchaseId) {
      setPurchaseInvoices((prev) =>
        prev.map((p) =>
          p.id === purchaseId
            ? { ...p, skuBreakdownCompleted: true, deliveryStatus: 'رسیده' }
            : p
        )
      );
    }

    showToast(
      `پذیرش و برچسب‌گذاری SKU (${allocatedItems.length} کد کالا) با موفقیت در انبار ثبت شد.`
    );
  };

  // Inter-warehouse Stock Transfer
  const handleTransferWarehouseStock = (
    sku: string,
    fromWh: WarehouseKey,
    toWh: WarehouseKey,
    qty: number
  ) => {
    if (fromWh === toWh || qty <= 0) return;
    setInventoryItems((prev) =>
      prev.map((item) => {
        if (item.sku !== sku) return item;
        const wh = { ...(item.warehouseStock || {}) };
        const avail = wh[fromWh] ?? 0;
        if (avail < qty) return item;
        wh[fromWh] = avail - qty;
        wh[toWh] = (wh[toWh] ?? 0) + qty;
        return { ...item, warehouseStock: wh };
      })
    );
    showToast(`انتقال ${qty} عدد از کالای ${sku} بین انبارها انجام شد.`);
  };

  // Urgent Alerts for Home Launcher
  const pendingBreakdownCount = purchaseInvoices.filter(
    (p) => p.docstatus === 1 && !p.skuBreakdownCompleted
  ).length;
  const inTransitCount = purchaseInvoices.filter(
    (p) =>
      p.docstatus === 1 &&
      (p.deliveryStatus === 'در انتظار رسیدن بار' ||
        p.deliveryStatus === 'در راه (هنوز نرسیده)')
  ).length;
  const unpaidSupplierBillsCount = purchaseInvoices.filter(
    (p) => p.docstatus === 1 && p.totalAmount - (p.paidAmount ?? 0) > 0
  ).length;

  return (
    <div
      dir="rtl"
      className={`min-h-screen font-sans transition-colors ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* Clean Top Bar (Module 11 Specification) */}
      <header
        className={`sticky top-0 z-30 border-b px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3 ${
          darkMode
            ? 'bg-slate-900/95 border-slate-800 text-white'
            : 'bg-white/95 border-slate-200 text-slate-900'
        } backdrop-blur-md`}
      >
        {/* Brand & Active Single-Branch Indicator */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveWorkspace('home')}
            className="flex items-center gap-2.5 text-right"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
              FP
            </div>
            <div>
              <div className="text-sm font-black tracking-tight">
                فراپِی ERP — ویپ‌شاپ و قطعات کامپیوتر
              </div>
              <div className="text-[11px] text-slate-500 font-semibold">
                {defaultBranch}
              </div>
            </div>
          </button>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-md mx-2">
          <button
            type="button"
            onClick={() => setShowAwesomebar((prev) => !prev)}
            className={`w-full flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-slate-300'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
            }`}
          >
            <span className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              <span>جستجوی سریع کالا، مخاطب یا ماژول...</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 text-slate-700 font-mono">
              Ctrl+K
            </kbd>
          </button>
        </div>

        {/* Clean Top Right Action Controls: Theme Switch, Auto-Hide Privacy Eye, Bidirectional Snapshot Undo/Redo, User Profile */}
        <div className="flex items-center gap-2">
          {/* 1. Light / Dark Mode Switch */}
          <button
            type="button"
            onClick={() => setDarkMode((prev) => !prev)}
            className={`p-2 rounded-xl border text-xs font-bold transition-colors ${
              darkMode
                ? 'bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title={darkMode ? 'تغییر به تم روشن (Light Mode)' : 'تغییر به تم تیره (Dark Mode)'}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* 2. Auto-Hide Privacy Mode Button (60s auto-lock) */}
          <button
            type="button"
            onClick={() => setPrivacyMask((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
              privacyMask
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-amber-50 text-amber-900 border-amber-300'
            }`}
            title="مخفی‌سازی خودکار اعداد حساس (پس از ۶۰ ثانیه عدم فعالیت به صورت خودکار مخفی می‌شود)"
          >
            {privacyMask ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{privacyMask ? 'حریم خصوصی فعال (****)' : 'ارقام آشکار (قفل خودکار ۶۰ث)'}</span>
          </button>

          {/* 3. Bidirectional Backup Snapshot Controls (Save / Undo / Redo) */}
          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
            <button
              type="button"
              onClick={() => handleCreateSnapshot()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"
              title="ثبت نقطه بازیابی جدید (Snapshot)"
            >
              <Save className="w-3.5 h-3.5" />
              <span>ثبت بکاپ ({backupSnapshots.length})</span>
            </button>
            <button
              type="button"
              onClick={handleUndoSnapshot}
              disabled={backupSnapshots.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-40"
              title="عقبگرد به بکاپ قبلی (Rollback بدون حذف آخرین بکاپ)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleRedoSnapshot}
              disabled={
                backupSnapshots.length === 0 ||
                currentSnapshotIndex >= backupSnapshots.length - 1
              }
              className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-40"
              title="جلوگرد به آخرین بکاپ (Roll-Forward)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 4. User Profile Badge */}
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>مدیر فروشگاه</span>
          </div>
        </div>
      </header>

      {/* Awesomebar Quick Search Modal */}
      {showAwesomebar && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-20 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-lg p-4 space-y-3 text-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700">
                جستجوی سریع در ماژول‌ها و کالاهای کلودی شاپ
              </span>
              <button
                type="button"
                onClick={() => setShowAwesomebar(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800"
              >
                بستن (Esc)
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={awesomeQuery}
              onChange={(e) => setAwesomeQuery(e.target.value)}
              placeholder="نام کالا، کد SKU یا نام بخش..."
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'pos', label: 'صندوق فروشگاهی (POS)' },
                { id: 'stock', label: 'انبارگردانی و تفکیک SKU' },
                { id: 'accounting', label: 'حسابداری، سهامداران و خرید' },
                { id: 'analytics', label: 'آنالیز و آمار (BI)' },
                { id: 'crm', label: 'باشگاه مشتریان و مخاطبین' },
                { id: 'calendar', label: 'تقویم عملیاتی و Wishlist' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspace(m.id as WorkspaceId);
                    setShowAwesomebar(false);
                  }}
                  className="p-2.5 rounded-xl border border-slate-200 text-right font-bold hover:bg-slate-50"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 left-5 z-50 max-w-md bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-lg border border-slate-700 flex items-center gap-3 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold flex-1">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Layout: Sidebar + Content Area */}
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Right Sidebar Navigation (Sales isolated to /pos, Analytics isolated to /analytics) */}
        <aside className="lg:col-span-2 space-y-1.5">
          {[
            { id: 'home', label: 'میز کار (Quick Launcher)', path: '/', icon: Home },
            { id: 'pos', label: 'صندوق فروشگاهی (/pos)', path: '/pos', icon: Store },
            { id: 'stock', label: 'انبارگردانی و پذیرش SKU', path: '/stock', icon: Package },
            { id: 'festivals', label: 'جشنواره و باندل کالا', path: '/festivals', icon: Sparkles },
            { id: 'accounting', label: 'حسابداری و دفاتر (گزارش)', path: '/accounting', icon: Calculator },
            { id: 'analytics', label: 'آنالیز و آمار (/analytics)', path: '/analytics', icon: BarChart3 },
            { id: 'crm', label: 'باشگاه مشتریان (۶ تب)', path: '/crm', icon: Users },
            { id: 'calendar', label: 'تقویم عملیاتی و Wishlist', path: '/calendar', icon: CalendarIcon },
            { id: 'webshop', label: 'فروشگاه آنلاین', path: '/webshop', icon: Globe },
            { id: 'settings', label: 'تنظیمات و شعبه', path: '/settings', icon: Settings },
          ].map((nav) => {
            const Icon = nav.icon;
            const isActive = activeWorkspace === nav.id;
            return (
              <button
                key={nav.id}
                type="button"
                onClick={() => {
                  if (nav.id === 'festivals') {
                    setInventoryInitialTab('festivals_bundles');
                    setActiveWorkspace('festivals');
                  } else if (nav.id === 'stock') {
                    setInventoryInitialTab('stocktaking');
                    setActiveWorkspace('stock');
                  } else {
                    setActiveWorkspace(nav.id as WorkspaceId);
                  }
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : darkMode
                    ? 'text-slate-300 hover:bg-slate-900'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{nav.label}</span>
                </span>
                {nav.id === 'stock' && pendingBreakdownCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black tabular-nums">
                    {pendingBreakdownCount}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Workspace Content */}
        <main className="lg:col-span-10 space-y-6">
          {/* =================================================================
              MODULE 10: ODOO-STYLE MINIMAL HOME LAUNCHER (میز کار خلوت و محرمانه)
             ================================================================= */}
          {activeWorkspace === 'home' && (
            <div className="space-y-6">
              {/* Welcome Banner without exposing sensitive financial numbers */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs text-slate-900">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
                    <span>شعبه فعال: {defaultBranch}</span>
                    <span>•</span>
                    <span>Privacy Mode فعال (تایمر خودکار ۶۰ ثانیه)</span>
                  </div>
                  <h1 className="text-xl font-black text-slate-900">
                    میز کار عملیاتی فراپِی (Quick Actions Launcher)
                  </h1>
                  <p className="text-xs text-slate-500 mt-1">
                    برای حفظ محرمانگی در حضور مشتری، تمام کارت‌های تحلیلی، نمودارهای رشد سرمایه و حاشیه‌های سود به روت مستقل «/analytics» منتقل شده‌اند.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('pos')}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 shadow-xs"
                  >
                    <Store className="w-4 h-4" />
                    <span>ورود سریع به صندوق فروشگاهی (/pos)</span>
                  </button>
                </div>
              </div>

              {/* Urgent Operational Alerts (بدون افشای سود و سرمایه) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-950">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <div className="font-black">صف پذیرش و برچسب‌گذاری SKU</div>
                      <div className="text-amber-800 mt-0.5">
                        {pendingBreakdownCount} پارت خرید نیازمند تفکیک طعم و مشخصات فنی
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setInventoryInitialTab('sku_allocation');
                      setActiveWorkspace('stock');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-900 text-white font-bold shrink-0"
                  >
                    پذیرش SKU
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-between text-xs text-sky-950">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-sky-600 shrink-0" />
                    <div>
                      <div className="font-black">برچسب «در انتظار رسیدن بار»</div>
                      <div className="text-sky-800 mt-0.5">
                        {inTransitCount} محموله خرید در انتظار رسیدن فیزیکی به انبار
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPosInitialView('invoices_archive');
                      setActiveWorkspace('pos');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-sky-900 text-white font-bold shrink-0"
                  >
                    بررسی بار
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between text-xs text-rose-950">
                  <div className="flex items-center gap-3">
                    <CalendarIcon className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <div className="font-black">یادآور سررسیدها و لیست انتظار</div>
                      <div className="text-rose-800 mt-0.5">
                        {unpaidSupplierBillsCount} فاکتور تعهدی و {customerWishlist.length} درخواست شارژ کالا
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveWorkspace('calendar')}
                    className="px-3 py-1.5 rounded-lg bg-rose-900 text-white font-bold shrink-0"
                  >
                    تقویم
                  </button>
                </div>
              </div>

              {/* Odoo-Style App Launcher Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  {
                    id: 'pos',
                    title: 'صندوق فروشگاهی (/pos)',
                    desc: 'فروش عادی، فروش جشنواره، ریسلر، چک‌باکس میلی‌لیتری جویس و خدمات فنی',
                    icon: Store,
                    color: 'bg-indigo-600',
                  },
                  {
                    id: 'stock',
                    title: 'انبارگردانی و پذیرش SKU',
                    desc: '۴ انبار پیش‌فرض (ویترین، مغازه، مرکزی/خارجی، امانی) + برچسب‌گذاری SKU',
                    icon: Package,
                    color: 'bg-emerald-600',
                  },
                  {
                    id: 'festivals',
                    title: 'جشنواره، تخفیف‌ها و باندل',
                    desc: 'تعریف قوانین جشنواره، باندل‌سازی کیت ویپ و لیست قیمت همکاران',
                    icon: Sparkles,
                    color: 'bg-amber-600',
                  },
                  {
                    id: 'accounting',
                    title: 'حسابداری و گزارش دفاتر (Read-Only)',
                    desc: 'درخت حساب‌ها، تراز آزمایشی ۶ ستونی، ترازنامه یکپارچه و گزارش ۳ قلک سهامداران',
                    icon: Calculator,
                    color: 'bg-slate-900',
                  },
                  {
                    id: 'analytics',
                    title: 'آنالیز و آمار (/analytics)',
                    desc: 'نمودار رشد سرمایه، حاشیه سود ویپ و کامپیوتر، رادار رسوب کالا و انقضا',
                    icon: BarChart3,
                    color: 'bg-purple-600',
                  },
                  {
                    id: 'crm',
                    title: 'باشگاه مشتریان و مخاطبین',
                    desc: '۶ تب تخصصی مشتریان، ریسلرها، تأمین‌کنندگان و استخر پیامک انبوه',
                    icon: Users,
                    color: 'bg-rose-600',
                  },
                  {
                    id: 'calendar',
                    title: 'تقویم عملیاتی و Wishlist',
                    desc: 'تقویم روزانه/هفتگی/ماهانه، پیگیری «در انتظار رسیدن بار» و شارژ کالا',
                    icon: CalendarIcon,
                    color: 'bg-sky-600',
                  },
                  {
                    id: 'settings',
                    title: 'تنظیمات و مدیریت شعبه',
                    desc: 'مدیریت تک‌شعبه‌ای، + افزودن شعبه جدید، خروجی اکسل و لاگ امنیتی',
                    icon: Settings,
                    color: 'bg-teal-600',
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        if (card.id === 'festivals') {
                          setInventoryInitialTab('festivals_bundles');
                          setActiveWorkspace('festivals');
                        } else if (card.id === 'stock') {
                          setInventoryInitialTab('stocktaking');
                          setActiveWorkspace('stock');
                        } else {
                          setActiveWorkspace(card.id as WorkspaceId);
                        }
                      }}
                      className="group text-right bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:shadow-md transition-all flex flex-col justify-between text-slate-900"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div
                            className={`w-11 h-11 rounded-2xl ${card.color} text-white flex items-center justify-center shadow-xs`}
                          >
                            <Icon className="w-5 h-5" />
                          </div>
                          <ArrowUpLeft className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                        </div>
                        <div className="text-sm font-black text-slate-900">
                          {card.title}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {card.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* POS WORKSPACE (All Sales & Stage-1 Purchase Invoices Centralized Here) */}
          {activeWorkspace === 'pos' && (
            <SellingPosModule
              productionMode={productionMode}
              privacyMasked={privacyMask}
              initialView={posInitialView}
              contacts={customerContacts}
              inventoryItems={inventoryItems}
              promotionRules={promotionRules}
              salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices}
              warehouses={warehouses}
              masterOptions={masterOptions}
              onAddMasterOption={handleAddMasterOption}
              onAddQuickCustomer={(newCust) => {
                setCustomerContacts((prev) => [newCust, ...prev]);
                showToast(`مشتری جدید «${newCust.fullName}» در باشگاه مشتریان ثبت شد.`);
              }}
              onQuickAddSupplier={(supplierName, phone) => {
                const newContact: CustomerContactRecord = {
                  id: `sup-${Date.now()}`,
                  sourceCode: `SUP-${customerContacts.length + 1}`,
                  fullName: supplierName,
                  personType: 'حقوقی / تامین‌کننده',
                  role: 'تأمین‌کننده',
                  contactCategory: 'supplier',
                  phone: phone || '—',
                  notes: 'افزوده‌شده از Sheet صندوق فروشگاهی',
                };
                setCustomerContacts((prev) => [newContact, ...prev]);
                showToast(`تأمین‌کننده «${supplierName}» در مخاطبین ثبت شد.`);
              }}
              onCreateQuickInventoryItem={(newItem) => {
                setInventoryItems((prev) => [newItem, ...prev]);
              }}
              onUpdateResellerPrice={(sku, newPrice) => {
                setInventoryItems((prev) =>
                  prev.map((i) =>
                    i.sku === sku
                      ? { ...i, resellerPrice: newPrice, partnerPrice: newPrice }
                      : i
                  )
                );
                showToast(`قیمت همکاری کالای ${sku} بروزرسانی شد.`);
              }}
              onCompletePosCheckout={handleCompletePosCheckout}
              onProcessPosReturn={handleProcessPosReturn}
              onVoidSalesInvoice={handleVoidSalesInvoice}
              onCreatePurchaseInvoice={handleCreatePurchaseInvoice}
              onVoidPurchaseInvoice={handleVoidPurchaseInvoice}
              onMarkPurchaseArrived={(id) => {
                setPurchaseInvoices((prev) =>
                  prev.map((p) =>
                    p.id === id ? { ...p, deliveryStatus: 'رسیده' } : p
                  )
                );
                showToast('وضعیت محموله به «رسیده به انبار» تغییر یافت.');
              }}
              onNavigateToInventoryBreakdown={() => {
                setInventoryInitialTab('sku_allocation');
                setActiveWorkspace('stock');
              }}
              onShowToast={showToast}
            />
          )}

          {/* INVENTORY & FESTIVALS WORKSPACE */}
          {(activeWorkspace === 'stock' || activeWorkspace === 'festivals') && (
            <InventoryWmsModule
              productionMode={productionMode}
              privacyMasked={privacyMask}
              activeRole={activeRole}
              initialTab={
                activeWorkspace === 'festivals'
                  ? 'festivals_bundles'
                  : inventoryInitialTab
              }
              items={inventoryItems}
              warehouses={warehouses}
              onAddWarehouse={(newWh) => {
                setWarehouses((prev) => [...prev, newWh]);
                showToast(`انبار جدید «${newWh.name}» به سیستم اضافه شد.`);
              }}
              masterOptions={masterOptions}
              onAddMasterOption={handleAddMasterOption}
              pendingBreakdownPurchases={purchaseInvoices.filter(
                (p) => p.docstatus === 1 && !p.skuBreakdownCompleted
              )}
              onCompleteSkuBreakdown={handleCompleteSkuBreakdown}
              promotionRules={promotionRules}
              onAddPromotionRule={(rule) => {
                setPromotionRules((prev) => [rule, ...prev]);
                showToast(`جشنواره «${rule.name}» ذخیره و فعال شد.`);
              }}
              onTogglePromotionRule={(id) => {
                setPromotionRules((prev) =>
                  prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
                );
              }}
              onCreateBundleItem={(bundleItem) => {
                setInventoryItems((prev) => [bundleItem, ...prev]);
                showToast(`پکیج باندل «${bundleItem.name}» ساخته شد.`);
              }}
              onTransferWarehouseStock={handleTransferWarehouseStock}
              onShowToast={showToast}
            />
          )}

          {/* ACCOUNTING, SHAREHOLDERS & STAGE-1 PURCHASES WORKSPACE */}
          {activeWorkspace === 'accounting' && (
            <AccountingModule
              productionMode={productionMode}
              activeRole={activeRole}
              defaultBranch={defaultBranch}
              activeFiscalYear={activeFiscalYear}
              initialSubTab={accountingInitialTab}
              accounts={accounts}
              onAddAccount={(acc) => setAccounts((prev) => [...prev, acc])}
              glEntries={glEntries}
              journalEntries={journalEntries}
              onSaveJournalEntry={(je) => {
                const lines = je.lines.map((l) => ({
                  accountCode: l.accountCode,
                  debit: l.debit,
                  credit: l.credit,
                }));
                setAccounts((curr) => postDoubleEntryToAccounts(curr, lines));
                setJournalEntries((prev) => [je, ...prev]);
                showToast(`سند هزینه جاری «${je.title}» ثبت قطعی شد.`);
              }}
              onSubmitJournalEntry={() => {}}
              onCancelJournalEntry={(id) => {
                const je = journalEntries.find((j) => j.id === id);
                if (!je || je.docstatus === 2) return;
                const revLines = je.lines.map((l) => ({
                  accountCode: l.accountCode,
                  debit: l.credit,
                  credit: l.debit,
                }));
                setAccounts((curr) => postDoubleEntryToAccounts(curr, revLines));
                setJournalEntries((prev) =>
                  prev.map((j) => (j.id === id ? { ...j, docstatus: 2 } : j))
                );
                showToast(`سند «${je.voucherNo}» باطل شد (Void) و مبلغ به حساب برگشت.`);
              }}
              salesInvoices={salesInvoices}
              onCancelSalesInvoice={handleVoidSalesInvoice}
              purchaseInvoices={purchaseInvoices}
              onCreatePurchaseInvoice={handleCreatePurchaseInvoice}
              onCancelPurchaseInvoice={handleVoidPurchaseInvoice}
              onMarkPurchaseArrived={(id) => {
                setPurchaseInvoices((prev) =>
                  prev.map((p) =>
                    p.id === id ? { ...p, deliveryStatus: 'رسیده' } : p
                  )
                );
                showToast('وضعیت محموله به «رسیده به انبار» تغییر یافت.');
              }}
              costCenters={costCenters}
              recurringTemplates={recurringTemplates}
              monthlyExpenseLedger={monthlyExpenseLedger}
              onAddRecurringTemplate={(tmpl) => {
                setRecurringTemplates((prev) => [
                  ...prev,
                  { ...tmpl, id: `tmpl-${Date.now()}` },
                ]);
                showToast(`قالب هزینه ثابت «${tmpl.name}» اضافه شد.`);
              }}
              onUpdateRecurringTemplateAmount={(id, newAmount) => {
                setRecurringTemplates((prev) =>
                  prev.map((t) =>
                    t.id === id ? { ...t, defaultMonthlyAmount: newAmount } : t
                  )
                );
                showToast(
                  'مبلغ پیش‌فرض قالب برای ماه‌های آینده بروز شد (رکوردهای قفل‌شده ماه‌های قبل تغییر نکردند).'
                );
              }}
              onRecordMonthlyFixedExpense={({
                templateId,
                monthYear,
                amount,
                paidFromAccountCode,
                note,
              }) => {
                const tmpl = recurringTemplates.find((t) => t.id === templateId);
                if (!tmpl) return;
                const vNo = `MFIX-${monthYear.replace('/', '')}-${
                  monthlyExpenseLedger.length + 1
                }`;
                const newRec: MonthlyExpenseLedgerRecord = {
                  id: `mexp-${Date.now()}`,
                  templateId,
                  expenseName: tmpl.name,
                  monthYear,
                  amount,
                  paidFromAccountCode,
                  paymentDate: formatPersianDate(new Date()),
                  voucherNo: vNo,
                  isLocked: true,
                  note,
                };
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: tmpl.accountCode || '5201', debit: amount, credit: 0 },
                    { accountCode: paidFromAccountCode, debit: 0, credit: amount },
                  ])
                );
                setMonthlyExpenseLedger((prev) => [newRec, ...prev]);
                showToast(
                  `هزینه ثابت «${tmpl.name}» برای ماه ${monthYear} ثبت و در تاریخچه قفل شد.`
                );
              }}
              fixedAssets={fixedAssets}
              onAddFixedAsset={(ast) => {
                const newAsset: FixedAssetRecord = {
                  ...ast,
                  id: `ast-${Date.now()}`,
                };
                setFixedAssets((prev) => [newAsset, ...prev]);
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: '1201', debit: ast.purchaseValue, credit: 0 },
                    {
                      accountCode: ast.paidFromAccountCode || '110102',
                      debit: 0,
                      credit: ast.purchaseValue,
                    },
                  ])
                );
                showToast(`دارایی ثابت «${ast.name}» در اموال مغازه ثبت شد.`);
              }}
              onScrapOrSellAsset={() => {}}
              shareholders={shareholders}
              shareholderSnapshots={shareholderSnapshots}
              shareholderDrawings={shareholderDrawings}
              initialInventoryCapitalBaseline={initialInventoryCapitalBaseline}
              onRecordShareholderDrawing={({
                partnerId,
                amount,
                paidFromAccountCode,
                note,
              }) => {
                const partner = shareholders.find((s) => s.id === partnerId);
                if (!partner) return;
                setShareholders((prev) =>
                  prev.map((s) =>
                    s.id === partnerId
                      ? { ...s, dividendPaid: (s.dividendPaid || 0) + amount }
                      : s
                  )
                );
                setShareholderDrawings((prev) => [
                  {
                    id: `drw-${Date.now()}`,
                    partnerId,
                    partnerName: partner.name,
                    date: formatPersianDate(new Date()),
                    amount,
                    paidFromAccountCode,
                    note,
                  },
                  ...prev,
                ]);
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: '3103', debit: amount, credit: 0 },
                    { accountCode: paidFromAccountCode, debit: 0, credit: amount },
                  ])
                );
                showToast(
                  `برداشت سود به مبلغ ${formatCurrency(amount)} ریال برای «${partner.name}» ثبت شد.`
                );
              }}
              onRecordShareholderCapitalInjection={({
                partnerId,
                amount,
                toAccountCode,
              }) => {
                const partner = shareholders.find((s) => s.id === partnerId);
                if (!partner) return;
                setShareholders((prev) =>
                  prev.map((s) =>
                    s.id === partnerId
                      ? {
                          ...s,
                          personalCapitalInjected:
                            (s.personalCapitalInjected || 0) + amount,
                        }
                      : s
                  )
                );
                setAccounts((curr) =>
                  postDoubleEntryToAccounts(curr, [
                    { accountCode: toAccountCode, debit: amount, credit: 0 },
                    { accountCode: '3101', debit: 0, credit: amount },
                  ])
                );
                showToast(
                  `آورده نقدی به مبلغ ${formatCurrency(amount)} ریال برای «${partner.name}» ثبت شد.`
                );
              }}
              onUpdateShareholderPercentagesWithSnapshot={({
                partner1CapitalPct,
                partner1ProfitPct,
                partner2CapitalPct,
                partner2ProfitPct,
                note,
              }) => {
                const snap: ShareholderRuleSnapshot = {
                  id: `sh-snap-${Date.now()}`,
                  effectiveDate: formatPersianDate(new Date()),
                  partner1Name: shareholders[0]?.name || 'شریک اول',
                  partner1CapitalPct,
                  partner1ProfitPct,
                  partner2Name: shareholders[1]?.name || 'شریک دوم',
                  partner2CapitalPct,
                  partner2ProfitPct,
                  frozenPartner1Wallet: 0,
                  frozenPartner2Wallet: 0,
                  frozenRecoveryPool: initialInventoryCapitalBaseline,
                  note,
                };
                setShareholderSnapshots((prev) => [snap, ...prev]);
                setShareholders((prev) =>
                  prev.map((s, idx) =>
                    idx === 0
                      ? {
                          ...s,
                          ownershipPercent: partner1CapitalPct,
                          profitSharePercent: partner1ProfitPct,
                        }
                      : {
                          ...s,
                          ownershipPercent: partner2CapitalPct,
                          profitSharePercent: partner2ProfitPct,
                        }
                  )
                );
                showToast(
                  'تغییر درصد سهامداران با ثبت Snapshot فریز تاریخچه ذخیره شد.'
                );
              }}
              inventoryItems={inventoryItems}
              customerContacts={customerContacts}
              onQuickAddSupplier={(supplierName, phone) => {
                const newContact: CustomerContactRecord = {
                  id: `sup-${Date.now()}`,
                  sourceCode: `SUP-${customerContacts.length + 1}`,
                  fullName: supplierName,
                  personType: 'حقوقی / تامین‌کننده',
                  role: 'تأمین‌کننده',
                  contactCategory: 'supplier',
                  phone: phone || '—',
                  notes: 'افزوده‌شده مستقیم از فرم فاکتور خرید',
                };
                setCustomerContacts((prev) => [newContact, ...prev]);
                showToast(`تأمین‌کننده «${supplierName}» به لیست مخاطبین اضافه شد.`);
              }}
              masterOptions={masterOptions}
              onAddMasterOption={handleAddMasterOption}
              warehouses={warehouses}
              onNavigateToPos={() => setActiveWorkspace('pos')}
              onNavigateToInventoryBreakdown={() => {
                setInventoryInitialTab('sku_allocation');
                setActiveWorkspace('stock');
              }}
              privacyMask={privacyMask}
              onShowToast={showToast}
            />
          )}

          {/* ANALYTICS & BI WORKSPACE */}
          {activeWorkspace === 'analytics' && (
            <AnalyticsBiModule
              privacyMasked={privacyMask}
              onTogglePrivacy={() => setPrivacyMask((prev) => !prev)}
              accounts={accounts}
              inventoryItems={inventoryItems}
              salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices}
              journalEntries={journalEntries}
              monthlyExpenses={monthlyExpenseLedger}
              contacts={customerContacts}
              onCreateDeadStockFestivalRule={(sku, itemName) => {
                const rule: PromotionRuleRecord = {
                  id: `promo-dead-${Date.now()}`,
                  name: `حراج رسوب انبار: ${itemName}`,
                  festivalType: 'حراج رسوب انبار',
                  discountType: 'percent',
                  discountValue: 15,
                  minQty: 1,
                  targetGroup: 'همه مشتریان',
                  startDate: '۱۴۰۴/۰۸/۱۵',
                  endDate: '۱۴۰۴/۰۹/۱۵',
                  applicableSkus: [sku],
                  paymentModel: 'نقد',
                  isActive: true,
                };
                setPromotionRules((prev) => [rule, ...prev]);
                showToast(
                  `جشنواره ۱۵٪ تخفیف برای خروج کالای راکد «${itemName}» ایجاد و فعال شد.`
                );
              }}
              onShowToast={showToast}
            />
          )}

          {/* CRM & MARKETING WORKSPACE (6 TABS) */}
          {activeWorkspace === 'crm' && (
            <CrmMarketingModule
              leads={crmLeads}
              contacts={customerContacts}
              salesInvoices={salesInvoices}
              purchaseInvoices={purchaseInvoices}
              paymentEntries={paymentEntries}
              bulkSmsPool={bulkSmsPool}
              privacyMasked={privacyMask}
              productionMode={productionMode}
              onAddContact={(newContact) => {
                setCustomerContacts((prev) => [newContact, ...prev]);
                showToast(`مخاطب «${newContact.fullName}» ثبت شد.`);
              }}
              onAddLead={(lead) => {
                setCrmLeads((prev) => [lead, ...prev]);
                showToast(`سرنخ تبلیغاتی «${lead.fullName}» ثبت شد.`);
              }}
              onAdvanceLeadStage={(id) => {
                setCrmLeads((prev) =>
                  prev.map((l) =>
                    l.id === id ? { ...l, stage: 'مشتری وفادار', probability: 100 } : l
                  )
                );
              }}
              onImportBulkSmsNumbers={(items) => {
                setBulkSmsPool((prev) => [...items, ...prev]);
                showToast(
                  `${items.length} شماره جدید به استخر لید انبوه (Bulk SMS Pool) اضافه شد.`
                );
              }}
              onShowToast={showToast}
            />
          )}

          {/* OPERATIONAL CALENDAR & CUSTOMER WISHLIST WORKSPACE */}
          {activeWorkspace === 'calendar' && (
            <OperationalCalendarModule
              events={calendarEvents}
              wishlist={customerWishlist}
              purchaseInvoices={purchaseInvoices}
              salesInvoices={salesInvoices}
              recurringTemplates={recurringTemplates}
              onAddEvent={(ev) => {
                setCalendarEvents((prev) => [
                  { ...ev, id: `ev-${Date.now()}` },
                  ...prev,
                ]);
                showToast(`یادآور «${ev.title}» در تقویم عملیاتی ثبت شد.`);
              }}
              onToggleEventComplete={(id) => {
                setCalendarEvents((prev) =>
                  prev.map((e) =>
                    e.id === id ? { ...e, isCompleted: !e.isCompleted } : e
                  )
                );
              }}
              onDeleteEvent={(id) => {
                setCalendarEvents((prev) => prev.filter((e) => e.id !== id));
              }}
              onAddWishlist={(w) => {
                setCustomerWishlist((prev) => [
                  { ...w, id: `wish-${Date.now()}` },
                  ...prev,
                ]);
                showToast(
                  `درخواست شارژ «${w.requestedItemName}» برای ${w.customerName} ثبت و به تقویم متصل شد.`
                );
              }}
              onUpdateWishlistStatus={(id, status) => {
                setCustomerWishlist((prev) =>
                  prev.map((w) => (w.id === id ? { ...w, status } : w))
                );
                showToast(`وضعیت درخواست مشتری به «${status}» تغییر کرد.`);
              }}
              onDeleteWishlist={(id) => {
                setCustomerWishlist((prev) => prev.filter((w) => w.id !== id));
              }}
              privacyMask={privacyMask}
            />
          )}

          {/* WEBSHOP & SUPPORT WORKSPACE */}
          {activeWorkspace === 'webshop' && (
            <SupportWebshopModule
              productionMode={productionMode}
              inventoryItems={inventoryItems}
              salesInvoices={salesInvoices}
              onWebshopOrderCheckout={(item) => {
                showToast(`سفارش آنلاین برای «${item.name}» ثبت شد.`);
              }}
              onShowToast={showToast}
            />
          )}

          {/* SETTINGS & SINGLE-BRANCH MANAGEMENT WORKSPACE */}
          {activeWorkspace === 'settings' && (
            <FrappeCoreModule
              auditLogs={auditLogs}
              branches={branches}
              activeBranch={defaultBranch}
              onAddBranch={(newBranch) => {
                if (!branches.includes(newBranch)) {
                  setBranches((prev) => [...prev, newBranch]);
                }
                setDefaultBranch(newBranch);
                showToast(`شعبه جدید «${newBranch}» اضافه و به عنوان شعبه فعال انتخاب شد.`);
              }}
              onSelectBranch={(b) => {
                setDefaultBranch(b);
                showToast(`شعبه فعال روی «${b}» تنظیم شد.`);
              }}
              onExportFullData={() => {
                const dump = {
                  exportedAt: new Date().toISOString(),
                  branch: defaultBranch,
                  accounts,
                  inventoryItems,
                  customerContacts,
                  salesInvoices,
                  purchaseInvoices,
                  shareholders,
                };
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(dump, null, 2)], {
                    type: 'application/json',
                  })
                );
                const a = document.createElement('a');
                a.href = url;
                a.download = 'farapay-cloudyshop-backup.json';
                a.click();
              }}
              onShowToast={showToast}
              onImportHesabfaData={(raw) => {
                try {
                  const payload = parseHesabfaImportPayload(raw);
                  const summary = summarizeHesabfaImport(payload);
                  setProductionMode(true);
                  setInventoryItems(normalizeCloudyShopInventory(payload.products));
                  setCustomerContacts(payload.contacts);
                  setSalesInvoices(payload.salesInvoices);
                  showToast(
                    `ورود داده انجام شد: ${summary.productCount} کالا و ${summary.contactCount} مخاطب.`
                  );
                } catch {
                  showToast('خطا در خواندن فایل ورودی.');
                }
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
