import { getT } from "@/i18n/index";
import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { searchLocalizedStorefrontProducts } from "@/lib/search/localized-storefront-search.server";
import { buildAlternates, buildCanonicalUrl, buildOpenGraph } from "@/lib/seo";
import type { StoreRuntimeConfig } from "@/lib/runtime-config";
import {
  AspectRatio,
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { STORE_PRODUCTS } from "@konfi/utils";
import type { Metadata, Route } from "next";
import NextImage from "next/image";
import NextLink from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

const CHANNEL_HINT_DELIM = "__ch__";
const SEARCH_RESULT_LIMIT = 36;

type Params = Promise<{ lng: string }>;
type SearchParams = Promise<{
  q?: string | string[];
}>;

function readSearchQuery(searchParams: Awaited<SearchParams>): string {
  const raw = Array.isArray(searchParams.q)
    ? searchParams.q[0]
    : searchParams.q;

  return raw?.trim() ?? "";
}

function buildResultHref(params: {
  lng: string;
  result: {
    channelId: string;
    slug: string;
  };
  runtimeConfig: StoreRuntimeConfig;
}): Route {
  const slug =
    params.result.channelId &&
    params.result.channelId !== params.runtimeConfig.channelId
      ? `${params.result.slug}${CHANNEL_HINT_DELIM}${params.result.channelId}`
      : params.result.slug;

  return `/${params.lng}${STORE_PRODUCTS}/${slug}` as Route;
}

function buildResultImageUrl(params: {
  id: string;
  imageFile?: string;
  resultChannelId: string;
  runtimeConfig: StoreRuntimeConfig;
}): string | undefined {
  const imageFile = params.imageFile?.trim();

  if (!imageFile) {
    return undefined;
  }

  if (/^https?:\/\//i.test(imageFile)) {
    return imageFile;
  }

  if (!params.runtimeConfig.cdnUrl) {
    return undefined;
  }

  return `${params.runtimeConfig.cdnUrl.replace(/\/+$/g, "")}/channels/${params.resultChannelId}/products/${params.id}/${imageFile.replaceAll(" ", "%20")}?fit=crop&auto=format,compress&w=640&h=480`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ lng }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const [runtimeConfig, { t }] = await Promise.all([
    getStoreRuntimeConfigForRequest(),
    getT(),
  ]);
  const query = readSearchQuery(resolvedSearchParams);
  const title = query
    ? t("store.searchPage.metadataTitleWithQuery", {
        defaultValue: "Search results for {{query}}",
        query,
      })
    : t("store.searchPage.metadataTitle", {
        defaultValue: "Search",
      });
  const description = t("store.searchPage.metadataDescription", {
    defaultValue: "Find products available in this store.",
  });

  if (!runtimeConfig) {
    return {
      robots: {
        follow: false,
        index: false,
      },
      title,
    };
  }

  const canonicalUrl = buildCanonicalUrl({
    baseUrl: runtimeConfig.storeBaseUrl,
    pathname: `/${lng}/search`,
    searchParams: resolvedSearchParams,
  });

  return {
    title,
    description,
    alternates: buildAlternates({
      baseUrl: runtimeConfig.storeBaseUrl,
      pathname: `/${lng}/search`,
      searchParams: resolvedSearchParams,
    }),
    openGraph: buildOpenGraph({
      description,
      siteName: process.env.NEXT_PUBLIC_STORE_NAME ?? "Konfi",
      title,
      url: canonicalUrl,
    }),
    robots: {
      follow: false,
      index: false,
    },
    twitter: {
      card: "summary_large_image",
      description,
      title,
    },
  };
}

