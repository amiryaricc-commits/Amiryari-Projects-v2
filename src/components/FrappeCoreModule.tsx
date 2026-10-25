import React, { useState, useEffect } from 'react';
import {
  Printer,
  BarChart3,
  FileSpreadsheet,
  Shield,
  Code2,
  Download,
  Upload,
  History,
  Undo2,
  Redo2,
  FolderOpen,
  CheckCircle2,
  GitCompare,
  Save,
  Users,
  Lock,
} from 'lucide-react';
import {
  AccountNode,
  AuditLogRecord,
  InventoryItemRecord,
  PurchaseInvoiceRecord,
  SalesInvoiceRecord,
  ShareholderRecord,
  ShareholderRuleSnapshot,
  TimeMachineSnapshotRecord,
} from '../data/erpSeedData';
import {
  computeSnapshotDiff,
  formatCurrency,
  stripEnglishTerms,
  SnapshotDiffResult,
} from '../utils/erpEngine';
import {
  parseHesabfaImportPayload,
  summarizeHesabfaImport,
  type HesabfaImportPayload,
} from '../utils/hesabfaImport';
import {
  PolarisBadge,
  PolarisButton,
  PolarisButtonGroup,
  PolarisSheet,
} from './CreatableCombobox';

export type FrappeCoreSubTab =
  | 'time_machine'
  | 'shareholder_rules'
  | 'print_notify'
  | 'report_dashboard'
  | 'import_export'
  | 'permissions_audit'
  | 'scripts_api';

interface FrappeCoreModuleProps {
  initialTab?: FrappeCoreSubTab;
  auditLogs: AuditLogRecord[];
  branches?: string[];
  activeBranch?: string;
  onAddBranch?: (branchName: string) => void;
  onSelectBranch?: (branchName: string) => void;
  onExportFullData: () => void;
  onShowToast: (msg: string) => void;
  onImportHesabfaData: (payload: HesabfaImportPayload) => void;
  // Time-Machine Backup Props
  snapshots?: TimeMachineSnapshotRecord[];
  activeSnapshotIndex?: number;
  currentLiveState?: {
    accounts: AccountNode[];
    salesInvoices: SalesInvoiceRecord[];
    purchaseInvoices: PurchaseInvoiceRecord[];
    inventoryItems: InventoryItemRecord[];
  };
  onCreateManualSnapshot?: (label?: string) => TimeMachineSnapshotRecord | void;
  onRestoreSnapshotAtIndex?: (index: number) => void;
  onRollbackSnapshot?: () => void;
  onRollForwardSnapshot?: () => void;
  onImportBackupSnapshotFile?: (rawJson: string, fileName: string) => void;
  // Shareholder Percentage & Snapshot Props (Moved here from Read-Only Accounting)
  shareholders?: ShareholderRecord[];
  shareholderSnapshots?: ShareholderRuleSnapshot[];
  onUpdateShareholderPercentagesWithSnapshot?: (payload: {
    partner1CapitalPct: number;
    partner1ProfitPct: number;
    partner2CapitalPct: number;
    partner2ProfitPct: number;
    note: string;
  }) => void;
}

