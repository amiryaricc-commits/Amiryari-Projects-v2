export interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  partyType?: 'مشتری' | 'تامین‌کننده' | 'سهامدار' | '—';
  partyName?: string;
  costCenter?: string;
  dimensionBranch?: string;
  dimensionChannel?: string;
  debit: number;
  credit: number;
  note?: string;
}

export interface InstallmentRule {
  label: string;
  percentage: number;
  dueDays: number;
}

export interface InstallmentScheduleItem {
  label: string;
  percentage: number;
  amount: number;
  dueDays: number;
  status: 'پرداخت‌شده' | 'در انتظار' | 'سررسید گذشته';
}

export interface LandedCostItemInput {
  itemCode: string;
  itemName: string;
  qty: number;
  weightGrams: number;
  unitCost: number;
}

export interface LandedCostItemOutput extends LandedCostItemInput {
  allocatedLandedCost: number;
  finalUnitCost: number;
  finalLineTotal: number;
}

export function formatCurrency(amount: number): string {
  const rounded = Math.round(amount);
  return new Intl.NumberFormat('fa-IR').format(rounded);
}

export function formatPersianDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function getPersianYear(date: Date = new Date()): string {
  return formatPersianDate(date).split('/')[0];
}

export function addDaysToDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function validateSettlementAmount(amount: number, outstanding: number): {
  isValid: boolean;
  errorMessage?: string;
} {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { isValid: false, errorMessage: 'مبلغ تسویه باید بزرگتر از صفر باشد.' };
  }
  if (!Number.isFinite(outstanding) || outstanding <= 0) {
    return { isValid: false, errorMessage: 'فاکتور مرجع مانده قابل تسویه ندارد.' };
  }
  if (amount > outstanding) {
    return { isValid: false, errorMessage: 'مبلغ تسویه نمی‌تواند از مانده فاکتور بیشتر باشد.' };
  }
  return { isValid: true };
}

export function aggregateInvoiceLines<
  T extends { sku: string; qty: number; netLineAmount: number }
>(lines: T[]): T[] {
  const linesBySku = new Map<string, T>();
  for (const line of lines) {
    const existing = linesBySku.get(line.sku);
    if (existing) {
      existing.qty += line.qty;
      existing.netLineAmount += line.netLineAmount;
    } else {
      linesBySku.set(line.sku, { ...line });
    }
  }
  return [...linesBySku.values()];
}

export function validateJournalEntry(
  lines: JournalLine[],
  validAccountCodes?: ReadonlySet<string>
): {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  errorMessage?: string;
} {
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);

  if (lines.length < 2) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'سند روزنامه دوبل باید حداقل شامل ۲ ردیف (بدهکار و بستانکار) باشد.',
    };
  }
  if (
    lines.some(
      (line) =>
        !line.accountCode.trim() ||
        (validAccountCodes !== undefined && !validAccountCodes.has(line.accountCode)) ||
        !Number.isFinite(line.debit) ||
        !Number.isFinite(line.credit) ||
        line.debit < 0 ||
        line.credit < 0 ||
        (line.debit === 0 && line.credit === 0) ||
        (line.debit > 0 && line.credit > 0)
    )
  ) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'هر ردیف باید حساب معتبر و فقط یک مبلغ مثبت در ستون بدهکار یا بستانکار داشته باشد.',
    };
  }
  if (totalDebit <= 0 || totalCredit <= 0) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: 'جمع مبالغ بدهکار و بستانکار باید بزرگتر از صفر باشد.',
    };
  }
  if (difference > 0.01) {
    return {
      isValid: false,
      totalDebit,
      totalCredit,
      difference,
      errorMessage: `سند تراز نیست؛ اختلاف بدهکار و بستانکار: ${formatCurrency(difference)} تومان`,
    };
  }
  return {
    isValid: true,
    totalDebit,
    totalCredit,
    difference: 0,
  };
}

export function calculateInstallments(
  totalAmount: number,
  rules: InstallmentRule[],
  paidFirstInstallment = true
): InstallmentScheduleItem[] {
  if (totalAmount <= 0 || rules.length === 0) return [];
  let allocated = 0;
  return rules.map((rule, index) => {
    const isLast = index === rules.length - 1;
    const amount = isLast
      ? Math.max(0, totalAmount - allocated)
      : Math.round((totalAmount * rule.percentage) / 100);
    allocated += amount;
    return {
      label: rule.label,
      percentage: rule.percentage,
      amount,
      dueDays: rule.dueDays,
      status: index === 0 && paidFirstInstallment && rule.dueDays === 0 ? 'پرداخت‌شده' : 'در انتظار',
    };
  });
}

export function calculateMovingAverageValuation(
  currentQty: number,
  currentValuationRate: number,
  incomingQty: number,
  incomingRate: number
): { newQty: number; newValuationRate: number; totalValue: number } {
  const safeCurrentQty = Math.max(0, currentQty);
  const safeIncomingQty = Math.max(0, incomingQty);
  const newQty = safeCurrentQty + safeIncomingQty;
  if (newQty === 0) {
    return { newQty: 0, newValuationRate: currentValuationRate, totalValue: 0 };
  }
  const totalValue = safeCurrentQty * currentValuationRate + safeIncomingQty * incomingRate;
  const newValuationRate = Math.round(totalValue / newQty);
  return {
    newQty,
    newValuationRate,
    totalValue: newQty * newValuationRate,
  };
}

