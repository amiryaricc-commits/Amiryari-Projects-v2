import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateJournalEntry,
  calculateInstallments,
  calculateMovingAverageValuation,
  allocateLandedCost,
  evaluateBudgetControl,
  calculatePosCartTotals,
  calculateStockReconciliation,
  generateItemVariants,
  checkRolePermission,
  calculateFinancialStatements,
  calculateSalesDashboardMetrics,
  postDoubleEntryToAccounts,
  computeMultiLineInvoiceTotals,
  computeTrialBalance6Col,
  deductStockWithBundles,
  restoreStockWithBundles,
  validateSettlementAmount,
  aggregateInvoiceLines,
  getPersianYear,
  buildSalesInvoiceLedgerLines,
  buildPurchaseInvoiceReversalLines,
  buildCustomerRefundLedgerLines,
  calculateThreeBucketShareholderState,
  calculateCostPerMl,
  deductDecantMlFromBottle,
  consumeFifoLayers,
  smartFilterAndRankItems,
} from './erpEngine';
import { INITIAL_ACCOUNTS, INITIAL_GL_ENTRIES } from '../data/erpSeedData';

test('getPersianYear follows the supplied date instead of a fixed fiscal year', () => {
  assert.equal(getPersianYear(new Date('2025-03-22T12:00:00.000Z')), '۱۴۰۴');
});

test('validateJournalEntry enforces double-entry debit === credit rule', () => {
  const balanced = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 15000000, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد فروش کالا', debit: 0, credit: 15000000 },
  ]);
  assert.equal(balanced.isValid, true);
  assert.equal(balanced.difference, 0);

  const unbalanced = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 15000000, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد فروش کالا', debit: 0, credit: 12000000 },
  ]);
  assert.equal(unbalanced.isValid, false);
  assert.equal(unbalanced.difference, 3000000);

  const invalidLine = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: -1, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد فروش کالا', debit: 1, credit: 1 },
  ]);
  assert.equal(invalidLine.isValid, false);

  const unknownAccount = validateJournalEntry(
    [
      { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 100, credit: 0 },
      { id: '2', accountCode: 'MISSING', accountName: 'حساب نامعتبر', debit: 0, credit: 100 },
    ],
    new Set(['1101', '4101'])
  );
  assert.equal(unknownAccount.isValid, false);

  const zeroValueLine = validateJournalEntry([
    { id: '1', accountCode: '1101', accountName: 'بانک ملت', debit: 100, credit: 0 },
    { id: '2', accountCode: '4101', accountName: 'درآمد', debit: 0, credit: 100 },
    { id: '3', accountCode: '4101', accountName: 'درآمد', debit: 0, credit: 0 },
  ]);
  assert.equal(zeroValueLine.isValid, false);
});

test('calculateInstallments splits invoice accurately into 30/35/35 schedule', () => {
  const schedule = calculateInstallments(10000000, [
    { label: 'پیش‌پرداخت نقد (۳۰٪)', percentage: 30, dueDays: 0 },
    { label: 'قسط اول - یک ماهه (۳۵٪)', percentage: 35, dueDays: 30 },
    { label: 'قسط دوم - دو ماهه (۳۵٪)', percentage: 35, dueDays: 60 },
  ]);
  assert.equal(schedule.length, 3);
  assert.equal(schedule[0].amount, 3000000);
  assert.equal(schedule[0].status, 'پرداخت‌شده');
  assert.equal(schedule[1].amount, 3500000);
  assert.equal(schedule[2].amount, 3500000);
});

test('validateSettlementAmount rejects overpayments and invalid references', () => {
  assert.equal(validateSettlementAmount(25, 100).isValid, true);
  assert.equal(validateSettlementAmount(101, 100).isValid, false);
  assert.equal(validateSettlementAmount(1, 0).isValid, false);
  assert.equal(validateSettlementAmount(Number.NaN, 100).isValid, false);
});

