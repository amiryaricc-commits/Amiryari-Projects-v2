import React, { useState, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Briefcase,
  Truck,
  Megaphone,
  MessageSquare,
  Plus,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronLeft,
  Upload,
  Send,
} from 'lucide-react';
import {
  CrmLeadRecord,
  CustomerContactRecord,
  SalesInvoiceRecord,
  PurchaseInvoiceRecord,
  PaymentEntryRecord,
  BulkSmsContactRecord,
} from '../data/erpSeedData';
import { formatCurrency } from '../utils/erpEngine';

interface CrmMarketingModuleProps {
  leads: CrmLeadRecord[];
  contacts: CustomerContactRecord[];
  salesInvoices: SalesInvoiceRecord[];
  purchaseInvoices: PurchaseInvoiceRecord[];
  paymentEntries: PaymentEntryRecord[];
  bulkSmsPool: BulkSmsContactRecord[];
  privacyMasked?: boolean;
  productionMode: boolean;
  onAddContact: (contact: CustomerContactRecord) => void;
  onAddLead: (lead: CrmLeadRecord) => void;
  onAdvanceLeadStage: (id: string) => void;
  onImportBulkSmsNumbers: (items: BulkSmsContactRecord[]) => void;
  onShowToast: (msg: string) => void;
}

type CrmSixTab =
  | 'all_contacts'
  | 'customers'
  | 'resellers'
  | 'suppliers'
  | 'marketing_leads'
  | 'bulk_sms_pool';