export function allocateLandedCost(
  items: LandedCostItemInput[],
  totalExtraCharges: number,
  basis: 'amount' | 'qty' | 'weight'
): LandedCostItemOutput[] {
  const totalBasis = items.reduce((sum, item) => {
    if (basis === 'qty') return sum + item.qty;
    if (basis === 'weight') return sum + item.qty * item.weightGrams;
    return sum + item.qty * item.unitCost;
  }, 0);

  if (totalBasis <= 0) {
    return items.map((item) => ({
      ...item,
      allocatedLandedCost: 0,
      finalUnitCost: item.unitCost,
      finalLineTotal: item.qty * item.unitCost,
    }));
  }

  return items.map((item) => {
    const itemBasis =
      basis === 'qty'
        ? item.qty
        : basis === 'weight'
          ? item.qty * item.weightGrams
          : item.qty * item.unitCost;
    const shareRatio = itemBasis / totalBasis;
    const allocatedLandedCost = Math.round(totalExtraCharges * shareRatio);
    const baseTotal = item.qty * item.unitCost;
    const finalLineTotal = baseTotal + allocatedLandedCost;
    const finalUnitCost = item.qty > 0 ? Math.round(finalLineTotal / item.qty) : item.unitCost;
    return {
      ...item,
      allocatedLandedCost,
      finalUnitCost,
      finalLineTotal,
    };
  });
}

export function evaluateBudgetControl(
  allocatedBudget: number,
  spentSoFar: number,
  newExpenseAmount: number,
  actionOnExceed: 'WARN' | 'STOP'
): {
  status: 'OK' | 'WARNING' | 'STOPPED';
  utilizationPercent: number;
  remainingAfter: number;
  message: string;
} {
  const totalAfter = spentSoFar + newExpenseAmount;
  const utilizationPercent =
    allocatedBudget > 0 ? Math.round((totalAfter / allocatedBudget) * 100) : 100;
  const remainingAfter = allocatedBudget - totalAfter;

  if (totalAfter <= allocatedBudget) {
    return {
      status: 'OK',
      utilizationPercent,
      remainingAfter,
      message: `در محدوده بودجه مجاز (${utilizationPercent}٪ مصرف‌شده)`,
    };
  }

  if (actionOnExceed === 'STOP') {
    return {
      status: 'STOPPED',
      utilizationPercent,
      remainingAfter,
      message: `توقف سیستمی: عبور از سقف بودجه به میزان ${formatCurrency(Math.abs(remainingAfter))} تومان (سیاست: جلوگیری از ثبت سند)`,
    };
  }

  return {
    status: 'WARNING',
    utilizationPercent,
    remainingAfter,
    message: `هشدار بودجه: عبور از سقف مجاز به میزان ${formatCurrency(Math.abs(remainingAfter))} تومان (سیاست: ثبت با هشدار به مدیر مالی)`,
  };
}

export function allocateCostCenterExpense(
  totalAmount: number,
  allocations: { costCenterName: string; percentage: number }[]
): { costCenterName: string; percentage: number; allocatedAmount: number }[] {
  return allocations.map((item) => ({
    costCenterName: item.costCenterName,
    percentage: item.percentage,
    allocatedAmount: Math.round((totalAmount * item.percentage) / 100),
  }));
}

export function calculatePosCartTotals(params: {
  items: { price: number; qty: number; category: string }[];
  priceListMultiplier: number;
  couponPercent: number;
  redeemLoyaltyPoints: number;
  partnerCommissionPercent: number;
  promotionRules?: {
    quantityDiscount?: { minimumQuantity: number; percent: number };
    freeGiftMinimumQuantity?: number;
    tomanPerLoyaltyPoint?: number;
  };
}): {
  grossTotal: number;
  pricingRuleDiscount: number;
  couponDiscount: number;
  loyaltyDiscount: number;
  netPayable: number;
  earnedLoyaltyPoints: number;
  partnerCommissionAmount: number;
  freeGiftTriggered: boolean;
} {
  const grossTotal = params.items.reduce(
    (sum, item) => sum + Math.round(item.price * params.priceListMultiplier) * item.qty,
    0
  );
  const totalQty = params.items.reduce((sum, item) => sum + item.qty, 0);

  const quantityDiscount = params.promotionRules?.quantityDiscount;
  const pricingRuleDiscount =
    quantityDiscount && totalQty >= quantityDiscount.minimumQuantity
      ? Math.round(grossTotal * (quantityDiscount.percent / 100))
      : 0;
  const giftThreshold = params.promotionRules?.freeGiftMinimumQuantity;
  const freeGiftTriggered = giftThreshold !== undefined && totalQty >= giftThreshold;

  const afterPricingRule = Math.max(0, grossTotal - pricingRuleDiscount);
  const couponDiscount =
    params.couponPercent > 0
      ? Math.round((afterPricingRule * params.couponPercent) / 100)
      : 0;
  const loyaltyDiscount = Math.min(
    Math.max(0, afterPricingRule - couponDiscount),
    params.redeemLoyaltyPoints * 1000
  );
  const netPayable = Math.max(0, afterPricingRule - couponDiscount - loyaltyDiscount);
  const tomanPerLoyaltyPoint = params.promotionRules?.tomanPerLoyaltyPoint;
  const earnedLoyaltyPoints =
    tomanPerLoyaltyPoint && tomanPerLoyaltyPoint > 0
      ? Math.floor(netPayable / tomanPerLoyaltyPoint)
      : 0;
  const partnerCommissionAmount = Math.round(
    (netPayable * params.partnerCommissionPercent) / 100
  );

  return {
    grossTotal,
    pricingRuleDiscount,
    couponDiscount,
    loyaltyDiscount,
    netPayable,
    earnedLoyaltyPoints,
    partnerCommissionAmount,
    freeGiftTriggered,
  };
}