test('sales credit notes credit receivables and cancellation reverses that posting', () => {
  const creditNote = buildSalesInvoiceLedgerLines({
    totalAmount: 1000,
    paidAmount: 400,
    cogsAmount: 250,
    updateStock: true,
    isReverse: true,
    postingMode: 'return',
  });
  assert.deepEqual(creditNote, [
    { accountCode: '4101', debit: 1000, credit: 0 },
    { accountCode: '1102', debit: 0, credit: 1000 },
    { accountCode: '5101', debit: 0, credit: 250 },
    { accountCode: '1104', debit: 250, credit: 0 },
  ]);

  const cancellation = buildSalesInvoiceLedgerLines({
    totalAmount: 1000,
    paidAmount: 400,
    cogsAmount: 250,
    updateStock: true,
    isReverse: false,
    postingMode: 'return',
  });
  assert.deepEqual(
    cancellation,
    creditNote.map((line) => ({
      ...line,
      debit: line.credit,
      credit: line.debit,
    }))
  );
});

test('purchase reversal values inventory at current moving-average cost and books the variance', () => {
  const reversal = buildPurchaseInvoiceReversalLines(1000, 0, 1500);
  assert.deepEqual(reversal, [
    { accountCode: '1104', debit: 0, credit: 1500 },
    { accountCode: '2101', debit: 1000, credit: 0 },
    { accountCode: '5101', debit: 500, credit: 0 },
  ]);
  assert.equal(
    reversal.reduce((total, line) => total + line.debit, 0),
    reversal.reduce((total, line) => total + line.credit, 0)
  );

  const lowerCurrentValue = buildPurchaseInvoiceReversalLines(1000, 0, 800);
  assert.deepEqual(lowerCurrentValue.at(-1), {
    accountCode: '5101',
    debit: 0,
    credit: 200,
  });
  assert.equal(
    lowerCurrentValue.reduce((total, line) => total + line.debit, 0),
    lowerCurrentValue.reduce((total, line) => total + line.credit, 0)
  );
});

test('customer refund posts against receivables and cancellation reverses it', () => {
  const refund = buildCustomerRefundLedgerLines('110101', 500);
  assert.deepEqual(refund, [
    { accountCode: '1102', debit: 500, credit: 0 },
    { accountCode: '110101', debit: 0, credit: 500 },
  ]);
  assert.deepEqual(
    buildCustomerRefundLedgerLines('110101', 500, true),
    refund.map((line) => ({ ...line, debit: line.credit, credit: line.debit }))
  );
});

test('aggregateInvoiceLines sums repeated item quantities and net amounts', () => {
  const lines = aggregateInvoiceLines([
    { id: '1', sku: 'SKU-1', qty: 2, netLineAmount: 200 },
    { id: '2', sku: 'SKU-1', qty: 3, netLineAmount: 270 },
    { id: '3', sku: 'SKU-2', qty: 1, netLineAmount: 50 },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].qty, 5);
  assert.equal(lines[0].netLineAmount, 470);
  assert.equal(lines[1].qty, 1);
});

test('calculateMovingAverageValuation computes weighted moving average cost', () => {
  const res = calculateMovingAverageValuation(100, 500000, 50, 650000);
  assert.equal(res.newQty, 150);
  assert.equal(res.newValuationRate, 550000);
});

test('allocateLandedCost distributes customs and freight proportionally', () => {
  const allocated = allocateLandedCost(
    [
      { itemCode: 'ITM-01', itemName: 'پاد Peak Bar 60000', qty: 10, weightGrams: 100, unitCost: 800000 },
      { itemCode: 'ITM-02', itemName: 'جویس ۶۰ میل', qty: 20, weightGrams: 80, unitCost: 400000 },
    ],
    1600000,
    'amount'
  );
  assert.equal(allocated[0].allocatedLandedCost, 800000);
  assert.equal(allocated[0].finalUnitCost, 880000);
  assert.equal(allocated[1].allocatedLandedCost, 800000);
  assert.equal(allocated[1].finalUnitCost, 440000);
});

test('evaluateBudgetControl enforces STOP and WARN policies accurately', () => {
  const stopped = evaluateBudgetControl(50000000, 45000000, 10000000, 'STOP');
  assert.equal(stopped.status, 'STOPPED');
  assert.equal(stopped.remainingAfter, -5000000);

  const warned = evaluateBudgetControl(50000000, 45000000, 10000000, 'WARN');
  assert.equal(warned.status, 'WARNING');
});

