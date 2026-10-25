import React, { useState } from 'react';
import {
  Printer,
  BarChart3,
  FileSpreadsheet,
  Shield,
  Code2,
  Download,
  Upload,
} from 'lucide-react';
import { AuditLogRecord } from '../data/erpSeedData';
import { formatCurrency, stripEnglishTerms } from '../utils/erpEngine';
import {
  parseHesabfaImportPayload,
  summarizeHesabfaImport,
  type HesabfaImportPayload,
} from '../utils/hesabfaImport';

interface FrappeCoreModuleProps {
  auditLogs: AuditLogRecord[];
  branches?: string[];
  activeBranch?: string;
  onAddBranch?: (branchName: string) => void;
  onSelectBranch?: (branchName: string) => void;
  onExportFullData: () => void;
  onShowToast: (msg: string) => void;
  onImportHesabfaData: (payload: HesabfaImportPayload) => void;
}

export const FrappeCoreModule: React.FC<FrappeCoreModuleProps> = ({
  auditLogs,
  branches = ['فروشگاه مرکزی کلودی شاپ'],
  activeBranch = 'فروشگاه مرکزی کلودی شاپ',
  onAddBranch,
  onSelectBranch,
  onExportFullData,
  onShowToast,
  onImportHesabfaData,
}) => {
  const [activeTab, setActiveTab] = useState<
    'print_notify' | 'report_dashboard' | 'import_export' | 'permissions_audit' | 'scripts_api'
  >('print_notify');

  const [newBranchName, setNewBranchName] = useState('');
  const [showAddBranchForm, setShowAddBranchForm] = useState(false);

  // Role Permission Preview State
  const [previewRole, setPreviewRole] = useState<'مدیر کل سامانه' | 'صندوقدار فروشگاه'>(
    'مدیر کل سامانه'
  );
  const [branchRestriction, setBranchRestriction] = useState<string>(
    'فروشگاه مرکزی کلودی شاپ'
  );

  // Dynamic Report Builder State
  const [reportTarget, setReportTarget] = useState<'فاکتورهای فروش' | 'موجودی کالا و انبار' | 'گردش مراکز هزینه'>(
    'فاکتورهای فروش'
  );
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'شماره سند',
    'نام طرف حساب',
    'شعبه',
    'مبلغ کل',
    'مانده تسویه‌نشده',
  ]);
  const [hesabfaPayload, setHesabfaPayload] = useState<HesabfaImportPayload | null>(null);
  const [hesabfaFileName, setHesabfaFileName] = useState('');
  const [hesabfaImportError, setHesabfaImportError] = useState('');

  const handleHesabfaFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setHesabfaPayload(null);
    setHesabfaFileName('');
    setHesabfaImportError('');
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setHesabfaImportError('حجم فایل باید کمتر از ۲۰ مگابایت باشد.');
      return;
    }
    try {
      const payload = parseHesabfaImportPayload(JSON.parse(await file.text()));
      setHesabfaPayload(payload);
      setHesabfaFileName(file.name);
    } catch (error) {
      console.error('Could not read Hesabfa import file.', error);
      setHesabfaImportError(
        error instanceof Error ? error.message : 'فایل حسابفا قابل خواندن نیست.'
      );
    }
  };

  // Server Script State
  const [serverScriptCode, setServerScriptCode] = useState('');

  const toggleReportColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            تنظیمات هسته سیستم و مدیریت شعبه
          </h2>
          <p className="text-sm text-slate-500">
            مدیریت تک‌شعبه‌ای پیش‌فرض ({activeBranch})، اعلان‌های خودکار، قالب چاپ، گزارش‌ساز پویا و پشتیبان‌گیری
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddBranchForm((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 whitespace-nowrap shrink-0"
          >
            <span>+ افزودن شعبه جدید</span>
          </button>
          <button
            type="button"
            onClick={onExportFullData}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>خروجی کامل پایگاه داده</span>
          </button>
        </div>
      </div>

      {/* Single-Branch Default & Add New Branch Panel */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900">
              وضعیت شعبه‌های فعال سیستم (پیش‌فرض: تک‌شعبه‌ای)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تمام شعبه‌های آزمایشی قبلی حذف شده‌اند و سیستم به صورت پیش‌فرض روی «{activeBranch}» تنظیم است.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {branches.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => onSelectBranch && onSelectBranch(b)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${
                  b === activeBranch
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {b === activeBranch ? `✓ ${b} (فعال)` : b}
              </button>
            ))}
          </div>
        </div>

        {showAddBranchForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newBranchName.trim()) return;
              if (onAddBranch) onAddBranch(newBranchName.trim());
              setNewBranchName('');
              setShowAddBranchForm(false);
            }}
            className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2.5 text-xs"
          >
            <input
              type="text"
              required
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="نام شعبه جدید (مثلاً: شعبه دوم رشتیه)..."
              className="flex-1 min-w-[220px] rounded-lg border border-slate-300 px-3 py-2 bg-white"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800"
            >
              ثبت شعبه جدید
            </button>
          </form>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl w-fit">
        {[
          { id: 'print_notify', label: 'اعلان‌ها و قالب چاپ', icon: Printer },
          { id: 'report_dashboard', label: 'گزارش‌ساز و داشبورد', icon: BarChart3 },
          { id: 'import_export', label: 'ورود و خروج اکسل', icon: FileSpreadsheet },
          { id: 'permissions_audit', label: 'دسترسی‌ها و لاگ امنیتی', icon: Shield },
          { id: 'scripts_api', label: 'وب‌هوک و اسکریپت‌ها', icon: Code2 },
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

      {/* TAB 1: NOTIFICATIONS ENGINE & PRINT FORMAT BUILDER */}
      {activeTab === 'print_notify' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                سیستم اعلان‌های خودکار (پیامک، ایمیل و اعلان داخلی)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ارسال خودکار هشدار بر اساس رویدادها (رسیدن سررسید تسویه تأمین‌کننده، کمبود موجودی انبار یا ثبت فاکتور جدید)
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              قوانین یادآور به تقویم عملیاتی متصل هستند.
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                طراح فرمت چاپ اسناد و فاکتورها
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                شخصی‌سازی ظاهر فاکتورها، رسیدها و اسناد چاپی با چیدمان دلخواه، لوگو و مهر فروشگاه
              </p>
            </div>
            <div className="space-y-3 text-xs">
              {[
                {
                  name: 'قالب فاکتور فروش رسمی فروشگاهی (افقی همراه با لوگو و مهر دیجیتال)',
                  target: 'فاکتور فروش',
                },
                {
                  name: 'فیش حرارتی ۸ سانتی‌متری صندوق فروشگاهی (POS)',
                  target: 'فیش صندوق فروشگاهی',
                },
                {
                  name: 'برچسب بارکد و سریال حرارتی ۵×۳ سانتی‌متری ویژه قفسه‌های انبار',
                  target: 'کالا و شماره سریال',
                },
              ].map((pf) => (
                <div
                  key={pf.name}
                  className="p-3.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-slate-900">{pf.name}</div>
                    <div className="text-slate-500 mt-0.5">سند متصل: {pf.target}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold whitespace-nowrap shrink-0"
                  >
                    پیش‌نمایش چاپ
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DYNAMIC REPORT BUILDER & DASHBOARD CHART */}
      {activeTab === 'report_dashboard' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                گزارش‌ساز و داشبوردساز پویا (بدون کدنویسی)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                انتخاب ستون‌های دلخواه، فیلترهای تحلیلی و ساخت کارت‌های آماری و نمودارهای مدیریتی
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">منبع داده گزارش:</span>
              {(['فاکتورهای فروش', 'موجودی کالا و انبار', 'گردش مراکز هزینه'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setReportTarget(src)}
                  className={`px-3 py-1.5 rounded-lg font-semibold ${
                    reportTarget === src
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="font-bold text-slate-800">ستون‌های فعال در گزارش سفارشی ({reportTarget}):</div>
            <div className="flex flex-wrap gap-2">
              {[
                'شماره سند',
                'نام طرف حساب',
                'شعبه',
                'کانال فروش',
                'مبلغ کل',
                'مانده تسویه‌نشده',
                'بهای تمام‌شده',
                'سود خالص ردیف',
              ].map((col) => {
                const active = selectedColumns.includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => toggleReportColumn(col)}
                    className={`px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {active ? `✓ ${col}` : `+ ${col}`}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            برای مشاهده نمودارهای تحلیلی کامل ماهیانه، به بخش «آنالیز و آمار» در منوی سمت راست مراجعه کنید.
          </p>
        </div>
      )}

      {/* TAB 3: BULK DATA IMPORT / EXPORT TOOL */}
      {activeTab === 'import_export' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ورود کنترل‌شده‌ی داده‌های حسابفا
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  پس از تبدیل سه فایل اکسل، ابتدا پیش‌نمایش و مغایرت‌ها را بررسی کنید؛ داده‌ها تا تأیید نهایی جایگزین نمی‌شوند.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 space-y-1">
              <div className="font-bold">تبدیل فایل‌های اصلی</div>
              <p>فایل‌های Excel خام به سرویس ارسال نمی‌شوند. اسکریپت محلی زیر را از پوشه‌ی FaraPay اجرا کنید تا پیش‌نمایش امن JSON ساخته شود:</p>
              <code className="block overflow-x-auto rounded bg-white p-2 text-[11px] leading-5" dir="ltr">
                python3 scripts/convert_hesabfa_to_json.py --contacts &quot;$HOME/Downloads/1_Hesabfa_Contacts.xlsx&quot; --products &quot;$HOME/Downloads/2_Hesabfa_Products.xlsx&quot; --invoices &quot;$HOME/Downloads/3_Hesabfa_Sales_Invoices.xlsx&quot; --output &quot;$HOME/Downloads/FaraPay-hesabfa-import.json&quot;
              </code>
              <p>فایل خروجی شامل اطلاعات تماس است؛ آن را در محل امن نگه دارید و پس از ورود حذف کنید.</p>
            </div>

            <label className="block space-y-2 text-xs">
              <span className="font-semibold text-slate-700">فایل JSON تبدیل‌شده</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleHesabfaFileChange}
                className="block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:font-semibold file:text-indigo-700"
              />
            </label>

            {hesabfaImportError && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {hesabfaImportError}
              </div>
            )}

            {hesabfaPayload && (() => {
              const summary = summarizeHesabfaImport(hesabfaPayload);
              return (
                <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
                  <div className="font-bold">پیش‌نمایش: {hesabfaFileName}</div>
                  <div>
                    {summary.contactCount} مخاطب · {summary.productCount} کالا · {summary.invoiceCount} فاکتور تاریخی · {summary.draftCount} پیش‌نویس
                  </div>
                  <div>
                    جمع فروش آرشیوی: {formatCurrency(summary.salesTotal)} تومان · پرداخت: {formatCurrency(summary.paidTotal)} تومان · مانده‌ی تاریخی: {formatCurrency(summary.receivableTotal)} تومان
                  </div>
                  <div>موجودی snapshot: {summary.stockUnitTotal.toLocaleString('fa-IR')} واحد؛ این مقدار از فروش‌های تاریخی کم نمی‌شود.</div>
                  <div>فاکتورهای معلق: {summary.heldInvoiceNumbers.join('، ') || 'ندارد'}</div>
                  <ul className="list-disc space-y-1 pr-5">
                    {hesabfaPayload.corrections.map((correction) => <li key={correction}>{correction}</li>)}
                  </ul>
                  <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                    تأیید ورود، seedهای نمایشی و مانده‌های ساختگی را جایگزین می‌کند. نمودار حساب‌ها حفظ و مانده‌ی آن صفر می‌شود. فاکتورهای واردشده فقط آرشیوی‌اند؛ سند حسابداری/دریافت/برگشت ایجاد نمی‌کنند.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm('داده‌های فعلی برنامه با اطلاعات پیش‌نمایش‌شده جایگزین شود؟ پیش از این کار پشتیبان موجود است.')) return;
                      onImportHesabfaData(hesabfaPayload);
                    }}
                    className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white hover:bg-emerald-800"
                  >
                    تأیید نهایی و جایگزینی داده‌ها
                  </button>
                </div>
              );
            })()}
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  خروجی دسته‌جمعی اطلاعات و پشتیبان‌گیری (اکسپورت)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  استخراج فوری جداول سامانه جهت تحلیل در اکسل یا انتقال به سایر سیستم‌ها
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900">
                  استخراج یکپارچه کل اطلاعات سال مالی ۱۴۰۴
                </div>
                <p className="text-slate-600">
                  شامل درخت حساب‌ها، ردیف‌های سند دفتر کل، فاکتورهای فروش و خرید، موجودی چهار انبار و لیست مخاطبین
                </p>
                <button
                  type="button"
                  onClick={onExportFullData}
                  className="mt-2 px-4 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800"
                >
                  دانلود فوری فایل خروجی کامل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: ROLE & FIELD-LEVEL PERMISSIONS + AUDIT TRAIL */}
      {activeTab === 'permissions_audit' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  مدیریت دسترسی‌های دقیق در سطح نقش، شعبه و فیلد
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  محدود کردن دسترسی کاربران به شعبه فعال و مخفی‌سازی فیلدهای حساس (قیمت خرید و سود خالص)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {(['مدیر کل سامانه', 'صندوقدار فروشگاه'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setPreviewRole(r)}
                      className={`px-3 py-1.5 font-semibold rounded-md ${
                        previewRole === r ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      نقش: {r}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="محدودیت دسترسی شعبه"
                  value={branchRestriction}
                  onChange={(e) => setBranchRestriction(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      شعبه: {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              در حالت صندوقدار یا Privacy Mode، قیمت خرید واحد و سود خالص به صورت خودکار با (****) پوشانده می‌شوند.
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              تاریخچه تغییرات و لاگ امنیتی سامانه
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-2.5 px-3">زمان دقیق</th>
                    <th className="py-2.5 px-3">کاربر تغییر دهنده · نقش</th>
                    <th className="py-2.5 px-3">نوع سند · شناسه</th>
                    <th className="py-2.5 px-3">فیلد تغییریافته</th>
                    <th className="py-2.5 px-3">مقدار قبلی</th>
                    <th className="py-2.5 px-3">مقدار جدید</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono text-slate-600">{log.timestamp}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{log.user}</div>
                        <div className="text-slate-500">{stripEnglishTerms(log.role)}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold">{stripEnglishTerms(log.docType)}</span> ·{' '}
                        <span className="font-mono">{log.docId}</span>
                      </td>
                      <td className="py-2.5 px-3 text-indigo-700">{stripEnglishTerms(log.fieldChanged)}</td>
                      <td className="py-2.5 px-3 font-mono text-rose-700 line-through">
                        {stripEnglishTerms(log.oldValue)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                        {stripEnglishTerms(log.newValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: WEBHOOKS, REST API & SERVER SCRIPTS */}
      {activeTab === 'scripts_api' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              قوانین و اسکریپت‌نویسی سمت سرور
            </h3>
            <textarea
              rows={7}
              aria-label="کد اسکریپت سرور"
              value={serverScriptCode}
              onChange={(e) => setServerScriptCode(e.target.value)}
              className="w-full p-3 font-mono text-xs bg-slate-900 text-slate-100 rounded-xl leading-relaxed"
            />
            <button
              type="button"
              onClick={() =>
                onShowToast('قانون خودکار سرور روی رویداد ثبت فاکتور فروش ذخیره و فعال شد.')
              }
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              ذخیره و فعال‌سازی قانون سرور
            </button>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              وب‌هوک‌ها و رابط برنامه‌نویسی اتصال دوطرفه
            </h3>
            <div className="space-y-3 text-xs">
              {[
                {
                  name: 'وب‌هوک ارسال آنی فاکتورهای جدید به نرم‌افزار بیرونی',
                  endpoint: 'مسیر اتصال: درگاه وب‌سرویس مرکزی شرکت امکان',
                  event: 'هنگام ثبت قطعی فاکتور فروش',
                },
                {
                  name: 'رابط برنامه‌نویسی همگام‌سازی دوطرفه موجودی و قیمت با سایت فروشگاهی',
                  endpoint: 'مسیر اتصال: وب‌سرویس موجودی و لیست قیمت فروشگاه آنلاین',
                  event: 'هنگام تغییر موجودی یا قیمت کالا در انبار',
                },
                {
                  name: 'وب‌هوک گزارش‌گیری شبانه مدیران ارشد',
                  endpoint: 'مسیر اتصال: درگاه پیام‌رسان گزارش‌های مالی مدیریت',
                  event: 'اجرای زمان‌بندی‌شده روزانه ساعت ۲۳:۰۰',
                },
              ].map((wh) => (
                <div key={wh.name} className="p-3.5 rounded-lg border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">{wh.name}</div>
                  <div className="text-indigo-700 text-[11px]">
                    {wh.endpoint}
                  </div>
                  <div className="text-slate-500">رویداد اجراکننده: {wh.event}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
