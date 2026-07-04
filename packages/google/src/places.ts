export interface GoogleReview {
  authorName: string;
  rating: number;
  text: string;
  relativePublishTimeDescription: string;
  profilePhotoUrl?: string;
}

export interface GooglePlaceAddressPrediction {
  place: string;
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
}

export interface GooglePlaceAddressFields {
  street: string;
  number: string;
  local: string;
  zip: string;
  city: string;
  country: string;
  countryCode: string;
}

export interface GetGooglePlaceAddressPredictionsParams {
  apiKey: string;
  input: string;
  countryCode?: string;
  languageCode?: string;
  sessionToken?: string;
}

export interface GetGooglePlaceAddressDetailsParams {
  apiKey: string;
  placeId: string;
  languageCode?: string;
  sessionToken?: string;
}

interface PlacesApiReview {
  authorAttribution?: {
    displayName?: string;
    photoUri?: string;
  };
  rating?: number;
  text?: {
    text?: string;
  };
  relativePublishTimeDescription?: string;
}

interface PlacesApiResponse {
  reviews?: PlacesApiReview[];
}

interface PlacesApiText {
  text?: string;
}

interface PlacesApiAddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

interface PlacesApiAutocompletePrediction {
  place?: string;
  placeId?: string;
  text?: PlacesApiText;
  structuredFormat?: {
    mainText?: PlacesApiText;
    secondaryText?: PlacesApiText;
  };
}

interface PlacesApiAutocompleteResponse {
  suggestions?: {
    placePrediction?: PlacesApiAutocompletePrediction;
  }[];
}

interface PlacesApiPlaceDetailsResponse {
  addressComponents?: PlacesApiAddressComponent[];
}

const GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.place",
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text.text",
  "suggestions.placePrediction.structuredFormat.mainText.text",
  "suggestions.placePrediction.structuredFormat.secondaryText.text",
].join(",");

const GOOGLE_PLACE_DETAILS_FIELD_MASK = "addressComponents";
const MAX_AUTOCOMPLETE_SUGGESTIONS = 5;

const COUNTRY_ALIASES: Record<string, string> = {
  AUSTRIA: "AT",
  BELGIA: "BE",
  BELGIUM: "BE",
  CZECHIA: "CZ",
  "CZECH REPUBLIC": "CZ",
  CZECHY: "CZ",
  DANIA: "DK",
  DENMARK: "DK",
  ESTONIA: "EE",
  FRANCE: "FR",
  FRANCJA: "FR",
  GERMANY: "DE",
  HISZPANIA: "ES",
  HOLANDIA: "NL",
  IRELAND: "IE",
  IRLANDIA: "IE",
  ITALY: "IT",
  LATVIA: "LV",
  LITHUANIA: "LT",
  LITWA: "LT",
  LOTWA: "LV",
  NETHERLANDS: "NL",
  NIDERLANDY: "NL",
  NIEMCY: "DE",
  NORWAY: "NO",
  NORWEGIA: "NO",
  POLAND: "PL",
  POLSKA: "PL",
  PORTUGAL: "PT",
  PORTUGALIA: "PT",
  SLOVAKIA: "SK",
  SLOWACJA: "SK",
  SPAIN: "ES",
  SWEDEN: "SE",
  SWITZERLAND: "CH",
  SZWAJCARIA: "CH",
  SZWECJA: "SE",
  UK: "GB",
  UKRAINA: "UA",
  UKRAINE: "UA",
  "UNITED KINGDOM": "GB",
  "UNITED STATES": "US",
  USA: "US",
  "WIELKA BRYTANIA": "GB",
  WLOCHY: "IT",
};

const CITY_COMPONENT_TYPES = [
  "locality",
  "postal_town",
  "administrative_area_level_3",
  "sublocality_level_1",
  "sublocality",
  "administrative_area_level_2",
];

const LOCAL_COMPONENT_TYPES = ["subpremise", "floor", "room"];

const normalizeAliasKey = (value: string) =>
  value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();

const normalizeLanguageCode = (languageCode?: string) => {
  const normalizedLanguageCode = languageCode?.trim();
  return normalizedLanguageCode ? normalizedLanguageCode : undefined;
};

const getAddressComponent = (
  addressComponents: PlacesApiAddressComponent[] | undefined,
  types: string[],
) => {
  if (!addressComponents) {
    return undefined;
  }

  for (const type of types) {
    const component = addressComponents.find((candidate) =>
      candidate.types?.includes(type),
    );

    if (component) {
      return component;
    }
  }

  return undefined;
};

const getAddressComponentText = (
  addressComponents: PlacesApiAddressComponent[] | undefined,
  types: string[],
  textType: "longText" | "shortText" = "longText",
) => getAddressComponent(addressComponents, types)?.[textType] ?? "";