test('calculatePosCartTotals handles stepped discount, loyalty and commission', () => {
  const totals = calculatePosCartTotals({
    items: [{ price: 1000000, qty: 5, category: 'دستگاه' }],
    priceListMultiplier: 1,
    couponPercent: 10,
    redeemLoyaltyPoints: 100,
    partnerCommissionPercent: 5,
    promotionRules: {
      quantityDiscount: { minimumQuantity: 5, percent: 5 },
      freeGiftMinimumQuantity: 3,
      tomanPerLoyaltyPoint: 50000,
    },
  });
  assert.equal(totals.grossTotal, 5000000);
  assert.equal(totals.pricingRuleDiscount, 250000);
  assert.equal(totals.couponDiscount, 475000);
  assert.equal(totals.loyaltyDiscount, 100000);
  assert.equal(totals.netPayable, 4175000);
  assert.equal(totals.earnedLoyaltyPoints, 83);
  assert.equal(totals.partnerCommissionAmount, 208750);
  assert.equal(totals.freeGiftTriggered, true);
});

test('calculatePosCartTotals does not apply unconfigured promotions or loyalty points', () => {
  const totals = calculatePosCartTotals({
    items: [{ price: 1000000, qty: 5, category: 'دستگاه' }],
    priceListMultiplier: 1,
    couponPercent: 0,
    redeemLoyaltyPoints: 0,
    partnerCommissionPercent: 0,
  });

  assert.equal(totals.grossTotal, 5000000);
  assert.equal(totals.pricingRuleDiscount, 0);
  assert.equal(totals.earnedLoyaltyPoints, 0);
  assert.equal(totals.partnerCommissionAmount, 0);
  assert.equal(totals.freeGiftTriggered, false);
  assert.equal(totals.netPayable, 5000000);
});

test('calculateStockReconciliation detects deficit and triggers auto reorder', () => {
  const rec = calculateStockReconciliation(25, 8, 500000, 10);
  assert.equal(rec.varianceQty, -17);
  assert.equal(rec.varianceValue, -8500000);
  assert.equal(rec.needsAutoReorder, true);
  assert.ok(rec.suggestedOrderQty > 0);
});

test('generateItemVariants creates SKU combinations from attributes', () => {
  const variants = generateItemVariants('پاد Peak Bar 60000', 'PK60', ['انبه یخ', 'بلوبری'], ['۲۰ میلی‌گرم', '۵۰ میلی‌گرم']);
  assert.equal(variants.length, 4);
  assert.equal(variants[0].sku, 'PK60-V11');
});

test('checkRolePermission grants full access to Super Admin and restricts Cashier', () => {
  assert.equal(checkRolePermission('ادمین کل (Super Admin)', 'post_journal'), true);
  assert.equal(checkRolePermission('ادمین کل (Super Admin)', 'view_buying_cost'), true);
  assert.equal(checkRolePermission('صندوقدار POS', 'view_buying_cost'), false);
  assert.equal(checkRolePermission('صندوقدار POS', 'export_database'), false);
});

test('calculateFinancialStatements computes P&L and Balance Sheet equation accurately', () => {
  const st = calculateFinancialStatements([
    { category: 'دارایی', level: 'گروه', balance: 4850000000 },
    { category: 'بدهی', level: 'گروه', balance: 960000000 },
    { category: 'سرمایه', level: 'گروه', balance: 3000000000 },
    { category: 'درآمد', level: 'گروه', balance: 2150000000 },
    { category: 'هزینه', level: 'گروه', balance: 1260000000 },
  ]);
  assert.equal(st.netProfit, 890000000);
  assert.equal(st.equityPlusLiabilitiesAndProfit, 4850000000);
  assert.equal(st.isBalanceSheetBalanced, true);
});

test('calculateSalesDashboardMetrics includes posted archive invoices and computes dashboard totals', () => {
  const metrics = calculateSalesDashboardMetrics(
    [
      {
        docstatus: 1,
        totalAmount: 1000,
        paidAmount: 400,
        isHistoricalArchive: true,
        lines: [{ sku: 'A', qty: 2, valuationRate: 0 }],
      },
      { docstatus: 0, totalAmount: 500, paidAmount: 500 },
      { docstatus: 2, totalAmount: 300, paidAmount: 0 },
    ],
    [{ sku: 'A', stockQty: 3, valuationRate: 100 }]
  );

  assert.deepEqual(metrics, {
    postedInvoiceCount: 1,
    totalSales: 1000,
    cashReceived: 400,
    receivables: 600,
    knownCostOfGoodsSold: 200,
    estimatedProfit: 800,
    inventoryValue: 300,
    estimatedAssets: 1300,
    estimatedCostLineCount: 0,
    missingCostLineCount: 0,
  });
});

