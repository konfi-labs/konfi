export const tenantContextQueryParam = "tenantId";

const tenantContextHintPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function normalizeTenantContextHint(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();

  if (!normalized || !tenantContextHintPattern.test(normalized)) {
    return;
  }

  return normalized;
}