export function calculateStockReconciliation(
  systemQty: number,
  physicalQty: number,
  valuationRate: number,
  reorderLevel: number
): {
  varianceQty: number;
  varianceValue: number;
  needsAutoReorder: boolean;
  suggestedOrderQty: number;
} {
  const varianceQty = physicalQty - systemQty;
  const varianceValue = varianceQty * valuationRate;
  const needsAutoReorder = physicalQty <= reorderLevel;
  const suggestedOrderQty = needsAutoReorder ? Math.max(10, reorderLevel * 2 - physicalQty) : 0;

  return {
    varianceQty,
    varianceValue,
    needsAutoReorder,
    suggestedOrderQty,
  };
}

export function generateItemVariants(
  baseName: string,
  baseSku: string,
  flavors: string[],
  nicotineLevels: string[]
): { sku: string; variantName: string; flavor: string; nicotine: string }[] {
  const results: { sku: string; variantName: string; flavor: string; nicotine: string }[] = [];
  flavors.forEach((flavor, fIdx) => {
    nicotineLevels.forEach((nic, nIdx) => {
      results.push({
        sku: `${baseSku}-V${fIdx + 1}${nIdx + 1}`,
        variantName: `${baseName} — طعم ${flavor} (${nic})`,
        flavor,
        nicotine: nic,
      });
    });
  });
  return results;
}

export type SystemRole =
  | 'ادمین کل (Super Admin)'
  | 'مدیر مالی (Accounts Manager)'
  | 'سرپرست انبار (Stock Manager)'
  | 'صندوقدار POS';

export function checkRolePermission(
  role: SystemRole,
  permission:
    | 'view_buying_cost'
    | 'manage_users_roles'
    | 'post_journal'
    | 'adjust_stock'
    | 'export_database'
): boolean {
  if (role === 'ادمین کل (Super Admin)') return true;
  switch (permission) {
    case 'view_buying_cost':
      return role === 'مدیر مالی (Accounts Manager)' || role === 'سرپرست انبار (Stock Manager)';
    case 'manage_users_roles':
    case 'export_database':
      return false;
    case 'post_journal':
      return role === 'مدیر مالی (Accounts Manager)';
    case 'adjust_stock':
      return role === 'سرپرست انبار (Stock Manager)';
    default:
      return false;
  }
}

export function formatRoleName(role: string): string {
  switch (role) {
    case 'ادمین کل (Super Admin)':
      return 'مدیر کل سامانه';
    case 'مدیر مالی (Accounts Manager)':
      return 'مدیر مالی و حسابداری';
    case 'سرپرست انبار (Stock Manager)':
      return 'سرپرست انبار و کالا';
    case 'صندوقدار POS':
      return 'صندوقدار فروشگاه';
    default:
      return stripEnglishTerms(role);
  }
}

export function formatVoucherType(vt: string): string {
  switch (vt) {
    case 'Sales Invoice':
      return 'فاکتور فروش';
    case 'Purchase Invoice':
      return 'فاکتور خرید';
    case 'Journal Entry':
      return 'سند روزنامه';
    case 'Payment Entry':
      return 'سند دریافت و پرداخت';
    case 'POS Invoice':
      return 'فیش صندوق فروشگاهی';
    default:
      return stripEnglishTerms(vt);
  }
}

export function stripEnglishTerms(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s*\([A-Za-z0-9 &/\-_.·]+\)/g, '')
    .replace(/\bPOS\b/g, 'فروشگاهی')
    .replace(/\bMTL\b/g, 'معمولی')
    .replace(/\bDTL\b/g, 'حرفه‌ای')
    .replace(/\bB2B\b/g, 'عمده')
    .replace(/\bCRM\b/g, 'مشتریان')
    .replace(/\bCOGS\b/g, 'بهای تمام‌شده')
    .replace(/\bGL\b/g, 'دفتر کل')
    .trim();
}

