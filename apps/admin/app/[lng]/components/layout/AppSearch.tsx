import { getAdminConfigFlags, meilisearchMultiSearch } from "@/actions";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Card,
  CloseButton,
  Dialog,
  HStack,
  Input,
  InputGroup,
  Kbd,
  Portal,
  Presence,
  Skeleton,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Image } from "@konfi/components/shared/Image";
import { LinkOverlay } from "@konfi/components/shared/LinkOverlay";
import { MaterialSymbol } from "@konfi/components/shared/MaterialSymbol";
import { CurrencyEnum, FormattedOrderItem, SearchType } from "@konfi/types";
import { formatPrice } from "@konfi/utils/formatters";
import { useChannels } from "context/channels";
import { isEmpty } from "es-toolkit/compat";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWRImmutable from "swr/immutable";

export function AppSearch() {
  const { t, i18n } = useT();
  const [open, setOpen] = useState(false);
  useHotkeys("ctrl+k", (e) => {
    e.preventDefault();
    setOpen(true);
  });
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState<string>("");
  const [searchResults, setSearchResults] = useState<
    {
      id: string;
      name: string;
      type: SearchType;
      channelId?: string;
      email?: string;
      customer?: string;
      images?: string[];
      items?: FormattedOrderItem[];
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const { channel } = useChannels();
  const tenantContext = useTenantContext();
  const searchRequestIdRef = useRef(0);
  const { data: configFlags, isLoading: loadingConfigFlags } = useSWRImmutable(
    [
      "admin-config-flags",
      tenantContext.deploymentMode,
      tenantContext.requireTenantId,
      tenantContext.tenantId ?? "",
    ],
    () => getAdminConfigFlags(),
  );
  const disabled = configFlags?.meilisearchApiKeyProvided === false;

  const customersSearchResults = useMemo(() => {
    return searchResults.filter(
      (result) => result.type === SearchType.CUSTOMERS,
    );
  }, [searchResults]);
  const ordersSearchResults = useMemo(() => {
    return searchResults.filter((result) => result.type === SearchType.ORDERS);
  }, [searchResults]);
  const productsSearchResults = useMemo(() => {
    return searchResults.filter(
      (result) => result.type === SearchType.PRODUCTS,
    );
  }, [searchResults]);
  const getResultKey = (result: (typeof searchResults)[number]) =>
    `${result.type}-${result.channelId ?? "global"}-${result.id}`;

  useEffect(() => {
    const query = value.trim();
    searchRequestIdRef.current += 1;
    const requestId = searchRequestIdRef.current;

    if (loadingConfigFlags || disabled) {
      return;
    }

    if (query.length < 3) {
      startTransition(() => {
        setSearchResults([]);
        setLoading(false);
      });
      return;
    }

    startTransition(() => {
      setLoading(true);
    });

    const timeoutId = window.setTimeout(() => {
      meilisearchMultiSearch(query)
        .then((results) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }

          startTransition(() => {
            setSearchResults(results ?? []);
            setLoading(false);
          });
        })
        .catch((error) => {
          if (searchRequestIdRef.current !== requestId) {
            return;
          }

          console.error("Search failed:", error);
          startTransition(() => {
            setSearchResults([]);
            setLoading(false);
          });
        });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [disabled, loadingConfigFlags, value]);

  useEffect(() => {
    if (disabled) {
      searchRequestIdRef.current += 1;
      startTransition(() => {
        setSearchResults([]);
        setLoading(false);
      });
    }
  }, [disabled]);

  if (disabled || loadingConfigFlags) {
    return null;
  }

  return (
    <>
      <InputGroup
        onClick={() => setOpen(true)}
        flex="1"
        startElement={<MaterialSymbol>search</MaterialSymbol>}
        endElement={<Kbd size="sm">ctrl+k</Kbd>}
      >
        <Input
          size="xs"
          value={""}
          onChange={() => setOpen(true)}
          placeholder={t("search.placeholder", { defaultValue: "Search..." })}
        />
      </InputGroup>
      <Dialog.Root
        open={open}
        size={"xl"}
        onOpenChange={({ open }) => setOpen(open)}
        scrollBehavior={"inside"}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t("search.title", { defaultValue: "Search" })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <InputGroup
                  flex="1"
                  startElement={<MaterialSymbol>search</MaterialSymbol>}
                >
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.currentTarget.value)}
                    placeholder={t("search.placeholder", {
                      defaultValue: "Search...",
                    })}
                    ref={ref}
                  />
                </InputGroup>
                <Skeleton loading={loading}>
                  <Stack mt={2}>
                    {ordersSearchResults.length > 0 && (
                      <HStack mt={4}>
                        <Text
                          fontSize={"sm"}
                          color={{ base: "gray.500", _dark: "gray.400" }}
                          textAlign={"center"}
                        >
                          {t("tools.orders", { defaultValue: "Orders" })}
                        </Text>
                        <Badge>{ordersSearchResults.length}</Badge>
                      </HStack>
                    )}
                    {ordersSearchResults.map((result) => {
                      return (
                        <Presence
                          key={getResultKey(result)}
                          present={true}
                          animationName={{ _open: "fade-in" }}
                          animationDuration="moderate"
                        >
                          <Card.Root
                            flexDirection={"row"}
                            rounded={"2xl"}
                            _hover={{
                              bgColor: { base: "gray.100", _dark: "gray.900" },
                            }}
                          >
                            <Box
                              justifyContent={"center"}
                              alignItems={"center"}
                              display={"flex"}
                              ml={5}
                            >
                              <MaterialSymbol
                                color={{ base: "gray.500", _dark: "gray.400" }}
                              >
                                orders
                              </MaterialSymbol>
                            </Box>
                            <LinkOverlay
                              lng={i18n.resolvedLanguage}
                              w={"100%"}
                              href={`/orders/${result.id}?channelId=${result.channelId}`}
                            >
                              <Card.Body>
                                <VStack alignItems={"start"}>
                                  <HStack w={"100%"} justify={"space-between"}>
                                    <Text fontWeight={"bold"}>
                                      #{result.name}
                                      {result.customer && (
                                        <Badge ml={2}>{result.customer}</Badge>
                                      )}
                                    </Text>
                                    <Box
                                      justifyContent={"center"}
                                      alignItems={"center"}
                                      display={"flex"}
                                      mr={2}
                                    >
                                      <MaterialSymbol
                                        fontSize={18}
                                        color={{
                                          base: "gray.500",
                                          _dark: "gray.400",
                                        }}
                                      >
                                        arrow_forward
                                      </MaterialSymbol>
                                    </Box>
                                  </HStack>
                                  {result.items?.map((item, index) => (
                                    <Box
                                      key={`${item.id}-${index}`}
                                      maxW={"400px"}
                                    >
                                      <Text>
                                        {item.product?.name}
                                        {item.name ? ` (${item.name})` : ""},{" "}
                                        {item.volume
                                          ? item.volume
                                          : item.quantity}{" "}
                                        {t(`Unit.${item.unit}`)} -{" "}
                                        {formatPrice(
                                          item.totalPrice,
                                          CurrencyEnum.PLN,
                                          undefined,
                                          undefined,
                                          i18n.resolvedLanguage,
                                        )}
                                      </Text>
                                      <Text
                                        fontSize={"xs"}
                                        color={{
                                          base: "gray.500",
                                          _dark: "gray.400",
                                        }}
                                        fontWeight={"normal"}
                                      >
                                        {item.description}
                                      </Text>
                                    </Box>
                                  ))}
                                </VStack>
                              </Card.Body>
                            </LinkOverlay>
                          </Card.Root>
                        </Presence>
                      );
                    })}
                    {customersSearchResults.length > 0 && (
                      <HStack mt={4}>
                        <Text
                          fontSize={"sm"}
                          color={{ base: "gray.500", _dark: "gray.400" }}
                          textAlign={"center"}
                        >
                          {t("search.customers", { defaultValue: "Customers" })}
                        </Text>
                        <Badge>{customersSearchResults.length}</Badge>
                      </HStack>
                    )}
                    {customersSearchResults.map((result) => {
                      return (
                        <Presence
                          key={getResultKey(result)}
                          present={true}
                          animationName={{ _open: "fade-in" }}
                          animationDuration="moderate"
                        >
                          <Card.Root
                            flexDirection={"row"}
                            rounded={"2xl"}
                            _hover={{
                              bgColor: { base: "gray.100", _dark: "gray.900" },
                            }}
                          >
                            <Box
                              justifyContent={"center"}
                              alignItems={"center"}
                              display={"flex"}
                              ml={5}
                            >
                              <MaterialSymbol
                                color={{ base: "gray.500", _dark: "gray.400" }}
                              >
                                person
                              </MaterialSymbol>
                            </Box>
                            <LinkOverlay
                              lng={i18n.resolvedLanguage}
                              w={"100%"}
                              href={`/customers/${result.id}`}
                            >
                              <Card.Body>
                                <HStack w={"100%"} justify={"space-between"}>
                                  <Text fontWeight={"bold"}>
                                    {result.name}
                                    {result.email && (
                                      <Badge ml={2}>{result.email}</Badge>
                                    )}
                                  </Text>
                                  <Box
                                    justifyContent={"center"}
                                    alignItems={"center"}
                                    display={"flex"}
                                    mr={2}
                                  >
                                    <MaterialSymbol
                                      fontSize={18}
                                      color={{
                                        base: "gray.500",
                                        _dark: "gray.400",
                                      }}
                                    >
                                      arrow_forward
                                    </MaterialSymbol>
                                  </Box>
                                </HStack>
                              </Card.Body>
                            </LinkOverlay>
                          </Card.Root>
                        </Presence>
                      );
                    })}
                    {productsSearchResults.length > 0 && (
                      <HStack mt={4}>
                        <Text
                          fontSize={"sm"}
                          color={{ base: "gray.500", _dark: "gray.400" }}
                          textAlign={"center"}
                        >
                          {t("search.products", { defaultValue: "Products" })}
                        </Text>
                        <Badge>{productsSearchResults.length}</Badge>
                      </HStack>
                    )}
                    {productsSearchResults.map((result) => {
                      return (
                        <Presence
                          key={getResultKey(result)}
                          present={true}
                          animationName={{ _open: "fade-in" }}
                          animationDuration="moderate"
                        >
                          <Card.Root
                            flexDirection={"row"}
                            rounded={"2xl"}
                            _hover={{
                              bgColor: { base: "gray.100", _dark: "gray.900" },
                            }}
                          >
                            <Box
                              justifyContent={"center"}
                              alignItems={"center"}
                              display={"flex"}
                              ml={5}
                            >
                              <MaterialSymbol
                                color={{ base: "gray.500", _dark: "gray.400" }}
                              >
                                inventory_2
                              </MaterialSymbol>
                            </Box>
                            <LinkOverlay
                              lng={i18n.resolvedLanguage}
                              w={"100%"}
                              href={`/catalog/products/edit/${result.id}?channelId=${result.channelId}`}
                            >
                              <Card.Body>
                                <HStack w={"100%"} justify={"space-between"}>
                                  {result.images && !isEmpty(result.images) && (
                                    <Image
                                      src={`https://${process.env.NEXT_PUBLIC_CDN_URL}/channels/${result.channelId || channel?.id}/products/${result.id}/${result.images[0]}?fit=crop&auto=format`}
                                      alt={""}
                                      ratio={1}
                                      objectFit={"contain"}
                                      minW={"64px"}
                                      width={64}
                                      height={64}
                                      priority={false}
                                      borderRadius={"xl"}
                                    />
                                  )}
                                  <Text fontWeight={"bold"}>{result.name}</Text>
                                  <Box
                                    justifyContent={"center"}
                                    alignItems={"center"}
                                    display={"flex"}
                                    mr={2}
                                  >
                                    <MaterialSymbol
                                      fontSize={18}
                                      color={{
                                        base: "gray.500",
                                        _dark: "gray.400",
                                      }}
                                    >
                                      arrow_forward
                                    </MaterialSymbol>
                                  </Box>
                                </HStack>
                              </Card.Body>
                            </LinkOverlay>
                          </Card.Root>
                        </Presence>
                      );
                    })}
                  </Stack>
                </Skeleton>
              </Dialog.Body>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
