import React, { useState, useMemo } from 'react';
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
  UserPlus,
  Tag,
  Trash2,
  Droplets,
  PackageCheck,
} from 'lucide-react';
import {
  CustomerContactRecord,
  InventoryItemRecord,
  PromotionRuleRecord,
  SalesInvoiceRecord,
  PosServiceLineItem,
  WarehouseKey,
} from '../data/erpSeedData';
import {
  formatCurrency,
  smartFilterAndRankItems,
  calculateCostPerMl,
} from '../utils/erpEngine';

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
  contacts: CustomerContactRecord[];
  inventoryItems: InventoryItemRecord[];
  promotionRules: PromotionRuleRecord[];
  salesInvoices: SalesInvoiceRecord[];
  onAddQuickCustomer: (contact: CustomerContactRecord) => void;
  onUpdateResellerPrice: (sku: string, newResellerPrice: number) => void;
  onCompletePosCheckout: (payload: PosCheckoutPayload) => boolean;
  onProcessPosReturn: (payload: PosReturnPayload) => boolean;
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

export const SellingPosModule: React.FC<SellingPosModuleProps> = ({
  privacyMasked = false,
  contacts,
  inventoryItems,
  promotionRules,
  salesInvoices,
  onAddQuickCustomer,
  onUpdateResellerPrice,
  onCompletePosCheckout,
  onProcessPosReturn,
  onShowToast,
}) => {
  const [activeView, setActiveView] = useState<'pos' | 'returns' | 'reseller_pricelist'>('pos');

  // Search & Pricing Mode
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const [pricingMode, setPricingMode] = useState<'normal' | 'festival' | 'reseller'>('normal');
  const [revealTableBuyingCost, setRevealTableBuyingCost] = useState(false);

  // Cart & Service Lines
  const [cart, setCart] = useState<ActiveCartRow[]>([]);
  const [serviceLines, setServiceLines] = useState<PosServiceLineItem[]>([]);
  const [serviceTitle, setServiceTitle] = useState('');
  const [serviceFee, setServiceFee] = useState<number>(0);
  const [linkedConsumableSku, setLinkedConsumableSku] = useState('');
  const [linkedConsumableQty, setLinkedConsumableQty] = useState<number>(1);

  // Smart Customer Search (Collapsed by default)
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerContactRecord | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustStyle, setNewCustStyle] = useState('سالت نیکوتین (MTL)');

  // Referral Search
  const [referralSearch, setReferralSearch] = useState('');
  const [selectedReferral, setSelectedReferral] = useState('');

  // Settlement State (Cash & Credit only — 3 main liquidity accounts)
  const [paymentAccountCode, setPaymentAccountCode] = useState<'110101' | '110102' | '110103'>('110101');
  const [paidAmountInput, setPaidAmountInput] = useState<number | null>(null);
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);
  const [lastReceiptSnapshot, setLastReceiptSnapshot] = useState<PosCheckoutPayload | null>(null);

  // Sales Return (مرجوعی ۳ حالته)
  const [returnInvoiceId, setReturnInvoiceId] = useState('');
  const [returnMode, setReturnMode] = useState<'credit_balance' | 'exchange' | 'cash_refund'>('credit_balance');
  const [refundAccountCode, setRefundAccountCode] = useState<'110102' | '110103'>('110102');
  const [exchangeSku, setExchangeSku] = useState('');
  const [exchangeQty, setExchangeQty] = useState(1);
  const [returnNotes, setReturnNotes] = useState('');

  // Helper: compute system price for an item based on pricingMode and decant mode
  const getSystemUnitPrice = (item: InventoryItemRecord, isDecantMl: boolean, mode = pricingMode): number => {
    if (isDecantMl) {
      const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
      const basePerMl = Math.round(item.retailPrice / Math.max(1, bottleVol));
      if (mode === 'reseller') {
        const resellerBottle = item.resellerPrice || item.partnerPrice || Math.round(item.retailPrice * 0.88);
        return Math.round(resellerBottle / Math.max(1, bottleVol));
      }
      if (mode === 'festival') {
        const activePromo = promotionRules.find((r) => r.isActive && r.discountType === 'percent');
        const pct = activePromo ? activePromo.discountValue : 8;
        return Math.round(basePerMl * (1 - pct / 100));
      }
      return basePerMl;
    }

    if (mode === 'reseller') {
      return item.resellerPrice || item.partnerPrice || Math.round(item.retailPrice * 0.88);
    }
    if (mode === 'festival') {
      const activePromo = promotionRules.find(
        (r) =>
          r.isActive &&
          (r.applicableSkus.length === 0 || r.applicableSkus.includes(item.sku))
      );
      if (activePromo) {
        if (activePromo.discountType === 'percent') {
          return Math.round(item.retailPrice * (1 - activePromo.discountValue / 100));
        }
        return Math.max(0, item.retailPrice - activePromo.discountValue);
      }
    }
    return item.retailPrice;
  };

  // Update cart prices when switching pricing mode (normal / festival / reseller)
  const handleSwitchPricingMode = (nextMode: 'normal' | 'festival' | 'reseller') => {
    setPricingMode(nextMode);
    setCart((prev) =>
      prev.map((row) => ({
        ...row,
        manualUnitPrice: getSystemUnitPrice(row.item, row.isDecantMl, nextMode),
      }))
    );
  };

  // Smart Case-Insensitive Search (Equal + Contains)
  const filteredProducts = useMemo(() => {
    const activeItems = inventoryItems.filter((i) => i.isActive !== false);
    return smartFilterAndRankItems(activeItems, barcodeQuery);
  }, [inventoryItems, barcodeQuery]);

  const addItemToCart = (item: InventoryItemRecord, asDecantMl = false) => {
    const canDecant = Boolean(item.allowDecantSale || item.category === 'جویس و سالت');
    const useDecant = asDecantMl && canDecant;
    const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
    const totalAvailableMl = item.stockQty * bottleVol + (item.openBottleRemainingMl || 0);

    if (!useDecant && item.stockQty <= 0) {
      onShowToast(`موجودی کالای «${item.name}» (${item.sku}) صفر است.`);
      return;
    }
    if (useDecant && totalAvailableMl <= 0) {
      onShowToast(`موجودی میلی‌لیتری برای «${item.name}» کافی نیست.`);
      return;
    }

    const defaultUnitPrice = getSystemUnitPrice(item, useDecant, pricingMode);

    setCart((prev) => {
      const existing = prev.find((r) => r.item.sku === item.sku && r.isDecantMl === useDecant);
      if (existing) {
        return prev.map((r) =>
          r.rowId === existing.rowId ? { ...r, qty: r.qty + (useDecant ? 5 : 1) } : r
        );
      }
      return [
        ...prev,
        {
          rowId: `${item.sku}-${useDecant ? 'ml' : 'unit'}-${Date.now()}`,
          item,
          qty: useDecant ? 5 : 1,
          isDecantMl: useDecant,
          manualUnitPrice: defaultUnitPrice,
          revealCost: false,
          warehouseKey: 'vitrine',
        },
      ];
    });
  };

  const toggleCartRowDecant = (rowId: string, nextIsDecant: boolean) => {
    setCart((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        return {
          ...row,
          isDecantMl: nextIsDecant,
          qty: nextIsDecant ? 5 : 1,
          manualUnitPrice: getSystemUnitPrice(row.item, nextIsDecant, pricingMode),
        };
      })
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

  // Calculate Totals
  const goodsTotal = cart.reduce((sum, r) => sum + Math.round(r.qty * r.manualUnitPrice), 0);
  const servicesTotal = serviceLines.reduce((sum, s) => sum + s.feeAmount, 0);
  const totalQtyInCart = cart.reduce((sum, r) => sum + (r.isDecantMl ? 1 : r.qty), 0);

  // Check active quantity-based festival discount
  const activeQuantityRule = useMemo(() => {
    if (pricingMode !== 'festival') return null;
    return promotionRules.find(
      (r) => r.isActive && r.festivalType === 'خرید بالای X قلم' && totalQtyInCart >= (r.minQty || 3)
    );
  }, [pricingMode, promotionRules, totalQtyInCart]);

  const festivalExtraDiscount = activeQuantityRule
    ? activeQuantityRule.discountType === 'fixed'
      ? activeQuantityRule.discountValue
      : 0
    : 0;

  const grandTotal = Math.max(0, goodsTotal + servicesTotal - festivalExtraDiscount);
  const effectivePaidAmount = paidAmountInput === null ? grandTotal : Math.max(0, paidAmountInput);
  const creditReceivableAmount = Math.max(0, grandTotal - effectivePaidAmount);

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

  const handleCreateQuickCustomer = () => {
    if (!newCustName.trim()) {
      onShowToast('نام مشتری جدید الزامی است.');
      return;
    }
    const created: CustomerContactRecord = {
      id: `cust-${Date.now()}`,
      sourceCode: `C-${contacts.length + 101}`,
      fullName: newCustName.trim(),
      personType: 'حقیقی',
      role: 'مشتری عادی',
      contactCategory: 'customer',
      phone: newCustPhone.trim(),
      vapingStyle: newCustStyle,
      notes: 'ثبت سریع از صندوق فروشگاهی',
    };
    onAddQuickCustomer(created);
    setSelectedCustomer(created);
    setCustomerSearch(`${created.fullName} (${created.phone || 'بدون شماره'})`);
    setNewCustName('');
    setNewCustPhone('');
    setShowNewCustomerForm(false);
    onShowToast(`مشتری جدید «${created.fullName}» در CRM ثبت و انتخاب شد.`);
  };

  const handleSubmitPosInvoice = () => {
    if (cart.length === 0 && serviceLines.length === 0) {
      onShowToast('سبد صندوق خالی است؛ حداقل یک کالا یا خدمت وارد کنید.');
      return;
    }
    if (creditReceivableAmount > 0 && !selectedCustomer && !customerSearch.trim()) {
      onShowToast('برای ثبت فاکتور نسیه (مانده طلب)، انتخاب مشتری الزامی است.');
      return;
    }

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

    const ok = onCompletePosCheckout(payload);
    if (!ok) return;

    setLastReceiptSnapshot(payload);
    setShowThermalReceipt(true);
    setCart([]);
    setServiceLines([]);
    setPaidAmountInput(null);
  };

  const activePostedInvoices = salesInvoices.filter(
    (inv) => inv.docstatus === 1 && !inv.returnAgainst && inv.status !== 'ابطال‌شده'
  );

  return (
    <div className="space-y-5">
      {/* Top Sub-Navigation & Pricing Modes */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveView('pos')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeView === 'pos'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>ترمینال فروش حضوری (POS)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('returns')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeView === 'returns'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>برگشت از فروش (مرجوعی ۳ حالته)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('reseller_pricelist')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
              activeView === 'reseller_pricelist'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>لیست قیمت ریسلرها (همکاران)</span>
          </button>
        </div>

        {/* Pricing Mode Buttons: فروش عادی | فروش جشنواره | ریسلر (همکار) */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => handleSwitchPricingMode('normal')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              pricingMode === 'normal'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            فروش عادی
          </button>
          <button
            type="button"
            onClick={() => handleSwitchPricingMode('festival')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              pricingMode === 'festival'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-700'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>فروش جشنواره ({promotionRules.filter((r) => r.isActive).length} فعال)</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchPricingMode('reseller')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              pricingMode === 'reseller'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-indigo-700 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-700'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>ریسلر (همکار)</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: MAIN POS TERMINAL */}
      {activeView === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Right Column (7 cols): Compact Row Product Table + Service Entry */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Barcode className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  <input
                    type="text"
                    aria-label="اسکن بارکد یا جستجوی هوشمند کالا"
                    placeholder="اسکن بارکد یا جستجوی SKU / نام کالا / طعم (Enter برای افزودن سریع)..."
                    value={barcodeQuery}
                    onChange={(e) => setBarcodeQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredProducts.length > 0) {
                        e.preventDefault();
                        addItemToCart(filteredProducts[0], false);
                        setBarcodeQuery('');
                      }
                    }}
                    className="w-full pr-9 pl-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setRevealTableBuyingCost((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 shrink-0"
                >
                  {revealTableBuyingCost && !privacyMasked ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>قیمت خرید جدول</span>
                </button>
              </div>

              {/* Compact Row/Table View for High-Density Items */}
              <div className="max-h-[430px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2 px-2.5 font-semibold">کد SKU</th>
                      <th className="py-2 px-2.5 font-semibold">نام کالا · مشخصات</th>
                      <th className="py-2 px-2.5 font-semibold">موجودی</th>
                      <th className="py-2 px-2.5 font-semibold text-left">قیمت خرید</th>
                      <th className="py-2 px-2.5 font-semibold text-left">
                        قیمت ({pricingMode === 'normal' ? 'عادی' : pricingMode === 'festival' ? 'جشنواره' : 'همکار'})
                      </th>
                      <th className="py-2 px-2.5 font-semibold text-center">افزودن</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredProducts.slice(0, 120).map((item) => {
                      const activePrice = getSystemUnitPrice(item, false, pricingMode);
                      const supportsDecant = Boolean(
                        item.allowDecantSale || item.category === 'جویس و سالت'
                      );
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
                            <div className="font-bold text-slate-900 dark:text-slate-100">
                              {item.name}
                            </div>
                            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1">
                              <span>{item.category}</span>
                              {item.flavor && <span>· {item.flavor}</span>}
                              {item.nicotine && <span>· {item.nicotine}</span>}
                              {item.isBundle && (
                                <span className="text-indigo-600 font-semibold">· پکیج باندل</span>
                              )}
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
                              <div className="text-[10px] text-indigo-600 font-mono">
                                +{openMl} ml بطری باز
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums text-left text-slate-500 whitespace-nowrap">
                            {revealTableBuyingCost && !privacyMasked
                              ? `${formatCurrency(item.valuationRate)} ت`
                              : '****'}
                          </td>
                          <td className="py-2 px-2.5 font-mono tabular-nums font-bold text-left text-indigo-700 dark:text-indigo-400 whitespace-nowrap">
                            {formatCurrency(activePrice)} ت
                          </td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => addItemToCart(item, false)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-900 dark:bg-indigo-600 text-white rounded hover:bg-indigo-700"
                              >
                                + کامل
                              </button>
                              {supportsDecant && (
                                <button
                                  type="button"
                                  title="فروش باز میلی‌لیتری جویس/سالت"
                                  onClick={() => addItemToCart(item, true)}
                                  className="px-2 py-1 text-[11px] font-semibold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800 rounded hover:bg-sky-200"
                                >
                                  + ml
                                </button>
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

            {/* Service Entry Section (ثبت خدمات در کنار کالا + لینک اختیاری کالای مصرفی) */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Wrench className="w-4 h-4 text-indigo-600" />
                <span>ثبت خدمات فنی در کنار کالا (تعویض پنبه، کویل‌بندی، سرویس دستگاه)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
                <div className="sm:col-span-4">
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">عنوان خدمت</label>
                  <input
                    type="text"
                    placeholder="مثلاً تعویض پنبه و شستشوی اتومایزر"
                    value={serviceTitle}
                    onChange={(e) => setServiceTitle(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">مبلغ دستمزد (تومان)</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="مثلاً 150000"
                    value={serviceFee || ''}
                    onChange={(e) => setServiceFee(Number(e.target.value) || 0)}
                    className="w-full px-3 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">
                    کالای مصرفی لینک‌شده (اختیاری)
                  </label>
                  <select
                    value={linkedConsumableSku}
                    onChange={(e) => setLinkedConsumableSku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  >
                    <option value="">بدون کسر کالای مصرفی</option>
                    {inventoryItems
                      .filter((i) => i.stockQty > 0)
                      .slice(0, 60)
                      .map((i) => (
                        <option key={i.id} value={i.sku}>
                          {i.name} (موجودی: {i.stockQty})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddServiceLine}
                    className="w-full py-1.5 px-3 font-semibold bg-slate-900 dark:bg-indigo-600 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap"
                  >
                    + ثبت خدمت
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Left Column (5 cols): Active Invoice, Customer (+), Referral, Prices & Settlement */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  فاکتور صندوق فروشگاهی
                </h3>
                <p className="text-[11px] text-slate-500">
                  شعبه: فروشگاه مرکزی کلودی شاپ · حالت:{' '}
                  {pricingMode === 'normal'
                    ? 'فروش عادی'
                    : pricingMode === 'festival'
                      ? 'فروش جشنواره'
                      : 'نرخ همکار (ریسلر)'}
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {cart.length} ردیف کالا · {serviceLines.length} خدمت
              </span>
            </div>

            {/* Smart Customer Field (Collapsed by default with + button at left) */}
            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-slate-700 dark:text-slate-300">
                مشتری (جستجو با نام یا شماره تماس)
              </label>
              <div className="relative flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="نام مشتری یا شماره موبایل..."
                  value={customerSearch}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(null);
                    setShowCustomerDropdown(true);
                  }}
                  className="flex-1 px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
                />
                <button
                  type="button"
                  title="باز کردن فرم ثبت مشتری جدید"
                  onClick={() => setShowNewCustomerForm((prev) => !prev)}
                  className="px-3 py-2 font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {showCustomerDropdown && matchingCustomers.length > 0 && (
                  <div className="absolute right-0 left-10 top-10 z-30 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {matchingCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearch(`${c.fullName} ${c.phone ? `(${c.phone})` : ''}`);
                          setShowCustomerDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-right hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {c.fullName}
                        </span>
                        <span className="font-mono text-slate-500">{c.phone || c.role}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Expandable New Customer Registration Form */}
              {showNewCustomerForm && (
                <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>ثبت سریع مشتری جدید در CRM</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNewCustomerForm(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="نام و نام خانوادگی *"
                      value={newCustName}
                      onChange={(e) => setNewCustName(e.target.value)}
                      className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="شماره تماس (۰۹۱۲...)"
                      value={newCustPhone}
                      onChange={(e) => setNewCustPhone(e.target.value)}
                      className="px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={newCustStyle}
                      onChange={(e) => setNewCustStyle(e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                    >
                      <option value="سالت نیکوتین (MTL)">سبک ویپینگ: سالت نیکوتین (MTL)</option>
                      <option value="جویس فری‌بیس (DTL)">سبک ویپینگ: جویس قلیانی (DTL)</option>
                      <option value="پاد یکبارمصرف">سبک ویپینگ: پاد یکبارمصرف</option>
                      <option value="قطعات کامپیوتر">خریدار قطعات کامپیوتر</option>
                    </select>
                    <button
                      type="button"
                      onClick={handleCreateQuickCustomer}
                      className="px-3 py-1.5 font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      ذخیره و انتخاب
                    </button>
                  </div>
                </div>
              )}

              {/* Referral Field (فیلد معرف متصل به لیست CRM) */}
              <div className="pt-1">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  معرف مشتری (متصل به لیست CRM)
                </label>
                <input
                  type="text"
                  list="pos-referral-list"
                  placeholder="جستجوی نام یا شماره معرف در CRM..."
                  value={referralSearch}
                  onChange={(e) => {
                    setReferralSearch(e.target.value);
                    setSelectedReferral(e.target.value);
                  }}
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
                />
                <datalist id="pos-referral-list">
                  {matchingReferrals.map((r) => (
                    <option key={r.id} value={r.fullName}>
                      {r.phone}
                    </option>
                  ))}
                </datalist>
              </div>
            </div>

            {/* Cart Lines with Buying Cost Eye Toggle, System Price & Manual Final Selling Price */}
            <div className="space-y-2.5 max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800 py-2">
              {cart.length === 0 && serviceLines.length === 0 && (
                <div className="py-8 text-center text-xs text-slate-400">
                  اقلامی در فاکتور ثبت نشده است. از جدول سمت راست کالا یا خدمت اضافه کنید.
                </div>
              )}

              {cart.map((row) => {
                const bottleVol = row.item.bottleVolumeMl || row.item.liquidVolumeMl || 60;
                const unitBuyingCost = row.isDecantMl
                  ? calculateCostPerMl(row.item.valuationRate, bottleVol)
                  : row.item.valuationRate;
                const systemPrice = getSystemUnitPrice(row.item, row.isDecantMl, pricingMode);
                const supportsDecant = Boolean(
                  row.item.allowDecantSale || row.item.category === 'جویس و سالت'
                );

                return (
                  <div key={row.rowId} className="pt-2.5 first:pt-0 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {row.item.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500">
                          SKU: {row.item.sku}
                          {row.isDecantMl && (
                            <span className="mr-2 text-sky-700 dark:text-sky-400 font-sans font-semibold">
                              (فروش میلی‌لیتری باز · موجود بطری باز:{' '}
                              {row.item.openBottleRemainingMl ?? bottleVol} ml)
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) => prev.filter((c) => c.rowId !== row.rowId))
                        }
                        className="text-slate-400 hover:text-rose-600 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Unit Switch for E-Liquids: [بطری کامل | میلی‌لیتر] */}
                    {supportsDecant && (
                      <div className="flex items-center justify-between bg-sky-50/70 dark:bg-sky-950/30 px-2.5 py-1 rounded-lg border border-sky-200/70 dark:border-sky-900">
                        <span className="text-[11px] text-sky-900 dark:text-sky-300 flex items-center gap-1">
                          <Droplets className="w-3.5 h-3.5" />
                          <span>واحد فروش جویس/سالت:</span>
                        </span>
                        <div className="inline-flex rounded-md bg-white dark:bg-slate-900 p-0.5 border border-sky-200 dark:border-sky-800 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleCartRowDecant(row.rowId, false)}
                            className={`px-2 py-0.5 rounded font-semibold ${
                              !row.isDecantMl
                                ? 'bg-slate-900 text-white'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            بطری کامل
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCartRowDecant(row.rowId, true)}
                            className={`px-2 py-0.5 rounded font-semibold ${
                              row.isDecantMl
                                ? 'bg-sky-600 text-white'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            میلی‌لیتر (ml)
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Buying Cost (Hidden **** + Eye Icon) & System Retail Price */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-500">قیمت خرید:</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          {row.revealCost && !privacyMasked
                            ? `${formatCurrency(unitBuyingCost)} ت`
                            : '****'}
                        </span>
                        <button
                          type="button"
                          title="نمایش / مخفی‌سازی قیمت خرید"
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((c) =>
                                c.rowId === row.rowId ? { ...c, revealCost: !c.revealCost } : c
                              )
                            )
                          }
                          className="text-slate-400 hover:text-indigo-600"
                        >
                          {row.revealCost ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <div>
                        <span className="text-slate-500">قیمت سیستمی: </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                          {formatCurrency(systemPrice)} ت
                        </span>
                      </div>
                    </div>

                    {/* Quantity Input & Final Manual Selling Price */}
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev
                                .map((c) =>
                                  c.rowId === row.rowId ? { ...c, qty: c.qty - 1 } : c
                                )
                                .filter((c) => c.qty > 0)
                            )
                          }
                          className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <input
                          type="number"
                          min={0.5}
                          step={row.isDecantMl ? 0.5 : 1}
                          value={row.qty}
                          onChange={(e) => {
                            const val = Math.max(0.5, Number(e.target.value) || 1);
                            setCart((prev) =>
                              prev.map((c) => (c.rowId === row.rowId ? { ...c, qty: val } : c))
                            );
                          }}
                          className="w-14 text-center font-mono font-bold py-1 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) =>
                              prev.map((c) =>
                                c.rowId === row.rowId ? { ...c, qty: c.qty + 1 } : c
                              )
                            )
                          }
                          className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                        <span className="text-[11px] text-slate-500">
                          {row.isDecantMl ? 'ml' : 'عدد'}
                        </span>
                      </div>

                      <div className="col-span-7">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-500 whitespace-nowrap">
                            فروش نهایی:
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={row.manualUnitPrice}
                            onChange={(e) => {
                              const nextPrice = Math.max(0, Number(e.target.value) || 0);
                              setCart((prev) =>
                                prev.map((c) =>
                                  c.rowId === row.rowId
                                    ? { ...c, manualUnitPrice: nextPrice }
                                    : c
                                )
                              );
                            }}
                            className="w-full px-2 py-1 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 rounded bg-indigo-50/40 dark:bg-indigo-950/40"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Service Lines in Cart */}
              {serviceLines.map((srv) => (
                <div
                  key={srv.id}
                  className="pt-2 flex items-center justify-between text-xs bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-lg"
                >
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      خدمت: {srv.serviceTitle}
                    </div>
                    {srv.linkedConsumableName && (
                      <div className="text-[11px] text-slate-500">
                        کسر مصرفی از انبار: {srv.linkedConsumableQty}× {srv.linkedConsumableName}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(srv.feeAmount)} ت
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setServiceLines((prev) => prev.filter((s) => s.id !== srv.id))
                      }
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Invoice Settlement Section (جمع کل، مبلغ پرداختی، مانده نسیه، نحوه پرداخت) */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>جمع کل اقلام و خدمات:</span>
                <span className="font-mono tabular-nums font-bold text-sm text-slate-900 dark:text-white">
                  {formatCurrency(grandTotal)} تومان
                </span>
              </div>

              {festivalExtraDiscount > 0 && (
                <div className="flex justify-between text-amber-700 dark:text-amber-400">
                  <span>تخفیف قانون جشنواره فعال:</span>
                  <span className="font-mono tabular-nums">
                    -{formatCurrency(festivalExtraDiscount)} تومان
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    مبلغ پرداختی مشتری (تومان)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={grandTotal}
                    value={paidAmountInput === null ? grandTotal : paidAmountInput}
                    onChange={(e) => setPaidAmountInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 font-mono tabular-nums font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    مانده نسیه (طلب ما از مشتری)
                  </label>
                  <div
                    className={`w-full px-2.5 py-1.5 font-mono tabular-nums font-bold rounded-lg border ${
                      creditReceivableAmount > 0
                        ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 text-rose-700 dark:text-rose-300'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {formatCurrency(creditReceivableAmount)} تومان
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  نحوه پرداخت (حساب تسویه مغازه)
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { code: '110101' as const, label: 'کارتخوان (POS)' },
                    { code: '110102' as const, label: 'کارت به کارت' },
                    { code: '110103' as const, label: 'نقد (صندوق)' },
                  ].map((m) => (
                    <button
                      key={m.code}
                      type="button"
                      onClick={() => setPaymentAccountCode(m.code)}
                      className={`py-2 px-2 text-xs font-bold rounded-lg border transition-colors ${
                        paymentAccountCode === m.code
                          ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSubmitPosInvoice}
              className="w-full py-3 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>
                ثبت قطعی فاکتور در صندوق (
                {creditReceivableAmount > 0 ? 'نقد و نسیه' : 'تسویه کامل'}) و چاپ فیش
              </span>
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: SALES RETURNS WITH 3 OPERATIONAL MODES */}
      {activeView === 'returns' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              ثبت برگشت از فروش (مرجوعی کالا) با ۳ گزینه عملیاتی
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              بازگشت خودکار کالا به موجودی انبار و تسویه به روش کسر از بدهی/بستانکاری، تعویض کالا یا عودت وجه نقدی
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {[
              {
                id: 'credit_balance' as const,
                title: '۱. کسر مبلغ در مرجوعی (حساب مشتری)',
                desc: 'منظور شدن مبلغ در حساب بستانکاری مشتری یا کسر خودکار از بدهی نسیه قبلی',
              },
              {
                id: 'exchange' as const,
                title: '۲. تعویض کالا با جنس دیگر',
                desc: 'بازگشت کالای قبلی به انبار، تحویل کالای جایگزین و محاسبه خودکار مابه‌التفاوت',
              },
              {
                id: 'cash_refund' as const,
                title: '۳. بازگشت وجه نقدی به مشتری',
                desc: 'عودت مستقیم پول از حساب کارت بانکی (۱۱۰۱۰۲) یا صندوق نقد مغازه (۱۱۰۱۰۳)',
              },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setReturnMode(opt.id)}
                className={`p-4 rounded-xl border text-right transition-colors space-y-1 ${
                  returnMode === opt.id
                    ? 'bg-indigo-50/80 dark:bg-indigo-950/50 border-indigo-500 text-indigo-950 dark:text-indigo-200'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="font-bold text-sm">{opt.title}</div>
                <div className="text-[11px] opacity-80 leading-5">{opt.desc}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs items-end">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                انتخاب فاکتور فروش مرجع
              </label>
              <select
                value={returnInvoiceId}
                onChange={(e) => setReturnInvoiceId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              >
                <option value="">انتخاب فاکتور...</option>
                {activePostedInvoices.slice(0, 60).map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNo} — {inv.customerName} ({formatCurrency(inv.totalAmount)} ت)
                  </option>
                ))}
              </select>
            </div>

            {returnMode === 'cash_refund' && (
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  حساب پرداخت‌کننده عودت وجه
                </label>
                <select
                  value={refundAccountCode}
                  onChange={(e) =>
                    setRefundAccountCode(e.target.value as '110102' | '110103')
                  }
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="110102">حساب کارت بانکی (کارت به کارت - ۱۱۰۱۰۲)</option>
                  <option value="110103">حساب نقدی (صندوق نقد مغازه - ۱۱۰۱۰۳)</option>
                </select>
              </div>
            )}

            {returnMode === 'exchange' && (
              <>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    کالای جایگزین در تعویض
                  </label>
                  <select
                    value={exchangeSku}
                    onChange={(e) => setExchangeSku(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  >
                    <option value="">انتخاب کالای جایگزین...</option>
                    {inventoryItems
                      .filter((i) => i.stockQty > 0)
                      .slice(0, 80)
                      .map((i) => (
                        <option key={i.id} value={i.sku}>
                          {i.name} ({formatCurrency(i.retailPrice)} ت)
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    تعداد کالای جایگزین
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={exchangeQty}
                    onChange={(e) => setExchangeQty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                علت مرجوعی / توضیحات
              </label>
              <input
                type="text"
                placeholder="توضیحات مرجوعی..."
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!returnInvoiceId) {
                onShowToast('ابتدا فاکتور فروش مرجع را انتخاب کنید.');
                return;
              }
              const ok = onProcessPosReturn({
                sourceInvoiceId: returnInvoiceId,
                resolutionMode: returnMode,
                refundAccountCode: returnMode === 'cash_refund' ? refundAccountCode : undefined,
                exchangeReplacementSku: returnMode === 'exchange' ? exchangeSku : undefined,
                exchangeReplacementQty: returnMode === 'exchange' ? exchangeQty : undefined,
                notes: returnNotes,
              });
              if (ok) {
                setReturnInvoiceId('');
                setReturnNotes('');
              }
            }}
            className="px-5 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl"
          >
            ثبت قطعی مرجوعی و صدور سند معکوس انبار و مالی
          </button>
        </div>
      )}

      {/* VIEW 3: MANUAL RESELLER PRICE LIST (لیست قیمت ریسلرها / همکاران) */}
      {activeView === 'reseller_pricelist' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                لیست قیمت دستی ریسلرها (همکاران)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                نرخ‌های ثبت‌شده در این جدول به محض زدن دکمه «ریسلر (همکار)» در صندوق فروشگاهی فراخوانی می‌شوند.
              </p>
            </div>
            <PackageCheck className="w-5 h-5 text-indigo-600" />
          </div>

          <div className="max-h-96 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3">کد SKU</th>
                  <th className="py-2.5 px-3">نام کالا</th>
                  <th className="py-2.5 px-3 text-left">قیمت فروش عادی</th>
                  <th className="py-2.5 px-3 text-left">قیمت همکاری / ریسلر (قابل ویرایش دستی)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {inventoryItems.slice(0, 100).map((item) => {
                  const currentReseller =
                    item.resellerPrice || item.partnerPrice || Math.round(item.retailPrice * 0.88);
                  return (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono">{item.sku}</td>
                      <td className="py-2 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </td>
                      <td className="py-2 px-3 font-mono tabular-nums text-left text-slate-600">
                        {formatCurrency(item.retailPrice)} تومان
                      </td>
                      <td className="py-2 px-3 text-left">
                        <input
                          type="number"
                          min={0}
                          defaultValue={currentReseller}
                          onBlur={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            if (val !== currentReseller) {
                              onUpdateResellerPrice(item.sku, val);
                            }
                          }}
                          className="w-40 px-2.5 py-1 font-mono tabular-nums font-bold text-indigo-700 dark:text-indigo-300 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
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

      {/* THERMAL 8CM RECEIPT MODAL */}
      {showThermalReceipt && lastReceiptSnapshot && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 rounded-xl border border-slate-300 w-80 p-5 space-y-3 shadow-2xl font-mono text-xs">
            <div className="text-center border-b border-dashed border-slate-400 pb-3 space-y-1">
              <div className="font-bold text-sm">فروشگاه مرکزی کلودی شاپ</div>
              <div className="text-slate-500">فیش صندوق فروشگاهی</div>
              <div className="text-slate-600">مشتری: {lastReceiptSnapshot.customerName}</div>
              {lastReceiptSnapshot.referralName && (
                <div className="text-slate-500">معرف: {lastReceiptSnapshot.referralName}</div>
              )}
            </div>
            <div className="space-y-1.5 border-b border-dashed border-slate-400 pb-3">
              {lastReceiptSnapshot.cartLines.map((line, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="truncate max-w-[155px]">
                    {line.name} ({line.qty} {line.uom})
                  </span>
                  <span>{formatCurrency(line.qty * line.finalManualUnitPrice)}</span>
                </div>
              ))}
              {lastReceiptSnapshot.serviceLines.map((srv) => (
                <div key={srv.id} className="flex justify-between">
                  <span className="truncate max-w-[155px]">خدمت: {srv.serviceTitle}</span>
                  <span>{formatCurrency(srv.feeAmount)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-slate-700">
              <div className="flex justify-between font-bold text-slate-900">
                <span>جمع کل فاکتور:</span>
                <span>{formatCurrency(lastReceiptSnapshot.netTotal)} ت</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>پرداختی ({lastReceiptSnapshot.paymentMethodLabel}):</span>
                <span>{formatCurrency(lastReceiptSnapshot.paidAmount)} ت</span>
              </div>
              {lastReceiptSnapshot.creditReceivableAmount > 0 && (
                <div className="flex justify-between text-rose-700 font-bold">
                  <span>مانده نسیه (بدهکار):</span>
                  <span>{formatCurrency(lastReceiptSnapshot.creditReceivableAmount)} ت</span>
                </div>
              )}
            </div>
            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 bg-slate-900 text-white rounded-lg font-sans font-semibold"
              >
                چاپ فیش
              </button>
              <button
                type="button"
                onClick={() => setShowThermalReceipt(false)}
                className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg font-sans font-semibold"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
