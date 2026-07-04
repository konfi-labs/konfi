import type { ExternalPriceConfiguration } from "@konfi/types";
import { SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE } from "@/lib/external-products/option-mapping-utils";

export function normalizeExternalPriceConfigurationSelection(
  configuration: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(configuration)
      .filter(
        ([, value]) => value !== SYNTHETIC_EMPTY_EXTERNAL_OPTION_VALUE,
      )
      .toSorted(([keyA], [keyB]) => keyA.localeCompare(keyB)),
  );
}

/**
 * Recursively strips keys whose value is `undefined` so the object is safe
 * to write to Firestore (which rejects explicit `undefined` values).
 * Mirrors the `removeUndefinedDeep` helper used elsewhere in the admin app.
 */
function removeUndefinedDeep<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map(removeUndefinedDeep) as T;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefinedDeep(v)]),
    ) as T;
  }
  return obj;
}

export function normalizeExternalPriceConfigurations(
  configurations: ExternalPriceConfiguration[],
): ExternalPriceConfiguration[] {
  return configurations.map((configuration) =>
    removeUndefinedDeep({
      ...configuration,
      configuration: normalizeExternalPriceConfigurationSelection(
        configuration.configuration,
      ),
    }),
  );
}
