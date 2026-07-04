"use client";

import {
  Accordion,
  Alert,
  Badge,
  Box,
  GridItem,
  Heading,
  HStack,
  Link,
  Separator,
  Show,
  SimpleGrid,
  Skeleton,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  Attribute,
  Configuration,
  CurrencyCode,
  CurrencySettings,
  IDiscount,
  OrderItem,
  Price,
  PriceTypeEnum,
  type PrintingMethodId,
  Product,
  Promotion,
  Rating,
  SpecOverrides,
  type UnitId,
} from "@konfi/types";
import {
  DEFAULT_COMBINATION,
  getCombination,
  isMatrixLikePriceType,
  resolveCalculatedCombination,
  validateConfiguration,
} from "@konfi/utils";
import { isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { Analytics, logEvent } from "firebase/analytics";
import { User } from "firebase/auth";
import { DocumentData, DocumentReference, Firestore } from "firebase/firestore";
import { i18n, TFunction } from "i18next";
import dynamic from "next/dynamic";
import { ReadonlyURLSearchParams } from "next/navigation";
import {
  Dispatch,
  Fragment,
  ReactNode,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { toaster } from "../../ui";
import {
  AccordionItemContent,
  AccordionItemTrigger,
  AccordionRoot,
} from "../../ui/accordion";
import {
  ClipboardIconButton,
  ClipboardInput,
  ClipboardRoot,
} from "../../ui/clipboard";
import { InputGroup } from "../../ui/input-group";
import { Breadcrumbs } from "../common/Breadcrumbs";
import { Preview } from "../form";
import { Image } from "../Image";
import { MaterialSymbol } from "../MaterialSymbol";

const AverageRating = dynamic(
  () => import("./AverageRating").then((mod) => mod.AverageRating),
  {
    loading: () => <Skeleton w={"120px"} h={"32px"} borderRadius={"full"} />,
    ssr: false,
  },
);

const CustomFormatInput = dynamic(
  () => import("./CustomFormatInput").then((mod) => mod.CustomFormatInput),
  {
    loading: () => <Skeleton w={"100%"} h={"120px"} borderRadius={"3xl"} />,
    ssr: false,
  },
);

const CustomSizes = dynamic(
  () => import("./CustomSizes").then((mod) => mod.CustomSizes),
  {
    loading: () => <Skeleton w={"100%"} h={"60px"} borderRadius={"3xl"} />,
    ssr: false,
  },
);

const DeliveryInfo = dynamic(() =>
  import("./DeliveryInfo").then((mod) => mod.DeliveryInfo),
);

const DesignSpec = dynamic(() =>
  import("./DesignSpec").then((mod) => mod.DesignSpec),
);

const Options = dynamic(() => import("./Options").then((mod) => mod.Options), {
  loading: () => <Skeleton w={"100%"} h={"100%"} borderRadius={"3xl"} />,
  ssr: false,
});

const Promotions = dynamic(
  () => import("./Promotions").then((mod) => mod.Promotions),
  {
    loading: () => <Skeleton w={"100%"} h={"80px"} borderRadius={"3xl"} />,
    ssr: false,
  },
);

const Quantity = dynamic(
  () => import("./Quantity").then((mod) => mod.Quantity),
  {
    loading: () => <Skeleton w={"100%"} h={"100%"} borderRadius={"3xl"} />,
    ssr: false,
  },
);

const RatingsList = dynamic(
  () => import("./RatingsList").then((mod) => mod.RatingsList),
  {
    ssr: false,
  },
);

const Summary = dynamic(() => import("./Summary").then((mod) => mod.Summary), {
  loading: () => <Skeleton w={"100%"} h={"100%"} borderRadius={"3xl"} />,
  ssr: false,
});

const CONFIGURATION_QUERY_PARAM_KEYS = [
  "pageCount",
  "volume",
  "width",
  "height",
];

function buildSyncedConfigurationQueryString({
  attributeIds,
  configuration,
  searchParams,
}: {
  attributeIds: string[];
  configuration: Configuration;
  searchParams: ReadonlyURLSearchParams;
}) {
  const params = new URLSearchParams(searchParams.toString());

  for (const attributeId of attributeIds) {
    params.delete(attributeId);
  }

  for (const key of CONFIGURATION_QUERY_PARAM_KEYS) {
    params.delete(key);
  }

  if (configuration.selectedAttributeOptions) {
    Object.entries(configuration.selectedAttributeOptions).forEach(
      ([attributeId, value]) => {
        if (attributeId === "volume") {
          return;
        }

        params.set(attributeId, `${value}`);
      },
    );
  }

  if (
    typeof configuration.volume === "number" &&
    Number.isFinite(configuration.volume)
  ) {
    params.set("volume", `${configuration.volume}`);
  }

  if (
    typeof configuration.pageCount === "number" &&
    Number.isFinite(configuration.pageCount)
  ) {
    params.set("pageCount", `${configuration.pageCount}`);
  }

  if (configuration.customFormat) {
    if (
      typeof configuration.width === "number" &&
      Number.isFinite(configuration.width)
    ) {
      params.set("width", `${configuration.width}`);
    }

    if (
      typeof configuration.height === "number" &&
      Number.isFinite(configuration.height)
    ) {
      params.set("height", `${configuration.height}`);
    }
  }

  return params.toString();
}

export interface CombinationProps {
  router: any;
  pathname: string;
  params: { id: string };
  searchParams: ReadonlyURLSearchParams;
  product: Product;
  resolvedPrices?: Product["prices"];
  syncQueryParams?: boolean;
  attributes: Attribute[];
  description?: any;
  templates?: { name: string; url: string; attributeOptions?: string[] }[];
  analytics?: Analytics;
  channelId?: string;
  firestore: Firestore;
  db?: any;
  getDoc?: <T>(
    docRef: DocumentReference<T, DocumentData>,
  ) => Promise<T | undefined>;
  download?: (url?: string, preview?: boolean) => Promise<void>;
  add?: (orderItem: OrderItem, user?: User) => Promise<string | undefined>;
  user?: User | null;
  loginAsGuest?: (
    addToCart: (_user: User, newItem?: boolean) => Promise<boolean | string>,
  ) => Promise<void>;
  selectMenuStyles?: any;
  productId?: string;
  saveConfiguration?: (
    configuration: Configuration,
    totalPrice?: number,
    printingMethod?: PrintingMethodId,
    newItem?: boolean,
    prices?: Price[],
    expressPercent?: number,
  ) => void;
  saveConfigurationIcon?: string;
  saveConfigurationLabel?: string;
  saveAsNewLabel?: string;
  initConfiguration?: Configuration;
  inputs?: ReactNode[];
  registerAddToCartAction?: (
    action: (() => Promise<boolean | string>) | null,
  ) => void;
  discount?: IDiscount;
  unit?: UnitId;
  customPrice?: number | null;
  ratings?: Rating[];
  ratingsCount?: number;
  promotions?: Promotion[];
  descriptionPreview?: ReactNode;
  customerDiscount?: number;
  displayCurrency?: CurrencyCode | null;
  currencySettings?: CurrencySettings | null;
  setChangedConfiguration?: Dispatch<SetStateAction<Configuration | undefined>>;
  storeSettings?: { express?: { enabled: boolean; percent: number } };
  expressPercent?: number;
  /** Boolean configuration: when enabled (typically in admin-only contexts), allows out-of-spec values with warning confirmation. */
  allowOutOfSpec?: boolean;
  allowSaveAsNew?: boolean;
  onOverrideWarning?: (payload: {
    key: keyof SpecOverrides;
    value: number;
    min?: number;
    max?: number;
    step?: number;
  }) => Promise<void>;
  t: TFunction;
  i18n: i18n;
}

export function Combination({
  router,
  pathname,
  params,
  searchParams,
  product,
  resolvedPrices,
  syncQueryParams = true,
  attributes,
  description,
  templates,
  analytics,
  channelId,
  firestore,
  db,
  getDoc,
  download,
  add,
  user,
  loginAsGuest,
  selectMenuStyles,
  productId,
  saveConfiguration,
  saveConfigurationIcon,
  saveConfigurationLabel,
  saveAsNewLabel,
  initConfiguration,
  inputs,
  registerAddToCartAction,
  discount,
  unit,
  customPrice,
  ratings,
  ratingsCount,
  promotions,
  descriptionPreview,
  customerDiscount,
  displayCurrency,
  currencySettings,
  setChangedConfiguration,
  storeSettings,
  expressPercent,
  allowOutOfSpec,
  allowSaveAsNew = true,
  onOverrideWarning,
  t,
  i18n,
}: CombinationProps) {
  const _initConfiguration: Configuration = initConfiguration
    ? initConfiguration
    : {
        productId: "",
        combination: null,
        calculatedCombination: DEFAULT_COMBINATION,
        descriptionCombination: null,
        selectedAttributeOptions: null,
        quantity: 1,
        volume: undefined,
        customFormat: false,
        width: 0,
        height: 0,
        pageCount: product.pageCount?.enabled
          ? (() => {
              const raw = searchParams?.get("pageCount");
              if (raw) {
                const parsed = Number(raw);
                return Number.isFinite(parsed)
                  ? parsed
                  : product.pageCount!.minimum;
              }
              return product.pageCount!.minimum;
            })()
          : undefined,
        customSizes: [],
      };
  const id = productId ? productId : params?.id;
  const assetProductId = productId ?? product.id;

  const [configuration, updateConfiguration] = useReducer(
    (prev: Configuration, next: Partial<Configuration>) => {
      try {
        return validateConfiguration(
          prev,
          next,
          product,
          attributes,
          searchParams,
          { allowOutOfSpec },
        );
      } catch (error) {
        console.error("Error updating configuration:", error);
        toaster.error({
          title: "Błąd konfiguracji",
          description:
            "Wystąpił błąd podczas aktualizacji konfiguracji produktu. Proszę spróbować ponownie.",
        });
        return prev; // Return previous configuration on error
      }
    },
    { ..._initConfiguration },
  );
  useEffect(() => {
    if (setChangedConfiguration) setChangedConfiguration(configuration);
  }, [configuration, setChangedConfiguration]);
  const format = useMemo(() => {
    const formatAttribute = attributes.find(
      (attribute) => attribute.format === true,
    );
    if (isUndefined(formatAttribute)) return [];
    const selectedOption =
      configuration.selectedAttributeOptions?.[formatAttribute.id];
    if (isUndefined(selectedOption)) return [];
    const width = formatAttribute.options.find(
      (option) => option.value === selectedOption,
    )?.formatWidth;
    const height = formatAttribute.options.find(
      (option) => option.value === selectedOption,
    )?.formatHeight;
    if (isUndefined(width) || isUndefined(height)) return [];
    return [width, height];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributes, product, configuration]);
  const filteredTemplates = useMemo(() => {
    if (isUndefined(templates) || isEmpty(templates)) return [];
    if (!isMatrixLikePriceType(product.priceType)) {
      return templates;
    }
    const options = Object.values(configuration.selectedAttributeOptions ?? {});

    return templates.filter((template) => {
      for (const option of options) {
        if (
          (template.attributeOptions &&
            template.attributeOptions.includes(`${option}`)) ||
          isEmpty(template.attributeOptions)
        ) {
          return true;
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributes, product, configuration]);

  const [index, setIndex] = useState<number>(0);
  const [mainImage, setMainImage] = useState(product.spec.images[index]);
  const [isInitialized, setIsInitialized] = useState(false);
  // Initialize express mode based on expressPercent prop (from admin) or false for customers
  const [expressMode, setExpressMode] = useState<boolean>(() => {
    return !!(expressPercent && expressPercent > 0);
  });

  const showSummary = useMemo(() => {
    if (isMatrixLikePriceType(product.priceType)) {
      return configuration.volume ? true : false;
    } else {
      return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuration]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const stickyBoxRef = useRef<HTMLDivElement>(null);
  const [isSummaryStuck, setIsSummaryStuck] = useState(false);
  const stuckRef = useRef(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    let unstickTimeout: ReturnType<typeof setTimeout>;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const shouldBeStuck = !entry.isIntersecting;
        if (shouldBeStuck && !stuckRef.current) {
          clearTimeout(unstickTimeout);
          stuckRef.current = true;
          // Capture expanded height before collapsing to prevent layout shift
          if (stickyBoxRef.current) {
            stickyBoxRef.current.style.minHeight = `${stickyBoxRef.current.offsetHeight}px`;
          }
          setIsSummaryStuck(true);
        } else if (!shouldBeStuck && stuckRef.current) {
          // Debounce unstick to prevent oscillation from layout shift
          clearTimeout(unstickTimeout);
          unstickTimeout = setTimeout(() => {
            stuckRef.current = false;
            setIsSummaryStuck(false);
            if (stickyBoxRef.current) {
              stickyBoxRef.current.style.minHeight = "";
            }
          }, 200);
        }
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
      clearTimeout(unstickTimeout);
    };
  }, [showSummary]);

  const showQuantity = useMemo(() => {
    if (isMatrixLikePriceType(product.priceType)) {
      return configuration.volume ? true : false;
    } else {
      return true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configuration]);

  const switchCardIndex = (i: number) => {
    if (isEmpty(product.spec.images)) return;
    setMainImage(product.spec.images[i]);
    setIndex(i);
  };

  useEffect(() => {
    switchCardIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!promotions || customerDiscount) return;
    for (const promotion of promotions) {
      if (analytics) {
        logEvent(analytics, "view_promotion", {
          promotion_name: promotion.campaign?.name,
          promotion_id: promotion.id,
          items: [
            {
              item_id: product.id,
              item_name: product.name,
              coupon: promotion.code,
              item_category: product.category.name,
              item_variant: configuration.descriptionCombination ?? undefined,
            },
          ],
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, promotions, configuration]);
  useEffect(() => {
    if (isUndefined(router) || !router) return;
    updateConfiguration({ ..._initConfiguration });
    setIsInitialized(false);
  }, [id, product]);

  // Initialize query params
  useEffect(() => {
    if (!syncQueryParams) return;
    if (isUndefined(router) || !router) return;

    if (typeof window !== "undefined") {
      const queryString = buildSyncedConfigurationQueryString({
        attributeIds: product.attributes ?? [],
        configuration,
        searchParams,
      });
      const nextUrl = `${pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

      if (currentUrl === nextUrl) {
        return;
      }

      window.history.replaceState(null, "", nextUrl);
    }
  }, [
    syncQueryParams,
    router,
    pathname,
    product.attributes,
    searchParams,
    configuration.selectedAttributeOptions,
    configuration.volume,
    configuration.pageCount,
    configuration.customFormat,
    configuration.width,
    configuration.height,
  ]);
  // Initialize width and height only once per product
  useEffect(() => {
    const newWidth = _initConfiguration.width ?? product.spec.minimumWidth ?? 0;
    const newHeight =
      _initConfiguration.height ?? product.spec.minimumHeight ?? 0;

    if (
      configuration.width !== newWidth ||
      configuration.height !== newHeight
    ) {
      updateConfiguration({
        ..._initConfiguration,
        width: newWidth,
        height: newHeight,
      });
    }
  }, [product.spec.minimumWidth, product.spec.minimumHeight]);
  // Initialize configuration once per product
  useEffect(() => {
    if (isUndefined(router) || !router) return;
    if (isNull(product)) return;
    if (!isMatrixLikePriceType(product.priceType)) return;
    if (isNull(attributes) || isUndefined(attributes)) return;
    if (isInitialized) return; // Prevent re-initialization
    if (!isNull(configuration.selectedAttributeOptions)) return;

    updateConfiguration({ selectedAttributeOptions: null });
    const [
      _combination,
      _calculatedCombination,
      _descriptionCombination,
      _attributeOptions,
    ] = getCombination(
      attributes,
      [],
      searchParams,
      product.attributeDependencies,
      true,
    );
    const resolvedCalculatedCombination = resolveCalculatedCombination({
      combination: _combination,
      calculatedCombination: _calculatedCombination,
      priceType: product.priceType,
    });
    const volume = searchParams?.get("volume");
    const candidateVolume = volume
      ? Number(volume)
      : (product.spec.defaultOrder ?? product.volumes[0].value);

    // When resolvedPrices are available, verify the candidate volume has a
    // usable price for the computed combination. If not (e.g. the first
    // volume has a null/inactive price), promote to the first volume that
    // does have a valid price so Price.tsx never sees an unusable volume on
    // its very first render.
    const pricesToCheck = resolvedPrices ?? product.prices;
    let initVolume = candidateVolume;
    if (pricesToCheck && pricesToCheck.length > 0) {
      const hasUsablePrice = (vol: number): boolean =>
        pricesToCheck.some(
          (p) =>
            p.combination?.id === resolvedCalculatedCombination &&
            p.volume?.value === vol &&
            p.combination?.active !== false &&
            typeof p.value === "number" &&
            Number.isFinite(p.value) &&
            p.value >= 0,
        );

      if (!hasUsablePrice(candidateVolume)) {
        const firstUsable = product.volumes.find((v) =>
          hasUsablePrice(v.value),
        );
        if (firstUsable) {
          initVolume = firstUsable.value;
        }
      }
    }
    _attributeOptions["volume"] = initVolume;
    if (!_attributeOptions)
      return console.error(
        "Inicjalizacja opcji atrybutów zakończona niepowodzeniem",
      );
    if (
      product.priceType !== PriceTypeEnum.DYNAMIC &&
      (!_combination || !resolvedCalculatedCombination)
    )
      return console.error(
        "Inicjalizacja kombinacji zakończona niepowodzeniem",
      );
    const _width = searchParams?.get("width")
      ? Number(searchParams.get("width"))
      : (product.spec.minimumWidth ?? 0);
    const _height = searchParams?.get("height")
      ? Number(searchParams.get("height"))
      : (product.spec.minimumHeight ?? 0);
    updateConfiguration({
      combination: _combination || null,
      calculatedCombination: resolvedCalculatedCombination,
      descriptionCombination: _descriptionCombination || null,
      selectedAttributeOptions: _attributeOptions,
      volume: initVolume,
      width: _width,
      height: _height,
      pageCount: _initConfiguration.pageCount,
    });
    setIsInitialized(true);
  }, [
    router,
    product,
    attributes,
    searchParams,
    isInitialized,
    configuration.selectedAttributeOptions,
    resolvedPrices,
  ]);
  // Initialize customFormat
  useEffect(() => {
    let _customFormat = false;
    if (
      product.priceType === PriceTypeEnum.SINGLE ||
      product.priceType === PriceTypeEnum.THRESHOLD
    ) {
      if (product.customSize) _customFormat = true;
      if (
        configuration.width &&
        configuration.width > 0 &&
        configuration.height &&
        configuration.height > 0
      )
        _customFormat = true;
      else _customFormat = false;
    } else if (isMatrixLikePriceType(product.priceType)) {
      if (isUndefined(configuration.selectedAttributeOptions)) return;
      if (isNull(configuration.selectedAttributeOptions)) return;
      const formatAttribute = attributes.find(
        (attribute) => attribute.format === true,
      );
      _customFormat =
        (formatAttribute?.options.find(
          (option) =>
            option.value ===
            configuration.selectedAttributeOptions?.[formatAttribute.id],
        )?.customFormat ?? product.customSize)
          ? true
          : false;
    }

    // Only update if the value actually changed
    if (configuration.customFormat !== _customFormat) {
      updateConfiguration({ customFormat: _customFormat });
    }
  }, [
    product,
    configuration.height,
    configuration.width,
    configuration.selectedAttributeOptions,
    configuration.customFormat,
    attributes,
  ]);

  if (
    isNull(product) ||
    (isMatrixLikePriceType(product.priceType) && isNull(attributes))
  )
    return null;

  return (
    <SimpleGrid columns={[1, 1, 2]} w={"100%"} gap={"8"}>
      <Box pr={["", "6"]}>
        <Box
          borderRadius={"3xl"}
          position={["relative", "sticky"]}
          top={["0", "32"]}
          w={"100%"}
        >
          {add && (
            <Breadcrumbs title={product.name} pathname={pathname} t={t} />
          )}
          <HStack justify={"space-between"} mb={"8"}>
            <Heading size={"4xl"} color={"primary.solid"}>
              {product.name}
            </Heading>
            <Show when={ratingsCount && product.averageRating}>
              <AverageRating
                averageRating={product.averageRating || 0}
                ratingsCount={ratingsCount || 0}
                t={t}
              />
            </Show>
          </HStack>
          <SimpleGrid columns={[4]} gap={4}>
            <GridItem colSpan={4}>
              <Image
                position={"relative"}
                borderRadius={["2xl", "3xl"]}
                minH={["270px", "270px", "270px", "570px"]}
                src={`https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${product.channelId || channelId}/products/${assetProductId}/${mainImage}?fit=crop&auto=format,compress`}
                width={600}
                height={600}
                ratio={1}
                sizes="(max-width: 768px) 100vw, 50vw"
                alt={product.name}
                preload
              >
                {product.category.name && (
                  <Badge
                    position={"absolute"}
                    variant={"outline"}
                    left={"4"}
                    top={"4"}
                    fontSize={["xs", "10px"]}
                    bgColor={"white"}
                    color={"black"}
                    data-nosnippet
                  >
                    {product.category.name}
                  </Badge>
                )}
              </Image>
              <Separator my={8} />
              {!isEmpty(product.spec.images) && (
                <HStack gap={2} justify={"center"} borderRadius={"3xl"}>
                  {product.spec.images.map((image, i) => (
                    <Box
                      key={i}
                      shadow={
                        i === index ? "0 0 0 3px rgba(0, 102, 255, .3)" : "none"
                      }
                      onClick={() => switchCardIndex(i)}
                      borderRadius={"3xl"}
                      transition={"all 0.6s ease-in-out"}
                      cursor={"pointer"}
                      opacity={i === index ? 1 : 0.5}
                      scale={i === index ? 1 : 0.98}
                      _hover={{
                        opacity: i === index ? 1 : 0.8,
                        scale: 1,
                        transform:
                          i === index ? "translateY(0)" : "translateY(-2px)",
                      }}
                    >
                      <Image
                        minW={"100px"}
                        minH={"100px"}
                        maxH={"100px"}
                        border={"1px solid"}
                        borderColor={{
                          base: "whiteAlpha.500",
                          _dark: "whiteAlpha.200",
                        }}
                        borderRadius={"3xl"}
                        w={"100%"}
                        priority={false}
                        ratio={1}
                        width={160}
                        height={160}
                        src={`https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${product.channelId || channelId}/products/${assetProductId}/${image}?fit=crop&auto=format,compress`}
                        alt={product.name + " " + (i + 1)}
                      />
                    </Box>
                  ))}
                </HStack>
              )}
            </GridItem>
          </SimpleGrid>
        </Box>
      </Box>
      <VStack
        align={"start"}
        pl={[0, 6]}
        py={"4"}
        borderRadius={"3xl"}
        data-nosnippet
      >
        <HStack w={"100%"} justify={"space-between"} mb={"3"}>
          <Heading fontSize={"3xl"}>
            {t("combination.configuration", { defaultValue: "Configuration" })}
          </Heading>
          <ClipboardRoot
            maxW="250px"
            value={typeof window !== "undefined" ? window.location.href : ""}
          >
            <InputGroup
              width="full"
              endElement={
                <ClipboardIconButton colorPalette={"primary"} me="-2" />
              }
            >
              <ClipboardInput />
            </InputGroup>
          </ClipboardRoot>
        </HStack>
        <Separator />
        <Options
          attributes={attributes}
          configuration={configuration}
          updateConfiguration={updateConfiguration}
          searchParams={searchParams}
          attributeDependencies={product.attributeDependencies}
          product={product}
          t={t}
          i18n={i18n}
        />
        {configuration.customFormat && (
          <>
            {!isEmpty(product.customSizes) && product.customSizes && (
              <CustomSizes
                updateConfiguration={updateConfiguration}
                customSizes={product.customSizes}
                width={configuration.width}
                height={configuration.height}
                t={t}
                i18n={i18n}
              />
            )}
            <CustomFormatInput
              updateConfiguration={updateConfiguration}
              width={configuration.width}
              height={configuration.height}
              customSizes={configuration.customSizes}
              product={product}
              baseSpec={product.spec}
              configuration={configuration}
              volume={configuration.volume}
              quantity={configuration.quantity}
              isStore={isUndefined(saveConfiguration)}
              allowOutOfSpec={allowOutOfSpec}
              onOverrideWarning={onOverrideWarning}
              t={t}
            />
          </>
        )}
        <Skeleton w={"100%"} borderRadius={"3xl"} loading={!showQuantity}>
          {storeSettings?.express?.enabled && (
            <Box w={"100%"} py={2}>
              <Text fontSize="xl" fontWeight="600" mb={2}>
                {t("forms.labels.processingType", {
                  defaultValue: "Processing Type",
                })}
              </Text>
              <Tabs.Root
                value={expressMode ? "express" : "standard"}
                onValueChange={(details) =>
                  setExpressMode(details.value === "express")
                }
              >
                <Tabs.List w="100%">
                  <Tabs.Trigger value="standard" w="100%">
                    <MaterialSymbol>local_shipping</MaterialSymbol>
                    {t("forms.labels.standard", { defaultValue: "Standard" })}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="express" w="100%">
                    <MaterialSymbol>delivery_truck_speed</MaterialSymbol>
                    {t("forms.labels.express", { defaultValue: "Express" })}
                  </Tabs.Trigger>
                  <Tabs.Indicator />
                </Tabs.List>
              </Tabs.Root>
            </Box>
          )}
          <Quantity
            updateConfiguration={updateConfiguration}
            product={product}
            baseSpec={product.spec}
            resolvedPrices={resolvedPrices}
            channelId={channelId}
            firestore={firestore}
            db={db}
            getDoc={getDoc}
            volume={configuration.volume}
            quantity={configuration.quantity}
            calculatedCombination={configuration.calculatedCombination}
            combination={configuration.combination}
            selectedAttributeOptions={configuration.selectedAttributeOptions}
            width={configuration.width}
            height={configuration.height}
            pageCount={configuration.pageCount}
            customFormat={configuration.customFormat}
            discount={discount}
            unit={unit}
            customPrice={customPrice}
            customerDiscount={customerDiscount}
            displayCurrency={displayCurrency}
            currencySettings={currencySettings}
            expressPercent={
              expressMode
                ? expressPercent || storeSettings?.express?.percent
                : undefined
            }
            allowOutOfSpec={allowOutOfSpec}
            onOverrideWarning={onOverrideWarning}
            t={t}
            i18n={i18n}
          />
        </Skeleton>
        {inputs &&
          inputs.map((input, i) => <Fragment key={i}>{input}</Fragment>)}
        <Separator />
        {!customerDiscount && promotions && !isEmpty(promotions) && (
          <Promotions promotions={promotions} t={t} />
        )}
        {showSummary && (
          <Box
            ref={stickyBoxRef}
            w={"100%"}
            position={"sticky"}
            bottom={{ base: 28, md: 0 }}
            zIndex={10}
            display={"flex"}
            flexDirection={"column"}
            justifyContent={"flex-end"}
            pointerEvents={"none"}
          >
            <Box
              bg={{ _light: "white/70", _dark: "blackAlpha" }}
              backdropFilter={"saturate(125%) blur(10px)"}
              pt={2}
              pb={4}
              pointerEvents={"auto"}
            >
              <Summary
                product={product}
                configuration={configuration}
                resolvedPrices={resolvedPrices}
                add={add}
                user={user}
                loginAsGuest={loginAsGuest}
                analytics={analytics}
                channelId={channelId}
                firestore={firestore}
                db={db}
                getDoc={getDoc}
                saveConfiguration={saveConfiguration}
                saveConfigurationIcon={saveConfigurationIcon}
                saveConfigurationLabel={saveConfigurationLabel}
                saveAsNewLabel={saveAsNewLabel}
                discount={discount}
                unit={unit}
                customPrice={customPrice}
                displayCurrency={displayCurrency}
                currencySettings={currencySettings}
                promotions={promotions}
                customerDiscount={customerDiscount}
                attributes={attributes}
                expressMode={expressMode}
                expressPercent={
                  expressMode
                    ? expressPercent || storeSettings?.express?.percent
                    : undefined
                }
                allowOutOfSpec={allowOutOfSpec}
                allowSaveAsNew={allowSaveAsNew}
                registerAddToCartAction={registerAddToCartAction}
                t={t}
                i18n={i18n}
                isStuck={isSummaryStuck}
              />
            </Box>
          </Box>
        )}
        <Box ref={sentinelRef} h={"1px"} />
      </VStack>
      <Tabs.Root
        defaultValue={"description"}
        mt={"8"}
        pr={["", "6"]}
        data-nosnippet
      >
        <Tabs.List>
          <Tabs.Trigger value={"description"}>
            {t("combination.tabs.description", { defaultValue: "Description" })}
          </Tabs.Trigger>
          <Tabs.Trigger value={"ratings"} disabled={isEmpty(ratings)}>
            {t("combination.tabs.reviews", { defaultValue: "Reviews" })}
          </Tabs.Trigger>
          <Tabs.Trigger value={"faq"}>
            {t("combination.tabs.faq", { defaultValue: "FAQ" })}
          </Tabs.Trigger>
          <Tabs.Indicator />
        </Tabs.List>
        <Tabs.Content value={"description"} px={2} py={6} data-nosnippet>
          {description && <Preview source={description} />}
          {descriptionPreview && descriptionPreview}
        </Tabs.Content>
        <Tabs.Content value={"ratings"} px={2} py={6} data-nosnippet>
          {ratings && !isEmpty(ratings) && <RatingsList ratings={ratings} />}
        </Tabs.Content>
        <Tabs.Content value={"faq"} px={2} py={6}>
          <AccordionRoot collapsible>
            {[
              {
                key: "fileRequirements",
                defaultQ: "What file formats do you accept?",
                defaultA:
                  "We accept PDF, PNG, JPEG, and TIFF files. For best results, supply vector-based PDFs with fonts outlined and 3 mm bleed.",
              },
              {
                key: "turnaround",
                defaultQ: "How long does production take?",
                defaultA:
                  "Standard turnaround is 3–5 business days from file approval. Estimated delivery dates are displayed next to each quantity option in the quantity selector and in the cart, so you can pick the timeline that suits you. Express options are available at checkout for faster delivery.",
              },
              {
                key: "shipping",
                defaultQ: "How does shipping work?",
                defaultA:
                  "We ship via tracked courier across Poland and the EU. Shipping cost is calculated at checkout based on order weight and destination.",
              },
              {
                key: "minimumOrder",
                defaultQ: "Is there a minimum order quantity?",
                defaultA:
                  "Minimum quantities vary by product. Check the quantity selector on the product page for the lowest available amount.",
              },
              {
                key: "customSize",
                defaultQ: "Can I order a custom size?",
                defaultA:
                  "Yes — many products support custom dimensions. Enable the custom format option in the configurator to enter your own width and height.",
              },
            ].map((item) => (
              <Accordion.Item key={item.key} value={item.key}>
                <AccordionItemTrigger>
                  {t(`combination.faq.${item.key}.question`, {
                    defaultValue: item.defaultQ,
                  })}
                </AccordionItemTrigger>
                <AccordionItemContent>
                  {t(`combination.faq.${item.key}.answer`, {
                    defaultValue: item.defaultA,
                  })}
                </AccordionItemContent>
              </Accordion.Item>
            ))}
          </AccordionRoot>
          <Box mt={4}>
            <Link
              href={"/help/faq"}
              color={"primaryAccent.500"}
              fontSize={"sm"}
            >
              {t("combination.faq.viewAll", {
                defaultValue: "View all frequently asked questions",
              })}
            </Link>
          </Box>
        </Tabs.Content>
      </Tabs.Root>
      <Box data-nosnippet>
        {product.specialNotes && (
          <Alert.Root borderRadius="3xl">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {t("combination.specialNotes", { defaultValue: "Information" })}
              </Alert.Title>
              <Alert.Description>{product.specialNotes}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <DesignSpec
          product={product}
          configuration={configuration}
          format={format}
          download={download}
          templates={filteredTemplates}
          t={t}
        />
        <DeliveryInfo shipping={product.shipping} t={t} />
      </Box>
    </SimpleGrid>
  );
}
