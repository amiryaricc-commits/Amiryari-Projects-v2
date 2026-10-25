import React, { useState, useMemo, useRef } from 'react';
import {
  ShoppingBag,
  Barcode,
  Printer,
  Plus,
  Minus,
  Eye,
  EyeOff,
  RotateCcw,
  Wrench,
  Sparkles,
  Users,
  Tag,
  Trash2,
  Droplets,
  PackageCheck,
  FileText,
  XCircle,
  Truck,
} from 'lucide-react';
import {
  CustomerContactRecord,
  InventoryItemRecord,
  PromotionRuleRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  PosServiceLineItem,
  WarehouseKey,
  WarehouseRecord,
  MasterOptionsRegistry,
} from '../data/erpSeedData';
import {
  formatCurrency,
  formatPersianDate,
  smartFilterAndRankItems,
  calculateCostPerMl,
} from '../utils/erpEngine';
import {
  CreatableCombobox,
  PolarisButton,
  PolarisButtonGroup,
  PolarisCollapsible,
  PolarisSheet,
} from './CreatableCombobox';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { calculatePosCartTotals } from '../utils/posService';

export interface PosCheckoutPayload {
  cartLines: {
    sku: string;
    name: string;
    qty: number;
    uom: 'عدد' | 'میلی‌لیتر';
    isDecantMl: boolean;
    systemUnitPrice: number;
    finalManualUnitPrice: number;
    unitValuationCost: number;
    sector: 'vape' | 'pc';
    warehouseKey: WarehouseKey;
  }[];
  serviceLines: PosServiceLineItem[];
  pricingMode: 'normal' | 'festival' | 'reseller';
  grossTotal: number;
  festivalDiscountAmount: number;
  netTotal: number;
  paidAmount: number;
  creditReceivableAmount: number;
  paymentAccountCode: '110101' | '110102' | '110103';
  paymentMethodLabel: 'کارتخوان (POS)' | 'کارت بانکی (کارت به کارت)' | 'نقد (صندوق مغازه)';
  customerName: string;
  customerPhone?: string;
  referralName?: string;
}

export interface PosReturnPayload {
  sourceInvoiceId: string;
  resolutionMode: 'credit_balance' | 'exchange' | 'cash_refund';
  refundAccountCode?: '110102' | '110103';
  exchangeReplacementSku?: string;
  exchangeReplacementQty?: number;
  notes?: string;
}

interface SellingPosModuleProps {
  productionMode: boolean;
  privacyMasked?: boolean;
  initialView?:
    | 'pos'
    | 'purchase_invoice'
    | 'returns'
    | 'reseller_pricelist'
    | 'invoices_archive';
  contacts: CustomerContactRecord[];
  inventoryItems: InventoryItemRecord[];
  promotionRules: PromotionRuleRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices?: PurchaseInvoiceRecord[];
  warehouses?: WarehouseRecord[];
  masterOptions?: MasterOptionsRegistry;
  onAddMasterOption?: (category: keyof MasterOptionsRegistry, val: string) => void;
  onAddQuickCustomer: (contact: CustomerContactRecord) => void;
  onQuickAddSupplier?: (supplierName: string, phone?: string) => void;
  onCreateQuickInventoryItem?: (item: InventoryItemRecord) => void;
  onUpdateResellerPrice: (sku: string, newResellerPrice: number) => void;
  onCompletePosCheckout: (payload: PosCheckoutPayload) => boolean;
  onProcessPosReturn: (payload: PosReturnPayload) => boolean;
  onVoidSalesInvoice?: (id: string) => void;
  onCreatePurchaseInvoice?: (pinv: PurchaseInvoiceRecord) => boolean;
  onVoidPurchaseInvoice?: (id: string) => void;
  onMarkPurchaseArrived?: (id: string) => void;
  onNavigateToInventoryBreakdown?: (billNo?: string) => void;
  onShowToast: (msg: string) => void;
}

interface ActiveCartRow {
  rowId: string;
  item: InventoryItemRecord;
  qty: number;
  isDecantMl: boolean;
  manualUnitPrice: number;
  revealCost: boolean;
  warehouseKey: WarehouseKey;
}

const LIQUIDITY_ACCOUNTS = [
  { code: '110101', label: '۱۱۰۱۰۱ — کارتخوان (POS)' },
  { code: '110102', label: '۱۱۰۱۰۲ — کارت بانکی (کارت به کارت)' },
  { code: '110103', label: '۱۱۰۱۰۳ — نقد (صندوق مغازه)' },
] as const;

