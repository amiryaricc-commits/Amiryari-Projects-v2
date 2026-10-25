import React, { useState, useRef, useMemo } from 'react';
import {
  Package,
  Barcode,
  Sparkles,
  Boxes,
  Plus,
  Eye,
  EyeOff,
  AlertTriangle,
  Warehouse,
  CheckCircle2,
  Droplets,
  Cpu,
  Flame,
} from 'lucide-react';
import {
  InventoryItemRecord,
  WarehouseRecord,
  MasterOptionsRegistry,
  PromotionRuleRecord,
  PurchaseInvoiceRecord,
  WarehouseKey,
} from '../data/erpSeedData';
import {
  formatCurrency,
  smartFilterAndRankItems,
  calculateCostPerMl,
  SystemRole,
} from '../utils/erpEngine';
import { CreatableCombobox } from './CreatableCombobox';

interface SkuBreakdownRow {
  rowId: string;
  sku: string;
  name: string;
  parentTag: string;
  condition: string;
  itemType: string;
  sector: 'vape' | 'pc';
  qty: number;
  targetWarehouse: WarehouseKey;
  expiryDate: string;
  nicotine: string;
  puffCount: string;
  color: string;
  resistanceOhm: string;
  liquidVolumeMl: string;
  podTankCapacityMl: string;
  allowDecantSale: boolean;
  unitPurchasePrice: number;
  retailPrice: number;
  resellerPrice: number;
}

interface InventoryWmsModuleProps {
  productionMode: boolean;
  privacyMasked?: boolean;
  activeRole: SystemRole;
  initialTab?: 'stocktaking' | 'sku_allocation' | 'festivals_bundles';
  items: InventoryItemRecord[];
  warehouses: WarehouseRecord[];
  onAddWarehouse: (wh: WarehouseRecord) => void;
  masterOptions: MasterOptionsRegistry;
  onAddMasterOption: (category: keyof MasterOptionsRegistry, newValue: string) => void;
  pendingBreakdownPurchases: PurchaseInvoiceRecord[];
  onCompleteSkuBreakdown: (
    purchaseId: string | null,
    newOrUpdatedItems: InventoryItemRecord[]
  ) => void;
  promotionRules: PromotionRuleRecord[];
  onAddPromotionRule: (rule: PromotionRuleRecord) => void;
  onTogglePromotionRule: (id: string) => void;
  onCreateBundleItem: (bundle: InventoryItemRecord) => void;
  onTransferWarehouseStock?: (
    sku: string,
    fromWh: WarehouseKey,
    toWh: WarehouseKey,
    qty: number
  ) => void;
  onShowToast: (msg: string) => void;
}

const createEmptyBreakdownRow = (index: number, defaultCost = 0): SkuBreakdownRow => ({
  rowId: `sku-row-${Date.now()}-${index}`,
  sku: '',
  name: '',
  parentTag: 'سالت نیکوتین',
  condition: 'آکبند',
  itemType: 'جویس و سالت',
  sector: 'vape',
  qty: 1,
  targetWarehouse: 'vitrine',
  expiryDate: '۱۴۰۵/۰۶/۳۰',
  nicotine: '۳۰ میلی‌گرم (30mg)',
  puffCount: '',
  color: '',
  resistanceOhm: '',
  liquidVolumeMl: '30 ml',
  podTankCapacityMl: '',
  allowDecantSale: false,
  unitPurchasePrice: defaultCost,
  retailPrice: defaultCost > 0 ? Math.round(defaultCost * 1.35) : 0,
  resellerPrice: defaultCost > 0 ? Math.round(defaultCost * 1.18) : 0,
});

