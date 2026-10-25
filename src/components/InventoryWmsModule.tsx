import React, { useState } from 'react';
import {
  Package,
  Layers,
  ArrowLeftRight,
  ClipboardCheck,
  ShoppingCart,
  Plus,
} from 'lucide-react';
import { InventoryItemRecord } from '../data/erpSeedData';
import {
  formatCurrency,
  getPersianYear,
  allocateLandedCost,
  calculateStockReconciliation,
  generateItemVariants,
  SystemRole,
  checkRolePermission,
} from '../utils/erpEngine';

interface InventoryWmsModuleProps {
  productionMode: boolean;
  activeRole: SystemRole;
  items: InventoryItemRecord[];
  onUpdateItemStock: (sku: string, newPhysicalQty: number, varianceValue: number) => string;
  onAddGeneratedVariants: (newItems: InventoryItemRecord[]) => void;
  onShowToast: (msg: string) => void;
}

export const InventoryWmsModule: React.FC<InventoryWmsModuleProps> = ({
  productionMode,
  activeRole,
  items,
  onUpdateItemStock,
  onAddGeneratedVariants,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<
    'items' | 'variants' | 'movements' | 'reconciliation' | 'material_request'
  >('items');

  // Valuation Method Toggle (Moving Average / FIFO)
  const [valuationMethod, setValuationMethod] = useState<'میانگین موزون متحرک' | 'اولین صادره از اولین وارده (فایفو)'>(
    'میانگین موزون متحرک'
  );

  // Variant Generator State
  const [templateName, setTemplateName] = useState('');
  const [templateSku, setTemplateSku] = useState('');
  const [flavorsInput, setFlavorsInput] = useState('');
  const [nicotinesInput, setNicotinesInput] = useState('');

  // Stock Movement & Purchase Receipt State (No Delivery Note, No QC)

  // Landed Cost Calculator State
  const [customsCost, setCustomsCost] = useState(0);
  const [freightCost, setFreightCost] = useState(0);
  const [insuranceCost, setInsuranceCost] = useState(0);
  const [landedBasis, setLandedBasis] = useState<'amount' | 'qty' | 'weight'>('amount');

  // Stock Reconciliation State
  const [reconSku, setReconSku] = useState(items[1]?.sku || '');
  const [physicalCountInput, setPhysicalCountInput] = useState(0);

  // Material Request State (Merged from Module 5: Buying & Procurement)
  const [materialRequests, setMaterialRequests] = useState<Array<{
    id: string;
    reqNo: string;
    sku: string;
    itemName: string;
    currentStock: number;
    reorderPoint: number;
    suggestedOrderQty: number;
    warehouse: string;
    triggerType: string;
    status: string;
  }>>([]);
  const [newMrSku, setNewMrSku] = useState(items[0]?.sku || '');
  const [newMrQty, setNewMrQty] = useState(0);
  const [newMrWarehouse, setNewMrWarehouse] = useState('');

  const totalExtraLanded = customsCost + freightCost + insuranceCost;
  const landedOutput = allocateLandedCost([], totalExtraLanded, landedBasis);

  const selectedReconItem = items.find((i) => i.sku === reconSku) || items[0];
  if (!selectedReconItem) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        هنوز کالایی برای نمایش و عملیات انبارداری ثبت نشده است.
      </div>
    );
  }
  const reconResult = calculateStockReconciliation(
    selectedReconItem.stockQty,
    physicalCountInput,
    selectedReconItem.valuationRate,
    selectedReconItem.reorderLevel
  );

  const previewVariants = generateItemVariants(
    templateName,
    templateSku,
    flavorsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    nicotinesInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            انبارداری، کنترل موجودی و شارژ کالا
          </h2>
          <p className="text-sm text-slate-500">
            مدیریت کالاها، باندل محصول، تنوع و قیمت‌گذاری، اسناد حرکت انبار، کاردکس و نقطه سفارش
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl">
        {[
          { id: 'items', label: 'کالاها، باندل و سریال', icon: Package },
          { id: 'variants', label: 'تنوع کالا و قیمت‌گذاری', icon: Layers },
          { id: 'movements', label: 'اسناد حرکت و رسید انبار', icon: ArrowLeftRight },
          { id: 'reconciliation', label: 'انبارگردانی و کاردکس', icon: ClipboardCheck },
          { id: 'material_request', label: 'درخواست شارژ کالا', icon: ShoppingCart },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as typeof activeTab)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === t.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: ITEMS, BUNDLES, SERIAL & BATCH, VALUATION */}
      {activeTab === 'items' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                فهرست کالاها، پکیج باندل و ردیابی سریال
              </h3>
              <p className="text-xs text-slate-500">
                ارزش‌گذاری موجودی بر اساس «{valuationMethod}» و پایش نقطه سفارش
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs w-full sm:w-auto">
              {(['میانگین موزون متحرک', 'اولین صادره از اولین وارده (فایفو)'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setValuationMethod(m)}
                  className={`w-full sm:w-auto px-3 py-1.5 rounded-md font-semibold transition-colors text-right sm:text-center whitespace-normal sm:whitespace-nowrap ${
                    valuationMethod === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  روش ارزش‌گذاری: {m}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-3">کد کالا · سری ساخت (بچ)</th>
                  <th className="py-2.5 px-3">نام کالا / کیت و باندل محصول</th>
                  <th className="py-2.5 px-3">واحد شمارش</th>
                  <th className="py-2.5 px-3">شماره سریال‌ها و تاریخ انقضا</th>
                  <th className="py-2.5 px-3">موجودی (آزاد / رزرو)</th>
                  <th className="py-2.5 px-3 text-left">بهای تمام‌شده واحد</th>
                  <th className="py-2.5 px-3 text-left">قیمت فروش تکی</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const lowStock = item.stockQty <= item.reorderLevel;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono">
                        <div className="font-semibold text-slate-900">{item.sku}</div>
                        <div className="text-slate-500">بچ: {item.batchNo}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${item.isActive === false ? 'text-slate-500' : 'text-slate-900'}`}>
                            {item.name}
                          </span>
                          {item.isActive === false && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                              غیرفعال برای فروش
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          <span>{item.category}</span>
                          {item.flavor && (
                            <>
                              <span className="mx-1" aria-hidden="true">·</span>
                              <span>طعم: {item.flavor}</span>
                            </>
                          )}
                          {item.isBundle && item.bundleComponents && (
                            <div className="text-indigo-700 font-medium mt-0.5">
                              اجزای باندل (کسر خودکار از انبار هنگام فروش): {item.bundleComponents.join(' + ')}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        {item.uomPrimary}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div className="font-mono text-[11px]">
                          {item.serialNumbers.slice(0, 2).join(', ')}
                        </div>
                        <div className="text-slate-500">انقضا: {item.expiryDate}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div
                          className={`font-mono font-bold ${
                            lowStock ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {item.stockQty} {item.uomPrimary} {lowStock && '(نیاز به شارژ!)'}
                        </div>
                        <div className="text-slate-500">
                          رزرو سفارش: {item.reservedQty} · نقطه سفارش: {item.reorderLevel}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-slate-700">
                        {checkRolePermission(activeRole, 'view_buying_cost')
                          ? `${formatCurrency(item.valuationRate)} ت`
                          : '🔒 مخفی'}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-left text-slate-900">
                        {formatCurrency(item.retailPrice)} ت
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ITEM VARIANTS & DYNAMIC PRICING RULES */}
      {activeTab === 'variants' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                تولید خودکار زیرکالاها از کالای مادر بر اساس ماتریس ویژگی‌ها
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تعریف یک کالای مادر و تولید خودکار زیرکالاها بر اساس ویژگی‌ها (رنگ، سایز، طعم یا میزان نیکوتین)
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">نام کالای مادر</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">پیشوند کد کالا</label>
                <input
                  type="text"
                  value={templateSku}
                  onChange={(e) => setTemplateSku(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">ویژگی طعم‌ها / رنگ (با ویرگول)</label>
                <input
                  type="text"
                  value={flavorsInput}
                  onChange={(e) => setFlavorsInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">ویژگی دوم (میزان نیکوتین / سایز)</label>
                <input
                  type="text"
                  value={nicotinesInput}
                  onChange={(e) => setNicotinesInput(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  پیش‌نمایش {previewVariants.length} زیرکالای تولیدشده:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const knownSkus = new Set(items.map((item) => item.sku));
                    const availableVariants = previewVariants.filter((variant) => {
                      if (knownSkus.has(variant.sku)) return false;
                      knownSkus.add(variant.sku);
                      return true;
                    });

                    if (availableVariants.length === 0) {
                      onShowToast('همه زیرکالاهای این ماتریس قبلاً در انبار ثبت شده‌اند.');
                      return;
                    }

                    const created: InventoryItemRecord[] = availableVariants.map((v, i) => ({
                      id: `var-${Date.now()}-${i}`,
                      sku: v.sku,
                      name: v.variantName,
                      category: 'دستگاه پاد و ماد',
                      brand: '',
                      flavor: v.flavor,
                      nicotine: v.nicotine,
                      uomPrimary: 'عدد',
                      stockQty: 0,
                      reservedQty: 0,
                      reorderLevel: 0,
                      valuationRate: 0,
                      retailPrice: 0,
                      wholesalePrice: 0,
                      partnerPrice: 0,
                      serialNumbers: [],
                      batchNo: '',
                      expiryDate: '',
                      daysInStock: 0,
                    }));
                    onAddGeneratedVariants(created);
                    const skippedCount = previewVariants.length - created.length;
                    onShowToast(
                      skippedCount > 0
                        ? `${created.length} زیرکالا اضافه شد؛ ${skippedCount} زیرکالای تکراری نادیده گرفته شد.`
                        : `${created.length} زیرکالای جدید با موفقیت به انبار اضافه شدند.`
                    );
                  }}
                  className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  + ثبت و افزودن تمامی زیرکالاها به انبار
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
                {previewVariants.map((v) => (
                  <div key={v.sku} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="font-mono font-semibold text-indigo-700">{v.sku}</div>
                    <div className="font-bold text-slate-900 mt-0.5">{v.variantName}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Dynamic Pricing & Discount Rules */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                قیمت‌گذاری پویا و قوانین تخفیف پلکانی کالاها
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تعریف قیمت‌های متفاوت برای خرید تکی، عمده و همکاری، و اعمال خودکار تخفیف‌های حجمی و فصلی
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">قانون ۱: تخفیف پلکانی خرید حجمی</div>
                <div className="text-slate-600">خرید ۵ تا ۲۰ عدد از یک کالا ⬅ ۵٪ تخفیف خودکار</div>
                <div className="text-indigo-700 font-medium">خرید بالای ۲۰ کارتن ⬅ قیمت عمده ویژه (-۱۸٪)</div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">قانون ۲: اشانتیون خودکار باندل</div>
                <div className="text-slate-600">خرید حداقل ۳ دستگاه پاد هوشمند ⬅ ۱ عدد بند گردنی رایگان</div>
                <div className="text-emerald-700 font-medium">وضعیت: فعال در صندوق و فاکتور فروش</div>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">قانون ۳: لیست قیمت اختصاصی همکاران</div>
                <div className="text-slate-600">اعمال خودکار نرخ همکار (-۱۲٪) برای مشتریان گروه پخش</div>
                <div className="text-emerald-700 font-medium">وضعیت: فعال روی تمامی کالاها</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STOCK MOVEMENTS, PURCHASE RECEIPT & LANDED COST */}
      {activeTab === 'movements' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  اسناد حرکت انبار و رسید ورود کالا به انبار
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  ثبت انتقال بین انبارها، مصرف داخلی و رسید تحویل فیزیکی بار از تامین‌کننده پیش از صدور فاکتور مالی
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              هنوز سند حرکت یا رسید واقعی برای نمایش ثبت نشده است.
            </div>
          </div>

          {/* Landed Cost Voucher */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-5">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                سرشکن کردن هزینه‌های جانبی خرید روی بهای تمام‌شده کالا
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تقسیم خودکار هزینه گمرک، باربری و بیمه روی کالاهای ورودی به انبار بر اساس مبلغ، تعداد یا وزن
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">هزینه گمرک و ترخیص (تومان)</label>
                <input
                  type="number"
                  value={customsCost}
                  onChange={(e) => setCustomsCost(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">هزینه حمل و باربری (تومان)</label>
                <input
                  type="number"
                  value={freightCost}
                  onChange={(e) => setFreightCost(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">هزینه بیمه باربری (تومان)</label>
                <input
                  type="number"
                  value={insuranceCost}
                  onChange={(e) => setInsuranceCost(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">مبنای تسهیم هزینه</label>
                <select
                  aria-label="مبنای تسهیم هزینه جانبی"
                  value={landedBasis}
                  onChange={(e) => setLandedBasis(e.target.value as 'amount' | 'qty' | 'weight')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  <option value="amount">بر اساس مبلغ کالا</option>
                  <option value="qty">بر اساس تعداد کالا</option>
                  <option value="weight">بر اساس وزن ناخالص (گرم)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">کد و نام کالا</th>
                    <th className="py-2.5 px-3">تعداد · وزن واحد</th>
                    <th className="py-2.5 px-3 text-left">قیمت خرید اولیه (واحد)</th>
                    <th className="py-2.5 px-3 text-left">سهم از هزینه جانبی (کل ردیف)</th>
                    <th className="py-2.5 px-3 text-left">بهای تمام‌شده نهایی هر عدد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {landedOutput.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        برای محاسبه بهای تمام‌شده، ابتدا داده واقعی خرید و اقلام آن لازم است.
                      </td>
                    </tr>
                  )}
                  {landedOutput.map((row) => (
                    <tr key={row.itemCode} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <span className="font-mono text-slate-500 ml-2">{row.itemCode}</span>
                        {row.itemName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {row.qty} عدد · {row.weightGrams} گرم
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left">
                        {formatCurrency(row.unitCost)} ت
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-indigo-700 font-semibold">
                        +{formatCurrency(row.allocatedLandedCost)} ت
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-left text-emerald-700 font-bold">
                        {formatCurrency(row.finalUnitCost)} تومان
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: STOCK RECONCILIATION, STOCK LEDGER (KARDEX) & STOCK AGING */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  انبارگردانی و تعدیل موجودی فیزیکی قفسه‌ها
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  وارد کردن شمارش فیزیکی انبارگردانی و صدور خودکار سند کسری یا اضافات انبار
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">انتخاب کالا جهت شمارش</label>
                  <select
                    aria-label="کالای انبارگردانی"
                    value={reconSku}
                    onChange={(e) => setReconSku(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    {items.map((i) => (
                      <option key={i.id} value={i.sku}>
                        {i.name} (سیستم: {i.stockQty})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">
                    شمارش فیزیکی قفسه
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    aria-label="تعداد شمارش فیزیکی"
                    value={physicalCountInput}
                    onChange={(e) =>
                      setPhysicalCountInput(Math.max(0, Math.trunc(Number(e.target.value) || 0)))
                    }
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">موجودی فعلی سیستم:</span>
                  <span className="font-mono font-bold">{selectedReconItem.stockQty} عدد</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">مغایرت انبارگردانی (کسری / اضافات):</span>
                  <span
                    className={`font-mono font-bold ${
                      reconResult.varianceQty < 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {reconResult.varianceQty > 0 ? `+${reconResult.varianceQty}` : reconResult.varianceQty} عدد
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ارزش ریالی سند تعدیل انبار:</span>
                  <span className="font-mono font-bold">
                    {formatCurrency(reconResult.varianceValue)} تومان
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const voucherNo = onUpdateItemStock(
                    selectedReconItem.sku,
                    physicalCountInput,
                    reconResult.varianceValue
                  );
                  if (reconResult.needsAutoReorder) {
                    setMaterialRequests([
                      {
                        id: `mr-${Date.now()}`,
                        reqNo: `MREQ-${getPersianYear()}-${String(92 + materialRequests.length).padStart(4, '0')}`,
                        sku: selectedReconItem.sku,
                        itemName: selectedReconItem.name,
                        currentStock: physicalCountInput,
                        reorderPoint: selectedReconItem.reorderLevel,
                        suggestedOrderQty: reconResult.suggestedOrderQty,
                        warehouse: newMrWarehouse,
                        triggerType: 'تولید خودکار پس از انبارگردانی',
                        status: 'در انتظار تامین و خرید',
                      },
                      ...materialRequests,
                    ]);
                  }
                  onShowToast(
                    reconResult.varianceQty === 0
                      ? `شمارش کالای ${selectedReconItem.sku} با موجودی سیستم برابر بود؛ سند ${voucherNo} بدون آرتیکل مالی ثبت شد.`
                      : `سند تعدیل ${voucherNo} ثبت شد؛ موجودی کالای ${selectedReconItem.sku} به ${physicalCountInput} عدد رسید و آرتیکل مالی صادر شد.`
                  );
                }}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
              >
                ثبت سند تعدیل انبارگردانی و به‌روزرسانی موجودی
              </button>
            </div>

            {/* Stock Aging Report */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  گزارش سن موجودی و شناسایی کالاهای رسوب‌کرده
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  بررسی مدت ماندگاری کالاها در انبار جهت شناسایی اقلام کم‌گردش یا نزدیک به انقضا
                </p>
              </div>
              <div className="space-y-2.5 text-xs">
                {items.map((it) => {
                  const age = it.daysInStock ?? 0;
                  const slowMoving = age > 60;
                  return (
                    <div
                      key={it.id}
                      className="p-3 rounded-lg border border-slate-200 flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{it.name}</div>
                        <div className="text-slate-500">
                          موجودی: {it.stockQty} {it.uomPrimary} · انقضا: {it.expiryDate}
                        </div>
                      </div>
                      <div className="text-left">
                        <div
                          className={`font-mono font-bold ${
                            slowMoving ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          سن موجودی: {age} روز
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {slowMoving ? 'کم‌گردش / نیازمند پروموشن' : 'گردش سریع و مطلوب'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Item Kardex / Stock Ledger */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              کاردکس کالا (ریز گردش ورود، خروج و مانده لحظه‌ای در انبار)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">تاریخ</th>
                    <th className="py-2.5 px-3">شماره سند مرجع</th>
                    <th className="py-2.5 px-3">نام کالا</th>
                    <th className="py-2.5 px-3">انبار</th>
                    <th className="py-2.5 px-3 text-left">تعداد وارده / صادره</th>
                    <th className="py-2.5 px-3 text-left">مانده پس از تراکنش</th>
                    <th className="py-2.5 px-3 text-left">نرخ میانگین موزون</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      گردش انبار از اسناد معتبر موجودی ثبت‌شده محاسبه نشده است.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MATERIAL REQUEST (درخواست شارژ کالا - Merged from Module 5) */}
      {activeTab === 'material_request' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ثبت دستی درخواست شارژ کالا
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ثبت درخواست تامین برای شارژ مجدد انبارها (علاوه بر درخواست‌های خودکار نقطه سفارش)
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const targetItem = items.find((i) => i.sku === newMrSku) || items[0];
                setMaterialRequests([
                  {
                    id: `mr-${Date.now()}`,
                    reqNo: `MREQ-${getPersianYear()}-${String(92 + materialRequests.length).padStart(4, '0')}`,
                    sku: targetItem.sku,
                    itemName: targetItem.name,
                    currentStock: targetItem.stockQty,
                    reorderPoint: targetItem.reorderLevel,
                    suggestedOrderQty: newMrQty,
                    warehouse: newMrWarehouse,
                    triggerType: 'ثبت دستی توسط سرپرست انبار',
                    status: 'ارسال‌شده جهت خرید',
                  },
                  ...materialRequests,
                ]);
                onShowToast(`درخواست شارژ کالا برای «${targetItem.name}» ثبت شد.`);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-medium text-slate-700 mb-1">انتخاب کالا جهت شارژ مجدد</label>
                <select
                  aria-label="انتخاب کالا برای درخواست شارژ"
                  value={newMrSku}
                  onChange={(e) => setNewMrSku(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.sku}>
                      {it.name} (موجودی فعلی: {it.stockQty} · نقطه سفارش: {it.reorderLevel})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">انبار متقاضی شارژ</label>
                <input
                  aria-label="انبار متقاضی شارژ"
                  type="text"
                  value={newMrWarehouse}
                  onChange={(e) => setNewMrWarehouse(e.target.value)}
                  placeholder="نام انبار"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">تعداد مورد نیاز جهت سفارش</label>
                <input
                  type="number"
                  min={1}
                  value={newMrQty}
                  onChange={(e) => setNewMrQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 px-4 font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 inline-flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت درخواست شارژ کالا</span>
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                لیست درخواست‌های شارژ کالا (دستی و خودکار بر اساس نقطه سفارش)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                به محض رسیدن موجودی هر کالا به نقطه سفارش، درخواست شارژ به صورت خودکار تولید می‌شود.
              </p>
            </div>
            <div className="space-y-3 text-xs">
              {materialRequests.map((mr) => (
                <div key={mr.id} className="p-4 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex justify-between font-bold text-slate-900">
                    <span className="font-mono text-indigo-700">{mr.reqNo} · {mr.warehouse}</span>
                    <span className="text-emerald-700">تعداد درخواستی: {mr.suggestedOrderQty} عدد</span>
                  </div>
                  <div className="font-semibold text-slate-800">{mr.itemName}</div>
                  <div className="flex justify-between text-slate-500 pt-1">
                    <span>
                      موجودی فعلی: {mr.currentStock} · نقطه سفارش: {mr.reorderPoint} ({mr.triggerType})
                    </span>
                    <span className="font-medium text-slate-700">{mr.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