export const SellingPosModule: React.FC<SellingPosModuleProps> = ({
  privacyMasked = false,
  initialView = 'pos',
  contacts,
  inventoryItems,
  promotionRules,
  salesInvoices,
  purchaseInvoices = [],
  warehouses = [],
  masterOptions,
  onAddMasterOption,
  onAddQuickCustomer,
  onQuickAddSupplier,
  onCreateQuickInventoryItem,
  onUpdateResellerPrice,
  onCompletePosCheckout,
  onProcessPosReturn,
  onVoidSalesInvoice,
  onCreatePurchaseInvoice,
  onVoidPurchaseInvoice,
  onMarkPurchaseArrived,
  onNavigateToInventoryBreakdown,
  onShowToast,
}) => {
  const [activeView, setActiveView] = useState<
    'pos' | 'purchase_invoice' | 'returns' | 'reseller_pricelist' | 'invoices_archive'
  >(initialView);

  React.useEffect(() => {
    setActiveView(initialView);
  }, [initialView]);

  // Polaris Autocomplete + Popover Search & Pricing Mode
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [isSearchPopoverOpen, setIsSearchPopoverOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<'normal' | 'festival' | 'reseller'>('normal');
  const [revealTableBuyingCost, setRevealTableBuyingCost] = useState(false);

  // Polaris Button Loading Locks (anti-duplicate submission)
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);
  const [isSubmittingPurchase, setIsSubmittingPurchase] = useState(false);
  const [voidingInvoiceId, setVoidingInvoiceId] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);

  // Cart & Collapsible Service Lines (Collapsed by default)
  const [cart, setCart] = useState<ActiveCartRow[]>([]);
  const [isServiceCollapsibleOpen, setIsServiceCollapsibleOpen] = useState(false);
  const [serviceLines, setServiceLines] = useState<PosServiceLineItem[]>([]);
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceFee, setServiceFee] = useState<number>(0);
  const [linkedConsumableSku, setLinkedConsumableSku] = useState('');
  const [linkedConsumableQty, setLinkedConsumableQty] = useState<number>(1);

  // Customer Search & Polaris Sheet (+ New Customer — Closed by default)
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerContactRecord | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [isCustomerSheetOpen, setIsCustomerSheetOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustStyle, setNewCustStyle] = useState('سالت نیکوتین (MTL)');

  // Referral Search (Collapsible — Closed by default)
  const [isReferralCollapsibleOpen, setIsReferralCollapsibleOpen] = useState(false);
  const [referralSearch, setReferralSearch] = useState('');
  const [selectedReferral, setSelectedReferral] = useState('');

  // Settlement Controls
  const [paymentAccountCode, setPaymentAccountCode] = useState<'110101' | '110102' | '110103'>(
    '110101'
  );
  const [paidAmountInput, setPaidAmountInput] = useState<number | null>(null);

  // Thermal Receipt Modal
  const [lastReceiptSnapshot, setLastReceiptSnapshot] = useState<PosCheckoutPayload | null>(null);
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);

  // Sales Returns State
  const [selectedReturnInvoiceId, setSelectedReturnInvoiceId] = useState(
    salesInvoices.find((i) => i.docstatus === 1 && !i.returnAgainst)?.id || ''
  );
  const [returnMode, setReturnMode] = useState<'credit_balance' | 'exchange' | 'cash_refund'>(
    'credit_balance'
  );
  const [refundAccountCode, setRefundAccountCode] = useState<'110102' | '110103'>('110102');
  const [exchangeSku, setExchangeSku] = useState(inventoryItems[0]?.sku || '');
  const [exchangeQty, setExchangeQty] = useState<number>(1);
  const [returnNotes, setReturnNotes] = useState('');

  // Reseller Price List Search
  const [resellerSearch, setResellerSearch] = useState('');

  // Stage-1 Purchase Invoice State (Centralized in /pos) + Polaris Sheet (+ New Supplier)
  const [isSupplierSheetOpen, setIsSupplierSheetOpen] = useState(false);
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [pinvSupplier, setPinvSupplier] = useState('پخش ویپ تهران');
  const [pinvItemName, setPinvItemName] = useState('');
  const [pinvParentTag, setPinvParentTag] = useState('سالت نیکوتین');
  const [pinvCondition, setPinvCondition] = useState('آکبند');
  const [pinvItemType, setPinvItemType] = useState('جویس و سالت');
  const [pinvTotalQty, setPinvTotalQty] = useState('10');
  const [pinvUnitCost, setPinvUnitCost] = useState('');
  const [pinvDiscountReceived, setPinvDiscountReceived] = useState('0');
  const [pinvDeliveryStatus, setPinvDeliveryStatus] = useState<'در انتظار رسیدن بار' | 'رسیده'>(
    'در انتظار رسیدن بار'
  );
  const [pinvWarehouseKey, setPinvWarehouseKey] = useState<string>('central_external');
  const [pinvPaymentAccountCode, setPinvPaymentAccountCode] = useState<string>('110102');
  const [pinvPaidAmount, setPinvPaidAmount] = useState<string>('');
  const [pinvSettlementDueDate, setPinvSettlementDueDate] = useState<string>('۱۴۰۴/۰۸/۲۵');
  const [pinvPaymentNotes, setPinvPaymentNotes] = useState<string>('');

  // Filtered items with case-insensitive exact-first ranking
  const filteredCatalogItems = useMemo(
    () => smartFilterAndRankItems(inventoryItems, barcodeQuery),
    [inventoryItems, barcodeQuery]
  );

  // Helper: compute system unit price based on pricingMode & decant ml
  const getSystemUnitPrice = (
    item: InventoryItemRecord,
    isDecantMl: boolean,
    mode: 'normal' | 'festival' | 'reseller'
  ): number => {
    const baseSelling = item.retailPrice;
    const resellerRate =
      item.resellerPrice || item.partnerPrice || item.wholesalePrice || Math.round(baseSelling * 0.86);

    let unitRate = mode === 'reseller' ? resellerRate : baseSelling;

    if (mode === 'festival') {
      const activePromo = promotionRules.find(
        (r) =>
          r.isActive &&
          (!r.applicableSkus ||
            r.applicableSkus.length === 0 ||
            r.applicableSkus.includes(item.sku))
      );
      if (activePromo) {
        if (activePromo.discountType === 'percent') {
          unitRate = Math.round(unitRate * (1 - activePromo.discountValue / 100));
        } else {
          unitRate = Math.max(0, unitRate - activePromo.discountValue);
        }
      } else {
        unitRate = Math.round(unitRate * 0.9);
      }
    }

    if (isDecantMl) {
      const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
      const perMlBase = Math.round(unitRate / Math.max(1, bottleVol));
      return Math.round(perMlBase * 1.15);
    }

    return unitRate;
  };

  // Add item to cart
  const handleAddItemToCart = (item: InventoryItemRecord, asDecantMl = false) => {
    const canDecant =
      asDecantMl &&
      (item.allowDecantSale || item.category === 'جویس و سالت');

    const sysPrice = getSystemUnitPrice(item, Boolean(canDecant), pricingMode);
    const defaultWh: WarehouseKey =
      (item.warehouseStock?.vitrine || 0) > 0 ? 'vitrine' : 'central_external';

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (r) => r.item.sku === item.sku && r.isDecantMl === Boolean(canDecant)
      );
      if (existingIndex >= 0) {
        return prev.map((r, idx) =>
          idx === existingIndex
            ? { ...r, qty: r.qty + (canDecant ? 10 : 1) }
            : r
        );
      }
      return [
        ...prev,
        {
          rowId: `${item.sku}-${canDecant ? 'ml' : 'unit'}-${Date.now()}`,
          item,
          qty: canDecant ? 10 : 1,
          isDecantMl: Boolean(canDecant),
          manualUnitPrice: sysPrice,
          revealCost: false,
          warehouseKey: defaultWh,
        },
      ];
    });
  };

  // Polaris Creatable action for barcode/item search when SKU does not exist yet
  const handleCreatableQuickItem = () => {
    const q = barcodeQuery.trim();
    if (!q) return;
    const newItem: InventoryItemRecord = {
      id: `item-quick-${Date.now()}`,
      sku: q.toUpperCase().startsWith('SKU') ? q.toUpperCase() : `SKU-${Date.now().toString().slice(-4)}`,
      name: q,
      category: 'جویس و سالت',
      brand: 'کلودی شاپ',
      sector: 'vape',
      condition: 'آکبند',
      uomPrimary: 'عدد',
      stockQty: 10,
      reservedQty: 0,
      reorderLevel: 2,
      warehouseStock: {
        vitrine: 10,
        shop_storage: 0,
        central_external: 0,
        consignment: 0,
      },
      valuationRate: 350000,
      retailPrice: 480000,
      wholesalePrice: 430000,
      partnerPrice: 420000,
      resellerPrice: 420000,
      serialNumbers: [],
      batchNo: 'B-1404',
      expiryDate: '۱۴۰۵/۰۶/۳۰',
    };
    onCreateQuickInventoryItem?.(newItem);
    handleAddItemToCart(newItem, false);
    setBarcodeQuery('');
    setIsSearchPopoverOpen(false);
    barcodeInputRef.current?.focus();
    onShowToast(`کالای جدید «${newItem.name}» ایجاد و به سبد خرید اضافه شد.`);
  };

  // Hardware Barcode Scanner Hook (non-interfering with normal inputs)
  useBarcodeScanner({
    enabled: activeView === 'pos',
    onScan: (scannedCode) => {
      const matched = smartFilterAndRankItems(inventoryItems, scannedCode);
      if (matched.length > 0) {
        handleAddItemToCart(matched[0], false);
        setBarcodeQuery('');
        setIsSearchPopoverOpen(false);
        barcodeInputRef.current?.focus();
      } else {
        setBarcodeQuery(scannedCode);
        setIsSearchPopoverOpen(true);
        barcodeInputRef.current?.focus();
      }
    },
  });

  // Barcode scanner Enter handler: adds exact or top match, clears input & keeps focus
  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = barcodeQuery.trim();
      if (!q) {
        barcodeInputRef.current?.focus();
        return;
      }
      const matched = smartFilterAndRankItems(inventoryItems, q);
      if (matched.length > 0) {
        handleAddItemToCart(matched[0], false);
        setBarcodeQuery('');
        setIsSearchPopoverOpen(false);
        barcodeInputRef.current?.focus();
      } else {
        onShowToast(`کالایی با کد یا نام «${q}» یافت نشد؛ با دکمه (+) می‌توانید فوری بسازید.`);
        barcodeInputRef.current?.focus();
      }
    } else if (e.key === 'Escape') {
      setIsSearchPopoverOpen(false);
    }
  };

  // Switch pricing mode and recalculate default prices
  const handleSwitchPricingMode = (newMode: 'normal' | 'festival' | 'reseller') => {
    setPricingMode(newMode);
    setCart((prev) =>
      prev.map((row) => ({
        ...row,
        manualUnitPrice: getSystemUnitPrice(row.item, row.isDecantMl, newMode),
      }))
    );
  };

  const handleAddServiceLine = () => {
    if (!serviceTitle.trim() || serviceFee <= 0) {
      onShowToast('عنوان خدمت و مبلغ دستمزد را وارد کنید.');
      return;
    }
    const consumable = inventoryItems.find((i) => i.sku === linkedConsumableSku);
    const newService: PosServiceLineItem = {
      id: `srv-${Date.now()}`,
      serviceTitle: serviceTitle.trim(),
      feeAmount: Math.max(0, Number(serviceFee) || 0),
      linkedConsumableSku: consumable?.sku,
      linkedConsumableName: consumable?.name,
      linkedConsumableQty: consumable ? Math.max(1, Number(linkedConsumableQty) || 1) : undefined,
      consumableCost: consumable
        ? Math.max(1, Number(linkedConsumableQty) || 1) * consumable.valuationRate
        : 0,
    };
    setServiceLines((prev) => [...prev, newService]);
    setServiceTitle('');
    setServiceFee(0);
    setLinkedConsumableSku('');
    setLinkedConsumableQty(1);
    onShowToast(`خدمت «${newService.serviceTitle}» به فاکتور اضافه شد.`);
  };

  // Calculate Totals via posService (Exact decimal arithmetic)
  const {
    goodsTotal,
    servicesTotal,
    festivalExtraDiscount,
    grandTotal,
    effectivePaidAmount,
    creditReceivableAmount,
  } = useMemo(
    () =>
      calculatePosCartTotals({
        cart,
        serviceLines,
        pricingMode,
        promotionRules,
        paidAmountInput,
      }),
    [cart, serviceLines, pricingMode, promotionRules, paidAmountInput]
  );

  // Customer filter (Name or Phone)
  const matchingCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return contacts.slice(0, 12);
    return contacts.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.sourceCode && c.sourceCode.toLowerCase().includes(q))
    );
  }, [contacts, customerSearch]);

  const matchingReferrals = useMemo(() => {
    const q = referralSearch.trim().toLowerCase();
    if (!q) return contacts.slice(0, 8);
    return contacts.filter(
      (c) => c.fullName.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
    );
  }, [contacts, referralSearch]);

  // Polaris Sheet Save Handler: New Customer
  const handleCreateQuickCustomer = () => {
    if (isSavingCustomer) return;
    if (!newCustName.trim()) {
      onShowToast('نام مشتری جدید الزامی است.');
      return;
    }
    setIsSavingCustomer(true);
    const created: CustomerContactRecord = {
      id: `cust-${Date.now()}`,
      sourceCode: `C-${contacts.length + 101}`,
      fullName: newCustName.trim(),
      personType: 'حقیقی',
      role: 'مشتری عادی',
      contactCategory: 'customer',
      phone: newCustPhone.trim(),
      vapingStyle: newCustStyle,
      notes: 'ثبت سریع از Sheet صندوق فروشگاهی',
    };
    onAddQuickCustomer(created);
    setSelectedCustomer(created);
    setCustomerSearch(`${created.fullName} (${created.phone || 'بدون شماره'})`);
    setNewCustName('');
    setNewCustPhone('');
    setIsSavingCustomer(false);
    setIsCustomerSheetOpen(false);
  };

  // Polaris Sheet Save Handler: New Supplier
  const handleCreateQuickSupplier = () => {
    if (isSavingSupplier) return;
    if (!newSupplierName.trim()) {
      onShowToast('نام تأمین‌کننده جدید الزامی است.');
      return;
    }
    setIsSavingSupplier(true);
    onQuickAddSupplier?.(newSupplierName.trim(), newSupplierPhone.trim());
    setPinvSupplier(newSupplierName.trim());
    setNewSupplierName('');
    setNewSupplierPhone('');
    setIsSavingSupplier(false);
    setIsSupplierSheetOpen(false);
  };

  // Single Primary Action: Submit POS Invoice with loading lock
  const handleSubmitPosInvoice = () => {
    if (isSubmittingSale) return;
    if (cart.length === 0 && serviceLines.length === 0) {
      onShowToast('سبد صندوق خالی است؛ حداقل یک کالا یا خدمت وارد کنید.');
      return;
    }
    if (creditReceivableAmount > 0 && !selectedCustomer && !customerSearch.trim()) {
      onShowToast('برای ثبت فاکتور نسیه (مانده طلب)، انتخاب مشتری الزامی است.');
      return;
    }

    setIsSubmittingSale(true);

    const paymentMethodLabel =
      paymentAccountCode === '110101'
        ? 'کارتخوان (POS)'
        : paymentAccountCode === '110102'
          ? 'کارت بانکی (کارت به کارت)'
          : 'نقد (صندوق مغازه)';

    const payload: PosCheckoutPayload = {
      cartLines: cart.map((r) => {
        const bottleVol = r.item.bottleVolumeMl || r.item.liquidVolumeMl || 60;
        const unitCost = r.isDecantMl
          ? calculateCostPerMl(r.item.valuationRate, bottleVol)
          : r.item.valuationRate;
        return {
          sku: r.item.sku,
          name: r.item.name,
          qty: r.qty,
          uom: r.isDecantMl ? 'میلی‌لیتر' : 'عدد',
          isDecantMl: r.isDecantMl,
          systemUnitPrice: getSystemUnitPrice(r.item, r.isDecantMl, pricingMode),
          finalManualUnitPrice: r.manualUnitPrice,
          unitValuationCost: unitCost,
          sector:
            r.item.sector ||
            (r.item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape'),
          warehouseKey: r.warehouseKey,
        };
      }),
      serviceLines,
      pricingMode,
      grossTotal: goodsTotal + servicesTotal,
      festivalDiscountAmount: festivalExtraDiscount,
      netTotal: grandTotal,
      paidAmount: effectivePaidAmount,
      creditReceivableAmount,
      paymentAccountCode,
      paymentMethodLabel,
      customerName: selectedCustomer?.fullName || customerSearch.trim() || 'مشتری حضوری',
      customerPhone: selectedCustomer?.phone,
      referralName: selectedReferral || undefined,
    };

    window.setTimeout(() => {
      const ok = onCompletePosCheckout(payload);
      setIsSubmittingSale(false);
      if (!ok) return;

      setLastReceiptSnapshot(payload);
      setShowThermalReceipt(true);
      setCart([]);
      setServiceLines([]);
      setPaidAmountInput(null);
      barcodeInputRef.current?.focus();
    }, 150);
  };

  // Stage-1 Purchase Invoice Calculations & Submit Handler
  const computedPurchaseGrandTotal = useMemo(() => {
    const q = Math.max(1, Number(pinvTotalQty) || 1);
    const c = Math.max(0, Number(pinvUnitCost) || 0);
    const d = Math.max(0, Number(pinvDiscountReceived) || 0);
    return Math.max(0, q * c - d);
  }, [pinvTotalQty, pinvUnitCost, pinvDiscountReceived]);

  const computedPurchaseUnpaidDebt = useMemo(() => {
    const paid = Math.max(0, Number(pinvPaidAmount) || 0);
    return Math.max(0, computedPurchaseGrandTotal - paid);
  }, [computedPurchaseGrandTotal, pinvPaidAmount]);

  const supplierOptions = useMemo(() => {
    const fromContacts = contacts
      .filter((c) => c.contactCategory === 'supplier' || (c.role && c.role.includes('تأمین')))
      .map((c) => c.fullName);
    const defaults = ['پخش ویپ تهران', 'بازرگانی کلودی دبی', 'تامین‌کننده قطعات کامپیوتر پایتخت'];
    return Array.from(new Set([...fromContacts, ...defaults]));
  }, [contacts]);

  const itemNameOptions = useMemo(
    () => Array.from(new Set(inventoryItems.map((i) => i.name))),
    [inventoryItems]
  );

  const handleStage1PurchaseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingPurchase || !onCreatePurchaseInvoice) return;
    if (!pinvSupplier.trim() || !pinvItemName.trim() || !(Number(pinvUnitCost) > 0)) {
      onShowToast('نام تأمین‌کننده، نام کالا و قیمت خرید واحد الزامی است.');
      return;
    }

    setIsSubmittingPurchase(true);
    const qtyNum = Math.max(1, Number(pinvTotalQty) || 1);
    const unitCostNum = Math.max(1, Number(pinvUnitCost) || 0);
    const discNum = Math.max(0, Number(pinvDiscountReceived) || 0);
    const totalNum = Math.max(0, qtyNum * unitCostNum - discNum);
    const paidNum = Math.min(totalNum, Math.max(0, Number(pinvPaidAmount) || 0));

    const newPinv: PurchaseInvoiceRecord = {
      id: `pinv-${Date.now()}`,
      billNo: `PINV-${140400 + purchaseInvoices.length + 1}`,
      supplierName: pinvSupplier.trim(),
      date: formatPersianDate(new Date()),
      warehouse:
        warehouses.find((w) => w.key === pinvWarehouseKey)?.name || 'انبار خارجی / مرکزی',
      totalAmount: totalNum,
      paidAmount: paidNum,
      landedCostAdded: 0,
      status: paidNum >= totalNum ? 'تسویه‌شده' : 'بدهکار باز',
      docstatus: 1,
      branchDimension: 'فروشگاه مرکزی کلودی شاپ',
      itemsSummary: `${pinvItemName.trim()} (${qtyNum} عدد - ${pinvCondition})`,
      parentTag: pinvParentTag,
      itemCondition: pinvCondition,
      itemType: pinvItemType,
      discountReceived: discNum,
      deliveryStatus: pinvDeliveryStatus,
      skuBreakdownCompleted: false,
      paymentAccountCode: pinvPaymentAccountCode,
      settlementDueDate: pinvSettlementDueDate,
      paymentNotes: pinvPaymentNotes.trim() || undefined,
      lines: [
        {
          id: `pline-${Date.now()}`,
          sku: inventoryItems.find((i) => i.name === pinvItemName.trim())?.sku || 'PENDING-SKU',
          itemName: pinvItemName.trim(),
          uom: 'عدد',
          qty: qtyNum,
          unitPrice: unitCostNum,
          discountPercent: 0,
          netLineAmount: totalNum,
          valuationRate: unitCostNum,
          warehouseKey: pinvWarehouseKey,
        },
      ],
    };

    window.setTimeout(() => {
      onCreatePurchaseInvoice(newPinv);
      setIsSubmittingPurchase(false);
      setPinvItemName('');
      setPinvUnitCost('');
      setPinvPaidAmount('');
    }, 150);
  };

  const activePostedInvoices = salesInvoices.filter(
    (inv) => inv.docstatus === 1 && !inv.returnAgainst && inv.status !== 'ابطال‌شده'
  );

  const pricingModeBadgeLabel =
    pricingMode === 'festival'
      ? 'فروش جشنواره'
      : pricingMode === 'reseller'
        ? 'نرخ همکاری (ریسلر)'
        : 'فروش عادی';

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Polaris Secondary Segmented ButtonGroup for View & Pricing Mode */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <PolarisButtonGroup segmented>
          <PolarisButton
            size="slim"
            primary={activeView === 'pos'}
            icon={<ShoppingBag className="w-3.5 h-3.5" />}
            onClick={() => setActiveView('pos')}
          >
            ترمینال فروش (POS)
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeView === 'purchase_invoice'}
            icon={<Truck className="w-3.5 h-3.5" />}
            onClick={() => setActiveView('purchase_invoice')}
          >
            ثبت فاکتور خرید بار
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeView === 'returns'}
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => setActiveView('returns')}
          >
            برگشت از فروش
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeView === 'reseller_pricelist'}
            icon={<Tag className="w-3.5 h-3.5" />}
            onClick={() => setActiveView('reseller_pricelist')}
          >
            لیست قیمت ریسلرها
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeView === 'invoices_archive'}
            icon={<FileText className="w-3.5 h-3.5" />}
            onClick={() => setActiveView('invoices_archive')}
          >
            آرشیو و ابطال فاکتورها ({salesInvoices.length + purchaseInvoices.length})
          </PolarisButton>
        </PolarisButtonGroup>

        {/* Secondary Segmented ButtonGroup: Pricing Mode Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">نرخ‌گذاری صندوق:</span>
          <PolarisButtonGroup segmented>
            <PolarisButton
              size="slim"
              primary={pricingMode === 'normal'}
              onClick={() => handleSwitchPricingMode('normal')}
            >
              فروش عادی
            </PolarisButton>
            <PolarisButton
              size="slim"
              primary={pricingMode === 'festival'}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              onClick={() => handleSwitchPricingMode('festival')}
            >
              فروش جشنواره
            </PolarisButton>
            <PolarisButton
              size="slim"
              primary={pricingMode === 'reseller'}
              icon={<Users className="w-3.5 h-3.5" />}
              onClick={() => handleSwitchPricingMode('reseller')}
            >
              ریسلر (همکار)
            </PolarisButton>
          </PolarisButtonGroup>
        </div>
      </div>

      {/* =====================================================================
          VIEW 1: POS TERMINAL (Polaris IndexTable Catalog + Compact Cart Table)
         ===================================================================== */}
      {activeView === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* LEFT 7 COLS: Creatable Autocomplete Barcode Search + Polaris IndexTable Catalog */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            {/* Search & Barcode Scanner Input with Polaris Popover + Creatable Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={barcodeInputRef}
                  type="text"
                  autoFocus
                  value={barcodeQuery}
                  onFocus={() => setIsSearchPopoverOpen(true)}
                  onChange={(e) => {
                    setBarcodeQuery(e.target.value);
                    setIsSearchPopoverOpen(true);
                  }}
                  onKeyDown={handleBarcodeKeyDown}
                  placeholder="اسکن بارکد یا جستجوی نام کالا / کد SKU (Enter = افزودن فوری و حفظ فوکوس)..."
                  className="w-full pr-9 pl-9 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                />
                {barcodeQuery.trim() && (
                  <button
                    type="button"
                    title="افزودن فوری کالای جدید (Creatable)"
                    onClick={handleCreatableQuickItem}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Polaris Autocomplete Popover */}
                {isSearchPopoverOpen && barcodeQuery.trim().length > 0 && (
                  <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredCatalogItems.slice(0, 6).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          handleAddItemToCart(item, false);
                          setBarcodeQuery('');
                          setIsSearchPopoverOpen(false);
                          barcodeInputRef.current?.focus();
                        }}
                        className="w-full px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono font-bold text-indigo-600 ml-2">
                            {item.sku}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </span>
                        </div>
                        <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {formatCurrency(getSystemUnitPrice(item, false, pricingMode))} ت
                        </span>
                      </button>
                    ))}
                    {onCreateQuickInventoryItem && (
                      <button
                        type="button"
                        onClick={handleCreatableQuickItem}
                        className="w-full px-3 py-2 text-right bg-indigo-50/90 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between"
                      >
                        <span className="flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" />
                          <span>افزودن فوری «{barcodeQuery.trim()}» به کالاها و سبد</span>
                        </span>
                        <span className="text-[10px] font-mono">Creatable</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              <PolarisButton
                size="slim"
                icon={
                  revealTableBuyingCost ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )
                }
                onClick={() => setRevealTableBuyingCost((prev) => !prev)}
              >
                {revealTableBuyingCost ? 'مخفی کردن خرید' : 'نمایش قیمت خرید'}
              </PolarisButton>
            </div>

            {/* Polaris IndexTable: Compact Scrollable Product Catalog */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="max-h-[430px] overflow-y-auto overflow-x-auto">
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 z-10">
                    <tr>
                      <th className="py-2 px-2.5 font-semibold">کد کالا</th>
                      <th className="py-2 px-2.5 font-semibold">نام و مشخصات کالا</th>
                      <th className="py-2 px-2.5 font-semibold">موجودی</th>
                      <th className="py-2 px-2.5 font-semibold text-left">قیمت خرید</th>
                      <th className="py-2 px-2.5 font-semibold text-left">
                        قیمت فروش ({pricingModeBadgeLabel})
                      </th>
                      <th className="py-2 px-2.5 font-semibold text-center">افزودن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredCatalogItems.map((item) => {
                      const canDecant =
                        item.allowDecantSale || item.category === 'جویس و سالت';
                      const activePrice = getSystemUnitPrice(item, false, pricingMode);
                      const openMl = item.openBottleRemainingMl || 0;

                      return (
                        <tr
                          key={item.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <td className="py-2 px-2.5 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {item.sku}
                          </td>
                          <td className="py-2 px-2.5">
                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {item.category}
                              {item.flavor ? ` · ${item.flavor}` : ''}
                              {item.nicotine ? ` · ${item.nicotine}` : ''}
                              {item.isBundle ? ' · باندل' : ''}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                item.stockQty > 0
                                  ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                                  : 'text-rose-600 font-bold'
                              }
                            >
                              {item.stockQty} {item.uomPrimary}
                            </span>
                            {openMl > 0 && (
                              <span className="text-[10px] text-indigo-600 font-mono mr-1">
                                (+{openMl}ml)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums text-left text-slate-500 whitespace-nowrap">
                            {revealTableBuyingCost && !privacyMasked
                              ? `${formatCurrency(item.valuationRate)} ت`
                              : '****'}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums text-left font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                            {formatCurrency(activePrice)} ت
                          </td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <PolarisButton
                                size="slim"
                                icon={<Plus className="w-3 h-3" />}
                                onClick={() => handleAddItemToCart(item, false)}
                              >
                                عدد
                              </PolarisButton>
                              {canDecant && (
                                <PolarisButton
                                  size="slim"
                                  outline
                                  icon={<Droplets className="w-3 h-3" />}
                                  title="فروش میلی‌لیتری (دکانت باز)"
                                  onClick={() => handleAddItemToCart(item, true)}
                                >
                                  ml
                                </PolarisButton>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Polaris Collapsible: Technical Repair / Service Lines (Closed by default, opens with +) */}
            <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                  <span>خدمات فنی و تعمیرات ({serviceLines.length} مورد در فاکتور)</span>
                </span>
                <PolarisButton
                  size="slim"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setIsServiceCollapsibleOpen((prev) => !prev)}
                >
                  {isServiceCollapsibleOpen ? 'بستن فرم خدمات' : 'افزودن خدمت فنی'}
                </PolarisButton>
              </div>

              <PolarisCollapsible
                id="pos-service-collapsible"
                open={isServiceCollapsibleOpen}
                className="mt-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end text-xs">
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 mb-1">عنوان خدمت فنی</label>
                    <input
                      type="text"
                      value={serviceTitle}
                      onChange={(e) => setServiceTitle(e.target.value)}
                      placeholder="مثلاً تعویض پنبه و کویل..."
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">دستمزد (تومان)</label>
                    <input
                      type="number"
                      min={0}
                      value={serviceFee || ''}
                      onChange={(e) => setServiceFee(Number(e.target.value))}
                      placeholder="85000"
                      className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] text-slate-500 mb-1">کالای مصرفی از ویترین</label>
                    <select
                      value={linkedConsumableSku}
                      onChange={(e) => setLinkedConsumableSku(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value="">بدون کسر کالای مصرفی</option>
                      {inventoryItems.map((i) => (
                        <option key={i.sku} value={i.sku}>
                          {i.name} (ویترین: {i.warehouseStock?.vitrine ?? i.stockQty})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">تعداد مصرفی</label>
                    <input
                      type="number"
                      min={1}
                      disabled={!linkedConsumableSku}
                      value={linkedConsumableQty}
                      onChange={(e) =>
                        setLinkedConsumableQty(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-full px-2 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums disabled:opacity-50"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <PolarisButton
                      size="slim"
                      fullWidth
                      icon={<Plus className="w-3.5 h-3.5" />}
                      onClick={handleAddServiceLine}
                    >
                      ثبت خدمت
                    </PolarisButton>
                  </div>
                </div>
              </PolarisCollapsible>
            </div>
          </div>

          {/* RIGHT 5 COLS: Customer Selector (+ Sheet), Compact IndexTable Cart & Single Primary Button */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3.5">
            {/* Customer Search + (+) Button to open Polaris Sheet */}
            <div className="space-y-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  مشتری فاکتور (جستجو با نام یا موبایل)
                </label>
                <div className="flex items-center gap-1.5">
                  <PolarisButton
                    size="slim"
                    plain
                    onClick={() => setIsReferralCollapsibleOpen((prev) => !prev)}
                  >
                    {selectedReferral ? `معرف: ${selectedReferral}` : '+ معرف'}
                  </PolarisButton>
                  <PolarisButton
                    size="slim"
                    icon={<Plus className="w-3.5 h-3.5" />}
                    title="ثبت مشتری جدید در Sheet کشویی (+)"
                    onClick={() => setIsCustomerSheetOpen(true)}
                  >
                    مشتری جدید
                  </PolarisButton>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={customerSearch}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(null);
                    setShowCustomerDropdown(true);
                  }}
                  placeholder="تایپ نام یا موبایل مشتری (خالی = مشتری حضوری)..."
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
                {showCustomerDropdown && customerSearch.trim().length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {matchingCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch(`${c.fullName} (${c.phone || 'بدون شماره'})`);
                          setShowCustomerDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.fullName}
                        </span>
                        <span className="font-mono text-slate-500">{c.phone || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <PolarisCollapsible
                id="pos-referral-collapsible"
                open={isReferralCollapsibleOpen}
                className="pt-1"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={referralSearch}
                    onChange={(e) => setReferralSearch(e.target.value)}
                    placeholder="نام یا شماره معرف..."
                    className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                  {referralSearch.trim().length > 0 && !selectedReferral && (
                    <div className="mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-h-28 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {matchingReferrals.map((refCust) => (
                        <button
                          key={refCust.id}
                          type="button"
                          onClick={() => {
                            setSelectedReferral(refCust.fullName);
                            setReferralSearch(refCust.fullName);
                            setIsReferralCollapsibleOpen(false);
                          }}
                          className="w-full px-2.5 py-1.5 text-right hover:bg-slate-50 flex justify-between"
                        >
                          <span>{refCust.fullName}</span>
                          <span className="font-mono text-slate-400">{refCust.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </PolarisCollapsible>
            </div>

            {/* Polaris IndexTable: Compact Scrollable POS Shopping Cart */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="bg-slate-50 dark:bg-slate-800/70 px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  جدول فشرده اقلام سبد خرید ({cart.length + serviceLines.length})
                </span>
                <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {pricingModeBadgeLabel}
                </span>
              </div>

              <div className="max-h-64 overflow-y-auto overflow-x-auto">
                {cart.length === 0 && serviceLines.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    سبد خرید خالی است؛ بارکد کالا را اسکن کنید یا از جدول سمت راست انتخاب نمایید.
                  </div>
                ) : (
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
                      <tr>
                        <th className="py-1.5 px-2 font-semibold">کالا / انبار</th>
                        <th className="py-1.5 px-2 font-semibold">مقدار / ml</th>
                        <th className="py-1.5 px-2 font-semibold">خرید</th>
                        <th className="py-1.5 px-2 font-semibold">فی فروش</th>
                        <th className="py-1.5 px-2 font-semibold text-left">جمع</th>
                        <th className="py-1.5 px-1.5 font-semibold text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {cart.map((row) => {
                        const bottleVol = row.item.bottleVolumeMl || row.item.liquidVolumeMl || 60;
                        const rowBuyCost = row.isDecantMl
                          ? calculateCostPerMl(row.item.valuationRate, bottleVol)
                          : row.item.valuationRate;
                        const canItemDecant =
                          row.item.allowDecantSale || row.item.category === 'جویس و سالت';

                        return (
                          <tr key={row.rowId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="py-2 px-2">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[130px]">
                                {row.item.name}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <select
                                  value={row.warehouseKey}
                                  onChange={(e) =>
                                    setCart((prev) =>
                                      prev.map((r) =>
                                        r.rowId === row.rowId
                                          ? { ...r, warehouseKey: e.target.value as WarehouseKey }
                                          : r
                                      )
                                    )
                                  }
                                  className="text-[10px] px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                                >
                                  <option value="vitrine">ویترین</option>
                                  <option value="shop_storage">انبار مغازه</option>
                                  <option value="central_external">انبار مرکزی</option>
                                  <option value="consignment">امانی</option>
                                </select>
                                {canItemDecant && (
                                  <label
                                    title="فروش میلی‌لیتری (دکانت باز)"
                                    className="inline-flex items-center gap-0.5 text-[10px] text-sky-700 dark:text-sky-300 cursor-pointer font-semibold"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={row.isDecantMl}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setCart((prev) =>
                                          prev.map((r) =>
                                            r.rowId === row.rowId
                                              ? {
                                                  ...r,
                                                  isDecantMl: checked,
                                                  qty: checked ? 10 : 1,
                                                  manualUnitPrice: getSystemUnitPrice(
                                                    r.item,
                                                    checked,
                                                    pricingMode
                                                  ),
                                                }
                                              : r
                                          )
                                        );
                                      }}
                                      className="rounded border-slate-300"
                                    />
                                    <span>ml</span>
                                  </label>
                                )}
                              </div>
                            </td>

                            <td className="py-2 px-2 whitespace-nowrap">
                              <div className="inline-flex items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((r) =>
                                        r.rowId === row.rowId
                                          ? { ...r, qty: Math.max(1, r.qty - (r.isDecantMl ? 5 : 1)) }
                                          : r
                                      )
                                    )
                                  }
                                  className="p-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={row.qty}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    setCart((prev) =>
                                      prev.map((r) =>
                                        r.rowId === row.rowId ? { ...r, qty: val } : r
                                      )
                                    );
                                  }}
                                  className="w-11 text-center font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded py-0.5 tabular-nums"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((r) =>
                                        r.rowId === row.rowId
                                          ? { ...r, qty: r.qty + (r.isDecantMl ? 5 : 1) }
                                          : r
                                      )
                                    )
                                  }
                                  className="p-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            <td className="py-2 px-2 whitespace-nowrap font-mono tabular-nums text-[11px]">
                              <button
                                type="button"
                                onClick={() =>
                                  setCart((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId ? { ...r, revealCost: !r.revealCost } : r
                                    )
                                  )
                                }
                                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
                              >
                                {row.revealCost && !privacyMasked ? (
                                  <span>{formatCurrency(rowBuyCost)}</span>
                                ) : (
                                  <span>****</span>
                                )}
                                {row.revealCost ? (
                                  <EyeOff className="w-3 h-3" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                              </button>
                            </td>

                            <td className="py-2 px-2 whitespace-nowrap">
                              <input
                                type="number"
                                min={0}
                                value={row.manualUnitPrice}
                                onChange={(e) => {
                                  const nextPrice = Math.max(0, Number(e.target.value) || 0);
                                  setCart((prev) =>
                                    prev.map((r) =>
                                      r.rowId === row.rowId
                                        ? { ...r, manualUnitPrice: nextPrice }
                                        : r
                                    )
                                  );
                                }}
                                className="w-20 px-1.5 py-0.5 font-mono font-bold text-left bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded tabular-nums"
                              />
                            </td>

                            <td className="py-2 px-2 font-mono font-bold text-left tabular-nums whitespace-nowrap">
                              {formatCurrency(Math.round(row.qty * row.manualUnitPrice))}
                            </td>

                            <td className="py-2 px-1.5 text-center">
                              <PolarisButton
                                size="slim"
                                destructive
                                outline
                                icon={<Trash2 className="w-3 h-3" />}
                                onClick={() =>
                                  setCart((prev) => prev.filter((r) => r.rowId !== row.rowId))
                                }
                              >
                                حذف
                              </PolarisButton>
                            </td>
                          </tr>
                        );
                      })}

                      {serviceLines.map((srv) => (
                        <tr key={srv.id} className="bg-indigo-50/40 dark:bg-indigo-950/20">
                          <td className="py-2 px-2 font-semibold text-indigo-900 dark:text-indigo-200" colSpan={2}>
                            <div>خدمت: {srv.serviceTitle}</div>
                            {srv.linkedConsumableName && (
                              <div className="text-[10px] text-indigo-600 dark:text-indigo-400">
                                کسر مصرفی ویترین: {srv.linkedConsumableName} × {srv.linkedConsumableQty || 1}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-slate-400">—</td>
                          <td className="py-2 px-2 font-mono tabular-nums">
                            {formatCurrency(srv.feeAmount)}
                          </td>
                          <td className="py-2 px-2 font-mono font-bold text-left tabular-nums">
                            {formatCurrency(srv.feeAmount)}
                          </td>
                          <td className="py-2 px-1.5 text-center">
                            <PolarisButton
                              size="slim"
                              destructive
                              outline
                              onClick={() =>
                                setServiceLines((prev) => prev.filter((s) => s.id !== srv.id))
                              }
                            >
                              حذف
                            </PolarisButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Totals & 3 Liquidity Settlement Accounts */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
              {festivalExtraDiscount > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                  <span>تخفیف جشنواره حجمی:</span>
                  <span className="font-mono tabular-nums">
                    -{formatCurrency(festivalExtraDiscount)} تومان
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100">
                <span>مبلغ قابل پرداخت نهایی:</span>
                <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                  {formatCurrency(grandTotal)} تومان
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    مبلغ دریافتی (تومان)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={paidAmountInput === null ? grandTotal : paidAmountInput}
                    onChange={(e) => setPaidAmountInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    مانده نسیه (حساب دریافتنی)
                  </label>
                  <div
                    className={`px-2.5 py-1.5 font-mono font-bold rounded-lg border tabular-nums ${
                      creditReceivableAmount > 0
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    {formatCurrency(creditReceivableAmount)} تومان
                  </div>
                </div>
              </div>

              {/* 3 Liquidity Settlement Accounts */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">
                  حساب تسویه (۳ حساب نقدینگی مجاز):
                </label>
                <PolarisButtonGroup segmented fullWidth>
                  {[
                    { code: '110101' as const, label: 'کارتخوان (POS)' },
                    { code: '110102' as const, label: 'کارت به کارت' },
                    { code: '110103' as const, label: 'نقد صندوق' },
                  ].map((m) => (
                    <PolarisButton
                      key={m.code}
                      size="slim"
                      primary={paymentAccountCode === m.code}
                      onClick={() => setPaymentAccountCode(m.code)}
                      className="flex-1"
                    >
                      {m.label}
                    </PolarisButton>
                  ))}
                </PolarisButtonGroup>
              </div>
            </div>

            {/* SINGLE PRIMARY ACTION BUTTON (Polaris Button Rule: 1 Primary CTA with loading lock) */}
            <PolarisButton
              primary
              fullWidth
              size="large"
              loading={isSubmittingSale}
              disabled={isSubmittingSale}
              icon={<Printer className="w-4 h-4" />}
              onClick={handleSubmitPosInvoice}
            >
              ثبت فاکتور ({pricingModeBadgeLabel}) و چاپ فیش
            </PolarisButton>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 2: STAGE-1 PURCHASE INVOICE (Centralized in /pos + Supplier Sheet)
         ===================================================================== */}
      {activeView === 'purchase_invoice' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                ثبت فاکتور خرید بار (مرحله اول: ثبت مالی کلان و برچسب «در انتظار رسیدن بار»)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تمامی عملیات صدور فاکتور در مسیر /pos متمرکز است. برای افزودن تأمین‌کننده جدید روی دکمه (+) کنار فیلد تأمین‌کننده کلیک کنید.
              </p>
            </div>
          </div>

          <form onSubmit={handleStage1PurchaseSubmit} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* 1. Supplier Name with (+) button to open Polaris Sheet */}
              <CreatableCombobox
                label="۱. نام فروشنده / تأمین‌کننده *"
                value={pinvSupplier}
                onChange={setPinvSupplier}
                options={supplierOptions}
                onAddNewOption={(newSup) => {
                  onQuickAddSupplier?.(newSup);
                  setPinvSupplier(newSup);
                }}
                onPlusButtonClick={() => setIsSupplierSheetOpen(true)}
                plusButtonTitle="ثبت تأمین‌کننده جدید در Sheet کشویی (+)"
                placeholder="جستجو یا زدن (+) برای تأمین‌کننده جدید..."
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
                options={masterOptions?.tags || ['سالت نیکوتین', 'جویس', 'پاد سیستم']}
                onAddNewOption={(val) => onAddMasterOption?.('tags', val)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <CreatableCombobox
                label="۴. وضعیت کالا (آکبند / استوک)"
                value={pinvCondition}
                onChange={setPinvCondition}
                options={masterOptions?.conditions || ['آکبند', 'استوک']}
                onAddNewOption={(val) => onAddMasterOption?.('conditions', val)}
              />

              <CreatableCombobox
                label="۵. نوع کالا (ویپ‌شاپ / قطعات کامپیوتر)"
                value={pinvItemType}
                onChange={setPinvItemType}
                options={masterOptions?.itemTypes || ['جویس و سالت', 'دستگاه پاد و ماد', 'قطعات کامپیوتر و سخت‌افزار']}
                onAddNewOption={(val) => onAddMasterOption?.('itemTypes', val)}
              />

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۶. تعداد کل پارت خرید *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pinvTotalQty}
                  onChange={(e) => setPinvTotalQty(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۷. قیمت خرید واحد (دستی - ریال) *
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={pinvUnitCost}
                  onChange={(e) => setPinvUnitCost(e.target.value)}
                  placeholder="مثلاً: 420000"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۸. تخفیف دریافتی از تامین‌کننده (ریال)
                </label>
                <input
                  type="number"
                  min={0}
                  value={pinvDiscountReceived}
                  onChange={(e) => setPinvDiscountReceived(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۹. قیمت کل نهایی فاکتور
                </label>
                <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 font-bold tabular-nums">
                  {formatCurrency(computedPurchaseGrandTotal)} ریال
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ۱۰. وضعیت تحویل بار
                </label>
                <select
                  value={pinvDeliveryStatus}
                  onChange={(e) =>
                    setPinvDeliveryStatus(e.target.value as 'در انتظار رسیدن بار' | 'رسیده')
                  }
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900 font-semibold"
                >
                  <option value="در انتظار رسیدن بار">در انتظار رسیدن بار (متصل به تقویم)</option>
                  <option value="رسیده">رسیده به انبار (آماده پذیرش SKU)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  انبار مقصد ورود بار
                </label>
                <select
                  value={pinvWarehouseKey}
                  onChange={(e) => setPinvWarehouseKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-900"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-3">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  حساب پرداخت‌کننده
                </label>
                <select
                  value={pinvPaymentAccountCode}
                  onChange={(e) => setPinvPaymentAccountCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900"
                >
                  {LIQUIDITY_ACCOUNTS.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  مبلغ پرداختی نقد/کارت (ریال)
                </label>
                <input
                  type="number"
                  min={0}
                  max={computedPurchaseGrandTotal}
                  value={pinvPaidAmount}
                  onChange={(e) => setPinvPaidAmount(e.target.value)}
                  placeholder="0 = تمام نسیه"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  مانده بدهی تجاری (۲۱۰۱)
                </label>
                <div className="w-full rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-bold text-rose-800 tabular-nums">
                  {formatCurrency(computedPurchaseUnpaidDebt)} ریال
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  سررسید تسویه
                </label>
                <input
                  type="text"
                  value={pinvSettlementDueDate}
                  onChange={(e) => setPinvSettlementDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900 tabular-nums"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  توضیحات پرداخت
                </label>
                <input
                  type="text"
                  value={pinvPaymentNotes}
                  onChange={(e) => setPinvPaymentNotes(e.target.value)}
                  placeholder="شماره پیگیری..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <PolarisButton
                type="submit"
                primary
                loading={isSubmittingPurchase}
                disabled={isSubmittingPurchase}
                icon={<Plus className="w-4 h-4" />}
              >
                ثبت فاکتور خرید بار و ارسال به صف پذیرش SKU
              </PolarisButton>
            </div>
          </form>
        </div>
      )}

      {/* =====================================================================
          VIEW 3: SALES RETURNS WITH SINGLE PRIMARY BUTTON + LOADING LOCK
         ===================================================================== */}
      {activeView === 'returns' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              ثبت برگشت از فروش (مرجوعی کالا) با ۳ گزینه عملیاتی
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              کالا به انبار بازگردانده شده و بر اساس گزینه انتخابی، سند معکوس در حسابداری صادر می‌شود.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ۱. انتخاب فاکتور فروش مرجع:
              </label>
              <select
                value={selectedReturnInvoiceId}
                onChange={(e) => setSelectedReturnInvoiceId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {activePostedInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNo} — {inv.customerName} ({formatCurrency(inv.totalAmount)} تومان)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                ۲. روش تسویه مرجوعی:
              </label>
              <PolarisButtonGroup segmented fullWidth>
                <PolarisButton
                  size="slim"
                  primary={returnMode === 'credit_balance'}
                  onClick={() => setReturnMode('credit_balance')}
                  className="flex-1"
                >
                  ۱. بستانکار کردن مشتری
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  primary={returnMode === 'exchange'}
                  onClick={() => setReturnMode('exchange')}
                  className="flex-1"
                >
                  ۲. تعویض با کالای دیگر
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  primary={returnMode === 'cash_refund'}
                  onClick={() => setReturnMode('cash_refund')}
                  className="flex-1"
                >
                  ۳. عودت وجه نقد/کارت
                </PolarisButton>
              </PolarisButtonGroup>
            </div>
          </div>

          {returnMode === 'exchange' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <div>
                <label className="block font-semibold mb-1">کالای جایگزین از انبار:</label>
                <select
                  value={exchangeSku}
                  onChange={(e) => setExchangeSku(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  {inventoryItems.map((i) => (
                    <option key={i.sku} value={i.sku}>
                      {i.name} — {formatCurrency(i.retailPrice)} ت (موجودی: {i.stockQty})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">تعداد کالای جایگزین:</label>
                <input
                  type="number"
                  min={1}
                  value={exchangeQty}
                  onChange={(e) => setExchangeQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
            </div>
          )}

          {returnMode === 'cash_refund' && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
              <label className="block font-semibold mb-1.5">حساب پرداخت‌کننده وجه مرجوعی:</label>
              <PolarisButtonGroup segmented>
                <PolarisButton
                  size="slim"
                  primary={refundAccountCode === '110102'}
                  onClick={() => setRefundAccountCode('110102')}
                >
                  کارت بانکی (کارت به کارت)
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  primary={refundAccountCode === '110103'}
                  onClick={() => setRefundAccountCode('110103')}
                >
                  صندوق نقد مغازه
                </PolarisButton>
              </PolarisButtonGroup>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <input
              type="text"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="علت مرجوعی یا توضیحات سند..."
              className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
            <PolarisButton
              primary
              loading={isSubmittingReturn}
              disabled={isSubmittingReturn}
              icon={<PackageCheck className="w-4 h-4" />}
              onClick={() => {
                if (!selectedReturnInvoiceId || isSubmittingReturn) {
                  onShowToast('لطفاً یک فاکتور فروش معتبر انتخاب کنید.');
                  return;
                }
                setIsSubmittingReturn(true);
                window.setTimeout(() => {
                  onProcessPosReturn({
                    sourceInvoiceId: selectedReturnInvoiceId,
                    resolutionMode: returnMode,
                    refundAccountCode,
                    exchangeReplacementSku: exchangeSku,
                    exchangeReplacementQty: exchangeQty,
                    notes: returnNotes,
                  });
                  setIsSubmittingReturn(false);
                }, 150);
              }}
            >
              ثبت قطعی برگشت از فروش
            </PolarisButton>
          </div>
        </div>
      )}

      {/* =====================================================================
          VIEW 4: RESELLER PRICE LIST (Polaris IndexTable)
         ===================================================================== */}
      {activeView === 'reseller_pricelist' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                جدول لیست قیمت همکاری (ریسلرها و مشتریان عمده)
              </h3>
              <p className="text-xs text-slate-500">
                تغییر قیمت همکاری هر ردیف بلافاصله در حالت «ریسلر (همکار)» صندوق اعمال می‌شود.
              </p>
            </div>
            <input
              type="text"
              value={resellerSearch}
              onChange={(e) => setResellerSearch(e.target.value)}
              placeholder="جستجوی کالا در لیست همکاری..."
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg w-full sm:w-64"
            />
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[460px] overflow-y-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                <tr>
                  <th className="py-2 px-3">کد SKU</th>
                  <th className="py-2 px-3">نام کالا</th>
                  <th className="py-2 px-3">موجودی</th>
                  <th className="py-2 px-3">قیمت مصرف‌کننده</th>
                  <th className="py-2 px-3">قیمت همکاری (ریسلر)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {smartFilterAndRankItems(inventoryItems, resellerSearch).map((item) => {
                  const resPrice =
                    item.resellerPrice ||
                    item.partnerPrice ||
                    item.wholesalePrice ||
                    Math.round(item.retailPrice * 0.86);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-mono">{item.sku}</td>
                      <td className="py-2 px-3 font-semibold">{item.name}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">
                        {item.stockQty} {item.uomPrimary}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                        {formatCurrency(item.retailPrice)} ت
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          min={0}
                          value={resPrice}
                          onChange={(e) =>
                            onUpdateResellerPrice(item.sku, Math.max(0, Number(e.target.value) || 0))
                          }
                          className="w-32 px-2.5 py-1 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg tabular-nums"
                        />
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
          VIEW 5: INVOICES ARCHIVE & POLARIS DESTRUCTIVE VOID (Sales & Purchases)
         ===================================================================== */}
      {activeView === 'invoices_archive' && (
        <div className="space-y-4">
          {/* Sales Invoices IndexTable */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              جدول فاکتورهای فروش و ابطال امن (voidInvoice با دکمه Destructive)
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[340px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">شماره فاکتور</th>
                    <th className="py-2 px-3">تاریخ</th>
                    <th className="py-2 px-3">مشتری</th>
                    <th className="py-2 px-3">مبلغ کل</th>
                    <th className="py-2 px-3">دریافتی</th>
                    <th className="py-2 px-3">وضعیت سند</th>
                    <th className="py-2 px-3 text-center">عملیات ابطال (Destructive)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {salesInvoices.map((inv) => {
                    const isCancelled = inv.docstatus === 2 || inv.status === 'ابطال‌شده';
                    return (
                      <tr
                        key={inv.id}
                        className={
                          isCancelled
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 text-slate-400'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="py-2 px-3 font-mono font-bold">{inv.invoiceNo}</td>
                        <td className="py-2 px-3 font-mono tabular-nums">{inv.date}</td>
                        <td className="py-2 px-3 font-semibold">{inv.customerName}</td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {privacyMasked ? '****' : `${formatCurrency(inv.totalAmount)} ت`}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-emerald-700">
                          {privacyMasked ? '****' : `${formatCurrency(inv.paidAmount)} ت`}
                        </td>
                        <td className="py-2 px-3 font-semibold">
                          {isCancelled ? 'Cancelled (ابطال‌شده)' : inv.status}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {!isCancelled && onVoidSalesInvoice ? (
                            confirmVoidId === inv.id ? (
                              <PolarisButtonGroup>
                                <PolarisButton
                                  size="slim"
                                  destructive
                                  loading={voidingInvoiceId === inv.id}
                                  onClick={() => {
                                    setVoidingInvoiceId(inv.id);
                                    window.setTimeout(() => {
                                      onVoidSalesInvoice(inv.id);
                                      setVoidingInvoiceId(null);
                                      setConfirmVoidId(null);
                                    }, 150);
                                  }}
                                >
                                  تایید قطعی ابطال
                                </PolarisButton>
                                <PolarisButton
                                  size="slim"
                                  onClick={() => setConfirmVoidId(null)}
                                >
                                  انصراف
                                </PolarisButton>
                              </PolarisButtonGroup>
                            ) : (
                              <PolarisButton
                                size="slim"
                                destructive
                                icon={<XCircle className="w-3.5 h-3.5" />}
                                onClick={() => setConfirmVoidId(inv.id)}
                              >
                                ابطال فاکتور
                              </PolarisButton>
                            )
                          ) : (
                            <span className="text-[11px] text-slate-400">سند معکوس ثبت شد</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Purchase Invoices IndexTable */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              جدول فاکتورهای خرید بار و وضعیت تحویل ({purchaseInvoices.length} سند)
            </h3>
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[320px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2 px-3">شماره سند</th>
                    <th className="py-2 px-3">تأمین‌کننده</th>
                    <th className="py-2 px-3">شرح پارت خرید</th>
                    <th className="py-2 px-3">جمع کل</th>
                    <th className="py-2 px-3">وضعیت بار</th>
                    <th className="py-2 px-3 text-center">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {purchaseInvoices.map((pi) => {
                    const isCancelled = pi.docstatus === 2;
                    const isWaiting =
                      pi.deliveryStatus === 'در انتظار رسیدن بار' ||
                      pi.deliveryStatus === 'در راه (هنوز نرسیده)';
                    return (
                      <tr
                        key={pi.id}
                        className={
                          isCancelled
                            ? 'bg-rose-50/40 dark:bg-rose-950/20 text-slate-400'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="py-2 px-3 font-mono font-bold">{pi.billNo}</td>
                        <td className="py-2 px-3 font-semibold">{pi.supplierName}</td>
                        <td className="py-2 px-3">{pi.itemsSummary}</td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {privacyMasked ? '****' : `${formatCurrency(pi.totalAmount)} ریال`}
                        </td>
                        <td className="py-2 px-3 font-semibold">
                          {isCancelled
                            ? 'Cancelled (ابطال‌شده)'
                            : isWaiting
                              ? 'در انتظار رسیدن بار'
                              : 'رسیده به انبار'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {!isCancelled && (
                            <PolarisButtonGroup>
                              {isWaiting && onMarkPurchaseArrived && (
                                <PolarisButton
                                  size="slim"
                                  onClick={() => onMarkPurchaseArrived(pi.id)}
                                >
                                  تایید رسیدن بار
                                </PolarisButton>
                              )}
                              {!pi.skuBreakdownCompleted && onNavigateToInventoryBreakdown && (
                                <PolarisButton
                                  size="slim"
                                  onClick={() => onNavigateToInventoryBreakdown(pi.billNo)}
                                >
                                  پذیرش SKU
                                </PolarisButton>
                              )}
                              {onVoidPurchaseInvoice && (
                                <PolarisButton
                                  size="slim"
                                  destructive
                                  loading={voidingInvoiceId === pi.id}
                                  onClick={() => {
                                    setVoidingInvoiceId(pi.id);
                                    window.setTimeout(() => {
                                      onVoidPurchaseInvoice(pi.id);
                                      setVoidingInvoiceId(null);
                                    }, 150);
                                  }}
                                >
                                  ابطال سند
                                </PolarisButton>
                              )}
                            </PolarisButtonGroup>
                          )}
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
          POLARIS SHEET 1: NEW CUSTOMER REGISTRATION (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isCustomerSheetOpen}
        onClose={() => setIsCustomerSheetOpen(false)}
        title="ثبت مشتری جدید در باشگاه مشتریان (CRM)"
        footer={
          <>
            <PolarisButton onClick={() => setIsCustomerSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingCustomer}
              disabled={isSavingCustomer}
              onClick={handleCreateQuickCustomer}
            >
              ذخیره و انتخاب در فاکتور
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              نام و نام خانوادگی مشتری *
            </label>
            <input
              type="text"
              autoFocus
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="مثلاً امیرحسین رضایی"
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              شماره موبایل
            </label>
            <input
              type="text"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="0912..."
              className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              سلیقه مصرف ویپ / قطعات
            </label>
            <select
              value={newCustStyle}
              onChange={(e) => setNewCustStyle(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            >
              <option value="سالت نیکوتین (MTL)">سالت نیکوتین (MTL)</option>
              <option value="جویس فری‌بیس (DL)">جویس فری‌بیس (DL)</option>
              <option value="پاد یکبارمصرف">پاد یکبارمصرف</option>
              <option value="قطعات کامپیوتر و گیمینگ">قطعات کامپیوتر و گیمینگ</option>
            </select>
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET 2: NEW SUPPLIER REGISTRATION (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isSupplierSheetOpen}
        onClose={() => setIsSupplierSheetOpen(false)}
        title="ثبت تأمین‌کننده جدید در مخاطبین"
        footer={
          <>
            <PolarisButton onClick={() => setIsSupplierSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingSupplier}
              disabled={isSavingSupplier}
              onClick={handleCreateQuickSupplier}
            >
              ذخیره و انتخاب در فاکتور خرید
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              نام تجاری تأمین‌کننده / پخش *
            </label>
            <input
              type="text"
              autoFocus
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="مثلاً بازرگانی کلودی دبی..."
              className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              شماره تماس تأمین‌کننده
            </label>
            <input
              type="text"
              value={newSupplierPhone}
              onChange={(e) => setNewSupplierPhone(e.target.value)}
              placeholder="021... یا 0912..."
              className="w-full px-3 py-2 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
            />
          </div>
        </div>
      </PolarisSheet>

      {/* Thermal Receipt Print Preview Modal */}
      {showThermalReceipt && lastReceiptSnapshot && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 w-full max-w-sm rounded-xl p-5 shadow-2xl space-y-3 border border-slate-200 font-sans">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <div className="text-sm font-bold">فروشگاه مرکزی کلودی شاپ</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                مشتری: {lastReceiptSnapshot.customerName}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              {lastReceiptSnapshot.cartLines.map((line, i) => (
                <div key={i} className="flex justify-between">
                  <span>
                    {line.name} ({line.qty} {line.uom})
                  </span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatCurrency(Math.round(line.qty * line.finalManualUnitPrice))} ت
                  </span>
                </div>
              ))}
              {lastReceiptSnapshot.serviceLines.map((srv, i) => (
                <div key={i} className="flex justify-between text-indigo-800">
                  <span>خدمت: {srv.serviceTitle}</span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatCurrency(srv.feeAmount)} ت
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-1 text-xs">
              <div className="flex justify-between font-bold text-sm">
                <span>جمع کل قابل پرداخت:</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(lastReceiptSnapshot.netTotal)} تومان
                </span>
              </div>
              <div className="flex justify-between">
                <span>پرداخت‌شده ({lastReceiptSnapshot.paymentMethodLabel}):</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(lastReceiptSnapshot.paidAmount)} تومان
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <PolarisButton
                primary
                fullWidth
                onClick={() => {
                  window.print();
                  setShowThermalReceipt(false);
                }}
              >
                چاپ فیش (80mm)
              </PolarisButton>
              <PolarisButton onClick={() => setShowThermalReceipt(false)}>بستن</PolarisButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
