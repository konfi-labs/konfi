export function normalizeStoreCreditAmount(amount: unknown): number {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.floor(amount);
}

export function getStoreCreditRedemptionLimit({
  balance,
  orderTotal,
}: {
  balance: unknown;
  orderTotal: unknown;
}): number {
  return Math.min(
    normalizeStoreCreditAmount(balance),
    normalizeStoreCreditAmount(orderTotal),
  );
}

export function isStoreCreditRedemptionAllowed({
  balance,
  orderTotal,
  requestedAmount,
}: {
  balance: unknown;
  orderTotal: unknown;
  requestedAmount: unknown;
}): boolean {
  const requested = normalizeStoreCreditAmount(requestedAmount);

  return (
    requested === 0 ||
    requested <= getStoreCreditRedemptionLimit({ balance, orderTotal })
  );
}
