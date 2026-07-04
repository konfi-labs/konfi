"use client";

import { useAuth } from "@/context/auth";
import { useStoreRuntimeConfig } from "@/context/runtime-config";
import { useT } from "@/i18n/client";
import {
  AspectRatio,
  Box,
  Combobox,
  HStack,
  Portal,
  Skeleton,
  Spinner,
  Text,
  useListCollection,
} from "@chakra-ui/react";
import { SearchSelectOption } from "@konfi/types";
import { DONE_TYPING_INTERVAL, STORE_PRODUCTS } from "@konfi/utils";
import { Route } from "next";
import NextImage from "next/image";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWRImmutable from "swr/immutable";

type StoreSearchOption = SearchSelectOption<{
  channelId: string;
  id: string;
  images: string[];
  name: string;
  slug: string;
}>;

const CHANNEL_HINT_DELIM = "__ch__";

function buildSearchOptionImageUrl(params: {
  cdnUrl?: string;
  fallbackChannelId?: string;
  option: StoreSearchOption;
}) {
  const imageFile = params.option.object.images[0]?.trim();

  if (!imageFile) {
    return undefined;
  }

  if (/^https?:\/\//i.test(imageFile)) {
    return imageFile;
  }

  if (!params.cdnUrl) {
    return undefined;
  }

  const channelId =
    params.option.object.channelId || params.fallbackChannelId || "";

  return `${params.cdnUrl.replace(/\/+$/g, "")}/channels/${channelId}/products/${params.option.object.id}/${imageFile.replaceAll(" ", "%20")}?fit=crop&auto=format,compress&w=96&h=96`;
}

