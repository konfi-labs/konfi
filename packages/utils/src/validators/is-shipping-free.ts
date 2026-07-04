export function isShippingFree(
  subtotal: number,
  freeShippingEnabled: boolean,
  freeShippingMin: number,
) {
  return freeShippingEnabled && subtotal >= freeShippingMin;
}