export const InventoryWmsModule: React.FC<InventoryWmsModuleProps> = ({
  privacyMasked = false,
  initialTab = 'stocktaking',
  items,
  warehouses,
  onAddWarehouse,
  masterOptions,
  onAddMasterOption,
  pendingBreakdownPurchases,
  onCompleteSkuBreakdown,
  promotionRules,
  onAddPromotionRule,
  onTogglePromotionRule,
  onCreateBundleItem,
  onTransferWarehouseStock,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'stocktaking' | 'sku_allocation' | 'festivals_bundles'>(
    initialTab
  );

  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Tab 1: Stocktaking & 4 Warehouses State
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<'all' | 'vape' | 'pc'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [revealCostPrice, setRevealCostPrice] = useState(false);
  const [showAddWarehouseModal, setShowAddWarehouseModal] = useState(false);
  const [newWhName, setNewWhName] = useState('');
  const [newWhLocation, setNewWhLocation] = useState('');
  const [newWhDesc, setNewWhDesc] = useState('');

  // Quick stock transfer between the 4 warehouses
  const [transferSku, setTransferSku] = useState('');
  const [transferFromWh, setTransferFromWh] = useState<WarehouseKey>('central_external');
  const [transferToWh, setTransferToWh] = useState<WarehouseKey>('vitrine');
  const [transferQty, setTransferQty] = useState(1);

  // Tab 2: Stage-2 SKU Allocation & Rapid Barcode Entry State
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>(
    pendingBreakdownPurchases[0]?.id || ''
  );
  const [breakdownRows, setBreakdownRows] = useState<SkuBreakdownRow[]>(() =>
    Array.from({ length: 5 }, (_, i) => createEmptyBreakdownRow(i))
  );
  // Refs for rapid Enter-to-next-SKU barcode scanning
  const skuInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Tab 3: Festivals, Discounts & Product Bundles State
  const [promoName, setPromoName] = useState('');
  const [promoType, setPromoType] = useState<PromotionRuleRecord['festivalType']>(
    'خرید بالای X قلم'
  );
  const [promoDiscType, setPromoDiscType] = useState<'percent' | 'fixed'>('percent');
  const [promoDiscVal, setPromoDiscVal] = useState<number>(10);
  const [promoMinQty, setPromoMinQty] = useState<number>(3);
  const [promoTarget, setPromoTarget] = useState<PromotionRuleRecord['targetGroup']>(
    'همه مشتریان'
  );
  const [promoStart, setPromoStart] = useState('۱۴۰۴/۰۸/۰۱');
  const [promoEnd, setPromoEnd] = useState('۱۴۰۴/۰۹/۳۰');
  const [promoPayModel, setPromoPayModel] = useState<'نقد' | 'نسیه' | 'همه'>('همه');

  // Product Bundle Builder State
  const [bundleSku, setBundleSku] = useState('');
  const [bundleName, setBundleName] = useState('');
  const [bundlePrice, setBundlePrice] = useState<number>(0);
  const [bundleComp1Sku, setBundleComp1Sku] = useState('');
  const [bundleComp1Qty, setBundleComp1Qty] = useState(1);
  const [bundleComp2Sku, setBundleComp2Sku] = useState('');
  const [bundleComp2Qty, setBundleComp2Qty] = useState(1);

  const filteredStockItems = useMemo(() => {
    const bySearch = smartFilterAndRankItems(items, searchQuery);
    return bySearch.filter((item) => {
      const itemSector =
        item.sector || (item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
      if (selectedSectorFilter !== 'all' && itemSector !== selectedSectorFilter) {
        return false;
      }
      if (selectedWarehouseFilter !== 'all') {
        const whMap = item.warehouseStock || { central_external: item.stockQty };
        return (whMap[selectedWarehouseFilter] || 0) > 0;
      }
      return true;
    });
  }, [items, searchQuery, selectedSectorFilter, selectedWarehouseFilter]);

  const handleAddWarehouseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhName.trim()) return;
    const key = `wh_custom_${Date.now()}`;
    onAddWarehouse({
      id: `wh-${Date.now()}`,
      key,
      name: newWhName.trim(),
      accountCode: '1104',
      location: newWhLocation.trim() || 'فروشگاه مرکزی کلودی شاپ',
      description: newWhDesc.trim() || 'انبار اختصاصی اضافه‌شده',
    });
    setNewWhName('');
    setNewWhLocation('');
    setNewWhDesc('');
    setShowAddWarehouseModal(false);
    onShowToast(`انبار جدید «${newWhName.trim()}» به سیستم اضافه شد.`);
  };

  // Dedicated Enter key handler on SKU fields: jumps directly to the next row's SKU input!
  const handleSkuInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIndex + 1 < breakdownRows.length) {
        skuInputRefs.current[rowIndex + 1]?.focus();
      } else {
        // Automatically append a new row and focus its SKU input
        const nextIndex = breakdownRows.length;
        setBreakdownRows((prev) => [...prev, createEmptyBreakdownRow(nextIndex)]);
        window.setTimeout(() => {
          skuInputRefs.current[nextIndex]?.focus();
        }, 25);
      }
    }
  };

  const updateBreakdownRow = <K extends keyof SkuBreakdownRow>(
    rowIndex: number,
    field: K,
    val: SkuBreakdownRow[K]
  ) => {
    setBreakdownRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== rowIndex) return r;
        const next = { ...r, [field]: val };
        if (field === 'itemType') {
          const typeStr = String(val);
          if (typeStr.includes('کامپیوتر') || typeStr.includes('سخت‌افزار')) {
            next.sector = 'pc';
          } else {
            next.sector = 'vape';
          }
        }
        return next;
      })
    );
  };

  const handleSaveBreakdownRows = () => {
    const validRows = breakdownRows.filter((r) => r.sku.trim() && r.name.trim() && r.qty > 0);
    if (validRows.length === 0) {
      onShowToast('حداقل یک ردیف با کد SKU، نام کالا و تعداد معتبر وارد کنید.');
      return;
    }

    const createdItems: InventoryItemRecord[] = validRows.map((r, idx) => {
      const bottleVol = parseInt(r.liquidVolumeMl, 10) || 60;
      const costPerMl = r.allowDecantSale
        ? calculateCostPerMl(r.unitPurchasePrice, bottleVol)
        : undefined;
      return {
        id: `itm-${Date.now()}-${idx}`,
        sku: r.sku.trim(),
        name: r.name.trim(),
        category:
          r.sector === 'pc'
            ? 'قطعات کامپیوتر و سخت‌افزار'
            : r.itemType.includes('جویس') || r.itemType.includes('سالت')
              ? 'جویس و سالت'
              : r.itemType.includes('کویل') || r.itemType.includes('کارتریج')
                ? 'کویل و کارتریج'
                : 'دستگاه پاد و ماد',
        sector: r.sector,
        brand: r.parentTag,
        parentTag: r.parentTag,
        itemType: r.itemType,
        condition: (r.condition as InventoryItemRecord['condition']) || 'آکبند',
        nicotine: r.nicotine || undefined,
        puffCount: r.puffCount || undefined,
        color: r.color || undefined,
        resistanceOhm: r.resistanceOhm || undefined,
        liquidVolumeMl: parseInt(r.liquidVolumeMl, 10) || undefined,
        podTankCapacityMl: parseFloat(r.podTankCapacityMl) || undefined,
        allowDecantSale: r.allowDecantSale,
        bottleVolumeMl: r.allowDecantSale ? bottleVol : undefined,
        openBottleRemainingMl: 0,
        costPerMl,
        uomPrimary: 'عدد',
        stockQty: r.qty,
        warehouseStock: {
          [r.targetWarehouse]: r.qty,
        },
        totalInQty: r.qty,
        totalOutQty: 0,
        reservedQty: 0,
        reorderLevel: 3,
        valuationRate: r.unitPurchasePrice,
        fifoLayers:
          r.sector === 'pc'
            ? [{ qty: r.qty, unitCost: r.unitPurchasePrice, date: '۱۴۰۴/۰۸/۰۲' }]
            : undefined,
        retailPrice: r.retailPrice || Math.round(r.unitPurchasePrice * 1.35),
        wholesalePrice: r.resellerPrice || Math.round(r.unitPurchasePrice * 1.18),
        partnerPrice: r.resellerPrice || Math.round(r.unitPurchasePrice * 1.18),
        resellerPrice: r.resellerPrice || Math.round(r.unitPurchasePrice * 1.18),
        serialNumbers: [],
        batchNo: `B-${Date.now().toString().slice(-4)}`,
        expiryDate: r.expiryDate || '—',
        daysInStock: 1,
      };
    });

    onCompleteSkuBreakdown(selectedPurchaseId || null, createdItems);
    setBreakdownRows(Array.from({ length: 5 }, (_, i) => createEmptyBreakdownRow(i)));
  };

  return (
    <div className="space-y-6">
      {/* Urgent Alert Banner for Pending Stage-1 Purchase Invoices needing SKU Breakdown */}
      {pendingBreakdownPurchases.length > 0 && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 dark:text-amber-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">
                اعلان ضروری انبار: {pendingBreakdownPurchases.length} فاکتور خرید کلان منتظر تخصیص کد SKU، طعم‌بندی و چیدمان ویترین است!
              </div>
              <p className="mt-0.5 opacity-90">
                بارهای خریداری‌شده در «انبار خارجی / مرکزی» ثبت شده‌اند اما هنوز به صورت تک‌به‌تک بارکد و ویژگی نخورده‌اند.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedPurchaseId(pendingBreakdownPurchases[0].id);
              setActiveTab('sku_allocation');
            }}
            className="px-4 py-2 font-bold bg-amber-600 text-white rounded-lg hover:bg-amber-700 whitespace-nowrap shrink-0"
          >
            شروع تخصیص SKU و جزئیات بار ←
          </button>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('stocktaking')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'stocktaking'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Warehouse className="w-4 h-4" />
            <span>انبارگردانی (۴ انبار اصلی و موجودی)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sku_allocation')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'sku_allocation'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Barcode className="w-4 h-4" />
            <span>ورود جزئیات کالا و تخصیص سریع SKU</span>
            {pendingBreakdownPurchases.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full">
                {pendingBreakdownPurchases.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('festivals_bundles')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
              activeTab === 'festivals_bundles'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>مدیریت جشنواره، تخفیف‌ها و باندل کالا</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowAddWarehouseModal((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن انبار جدید</span>
        </button>
      </div>

      {/* Add New Warehouse Modal/Form */}
      {showAddWarehouseModal && (
        <form
          onSubmit={handleAddWarehouseSubmit}
          className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-indigo-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-end text-xs"
        >
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              نام انبار جدید *
            </label>
            <input
              type="text"
              required
              placeholder="مثلاً انبار نمایشگاه فصلی"
              value={newWhName}
              onChange={(e) => setNewWhName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              موقعیت / آدرس
            </label>
            <input
              type="text"
              placeholder="طبقه دوم پاساژ..."
              value={newWhLocation}
              onChange={(e) => setNewWhLocation(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              توضیحات کاربری انبار
            </label>
            <input
              type="text"
              placeholder="توضیحات..."
              value={newWhDesc}
              onChange={(e) => setNewWhDesc(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            className="py-2 px-4 font-bold bg-slate-900 dark:bg-indigo-600 text-white rounded-lg hover:bg-slate-800"
          >
            ثبت انبار جدید
          </button>
        </form>
      )}

      {/* TAB 1: STOCKTAKING (انبارگردانی - ۴ انبار اصلی + جدول گزارشی موجودی) */}
      {activeTab === 'stocktaking' && (
        <div className="space-y-5">
          {/* 4 Warehouses Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {warehouses.map((wh) => {
              const whQty = items.reduce((sum, item) => {
                const whMap = item.warehouseStock || { central_external: item.stockQty };
                return sum + (whMap[wh.key] || 0);
              }, 0);
              const isSelected = selectedWarehouseFilter === wh.key;
              return (
                <button
                  key={wh.id}
                  type="button"
                  onClick={() =>
                    setSelectedWarehouseFilter(isSelected ? 'all' : wh.key)
                  }
                  className={`p-4 rounded-xl border text-right transition-colors space-y-1.5 ${
                    isSelected
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/60 border-indigo-500'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {wh.name}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{wh.accountCode}</span>
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-indigo-700 dark:text-indigo-400">
                    {formatCurrency(whQty)} <span className="text-xs font-normal">واحد کالا</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-5">{wh.description}</p>
                </button>
              );
            })}
          </div>

          {/* Quick Inter-Warehouse Transfer Bar (انتقال سریع بین انبار مرکزی، انبار مغازه، ویترین و امانی) */}
          {onTransferWarehouseStock && (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
              <div className="md:col-span-4">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  انتقال داخلی کالا بین ۴ انبار (شارژ ویترین از انبار مرکزی/مغازه)
                </label>
                <select
                  value={transferSku}
                  onChange={(e) => setTransferSku(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  <option value="">انتخاب کالا برای جابه‌جایی...</option>
                  {items
                    .filter((i) => i.stockQty > 0)
                    .slice(0, 100)
                    .map((i) => (
                      <option key={i.id} value={i.sku}>
                        {i.name} ({i.sku}) — کل: {i.stockQty}
                      </option>
                    ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  از انبار مبدأ
                </label>
                <select
                  value={transferFromWh}
                  onChange={(e) => setTransferFromWh(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  به انبار مقصد
                </label>
                <select
                  value={transferToWh}
                  onChange={(e) => setTransferToWh(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  تعداد انتقال
                </label>
                <input
                  type="number"
                  min={1}
                  value={transferQty}
                  onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!transferSku) {
                      onShowToast('کالای مورد نظر برای انتقال بین انبارها را انتخاب کنید.');
                      return;
                    }
                    onTransferWarehouseStock(
                      transferSku,
                      transferFromWh,
                      transferToWh,
                      transferQty
                    );
                  }}
                  className="w-full py-1.5 px-3 font-bold bg-slate-900 dark:bg-indigo-600 text-white rounded-lg hover:bg-slate-800"
                >
                  ثبت جابه‌جایی انبار
                </button>
              </div>
            </div>
          )}

          {/* Read-Only Inventory Stock Table with Smart Search & Sector Valuation Badges */}
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  جدول جامع موجودی انبار (فقط مشاهده و گزارش)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  تفکیک خودکار فرمول بهای تمام‌شده: لوازم ویپ‌شاپ بر پایه «میانگین موزون متحرک» · لوازم کامپیوتر بر پایه «FIFO (اولین صادره از اولین وارده)»
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="inline-flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                  {[
                    { id: 'all' as const, label: 'همه اصناف' },
                    { id: 'vape' as const, label: 'ویپ‌شاپ (میانگین موزون)' },
                    { id: 'pc' as const, label: 'قطعات کامپیوتر (FIFO)' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedSectorFilter(s.id)}
                      className={`px-2.5 py-1 rounded-md font-semibold ${
                        selectedSectorFilter === s.id
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setRevealCostPrice((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg font-semibold"
                >
                  {revealCostPrice && !privacyMasked ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>نمایش بهای تمام‌شده</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 text-xs">
              <input
                type="text"
                placeholder="جستجوی حرفه‌ای کد SKU، نام کالا، طعم، برند یا نیکوتین (Equal & Contains)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              />
              <select
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                <option value="all">همه انبارها ({warehouses.length} انبار)</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.key}>
                    فقط {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto max-h-[520px] border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">کد SKU</th>
                    <th className="py-2.5 px-3">نام کالا · صنف و فرمول ارزش‌گذاری</th>
                    <th className="py-2.5 px-3">موجودی فعلی (تفکیک انبار)</th>
                    <th className="py-2.5 px-3">تاریخ انقضا</th>
                    <th className="py-2.5 px-3 text-left">قیمت بهای تمام‌شده</th>
                    <th className="py-2.5 px-3 text-center">تعداد ورودی</th>
                    <th className="py-2.5 px-3 text-center">تعداد خروجی</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStockItems.slice(0, 150).map((item) => {
                    const sector =
                      item.sector ||
                      (item.category === 'قطعات کامپیوتر و سخت‌افزار' ? 'pc' : 'vape');
                    const whMap = item.warehouseStock || { central_external: item.stockQty };
                    const inQty = item.totalInQty ?? item.stockQty;
                    const outQty = item.totalOutQty ?? 0;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                            {sector === 'pc' ? (
                              <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                                <Cpu className="w-3 h-3" />
                                <span>کامپیوتر (روش FIFO)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                <Flame className="w-3 h-3" />
                                <span>ویپ‌شاپ (میانگین موزون)</span>
                              </span>
                            )}
                            {item.nicotine && <span>· نیکوتین: {item.nicotine}</span>}
                            {item.liquidVolumeMl && <span>· حجم مایع: {item.liquidVolumeMl}ml</span>}
                            {item.podTankCapacityMl && (
                              <span>· ظرفیت تانک: {item.podTankCapacityMl}ml</span>
                            )}
                            {item.resistanceOhm && <span>· مقاومت: {item.resistanceOhm}</span>}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            کل: {item.stockQty} {item.uomPrimary}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            ویترین: {whMap.vitrine || 0} · مغازه: {whMap.shop_storage || 0} · مرکزی:{' '}
                            {whMap.central_external || 0} · امانی: {whMap.consignment || 0}
                          </div>
                          {(item.openBottleRemainingMl || 0) > 0 && (
                            <div className="text-[11px] text-sky-600 font-semibold">
                              بطری باز: {item.openBottleRemainingMl} ml (هر میل:{' '}
                              {revealCostPrice && !privacyMasked
                                ? `${formatCurrency(item.costPerMl || 0)} ت`
                                : '****'}
                              )
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {item.expiryDate || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-left font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {revealCostPrice && !privacyMasked
                            ? `${formatCurrency(item.valuationRate)} تومان`
                            : '****'}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-center text-emerald-700 dark:text-emerald-400 font-semibold">
                          {inQty}
                        </td>
                        <td className="py-2.5 px-3 font-mono tabular-nums text-center text-rose-600 dark:text-rose-400 font-semibold">
                          {outQty}
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

      {/* TAB 2: STAGE-2 SKU ALLOCATION & RAPID BARCODE ENTRY (کلید Enter در فیلد SKU به ردیف بعدی می‌پرد) */}
      {activeTab === 'sku_allocation' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                فرم ورود جزئیات کالا و تخصیص کد SKU (مرحله دوم پس از فاکتور خرید)
              </h3>
              <p className="text-xs text-slate-500">
                رفتار ویژه بارکدخوان: با اسکن بارکد در ستون «کد SKU» (که خودکار کلید Enter را می‌زند)، فوکوس کیبورد مستقیماً به فیلد «کد SKU» ردیف بعدی می‌پرد تا بتوانید ده کالا را پشت سر هم اسکن کنید.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs shrink-0">
              <select
                value={selectedPurchaseId}
                onChange={(e) => setSelectedPurchaseId(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                <option value="">ثبت مستقیم SKU بدون عطف به فاکتور خرید</option>
                {pendingBreakdownPurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    فاکتور خرید {p.billNo} — {p.itemsSummary} ({formatCurrency(p.totalAmount)} ت)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setBreakdownRows((prev) => [
                    ...prev,
                    createEmptyBreakdownRow(prev.length),
                  ])
                }
                className="px-3 py-2 font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200"
              >
                + افزودن ردیف اسکن
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {breakdownRows.map((row, rowIdx) => {
              const isLiquidType =
                row.itemType.includes('جویس') ||
                row.itemType.includes('سالت') ||
                row.parentTag.includes('جویس') ||
                row.parentTag.includes('سالت');
              const isHardwarePodType =
                row.itemType.includes('پاد') ||
                row.itemType.includes('دستگاه') ||
                row.itemType.includes('کارتریج') ||
                row.itemType.includes('کویل');

              return (
                <div
                  key={row.rowId}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs border-b border-slate-200/80 dark:border-slate-700 pb-2">
                    <span className="font-bold text-indigo-700 dark:text-indigo-400">
                      ردیف اسکن #{rowIdx + 1}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-sky-800 dark:text-sky-300 font-semibold">
                        <input
                          type="checkbox"
                          checked={row.allowDecantSale}
                          disabled={!isLiquidType}
                          onChange={(e) =>
                            updateBreakdownRow(rowIdx, 'allowDecantSale', e.target.checked)
                          }
                          className="rounded border-slate-300"
                        />
                        <Droplets className="w-3.5 h-3.5" />
                        <span>قابلیت فروش باز (میلی‌لیتری Decant)</span>
                      </label>
                      {breakdownRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setBreakdownRows((prev) =>
                              prev.filter((_, idx) => idx !== rowIdx)
                            )
                          }
                          className="text-rose-600 hover:underline"
                        >
                          حذف ردیف
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Row Line 1: SKU (Rapid Enter Jump), Item Name, Parent Tag, Item Type, Condition */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">
                        ۱. کد SKU (Enter = پرش به SKU بعدی) *
                      </label>
                      <input
                        ref={(el) => {
                          skuInputRefs.current[rowIdx] = el;
                        }}
                        type="text"
                        placeholder="اسکن بارکد SKU..."
                        value={row.sku}
                        onChange={(e) => updateBreakdownRow(rowIdx, 'sku', e.target.value)}
                        onKeyDown={(e) => handleSkuInputKeyDown(e, rowIdx)}
                        className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-900 border-2 border-indigo-400 dark:border-indigo-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۲. نام کامل کالا و طعم *
                      </label>
                      <input
                        type="text"
                        placeholder="مثلاً سالت نستی انبه یخ"
                        value={row.name}
                        onChange={(e) => updateBreakdownRow(rowIdx, 'name', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    <CreatableCombobox
                      label="۳. تگ / نام مادر / پیشوند"
                      value={row.parentTag}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'parentTag', val)}
                      options={masterOptions.tags}
                      onAddNewOption={(opt) => onAddMasterOption('tags', opt)}
                    />

                    <CreatableCombobox
                      label="۴. نوع کالا (تعیین‌کننده صنف)"
                      value={row.itemType}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'itemType', val)}
                      options={masterOptions.itemTypes}
                      onAddNewOption={(opt) => onAddMasterOption('itemTypes', opt)}
                    />

                    <CreatableCombobox
                      label="۵. وضعیت کالا (آکبند / استوک)"
                      value={row.condition}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'condition', val)}
                      options={masterOptions.conditions}
                      onAddNewOption={(opt) => onAddMasterOption('conditions', opt)}
                    />
                  </div>

                  {/* Row Line 2: Nicotine, Puff, Color, Resistance Ohm, Conditional Volumes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <CreatableCombobox
                      label="۶. میزان نیکوتین"
                      value={row.nicotine}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'nicotine', val)}
                      options={masterOptions.nicotines}
                      onAddNewOption={(opt) => onAddMasterOption('nicotines', opt)}
                    />

                    <CreatableCombobox
                      label="۷. تعداد پاف (Puff)"
                      value={row.puffCount}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'puffCount', val)}
                      options={masterOptions.puffs}
                      onAddNewOption={(opt) => onAddMasterOption('puffs', opt)}
                    />

                    <CreatableCombobox
                      label="۸. رنگ"
                      value={row.color}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'color', val)}
                      options={masterOptions.colors}
                      onAddNewOption={(opt) => onAddMasterOption('colors', opt)}
                    />

                    <CreatableCombobox
                      label="۹. مقاومت / اهم (Ω)"
                      value={row.resistanceOhm}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'resistanceOhm', val)}
                      options={masterOptions.resistances}
                      onAddNewOption={(opt) => onAddMasterOption('resistances', opt)}
                    />

                    {/* Conditional Volume Field 1: Liquid/Bottle Volume (ml) — Disabled for Hardware */}
                    <CreatableCombobox
                      label="۱۰. حجم مایع / بطری (ml)"
                      value={row.liquidVolumeMl}
                      disabled={!isLiquidType && isHardwarePodType}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'liquidVolumeMl', val)}
                      options={masterOptions.liquidVolumes}
                      onAddNewOption={(opt) => onAddMasterOption('liquidVolumes', opt)}
                      placeholder={
                        !isLiquidType && isHardwarePodType
                          ? 'غیرفعال برای دستگاه'
                          : 'مثلاً 30 ml یا 60 ml'
                      }
                    />

                    {/* Conditional Volume Field 2: Pod/Tank Capacity (ml) — Disabled for E-Liquids */}
                    <CreatableCombobox
                      label="۱۱. ظرفیت تانک / کارتریج (ml)"
                      value={row.podTankCapacityMl}
                      disabled={isLiquidType}
                      onChange={(val) => updateBreakdownRow(rowIdx, 'podTankCapacityMl', val)}
                      options={masterOptions.podCapacities}
                      onAddNewOption={(opt) => onAddMasterOption('podCapacities', opt)}
                      placeholder={
                        isLiquidType ? 'غیرفعال برای جویس/سالت' : 'مثلاً 2 ml یا 4.5 ml'
                      }
                    />
                  </div>

                  {/* Row Line 3: Qty, Target Warehouse, Expiry Date, Buying Price, Retail & Reseller Price */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۱۲. تعداد واحد
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) =>
                          updateBreakdownRow(rowIdx, 'qty', Math.max(1, Number(e.target.value) || 1))
                        }
                        className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۱۳. انبار مقصد چیدمان
                      </label>
                      <select
                        value={row.targetWarehouse}
                        onChange={(e) =>
                          updateBreakdownRow(rowIdx, 'targetWarehouse', e.target.value)
                        }
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.key}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۱۴. تاریخ انقضا
                      </label>
                      <input
                        type="text"
                        placeholder="۱۴۰۵/۰۶/۳۰"
                        value={row.expiryDate}
                        onChange={(e) => updateBreakdownRow(rowIdx, 'expiryDate', e.target.value)}
                        className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۱۵. قیمت خرید واحد (تومان)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={row.unitPurchasePrice || ''}
                        onChange={(e) =>
                          updateBreakdownRow(
                            rowIdx,
                            'unitPurchasePrice',
                            Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                        className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۱۶. قیمت فروش سیستمی (تومان)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={row.retailPrice || ''}
                        onChange={(e) =>
                          updateBreakdownRow(
                            rowIdx,
                            'retailPrice',
                            Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                        className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                        ۱۷. قیمت ریسلر / همکار (تومان)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={row.resellerPrice || ''}
                        onChange={(e) =>
                          updateBreakdownRow(
                            rowIdx,
                            'resellerPrice',
                            Math.max(0, Number(e.target.value) || 0)
                          )
                        }
                        className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleSaveBreakdownRows}
              className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs"
            >
              ثبت نهایی جزئیات SKUها و انتقال به موجودی انبار انتخاب‌شده
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: INDEPENDENT FESTIVAL & DISCOUNTS PANEL + PRODUCT BUNDLES */}
      {activeTab === 'festivals_bundles' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Festival & Discount Rules Panel (7 cols) */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                پنل مستقل مدیریت جشنواره و تخفیف‌ها (متصل به دکمه «فروش جشنواره» در صندوق)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تعریف دستی قوانین تخفیف خرید اول، خرید بالای X قلم و جشنواره‌های مناسبتی همراه با نشانگر وضعیت فعال
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  عنوان جشنواره *
                </label>
                <input
                  type="text"
                  placeholder="مثلاً جشنواره بلک‌فرایدی ویپ"
                  value={promoName}
                  onChange={(e) => setPromoName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  نوع جشنواره
                </label>
                <select
                  value={promoType}
                  onChange={(e) =>
                    setPromoType(e.target.value as PromotionRuleRecord['festivalType'])
                  }
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="تخفیف خرید اول">تخفیف خرید اول</option>
                  <option value="خرید بالای X قلم">خرید بالای X قلم (مثلاً ۳ قلم)</option>
                  <option value="تخفیف مناسبتی">تخفیف مناسبتی</option>
                  <option value="حراج رسوب انبار">حراج رسوب انبار</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  مشتریان هدف
                </label>
                <select
                  value={promoTarget}
                  onChange={(e) =>
                    setPromoTarget(e.target.value as PromotionRuleRecord['targetGroup'])
                  }
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="همه مشتریان">همه مشتریان</option>
                  <option value="مشتریان عادی">فقط مشتریان عادی</option>
                  <option value="ریسلرها (همکاران)">فقط ریسلرها (همکاران)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  نوع و مقدار تخفیف
                </label>
                <div className="flex gap-1">
                  <select
                    value={promoDiscType}
                    onChange={(e) => setPromoDiscType(e.target.value as 'percent' | 'fixed')}
                    className="px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  >
                    <option value="percent">درصدی (٪)</option>
                    <option value="fixed">مبلغ ثابت (ت)</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={promoDiscVal}
                    onChange={(e) => setPromoDiscVal(Math.max(1, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  حداقل تعداد اقلام سبد
                </label>
                <input
                  type="number"
                  min={1}
                  value={promoMinQty}
                  onChange={(e) => setPromoMinQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  مدل خرید مجاز
                </label>
                <select
                  value={promoPayModel}
                  onChange={(e) => setPromoPayModel(e.target.value as 'نقد' | 'نسیه' | 'همه')}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="همه">نقد و نسیه (همه)</option>
                  <option value="نقد">فقط خرید نقدی</option>
                  <option value="نسیه">فقط خرید نسیه</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  از تاریخ
                </label>
                <input
                  type="text"
                  value={promoStart}
                  onChange={(e) => setPromoStart(e.target.value)}
                  className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  تا تاریخ
                </label>
                <input
                  type="text"
                  value={promoEnd}
                  onChange={(e) => setPromoEnd(e.target.value)}
                  className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!promoName.trim()) {
                      onShowToast('عنوان قانون جشنواره را وارد کنید.');
                      return;
                    }
                    onAddPromotionRule({
                      id: `promo-${Date.now()}`,
                      name: promoName.trim(),
                      festivalType: promoType,
                      discountType: promoDiscType,
                      discountValue: promoDiscVal,
                      minQty: promoMinQty,
                      targetGroup: promoTarget,
                      startDate: promoStart,
                      endDate: promoEnd,
                      applicableSkus: [],
                      paymentModel: promoPayModel,
                      isActive: true,
                    });
                    setPromoName('');
                    onShowToast('قانون جدید جشنواره ثبت و در صندوق فروشگاهی فعال شد.');
                  }}
                  className="w-full py-1.5 px-3 font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  + ثبت قانون جشنواره
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {promotionRules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {rule.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                          rule.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{rule.isActive ? 'فعال در صندوق (Active)' : 'غیرفعال'}</span>
                      </span>
                    </div>
                    <div className="text-slate-500">
                      نوع: {rule.festivalType} · تخفیف:{' '}
                      {rule.discountType === 'percent'
                        ? `${rule.discountValue}٪`
                        : `${formatCurrency(rule.discountValue)} تومان`}{' '}
                      · حداقل خرید: {rule.minQty} قلم · مخاطب: {rule.targetGroup} · بازه:{' '}
                      {rule.startDate} تا {rule.endDate}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onTogglePromotionRule(rule.id)}
                    className="px-3 py-1.5 font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    {rule.isActive ? 'غیرفعال کردن' : 'فعال‌سازی مجدد'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Product Bundle Builder (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  تعریف پکیج باندل کالا (Product Bundle)
                </h3>
                <p className="text-xs text-slate-500">
                  پکیج مجازی متشکل از دو یا چند کالای واقعی با کسر همزمان موجودی هر دو از انبار در لحظه فروش
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    کد SKU باندل *
                  </label>
                  <input
                    type="text"
                    placeholder="مثلاً BND-VAPE-KIT1"
                    value={bundleSku}
                    onChange={(e) => setBundleSku(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    قیمت فروش پکیج باندل (تومان) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="مثلاً 2450000"
                    value={bundlePrice || ''}
                    onChange={(e) => setBundlePrice(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  نام پکیج باندل *
                </label>
                <input
                  type="text"
                  placeholder="مثلاً پک استارتر پاد کالیبرن + سالت ۳۰ میل + کارتریج اضافه"
                  value={bundleName}
                  onChange={(e) => setBundleName(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-9">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    کالای زیرمجموعه اول *
                  </label>
                  <select
                    value={bundleComp1Sku}
                    onChange={(e) => setBundleComp1Sku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  >
                    <option value="">انتخاب کالای اول...</option>
                    {items
                      .filter((i) => !i.isBundle)
                      .slice(0, 80)
                      .map((i) => (
                        <option key={i.id} value={i.sku}>
                          {i.name} ({i.sku})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    تعداد
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bundleComp1Qty}
                    onChange={(e) => setBundleComp1Qty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-9">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    کالای زیرمجموعه دوم *
                  </label>
                  <select
                    value={bundleComp2Sku}
                    onChange={(e) => setBundleComp2Sku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  >
                    <option value="">انتخاب کالای دوم...</option>
                    {items
                      .filter((i) => !i.isBundle)
                      .slice(0, 80)
                      .map((i) => (
                        <option key={i.id} value={i.sku}>
                          {i.name} ({i.sku})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    تعداد
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={bundleComp2Qty}
                    onChange={(e) => setBundleComp2Qty(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const c1 = items.find((i) => i.sku === bundleComp1Sku);
                  const c2 = items.find((i) => i.sku === bundleComp2Sku);
                  if (!bundleSku.trim() || !bundleName.trim() || !c1 || !c2 || bundlePrice <= 0) {
                    onShowToast('لطفاً کد، نام، قیمت و هر دو کالای زیرمجموعه باندل را کامل انتخاب کنید.');
                    return;
                  }
                  const combinedCost =
                    c1.valuationRate * bundleComp1Qty + c2.valuationRate * bundleComp2Qty;
                  const possibleQty = Math.min(
                    Math.floor(c1.stockQty / bundleComp1Qty),
                    Math.floor(c2.stockQty / bundleComp2Qty)
                  );
                  onCreateBundleItem({
                    id: `bnd-${Date.now()}`,
                    sku: bundleSku.trim(),
                    name: bundleName.trim(),
                    category: 'پکیج باندل',
                    sector: 'vape',
                    brand: 'پکیج ترکیبی',
                    isBundle: true,
                    bundleComponents: [
                      `${bundleComp1Qty}× ${c1.name}`,
                      `${bundleComp2Qty}× ${c2.name}`,
                    ],
                    bundleComponentItems: [
                      { sku: c1.sku, name: c1.name, qty: bundleComp1Qty },
                      { sku: c2.sku, name: c2.name, qty: bundleComp2Qty },
                    ],
                    uomPrimary: 'پکیج',
                    stockQty: Math.max(1, possibleQty),
                    reservedQty: 0,
                    reorderLevel: 1,
                    valuationRate: combinedCost,
                    retailPrice: bundlePrice,
                    wholesalePrice: bundlePrice,
                    partnerPrice: bundlePrice,
                    serialNumbers: [],
                    batchNo: 'BUNDLE',
                    expiryDate: '—',
                  });
                  setBundleSku('');
                  setBundleName('');
                  setBundlePrice(0);
                }}
                className="w-full py-2.5 px-4 font-bold bg-slate-900 dark:bg-indigo-600 text-white rounded-xl hover:bg-slate-800"
              >
                + ایجاد پکیج باندل و افزودن به صندوق فروشگاهی
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