const Search = ({ lng }: { lng: string }) => {
  const { t } = useT();
  const router = useRouter();
  const { appCheckToken } = useAuth();
  const runtimeConfig = useStoreRuntimeConfig();
  const { cdnUrl, channelId } = runtimeConfig;
  const [options, setOptions] = useState<StoreSearchOption[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [selectedValue, setSelectedValue] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialOptionsRef = useRef<StoreSearchOption[]>([]);
  const appCheckRequired = Boolean(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY);
  const appCheckTokenValue = appCheckToken?.token;
  const searchReady =
    Boolean(channelId) && (!appCheckRequired || Boolean(appCheckTokenValue));

  const handleSelectOption = useCallback(
    (value: string | undefined) => {
      if (!value) {
        return;
      }

      router.push(`/${lng}${STORE_PRODUCTS}/${value}` as Route);
    },
    [lng, router],
  );

  const fetchSearchResults = useCallback(
    async (searchTerm: string) => {
      try {
        if (!channelId || (appCheckRequired && !appCheckTokenValue)) {
          console.error("Channel ID or App Check Token is not available");
          return [];
        }

        const headers = new Headers({
          "Content-Type": "application/json",
        });

        if (appCheckTokenValue) {
          headers.set("x-firebase-appcheck", appCheckTokenValue);
        }

        const res = await fetch("/api/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query: searchTerm,
            lng,
            channelId,
          }),
        });

        if (!res.ok) {
          console.warn("Server returned an error status:", res.status);
          return [];
        }

        const results = await res.json();

        if (!Array.isArray(results) || results.length === 0) {
          return [];
        }

        return results.reduce<StoreSearchOption[]>((acc, item) => {
          if (!item || typeof item !== "object") {
            return acc;
          }

          const candidate = item as {
            channelId?: unknown;
            id?: unknown;
            images?: unknown;
            name?: unknown;
            slug?: unknown;
          };

          if (
            typeof candidate.id !== "string" ||
            typeof candidate.name !== "string"
          ) {
            return acc;
          }

          const slugValue =
            typeof candidate.slug === "string" && candidate.slug.length > 0
              ? candidate.slug
              : candidate.id;
          const sourceChannelId =
            typeof candidate.channelId === "string" ? candidate.channelId : "";
          const optionValue =
            sourceChannelId && sourceChannelId !== channelId
              ? `${slugValue}${CHANNEL_HINT_DELIM}${sourceChannelId}`
              : slugValue;

          acc.push({
            label: candidate.name,
            value: optionValue,
            object: {
              channelId: sourceChannelId || channelId || "",
              id: candidate.id,
              images: Array.isArray(candidate.images)
                ? candidate.images.filter(
                    (image): image is string => typeof image === "string",
                  )
                : [],
              name: candidate.name,
              slug: typeof candidate.slug === "string" ? candidate.slug : "",
            },
          });

          return acc;
        }, []);
      } catch (error) {
        console.error("Client search error:", error);
        return [];
      }
    },
    [appCheckRequired, appCheckTokenValue, channelId, lng],
  );

  const scheduleSearch = useCallback(
    (term: string) => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }

      typingTimerRef.current = setTimeout(async () => {
        setIsSearching(true);
        try {
          const values = await fetchSearchResults(term);
          if (values.length > 0) {
            setOptions(values);
          } else if (initialOptionsRef.current.length > 0) {
            setOptions(initialOptionsRef.current);
          } else {
            setOptions([]);
          }
        } finally {
          setIsSearching(false);
          typingTimerRef.current = null;
        }
      }, DONE_TYPING_INTERVAL);
    },
    [fetchSearchResults],
  );

  const { collection, set } = useListCollection<StoreSearchOption>({
    initialItems: options,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
  });

  useEffect(() => {
    set(options);
  }, [options, set]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  const swrKey = searchReady
    ? ["store-search", channelId, lng, appCheckTokenValue ?? "no-app-check"]
    : null;
  const { data, isLoading, isValidating } = useSWRImmutable<
    StoreSearchOption[]
  >(swrKey, () => fetchSearchResults(""));

  useEffect(() => {
    if (!Array.isArray(data)) {
      return;
    }

    setOptions(data);
    initialOptionsRef.current = data;
  }, [data]);

  const isInitialLoading =
    (isLoading || isValidating) && collection.items.length === 0;

  if (!searchReady) {
    return null;
  }

  return (
    <Skeleton loading={isInitialLoading}>
      <Combobox.Root
        collection={collection}
        value={selectedValue}
        inputValue={inputValue}
        onInputValueChange={({ inputValue: nextValue }) => {
          setInputValue(nextValue);
          scheduleSearch(nextValue);
        }}
        onValueChange={({ value }) => {
          setSelectedValue(value);
          const selected = value[0];
          handleSelectOption(selected);
          setSelectedValue([]);
          setInputValue("");
          if (initialOptionsRef.current.length > 0) {
            setOptions(initialOptionsRef.current);
          }
        }}
        selectionBehavior="replace"
        closeOnSelect
        openOnClick
      >
        <Combobox.Control
          borderRadius="full"
          bgColor={{ base: "whiteAlpha.500", _dark: "blackAlpha.500" }}
        >
          <Combobox.Input
            mr={6}
            placeholder={t("store.search.placeholder", {
              defaultValue: "Search for product...",
            })}
          />
          <Combobox.IndicatorGroup>
            {(isInitialLoading || isSearching) && <Spinner size="xs" />}
            <Combobox.ClearTrigger />
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </Combobox.Control>
        <Portal>
          <Combobox.Positioner>
            <Combobox.Content>
              {collection.items.length === 0 ? (
                <Combobox.Empty>
                  <Text
                    fontSize="sm"
                    color={{ base: "gray.600", _dark: "gray.300" }}
                  >
                    {t("store.search.noResults", {
                      defaultValue: "No results found",
                    })}
                  </Text>
                </Combobox.Empty>
              ) : (
                collection.items.map((item) => {
                  const imageUrl = buildSearchOptionImageUrl({
                    cdnUrl,
                    fallbackChannelId: channelId,
                    option: item,
                  });

                  return (
                    <Combobox.Item
                      key={`${item.value}-${item.label}`}
                      item={item}
                    >
                      <HStack justifyContent="space-between" width="full">
                        <HStack gap={3} minW={0}>
                          <AspectRatio
                            ratio={1}
                            w="40px"
                            flexShrink={0}
                            borderRadius="md"
                            overflow="hidden"
                            bg={{ base: "gray.100", _dark: "gray.800" }}
                          >
                            {imageUrl ? (
                              <NextImage
                                src={imageUrl}
                                alt={item.label}
                                fill
                                sizes="40px"
                                style={{ objectFit: "cover" }}
                              />
                            ) : (
                              <Box />
                            )}
                          </AspectRatio>
                          <Text truncate>{item.label}</Text>
                        </HStack>
                        <Combobox.ItemIndicator />
                      </HStack>
                    </Combobox.Item>
                  );
                })
              )}
              {inputValue.trim() ? (
                <Box
                  asChild
                  borderTop="1px solid"
                  borderColor={{
                    base: "blackAlpha.100",
                    _dark: "whiteAlpha.200",
                  }}
                  display="block"
                  px={4}
                  py={3}
                  _hover={{
                    bg: { base: "blackAlpha.50", _dark: "whiteAlpha.100" },
                  }}
                >
                  <NextLink
                    href={
                      `/${lng}/search?q=${encodeURIComponent(
                        inputValue.trim(),
                      )}` as Route
                    }
                    onClick={() => {
                      setSelectedValue([]);
                      setInputValue("");
                      if (initialOptionsRef.current.length > 0) {
                        setOptions(initialOptionsRef.current);
                      }
                    }}
                  >
                    <Text fontSize="sm" fontWeight="medium">
                      {t("store.search.viewAll", {
                        defaultValue: "View all results for {{query}}",
                        query: inputValue.trim(),
                      })}
                    </Text>
                  </NextLink>
                </Box>
              ) : null}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
    </Skeleton>
  );
};

export default Search;
