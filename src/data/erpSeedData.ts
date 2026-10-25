export type DocStatus = 0 | 1 | 2; // 0 = پیش‌نویس، 1 = ثبت قطعی، 2 = ابطال‌شده

export interface AccountNode {
  id: string;
  code: string;
  name: string;
  category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
  level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
  parentCode?: string;
  openingBalance?: number;
  balance: number;
  currency: 'IRR' | 'USD' | 'AED';
}

export interface GLEntryRecord {
  id: string;
  postingDate: string;
  accountCode: string;
  accountName: string;
  partyType?: 'مشتری' | 'تامین‌کننده' | 'سهامدار' | '—';
  partyName?: string;
  debit: number;
  credit: number;
  voucherType:
    | 'Sales Invoice'
    | 'Purchase Invoice'
    | 'Journal Entry'
    | 'Payment Entry'
    | 'POS Invoice'
    | 'Cheque Clearance'
    | 'Stock Reconciliation';
  voucherNo: string;
  costCenter: string;
  branchDimension: string;
  remarks?: string;
  isCancelled?: boolean;
  isReversal?: boolean;
}

export interface InvoiceLineItem {
  id: string;
  sku: string;
  itemName: string;
  uom: string;
  qty: number;
  unitPrice: number;
  discountPercent: number;
  netLineAmount: number;
  valuationRate: number;
}

export interface SalesInvoiceRecord {
  id: string;
  invoiceNo: string;
  docstatus: DocStatus;
  isHistoricalArchive?: boolean;
  archiveNote?: string;
  sourceStatus?: string;
  customerName: string;
  date: string;
  dueDate: string;
  branchDimension: string;
  costCenter?: string;
  channelDimension: string;
  paymentTermsTemplate: string;
  updateStock: boolean;
  isSubscription: boolean;
  subscriptionInterval?: string;
  status: 'پیش‌نویس' | 'پرداخت‌شده' | 'اقساطی فعال' | 'معوق' | 'مرجوعی (یادداشت بستانکاری)' | 'ابطال‌شده';
  totalAmount: number;
  paidAmount: number;
  creditedAmount?: number;
  returnAgainst?: string;
  cogsAmount?: number;
  itemsSummary: string;
  lines?: InvoiceLineItem[];
}

export interface PurchaseInvoiceRecord {
  id: string;
  billNo: string;
  docstatus: DocStatus;
  supplierName: string;
  date: string;
  warehouse: string;
  branchDimension?: string;
  costCenter?: string;
  status: 'پیش‌نویس' | 'تسویه‌شده' | 'بدهکار باز' | 'برگشت از خرید (یادداشت بدهکاری)' | 'ابطال‌شده';
  totalAmount: number;
  paidAmount?: number;
  creditedAmount?: number;
  returnAgainst?: string;
  landedCostAdded: number;
  itemsSummary: string;
  lines?: InvoiceLineItem[];
}

export interface JournalEntryRecord {
  id: string;
  voucherNo: string;
  postingDate: string;
  docstatus: DocStatus;
  title: string;
  branchDimension: string;
  totalDebit: number;
  totalCredit: number;
  lines: {
    id: string;
    accountCode: string;
    accountName: string;
    partyType?: 'مشتری' | 'تامین‌کننده' | 'سهامدار' | '—';
    partyName?: string;
    costCenter?: string;
    dimensionBranch?: string;
    debit: number;
    credit: number;
    note?: string;
  }[];
}

export interface PaymentEntryRecord {
  id: string;
  paymentNo: string;
  postingDate: string;
  docstatus: DocStatus;
  paymentType:
    | 'دریافت از مشتری (Receive)'
    | 'پرداخت به تامین‌کننده (Pay)'
    | 'بازپرداخت به مشتری (Refund)';
  partyName: string;
  modeOfPayment: 'حواله بانکی پایا/ساتنا' | 'کارتخوان (POS)' | 'نقد (صندوق)' | 'چک صیادی';
  bankAccountCode: string;
  referenceVoucherNo: string;
  amount: number;
  branchDimension: string;
  costCenter: string;
}

export interface ChequeRecord {
  id: string;
  sayadiNo: string;
  type: 'دریافتنی از مشتری' | 'پرداختنی به تامین‌کننده';
  partyName: string;
  bankName: string;
  amount: number;
  dueDate: string;
  clearanceDate?: string;
  status: 'در جریان وصول' | 'وصول‌شده (پاس‌شده)' | 'خرج‌شده' | 'برگشتی';
}

