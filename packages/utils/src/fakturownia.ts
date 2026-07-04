/**
 * Fakturownia integration constants and utilities.
 *
 * IMPORTANT: The FAKTUROWNIA_UNIT_PRICE_PRECISION value must match your
 * Fakturownia account settings (Account → Settings → Invoices → Unit price precision).
 * Available options are 2, 3, 4, or 5 decimal places.
 */

/**
 * Custom payment labels used on Fakturownia invoices.
 *
 * NOTE: Fakturownia appears to normalize the literal "Stripe" payment label to
 * a card payment in some invoice views. We use a slightly more specific custom
 * label to preserve the actual gateway name.
 */
export const FAKTUROWNIA_CUSTOM_PAYMENT_TYPE_LABELS = {
  PRZEDPLATA: "Przedpłata",
  PRZELEWY24: "Przelewy24",
  STRIPE: "Stripe",
  ALLEGRO: "Allegro",
} as const;

/**
 * Number of decimal places for unit prices in Fakturownia.
 * This should match the "Unit price precision" setting in Fakturownia.
 * Options: 2, 3, 4, or 5 decimal places.
 */
export const FAKTUROWNIA_UNIT_PRICE_PRECISION = 2;

/**
 * Standard precision for currency totals (always 2 decimal places).
 */
export const FAKTUROWNIA_TOTAL_PRECISION = 2;

/**
 * Round a unit price to Fakturownia's configured precision.
 */
export const roundUnitPrice = (value: number): number => {
  return Number(value.toFixed(FAKTUROWNIA_UNIT_PRICE_PRECISION));
};

/**
 * Round a total amount to standard currency precision (2 decimal places).
 */
export const roundTotal = (value: number): number => {
  return Number(value.toFixed(FAKTUROWNIA_TOTAL_PRECISION));
};

/**
 * Format a unit price for display with Fakturownia's configured precision.
 */
export const formatUnitPrice = (value: number): string => {
  return value.toFixed(FAKTUROWNIA_UNIT_PRICE_PRECISION);
};

/**
 * Format a total amount for display (2 decimal places).
 */
export const formatTotal = (value: number): string => {
  return value.toFixed(FAKTUROWNIA_TOTAL_PRECISION);
};

/**
 * Convert minor currency units (e.g., grosze) to major units (e.g., PLN).
 * Uses standard 2 decimal precision for totals.
 */
export const minorToMajor = (minor?: number): number | undefined => {
  if (typeof minor !== "number" || !Number.isFinite(minor)) return undefined;
  return roundTotal(minor / 100);
};

/**
 * Convert minor currency units to major units, returning 0 for invalid inputs.
 * Uses standard 2 decimal precision for totals.
 */
export const minorToMajorSafe = (minor?: number | null): number => {
  if (typeof minor !== "number" || Number.isNaN(minor)) {
    return 0;
  }
  return roundTotal(minor / 100);
};

/**
 * Multiply a currency unit price by a quantity with proper rounding.
 *
 * This function handles floating-point precision issues that can cause
 * 1 grosz/cent differences when multiplying currency values.
 *
 * For example: 0.70 * 16.95 = 11.864999999999998 in JavaScript
 * but should mathematically be 11.865, which rounds to 11.87.
 *
 * The solution is to convert the unit price to minor units (grosze/cents),
 * multiply by quantity, then round and convert back to major units.
 *
 * @param unitPrice - Unit price in major currency units (e.g., PLN)
 * @param quantity - Quantity to multiply by
 * @returns Total in major currency units, properly rounded to 2 decimal places
 */
export const multiplyCurrency = (unitPrice: number, quantity: number): number => {
  if (!Number.isFinite(unitPrice) || !Number.isFinite(quantity)) {
    return 0;
  }

  // Convert unit price to minor units (grosze/cents) to avoid precision issues
  // Use Math.round with Number.EPSILON to handle values like 0.70 that can have
  // floating-point representation issues
  const unitPriceMinor = Math.round(
    (unitPrice + Number.EPSILON) * 100
  );

  // Multiply in minor units - this is more precise since unitPriceMinor is an integer
  const totalMinor = unitPriceMinor * quantity;

  // Round to nearest integer (for grosze/cents) and convert back to major units
  return Math.round(totalMinor) / 100;
};