export default function SearchPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={null}>
      <SearchPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function SearchPageContent({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ lng }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const query = readSearchQuery(resolvedSearchParams);
  const [runtimeConfig, { t }] = await Promise.all([
    getStoreRuntimeConfigForRequest(),
    getT(),
  ]);

  if (!runtimeConfig) {
    notFound();
  }

  const results = query
    ? ((await searchLocalizedStorefrontProducts({
        channelId: runtimeConfig.channelId,
        limit: SEARCH_RESULT_LIMIT,
        lng,
        query,
      })) ?? [])
    : [];

  const resultCountLabel = t("store.searchPage.resultCount", {
    count: results.length,
    defaultValue: "{{count}} products found",
  });

  return (
    <Stack gap={8}>
      <Stack gap={3}>
        <Heading size={{ base: "2xl", md: "3xl" }}>
          {query
            ? t("store.searchPage.titleWithQuery", {
                defaultValue: "Search results for {{query}}",
                query,
              })
            : t("store.searchPage.title", {
                defaultValue: "Search",
              })}
        </Heading>
        <Box asChild maxW="3xl">
          <form action={`/${lng}/search`} method="get">
            <HStack gap={3} align="stretch">
              <Input
                name="q"
                defaultValue={query}
                placeholder={t("store.search.placeholder", {
                  defaultValue: "Search for product...",
                })}
              />
              <Button type="submit" colorPalette="primary" variant="solid">
                {t("store.searchPage.submit", {
                  defaultValue: "Search",
                })}
              </Button>
            </HStack>
          </form>
        </Box>
        {query ? (
          <Text color={{ base: "gray.600", _dark: "gray.300" }}>
            {resultCountLabel}
          </Text>
        ) : null}
      </Stack>

      {!query ? (
        <SearchEmptyState
          description={t("store.searchPage.emptyQueryDescription", {
            defaultValue: "Search by product name, category, or print format.",
          })}
          title={t("store.searchPage.emptyQueryTitle", {
            defaultValue: "Find print products",
          })}
        />
      ) : results.length === 0 ? (
        <SearchEmptyState
          description={t("store.searchPage.noResultsDescription", {
            defaultValue:
              "Try a different phrase or browse product categories.",
          })}
          title={t("store.searchPage.noResultsTitle", {
            defaultValue: "No products found",
          })}
        />
      ) : (
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 4 }} gap={4}>
          {results.map((result, index) => {
            const imageUrl = buildResultImageUrl({
              id: result.id,
              imageFile: result.images[0],
              resultChannelId: result.channelId,
              runtimeConfig,
            });

            return (
              <Box
                key={`${result.channelId}-${result.id}`}
                asChild
                border="1px solid"
                borderColor={{
                  base: "blackAlpha.100",
                  _dark: "whiteAlpha.200",
                }}
                borderRadius="xl"
                overflow="hidden"
                bg={{ base: "white", _dark: "whiteAlpha.50" }}
                transition="border-color 0.15s ease, transform 0.15s ease"
                _hover={{
                  borderColor: "primary.solid",
                  transform: "translateY(-2px)",
                }}
              >
                <NextLink
                  href={buildResultHref({ lng, result, runtimeConfig })}
                >
                  <Stack gap={3}>
                    <AspectRatio ratio={4 / 3} bg="gray.100">
                      {imageUrl ? (
                        <NextImage
                          src={imageUrl}
                          alt={result.name}
                          fill
                          priority={index === 0}
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                          style={{ objectFit: "cover" }}
                        />
                      ) : (
                        <Box bg={{ base: "gray.100", _dark: "gray.800" }} />
                      )}
                    </AspectRatio>
                    <Stack gap={2} p={4} pt={0}>
                      <Heading size="sm">{result.name}</Heading>
                      {result.channelId !== runtimeConfig.channelId ? (
                        <Badge width="fit-content" colorPalette="blue">
                          {t("store.searchPage.linkedChannel", {
                            defaultValue: "Shared product",
                          })}
                        </Badge>
                      ) : null}
                    </Stack>
                  </Stack>
                </NextLink>
              </Box>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}

function SearchEmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Stack
      gap={2}
      border="1px solid"
      borderColor={{ base: "blackAlpha.100", _dark: "whiteAlpha.200" }}
      borderRadius="xl"
      p={8}
      bg={{ base: "whiteAlpha.700", _dark: "whiteAlpha.50" }}
    >
      <Heading size="md">{title}</Heading>
      <Text color={{ base: "gray.600", _dark: "gray.300" }}>{description}</Text>
    </Stack>
  );
}