async function readGooglePlacesError(response: Response) {
  const errorBody = await response.text();

  if (!errorBody) {
    return `${response.status} ${response.statusText}`;
  }

  return `${response.status} ${response.statusText}: ${errorBody}`;
}

export function resolveGooglePlaceRegionCode(country?: string | null) {
  const normalizedCountry = country?.trim();

  if (!normalizedCountry) {
    return undefined;
  }

  if (/^[A-Za-z]{2}$/.test(normalizedCountry)) {
    return normalizedCountry.toUpperCase();
  }

  return COUNTRY_ALIASES[normalizeAliasKey(normalizedCountry)];
}

export function mapGooglePlaceAutocompletePredictions(
  response: PlacesApiAutocompleteResponse,
): GooglePlaceAddressPrediction[] {
  return (response.suggestions ?? [])
    .flatMap((suggestion) => {
      const prediction = suggestion.placePrediction;

      if (!prediction?.place || !prediction.placeId || !prediction.text?.text) {
        return [];
      }

      return [
        {
          place: prediction.place,
          placeId: prediction.placeId,
          label: prediction.text.text,
          mainText:
            prediction.structuredFormat?.mainText?.text ?? prediction.text.text,
          secondaryText: prediction.structuredFormat?.secondaryText?.text ?? "",
        },
      ];
    })
    .slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS);
}

export function extractGooglePlaceAddressFields(
  response: PlacesApiPlaceDetailsResponse,
): GooglePlaceAddressFields {
  const addressComponents = response.addressComponents ?? [];

  return {
    street: getAddressComponentText(addressComponents, ["route"]),
    number: getAddressComponentText(addressComponents, ["street_number"]),
    local: getAddressComponentText(addressComponents, LOCAL_COMPONENT_TYPES),
    zip: getAddressComponentText(addressComponents, ["postal_code"]),
    city: getAddressComponentText(addressComponents, CITY_COMPONENT_TYPES),
    country: getAddressComponentText(addressComponents, ["country"]),
    countryCode: getAddressComponentText(
      addressComponents,
      ["country"],
      "shortText",
    ).toUpperCase(),
  };
}

export async function getGooglePlaceAddressPredictions({
  apiKey,
  input,
  countryCode,
  languageCode,
  sessionToken,
}: GetGooglePlaceAddressPredictionsParams): Promise<
  GooglePlaceAddressPrediction[]
> {
  const regionCode = countryCode?.toLowerCase();
  const normalizedLanguageCode = normalizeLanguageCode(languageCode);
  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_PLACES_AUTOCOMPLETE_FIELD_MASK,
      },
      body: JSON.stringify({
        input,
        includeQueryPredictions: false,
        ...(regionCode
          ? {
              includedRegionCodes: [regionCode],
              regionCode,
            }
          : {}),
        ...(normalizedLanguageCode
          ? { languageCode: normalizedLanguageCode }
          : {}),
        ...(sessionToken ? { sessionToken } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await readGooglePlacesError(response));
  }

  const data = (await response.json()) as PlacesApiAutocompleteResponse;
  return mapGooglePlaceAutocompletePredictions(data);
}

export async function getGooglePlaceAddressDetails({
  apiKey,
  placeId,
  languageCode,
  sessionToken,
}: GetGooglePlaceAddressDetailsParams): Promise<GooglePlaceAddressFields> {
  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
  );
  const normalizedLanguageCode = normalizeLanguageCode(languageCode);

  if (normalizedLanguageCode) {
    url.searchParams.set("languageCode", normalizedLanguageCode);
  }

  if (sessionToken) {
    url.searchParams.set("sessionToken", sessionToken);
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": GOOGLE_PLACE_DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    throw new Error(await readGooglePlacesError(response));
  }

  const data = (await response.json()) as PlacesApiPlaceDetailsResponse;
  return extractGooglePlaceAddressFields(data);
}

export async function getGooglePlaceReviews(
  placeId: string,
  apiKey: string,
  languageCode?: string,
): Promise<GoogleReview[]> {
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}${languageCode ? `?languageCode=${encodeURIComponent(languageCode)}` : ""}`;

  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "reviews",
    },
  });

  if (!response.ok) {
    throw new Error(await readGooglePlacesError(response));
  }

  const data: PlacesApiResponse = await response.json();

  if (!data.reviews) return [];

  return data.reviews
    .filter((r) => r.authorAttribution?.displayName && r.text?.text)
    .map((r) => ({
      authorName: r.authorAttribution!.displayName!,
      rating: r.rating ?? 5,
      text: r.text!.text!,
      relativePublishTimeDescription: r.relativePublishTimeDescription ?? "",
      profilePhotoUrl: r.authorAttribution?.photoUri,
    }));
}
