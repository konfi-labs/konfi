"use client";

import {
  Box,
  Combobox,
  HStack,
  Portal,
  Spinner,
  Text,
  useListCollection,
} from "@chakra-ui/react";
import { FieldData } from "@konfi/types";
import { formatStreetLine, parseStreetAddress } from "@konfi/utils";
import { i18n, TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  FieldValues,
  useFormContext,
  useWatch,
} from "react-hook-form";

const DONE_TYPING_INTERVAL = 300;
const MIN_QUERY_LENGTH = 3;
const BLUR_CLOSE_DELAY = 150;
const AUTOCOMPLETE_ROUTE = "/api/google/places/autocomplete";
const DETAILS_ROUTE = "/api/google/places/details";

type ToastApi = {
  create: (options: {
    title: string;
    description?: string;
    type?: "error" | "info" | "success" | "warning";
    duration?: number;
  }) => void;
};

interface GooglePlacesAutocompleteRouteResponse {
  suggestions: AddressAutocompleteSuggestion[];
}

interface GooglePlaceDetailsRouteResponse {
  address: GooglePlaceAddressFields;
}

type WindowWithKonfiAppCheck = Window & {
  __getKonfiAppCheckToken?: () => Promise<string | null>;
};

interface AddressAutocompleteSuggestion {
  place: string;
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
}

interface GooglePlaceAddressFields {
  street: string;
  number: string;
  local: string;
  zip: string;
  city: string;
  country: string;
  countryCode: string;
}

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

const getStringValue = (value: unknown) =>
  typeof value === "string" ? value : "";

const normalizeAliasKey = (value: string) =>
  value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();

const resolveCountryCode = (country?: string | null) => {
  const normalizedCountry = country?.trim();

  if (!normalizedCountry) {
    return undefined;
  }

  if (/^[A-Za-z]{2}$/.test(normalizedCountry)) {
    return normalizedCountry.toUpperCase();
  }

  return COUNTRY_ALIASES[normalizeAliasKey(normalizedCountry)];
};

export const createGooglePlacesSessionToken = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const tokenBytes = new Uint8Array(16);
    crypto.getRandomValues(tokenBytes);
    return btoa(String.fromCharCode(...tokenBytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  return Math.random().toString(36).slice(2, 18);
};

const getAddressFieldNames = (streetFieldName: string) => {
  const prefix = streetFieldName.endsWith(".street")
    ? streetFieldName.slice(0, -"street".length)
    : "";

  return {
    city: `${prefix}city`,
    country: `${prefix}country`,
    local: `${prefix}local`,
    number: `${prefix}number`,
    street: streetFieldName,
    zip: `${prefix}zip`,
  };
};

async function getGooglePlacesRequestHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (typeof window === "undefined") {
    return headers;
  }

  const tokenGetter = (window as WindowWithKonfiAppCheck)
    .__getKonfiAppCheckToken;

  if (typeof tokenGetter !== "function") {
    return headers;
  }

  try {
    const appCheckToken = await tokenGetter();

    if (appCheckToken) {
      return {
        ...headers,
        "X-Firebase-AppCheck": appCheckToken,
      };
    }
  } catch (error) {
    console.error("Error getting App Check token for Google Places:", error);
  }

  return headers;
}

