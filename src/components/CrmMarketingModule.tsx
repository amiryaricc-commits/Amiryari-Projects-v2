import React, { useState } from 'react';
import {
  Users,
  Megaphone,
  Calendar,
  Send,
  Plus,
} from 'lucide-react';
import { CrmLeadRecord, CustomerContactRecord } from '../data/erpSeedData';
import { formatCurrency, stripEnglishTerms } from '../utils/erpEngine';

interface CrmMarketingModuleProps {
  leads: CrmLeadRecord[];
  contacts: CustomerContactRecord[];
  productionMode: boolean;
  onAddLead: (lead: CrmLeadRecord) => void;
  onAdvanceLeadStage: (id: string) => void;
  onShowToast: (msg: string) => void;
}

export const CrmMarketingModule: React.FC<CrmMarketingModuleProps> = ({
  leads,
  contacts,
  productionMode,
  onAddLead,
  onAdvanceLeadStage,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<
    'pipeline' | 'campaigns' | 'appointments' | 'newsletter' | 'contacts'
  >('contacts');
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSource, setLeadSource] = useState<CrmLeadRecord['source']>('اینستاگرام');
  const [leadStyle, setLeadStyle] = useState<CrmLeadRecord['interestStyle']>('سبک MTL (سیگاری)');
  const leadValue = 0;

  // Newsletter state
  const [selectedSegment, setSelectedSegment] = useState<'MTL' | 'DTL' | 'B2B'>('MTL');
  const [newsletterSubject, setNewsletterSubject] = useState('');

  const handleCreateLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim()) return;
    onAddLead({
      id: `crm-${Date.now()}`,
      fullName: leadName.trim(),
      phone: leadPhone.trim(),
      source: leadSource,
      campaignName: '',
      interestStyle: leadStyle,
      stage: 'سرنخ جدید (Lead)',
      probability: 40,
      estimatedValue: leadValue,
      loyaltyTier: 'برنزی',
      loyaltyPoints: 0,
      clvAmount: 0,
      lastPurchaseDaysAgo: 0,
    });
    setLeadName('');
    setLeadPhone('');
    setShowNewLeadForm(false);
    onShowToast('سرنخ فروش جدید در قیف ارتباط با مشتریان ثبت شد.');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            ارتباط با مشتریان و بازاریابی
          </h2>
          <p className="text-sm text-slate-500">
            قیف سرنخ‌های فروش، کمپین‌های تبلیغاتی، تقویم جلسات و ارسال خبرنامه هدفمند
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewLeadForm(!showNewLeadForm)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>ثبت سرنخ فروش جدید</span>
        </button>
      </div>

      {showNewLeadForm && (
        <form
          onSubmit={handleCreateLead}
          className="bg-white p-5 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-5 gap-3 items-end text-xs"
        >
          <div>
            <label className="block font-medium text-slate-700 mb-1">نام مخاطب / فروشگاه</label>
            <input
              type="text"
              required
              placeholder="مثلاً کامران تقوی"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">شماره تماس</label>
            <input
              type="text"
              placeholder="۰۹۱۲..."
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">کانال ورودی تبلیغات</label>
            <select
              aria-label="کانال ورودی سرنخ"
              value={leadSource}
              onChange={(e) => setLeadSource(e.target.value as CrmLeadRecord['source'])}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="اینستاگرام">اینستاگرام</option>
              <option value="تلگرام">تلگرام</option>
              <option value="کمپین اینفلوئنسر">کمپین اینفلوئنسر</option>
              <option value="تماس تلفنی">تماس تلفنی</option>
              <option value="مراجعه حضوری">مراجعه حضوری</option>
            </select>
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">سبک مورد علاقه</label>
            <select
              aria-label="سبک مورد علاقه مشتری"
              value={leadStyle}
              onChange={(e) => setLeadStyle(e.target.value as CrmLeadRecord['interestStyle'])}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            >
              <option value="سبک MTL (سیگاری)">سبک سیگاری (سالت نیکوتین)</option>
              <option value="سبک DTL (قلیانی)">سبک قلیانی (جویس)</option>
              <option value="همکار عمده‌فروش">همکار عمده‌فروش</option>
            </select>
          </div>
          <button
            type="submit"
            className="px-4 py-2 font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
          >
            افزودن به قیف فروش
          </button>
        </form>
      )}

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-200/70 rounded-xl w-fit">
        {(productionMode
          ? [
              { id: 'pipeline', label: 'سرنخ‌های واقعی', icon: Users },
              { id: 'contacts', label: 'مخاطبین حسابفا', icon: Users },
            ]
          : [
              { id: 'pipeline', label: 'قیف فروش و مشتریان', icon: Users },
              { id: 'campaigns', label: 'کمپین‌های تبلیغاتی', icon: Megaphone },
              { id: 'appointments', label: 'تقویم و قرار ملاقات', icon: Calendar },
              { id: 'newsletter', label: 'خبرنامه و پیام گروهی', icon: Send },
            ]
        ).map((t) => {
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

      {/* TAB 1: LEADS, OPPORTUNITIES & CUSTOMER ANALYTICS */}
      {activeTab === 'pipeline' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">
              سرنخ‌ها، فرصت‌های فروش و وفاداری مشتریان
            </h3>
            <p className="text-xs text-slate-500">
              پایش احتمال موفقیت معامله، فاصله زمانی آخرین خرید و ارزش طول عمر هر مشتری
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="py-2.5 px-3">مشتری / سرنخ</th>
                  <th className="py-2.5 px-3">منبع ورودی · کمپین · سبک</th>
                  <th className="py-2.5 px-3">مرحله فعلی قیف فروش</th>
                  <th className="py-2.5 px-3">احتمال موفقیت</th>
                  <th className="py-2.5 px-3 text-left">ارزش طول عمر مشتری</th>
                  <th className="py-2.5 px-3">وضعیت وفاداری / ریزش</th>
                  <th className="py-2.5 px-3">ارتقای مرحله</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{lead.fullName}</div>
                      <div className="font-mono text-slate-500">{lead.phone}</div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <span>{lead.source}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span>{lead.campaignName}</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-medium text-indigo-700">
                        {lead.interestStyle.replace('MTL ', '').replace('DTL ', '')}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {stripEnglishTerms(lead.stage)}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-emerald-700">
                      {lead.probability}٪
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-left">
                      {formatCurrency(lead.clvAmount)} ت
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={
                          lead.lastPurchaseDaysAgo > 30
                            ? 'text-rose-700 font-semibold'
                            : 'text-emerald-700 font-medium'
                        }
                      >
                        آخرین خرید: {lead.lastPurchaseDaysAgo} روز پیش (
                        {lead.lastPurchaseDaysAgo > 30 ? 'هشدار ریزش' : `فعال - ${lead.loyaltyTier}`}
                        )
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        type="button"
                        onClick={() => onAdvanceLeadStage(lead.id)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                      >
                        ارتقا به مرحله بعد ←
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-3">کد حسابفا</th>
                <th className="p-3">نام مخاطب</th>
                <th className="p-3">نوع و نقش</th>
                <th className="p-3">شماره موبایل</th>
                <th className="p-3">توضیحات منبع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td className="p-3 font-mono">{contact.sourceCode}</td>
                  <td className="p-3 font-semibold">{contact.fullName}</td>
                  <td className="p-3">{contact.personType} · {contact.role}</td>
                  <td className="p-3" dir="ltr">{contact.phone || '—'}</td>
                  <td className="p-3 text-slate-500">{contact.notes || '—'}</td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    مخاطبی ثبت نشده است.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: CAMPAIGN & UTM TRACKING */}
      {activeTab === 'campaigns' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            عملکرد کمپین‌های تبلیغاتی و نرخ بازگشت سرمایه
          </h3>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            داده‌ای برای محاسبه عملکرد کمپین‌ها ثبت نشده است.
          </div>
        </div>
      )}

      {/* TAB 3: APPOINTMENTS & GOOGLE CALENDAR */}
      {activeTab === 'appointments' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                قرارهای ملاقات حضوری و مشاوره فروش
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مدیریت رزرو وقت بازدید از شوروم و جلسات فروش عمده همگام با تقویم سازمانی
              </p>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            هنوز قرار ملاقاتی ثبت نشده است.
          </div>
        </div>
      )}

      {/* TAB 4: NEWSLETTER & SEGMENTED MESSAGING */}
      {activeTab === 'newsletter' && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              ارسال خبرنامه و پیام گروهی هوشمند
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              تفکیک مخاطبان بر اساس علاقه‌مندی فنی (طرفداران سبک سیگاری، سبک قلیانی یا خریداران عمده)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {[
              { id: 'MTL', label: 'گروه طرفداران سبک سیگاری (سالت نیکوتین) — ۱,۲۴۰ عضو' },
              { id: 'DTL', label: 'گروه طرفداران سبک قلیانی (جویس) — ۸۹۰ عضو' },
              { id: 'B2B', label: 'همکاران و پخش‌کنندگان عمده — ۱۶۵ عضو' },
            ].map((seg) => (
              <button
                key={seg.id}
                type="button"
                onClick={() => setSelectedSegment(seg.id as 'MTL' | 'DTL' | 'B2B')}
                className={`px-3.5 py-2 rounded-lg font-semibold border transition-colors ${
                  selectedSegment === seg.id
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                {seg.label}
              </button>
            ))}
          </div>

          <div className="space-y-2 text-xs">
            <label className="block font-medium text-slate-700">متن پیامک / خبرنامه ایمیلی و تلگرامی</label>
            <textarea
              rows={3}
              aria-label="متن خبرنامه"
              value={newsletterSubject}
              onChange={(e) => setNewsletterSubject(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              onShowToast(
                'خبرنامه هدفمند برای اعضای گروه انتخابی با موفقیت در صف ارسال قرار گرفت.'
              )
            }
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            ارسال فوری خبرنامه به اعضای گروه انتخابی
          </button>
        </div>
      )}
    </div>
  );
};
