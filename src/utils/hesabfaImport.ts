import type {
  CustomerContactRecord,
  InventoryItemRecord,
  SalesInvoiceRecord,
} from '../data/erpSeedData';

export interface HesabfaImportPayload {
  schemaVersion: 1;
  inventoryBasis: 'current_snapshot';
  salesInvoiceMode: 'archive_only';
  contacts: CustomerContactRecord[];
  products: InventoryItemRecord[];
  salesInvoices: SalesInvoiceRecord[];
  heldInvoiceNumbers: string[];
  corrections: string[];
}

export interface HesabfaImportSummary {
  contactCount: number;
  productCount: number;
  invoiceCount: number;
  draftCount: number;
  heldInvoiceNumbers: string[];
  salesTotal: number;
  paidTotal: number;
  receivableTotal: number;
  stockUnitTotal: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStringFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return isRecord(value) && fields.every((field) => typeof value[field] === 'string');
}

function hasFiniteNumberFields(value: unknown, fields: string[]): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    fields.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCustomerContact(value: unknown): value is CustomerContactRecord {
  return hasStringFields(value, [
    'id',
    'sourceCode',
    'fullName',
    'personType',
    'role',
    'phone',
    'notes',
  ]);
}

function isInventoryItem(value: unknown): value is InventoryItemRecord {
  return (
    hasStringFields(value, [
      'id',
      'sku',
      'name',
      'category',
      'brand',
      'uomPrimary',
      'batchNo',
      'expiryDate',
      'sourceCategory',
      'sourceStatus',
    ]) &&
    [
      'دستگاه پاد و ماد',
      'جویس و سالت',
      'کویل و کارتریج',
      'پکیج باندل',
      'کارت هدیه و خدمات',
      'سایر کالاها',
    ].includes(value.category as InventoryItemRecord['category']) &&
    hasFiniteNumberFields(value, [
      'stockQty',
      'reservedQty',
      'reorderLevel',
      'valuationRate',
      'retailPrice',
      'wholesalePrice',
      'partnerPrice',
    ]) &&
    isStringArray(value.serialNumbers) &&
    (value.flavor === undefined || typeof value.flavor === 'string') &&
    (value.nicotine === undefined || typeof value.nicotine === 'string') &&
    (value.condition === undefined ||
      value.condition === 'آکبند شرکتی' ||
      value.condition === 'کارکرده / تستر') &&
    (value.isBundle === undefined || typeof value.isBundle === 'boolean') &&
    (value.bundleComponents === undefined || isStringArray(value.bundleComponents)) &&
    (value.bundleComponentItems === undefined || Array.isArray(value.bundleComponentItems)) &&
    (value.daysInStock === undefined ||
      (typeof value.daysInStock === 'number' && Number.isFinite(value.daysInStock)))
  );
}

function isSalesInvoice(value: unknown): value is SalesInvoiceRecord {
  const validStatus =
    isRecord(value) &&
    [
      'پیش‌نویس',
      'پرداخت‌شده',
      'اقساطی فعال',
      'معوق',
      'مرجوعی (یادداشت بستانکاری)',
      'ابطال‌شده',
    ].includes(value.status as SalesInvoiceRecord['status']);
  return (
    hasStringFields(value, [
      'id',
      'invoiceNo',
      'sourceStatus',
      'customerName',
      'date',
      'dueDate',
      'branchDimension',
      'channelDimension',
      'paymentTermsTemplate',
      'status',
      'itemsSummary',
      'archiveNote',
    ]) &&
    validStatus &&
    hasFiniteNumberFields(value, ['docstatus', 'totalAmount', 'paidAmount']) &&
    Number.isInteger(value.docstatus) &&
    (value.docstatus === 0 || value.docstatus === 1) &&
    value.isHistoricalArchive === true &&
    value.updateStock === false &&
    typeof value.isSubscription === 'boolean' &&
    (value.costCenter === undefined || typeof value.costCenter === 'string') &&
    (value.creditedAmount === undefined ||
      (typeof value.creditedAmount === 'number' && Number.isFinite(value.creditedAmount))) &&
    (value.returnAgainst === undefined || typeof value.returnAgainst === 'string') &&
    (value.cogsAmount === undefined ||
      (typeof value.cogsAmount === 'number' && Number.isFinite(value.cogsAmount))) &&
    (value.subscriptionInterval === undefined || typeof value.subscriptionInterval === 'string') &&
    (value.lines === undefined ||
      (Array.isArray(value.lines) &&
        value.lines.every(
          (line) =>
            hasStringFields(line, ['id', 'sku', 'itemName', 'uom']) &&
            hasFiniteNumberFields(line, [
              'qty',
              'unitPrice',
              'discountPercent',
              'netLineAmount',
              'valuationRate',
            ])
        )))
  );
}

