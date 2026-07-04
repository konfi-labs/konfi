export interface AllegroPublicationSettingsOption {
  id: string;
  name: string;
}

export interface AllegroPublicationSettingsOptionsResponse {
  impliedWarranties: AllegroPublicationSettingsOption[];
  responsibleProducers: AllegroPublicationSettingsOption[];
  returnPolicies: AllegroPublicationSettingsOption[];
  shippingRates: AllegroPublicationSettingsOption[];
  warranties: AllegroPublicationSettingsOption[];
}

export const EMPTY_ALLEGRO_PUBLICATION_SETTINGS_OPTIONS: AllegroPublicationSettingsOptionsResponse =
  {
    impliedWarranties: [],
    responsibleProducers: [],
    returnPolicies: [],
    shippingRates: [],
    warranties: [],
  };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizePublicationOption(
  value: unknown,
): AllegroPublicationSettingsOption | undefined {
  if (!isObject(value)) return undefined;
  if (typeof value.id !== "string" || typeof value.name !== "string") {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
  };
}

export function normalizeAllegroPublicationOptions(
  payload: unknown,
  property: string,
): AllegroPublicationSettingsOption[] {
  if (!isObject(payload) || !Array.isArray(payload[property])) return [];

  return payload[property].flatMap((item) => {
    const option = normalizePublicationOption(item);
    return option ? [option] : [];
  });
}

function isPublicationOption(
  value: unknown,
): value is AllegroPublicationSettingsOption {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isPublicationOptionList(
  value: unknown,
): value is AllegroPublicationSettingsOption[] {
  return Array.isArray(value) && value.every(isPublicationOption);
}

export function isAllegroPublicationSettingsOptionsResponse(
  value: unknown,
): value is AllegroPublicationSettingsOptionsResponse {
  return (
    isObject(value) &&
    isPublicationOptionList(value.impliedWarranties) &&
    isPublicationOptionList(value.responsibleProducers) &&
    isPublicationOptionList(value.returnPolicies) &&
    isPublicationOptionList(value.shippingRates) &&
    isPublicationOptionList(value.warranties)
  );
}