export function calculateFinancialStatements(
  accounts: { category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه'; level: string; balance: number }[]
): {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  equityPlusLiabilitiesAndProfit: number;
  isBalanceSheetBalanced: boolean;
} {
  const groupAccounts = accounts.filter((a) => a.level === 'گروه');
  const sumByCategory = (cat: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه') =>
    groupAccounts.filter((a) => a.category === cat).reduce((s, a) => s + a.balance, 0);

  const totalAssets = sumByCategory('دارایی');
  const totalLiabilities = sumByCategory('بدهی');
  const totalEquity = sumByCategory('سرمایه');
  const totalRevenue = sumByCategory('درآمد');
  const totalExpenses = sumByCategory('هزینه');
  const netProfit = totalRevenue - totalExpenses;
  const equityPlusLiabilitiesAndProfit = totalLiabilities + totalEquity + netProfit;

  return {
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalRevenue,
    totalExpenses,
    netProfit,
    equityPlusLiabilitiesAndProfit,
    isBalanceSheetBalanced: Math.abs(totalAssets - equityPlusLiabilitiesAndProfit) < 1,
  };
}

export function calculateSalesDashboardMetrics(
  salesInvoices: readonly {
    docstatus: number;
    isHistoricalArchive?: boolean;
    totalAmount: number;
    paidAmount: number;
    returnAgainst?: string;
    cogsAmount?: number;
    lines?: readonly {
      sku: string;
      qty: number;
      valuationRate: number;
      unitPrice?: number;
      discountPercent?: number;
      netLineAmount?: number;
    }[];
  }[],
  inventoryItems: readonly {
    sku: string;
    stockQty: number;
    valuationRate: number;
  }[]
): {
  postedInvoiceCount: number;
  totalSales: number;
  cashReceived: number;
  receivables: number;
  knownCostOfGoodsSold: number;
  estimatedProfit: number;
  inventoryValue: number;
  estimatedAssets: number;
  estimatedCostLineCount: number;
  missingCostLineCount: number;
} {
  const postedInvoices = salesInvoices.filter((invoice) => invoice.docstatus === 1);
  const inventoryBySku = new Map(inventoryItems.map((item) => [item.sku, item]));
  let totalSales = 0;
  let cashReceived = 0;
  let knownCostOfGoodsSold = 0;
  let estimatedCostOfGoodsSold = 0;
  let estimatedCostLineCount = 0;
  let missingCostLineCount = 0;

  for (const invoice of postedInvoices) {
    const sign = invoice.returnAgainst ? -1 : 1;
    totalSales += sign * invoice.totalAmount;
    cashReceived += sign * invoice.paidAmount;

    if (!invoice.lines?.length) {
      if (invoice.cogsAmount && invoice.cogsAmount > 0) {
        knownCostOfGoodsSold += sign * invoice.cogsAmount;
      } else {
        missingCostLineCount += 1;
      }
      continue;
    }

    for (const line of invoice.lines) {
      const itemCost = inventoryBySku.get(line.sku)?.valuationRate ?? 0;
      const unitCost = line.valuationRate > 0 ? line.valuationRate : itemCost;
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        const netLineAmount = line.netLineAmount ??
          line.qty * (line.unitPrice ?? 0) * (1 - (line.discountPercent ?? 0) / 100);
        if (Number.isFinite(netLineAmount) && netLineAmount > 0) {
          estimatedCostOfGoodsSold += sign * netLineAmount * 0.75;
          estimatedCostLineCount += 1;
        } else {
          missingCostLineCount += 1;
        }
        continue;
      }
      knownCostOfGoodsSold += sign * line.qty * unitCost;
    }
  }

  const receivables = totalSales - cashReceived;
  const inventoryValue = inventoryItems.reduce(
    (total, item) => total + item.stockQty * item.valuationRate,
    0
  );
  const estimatedProfit = totalSales - knownCostOfGoodsSold - estimatedCostOfGoodsSold;

  return {
    postedInvoiceCount: postedInvoices.length,
    totalSales,
    cashReceived,
    receivables,
    knownCostOfGoodsSold,
    estimatedProfit,
    inventoryValue,
    estimatedAssets: inventoryValue + cashReceived + receivables,
    estimatedCostLineCount,
    missingCostLineCount,
  };
}

export function postDoubleEntryToAccounts<
  T extends {
    code: string;
    category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
    level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
    parentCode?: string;
    balance: number;
  }
>(accounts: T[], lines: { accountCode: string; debit: number; credit: number }[]): T[] {
  const deltas = new Map<string, number>();

  const byCode = new Map<string, T>();
  accounts.forEach((a) => byCode.set(a.code, a));

  for (const line of lines) {
    const target = byCode.get(line.accountCode);
    if (!target) {
      throw new Error(`Cannot post a ledger entry to unknown account "${line.accountCode}".`);
    }
    if (
      !Number.isFinite(line.debit) ||
      !Number.isFinite(line.credit) ||
      line.debit < 0 ||
      line.credit < 0 ||
      (line.debit > 0 && line.credit > 0)
    ) {
      throw new Error(`Cannot post invalid debit or credit amounts to account "${line.accountCode}".`);
    }
    const isDebitNature = target.category === 'دارایی' || target.category === 'هزینه';
    const netChange = isDebitNature ? line.debit - line.credit : line.credit - line.debit;

    let curr: T | undefined = target;
    const visited = new Set<string>();
    while (curr && !visited.has(curr.code)) {
      visited.add(curr.code);
      deltas.set(curr.code, (deltas.get(curr.code) || 0) + netChange);
      curr = curr.parentCode ? byCode.get(curr.parentCode) : undefined;
    }
  }

  return accounts.map((acc) => {
    const d = deltas.get(acc.code);
    if (!d) return acc;
    return { ...acc, balance: acc.balance + d };
  });
}

export function computeMultiLineInvoiceTotals(
  lines: { qty: number; unitPrice: number; discountPercent: number; valuationRate: number }[]
): {
  grossAmount: number;
  totalDiscount: number;
  netTotal: number;
  grandTotal: number;
  totalCogs: number;
} {
  let grossAmount = 0;
  let totalDiscount = 0;
  let totalCogs = 0;

  for (const line of lines) {
    const qty = Math.max(0, Number(line.qty) || 0);
    const price = Math.max(0, Number(line.unitPrice) || 0);
    const discPct = Math.min(100, Math.max(0, Number(line.discountPercent) || 0));
    const lineGross = qty * price;
    const lineDisc = Math.round((lineGross * discPct) / 100);
    grossAmount += lineGross;
    totalDiscount += lineDisc;
    totalCogs += qty * (Number(line.valuationRate) || 0);
  }

  const netTotal = Math.max(0, grossAmount - totalDiscount);

  return {
    grossAmount,
    totalDiscount,
    netTotal,
    grandTotal: netTotal,
    totalCogs,
  };
}

export function buildSalesInvoiceLedgerLines(params: {
  totalAmount: number;
  paidAmount: number;
  cogsAmount: number;
  updateStock: boolean;
  isReverse: boolean;
  postingMode?: 'invoice' | 'return';
}): { accountCode: string; debit: number; credit: number }[] {
  const { totalAmount, paidAmount, cogsAmount, updateStock, isReverse } = params;
  const postingMode = params.postingMode ?? 'invoice';
  const unpaid = Math.max(0, totalAmount - paidAmount);
  const lines = [
    {
      accountCode: '4101',
      debit: isReverse ? totalAmount : 0,
      credit: isReverse ? 0 : totalAmount,
    },
  ];

  if (postingMode === 'return') {
    lines.push({
      accountCode: '1102',
      debit: isReverse ? 0 : totalAmount,
      credit: isReverse ? totalAmount : 0,
    });
  } else {
    if (paidAmount > 0) {
      lines.push({
        accountCode: '110101',
        debit: isReverse ? 0 : paidAmount,
        credit: isReverse ? paidAmount : 0,
      });
    }
    if (unpaid > 0) {
      lines.push({
        accountCode: '1102',
        debit: isReverse ? 0 : unpaid,
        credit: isReverse ? unpaid : 0,
      });
    }
  }

  if (updateStock && cogsAmount > 0) {
    lines.push(
      {
        accountCode: '5101',
        debit: isReverse ? 0 : cogsAmount,
        credit: isReverse ? cogsAmount : 0,
      },
      {
        accountCode: '1104',
        debit: isReverse ? cogsAmount : 0,
        credit: isReverse ? 0 : cogsAmount,
      }
    );
  }

  return lines;
}

export function buildPurchaseInvoiceReversalLines(
  totalAmount: number,
  landedCostAdded: number,
  currentInventoryValue: number
): { accountCode: string; debit: number; credit: number }[] {
  const supplierAmount = Math.max(0, totalAmount - landedCostAdded);
  const lines = [
    { accountCode: '1104', debit: 0, credit: currentInventoryValue },
    { accountCode: '2101', debit: supplierAmount, credit: 0 },
  ];

  if (landedCostAdded > 0) {
    lines.push({ accountCode: '2104', debit: landedCostAdded, credit: 0 });
  }

  const valuationDifference = currentInventoryValue - totalAmount;
  if (valuationDifference > 0) {
    lines.push({ accountCode: '5101', debit: valuationDifference, credit: 0 });
  } else if (valuationDifference < 0) {
    lines.push({ accountCode: '5101', debit: 0, credit: Math.abs(valuationDifference) });
  }

  return lines;
}

export function buildCustomerRefundLedgerLines(
  bankAccountCode: string,
  amount: number,
  isReverse = false
): { accountCode: string; debit: number; credit: number }[] {
  return [
    {
      accountCode: '1102',
      debit: isReverse ? 0 : amount,
      credit: isReverse ? amount : 0,
    },
    {
      accountCode: bankAccountCode,
      debit: isReverse ? amount : 0,
      credit: isReverse ? 0 : amount,
    },
  ];
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
  level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
}

export function computeTrialBalance6Col(
  accounts: {
    code: string;
    name: string;
    category: 'دارایی' | 'بدهی' | 'سرمایه' | 'درآمد' | 'هزینه';
    level: 'گروه' | 'کل' | 'معین' | 'تفصیلی';
    parentCode?: string;
    openingBalance?: number;
    balance: number;
  }[],
  targetLevel: 'گروه' | 'کل' | 'معین',
  glEntries?: {
    accountCode: string;
    postingDate: string;
    debit: number;
    credit: number;
    branchDimension?: string;
    costCenter?: string;
    isCancelled?: boolean;
  }[],
  filterBranch?: string,
  fiscalYear?: string
): {
  rows: TrialBalanceRow[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
    isBalanced: boolean;
  };
  hasBranchOpeningBalance: boolean;
} {
  const levelAccounts = accounts.filter((a) => a.level === targetLevel);
  const isFilteredByBranch = Boolean(
    filterBranch && filterBranch !== 'همه شعب' && filterBranch !== 'همه شعب سازمان'
  );
  const normalizedFiscalYear = fiscalYear?.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianIndex = persianDigits.indexOf(digit);
    return String(persianIndex >= 0 ? persianIndex : arabicDigits.indexOf(digit));
  }).match(/\d{4}/)?.[0];
  const getEntryYear = (postingDate: string) =>
    postingDate
      .replace(/[۰-۹٠-٩]/g, (digit) => {
        const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
        const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
        const persianIndex = persianDigits.indexOf(digit);
        return String(persianIndex >= 0 ? persianIndex : arabicDigits.indexOf(digit));
      })
      .match(/\d{4}/)?.[0];
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const isAccountWithin = (accountCode: string, parentCode: string) => {
    const visited = new Set<string>();
    let account = accountsByCode.get(accountCode);
    while (account && !visited.has(account.code)) {
      if (account.code === parentCode) return true;
      visited.add(account.code);
      account = account.parentCode ? accountsByCode.get(account.parentCode) : undefined;
    }
    return false;
  };

  const entries = glEntries ?? [];
  const periodEntries = entries.filter(
    (entry) => !normalizedFiscalYear || getEntryYear(entry.postingDate) === normalizedFiscalYear
  );
  const priorEntries = normalizedFiscalYear
    ? entries.filter((entry) => {
        const year = getEntryYear(entry.postingDate);
        return year !== undefined && year < normalizedFiscalYear;
      })
    : [];

  const rows: TrialBalanceRow[] = levelAccounts.map((acc) => {
    const isDebitNature = acc.category === 'دارایی' || acc.category === 'هزینه';

    if (!glEntries) {
      const opening = acc.openingBalance ?? 0;
      const closing = acc.balance;
      const netDiff = closing - opening;
      const openingDebit = isDebitNature ? Math.max(0, opening) : 0;
      const openingCredit = isDebitNature ? 0 : Math.max(0, opening);
      const periodDebit = isDebitNature ? Math.max(0, netDiff) : Math.max(0, -netDiff);
      const periodCredit = isDebitNature ? Math.max(0, -netDiff) : Math.max(0, netDiff);
      const closingDebit = isDebitNature ? Math.max(0, closing) : 0;
      const closingCredit = isDebitNature ? 0 : Math.max(0, closing);

      return {
        code: acc.code,
        name: acc.name,
        category: acc.category,
        level: acc.level,
        openingDebit,
        openingCredit,
        periodDebit,
        periodCredit,
        closingDebit,
        closingCredit,
        hasBranchOpeningBalance: !isFilteredByBranch,
      };
    }

    const branchEntries = (source: typeof entries) =>
      source.filter(
        (entry) =>
          (!isFilteredByBranch || entry.branchDimension === filterBranch) &&
          isAccountWithin(entry.accountCode, acc.code)
      );
    const openingEntries = branchEntries(priorEntries);
    const openingNet =
      (isFilteredByBranch
        ? 0
        : isDebitNature
          ? acc.openingBalance ?? 0
          : -(acc.openingBalance ?? 0)) +
      openingEntries.reduce((sum, entry) => sum + entry.debit - entry.credit, 0);
    const matchingGL = branchEntries(periodEntries);
    const periodDebit = matchingGL.reduce((sum, entry) => sum + entry.debit, 0);
    const periodCredit = matchingGL.reduce((sum, entry) => sum + entry.credit, 0);
    const closingNet = openingNet + periodDebit - periodCredit;

    return {
      code: acc.code,
      name: acc.name,
      category: acc.category,
      level: acc.level,
      openingDebit: Math.max(0, openingNet),
      openingCredit: Math.max(0, -openingNet),
      periodDebit,
      periodCredit,
      closingDebit: Math.max(0, closingNet),
      closingCredit: Math.max(0, -closingNet),
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      openingDebit: acc.openingDebit + r.openingDebit,
      openingCredit: acc.openingCredit + r.openingCredit,
      periodDebit: acc.periodDebit + r.periodDebit,
      periodCredit: acc.periodCredit + r.periodCredit,
      closingDebit: acc.closingDebit + r.closingDebit,
      closingCredit: acc.closingCredit + r.closingCredit,
      isBalanced: true,
    }),
    {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
      isBalanced: true,
    }
  );

  totals.isBalanced = Math.abs(totals.closingDebit - totals.closingCredit) < 1;

  return { rows, totals, hasBranchOpeningBalance: !isFilteredByBranch };
}

