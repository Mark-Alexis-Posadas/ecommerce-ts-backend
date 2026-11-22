/** Decimal-number input is converted through its base-10 representation, not multiplied as a float. */
function fraction(value: number): [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0) throw new Error("Invalid monetary value");
  const [coefficient, exponent = "0"] = value.toString().toLowerCase().split("e");
  const [whole, decimals = ""] = coefficient.split(".");
  const scale = decimals.length - Number(exponent);
  const numerator = BigInt(whole + decimals);
  return scale >= 0 ? [numerator, 10n ** BigInt(scale)] : [numerator * 10n ** BigInt(-scale), 1n];
}

export function effectivePriceCentavos(price: number, discount = 0): number {
  if (discount < 0 || discount > 100) throw new Error("Invalid discount");
  const [priceNumerator, priceDenominator] = fraction(price);
  const [discountNumerator, discountDenominator] = fraction(discount);
  const numerator = priceNumerator * 100n * (100n * discountDenominator - discountNumerator);
  const denominator = priceDenominator * 100n * discountDenominator;
  const rounded = (numerator * 2n + denominator) / (denominator * 2n);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Price exceeds safe monetary range");
  return Number(rounded);
}

export function checkedMultiply(cents: number, quantity: number): number {
  const total = cents * quantity;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("Total exceeds safe monetary range");
  return total;
}