test('calculateSalesDashboardMetrics flags unknown item costs and offsets posted credit notes', () => {
  const metrics = calculateSalesDashboardMetrics(
    [
      {
        docstatus: 1,
        totalAmount: 1000,
        paidAmount: 800,
        lines: [
          { sku: 'KNOWN', qty: 1, valuationRate: 0 },
          { sku: 'UNKNOWN', qty: 1, valuationRate: 0, unitPrice: 200, netLineAmount: 200 },
        ],
      },
      {
        docstatus: 1,
        totalAmount: 100,
        paidAmount: 100,
        returnAgainst: 'INV-1',
        lines: [{ sku: 'KNOWN', qty: 1, valuationRate: 0 }],
      },
    ],
    [{ sku: 'KNOWN', stockQty: 0, valuationRate: 250 }]
  );

  assert.equal(metrics.totalSales, 900);
  assert.equal(metrics.cashReceived, 700);
  assert.equal(metrics.receivables, 200);
  assert.equal(metrics.knownCostOfGoodsSold, 0);
  assert.equal(metrics.estimatedProfit, 750);
  assert.equal(metrics.estimatedCostLineCount, 1);
  assert.equal(metrics.missingCostLineCount, 0);
});

test('postDoubleEntryToAccounts rolls up leaf debit/credit changes to parent group accounts and preserves Balance Sheet equality', () => {
  const sampleAccounts = [
    { code: '1000', category: 'دارایی' as const, level: 'گروه' as const, balance: 1000 },
    { code: '1101', category: 'دارایی' as const, level: 'معین' as const, parentCode: '1000', balance: 1000 },
    { code: '2000', category: 'بدهی' as const, level: 'گروه' as const, balance: 200 },
    { code: '3000', category: 'سرمایه' as const, level: 'گروه' as const, balance: 800 },
    { code: '4000', category: 'درآمد' as const, level: 'گروه' as const, balance: 0 },
    { code: '4101', category: 'درآمد' as const, level: 'معین' as const, parentCode: '4000', balance: 0 },
    { code: '5000', category: 'هزینه' as const, level: 'گروه' as const, balance: 0 },
  ];

  const updated = postDoubleEntryToAccounts(sampleAccounts, [
    { accountCode: '1101', debit: 500, credit: 0 },
    { accountCode: '4101', debit: 0, credit: 500 },
  ]);

  assert.equal(updated.find((a) => a.code === '1101')?.balance, 1500);
  assert.equal(updated.find((a) => a.code === '1000')?.balance, 1500);
  assert.equal(updated.find((a) => a.code === '4101')?.balance, 500);
  assert.equal(updated.find((a) => a.code === '4000')?.balance, 500);

  const st = calculateFinancialStatements(updated);
  assert.equal(st.isBalanceSheetBalanced, true);

  assert.throws(
    () => postDoubleEntryToAccounts(sampleAccounts, [{ accountCode: 'MISSING', debit: 1, credit: 0 }]),
    /unknown account/
  );
});

test('computeMultiLineInvoiceTotals computes discounted totals and cost of goods sold', () => {
  const res = computeMultiLineInvoiceTotals([
    { qty: 2, unitPrice: 1000000, discountPercent: 10, valuationRate: 800000 },
    { qty: 1, unitPrice: 500000, discountPercent: 0, valuationRate: 350000 },
  ]);
  assert.equal(res.grossAmount, 2500000);
  assert.equal(res.totalDiscount, 200000);
  assert.equal(res.netTotal, 2300000);
  assert.equal(res.grandTotal, 2300000);
  assert.equal(res.totalCogs, 1950000);
});

test('computeTrialBalance6Col produces balanced 6-column trial balance for گروه/کل/معین', () => {
  for (const level of ['گروه', 'کل', 'معین'] as const) {
    const tb = computeTrialBalance6Col(INITIAL_ACCOUNTS, level, INITIAL_GL_ENTRIES, 'همه شعب');
    assert.equal(tb.totals.isBalanced, true, `Trial balance must be balanced at level ${level}`);
    assert.equal(tb.totals.closingDebit, tb.totals.closingCredit);
  }
});