export function deductStockWithBundles<
  T extends {
    sku: string;
    name: string;
    stockQty: number;
    valuationRate: number;
    isBundle?: boolean;
    bundleComponentItems?: { sku: string; name: string; qty: number }[];
  }
>(
  inventory: T[],
  soldLines: { sku: string; qty: number }[]
): {
  updatedInventory: T[];
  updatedItems: T[];
  totalCogs: number;
  insufficientStockError?: string;
} {
  const requiredBySku = new Map<string, number>();

  for (const sold of soldLines) {
    if (!Number.isFinite(sold.qty) || sold.qty <= 0) {
      return {
        updatedInventory: inventory,
        updatedItems: inventory,
        totalCogs: 0,
        insufficientStockError: `مقدار فروش برای کالای ${sold.sku} باید بزرگ‌تر از صفر باشد.`,
      };
    }
    requiredBySku.set(sold.sku, (requiredBySku.get(sold.sku) || 0) + sold.qty);

    const itemObj = inventory.find((i) => i.sku === sold.sku);
    if (!itemObj) {
      return {
        updatedInventory: inventory,
        updatedItems: inventory,
        totalCogs: 0,
        insufficientStockError: `کالای ${sold.sku} در فهرست موجودی پیدا نشد.`,
      };
    }
    if (itemObj.isBundle) {
      if (!itemObj.bundleComponentItems?.length) {
        return {
          updatedInventory: inventory,
          updatedItems: inventory,
          totalCogs: 0,
          insufficientStockError: `برای باندل ${itemObj.name} اجزای قابل انبارگردانی تعریف نشده است.`,
        };
      }
      for (const comp of itemObj.bundleComponentItems) {
        if (!inventory.some((item) => item.sku === comp.sku)) {
          return {
            updatedInventory: inventory,
            updatedItems: inventory,
            totalCogs: 0,
            insufficientStockError: `جزء ${comp.sku} از باندل ${itemObj.name} در موجودی پیدا نشد.`,
          };
        }
        const compNeed = sold.qty * comp.qty;
        requiredBySku.set(comp.sku, (requiredBySku.get(comp.sku) || 0) + compNeed);
      }
    }
  }

  for (const [sku, neededQty] of requiredBySku.entries()) {
    const itemObj = inventory.find((i) => i.sku === sku);
    if (itemObj && itemObj.stockQty < neededQty) {
      return {
        updatedInventory: inventory,
        updatedItems: inventory,
        totalCogs: 0,
        insufficientStockError: `کسری موجودی انبار: کالای «${itemObj.name}» (${sku}) دارای موجودی ${itemObj.stockQty} است اما ${neededQty} واحد نیاز است.`,
      };
    }

  }

  let totalCogs = 0;
  for (const sold of soldLines) {
    const itemObj = inventory.find((i) => i.sku === sold.sku);
    if (itemObj) {
      if (itemObj.isBundle) {
        for (const component of itemObj.bundleComponentItems ?? []) {
          const componentItem = inventory.find((item) => item.sku === component.sku);
          if (componentItem) {
            totalCogs += sold.qty * component.qty * componentItem.valuationRate;
          }
        }
      } else {
        totalCogs += sold.qty * itemObj.valuationRate;
      }
    }
  }

  const updatedInventory = inventory.map((item) => {
    const deduct = requiredBySku.get(item.sku) || 0;
    if (deduct === 0) return item;
    return {
      ...item,
      stockQty: Math.max(0, item.stockQty - deduct),
    };
  });

  return {
    updatedInventory,
    updatedItems: updatedInventory,
    totalCogs,
  };
}

