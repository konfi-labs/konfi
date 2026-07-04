import {
  ShippingOptions,
  ShippingTypes,
  type ShippingMethodId,
  type ShippingMethodsSettings,
} from "@konfi/types";
import { isEmpty } from "es-toolkit/compat";
import { arrayIntersection } from "../array-intersection";
import {
  getEnabledShippingMethodDefinitions,
  type ShippingRuleContext,
} from "../shipping-methods";

export function getAvailableShippingOptions(
  shippingTypes: readonly (readonly ShippingTypes[] | null | undefined)[],
  isStore: boolean = false,
  shippingMethodsSettings?: Partial<ShippingMethodsSettings> | null,
  ruleContext?: ShippingRuleContext,
): ShippingMethodId[] | null {
  if (!Array.isArray(shippingTypes) || isEmpty(shippingTypes)) return null;
  const shippingTypesIntersection = arrayIntersection(...shippingTypes);
  if (
    !Array.isArray(shippingTypesIntersection) ||
    isEmpty(shippingTypesIntersection)
  )
    return null;
  if (shippingMethodsSettings) {
    const shippingTypeSet = new Set(shippingTypesIntersection);
    const configuredOptions = getEnabledShippingMethodDefinitions(
      shippingMethodsSettings,
      { ruleContext },
    )
      .filter((method) => shippingTypeSet.has(method.kind))
      .filter((method) => {
        if (!isStore) {
          return true;
        }

        return (
          method.kind !== ShippingTypes.CUSTOM &&
          method.id !== ShippingOptions.COMPANY_COURIER
        );
      })
      .map((method) => method.id);

    return configuredOptions.length > 0 ? configuredOptions : null;
  }
  let shippingOptions: ShippingMethodId[] = [];
  const hasCourier = shippingTypesIntersection?.includes(ShippingTypes.COURIER);
  const hasParcelLocker = shippingTypesIntersection?.includes(
    ShippingTypes.PARCEL_DELIVERY_LOCKER,
  );

  if (shippingTypesIntersection?.includes(ShippingTypes.CUSTOM) && !isStore) {
    shippingOptions.push(ShippingOptions.CUSTOM);
  }
  if (hasCourier) {
    if (!isStore) {
      shippingOptions.push(ShippingOptions.COMPANY_COURIER);
    }

    shippingOptions.push(
      ShippingOptions.INPOST,
      ...(hasParcelLocker ? [ShippingOptions.PACZKOMATY_INPOST] : []),
      ShippingOptions.DHL,
      ShippingOptions.DPD,
      ShippingOptions.FEDEX,
    );
  }

  if (hasParcelLocker && !hasCourier) {
    shippingOptions.push(ShippingOptions.PACZKOMATY_INPOST);
  }

  if (shippingTypesIntersection?.includes(ShippingTypes.PERSONAL_COLLECTION)) {
    shippingOptions.push(ShippingOptions.PERSONAL_COLLECTION);
  }

  return shippingOptions;
}