test('computeTrialBalance6Col includes reversal entries, uses parent links, and carries prior branch activity into opening balances', () => {
  const accounts = [
    { code: '1000', name: 'دارایی', category: 'دارایی' as const, level: 'گروه' as const, balance: 0 },
    { code: '1100', name: 'نقد', category: 'دارایی' as const, level: 'کل' as const, parentCode: '1000', balance: 0 },
    { code: '1101', name: 'بانک', category: 'دارایی' as const, level: 'معین' as const, parentCode: '1100', balance: 0 },
    { code: '2000', name: 'بدهی', category: 'بدهی' as const, level: 'گروه' as const, balance: 0 },
    { code: '2100', name: 'پرداختنی', category: 'بدهی' as const, level: 'کل' as const, parentCode: '2000', balance: 0 },
    { code: '2101', name: 'تامین‌کننده', category: 'بدهی' as const, level: 'معین' as const, parentCode: '2100', balance: 0 },
    { code: '4000', name: 'درآمد', category: 'درآمد' as const, level: 'گروه' as const, balance: 0 },
    { code: '4100', name: 'فروش', category: 'درآمد' as const, level: 'کل' as const, parentCode: '4000', balance: 0 },
    { code: '4101', name: 'فروش کالا', category: 'درآمد' as const, level: 'معین' as const, parentCode: '4100', balance: 0 },
  ];
  const entries = [
    { accountCode: '1101', debit: 100, credit: 0, branchDimension: 'شعبه A', postingDate: '۱۴۰۳/۱۲/۲۹' },
    { accountCode: '2101', debit: 0, credit: 100, branchDimension: 'شعبه A', postingDate: '۱۴۰۳/۱۲/۲۹' },
    { accountCode: '1101', debit: 200, credit: 0, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۱/۰۱' },
    { accountCode: '4101', debit: 0, credit: 200, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۱/۰۱' },
    { accountCode: '4101', debit: 50, credit: 0, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۲/۰۱', isCancelled: true },
    { accountCode: '1101', debit: 0, credit: 50, branchDimension: 'شعبه A', postingDate: '۱۴۰۴/۰۲/۰۱', isCancelled: true },
    { accountCode: '1101', debit: 999, credit: 0, branchDimension: 'شعبه B', postingDate: '۱۴۰۴/۰۲/۰۱' },
    { accountCode: '4101', debit: 0, credit: 999, branchDimension: 'شعبه B', postingDate: '۱۴۰۴/۰۲/۰۱' },
  ];

  const result = computeTrialBalance6Col(accounts, 'معین', entries, 'شعبه A', 'سال مالی ۱۴۰۴');
  const bank = result.rows.find((row) => row.code === '1101')!;
  const supplier = result.rows.find((row) => row.code === '2101')!;
  const revenue = result.rows.find((row) => row.code === '4101')!;

  assert.equal(bank.openingDebit, 100);
  assert.equal(bank.periodDebit, 200);
  assert.equal(bank.periodCredit, 50);
  assert.equal(bank.closingDebit, 250);
  assert.equal(supplier.openingCredit, 100);
  assert.equal(revenue.periodDebit, 50);
  assert.equal(revenue.periodCredit, 200);
  assert.equal(revenue.closingCredit, 150);
  assert.equal(result.totals.isBalanced, true);
  assert.equal(result.hasBranchOpeningBalance, false);

  const nextYear = computeTrialBalance6Col(
    accounts,
    'معین',
    entries,
    'همه شعب سازمان',
    'سال مالی ۱۴۰۵'
  );
  assert.equal(nextYear.totals.periodDebit, 0);
  assert.equal(nextYear.totals.periodCredit, 0);
  assert.equal(nextYear.rows.find((row) => row.code === '1101')?.openingDebit, 1249);
  assert.equal(nextYear.totals.isBalanced, true);
});

test('deductStockWithBundles values COGS from actual component stock, not virtual bundle valuation', () => {
  const inventory = [
    {
      sku: 'BUNDLE-1',
      name: 'پکیج تست',
      stockQty: 5,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [
        { sku: 'ITEM-1', name: 'کالای اول', qty: 2 },
        { sku: 'ITEM-2', name: 'کالای دوم', qty: 1 },
      ],
    },
    { sku: 'ITEM-1', name: 'کالای اول', stockQty: 10, valuationRate: 100 },
    { sku: 'ITEM-2', name: 'کالای دوم', stockQty: 10, valuationRate: 50 },
  ];

  const result = deductStockWithBundles(inventory, [{ sku: 'BUNDLE-1', qty: 2 }]);

  assert.equal(result.totalCogs, 500);
  assert.equal(result.updatedInventory.find((item) => item.sku === 'ITEM-1')?.stockQty, 6);
  assert.equal(result.updatedInventory.find((item) => item.sku === 'ITEM-2')?.stockQty, 8);
});

test('deductStockWithBundles dynamically deducts bundle component items and computes COGS', () => {
  const inventory = [
    {
      sku: 'BND-STARTER-PRO',
      name: 'پکیج تست',
      stockQty: 5,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [
        { sku: 'PK60-MANGO-50', name: 'کالای اول', qty: 1 },
        { sku: 'SALT-NASTY-30', name: 'کالای دوم', qty: 1 },
        { sku: 'COIL-XROS-06', name: 'کالای سوم', qty: 1 },
      ],
    },
    { sku: 'PK60-MANGO-50', name: 'کالای اول', stockQty: 10, valuationRate: 100 },
    { sku: 'SALT-NASTY-30', name: 'کالای دوم', stockQty: 10, valuationRate: 50 },
    { sku: 'COIL-XROS-06', name: 'کالای سوم', stockQty: 10, valuationRate: 25 },
  ];
  const bundleBefore = inventory.find((i) => i.sku === 'BND-STARTER-PRO')!;
  const mangoBefore = inventory.find((i) => i.sku === 'PK60-MANGO-50')!;
  const saltBefore = inventory.find((i) => i.sku === 'SALT-NASTY-30')!;
  const coilBefore = inventory.find((i) => i.sku === 'COIL-XROS-06')!;

  const res = deductStockWithBundles(inventory, [
    { sku: 'BND-STARTER-PRO', qty: 2 },
  ]);
  const bundleAfter = res.updatedItems.find((i) => i.sku === 'BND-STARTER-PRO')!;
  const mangoAfter = res.updatedItems.find((i) => i.sku === 'PK60-MANGO-50')!;
  const saltAfter = res.updatedItems.find((i) => i.sku === 'SALT-NASTY-30')!;
  const coilAfter = res.updatedItems.find((i) => i.sku === 'COIL-XROS-06')!;

  assert.equal(bundleAfter.stockQty, bundleBefore.stockQty - 2);
  assert.equal(mangoAfter.stockQty, mangoBefore.stockQty - 2);
  assert.equal(saltAfter.stockQty, saltBefore.stockQty - 2);
  assert.equal(coilAfter.stockQty, coilBefore.stockQty - 2);
  assert.ok(res.totalCogs > 0);
});

test('deductStockWithBundles rejects insufficient stock without changing inventory', () => {
  const inventory = [
    {
      sku: 'BUNDLE-1',
      name: 'پکیج تست',
      stockQty: 2,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [{ sku: 'ITEM-1', name: 'کالای تست', qty: 2 }],
    },
    { sku: 'ITEM-1', name: 'کالای تست', stockQty: 3, valuationRate: 100 },
  ];

  const result = deductStockWithBundles(inventory, [{ sku: 'BUNDLE-1', qty: 2 }]);

  assert.ok(result.insufficientStockError);
  assert.deepEqual(result.updatedInventory, inventory);
  assert.equal(result.totalCogs, 0);
});

test('restoreStockWithBundles restores bundle and all component quantities', () => {
  const inventory = [
    {
      sku: 'BND-STARTER-PRO',
      name: 'پکیج تست',
      stockQty: 5,
      valuationRate: 500,
      isBundle: true,
      bundleComponentItems: [
        { sku: 'PK60-MANGO-50', name: 'کالای اول', qty: 1 },
        { sku: 'SALT-NASTY-30', name: 'کالای دوم', qty: 1 },
        { sku: 'COIL-XROS-06', name: 'کالای سوم', qty: 1 },
      ],
    },
    { sku: 'PK60-MANGO-50', name: 'کالای اول', stockQty: 10, valuationRate: 100 },
    { sku: 'SALT-NASTY-30', name: 'کالای دوم', stockQty: 10, valuationRate: 50 },
    { sku: 'COIL-XROS-06', name: 'کالای سوم', stockQty: 10, valuationRate: 25 },
  ];
  const deducted = deductStockWithBundles(inventory, [
    { sku: 'BND-STARTER-PRO', qty: 2 },
  ]);
  const restored = restoreStockWithBundles(deducted.updatedInventory, [
    { sku: 'BND-STARTER-PRO', qty: 2 },
  ]);

  for (const item of inventory) {
    assert.equal(
      restored.find((restoredItem) => restoredItem.sku === item.sku)?.stockQty,
      item.stockQty
    );
  }
});

test('calculateThreeBucketShareholderState separates 50/50 capital recovery from 70/30 net profit and flags 30% partner negative deficit on expansion', () => {
  const res = calculateThreeBucketShareholderState({
    initialInventoryCapital: 100000000,
    totalRevenue: 15000000,
    totalCogs: 10000000,
    totalOperatingExpenses: 1000000,
    totalNewPurchasesAmount: 18000000, // 8,000,000 above recovered COGS -> 4,000,000 per partner (50/50)
    partners: [
      {
        id: 'sh-1',
        name: 'شریک اول',
        capitalSharePercent: 50,
        profitSharePercent: 70,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
      {
        id: 'sh-2',
        name: 'شریک دوم',
        capitalSharePercent: 50,
        profitSharePercent: 30,
        personalCapitalInjected: 0,
        withdrawals: 0,
      },
    ],
  });

  // Net Profit = 15,000,000 - 10,000,000 - 1,000,000 = 4,000,000
  assert.equal(res.netProfit, 4000000);
  // Bucket 1 recovered 10M COGS and used all 10M toward the 18M purchase; 8M new capital needed
  assert.equal(res.bucket1RecoveredCogs, 10000000);
  assert.equal(res.bucket1UsedForPurchases, 10000000);
  assert.equal(res.totalNewCapitalNeeded, 8000000);

  // Partner 1 (70% profit = 2,800,000; 50% expansion charge = 4,000,000 -> -1,200,000)
  assert.equal(res.partners[0].profitAllocated, 2800000);
  assert.equal(res.partners[0].capitalExpansionCharge, 4000000);
  assert.equal(res.partners[0].walletBalance, -1200000);

  // Partner 2 (30% profit = 1,200,000; 50% expansion charge = 4,000,000 -> -2,800,000 negative deficit)
  assert.equal(res.partners[1].profitAllocated, 1200000);
  assert.equal(res.partners[1].capitalExpansionCharge, 4000000);
  assert.equal(res.partners[1].walletBalance, -2800000);
  assert.equal(res.partners[1].isNegativeDeficit, true);
});

test('deductDecantMlFromBottle opens a sealed bottle when needed and computes exact per-ml COGS', () => {
  assert.equal(calculateCostPerMl(600000, 60), 10000);

  const res = deductDecantMlFromBottle({
    stockBottles: 3,
    bottleVolumeMl: 60,
    openBottleRemainingMl: 5,
    bottleValuationRate: 600000,
    soldMl: 15,
  });

  assert.equal(res.success, true);
  assert.equal(res.newStockBottles, 2); // 1 bottle opened (5 + 60 - 15 = 50 ml left)
  assert.equal(res.newOpenBottleRemainingMl, 50);
  assert.equal(res.costPerMl, 10000);
  assert.equal(res.lineCogs, 150000);
});

test('consumeFifoLayers consumes oldest purchase layers first for computer parts', () => {
  const fifo = consumeFifoLayers(
    [
      { qty: 2, unitCost: 10000000, date: '۱۴۰۴/۰۷/۰۱' },
      { qty: 3, unitCost: 12000000, date: '۱۴۰۴/۰۸/۰۱' },
    ],
    3,
    12000000
  );

  // 2 * 10M + 1 * 12M = 32M
  assert.equal(fifo.totalCogs, 32000000);
  assert.equal(fifo.remainingLayers.length, 1);
  assert.equal(fifo.remainingLayers[0].qty, 2);
  assert.equal(fifo.nextValuationRate, 12000000);
});

test('smartFilterAndRankItems ranks case-insensitive exact matches first followed by partial matches', () => {
  const items = [
    { sku: 'VGOD-MANGO-25', name: 'سالت ویگاد انبه', brand: 'VGOD' },
    { sku: 'vgod', name: 'پاد ویگاد', brand: 'VGOD' },
  ];
  const ranked = smartFilterAndRankItems(items, 'VGOD');
  assert.equal(ranked[0].sku, 'vgod');
  assert.equal(ranked[1].sku, 'VGOD-MANGO-25');
});