export function restoreStockWithBundles<
  T extends {
    sku: string;
    stockQty: number;
    isBundle?: boolean;
    bundleComponentItems?: { sku: string; qty: number }[];
  }
>(inventory: T[], returnedLines: { sku: string; qty: number }[]): T[] {
  const quantityBySku = new Map<string, number>();

  for (const line of returnedLines) {
    if (!Number.isFinite(line.qty) || line.qty <= 0) continue;
    quantityBySku.set(line.sku, (quantityBySku.get(line.sku) || 0) + line.qty);

    const item = inventory.find((entry) => entry.sku === line.sku);
    if (item?.isBundle && item.bundleComponentItems) {
      for (const component of item.bundleComponentItems) {
        quantityBySku.set(
          component.sku,
          (quantityBySku.get(component.sku) || 0) + line.qty * component.qty
        );
      }
    }
  }

  return inventory.map((item) => {
    const restoredQty = quantityBySku.get(item.sku) || 0;
    return restoredQty > 0 ? { ...item, stockQty: item.stockQty + restoredQty } : item;
  });
}

// ============================================================================
// MODULE 4 & 13: THREE-BUCKET SHAREHOLDER ENGINE (50/50 CAPITAL & 70/30 PROFIT)
// ============================================================================
export interface ThreeBucketPartnerInput {
  id: string;
  name: string;
  capitalSharePercent: number; // C_i e.g. 50
  profitSharePercent: number; // P_i e.g. 70 or 30
  personalCapitalInjected: number;
  withdrawals: number;
  frozenSnapshotBalance?: number;
}