export interface CostCenterRecord {
  id: string;
  code: string;
  name: string;
  parentName: string;
  allocatedBudget: number;
  spentAmount: number;
  revenueGenerated: number;
  controlPolicy: 'WARN' | 'STOP';
  autoAllocationPercent: number;
}

export interface FixedAssetRecord {
  id: string;
  assetTag: string;
  name: string;
  category: 'تجهیزات فناوری' | 'دکوراسیون و فروشگاهی' | 'وسایل نقلیه';
  location: string;
  purchaseDate: string;
  purchaseValue: number;
  currentBookValue: number;
  status: 'فعال در بهره‌برداری' | 'فروخته‌شده' | 'اسقاط‌شده' | 'تجدید ارزیابی‌شده';
}

export interface ShareholderRecord {
  id: string;
  name: string;
  folioNo: string;
  sharesCount: number;
  ownershipPercent: number;
  capitalBalance: number;
  dividendPaid: number;
}

export interface BundleComponentSpec {
  sku: string;
  name: string;
  qty: number;
}

export interface InventoryItemRecord {
  id: string;
  sku: string;
  name: string;
  category:
    | 'دستگاه پاد و ماد'
    | 'جویس و سالت'
    | 'کویل و کارتریج'
    | 'پکیج باندل'
    | 'کارت هدیه و خدمات'
    | 'سایر کالاها';
  brand: string;
  isActive?: boolean;
  flavor?: string;
  nicotine?: string;
  condition?: 'آکبند شرکتی' | 'کارکرده / تستر';
  isBundle?: boolean;
  bundleComponents?: string[];
  bundleComponentItems?: BundleComponentSpec[];
  uomPrimary: string;
  stockQty: number;
  reservedQty: number;
  reorderLevel: number;
  valuationRate: number;
  retailPrice: number;
  wholesalePrice: number;
  partnerPrice: number;
  serialNumbers: string[];
  batchNo: string;
  expiryDate: string;
  sourceCategory?: string;
  sourceStatus?: string;
  daysInStock?: number;
}

export interface CustomerContactRecord {
  id: string;
  sourceCode: string;
  fullName: string;
  personType: string;
  role: string;
  phone: string;
  notes: string;
}

export interface CrmLeadRecord {
  id: string;
  fullName: string;
  phone: string;
  source: 'اینستاگرام' | 'تلگرام' | 'تماس تلفنی' | 'مراجعه حضوری' | 'کمپین اینفلوئنسر';
  campaignName: string;
  interestStyle: 'سبک MTL (سیگاری)' | 'سبک DTL (قلیانی)' | 'همکار عمده‌فروش';
  stage: 'سرنخ جدید (Lead)' | 'مذاکره و فرصت (Opportunity)' | 'ارسال پیش‌فاکتور' | 'مشتری وفادار';
  probability: number;
  estimatedValue: number;
  loyaltyTier: 'طلایی' | 'نقره‌ای' | 'برنزی';
  loyaltyPoints: number;
  clvAmount: number;
  lastPurchaseDaysAgo: number;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  docType: string;
  docId: string;
  fieldChanged: string;
  oldValue: string;
  newValue: string;
}