async function fetchGooglePlaceSuggestions(
  body: {
    input: string;
    country?: string;
    languageCode?: string;
    sessionToken: string;
  },
  signal: AbortSignal,
) {
  const response = await fetch(AUTOCOMPLETE_ROUTE, {
    method: "POST",
    headers: await getGooglePlacesRequestHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as GooglePlacesAutocompleteRouteResponse;
}

async function fetchGooglePlaceDetails(
  body: {
    placeId: string;
    languageCode?: string;
    sessionToken: string;
  },
  signal: AbortSignal,
) {
  const response = await fetch(DETAILS_ROUTE, {
    method: "POST",
    headers: await getGooglePlacesRequestHeaders(),
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as GooglePlaceDetailsRouteResponse;
}

export const AddressAutocompleteFieldController = ({
  fieldData,
  disabled,
  toaster,
  t,
  i18n,
}: {
  fieldData: FieldData;
  disabled: boolean;
  toaster: ToastApi;
  t: TFunction;
  i18n: i18n;
}) => {
  const { control, getValues, setValue } = useFormContext<FieldValues>();
  const addressFieldNames = useMemo(
    () => getAddressFieldNames(fieldData.name),
    [fieldData.name],
  );
  const watchedStreetValue = useWatch({
    control,
    name: addressFieldNames.street,
  });
  const watchedCountryValue = useWatch({
    control,
    name: addressFieldNames.country,
  });
  const [inputValue, setInputValue] = useState(
    getStringValue(watchedStreetValue),
  );
  const [currentOptions, setCurrentOptions] = useState<
    AddressAutocompleteSuggestion[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasFetchedOptions, setHasFetchedOptions] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [selectedValue, setSelectedValue] = useState<string[]>([]);
  const searchAbortRef = useRef<AbortController | null>(null);
  const detailsAbortRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const sessionTokenRef = useRef(createGooglePlacesSessionToken());
  const languageCode = i18n.resolvedLanguage ?? i18n.language ?? "en";

  const { collection, set } = useListCollection<AddressAutocompleteSuggestion>({
    initialItems: [],
    itemToString: (item) => item.label,
    itemToValue: (item) => item.placeId,
  });

  useEffect(() => {
    set(currentOptions);
  }, [currentOptions, set]);

  useEffect(() => {
    const normalizedStreetValue = getStringValue(watchedStreetValue);

    setInputValue((currentInputValue) =>
      currentInputValue === normalizedStreetValue
        ? currentInputValue
        : normalizedStreetValue,
    );
    setSelectedValue([]);
    setCurrentOptions([]);
    setHasFetchedOptions(false);
    setSearchFailed(false);
  }, [watchedStreetValue]);

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  }, []);

  const cancelPendingSearch = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }

    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
  }, []);

  const cancelPendingDetails = useCallback(() => {
    detailsAbortRef.current?.abort();
    detailsAbortRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelPendingSearch();
      cancelPendingDetails();
      clearBlurTimeout();
    },
    [cancelPendingDetails, cancelPendingSearch, clearBlurTimeout],
  );

  const updateFieldValue = useCallback(
    (
      name: string,
      nextValue: string,
      options?: {
        shouldDirty?: boolean;
        shouldTouch?: boolean;
        shouldValidate?: boolean;
      },
    ) => {
      const currentValue = getStringValue(getValues(name));

      if (currentValue === nextValue) {
        return;
      }

      setValue(name, nextValue, {
        shouldDirty: options?.shouldDirty ?? true,
        shouldTouch: options?.shouldTouch ?? false,
        shouldValidate: options?.shouldValidate ?? false,
      });
    },
    [getValues, setValue],
  );

  const syncCommittedStreetFields = useCallback(
    (streetLine: string) => {
      const parsedStreet = parseStreetAddress(streetLine);
      updateFieldValue(addressFieldNames.street, streetLine, {
        shouldValidate: true,
      });
      updateFieldValue(addressFieldNames.number, parsedStreet.number, {
        shouldValidate: true,
      });
      updateFieldValue(addressFieldNames.local, parsedStreet.flat, {
        shouldValidate: true,
      });
    },
    [addressFieldNames, updateFieldValue],
  );

  const normalizeStreetField = useCallback(() => {
    const currentStreetLine = inputValue.trim();

    if (!currentStreetLine) {
      syncCommittedStreetFields("");
      return;
    }

    const parsedStreet = parseStreetAddress(currentStreetLine);
    const formattedStreetLine = formatStreetLine(
      parsedStreet.street || currentStreetLine,
      parsedStreet.number,
      parsedStreet.flat,
    );

    setInputValue(formattedStreetLine);
    syncCommittedStreetFields(formattedStreetLine);
  }, [inputValue, syncCommittedStreetFields]);

  const getCountryValueToApply = useCallback(
    (address: GooglePlaceAddressFields) => {
      const currentCountryValue = getStringValue(watchedCountryValue);

      if (currentCountryValue) {
        const currentCountryCode = resolveCountryCode(currentCountryValue);

        if (currentCountryCode && currentCountryCode === address.countryCode) {
          return currentCountryValue;
        }
      }

      if (address.countryCode === "PL" && languageCode.startsWith("pl")) {
        return t("ui.country.poland", { defaultValue: "Poland" });
      }

      return address.country || currentCountryValue;
    },
    [languageCode, t, watchedCountryValue],
  );

  const applySelectedAddress = useCallback(
    (
      prediction: AddressAutocompleteSuggestion,
      address: GooglePlaceAddressFields,
    ) => {
      const formattedStreetLine = formatStreetLine(
        address.street || prediction.mainText || inputValue,
        address.number,
        address.local,
      );

      setInputValue(formattedStreetLine);
      setSelectedValue([prediction.placeId]);
      updateFieldValue(addressFieldNames.street, formattedStreetLine, {
        shouldValidate: true,
      });
      updateFieldValue(addressFieldNames.number, address.number, {
        shouldValidate: true,
      });
      updateFieldValue(addressFieldNames.local, address.local, {
        shouldValidate: true,
      });
      updateFieldValue(addressFieldNames.zip, address.zip, {
        shouldValidate: true,
      });
      updateFieldValue(addressFieldNames.city, address.city, {
        shouldValidate: true,
      });
      updateFieldValue(
        addressFieldNames.country,
        getCountryValueToApply(address),
        { shouldValidate: true },
      );
    },
    [addressFieldNames, getCountryValueToApply, inputValue, updateFieldValue],
  );

  const requestSuggestions = useCallback(
    async (query: string) => {
      cancelPendingSearch();
      searchAbortRef.current = new AbortController();
      setIsLoading(true);
      setHasFetchedOptions(false);
      setSearchFailed(false);

      try {
        const response = await fetchGooglePlaceSuggestions(
          {
            input: query,
            country: getStringValue(watchedCountryValue),
            languageCode,
            sessionToken: sessionTokenRef.current,
          },
          searchAbortRef.current.signal,
        );

        setCurrentOptions(response.suggestions);
        setHasFetchedOptions(true);
        setSearchFailed(false);
        setIsOpen(true);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Error loading Google place suggestions:", error);
        setCurrentOptions([]);
        setHasFetchedOptions(false);
        setSearchFailed(true);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
        searchAbortRef.current = null;
      }
    },
    [cancelPendingSearch, languageCode, watchedCountryValue],
  );

  const handleInputValueChange = useCallback(
    (nextInputValue: string) => {
      setInputValue(nextInputValue);
      setSelectedValue([]);
      setSearchFailed(false);
      setHasFetchedOptions(false);

      const trimmedInputValue = nextInputValue.trim();

      if (trimmedInputValue.length < MIN_QUERY_LENGTH || disabled) {
        cancelPendingSearch();
        setCurrentOptions([]);
        setIsOpen(false);
        sessionTokenRef.current = createGooglePlacesSessionToken();
        return;
      }

      cancelPendingSearch();
      debounceTimeoutRef.current = window.setTimeout(() => {
        void requestSuggestions(trimmedInputValue);
      }, DONE_TYPING_INTERVAL);
    },
    [cancelPendingSearch, disabled, requestSuggestions],
  );

  const handleSuggestionSelect = useCallback(
    async (prediction: AddressAutocompleteSuggestion) => {
      clearBlurTimeout();
      cancelPendingSearch();
      cancelPendingDetails();
      detailsAbortRef.current = new AbortController();
      setIsLoading(true);

      try {
        const response = await fetchGooglePlaceDetails(
          {
            placeId: prediction.placeId,
            languageCode,
            sessionToken: sessionTokenRef.current,
          },
          detailsAbortRef.current.signal,
        );

        applySelectedAddress(prediction, response.address);
        setIsOpen(false);
        setCurrentOptions([]);
        setHasFetchedOptions(false);
        setSearchFailed(false);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        console.error("Error loading Google place details:", error);
        toaster.create({
          title: t("errors.somethingWentWrong", {
            defaultValue: "Something went wrong",
          }),
          type: "error",
          duration: 3000,
        });
      } finally {
        setIsLoading(false);
        detailsAbortRef.current = null;
        sessionTokenRef.current = createGooglePlacesSessionToken();
      }
    },
    [
      applySelectedAddress,
      cancelPendingDetails,
      cancelPendingSearch,
      clearBlurTimeout,
      languageCode,
      t,
      toaster,
    ],
  );

  return (
    <Controller
      name={fieldData.name}
      control={control}
      render={({ field }) => (
        <Combobox.Root
          allowCustomValue
          closeOnSelect
          collection={collection}
          disabled={disabled}
          inputValue={inputValue ?? ""}
          open={isOpen}
          openOnChange={false}
          openOnClick={false}
          positioning={{ sameWidth: true, strategy: "fixed" }}
          selectionBehavior="preserve"
          value={selectedValue}
          width="100%"
          onInputValueChange={(details: Combobox.InputValueChangeDetails) => {
            if (details.reason !== "input-change") {
              return;
            }

            handleInputValueChange(details.inputValue ?? "");
          }}
          onOpenChange={(details) => {
            if (!details.open) {
              setIsOpen(false);
            }
          }}
          onValueChange={(
            details: Combobox.ValueChangeDetails<AddressAutocompleteSuggestion>,
          ) => {
            const selectedItem = details.items[0];

            if (!selectedItem) {
              return;
            }

            void handleSuggestionSelect(selectedItem);
          }}
        >
          <Combobox.Control>
            <Combobox.Input
              autoComplete={fieldData.autocomplete}
              bg={{ base: "white", _dark: "gray.950" }}
              name={field.name}
              onBlur={() => {
                field.onBlur();
                blurTimeoutRef.current = window.setTimeout(() => {
                  setIsOpen(false);
                  normalizeStreetField();
                }, BLUR_CLOSE_DELAY);
              }}
              onFocus={() => {
                clearBlurTimeout();

                if (
                  inputValue.trim().length >= MIN_QUERY_LENGTH &&
                  !searchFailed &&
                  (isLoading || currentOptions.length > 0 || hasFetchedOptions)
                ) {
                  setIsOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isOpen) {
                  normalizeStreetField();
                }
              }}
              pattern={fieldData.pattern}
              placeholder={fieldData.placeholder}
              ref={field.ref}
              required={fieldData.isRequired}
            />
            <Combobox.IndicatorGroup>
              {isLoading && <Spinner size="xs" />}
              <Combobox.Trigger />
            </Combobox.IndicatorGroup>
          </Combobox.Control>
          <Portal>
            <Combobox.Positioner>
              <Combobox.Content>
                {isLoading ? (
                  <HStack p="2" justifyContent="center">
                    <Spinner size="xs" />
                  </HStack>
                ) : currentOptions.length === 0 && hasFetchedOptions ? (
                  <Combobox.Empty>
                    {t("find.noMatches", { defaultValue: "No results" })}
                  </Combobox.Empty>
                ) : (
                  collection.items.map((item) => (
                    <Combobox.Item key={item.placeId} item={item}>
                      <Box flex="1">
                        <Text fontWeight="medium">{item.mainText}</Text>
                        {item.secondaryText ? (
                          <Text color="fg.muted" fontSize="sm">
                            {item.secondaryText}
                          </Text>
                        ) : null}
                      </Box>
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))
                )}
                <Box
                  borderTopWidth="1px"
                  color="fg.muted"
                  fontSize="xs"
                  px="3"
                  py="2"
                  translate="no"
                >
                  Google Maps
                </Box>
              </Combobox.Content>
            </Combobox.Positioner>
          </Portal>
        </Combobox.Root>
      )}
    />
  );
};