export const FrappeCoreModule: React.FC<FrappeCoreModuleProps> = ({
  initialTab = 'time_machine',
  auditLogs,
  branches = ['فروشگاه مرکزی کلودی شاپ'],
  activeBranch = 'فروشگاه مرکزی کلودی شاپ',
  onAddBranch,
  onSelectBranch,
  onExportFullData,
  onShowToast,
  onImportHesabfaData,
  snapshots = [],
  activeSnapshotIndex = -1,
  currentLiveState,
  onCreateManualSnapshot,
  onRestoreSnapshotAtIndex,
  onRollbackSnapshot,
  onRollForwardSnapshot,
  onImportBackupSnapshotFile,
  shareholders = [],
  shareholderSnapshots = [],
  onUpdateShareholderPercentagesWithSnapshot,
}) => {
  const [activeTab, setActiveTab] = useState<FrappeCoreSubTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const [newBranchName, setNewBranchName] = useState('');
  const [showAddBranchForm, setShowAddBranchForm] = useState(false);

  // Time-Machine States
  const [snapshotNoteInput, setSnapshotNoteInput] = useState('');
  const [connectedDirName, setConnectedDirName] = useState<string | null>(null);
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [comparedSnapshot, setComparedSnapshot] =
    useState<TimeMachineSnapshotRecord | null>(null);
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);

  // Shareholder Percentage Form States
  const [p1CapPct, setP1CapPct] = useState<number>(
    shareholders[0]?.ownershipPercent ?? 50
  );
  const [p1ProfPct, setP1ProfPct] = useState<number>(
    shareholders[0]?.profitSharePercent ?? 70
  );
  const [p2CapPct, setP2CapPct] = useState<number>(
    shareholders[1]?.ownershipPercent ?? 50
  );
  const [p2ProfPct, setP2ProfPct] = useState<number>(
    shareholders[1]?.profitSharePercent ?? 30
  );
  const [shRuleNote, setShRuleNote] = useState('');

  // Role Permission Preview State
  const [previewRole, setPreviewRole] = useState<
    'مدیر کل سامانه' | 'صندوقدار فروشگاه'
  >('مدیر کل سامانه');
  const [branchRestriction, setBranchRestriction] = useState<string>(
    'فروشگاه مرکزی کلودی شاپ'
  );

  // Dynamic Report Builder State
  const [reportTarget, setReportTarget] = useState<
    'فاکتورهای فروش' | 'موجودی کالا و انبار' | 'گردش مراکز هزینه'
  >('فاکتورهای فروش');
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'شماره سند',
    'نام طرف حساب',
    'شعبه',
    'مبلغ کل',
    'مانده تسویه‌نشده',
  ]);
  const [hesabfaPayload, setHesabfaPayload] =
    useState<HesabfaImportPayload | null>(null);
  const [hesabfaFileName, setHesabfaFileName] = useState('');
  const [hesabfaImportError, setHesabfaImportError] = useState('');

  // Server Script State
  const [serverScriptCode, setServerScriptCode] = useState('');

  const handleHesabfaFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
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

  // Connect Local Directory via File System Access API (showDirectoryPicker)
  const handleConnectLocalDirectory = async () => {
    const win = window as unknown as {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<any>;
    };
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
        setDirHandle(handle);
        setConnectedDirName(handle.name || 'پوشه محلی انتخاب‌شده');
        onShowToast(
          `پوشه محلی «${handle.name || 'بک‌آپ'}» متصل شد؛ نسخه‌های جدید مستقیماً روی هارد ذخیره می‌شوند.`
        );
      } catch {
        onShowToast(
          'انتخاب پوشه محلی لغو شد یا در محیط آی‌فریم محدود است؛ دانلود مستقیم مرورگر فعال است.'
        );
      }
    } else {
      onShowToast(
        'مرورگر فعلی از انتخاب مستقیم پوشه پشتیبانی نمی‌کند؛ حالت دانلود خودکار فایل (.farapay.json) فعال شد.'
      );
      setConnectedDirName('دانلود خودکار مرورگر (Fallback)');
    }
  };

  const downloadSnapshotFile = async (snap: TimeMachineSnapshotRecord) => {
    const fileName = `farapay-${snap.versionCode}-${snap.id}.farapay.json`;
    const content = JSON.stringify(snap, null, 2);

    if (dirHandle && typeof dirHandle.getFileHandle === 'function') {
      try {
        const fileHandle = await dirHandle.getFileHandle(fileName, {
          create: true,
        });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        onShowToast(`فایل «${fileName}» مستقیماً در پوشه محلی ذخیره شد.`);
        return;
      } catch {
        // Fallback to browser download
      }
    }

    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast(`فایل بک‌آپ «${fileName}» دانلود شد.`);
  };

  const handleTriggerManualSnapshot = async () => {
    if (isSavingSnapshot || !onCreateManualSnapshot) return;
    setIsSavingSnapshot(true);
    const created = onCreateManualSnapshot(
      snapshotNoteInput.trim() || undefined
    );
    setSnapshotNoteInput('');
    if (created && dirHandle) {
      await downloadSnapshotFile(created);
    }
    setIsSavingSnapshot(false);
  };

  const handleImportSnapshotFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !onImportBackupSnapshotFile) return;
    try {
      const text = await file.text();
      onImportBackupSnapshotFile(text, file.name);
      e.target.value = '';
    } catch {
      onShowToast('خطا در خواندن فایل بک‌آپ انتخاب‌شده.');
    }
  };

  const toggleReportColumn = (col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };

  // Compute live diff when a snapshot is selected for comparison
  const activeDiffResult: SnapshotDiffResult | null =
    comparedSnapshot && currentLiveState
      ? computeSnapshotDiff(comparedSnapshot, currentLiveState)
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            تنظیمات هسته سیستم، مرکز بک‌آپ Time-Machine و مدیریت شعبه
          </h2>
          <p className="text-sm text-slate-500">
            مدیریت نسخه‌های پشتیبان دوطرفه (Undo/Redo)، تنظیم درصد شرکا با ثبت Snapshot، مدیریت تک‌شعبه‌ای ({activeBranch}) و گزارش‌ساز پویا
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PolarisButton
            size="slim"
            onClick={() => setShowAddBranchForm((prev) => !prev)}
          >
            + افزودن شعبه جدید
          </PolarisButton>
          <PolarisButton
            size="slim"
            icon={<Download className="w-4 h-4 shrink-0" />}
            onClick={onExportFullData}
          >
            خروجی کامل پایگاه داده
          </PolarisButton>
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
            <PolarisButton submit primary size="slim">
              ثبت شعبه جدید
            </PolarisButton>
          </form>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl w-fit">
        {[
          {
            id: 'time_machine',
            label: 'مرکز بک‌آپ و مدیریت نسخه‌ها (Time-Machine)',
            icon: History,
          },
          {
            id: 'shareholder_rules',
            label: 'تنظیم درصد شرکا و Snapshot',
            icon: Users,
          },
          { id: 'print_notify', label: 'اعلان‌ها و قالب چاپ', icon: Printer },
          {
            id: 'report_dashboard',
            label: 'گزارش‌ساز و داشبورد',
            icon: BarChart3,
          },
          {
            id: 'import_export',
            label: 'ورود و خروج اکسل',
            icon: FileSpreadsheet,
          },
          {
            id: 'permissions_audit',
            label: 'دسترسی‌ها و لاگ امنیتی',
            icon: Shield,
          },
          { id: 'scripts_api', label: 'وب‌هوک و اسکریپت‌ها', icon: Code2 },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as FrappeCoreSubTab)}
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

      {/* =====================================================================
          TAB 0: TIME-MACHINE BACKUP & VERSION MANAGEMENT CENTER
         ===================================================================== */}
      {activeTab === 'time_machine' && (
        <div className="space-y-5">
          {/* Top Control Bar: Snapshot Creation, Undo/Redo Timeline, Local Folder Sync */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-base font-black text-slate-900">
                    مرکز بک‌آپ و مدیریت نسخه‌ها (Time-Machine)
                  </h3>
                  <PolarisBadge status="success">
                    تعداد نسخه‌ها: {snapshots.length}
                  </PolarisBadge>
                  {activeSnapshotIndex >= 0 && snapshots[activeSnapshotIndex] && (
                    <PolarisBadge status="info">
                      نسخه فعال: {snapshots[activeSnapshotIndex].versionCode} (
                      {activeSnapshotIndex + 1} از {snapshots.length})
                    </PolarisBadge>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  در هنگام بازگشت به نسخه قبل (Rollback)، هیچ‌یک از نسخه‌های بعدی حذف نمی‌شوند و با دکمه «پیشروی به نسخه بعد (Roll-forward)» می‌توانید آزادانه به آخرین وضعیت برگردید.
                </p>
              </div>

              {/* Non-Destructive Rollback (Undo) & Roll-Forward (Redo) Group */}
              <div className="flex flex-wrap items-center gap-2">
                <PolarisButtonGroup segmented>
                  <PolarisButton
                    size="slim"
                    icon={<Undo2 className="w-3.5 h-3.5" />}
                    disabled={snapshots.length === 0 || activeSnapshotIndex <= 0}
                    onClick={() => onRollbackSnapshot && onRollbackSnapshot()}
                  >
                    بازگشت به نسخه قبل (Rollback)
                  </PolarisButton>
                  <PolarisButton
                    size="slim"
                    icon={<Redo2 className="w-3.5 h-3.5" />}
                    disabled={
                      snapshots.length === 0 ||
                      activeSnapshotIndex < 0 ||
                      activeSnapshotIndex >= snapshots.length - 1
                    }
                    onClick={() =>
                      onRollForwardSnapshot && onRollForwardSnapshot()
                    }
                  >
                    پیشروی به نسخه بعد (Roll-forward)
                  </PolarisButton>
                </PolarisButtonGroup>
              </div>
            </div>

            {/* Create Manual Snapshot + Connect Local Folder + Import Backup File */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end text-xs">
              <div className="lg:col-span-5">
                <label className="block font-bold text-slate-700 mb-1">
                  عنوان یا یادداشت نسخه بک‌آپ دستی
                </label>
                <input
                  type="text"
                  value={snapshotNoteInput}
                  onChange={(e) => setSnapshotNoteInput(e.target.value)}
                  placeholder="مثلاً: قبل از ثبت فاکتورهای جشنواره آبان‌ماه..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-slate-900"
                />
              </div>

              <div className="lg:col-span-3">
                <PolarisButton
                  primary
                  fullWidth
                  loading={isSavingSnapshot}
                  disabled={isSavingSnapshot}
                  icon={<Save className="w-4 h-4" />}
                  onClick={handleTriggerManualSnapshot}
                >
                  ثبت نسخه بک‌آپ جدید (Snapshot)
                </PolarisButton>
              </div>

              <div className="lg:col-span-2">
                <PolarisButton
                  fullWidth
                  icon={<FolderOpen className="w-4 h-4" />}
                  onClick={handleConnectLocalDirectory}
                >
                  {connectedDirName ? `پوشه: ${connectedDirName}` : 'اتصال پوشه محلی'}
                </PolarisButton>
              </div>

              <div className="lg:col-span-2">
                <label className="cursor-pointer w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50">
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>ایمپورت فایل بک‌آپ</span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportSnapshotFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Full Polaris IndexTable of Snapshots */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                جدول تاریخچه نسخه‌های پشتیبان (Snapshots IndexTable)
              </span>
              <span className="text-[11px] text-slate-500">
                دارای اعتبارسنجی یکپارچگی داده (Checksum FNV-1a)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">شناسه و عنوان نسخه</th>
                    <th className="py-2.5 px-3">تاریخ و ساعت دقیق</th>
                    <th className="py-2.5 px-3">نوع بک‌آپ</th>
                    <th className="py-2.5 px-3">خلاصه آمار (فاکتور / SKU / دارایی)</th>
                    <th className="py-2.5 px-3">وضعیت سلامت (Checksum)</th>
                    <th className="py-2.5 px-3 text-center">عملیات Time-Machine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshots.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-8 text-center text-slate-400"
                      >
                        هنوز نسخه‌ای در تاریخچه ثبت نشده است؛ روی دکمه «ثبت نسخه بک‌آپ جدید» کلیک کنید.
                      </td>
                    </tr>
                  ) : (
                    snapshots.map((snap, idx) => {
                      const isCurrentActive = idx === activeSnapshotIndex;
                      return (
                        <tr
                          key={snap.id}
                          className={
                            isCurrentActive
                              ? 'bg-indigo-50/50 hover:bg-indigo-50'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-indigo-700">
                                {snap.versionCode}
                              </span>
                              <span className="font-bold text-slate-900">
                                {snap.label}
                              </span>
                              {isCurrentActive && (
                                <PolarisBadge status="success">
                                  نسخه فعال فعلی
                                </PolarisBadge>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600">
                            {snap.timestamp}
                          </td>
                          <td className="py-2.5 px-3">
                            <PolarisBadge
                              status={
                                snap.backupType === 'دستی (Manual)'
                                  ? 'info'
                                  : snap.backupType === 'ایمپورت فایل (Import)'
                                  ? 'warning'
                                  : 'default'
                              }
                            >
                              {snap.backupType}
                            </PolarisBadge>
                          </td>
                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                            <span>{snap.invoiceCount} فاکتور</span>
                            <span className="mx-1.5 text-slate-300">|</span>
                            <span>{snap.skuCount} کالا</span>
                            <span className="mx-1.5 text-slate-300">|</span>
                            <span className="font-bold text-emerald-700">
                              {formatCurrency(snap.totalAssets)} ریال
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono text-[11px]">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {snap.checksum}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <PolarisButton
                                size="slim"
                                onClick={() =>
                                  onRestoreSnapshotAtIndex &&
                                  onRestoreSnapshotAtIndex(idx)
                                }
                              >
                                بازگردانی به این نسخه
                              </PolarisButton>
                              <PolarisButton
                                size="slim"
                                outline
                                icon={<Download className="w-3 h-3" />}
                                onClick={() => downloadSnapshotFile(snap)}
                              >
                                دانلود فایل
                              </PolarisButton>
                              <PolarisButton
                                size="slim"
                                outline
                                icon={<GitCompare className="w-3 h-3" />}
                                onClick={() => setComparedSnapshot(snap)}
                              >
                                مقایسه با نسخه فعلی
                              </PolarisButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 1: SHAREHOLDER RULES & SNAPSHOT ENGINE (در تنظیمات هسته)
         ===================================================================== */}
      {activeTab === 'shareholder_rules' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 space-y-4 h-fit">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-indigo-600" />
                <span>تغییر درصدهای شراکت و ثبت Snapshot فریز تاریخچه</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                مطابق معماری ۳ قلک سهامداری، تغییر درصد سرمایه ($C_i$) یا سود خالص ($P_i$) ابتدا مانده حساب‌های قبلی را در یک Snapshot غیرقابل‌تغییر قفل می‌کند و درصدهای جدید صرفاً روی تراکنش‌های آینده اعمال می‌شوند.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900">
                  {shareholders[0]?.name || 'شریک اول (۷۰٪)'}
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    سهم سرمایه انبار ($C_1$ %)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p1CapPct}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setP1CapPct(v);
                      setP2CapPct(100 - v);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono font-bold rounded border border-slate-300 bg-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    سهم سود خالص ($P_1$ %)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p1ProfPct}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setP1ProfPct(v);
                      setP2ProfPct(100 - v);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono font-bold rounded border border-slate-300 bg-white tabular-nums"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900">
                  {shareholders[1]?.name || 'شریک دوم (۳۰٪)'}
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    سهم سرمایه انبار ($C_2$ %)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p2CapPct}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setP2CapPct(v);
                      setP1CapPct(100 - v);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono font-bold rounded border border-slate-300 bg-white tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    سهم سود خالص ($P_2$ %)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={p2ProfPct}
                    onChange={(e) => {
                      const v = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                      setP2ProfPct(v);
                      setP1ProfPct(100 - v);
                    }}
                    className="w-full px-2.5 py-1.5 font-mono font-bold rounded border border-slate-300 bg-white tabular-nums"
                  />
                </div>
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-bold text-slate-700 mb-1">
                علت تغییر توافق شراکت (ثبت در Snapshot)
              </label>
              <input
                type="text"
                value={shRuleNote}
                onChange={(e) => setShRuleNote(e.target.value)}
                placeholder="مثلاً: توافق جدید فصل پاییز پس از افزایش سرمایه..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <PolarisButton
              primary
              fullWidth
              onClick={() => {
                if (!onUpdateShareholderPercentagesWithSnapshot) return;
                onUpdateShareholderPercentagesWithSnapshot({
                  partner1CapitalPct: p1CapPct,
                  partner1ProfitPct: p1ProfPct,
                  partner2CapitalPct: p2CapPct,
                  partner2ProfitPct: p2ProfPct,
                  note:
                    shRuleNote.trim() ||
                    `تغییر توافق به سرمایه ${p1CapPct}/${p2CapPct} و سود ${p1ProfPct}/${p2ProfPct}`,
                });
                setShRuleNote('');
              }}
            >
              ثبت Snapshot فریز گذشته و اعمال درصد جدید
            </PolarisButton>
          </div>

          <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-black text-slate-900">
              تاریخچه Snapshotهای توافق سهامداران ({shareholderSnapshots.length} دوره)
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-right text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">تاریخ موثر</th>
                    <th className="py-2 px-3">شریک اول (سرمایه / سود)</th>
                    <th className="py-2 px-3">شریک دوم (سرمایه / سود)</th>
                    <th className="py-2 px-3">صندوق احیای فریز شده</th>
                    <th className="py-2 px-3">توضیحات توافق</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shareholderSnapshots.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        تاکنون تغییر درصدی ثبت نشده است (توافق پیش‌فرض: سرمایه ۵۰/۵۰ و سود ۷۰/۳۰ فعال است).
                      </td>
                    </tr>
                  ) : (
                    shareholderSnapshots.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {s.effectiveDate}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-indigo-700 tabular-nums">
                          {s.partner1CapitalPct}% سرمایه / {s.partner1ProfitPct}% سود
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-emerald-700 tabular-nums">
                          {s.partner2CapitalPct}% سرمایه / {s.partner2ProfitPct}% سود
                        </td>
                        <td className="py-2 px-3 font-mono tabular-nums">
                          {formatCurrency(s.frozenRecoveryPool)} ریال
                        </td>
                        <td className="py-2 px-3 text-slate-600">{s.note}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NOTIFICATIONS ENGINE & PRINT FORMAT BUILDER */}
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

      {/* TAB 3: DYNAMIC REPORT BUILDER & DASHBOARD CHART */}
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
              {(
                ['فاکتورهای فروش', 'موجودی کالا و انبار', 'گردش مراکز هزینه'] as const
              ).map((src) => (
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
            <div className="font-bold text-slate-800">
              ستون‌های فعال در گزارش سفارشی ({reportTarget}):
            </div>
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

      {/* TAB 4: BULK DATA IMPORT / EXPORT TOOL */}
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
              <p>
                فایل‌های Excel خام به سرویس ارسال نمی‌شوند. اسکریپت محلی زیر را از پوشه‌ی FaraPay اجرا کنید تا پیش‌نمایش امن JSON ساخته شود:
              </p>
              <code
                className="block overflow-x-auto rounded bg-white p-2 text-[11px] leading-5"
                dir="ltr"
              >
                python3 scripts/convert_hesabfa_to_json.py --contacts &quot;$HOME/Downloads/1_Hesabfa_Contacts.xlsx&quot; --products &quot;$HOME/Downloads/2_Hesabfa_Products.xlsx&quot; --invoices &quot;$HOME/Downloads/3_Hesabfa_Sales_Invoices.xlsx&quot; --output &quot;$HOME/Downloads/FaraPay-hesabfa-import.json&quot;
              </code>
              <p>
                فایل خروجی شامل اطلاعات تماس است؛ آن را در محل امن نگه دارید و پس از ورود حذف کنید.
              </p>
            </div>

            <label className="block space-y-2 text-xs">
              <span className="font-semibold text-slate-700">
                فایل JSON تبدیل‌شده
              </span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleHesabfaFileChange}
                className="block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:font-semibold file:text-indigo-700"
              />
            </label>

            {hesabfaImportError && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {hesabfaImportError}
              </div>
            )}

            {hesabfaPayload &&
              (() => {
                const summary = summarizeHesabfaImport(hesabfaPayload);
                return (
                  <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
                    <div className="font-bold">پیش‌نمایش: {hesabfaFileName}</div>
                    <div>
                      {summary.contactCount} مخاطب · {summary.productCount} کالا ·{' '}
                      {summary.invoiceCount} فاکتور تاریخی · {summary.draftCount}{' '}
                      پیش‌نویس
                    </div>
                    <div>
                      جمع فروش آرشیوی: {formatCurrency(summary.salesTotal)} تومان ·
                      پرداخت: {formatCurrency(summary.paidTotal)} تومان · مانده‌ی
                      تاریخی: {formatCurrency(summary.receivableTotal)} تومان
                    </div>
                    <div>
                      موجودی snapshot:{' '}
                      {summary.stockUnitTotal.toLocaleString('fa-IR')} واحد؛ این
                      مقدار از فروش‌های تاریخی کم نمی‌شود.
                    </div>
                    <div>
                      فاکتورهای معلق:{' '}
                      {summary.heldInvoiceNumbers.join('، ') || 'ندارد'}
                    </div>
                    <ul className="list-disc space-y-1 pr-5">
                      {hesabfaPayload.corrections.map((correction) => (
                        <li key={correction}>{correction}</li>
                      ))}
                    </ul>
                    <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
                      تأیید ورود، seedهای نمایشی و مانده‌های ساختگی را جایگزین می‌کند. نمودار حساب‌ها حفظ و مانده‌ی آن صفر می‌شود. فاکتورهای واردشده فقط آرشیوی‌اند؛ سند حسابداری/دریافت/برگشت ایجاد نمی‌کنند.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !window.confirm(
                            'داده‌های فعلی برنامه با اطلاعات پیش‌نمایش‌شده جایگزین شود؟ پیش از این کار پشتیبان موجود است.'
                          )
                        )
                          return;
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

      {/* TAB 5: ROLE & FIELD-LEVEL PERMISSIONS + AUDIT TRAIL */}
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
                  {(['مدیر کل سامانه', 'صندوقدار فروشگاه'] as const).map(
                    (r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setPreviewRole(r)}
                        className={`px-3 py-1.5 font-semibold rounded-md ${
                          previewRole === r
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600'
                        }`}
                      >
                        نقش: {r}
                      </button>
                    )
                  )}
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
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {log.timestamp}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">
                          {log.user}
                        </div>
                        <div className="text-slate-500">
                          {stripEnglishTerms(log.role)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold">
                          {stripEnglishTerms(log.docType)}
                        </span>{' '}
                        · <span className="font-mono">{log.docId}</span>
                      </td>
                      <td className="py-2.5 px-3 text-indigo-700">
                        {stripEnglishTerms(log.fieldChanged)}
                      </td>
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

      {/* TAB 6: WEBHOOKS, REST API & SERVER SCRIPTS */}
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
                onShowToast(
                  'قانون خودکار سرور روی رویداد ثبت فاکتور فروش ذخیره و فعال شد.'
                )
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
                  endpoint:
                    'مسیر اتصال: وب‌سرویس موجودی و لیست قیمت فروشگاه آنلاین',
                  event: 'هنگام تغییر موجودی یا قیمت کالا در انبار',
                },
                {
                  name: 'وب‌هوک گزارش‌گیری شبانه مدیران ارشد',
                  endpoint: 'مسیر اتصال: درگاه پیام‌رسان گزارش‌های مالی مدیریت',
                  event: 'اجرای زمان‌بندی‌شده روزانه ساعت ۲۳:۰۰',
                },
              ].map((wh) => (
                <div
                  key={wh.name}
                  className="p-3.5 rounded-lg border border-slate-200 space-y-1"
                >
                  <div className="font-bold text-slate-900">{wh.name}</div>
                  <div className="text-indigo-700 text-[11px]">
                    {wh.endpoint}
                  </div>
                  <div className="text-slate-500">
                    رویداد اجراکننده: {wh.event}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          POLARIS SHEET: TIME-MACHINE SNAPSHOT DIFF VIEWER
         ===================================================================== */}
      <PolarisSheet
        open={Boolean(comparedSnapshot)}
        onClose={() => setComparedSnapshot(null)}
        title={
          comparedSnapshot
            ? `مقایسه نسخه «${comparedSnapshot.versionCode} (${comparedSnapshot.label})» با وضعیت فعلی`
            : 'مقایسه نسخه بک‌آپ'
        }
        footer={
          <>
            <PolarisButton onClick={() => setComparedSnapshot(null)}>
              بستن پنجره مقایسه
            </PolarisButton>
            {comparedSnapshot && (
              <PolarisButton
                primary
                onClick={() => {
                  const idx = snapshots.findIndex(
                    (s) => s.id === comparedSnapshot.id
                  );
                  if (idx !== -1 && onRestoreSnapshotAtIndex) {
                    onRestoreSnapshotAtIndex(idx);
                  }
                  setComparedSnapshot(null);
                }}
              >
                بازگردانی به این نسخه
              </PolarisButton>
            )}
          </>
        }
      >
        {comparedSnapshot && activeDiffResult && (
          <div className="space-y-4 text-xs">
            {/* Checksum Comparison Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">
                  وضعیت یکپارچگی و Checksum:
                </span>
                <PolarisBadge
                  status={activeDiffResult.isIdentical ? 'success' : 'warning'}
                >
                  {activeDiffResult.isIdentical
                    ? 'منطبق با وضعیت فعلی (بدون تغییر)'
                    : 'دارای تفاوت با وضعیت فعلی'}
                </PolarisBadge>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1">
                <div className="p-2 rounded bg-white border border-slate-200">
                  <div className="text-slate-400">Checksum نسخه بک‌آپ:</div>
                  <div className="font-bold text-indigo-700">
                    {activeDiffResult.snapshotChecksum}
                  </div>
                </div>
                <div className="p-2 rounded bg-white border border-slate-200">
                  <div className="text-slate-400">Checksum وضعیت فعلی:</div>
                  <div className="font-bold text-emerald-700">
                    {activeDiffResult.currentChecksum}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoices Summary Diff */}
            <div className="p-3.5 rounded-xl border border-slate-200 space-y-2">
              <div className="font-bold text-slate-900">
                ۱. تفاضل فاکتورهای فروش و خرید
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-slate-50">
                  <div className="text-slate-500">تغییر تعداد فاکتور فروش:</div>
                  <div className="font-mono font-bold text-sm tabular-nums mt-0.5">
                    {activeDiffResult.salesInvoiceCountDiff > 0
                      ? `+${activeDiffResult.salesInvoiceCountDiff}`
                      : activeDiffResult.salesInvoiceCountDiff}{' '}
                    سند ({formatCurrency(activeDiffResult.salesTotalDiff)} تومان)
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-50">
                  <div className="text-slate-500">تغییر تعداد فاکتور خرید:</div>
                  <div className="font-mono font-bold text-sm tabular-nums mt-0.5">
                    {activeDiffResult.purchaseInvoiceCountDiff > 0
                      ? `+${activeDiffResult.purchaseInvoiceCountDiff}`
                      : activeDiffResult.purchaseInvoiceCountDiff}{' '}
                    سند ({formatCurrency(activeDiffResult.purchaseTotalDiff)} ریال)
                  </div>
                </div>
              </div>
            </div>

            {/* SKU Stock Diff Table */}
            <div className="space-y-1.5">
              <div className="font-bold text-slate-900">
                ۲. تفاضل موجودی کالاها ({activeDiffResult.skuChanges.length} تغییر)
              </div>
              {activeDiffResult.skuChanges.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 text-slate-500 text-center">
                  موجودی تمام کالاها در این نسخه با وضعیت فعلی یکسان است.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                  <table className="w-full text-right border-collapse text-[11px]">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="py-1.5 px-2">کالا</th>
                        <th className="py-1.5 px-2">در بک‌آپ</th>
                        <th className="py-1.5 px-2">فعلی</th>
                        <th className="py-1.5 px-2">تفاضل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {activeDiffResult.skuChanges.map((sc) => (
                        <tr key={sc.sku}>
                          <td className="py-1.5 px-2 font-sans font-semibold">
                            {sc.name} ({sc.sku})
                          </td>
                          <td className="py-1.5 px-2">{sc.snapshotQty}</td>
                          <td className="py-1.5 px-2">{sc.currentQty}</td>
                          <td
                            className={`py-1.5 px-2 font-bold ${
                              sc.diffQty > 0
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {sc.diffQty > 0 ? `+${sc.diffQty}` : sc.diffQty}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Account Balances Diff Table */}
            <div className="space-y-1.5">
              <div className="font-bold text-slate-900">
                ۳. تفاضل مانده حساب‌های مالی (
                {activeDiffResult.accountChanges.length} حساب تغییریافته)
              </div>
              {activeDiffResult.accountChanges.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-50 text-slate-500 text-center">
                  مانده تمام حساب‌های درختواره با وضعیت فعلی یکسان است.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  <table className="w-full text-right border-collapse text-[11px]">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="py-1.5 px-2">کد و نام حساب</th>
                        <th className="py-1.5 px-2">مانده بک‌آپ</th>
                        <th className="py-1.5 px-2">مانده فعلی</th>
                        <th className="py-1.5 px-2">تفاضل</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                      {activeDiffResult.accountChanges.map((ac) => (
                        <tr key={ac.code}>
                          <td className="py-1.5 px-2 font-sans font-semibold">
                            {ac.code} — {ac.name}
                          </td>
                          <td className="py-1.5 px-2">
                            {formatCurrency(ac.snapshotBalance)}
                          </td>
                          <td className="py-1.5 px-2">
                            {formatCurrency(ac.currentBalance)}
                          </td>
                          <td
                            className={`py-1.5 px-2 font-bold ${
                              ac.diffBalance > 0
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {ac.diffBalance > 0
                              ? `+${formatCurrency(ac.diffBalance)}`
                              : formatCurrency(ac.diffBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </PolarisSheet>
    </div>
  );
};