export const INITIAL_ACCOUNTS: AccountNode[] = [
  // ۱۰۰۰ - دارایی‌ها
  { id: 'acc-1', code: '1000', name: 'دارایی‌ها', category: 'دارایی', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-2', code: '1100', name: 'دارایی‌های جاری و نقدینگی', category: 'دارایی', level: 'کل', parentCode: '1000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-3', code: '1101', name: 'موجودی نقد و بانک‌های ریالی', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-4', code: '110101', name: 'بانک ملت — جاری شعبه مرکزی', category: 'دارایی', level: 'تفصیلی', parentCode: '1101', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-5', code: '110102', name: 'صندوق و کارتخوان شعبه الهیه', category: 'دارایی', level: 'تفصیلی', parentCode: '1101', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-6', code: '1102', name: 'حساب‌های دریافتنی تجاری', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-7', code: '1103', name: 'اسناد دریافتنی در جریان وصول', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-8', code: '1104', name: 'موجودی کالای انبار مرکزی', category: 'دارایی', level: 'معین', parentCode: '1100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-9', code: '1200', name: 'دارایی‌های ثابت مشهود', category: 'دارایی', level: 'کل', parentCode: '1000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-9b', code: '1201', name: 'اموال، ماشین‌آلات و تجهیزات', category: 'دارایی', level: 'معین', parentCode: '1200', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۲۰۰۰ - بدهی‌ها
  { id: 'acc-10', code: '2000', name: 'بدهی‌ها و تعهدات', category: 'بدهی', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-10b', code: '2100', name: 'بدهی‌های جاری تجاری', category: 'بدهی', level: 'کل', parentCode: '2000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-11', code: '2101', name: 'حساب‌های پرداختنی تجاری', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-13', code: '2103', name: 'ذخیره پورسانت فروشندگان', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-13b', code: '2104', name: 'حساب واسط ترخیص و گمرک', category: 'بدهی', level: 'معین', parentCode: '2100', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۳۰۰۰ - حقوق صاحبان سهام
  { id: 'acc-14', code: '3000', name: 'حقوق صاحبان سهام و سرمایه', category: 'سرمایه', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-14b', code: '3100', name: 'سرمایه و اندوخته‌های قانونی', category: 'سرمایه', level: 'کل', parentCode: '3000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-15', code: '3101', name: 'سرمایه ثبت‌شده سهامداران', category: 'سرمایه', level: 'معین', parentCode: '3100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-16', code: '3102', name: 'سود و زیان انباشته سنواتی', category: 'سرمایه', level: 'معین', parentCode: '3100', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۴۰۰۰ - درآمدها
  { id: 'acc-17', code: '4000', name: 'درآمدهای عملیاتی و فروش', category: 'درآمد', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-17b', code: '4100', name: 'درآمد فروش کالا و خدمات', category: 'درآمد', level: 'کل', parentCode: '4000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-18', code: '4101', name: 'درآمد فروش خالص کالا', category: 'درآمد', level: 'معین', parentCode: '4100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-19', code: '4102', name: 'درآمد اشتراک‌های دوره‌ای', category: 'درآمد', level: 'معین', parentCode: '4100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-19b', code: '4103', name: 'سود حاصل از تعدیل موجودی انبار', category: 'درآمد', level: 'معین', parentCode: '4100', openingBalance: 0, balance: 0, currency: 'IRR' },

  // ۵۰۰۰ - هزینه‌ها و بهای تمام‌شده
  { id: 'acc-20', code: '5000', name: 'بهای تمام‌شده و هزینه‌های عملیاتی', category: 'هزینه', level: 'گروه', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-20b', code: '5100', name: 'بهای تمام‌شده و هزینه‌های فروش', category: 'هزینه', level: 'کل', parentCode: '5000', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-21', code: '5101', name: 'بهای تمام‌شده کالای فروش‌رفته', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-22', code: '5201', name: 'هزینه پورسانت فروش و بازاریابی', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-23', code: '5202', name: 'هزینه اجاره و نگهداری شعب', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
  { id: 'acc-23b', code: '5203', name: 'هزینه کسری و ضایعات انبار', category: 'هزینه', level: 'معین', parentCode: '5100', openingBalance: 0, balance: 0, currency: 'IRR' },
];

export const INITIAL_GL_ENTRIES: GLEntryRecord[] = [];

export const INITIAL_SALES_INVOICES: SalesInvoiceRecord[] = [];

export const INITIAL_PURCHASE_INVOICES: PurchaseInvoiceRecord[] = [];

export const INITIAL_JOURNAL_ENTRIES: JournalEntryRecord[] = [];

export const INITIAL_PAYMENT_ENTRIES: PaymentEntryRecord[] = [];

export const INITIAL_CHEQUES: ChequeRecord[] = [];

export const INITIAL_COST_CENTERS: CostCenterRecord[] = [];

export const INITIAL_FIXED_ASSETS: FixedAssetRecord[] = [];

export const INITIAL_SHAREHOLDERS: ShareholderRecord[] = [];

export const INITIAL_INVENTORY_ITEMS: InventoryItemRecord[] = [];

export const INITIAL_CRM_LEADS: CrmLeadRecord[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogRecord[] = [];
