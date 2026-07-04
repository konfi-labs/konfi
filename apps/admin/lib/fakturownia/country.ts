const COUNTRY_CODE_ALIASES: Record<string, string> = {
  at: "AT",
  aut: "AT",
  austria: "AT",
  be: "BE",
  bel: "BE",
  belgia: "BE",
  belgium: "BE",
  bg: "BG",
  bgr: "BG",
  bulgaria: "BG",
  by: "BY",
  blr: "BY",
  bialorus: "BY",
  belarus: "BY",
  ch: "CH",
  che: "CH",
  szwajcaria: "CH",
  switzerland: "CH",
  cy: "CY",
  cyp: "CY",
  cypr: "CY",
  cyprus: "CY",
  cz: "CZ",
  cze: "CZ",
  czechia: "CZ",
  czechy: "CZ",
  "czech republic": "CZ",
  "republika czeska": "CZ",
  "ceska republika": "CZ",
  de: "DE",
  deu: "DE",
  germany: "DE",
  niemcy: "DE",
  deutschland: "DE",
  dk: "DK",
  dnk: "DK",
  dania: "DK",
  denmark: "DK",
  ee: "EE",
  est: "EE",
  estonia: "EE",
  es: "ES",
  esp: "ES",
  hiszpania: "ES",
  spain: "ES",
  espana: "ES",
  fi: "FI",
  fin: "FI",
  finland: "FI",
  finlandia: "FI",
  fr: "FR",
  fra: "FR",
  france: "FR",
  francja: "FR",
  gb: "GB",
  gbr: "GB",
  uk: "GB",
  "great britain": "GB",
  "united kingdom": "GB",
  "wielka brytania": "GB",
  england: "GB",
  gr: "GR",
  grc: "GR",
  greece: "GR",
  grecja: "GR",
  hr: "HR",
  hrv: "HR",
  croatia: "HR",
  chorwacja: "HR",
  hu: "HU",
  hun: "HU",
  hungary: "HU",
  wegry: "HU",
  ie: "IE",
  irl: "IE",
  ireland: "IE",
  irlandia: "IE",
  it: "IT",
  ita: "IT",
  italy: "IT",
  italia: "IT",
  wlochy: "IT",
  lt: "LT",
  ltu: "LT",
  lithuania: "LT",
  litwa: "LT",
  lu: "LU",
  lux: "LU",
  luxembourg: "LU",
  luksemburg: "LU",
  lv: "LV",
  lva: "LV",
  latvia: "LV",
  lotwa: "LV",
  mt: "MT",
  mlt: "MT",
  malta: "MT",
  nl: "NL",
  nld: "NL",
  netherlands: "NL",
  nederland: "NL",
  holandia: "NL",
  "the netherlands": "NL",
  no: "NO",
  nor: "NO",
  norway: "NO",
  norwegia: "NO",
  pl: "PL",
  pol: "PL",
  poland: "PL",
  polska: "PL",
  pt: "PT",
  prt: "PT",
  portugal: "PT",
  portugalia: "PT",
  ro: "RO",
  rou: "RO",
  romania: "RO",
  rumunia: "RO",
  se: "SE",
  swe: "SE",
  sweden: "SE",
  szwecja: "SE",
  si: "SI",
  svn: "SI",
  slovenia: "SI",
  slowenia: "SI",
  sk: "SK",
  svk: "SK",
  slovakia: "SK",
  slowacja: "SK",
  "slovak republic": "SK",
  ua: "UA",
  ukr: "UA",
  ukraine: "UA",
  ukraina: "UA",
  us: "US",
  usa: "US",
  "united states": "US",
  "stany zjednoczone": "US",
};

export interface FakturowniaCountryOption {
  value: string;
  defaultLabel: string;
}

export const FAKTUROWNIA_COUNTRY_OPTIONS: readonly FakturowniaCountryOption[] =
  [
    { value: "AT", defaultLabel: "Austria" },
    { value: "BE", defaultLabel: "Belgium" },
    { value: "BG", defaultLabel: "Bulgaria" },
    { value: "BY", defaultLabel: "Belarus" },
    { value: "CH", defaultLabel: "Switzerland" },
    { value: "CY", defaultLabel: "Cyprus" },
    { value: "CZ", defaultLabel: "Czech Republic" },
    { value: "DE", defaultLabel: "Germany" },
    { value: "DK", defaultLabel: "Denmark" },
    { value: "EE", defaultLabel: "Estonia" },
    { value: "ES", defaultLabel: "Spain" },
    { value: "FI", defaultLabel: "Finland" },
    { value: "FR", defaultLabel: "France" },
    { value: "GB", defaultLabel: "United Kingdom" },
    { value: "GR", defaultLabel: "Greece" },
    { value: "HR", defaultLabel: "Croatia" },
    { value: "HU", defaultLabel: "Hungary" },
    { value: "IE", defaultLabel: "Ireland" },
    { value: "IT", defaultLabel: "Italy" },
    { value: "LT", defaultLabel: "Lithuania" },
    { value: "LU", defaultLabel: "Luxembourg" },
    { value: "LV", defaultLabel: "Latvia" },
    { value: "MT", defaultLabel: "Malta" },
    { value: "NL", defaultLabel: "Netherlands" },
    { value: "NO", defaultLabel: "Norway" },
    { value: "PL", defaultLabel: "Poland" },
    { value: "PT", defaultLabel: "Portugal" },
    { value: "RO", defaultLabel: "Romania" },
    { value: "SE", defaultLabel: "Sweden" },
    { value: "SI", defaultLabel: "Slovenia" },
    { value: "SK", defaultLabel: "Slovakia" },
    { value: "UA", defaultLabel: "Ukraine" },
    { value: "US", defaultLabel: "United States" },
  ];

const KNOWN_COUNTRY_CODES = new Set(Object.values(COUNTRY_CODE_ALIASES));
const ISO_ALPHA_2_PATTERN = /^[a-z]{2}$/i;

function normalizeCountryLookupKey(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[._,/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeCountryCode(
  value: string | null | undefined,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  if (ISO_ALPHA_2_PATTERN.test(trimmed)) {
    const countryCode = trimmed.toUpperCase();
    return KNOWN_COUNTRY_CODES.has(countryCode) ? countryCode : undefined;
  }

  const normalizedKey = normalizeCountryLookupKey(trimmed);
  const aliasMatch = COUNTRY_CODE_ALIASES[normalizedKey];
  if (aliasMatch) {
    return aliasMatch;
  }

  const tokenMatch = trimmed
    .toUpperCase()
    .split(/[^A-Z]+/)
    .find((token) => token.length === 2 && KNOWN_COUNTRY_CODES.has(token));

  return tokenMatch;
}

export function getNormalizedCountryCode(
  value: string | null | undefined,
  fallback = "PL",
): string {
  return normalizeCountryCode(value) ?? fallback;
}
