import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAmountInput, formatPaise, formatSignedAmount, parseAmountToPaise } from '../src/domain/money.ts';

test('converts decimal rupees to exact integer paise', () => {
  assert.equal(parseAmountToPaise('120.05'), 12005);
  assert.equal(parseAmountToPaise('0.01'), 1);
  assert.equal(parseAmountToPaise('1.2'), 120);
  assert.equal(parseAmountToPaise('12500'), 1250000);
});

test('rejects zero, negative, malformed, and overprecision amounts', () => {
  for (const input of ['', '0', '0.00', '-1', '1.005', '1e3', 'NaN', '999999999999999999']) {
    assert.equal(parseAmountToPaise(input), null, input);
  }
});

test('formats Indian rupee values and transaction signs', () => {
  assert.equal(formatPaise(123456789), '₹12,34,567.89');
  assert.equal(formatPaise(-105), '-₹1.05');
  assert.equal(formatSignedAmount(12005, 'expense'), '-₹120.05');
  assert.equal(formatSignedAmount(12005, 'income'), '+₹120.05');
  assert.equal(formatAmountInput(101), '1.01');
});
