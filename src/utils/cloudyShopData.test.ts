import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUDY_SHOP_CONTACTS,
  CLOUDY_SHOP_INVENTORY,
  CLOUDY_SHOP_SOURCE_FILE,
} from '../data/cloudyShopData';

test('Cloudy Shop source data preserves approved counts and valuation', () => {
  assert.equal(CLOUDY_SHOP_SOURCE_FILE, 'Cloudy Shop New (1).xlsx');
  assert.equal(CLOUDY_SHOP_INVENTORY.length, 325);
  assert.equal(CLOUDY_SHOP_CONTACTS.length, 28);
  assert.equal(
    CLOUDY_SHOP_INVENTORY.reduce((total, item) => total + item.stockQty, 0),
    1567
  );
  assert.equal(
    CLOUDY_SHOP_INVENTORY.reduce(
      (total, item) => total + item.stockQty * item.valuationRate,
      0
    ),
    1_113_625_000
  );
});

test('Cloudy Shop import identifiers and source corrections remain explicit', () => {
  const skus = CLOUDY_SHOP_INVENTORY.map((item) => item.sku);
  assert.equal(new Set(skus).size, skus.length);
  assert.equal(
    CLOUDY_SHOP_INVENTORY.filter((item) => item.sku.startsWith('CLOUDY-INTERNAL-ROW-')).length,
    14
  );
  assert.equal(CLOUDY_SHOP_INVENTORY.filter((item) => !item.isActive).length, 8);
  assert.equal(CLOUDY_SHOP_CONTACTS.filter((contact) => !contact.phone).length, 4);
  assert.equal(
    CLOUDY_SHOP_INVENTORY.filter((item) =>
      item.sourceStatus?.includes('موجودی منبع -1 به درخواست کاربر صفر شد')
    ).length,
    1
  );
});