export interface ThreeBucketCalculationResult {
  netProfit: number;
  bucket1InitialInventoryCapital: number;
  bucket1RecoveredCogs: number;
  bucket1UsedForPurchases: number;
  bucket1CurrentBalance: number;
  totalNewCapitalNeeded: number;
  partners: {
    id: string;
    name: string;
    capitalSharePercent: number;
    profitSharePercent: number;
    profitAllocated: number;
    personalCapitalInjected: number;
    capitalExpansionCharge: number;
    withdrawals: number;
    walletBalance: number; // W_i
    isNegativeDeficit: boolean;
  }[];
}

export function calculateThreeBucketShareholderState(params: {
  initialInventoryCapital: number;
  totalRevenue: number;
  totalCogs: number;
  totalOperatingExpenses: number;
  totalNewPurchasesAmount: number;
  partners: ThreeBucketPartnerInput[];
}): ThreeBucketCalculationResult {
  const netProfit = params.totalRevenue - params.totalCogs - params.totalOperatingExpenses;
  // Bucket 1 (Capital Recovery Pool) receives COGS from every sale so inventory capital is preserved
  const availableRecoveryPool = Math.max(0, params.totalCogs);
  const bucket1UsedForPurchases = Math.min(availableRecoveryPool, Math.max(0, params.totalNewPurchasesAmount));
  const bucket1CurrentBalance = Math.max(0, availableRecoveryPool - bucket1UsedForPurchases);
  // Any purchase exceeding Bucket 1 is new inventory expansion capital funded 50/50 (C_i)
  const totalNewCapitalNeeded = Math.max(0, params.totalNewPurchasesAmount - availableRecoveryPool);

  const partners = params.partners.map((partner) => {
    const ci = partner.capitalSharePercent / 100;
    const pi = partner.profitSharePercent / 100;
    const profitAllocated = Math.round(netProfit * pi);
    const capitalExpansionCharge = Math.round(totalNewCapitalNeeded * ci);
    const frozenBase = partner.frozenSnapshotBalance || 0;
    // W_i = (Net Profit * P_i) + (Personal Capital Injected_i - Total New Capital Needed * C_i) - Withdrawals_i
    const walletBalance =
      frozenBase +
      profitAllocated +
      (partner.personalCapitalInjected - capitalExpansionCharge) -
      partner.withdrawals;

    return {
      id: partner.id,
      name: partner.name,
      capitalSharePercent: partner.capitalSharePercent,
      profitSharePercent: partner.profitSharePercent,
      profitAllocated,
      personalCapitalInjected: partner.personalCapitalInjected,
      capitalExpansionCharge,
      withdrawals: partner.withdrawals,
      walletBalance,
      isNegativeDeficit: walletBalance < 0,
    };
  });

  return {
    netProfit,
    bucket1InitialInventoryCapital: params.initialInventoryCapital,
    bucket1RecoveredCogs: params.totalCogs,
    bucket1UsedForPurchases,
    bucket1CurrentBalance,
    totalNewCapitalNeeded,
    partners,
  };
}

