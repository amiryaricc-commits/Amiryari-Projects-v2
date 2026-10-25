import React, { useState, useRef, useMemo } from 'react';
import {
  Package,
  Barcode,
  Sparkles,
  Boxes,
  Plus,
  Eye,
  EyeOff,
  Warehouse,
  CheckCircle2,
  Droplets,
  Trash2,
  ArrowLeftRight,
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
import {
  CreatableCombobox,
  PolarisButton,
  PolarisButtonGroup,
  PolarisCollapsible,
  PolarisSheet,
} from './CreatableCombobox';

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

  // Tab 1: Stocktaking & 4 Warehouses IndexTable State
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [selectedSectorFilter, setSelectedSectorFilter] = useState<'all' | 'vape' | 'pc'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [revealCostPrice, setRevealCostPrice] = useState(false);

  // Polaris Sheet: + Add Warehouse (Closed by default)
  const [isWarehouseSheetOpen, setIsWarehouseSheetOpen] = useState(false);
  const [isSavingWarehouse, setIsSavingWarehouse] = useState(false);
  const [newWhName, setNewWhName] = useState('');
  const [newWhLocation, setNewWhLocation] = useState('');
  const [newWhDesc, setNewWhDesc] = useState('');

  // Polaris Collapsible: Stock Transfer between 4 warehouses (Closed by default)
  const [isTransferCollapsibleOpen, setIsTransferCollapsibleOpen] = useState(false);
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);
  const [transferSku, setTransferSku] = useState('');
  const [transferFromWh, setTransferFromWh] = useState<WarehouseKey>('central_external');
  const [transferToWh, setTransferToWh] = useState<WarehouseKey>('vitrine');
  const [transferQty, setTransferQty] = useState(1);

  // Tab 2: Stage-2 SKU Allocation IndexTable & Row-Level Collapsible (Collapsed by default!)
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>(
    pendingBreakdownPurchases[0]?.id || ''
  );
  const [breakdownRows, setBreakdownRows] = useState<SkuBreakdownRow[]>(() =>
    Array.from({ length: 5 }, (_, i) => createEmptyBreakdownRow(i))
  );
  // Row-level Collapsible state for the 11 technical specs — empty object = ALL CLOSED by default
  const [expandedSpecRows, setExpandedSpecRows] = useState<Record<string, boolean>>({});
  const [isSubmittingBreakdown, setIsSubmittingBreakdown] = useState(false);
  const skuInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Tab 3: Festivals & Bundles (with Collapsible forms & loading lock)
  const [isPromoSheetOpen, setIsPromoSheetOpen] = useState(false);
  const [isBundleCollapsibleOpen, setIsBundleCollapsibleOpen] = useState(false);
  const [isSubmittingPromo, setIsSubmittingPromo] = useState(false);
  const [isSubmittingBundle, setIsSubmittingBundle] = useState(false);
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

  const handleAddWarehouseSubmit = () => {
    if (!newWhName.trim() || isSavingWarehouse) return;
    setIsSavingWarehouse(true);
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
    setIsSavingWarehouse(false);
    setIsWarehouseSheetOpen(false);
  };

  // Dedicated Enter key handler on SKU fields: jumps directly to the next row's SKU input
  const handleSkuInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIndex + 1 < breakdownRows.length) {
        skuInputRefs.current[rowIndex + 1]?.focus();
      } else {
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
          if (typeStr.includes('جویس') || typeStr.includes('سالت')) {
            next.podTankCapacityMl = '';
          } else if (typeStr.includes('پاد') || typeStr.includes('دستگاه') || typeStr.includes('کارتریج')) {
            next.liquidVolumeMl = '';
            next.allowDecantSale = false;
          }
        }
        return next;
      })
    );
  };

  const toggleSpecRow = (rowId: string) => {
    setExpandedSpecRows((prev) => ({
      ...prev,
      [rowId]: !prev[rowId],
    }));
  };

  const handleCommitSkuBreakdown = () => {
    if (isSubmittingBreakdown) return;
    const validRows = breakdownRows.filter((r) => r.sku.trim() && r.name.trim() && r.qty > 0);
    if (validRows.length === 0) {
      onShowToast('حداقل یک ردیف معتبر شامل کد SKU، نام کالا و تعداد وارد کنید.');
      return;
    }

    setIsSubmittingBreakdown(true);

    const parsedItems: InventoryItemRecord[] = validRows.map((r) => {
      const liquidVolNum = parseFloat(r.liquidVolumeMl.replace(/[^\d.]/g, '')) || 0;
      const podCapNum = parseFloat(r.podTankCapacityMl.replace(/[^\d.]/g, '')) || 0;
      const costPerMl =
        liquidVolNum > 0 ? calculateCostPerMl(r.unitPurchasePrice, liquidVolNum) : undefined;
      const retailRate = r.retailPrice || Math.round(r.unitPurchasePrice * 1.35);
      const wholesaleRate = r.resellerPrice || Math.round(r.unitPurchasePrice * 1.18);

      return {
        id: `itm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sku: r.sku.trim().toUpperCase(),
        name: r.name.trim(),
        category:
          r.sector === 'pc'
            ? 'قطعات کامپیوتر و سخت‌افزار'
            : r.itemType.includes('پاد')
              ? 'دستگاه پاد و ماد'
              : r.itemType.includes('کویل') || r.itemType.includes('کارتریج')
                ? 'کویل و کارتریج'
                : 'جویس و سالت',
        brand: r.parentTag || 'کلودی شاپ',
        sector: r.sector,
        parentTag: r.parentTag,
        condition: (r.condition === 'استوک' ? 'استوک' : 'آکبند') as 'آکبند' | 'استوک',
        itemType: r.itemType,
        uomPrimary: 'عدد',
        stockQty: r.qty,
        reservedQty: 0,
        reorderLevel: 3,
        warehouseStock: {
          vitrine: r.targetWarehouse === 'vitrine' ? r.qty : 0,
          shop_storage: r.targetWarehouse === 'shop_storage' ? r.qty : 0,
          central_external: r.targetWarehouse === 'central_external' ? r.qty : 0,
          consignment: r.targetWarehouse === 'consignment' ? r.qty : 0,
          [r.targetWarehouse]: r.qty,
        },
        valuationRate: r.unitPurchasePrice,
        retailPrice: retailRate,
        wholesalePrice: wholesaleRate,
        partnerPrice: wholesaleRate,
        serialNumbers: [],
        batchNo: 'B-1404',
        expiryDate: r.expiryDate,
        nicotine: r.nicotine || undefined,
        puffCount: r.puffCount || undefined,
        color: r.color || undefined,
        resistanceOhm: r.resistanceOhm || undefined,
        liquidVolumeMl: liquidVolNum > 0 ? liquidVolNum : undefined,
        bottleVolumeMl: liquidVolNum > 0 ? liquidVolNum : undefined,
        podTankCapacityMl: podCapNum > 0 ? podCapNum : undefined,
        allowDecantSale: r.allowDecantSale,
        openBottleRemainingMl: 0,
        costPerMl,
        totalInQty: r.qty,
        totalOutQty: 0,
      };
    });

    window.setTimeout(() => {
      onCompleteSkuBreakdown(selectedPurchaseId || null, parsedItems);
      setBreakdownRows(Array.from({ length: 5 }, (_, i) => createEmptyBreakdownRow(i)));
      setExpandedSpecRows({});
      setIsSubmittingBreakdown(false);
    }, 150);
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Polaris Secondary Segmented ButtonGroup */}
      <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <PolarisButtonGroup segmented>
          <PolarisButton
            size="slim"
            primary={activeTab === 'stocktaking'}
            icon={<Package className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('stocktaking')}
          >
            انبارگردانی و ۴ انبار ({items.length} قلم)
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'sku_allocation'}
            icon={<Barcode className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('sku_allocation')}
          >
            پذیرش و برچسب‌گذاری SKU ({pendingBreakdownPurchases.length})
          </PolarisButton>
          <PolarisButton
            size="slim"
            primary={activeTab === 'festivals_bundles'}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            onClick={() => setActiveTab('festivals_bundles')}
          >
            جشنواره و باندل کالا
          </PolarisButton>
        </PolarisButtonGroup>

        <div className="flex items-center gap-2">
          <PolarisButton
            size="slim"
            icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
            onClick={() => setIsTransferCollapsibleOpen((prev) => !prev)}
          >
            {isTransferCollapsibleOpen ? 'بستن انتقال انبار' : '+ انتقال بین ۴ انبار'}
          </PolarisButton>
          <PolarisButton
            size="slim"
            icon={revealCostPrice ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            onClick={() => setRevealCostPrice((prev) => !prev)}
          >
            {revealCostPrice ? 'مخفی کردن بهای تمام‌شده' : 'نمایش بهای تمام‌شده'}
          </PolarisButton>
          <PolarisButton
            size="slim"
            icon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => setIsWarehouseSheetOpen(true)}
          >
            انبار جدید
          </PolarisButton>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: 4 WAREHOUSES INDEXTABLE & STOCKTAKING INDEXTABLE
         ===================================================================== */}
      {activeTab === 'stocktaking' && (
        <div className="space-y-4">
          {/* Polaris Collapsible: Stock Transfer Between 4 Warehouses (Closed by default) */}
          <PolarisCollapsible
            id="wms-transfer-collapsible"
            open={isTransferCollapsibleOpen}
            className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
              <div className="sm:col-span-4">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  کالای مورد انتقال:
                </label>
                <select
                  value={transferSku}
                  onChange={(e) => setTransferSku(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  <option value="">انتخاب کالا...</option>
                  {items.map((i) => (
                    <option key={i.sku} value={i.sku}>
                      {i.name} (کل: {i.stockQty})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  از انبار مبدا:
                </label>
                <select
                  value={transferFromWh}
                  onChange={(e) => setTransferFromWh(e.target.value as WarehouseKey)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  به انبار مقصد:
                </label>
                <select
                  value={transferToWh}
                  onChange={(e) => setTransferToWh(e.target.value as WarehouseKey)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.key}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-1">
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  تعداد:
                </label>
                <input
                  type="number"
                  min={1}
                  value={transferQty}
                  onChange={(e) => setTransferQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-2 py-1.5 font-mono text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>
              <div className="sm:col-span-1">
                <PolarisButton
                  primary
                  fullWidth
                  size="slim"
                  loading={isSubmittingTransfer}
                  disabled={isSubmittingTransfer}
                  onClick={() => {
                    if (!transferSku) {
                      onShowToast('ابتدا کالا را انتخاب کنید.');
                      return;
                    }
                    if (transferFromWh === transferToWh) {
                      onShowToast('انبار مبدا و مقصد نمی‌توانند یکسان باشند.');
                      return;
                    }
                    setIsSubmittingTransfer(true);
                    window.setTimeout(() => {
                      onTransferWarehouseStock?.(
                        transferSku,
                        transferFromWh,
                        transferToWh,
                        transferQty
                      );
                      setIsSubmittingTransfer(false);
                      setIsTransferCollapsibleOpen(false);
                    }, 120);
                  }}
                >
                  انتقال
                </PolarisButton>
              </div>
            </div>
          </PolarisCollapsible>

          {/* Compact Polaris IndexTable: 4 Warehouses Summary */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                <span>جدول فشرده ۴ انبار سیستم (کلیک روی ردیف = فیلتر موجودی همان انبار)</span>
              </span>
              {selectedWarehouseFilter !== 'all' && (
                <PolarisButton
                  size="slim"
                  plain
                  onClick={() => setSelectedWarehouseFilter('all')}
                >
                  نمایش همه انبارها
                </PolarisButton>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">کد حساب</th>
                    <th className="py-2 px-3">نام انبار</th>
                    <th className="py-2 px-3">موقعیت / کاربری</th>
                    <th className="py-2 px-3">تعداد موجودی (عدد)</th>
                    <th className="py-2 px-3 text-left">ارزش ریالی موجودی</th>
                    <th className="py-2 px-3 text-center">فیلتر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {warehouses.map((wh) => {
                    const whQty = items.reduce((sum, item) => {
                      const whMap = item.warehouseStock || { central_external: item.stockQty };
                      return sum + (whMap[wh.key] || 0);
                    }, 0);
                    const whValue = items.reduce((sum, item) => {
                      const whMap = item.warehouseStock || { central_external: item.stockQty };
                      return sum + (whMap[wh.key] || 0) * item.valuationRate;
                    }, 0);
                    const isSelected = selectedWarehouseFilter === wh.key;

                    return (
                      <tr
                        key={wh.id}
                        className={
                          isSelected
                            ? 'bg-indigo-50/70 dark:bg-indigo-950/30 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }
                      >
                        <td className="py-2 px-3 font-mono tabular-nums">{wh.accountCode}</td>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                          {wh.name}
                        </td>
                        <td className="py-2 px-3 text-slate-500">{wh.description}</td>
                        <td className="py-2 px-3 font-mono font-bold tabular-nums">
                          {whQty} عدد
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-left tabular-nums">
                          {revealCostPrice && !privacyMasked
                            ? `${formatCurrency(whValue)} تومان`
                            : '****'}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <PolarisButton
                            size="slim"
                            primary={isSelected}
                            onClick={() =>
                              setSelectedWarehouseFilter(isSelected ? 'all' : wh.key)
                            }
                          >
                            {isSelected ? 'فیلتر فعال' : 'انتخاب'}
                          </PolarisButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Main Stocktaking Polaris IndexTable */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجوی کالا بر اساس نام، طعم، کد SKU یا نیکوتین..."
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg"
                />
              </div>

              <PolarisButtonGroup segmented>
                {[
                  { id: 'all' as const, label: 'همه اصناف' },
                  { id: 'vape' as const, label: 'ویپ‌شاپ (میانگین موزون)' },
                  { id: 'pc' as const, label: 'قطعات کامپیوتر (FIFO)' },
                ].map((sec) => (
                  <PolarisButton
                    key={sec.id}
                    size="slim"
                    primary={selectedSectorFilter === sec.id}
                    onClick={() => setSelectedSectorFilter(sec.id)}
                  >
                    {sec.label}
                  </PolarisButton>
                ))}
              </PolarisButtonGroup>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden max-h-[480px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 z-10">
                  <tr>
                    <th className="py-2 px-3">کد SKU</th>
                    <th className="py-2 px-3">نام کالا و مشخصات فنی</th>
                    <th className="py-2 px-3">وضعیت</th>
                    <th className="py-2 px-3">موجودی به تفکیک ۴ انبار</th>
                    <th className="py-2 px-3">انقضا</th>
                    <th className="py-2 px-3 text-left">بهای تمام‌شده</th>
                    <th className="py-2 px-3 text-center">ورود</th>
                    <th className="py-2 px-3 text-center">خروج</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStockItems.map((item) => {
                    const whMap = item.warehouseStock || { central_external: item.stockQty };
                    const inQty = item.totalInQty ?? item.stockQty;
                    const outQty = item.totalOutQty ?? 0;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {item.sku}
                        </td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {item.category}
                            {item.nicotine ? ` · ${item.nicotine}` : ''}
                            {item.liquidVolumeMl ? ` · ${item.liquidVolumeMl}ml` : ''}
                            {item.resistanceOhm ? ` · ${item.resistanceOhm}` : ''}
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {item.condition || 'آکبند'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          <span className="font-bold text-slate-900 dark:text-slate-100 ml-2">
                            کل: {item.stockQty}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            (ویترین: {whMap.vitrine || 0} · مغازه: {whMap.shop_storage || 0} · مرکزی:{' '}
                            {whMap.central_external || 0} · امانی: {whMap.consignment || 0})
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {item.expiryDate || '—'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-left font-bold whitespace-nowrap">
                          {revealCostPrice && !privacyMasked
                            ? `${formatCurrency(item.valuationRate)} ت`
                            : '****'}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-center text-emerald-700 font-semibold">
                          {inQty}
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums text-center text-rose-600 font-semibold">
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

      {/* =====================================================================
          TAB 2: STAGE-2 SKU ACCEPTANCE & LABELING (Polaris IndexTable + Row-Level Collapsible for 11 Specs)
         ===================================================================== */}
      {activeTab === 'sku_allocation' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                جدول فشرده «پذیرش و برچسب‌گذاری SKU» (۱۱ فیلد مشخصات فنی به صورت پیش‌فرض بسته و بازشونده با دکمه +)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                با اسکن بارکد در ستون «کد SKU» (Enter)، فوکوس به ردیف بعدی می‌پرد. برای ثبت ۱۱ فیلد مشخصات فنی هر ردیف، روی دکمه (+) در همان سطر کلیک کنید.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs shrink-0">
              <select
                value={selectedPurchaseId}
                onChange={(e) => setSelectedPurchaseId(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              >
                <option value="">ثبت مستقیم SKU بدون عطف به فاکتور خرید</option>
                {pendingBreakdownPurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    فاکتور خرید {p.billNo} — {p.itemsSummary} ({formatCurrency(p.totalAmount)} ت)
                  </option>
                ))}
              </select>
              <PolarisButton
                size="slim"
                icon={<Plus className="w-3.5 h-3.5" />}
                onClick={() =>
                  setBreakdownRows((prev) => [
                    ...prev,
                    createEmptyBreakdownRow(prev.length),
                  ])
                }
              >
                ردیف اسکن جدید
              </PolarisButton>
            </div>
          </div>

          {/* Polaris IndexTable for SKU Breakdown Rows + Row-Level Collapsible */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-2.5 font-semibold w-10">#</th>
                    <th className="py-2 px-2.5 font-semibold">۱. کد SKU (Enter = بعدی) *</th>
                    <th className="py-2 px-2.5 font-semibold">۲. نام کامل کالا و طعم *</th>
                    <th className="py-2 px-2.5 font-semibold w-24">تعداد</th>
                    <th className="py-2 px-2.5 font-semibold">انبار مقصد</th>
                    <th className="py-2 px-2.5 font-semibold">قیمت خرید واحد</th>
                    <th className="py-2 px-2.5 font-semibold">قیمت فروش</th>
                    <th className="py-2 px-2.5 font-semibold">قیمت همکاری</th>
                    <th className="py-2 px-2.5 font-semibold text-center">
                      مشخصات فنی (۱۱ فیلد)
                    </th>
                    <th className="py-2 px-2.5 font-semibold text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {breakdownRows.map((row, rowIdx) => {
                    const isExpanded = Boolean(expandedSpecRows[row.rowId]);
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
                      <React.Fragment key={row.rowId}>
                        <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-2.5 font-mono font-bold text-slate-500">
                            {rowIdx + 1}
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              ref={(el) => {
                                skuInputRefs.current[rowIdx] = el;
                              }}
                              type="text"
                              placeholder="اسکن بارکد SKU..."
                              value={row.sku}
                              onChange={(e) => updateBreakdownRow(rowIdx, 'sku', e.target.value)}
                              onKeyDown={(e) => handleSkuInputKeyDown(e, rowIdx)}
                              className="w-36 px-2.5 py-1 font-mono font-bold bg-white dark:bg-slate-900 border border-indigo-400 dark:border-indigo-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="text"
                              placeholder="مثلاً سالت نستی انبه یخ"
                              value={row.name}
                              onChange={(e) => updateBreakdownRow(rowIdx, 'name', e.target.value)}
                              className="w-48 px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <input
                              type="number"
                              min={1}
                              value={row.qty}
                              onChange={(e) =>
                                updateBreakdownRow(
                                  rowIdx,
                                  'qty',
                                  Math.max(1, Number(e.target.value) || 1)
                                )
                              }
                              className="w-16 px-2 py-1 font-mono text-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-2.5">
                            <select
                              value={row.targetWarehouse}
                              onChange={(e) =>
                                updateBreakdownRow(rowIdx, 'targetWarehouse', e.target.value)
                              }
                              className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                            >
                              {warehouses.map((w) => (
                                <option key={w.id} value={w.key}>
                                  {w.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2.5">
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
                              placeholder="خرید"
                              className="w-28 px-2 py-1 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-2.5">
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
                              placeholder="فروش"
                              className="w-28 px-2 py-1 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-2.5">
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
                              placeholder="همکار"
                              className="w-28 px-2 py-1 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg tabular-nums"
                            />
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            <PolarisButton
                              size="slim"
                              primary={isExpanded}
                              icon={<Plus className="w-3.5 h-3.5" />}
                              onClick={() => toggleSpecRow(row.rowId)}
                            >
                              {isExpanded ? 'بستن مشخصات' : 'مشخصات فنی'}
                            </PolarisButton>
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            {breakdownRows.length > 1 && (
                              <PolarisButton
                                size="slim"
                                destructive
                                outline
                                icon={<Trash2 className="w-3 h-3" />}
                                onClick={() =>
                                  setBreakdownRows((prev) =>
                                    prev.filter((_, idx) => idx !== rowIdx)
                                  )
                                }
                              >
                                حذف
                              </PolarisButton>
                            )}
                          </td>
                        </tr>

                        {/* Row-Level Polaris Collapsible: 11 Supplementary Technical Specs (Closed by default!) */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 dark:bg-slate-800/60">
                            <td colSpan={10} className="p-3.5 border-b border-slate-200 dark:border-slate-700">
                              <PolarisCollapsible
                                id={`sku-spec-collapsible-${row.rowId}`}
                                open={isExpanded}
                                className="space-y-3"
                              >
                                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                                  <span className="font-bold text-indigo-700 dark:text-indigo-400">
                                    ۱۱ فیلد مشخصات فنی تکمیلی برای ردیف #{rowIdx + 1} ({row.name || 'بدون نام'})
                                  </span>
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-sky-800 dark:text-sky-300 font-semibold">
                                    <input
                                      type="checkbox"
                                      checked={row.allowDecantSale}
                                      disabled={!isLiquidType}
                                      onChange={(e) =>
                                        updateBreakdownRow(
                                          rowIdx,
                                          'allowDecantSale',
                                          e.target.checked
                                        )
                                      }
                                      className="rounded border-slate-300"
                                    />
                                    <Droplets className="w-3.5 h-3.5" />
                                    <span>۱۱. قابلیت فروش باز میلی‌لیتری (Decant)</span>
                                  </label>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                  <CreatableCombobox
                                    label="۱. تگ مادر / پیشوند"
                                    value={row.parentTag}
                                    onChange={(val) => updateBreakdownRow(rowIdx, 'parentTag', val)}
                                    options={masterOptions.tags}
                                    onAddNewOption={(opt) => onAddMasterOption('tags', opt)}
                                  />
                                  <CreatableCombobox
                                    label="۲. نوع کالا (تعیین‌کننده صنف)"
                                    value={row.itemType}
                                    onChange={(val) => updateBreakdownRow(rowIdx, 'itemType', val)}
                                    options={masterOptions.itemTypes}
                                    onAddNewOption={(opt) => onAddMasterOption('itemTypes', opt)}
                                  />
                                  <CreatableCombobox
                                    label="۳. وضعیت کالا (آکبند / استوک)"
                                    value={row.condition}
                                    onChange={(val) => updateBreakdownRow(rowIdx, 'condition', val)}
                                    options={masterOptions.conditions}
                                    onAddNewOption={(opt) => onAddMasterOption('conditions', opt)}
                                  />
                                  <CreatableCombobox
                                    label="۴. میزان نیکوتین"
                                    value={row.nicotine}
                                    onChange={(val) => updateBreakdownRow(rowIdx, 'nicotine', val)}
                                    options={masterOptions.nicotines}
                                    onAddNewOption={(opt) => onAddMasterOption('nicotines', opt)}
                                  />
                                  <CreatableCombobox
                                    label="۵. تعداد پاف (Puff)"
                                    value={row.puffCount}
                                    onChange={(val) => updateBreakdownRow(rowIdx, 'puffCount', val)}
                                    options={masterOptions.puffs}
                                    onAddNewOption={(opt) => onAddMasterOption('puffs', opt)}
                                  />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                  <CreatableCombobox
                                    label="۶. رنگ"
                                    value={row.color}
                                    onChange={(val) => updateBreakdownRow(rowIdx, 'color', val)}
                                    options={masterOptions.colors}
                                    onAddNewOption={(opt) => onAddMasterOption('colors', opt)}
                                  />
                                  <CreatableCombobox
                                    label="۷. مقاومت / اهم (Ω)"
                                    value={row.resistanceOhm}
                                    onChange={(val) =>
                                      updateBreakdownRow(rowIdx, 'resistanceOhm', val)
                                    }
                                    options={masterOptions.resistances}
                                    onAddNewOption={(opt) => onAddMasterOption('resistances', opt)}
                                  />
                                  <CreatableCombobox
                                    label="۸. حجم مایع / بطری (ml)"
                                    value={row.liquidVolumeMl}
                                    disabled={!isLiquidType && isHardwarePodType}
                                    onChange={(val) =>
                                      updateBreakdownRow(rowIdx, 'liquidVolumeMl', val)
                                    }
                                    options={masterOptions.liquidVolumes}
                                    onAddNewOption={(opt) =>
                                      onAddMasterOption('liquidVolumes', opt)
                                    }
                                  />
                                  <CreatableCombobox
                                    label="۹. ظرفیت تانک / کارتریج (ml)"
                                    value={row.podTankCapacityMl}
                                    disabled={isLiquidType}
                                    onChange={(val) =>
                                      updateBreakdownRow(rowIdx, 'podTankCapacityMl', val)
                                    }
                                    options={masterOptions.podCapacities}
                                    onAddNewOption={(opt) =>
                                      onAddMasterOption('podCapacities', opt)
                                    }
                                  />
                                  <div>
                                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                                      ۱۰. تاریخ انقضا
                                    </label>
                                    <input
                                      type="text"
                                      value={row.expiryDate}
                                      onChange={(e) =>
                                        updateBreakdownRow(rowIdx, 'expiryDate', e.target.value)
                                      }
                                      className="w-full px-3 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                                    />
                                  </div>
                                </div>
                              </PolarisCollapsible>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end">
            <PolarisButton
              primary
              size="large"
              loading={isSubmittingBreakdown}
              disabled={isSubmittingBreakdown}
              icon={<CheckCircle2 className="w-4 h-4" />}
              onClick={handleCommitSkuBreakdown}
            >
              ثبت نهایی برچسب‌گذاری SKU و انتقال به موجودی انبار
            </PolarisButton>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: FESTIVALS & BUNDLES (Polaris IndexTable + Sheet/Collapsible)
         ===================================================================== */}
      {activeTab === 'festivals_bundles' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  جدول قوانین جشنواره و تخفیف‌های هوشمند ({promotionRules.length} قانون)
                </h3>
                <p className="text-xs text-slate-500">
                  برای تعریف جشنواره یا ساخت باندل جدید از دکمه‌های (+) استفاده کنید.
                </p>
              </div>
              <PolarisButtonGroup>
                <PolarisButton
                  size="slim"
                  icon={<Boxes className="w-3.5 h-3.5" />}
                  onClick={() => setIsBundleCollapsibleOpen((prev) => !prev)}
                >
                  {isBundleCollapsibleOpen ? 'بستن باندل‌ساز' : '+ ساخت باندل کالا'}
                </PolarisButton>
                <PolarisButton
                  size="slim"
                  primary
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={() => setIsPromoSheetOpen(true)}
                >
                  جشنواره جدید
                </PolarisButton>
              </PolarisButtonGroup>
            </div>

            {/* Polaris Collapsible: Bundle Builder (Closed by default) */}
            <PolarisCollapsible
              id="wms-bundle-collapsible"
              open={isBundleCollapsibleOpen}
              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!bundleSku.trim() || !bundleName.trim() || bundlePrice <= 0) {
                    onShowToast('کد SKU، نام باندل و قیمت فروش پکیج الزامی است.');
                    return;
                  }
                  if (!bundleComp1Sku || !bundleComp2Sku) {
                    onShowToast('حداقل دو کالای تشکیل‌دهنده باندل را انتخاب کنید.');
                    return;
                  }
                  setIsSubmittingBundle(true);
                  const comp1 = items.find((i) => i.sku === bundleComp1Sku);
                  const comp2 = items.find((i) => i.sku === bundleComp2Sku);
                  const totalCost =
                    (comp1?.valuationRate || 0) * bundleComp1Qty +
                    (comp2?.valuationRate || 0) * bundleComp2Qty;

                  const newBundle: InventoryItemRecord = {
                    id: `bnd-${Date.now()}`,
                    sku: bundleSku.trim().toUpperCase(),
                    name: bundleName.trim(),
                    category: 'پکیج باندل',
                    brand: 'کلودی شاپ',
                    sector: 'vape',
                    condition: 'آکبند',
                    uomPrimary: 'عدد',
                    stockQty: Math.min(comp1?.stockQty || 5, comp2?.stockQty || 5),
                    reservedQty: 0,
                    reorderLevel: 2,
                    warehouseStock: {
                      vitrine: Math.min(comp1?.stockQty || 5, comp2?.stockQty || 5),
                    },
                    valuationRate: totalCost,
                    retailPrice: bundlePrice,
                    wholesalePrice: Math.round(bundlePrice * 0.9),
                    partnerPrice: Math.round(bundlePrice * 0.9),
                    serialNumbers: [],
                    batchNo: 'BND-1404',
                    expiryDate: '—',
                    isBundle: true,
                    bundleComponents: [bundleComp1Sku, bundleComp2Sku],
                    bundleComponentItems: [
                      {
                        sku: bundleComp1Sku,
                        name: comp1?.name || bundleComp1Sku,
                        qty: bundleComp1Qty,
                      },
                      {
                        sku: bundleComp2Sku,
                        name: comp2?.name || bundleComp2Sku,
                        qty: bundleComp2Qty,
                      },
                    ],
                  };
                  window.setTimeout(() => {
                    onCreateBundleItem(newBundle);
                    setIsSubmittingBundle(false);
                    setIsBundleCollapsibleOpen(false);
                    setBundleSku('');
                    setBundleName('');
                    setBundlePrice(0);
                  }, 120);
                }}
                className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end text-xs"
              >
                <div>
                  <label className="block font-medium mb-1">کد SKU باندل *</label>
                  <input
                    type="text"
                    value={bundleSku}
                    onChange={(e) => setBundleSku(e.target.value)}
                    placeholder="BUNDLE-STARTER-01"
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">نام پکیج باندل *</label>
                  <input
                    type="text"
                    value={bundleName}
                    onChange={(e) => setBundleName(e.target.value)}
                    placeholder="پکیج پاد + سالت"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">قیمت فروش باندل *</label>
                  <input
                    type="number"
                    min={0}
                    value={bundlePrice || ''}
                    onChange={(e) => setBundlePrice(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">کالای اول باندل</label>
                  <select
                    value={bundleComp1Sku}
                    onChange={(e) => setBundleComp1Sku(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  >
                    <option value="">انتخاب کالای ۱...</option>
                    {items.map((i) => (
                      <option key={i.sku} value={i.sku}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">کالای دوم باندل</label>
                  <select
                    value={bundleComp2Sku}
                    onChange={(e) => setBundleComp2Sku(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 rounded-lg"
                  >
                    <option value="">انتخاب کالای ۲...</option>
                    {items.map((i) => (
                      <option key={i.sku} value={i.sku}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <PolarisButton
                    type="submit"
                    primary
                    fullWidth
                    size="slim"
                    loading={isSubmittingBundle}
                    disabled={isSubmittingBundle}
                  >
                    ثبت پکیج باندل
                  </PolarisButton>
                </div>
              </form>
            </PolarisCollapsible>

            {/* Promotion Rules Polaris IndexTable */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2 px-3">نام جشنواره</th>
                    <th className="py-2 px-3">نوع جشنواره</th>
                    <th className="py-2 px-3">مقدار تخفیف</th>
                    <th className="py-2 px-3">جامعه هدف</th>
                    <th className="py-2 px-3">بازه زمانی</th>
                    <th className="py-2 px-3 text-center">وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {promotionRules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">
                        {rule.name}
                      </td>
                      <td className="py-2 px-3">{rule.festivalType}</td>
                      <td className="py-2 px-3 font-mono font-bold tabular-nums">
                        {rule.discountType === 'percent'
                          ? `${rule.discountValue}%`
                          : `${formatCurrency(rule.discountValue)} ت`}
                      </td>
                      <td className="py-2 px-3">{rule.targetGroup}</td>
                      <td className="py-2 px-3 font-mono tabular-nums text-slate-500">
                        {rule.startDate} تا {rule.endDate}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <PolarisButton
                          size="slim"
                          primary={rule.isActive}
                          onClick={() => onTogglePromotionRule(rule.id)}
                        >
                          {rule.isActive ? 'فعال در صندوق' : 'غیرفعال'}
                        </PolarisButton>
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
          POLARIS SHEET: ADD NEW WAREHOUSE (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isWarehouseSheetOpen}
        onClose={() => setIsWarehouseSheetOpen(false)}
        title="افزودن انبار جدید به سیستم"
        footer={
          <>
            <PolarisButton onClick={() => setIsWarehouseSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSavingWarehouse}
              disabled={isSavingWarehouse}
              onClick={handleAddWarehouseSubmit}
            >
              ذخیره انبار جدید
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3.5">
          <div>
            <label className="block font-semibold mb-1">نام انبار جدید *</label>
            <input
              type="text"
              autoFocus
              value={newWhName}
              onChange={(e) => setNewWhName(e.target.value)}
              placeholder="مثلاً انبار قرنطینه و مرجوعی..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">موقعیت فیزیکی</label>
            <input
              type="text"
              value={newWhLocation}
              onChange={(e) => setNewWhLocation(e.target.value)}
              placeholder="فروشگاه مرکزی کلودی شاپ"
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">توضیح و کاربری انبار</label>
            <input
              type="text"
              value={newWhDesc}
              onChange={(e) => setNewWhDesc(e.target.value)}
              placeholder="توضیحات..."
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
        </div>
      </PolarisSheet>

      {/* =====================================================================
          POLARIS SHEET: ADD NEW PROMOTION RULE (Closed by default, opens via +)
         ===================================================================== */}
      <PolarisSheet
        open={isPromoSheetOpen}
        onClose={() => setIsPromoSheetOpen(false)}
        title="تعریف قانون جشنواره و تخفیف جدید"
        footer={
          <>
            <PolarisButton onClick={() => setIsPromoSheetOpen(false)}>انصراف</PolarisButton>
            <PolarisButton
              primary
              loading={isSubmittingPromo}
              disabled={isSubmittingPromo}
              onClick={() => {
                if (!promoName.trim() || isSubmittingPromo) return;
                setIsSubmittingPromo(true);
                window.setTimeout(() => {
                  onAddPromotionRule({
                    id: `promo-${Date.now()}`,
                    name: promoName.trim(),
                    festivalType: promoType,
                    discountType: promoDiscType,
                    discountValue: Math.max(0, Number(promoDiscVal) || 0),
                    minQty: Math.max(1, Number(promoMinQty) || 1),
                    targetGroup: promoTarget,
                    startDate: promoStart,
                    endDate: promoEnd,
                    paymentModel: promoPayModel,
                    applicableSkus: [],
                    isActive: true,
                  });
                  setPromoName('');
                  setIsSubmittingPromo(false);
                  setIsPromoSheetOpen(false);
                }, 120);
              }}
            >
              ذخیره و فعال‌سازی جشنواره
            </PolarisButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block font-semibold mb-1">عنوان جشنواره *</label>
            <input
              type="text"
              value={promoName}
              onChange={(e) => setPromoName(e.target.value)}
              placeholder="مثلاً جشنواره یلدا کلودی شاپ"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">نوع جشنواره</label>
            <select
              value={promoType}
              onChange={(e) =>
                setPromoType(e.target.value as PromotionRuleRecord['festivalType'])
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
            >
              <option value="خرید بالای X قلم">خرید بالای X قلم</option>
              <option value="تخفیف خرید اول">تخفیف خرید اول</option>
              <option value="تخفیف مناسبتی">تخفیف مناسبتی</option>
              <option value="حراج رسوب انبار">حراج رسوب انبار</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-semibold mb-1">مدل تخفیف</label>
              <select
                value={promoDiscType}
                onChange={(e) => setPromoDiscType(e.target.value as 'percent' | 'fixed')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="percent">درصدی (%)</option>
                <option value="fixed">مبلغ ثابت (تومان)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">مقدار تخفیف</label>
              <input
                type="number"
                min={0}
                value={promoDiscVal}
                onChange={(e) => setPromoDiscVal(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
          </div>
        </div>
      </PolarisSheet>
    </div>
  );
};