function assertUnique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`فهرست ${label} شامل شناسه‌ی تکراری است.`);
  }
}

export function parseHesabfaImportPayload(value: unknown): HesabfaImportPayload {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.inventoryBasis !== 'current_snapshot' ||
    value.salesInvoiceMode !== 'archive_only'
  ) {
    throw new Error('نسخه‌ی فایل ورود حسابفا معتبر نیست.');
  }
  const { contacts, products, salesInvoices, heldInvoiceNumbers, corrections } = value;
  if (
    !Array.isArray(contacts) ||
    !Array.isArray(products) ||
    !Array.isArray(salesInvoices) ||
    !Array.isArray(heldInvoiceNumbers) ||
    !Array.isArray(corrections)
  ) {
    throw new Error('ساختار فایل ورود حسابفا ناقص است.');
  }
  if (
    contacts.length === 0 ||
    products.length === 0 ||
    salesInvoices.length === 0 ||
    !contacts.every(isCustomerContact) ||
    !products.every(isInventoryItem) ||
    !salesInvoices.every(isSalesInvoice) ||
    !isStringArray(heldInvoiceNumbers) ||
    !isStringArray(corrections)
  ) {
    throw new Error('یکی از رکوردهای فایل ورود حسابفا معتبر نیست.');
  }

  assertUnique(contacts.map((contact) => contact.id), 'مخاطبین');
  assertUnique(products.map((product) => product.sku), 'کالاها');
  assertUnique(salesInvoices.map((invoice) => invoice.invoiceNo), 'فاکتورها');
  assertUnique(heldInvoiceNumbers, 'فاکتورهای معلق');
  if (salesInvoices.some((invoice) => heldInvoiceNumbers.includes(invoice.invoiceNo))) {
    throw new Error('فاکتور معلق نباید در فهرست فاکتورهای قابل ورود باشد.');
  }

  const productSkus = new Set(products.map((product) => product.sku));
  if (
    products.some(
      (product) =>
        product.stockQty < 0 ||
        product.valuationRate < 0 ||
        product.retailPrice < 0 ||
        !Number.isInteger(product.stockQty)
    ) ||
    salesInvoices.some(
      (invoice) =>
        invoice.totalAmount < 0 ||
        invoice.paidAmount < 0 ||
        invoice.paidAmount > invoice.totalAmount ||
        invoice.docstatus < 0 ||
        invoice.docstatus > 1 ||
        invoice.lines?.some(
          (line) =>
            line.qty <= 0 ||
            line.netLineAmount < 0 ||
            (line.sku && !productSkus.has(line.sku))
        ) ||
        invoice.lines?.reduce((sum, line) => sum + line.netLineAmount, 0) !== invoice.totalAmount
    )
  ) {
    throw new Error('مقادیر عددی یا ارجاع کالای یکی از رکوردها نامعتبر است.');
  }
  if (salesInvoices.some((invoice) => invoice.isHistoricalArchive && invoice.updateStock)) {
    throw new Error('فاکتور آرشیوی نباید موجودی کالا را تغییر دهد.');
  }

  return {
    schemaVersion: 1,
    inventoryBasis: 'current_snapshot',
    salesInvoiceMode: 'archive_only',
    contacts,
    products,
    salesInvoices,
    heldInvoiceNumbers,
    corrections,
  };
}

export function summarizeHesabfaImport(payload: HesabfaImportPayload): HesabfaImportSummary {
  const salesTotal = payload.salesInvoices.reduce((total, invoice) => total + invoice.totalAmount, 0);
  const paidTotal = payload.salesInvoices.reduce((total, invoice) => total + invoice.paidAmount, 0);
  return {
    contactCount: payload.contacts.length,
    productCount: payload.products.length,
    invoiceCount: payload.salesInvoices.length,
    draftCount: payload.salesInvoices.filter((invoice) => invoice.docstatus === 0).length,
    heldInvoiceNumbers: payload.heldInvoiceNumbers,
    salesTotal,
    paidTotal,
    receivableTotal: salesTotal - paidTotal,
    stockUnitTotal: payload.products.reduce((total, product) => total + product.stockQty, 0),
  };
}