// ============================================================================
// MODULE 8 & 14: DECANT (ML) E-LIQUID SALE ENGINE
// ============================================================================
export function calculateCostPerMl(bottlePurchasePrice: number, bottleVolumeMl: number): number {
  if (!Number.isFinite(bottleVolumeMl) || bottleVolumeMl <= 0) return 0;
  return Math.round(Math.max(0, bottlePurchasePrice) / bottleVolumeMl);
}

export function deductDecantMlFromBottle(params: {
  stockBottles: number;
  bottleVolumeMl: number;
  openBottleRemainingMl: number;
  bottleValuationRate: number;
  soldMl: number;
}): {
  success: boolean;
  errorMessage?: string;
  newStockBottles: number;
  newOpenBottleRemainingMl: number;
  costPerMl: number;
  lineCogs: number;
} {
  const { stockBottles, bottleVolumeMl, openBottleRemainingMl, bottleValuationRate, soldMl } = params;
  if (bottleVolumeMl <= 0 || soldMl <= 0) {
    return {
      success: false,
      errorMessage: 'حجم بطری و مقدار میلی‌لیتر فروش باید بزرگتر از صفر باشد.',
      newStockBottles: stockBottles,
      newOpenBottleRemainingMl: openBottleRemainingMl,
      costPerMl: 0,
      lineCogs: 0,
    };
  }
  const totalAvailableMl = stockBottles * bottleVolumeMl + openBottleRemainingMl;
  if (soldMl > totalAvailableMl) {
    return {
      success: false,
      errorMessage: `موجودی میلی‌لیتری کافی نیست (موجود کل: ${totalAvailableMl} ml، درخواستی: ${soldMl} ml).`,
      newStockBottles: stockBottles,
      newOpenBottleRemainingMl: openBottleRemainingMl,
      costPerMl: 0,
      lineCogs: 0,
    };
  }

  let currentBottles = stockBottles;
  let currentOpenMl = openBottleRemainingMl;

  while (currentOpenMl < soldMl && currentBottles > 0) {
    currentBottles -= 1;
    currentOpenMl += bottleVolumeMl;
  }

  currentOpenMl = Math.max(0, Number((currentOpenMl - soldMl).toFixed(2)));
  const costPerMl = calculateCostPerMl(bottleValuationRate, bottleVolumeMl);
  const lineCogs = Math.round(soldMl * costPerMl);

  return {
    success: true,
    newStockBottles: currentBottles,
    newOpenBottleRemainingMl: currentOpenMl,
    costPerMl,
    lineCogs,
  };
}

// ============================================================================
// MODULE 8: SECTOR-BASED VALUATION (MWA FOR VAPE vs FIFO FOR COMPUTER PARTS)
// ============================================================================
export function consumeFifoLayers(
  layers: { qty: number; unitCost: number; date: string }[],
  soldQty: number,
  fallbackUnitCost: number
): {
  remainingLayers: { qty: number; unitCost: number; date: string }[];
  totalCogs: number;
  nextValuationRate: number;
} {
  if (!layers || layers.length === 0) {
    return {
      remainingLayers: [],
      totalCogs: Math.round(soldQty * fallbackUnitCost),
      nextValuationRate: fallbackUnitCost,
    };
  }

  let needed = soldQty;
  let totalCogs = 0;
  const remainingLayers: { qty: number; unitCost: number; date: string }[] = [];

  for (const layer of layers) {
    if (needed <= 0) {
      remainingLayers.push({ ...layer });
      continue;
    }
    const take = Math.min(layer.qty, needed);
    totalCogs += take * layer.unitCost;
    needed -= take;
    const left = layer.qty - take;
    if (left > 0) {
      remainingLayers.push({ ...layer, qty: left });
    }
  }

  if (needed > 0) {
    totalCogs += needed * fallbackUnitCost;
  }

  const nextValuationRate =
    remainingLayers.length > 0 ? remainingLayers[0].unitCost : fallbackUnitCost;

  return {
    remainingLayers,
    totalCogs: Math.round(totalCogs),
    nextValuationRate,
  };
}

// ============================================================================
// MODULE 5: SMART CASE-INSENSITIVE SEARCH (EQUAL RANKED FIRST + CONTAINS)
// ============================================================================
export function smartFilterAndRankItems<
  T extends {
    sku: string;
    name: string;
    brand?: string;
    flavor?: string;
    parentTag?: string;
    nicotine?: string;
  }
>(items: T[], rawQuery: string): T[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return items;

  const exactMatches: T[] = [];
  const containsMatches: T[] = [];

  for (const item of items) {
    const skuLower = (item.sku || '').toLowerCase();
    const nameLower = (item.name || '').toLowerCase();
    const brandLower = (item.brand || '').toLowerCase();
    const flavorLower = (item.flavor || '').toLowerCase();
    const tagLower = (item.parentTag || '').toLowerCase();
    const nicLower = (item.nicotine || '').toLowerCase();

    if (skuLower === q || nameLower === q || tagLower === q) {
      exactMatches.push(item);
    } else if (
      skuLower.includes(q) ||
      nameLower.includes(q) ||
      brandLower.includes(q) ||
      flavorLower.includes(q) ||
      tagLower.includes(q) ||
      nicLower.includes(q)
    ) {
      containsMatches.push(item);
    }
  }

  return [...exactMatches, ...containsMatches];
}

