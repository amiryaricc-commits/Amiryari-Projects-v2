import { InventoryItemRecord, PosServiceLineItem, PromotionRuleRecord } from '../data/erpSeedData';
import { calculateCostPerMl, exactAdd, exactMul, exactSub } from './erpEngine';

export interface PosCartCalculationRow {
  rowId: string;
  item: InventoryItemRecord;
  qty: number;
  isDecantMl: boolean;
  manualUnitPrice: number;
}

export function computeSystemPosUnitPrice(
  item: InventoryItemRecord,
  isDecantMl: boolean,
  mode: 'normal' | 'festival' | 'reseller',
  promotionRules: PromotionRuleRecord[]
): number {
  const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
  let basePrice = item.retailPrice;

  if (mode === 'reseller') {
    basePrice = item.resellerPrice || item.partnerPrice || item.wholesalePrice || item.retailPrice;
  } else if (mode === 'festival') {
    const activeRule = promotionRules.find(
      (r) =>
        r.isActive &&
        (r.applicableSkus.length === 0 || r.applicableSkus.includes(item.sku))
    );
    if (activeRule) {
      if (activeRule.discountType === 'percent') {
        basePrice = Math.round(item.retailPrice * (1 - activeRule.discountValue / 100));
      } else {
        basePrice = Math.max(0, item.retailPrice - activeRule.discountValue);
      }
    } else {
      basePrice = Math.round(item.retailPrice * 0.92);
    }
  }

  if (isDecantMl) {
    return Math.round(basePrice / bottleVol);
  }
  return basePrice;
}

export function calculatePosCartTotals(params: {
  cart: PosCartCalculationRow[];
  serviceLines: PosServiceLineItem[];
  pricingMode: 'normal' | 'festival' | 'reseller';
  promotionRules: PromotionRuleRecord[];
  paidAmountInput: number | null;
}) {
  const goodsTotal = params.cart.reduce(
    (sum, r) => exactAdd(sum, Math.round(exactMul(r.qty, r.manualUnitPrice))),
    0
  );
  const servicesTotal = params.serviceLines.reduce(
    (sum, s) => exactAdd(sum, s.feeAmount),
    0
  );
  const totalQtyInCart = params.cart.reduce(
    (sum, r) => sum + (r.isDecantMl ? 1 : r.qty),
    0
  );

  const activeQuantityRule =
    params.pricingMode === 'festival'
      ? params.promotionRules.find(
          (r) =>
            r.isActive &&
            r.festivalType === 'خرید بالای X قلم' &&
            totalQtyInCart >= (r.minQty || 3)
        ) || null
      : null;

  const festivalExtraDiscount = activeQuantityRule
    ? activeQuantityRule.discountType === 'fixed'
      ? activeQuantityRule.discountValue
      : 0
    : 0;

  const grandTotal = Math.max(
    0,
    exactSub(exactAdd(goodsTotal, servicesTotal), festivalExtraDiscount)
  );
  const effectivePaidAmount =
    params.paidAmountInput === null
      ? grandTotal
      : Math.max(0, params.paidAmountInput);
  const creditReceivableAmount = Math.max(
    0,
    exactSub(grandTotal, effectivePaidAmount)
  );

  return {
    goodsTotal,
    servicesTotal,
    totalQtyInCart,
    activeQuantityRule,
    festivalExtraDiscount,
    grandTotal,
    effectivePaidAmount,
    creditReceivableAmount,
  };
}

export function resolveItemRowValuationCost(
  item: InventoryItemRecord,
  isDecantMl: boolean
): number {
  const bottleVol = item.bottleVolumeMl || item.liquidVolumeMl || 60;
  return isDecantMl
    ? calculateCostPerMl(item.valuationRate, bottleVol)
    : item.valuationRate;
}