export const CrmMarketingModule: React.FC<CrmMarketingModuleProps> = ({
  leads,
  contacts,
  salesInvoices,
  purchaseInvoices,
  paymentEntries,
  bulkSmsPool,
  privacyMasked = false,
  onAddContact,
  onAddLead,
  onAdvanceLeadStage,
  onImportBulkSmsNumbers,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<CrmSixTab>('all_contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedContactIds, setExpandedContactIds] = useState<Record<string, boolean>>({});
  const [revealedProfitIds, setRevealedProfitIds] = useState<Record<string, boolean>>({});

  // New Contact / Reseller / Supplier Form State
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cCategory, setCCategory] = useState<'customer' | 'reseller' | 'supplier'>('customer');
  const [cVapeStyle, setCVapeStyle] = useState('سالت نیکوتین (MTL)');
  const [cInstagram, setCInstagram] = useState('');
  const [cTelegram, setCTelegram] = useState('');
  const [cProfession, setCProfession] = useState('');

  // Marketing Lead Form State
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSource, setLeadSource] = useState<CrmLeadRecord['source']>('اینستاگرام');
  const [leadCampaign, setLeadCampaign] = useState('کمپین معرفی طعم‌های جدید');
  const [leadStyle, setLeadStyle] = useState<CrmLeadRecord['interestStyle']>('سبک MTL (سیگاری)');

  // Bulk SMS Pool State
  const [bulkRawInput, setBulkRawInput] = useState('');
  const [bulkGroupTag, setBulkGroupTag] = useState('ایمپورت تبلیغاتی ویپ‌شاپ');
  const [smsMessageText, setSmsMessageText] = useState(
    'فروشگاه مرکزی کلودی شاپ: شارژ مجدد سالت و جویس‌های اورجینال با تخفیف جشنواره!'
  );

  // Classify contacts into customer / reseller / supplier
  const enrichedContacts = useMemo(() => {
    return contacts.map((contact) => {
      const roleLower = (contact.role || '').toLowerCase();
      const notesLower = (contact.notes || '').toLowerCase();
      let category: 'customer' | 'reseller' | 'supplier' =
        contact.contactCategory || 'customer';

      if (!contact.contactCategory) {
        if (
          roleLower.includes('تامین') ||
          roleLower.includes('تأمین') ||
          roleLower.includes('فروشنده') ||
          notesLower.includes('تامین')
        ) {
          category = 'supplier';
        } else if (
          roleLower.includes('همکار') ||
          roleLower.includes('ریسلر') ||
          roleLower.includes('عمده') ||
          notesLower.includes('همکار')
        ) {
          category = 'reseller';
        }
      }

      // Compute live invoices & financials for this contact
      const custInvoices = salesInvoices.filter(
        (inv) =>
          inv.docstatus === 1 &&
          inv.status !== 'ابطال‌شده' &&
          inv.customerName.trim() === contact.fullName.trim()
      );
      const suppBills = purchaseInvoices.filter(
        (pinv) =>
          pinv.docstatus === 1 &&
          pinv.status !== 'ابطال‌شده' &&
          pinv.supplierName.trim() === contact.fullName.trim()
      );
      const partyPayments = paymentEntries.filter(
        (pe) => pe.docstatus === 1 && pe.partyName.trim() === contact.fullName.trim()
      );

      let totalPurchasesAmount = contact.manualTotalPurchases || 0;
      let customerNetProfit = contact.manualNetProfit || 0;
      let debitBalance = contact.debitBalance || 0; // بدهکار به ما
      let creditBalance = contact.creditBalance || 0; // طلبکار از ما (بستانکار)

      for (const inv of custInvoices) {
        const isReturn = Boolean(inv.returnAgainst);
        const sign = isReturn ? -1 : 1;
        totalPurchasesAmount += sign * inv.totalAmount;
        const cogs =
          inv.cogsAmount ||
          (inv.lines
            ? inv.lines.reduce((s, l) => s + l.qty * (l.valuationRate || l.unitPrice * 0.72), 0)
            : Math.round(inv.totalAmount * 0.72));
        customerNetProfit += sign * (inv.totalAmount - cogs);

        if (isReturn) {
          if (inv.returnResolutionMode === 'credit_balance' || !inv.returnResolutionMode) {
            creditBalance += inv.totalAmount;
          }
        } else {
          const unpaid = Math.max(0, inv.totalAmount - inv.paidAmount - (inv.creditedAmount || 0));
          debitBalance += unpaid;
        }
      }

      // For suppliers: Trade Payables (بدهی تجاری ما به تأمین‌کننده)
      for (const bill of suppBills) {
        const isDebitReturn = Boolean(bill.returnAgainst);
        if (!isDebitReturn) {
          const unpaidBill = Math.max(
            0,
            bill.totalAmount - (bill.paidAmount || 0) - (bill.creditedAmount || 0)
          );
          creditBalance += unpaidBill;
        }
      }

      // Referral count
      const referredCount = salesInvoices.filter(
        (inv) =>
          inv.docstatus === 1 &&
          inv.referralName &&
          inv.referralName.trim() === contact.fullName.trim()
      ).length;

      return {
        ...contact,
        resolvedCategory: category,
        invoiceCount: custInvoices.length + suppBills.length,
        totalPurchasesAmount: Math.max(0, totalPurchasesAmount),
        customerNetProfit,
        debitBalance,
        creditBalance,
        referredCount,
        custInvoices,
        suppBills,
        partyPayments,
      };
    });
  }, [contacts, salesInvoices, purchaseInvoices, paymentEntries]);

  const visibleContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedContacts.filter((c) => {
      if (activeTab === 'customers' && c.resolvedCategory !== 'customer') return false;
      if (activeTab === 'resellers' && c.resolvedCategory !== 'reseller') return false;
      if (activeTab === 'suppliers' && c.resolvedCategory !== 'supplier') return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.vapingStyle && c.vapingStyle.toLowerCase().includes(q)) ||
        (c.instagramId && c.instagramId.toLowerCase().includes(q)) ||
        (c.profession && c.profession.toLowerCase().includes(q))
      );
    });
  }, [enrichedContacts, activeTab, searchQuery]);

  const handleSaveNewContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;
    const roleLabel =
      cCategory === 'reseller'
        ? 'همکار / ریسلر'
        : cCategory === 'supplier'
          ? 'تأمین‌کننده'
          : 'مشتری عادی';

    onAddContact({
      id: `crm-c-${Date.now()}`,
      sourceCode: `CRM-${contacts.length + 201}`,
      fullName: cName.trim(),
      personType: 'حقیقی',
      role: roleLabel,
      contactCategory: cCategory,
      phone: cPhone.trim(),
      vapingStyle: cVapeStyle,
      instagramId: cInstagram.trim(),
      telegramId: cTelegram.trim(),
      profession: cProfession.trim(),
      notes: `${roleLabel} — ثبت‌شده در CRM`,
    });
    setCName('');
    setCPhone('');
    setCInstagram('');
    setCTelegram('');
    setCProfession('');
    setShowNewContactModal(false);
    onShowToast(`پروفایل «${cName.trim()}» (${roleLabel}) با موفقیت در CRM ثبت شد.`);
  };

  const handleBulkSmsParseAndImport = () => {
    const rawTokens = bulkRawInput
      .split(/[\n,;|\t]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawTokens.length === 0) {
      onShowToast('لطفاً لیست شماره‌ها را وارد یا از فایل اکسل/CSV جای‌گذاری کنید.');
      return;
    }

    const parsed: BulkSmsContactRecord[] = rawTokens.map((line, i) => {
      const parts = line.split(/[-:]/).map((p) => p.trim());
      const phoneMatch = line.match(/09\d{9}|\+989\d{9}|۰۹[۰-۹]{9}/);
      const phone = phoneMatch ? phoneMatch[0] : parts[0];
      const name = parts.length > 1 ? parts[1] : `مخاطب انبوه #${bulkSmsPool.length + i + 1}`;
      return {
        id: `sms-${Date.now()}-${i}`,
        phone,
        fullName: name,
        groupTag: bulkGroupTag || 'کمپین پیامکی',
        importedAt: '۱۴۰۴/۰۸/۰۲',
      };
    });

    onImportBulkSmsNumbers(parsed);
    setBulkRawInput('');
    onShowToast(
      `${parsed.length} شماره جدید با موفقیت در «استخر لید انبوه» ایمپورت شد (بدون شلوغ شدن لیست مشتریان مغازه).`
    );
  };

  const sixTabs: { id: CrmSixTab; label: string; count: number; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'all_contacts', label: '۱. کل مخاطبین', count: enrichedContacts.length, icon: Users },
    {
      id: 'customers',
      label: '۲. مشتریان عادی',
      count: enrichedContacts.filter((c) => c.resolvedCategory === 'customer').length,
      icon: UserCheck,
    },
    {
      id: 'resellers',
      label: '۳. همکاران / ریسلرها',
      count: enrichedContacts.filter((c) => c.resolvedCategory === 'reseller').length,
      icon: Briefcase,
    },
    {
      id: 'suppliers',
      label: '۴. تأمین‌کنندگان',
      count: enrichedContacts.filter((c) => c.resolvedCategory === 'supplier').length,
      icon: Truck,
    },
    { id: 'marketing_leads', label: '۵. استخر لید تبلیغات', count: leads.length, icon: Megaphone },
    {
      id: 'bulk_sms_pool',
      label: '۶. استخر لید انبوه (SMS)',
      count: bulkSmsPool.length,
      icon: MessageSquare,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            ماژول جامع CRM (مشتریان، ریسلرها، تأمین‌کنندگان و استخرهای لید)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            پروفایل کامل سبک ویپینگ، شبکه‌های اجتماعی، تراز بدهکاری/بستانکاری، سود خالص محرمانه و تاریخچه کشویی فاکتورها
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewContactModal((prev) => !prev)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>ثبت مخاطب جدید (مشتری / ریسلر / تأمین‌کننده)</span>
        </button>
      </div>

      {/* New Contact Form */}
      {showNewContactModal && (
        <form
          onSubmit={handleSaveNewContact}
          className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-indigo-200 dark:border-indigo-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end text-xs"
        >
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              نام و نام خانوادگی / فروشگاه *
            </label>
            <input
              type="text"
              required
              placeholder="مثلاً آرمان رضایی"
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              شماره تماس
            </label>
            <input
              type="text"
              placeholder="0912..."
              value={cPhone}
              onChange={(e) => setCPhone(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              نقش در سیستم (Role)
            </label>
            <select
              value={cCategory}
              onChange={(e) =>
                setCCategory(e.target.value as 'customer' | 'reseller' | 'supplier')
              }
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            >
              <option value="customer">مشتری عادی (Customer)</option>
              <option value="reseller">همکار / ریسلر (Reseller)</option>
              <option value="supplier">تأمین‌کننده بار (Supplier)</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              سبک ویپینگ / حوزه خرید
            </label>
            <input
              type="text"
              placeholder="سالت نیکوتین / پاد / قطعات کامپیوتر"
              value={cVapeStyle}
              onChange={(e) => setCVapeStyle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              آیدی اینستاگرام
            </label>
            <input
              type="text"
              placeholder="@username"
              value={cInstagram}
              onChange={(e) => setCInstagram(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              آیدی تلگرام
            </label>
            <input
              type="text"
              placeholder="@telegram_id"
              value={cTelegram}
              onChange={(e) => setCTelegram(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              حرفه و شغل
            </label>
            <input
              type="text"
              placeholder="مثلاً گیمر / مهندس نرم‌افزار / پخش‌کننده"
              value={cProfession}
              onChange={(e) => setCProfession(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
            />
          </div>
          <button
            type="submit"
            className="py-2 px-4 font-bold bg-slate-900 dark:bg-indigo-600 text-white rounded-lg hover:bg-slate-800"
          >
            ذخیره پروفایل در CRM
          </button>
        </form>
      )}

      {/* 6 Distinct Tabs Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
        {sixTabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 dark:bg-slate-800 rounded">
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* TABS 1, 2, 3, 4: CONTACTS / CUSTOMERS / RESELLERS / SUPPLIERS TABLE WITH EXPANDABLE DRAWER */}
      {(activeTab === 'all_contacts' ||
        activeTab === 'customers' ||
        activeTab === 'resellers' ||
        activeTab === 'suppliers') && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <input
              type="text"
              placeholder="جستجو بر اساس نام، شماره تماس، سبک ویپینگ، اینستاگرام یا شغل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3.5 py-2 text-xs border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
            />
            <div className="text-xs text-slate-500">
              روی هر ردیف کلیک کنید تا تاریخچه کامل فاکتورها، اقلام و تراکنش‌ها به صورت کشویی باز شود.
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">نام و نقش</th>
                  <th className="py-2.5 px-3">شماره تماس · شبکه‌ها</th>
                  <th className="py-2.5 px-3">سبک ویپینگ · شغل</th>
                  <th className="py-2.5 px-3 text-center">تعداد و جمع کل خرید</th>
                  <th className="py-2.5 px-3 text-left">مانده بدهی (بدهکار)</th>
                  <th className="py-2.5 px-3 text-left">مانده بستانکاری (طلبکار)</th>
                  <th className="py-2.5 px-3 text-left">سود خالص حاصل از مشتری</th>
                  <th className="py-2.5 px-3 text-center">ریز تراکنش‌ها</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleContacts.map((c) => {
                  const isExpanded = Boolean(expandedContactIds[c.id]);
                  const isProfitRevealed = Boolean(revealedProfitIds[c.id]) && !privacyMasked;
                  const roleBadgeText =
                    c.resolvedCategory === 'reseller'
                      ? 'ریسلر (همکار)'
                      : c.resolvedCategory === 'supplier'
                        ? 'تأمین‌کننده'
                        : 'مشتری عادی';

                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        onClick={() =>
                          setExpandedContactIds((prev) => ({
                            ...prev,
                            [c.id]: !prev[c.id],
                          }))
                        }
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {c.fullName}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {roleBadgeText} · کد: {c.sourceCode}
                            {c.referredCount > 0 && (
                              <span className="mr-1.5 text-indigo-600 font-semibold">
                                (معرف {c.referredCount} فاکتور)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700 dark:text-slate-300">
                          <div dir="ltr" className="text-right">
                            {c.phone || '—'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {c.instagramId && <span>IG: {c.instagramId} </span>}
                            {c.telegramId && <span>· TG: {c.telegramId}</span>}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          <div>{c.vapingStyle || 'سالت و پاد (عمومی)'}</div>
                          <div className="text-[11px] text-slate-400">{c.profession || '—'}</div>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-center">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {formatCurrency(c.totalPurchasesAmount)} ت
                          </div>
                          <div className="text-[11px] text-slate-500">{c.invoiceCount} فاکتور</div>
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-left font-bold text-rose-600 dark:text-rose-400">
                          {c.debitBalance > 0 ? `${formatCurrency(c.debitBalance)} ت` : '۰'}
                        </td>
                        <td className="py-3 px-3 font-mono tabular-nums text-left font-bold text-emerald-700 dark:text-emerald-400">
                          {c.creditBalance > 0 ? `${formatCurrency(c.creditBalance)} ت` : '۰'}
                        </td>
                        <td
                          className="py-3 px-3 font-mono tabular-nums text-left"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-bold text-indigo-700 dark:text-indigo-400">
                              {isProfitRevealed
                                ? `${formatCurrency(c.customerNetProfit)} ت`
                                : '****'}
                            </span>
                            <button
                              type="button"
                              title="نمایش / مخفی‌سازی سود خالص مشتری"
                              onClick={() =>
                                setRevealedProfitIds((prev) => ({
                                  ...prev,
                                  [c.id]: !prev[c.id],
                                }))
                              }
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              {isProfitRevealed ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1 text-indigo-600 font-semibold">
                            <span>جزئیات</span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronLeft className="w-4 h-4" />
                            )}
                          </span>
                        </td>
                      </tr>

                      {/* Expandable Drawer Row: Full History of Invoices, Items & Financial Transactions */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-800/40">
                          <td colSpan={8} className="p-4 space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                ریز تاریخچه فاکتورها، اقلام خریداری‌شده و تراکنش‌های مالی «{c.fullName}»
                              </span>
                              <span className="text-[11px] text-slate-500">{c.notes}</span>
                            </div>

                            {c.custInvoices.length === 0 &&
                            c.suppBills.length === 0 &&
                            c.partyPayments.length === 0 ? (
                              <div className="text-xs text-slate-500 py-2">
                                هنوز فاکتور یا تراکنش مالی برای این مخاطب ثبت نشده است.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <div className="font-bold text-slate-700 dark:text-slate-300">
                                    فاکتورهای فروش / خرید ({c.custInvoices.length + c.suppBills.length})
                                  </div>
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {c.custInvoices.map((inv) => (
                                      <div
                                        key={inv.id}
                                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2"
                                      >
                                        <div>
                                          <div className="font-mono font-bold text-indigo-700 dark:text-indigo-400">
                                            {inv.invoiceNo} · {inv.date}
                                          </div>
                                          <div className="text-[11px] text-slate-600 dark:text-slate-400">
                                            {inv.itemsSummary}
                                          </div>
                                        </div>
                                        <div className="text-left font-mono">
                                          <div className="font-bold">
                                            {formatCurrency(inv.totalAmount)} ت
                                          </div>
                                          <div className="text-[10px] text-slate-500">
                                            پرداختی: {formatCurrency(inv.paidAmount)} ت
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    {c.suppBills.map((bill) => (
                                      <div
                                        key={bill.id}
                                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2"
                                      >
                                        <div>
                                          <div className="font-mono font-bold text-amber-700">
                                            فاکتور خرید {bill.billNo} · {bill.date}
                                          </div>
                                          <div className="text-[11px] text-slate-600">
                                            {bill.itemsSummary} (سررسید: {bill.settlementDueDate || 'نقد'})
                                          </div>
                                        </div>
                                        <div className="text-left font-mono">
                                          <div className="font-bold">
                                            {formatCurrency(bill.totalAmount)} ت
                                          </div>
                                          <div className="text-[10px] text-rose-600">
                                            مانده بدهی تجاری:{' '}
                                            {formatCurrency(
                                              Math.max(0, bill.totalAmount - (bill.paidAmount || 0))
                                            )}{' '}
                                            ت
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="font-bold text-slate-700 dark:text-slate-300">
                                    اسناد تسویه و دریافت/پرداخت ({c.partyPayments.length})
                                  </div>
                                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                    {c.partyPayments.map((pe) => (
                                      <div
                                        key={pe.id}
                                        className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                                      >
                                        <div>
                                          <div className="font-mono font-semibold">
                                            {pe.paymentNo} · {pe.postingDate}
                                          </div>
                                          <div className="text-[11px] text-slate-500">
                                            {pe.paymentType} ({pe.modeOfPayment})
                                          </div>
                                        </div>
                                        <div className="font-mono font-bold text-emerald-700">
                                          {formatCurrency(pe.amount)} ت
                                        </div>
                                      </div>
                                    ))}
                                    {c.partyPayments.length === 0 && (
                                      <div className="text-[11px] text-slate-400">
                                        تسویه جداگانه‌ای خارج از فاکتور ثبت نشده است.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
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
      )}

      {/* TAB 5: MARKETING LEADS POOL (استخر لید تبلیغات) */}
      {activeTab === 'marketing_leads' && (
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              استخر لید تبلیغات (سرنخ‌های ورودی از اینستاگرام، تلگرام و کمپین‌ها)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ثبت و پیگیری سرنخ‌های تبلیغاتی پیش از تبدیل به مشتری قطعی مغازه
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end text-xs bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div>
              <label className="block font-medium mb-1">نام سرنخ تبلیغاتی *</label>
              <input
                type="text"
                placeholder="نام مخاطب پیج..."
                value={leadName}
                onChange={(e) => setLeadName(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">شماره موبایل / آیدی</label>
              <input
                type="text"
                placeholder="0912..."
                value={leadPhone}
                onChange={(e) => setLeadPhone(e.target.value)}
                className="w-full px-3 py-1.5 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">کانال ورودی</label>
              <select
                value={leadSource}
                onChange={(e) => setLeadSource(e.target.value as CrmLeadRecord['source'])}
                className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="اینستاگرام">دایرکت اینستاگرام</option>
                <option value="تلگرام">کانال تلگرام</option>
                <option value="کمپین اینفلوئنسر">کمپین اینفلوئنسر</option>
                <option value="تماس تلفنی">تماس تلفنی</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">سبک مورد علاقه</label>
              <select
                value={leadStyle}
                onChange={(e) =>
                  setLeadStyle(e.target.value as CrmLeadRecord['interestStyle'])
                }
                className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
              >
                <option value="سبک MTL (سیگاری)">سالت نیکوتین (MTL)</option>
                <option value="سبک DTL (قلیانی)">جویس فری‌بیس (DTL)</option>
                <option value="همکار عمده‌فروش">متقاضی خرید همکاری</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!leadName.trim()) return;
                onAddLead({
                  id: `lead-${Date.now()}`,
                  fullName: leadName.trim(),
                  phone: leadPhone.trim(),
                  source: leadSource,
                  campaignName: leadCampaign,
                  interestStyle: leadStyle,
                  stage: 'سرنخ جدید (Lead)',
                  probability: 50,
                  estimatedValue: 0,
                  loyaltyTier: 'برنزی',
                  loyaltyPoints: 0,
                  clvAmount: 0,
                  lastPurchaseDaysAgo: 0,
                });
                setLeadName('');
                setLeadPhone('');
              }}
              className="py-1.5 px-4 font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              + افزودن به استخر تبلیغات
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">نام سرنخ</th>
                  <th className="py-2.5 px-3">شماره تماس</th>
                  <th className="py-2.5 px-3">کانال · سبک</th>
                  <th className="py-2.5 px-3">وضعیت پیگیری</th>
                  <th className="py-2.5 px-3">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leads.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-3 font-bold">{l.fullName}</td>
                    <td className="py-2.5 px-3 font-mono">{l.phone}</td>
                    <td className="py-2.5 px-3">
                      {l.source} · {l.interestStyle}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-indigo-700">{l.stage}</td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onAdvanceLeadStage(l.id)}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded font-semibold hover:bg-slate-200"
                      >
                        ارتقای مرحله پیگیری ←
                      </button>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      هنوز سرنخ تبلیغاتی در این استخر ثبت نشده است.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: BULK SMS POOL (استخر لید انبوه با ایمپورت یکجای CSV/اکسل بدون شلوغ کردن لیست مشتریان مغازه) */}
      {activeTab === 'bulk_sms_pool' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  ایمپورت دسته‌جمعی شماره‌ها (استخر لید انبوه SMS)
                </h3>
                <p className="text-xs text-slate-500">
                  ورود یکجای ۱۰۰۰+ شماره از اکسل/CSV صرفاً برای اس‌ام‌اس مارکتینگ، کاملاً ایزوله از لیست مشتریان مغازه
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  برچسب دسته ایمپورت (Tag)
                </label>
                <input
                  type="text"
                  value={bulkGroupTag}
                  onChange={(e) => setBulkGroupTag(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  جای‌گذاری لیست شماره‌ها (هر خط یا با ویرگول جدا شده — مثلاً 09121112233)
                </label>
                <textarea
                  rows={5}
                  placeholder={'09121112233 - علی حسینی\n09123334455\n09351112233'}
                  value={bulkRawInput}
                  onChange={(e) => setBulkRawInput(e.target.value)}
                  className="w-full p-3 font-mono border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <button
                type="button"
                onClick={handleBulkSmsParseAndImport}
                className="w-full py-2.5 px-4 font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
              >
                + ایمپورت یکجا به استخر لید انبوه
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  بانک شماره‌های استخر انبوه ({bulkSmsPool.length} شماره)
                </h3>
                <p className="text-xs text-slate-500">آماده ارسال پیامک جشنواره و اطلاع‌رسانی</p>
              </div>
              <Send className="w-4 h-4 text-emerald-600" />
            </div>

            <div className="space-y-2 text-xs">
              <label className="block font-medium">متن پیامک انبوه</label>
              <textarea
                rows={2}
                value={smsMessageText}
                onChange={(e) => setSmsMessageText(e.target.value)}
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800"
              />
              <button
                type="button"
                onClick={() =>
                  onShowToast(
                    `پیامک جشنواره در صف ارسال برای ${bulkSmsPool.length} شماره در استخر لید انبوه قرار گرفت.`
                  )
                }
                className="px-4 py-2 font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                ارسال پیامک به کل استخر انبوه ({bulkSmsPool.length} نفر)
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">شماره موبایل</th>
                    <th className="py-2 px-3">نام</th>
                    <th className="py-2 px-3">دسته / تگ</th>
                    <th className="py-2 px-3">تاریخ ورود</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {bulkSmsPool.map((b) => (
                    <tr key={b.id}>
                      <td className="py-1.5 px-3 font-mono font-bold" dir="ltr">
                        {b.phone}
                      </td>
                      <td className="py-1.5 px-3">{b.fullName}</td>
                      <td className="py-1.5 px-3 text-slate-500">{b.groupTag}</td>
                      <td className="py-1.5 px-3 font-mono text-slate-400">{b.importedAt}</td>
                    </tr>
                  ))}
                  {bulkSmsPool.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        استخر لید انبوه خالی است؛ از کادر سمت راست شماره‌ها را ایمپورت کنید.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
