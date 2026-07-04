"use client";

import {
  Box,
  HStack,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { db, tenant } from "@konfi/firebase";
import { Order, OrderStatus } from "@konfi/types";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { ADMIN_TOOLS_MCP, safeLocalStorage } from "@konfi/utils";
import dynamic from "next/dynamic";
import { firestore } from "@/lib/firebase/clientApp";
import { onSnapshot, where } from "firebase/firestore";
import { useEffect, useState, startTransition } from "react";
import { useChannels } from "context/channels";
import { useAuth } from "context/auth";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";

type HomeOrdersView = "kanban" | "production";

const HOME_ORDERS_VIEW_STORAGE_KEY = "homepage.ordersView";
const HOME_ORDER_SKELETON_COLUMNS = [0, 1, 2, 3];
const HOME_ORDER_SKELETON_CARDS = [0, 1, 2];

function HomeOrdersSkeleton() {
  return (
    <SimpleGrid
      bgColor={{ base: "gray.50", _dark: "black" }}
      columns={{ base: 1, md: 4 }}
      gap={4}
      mt={4}
      p={4}
      rounded="3xl"
    >
      {HOME_ORDER_SKELETON_COLUMNS.map((column) => (
        <Stack gap={4} key={column} minH={{ base: "360px", md: "680px" }}>
          <HStack justify="space-between" px={2}>
            <Skeleton h="6" rounded="md" w="44%" />
            <Skeleton h="6" rounded="full" w="10" />
          </HStack>
          <Stack gap={3}>
            {HOME_ORDER_SKELETON_CARDS.map((card) => (
              <Box
                bg="bg.panel"
                borderWidth="1px"
                borderColor="border.muted"
                key={`${column}-${card}`}
                p={4}
                rounded="2xl"
              >
                <Stack gap={3}>
                  <HStack justify="space-between">
                    <Skeleton h="5" rounded="md" w="48%" />
                    <Skeleton h="6" rounded="full" w="16" />
                  </HStack>
                  <Skeleton h="4" rounded="md" w="86%" />
                  <Skeleton h="4" rounded="md" w="64%" />
                  <HStack gap={2}>
                    <Skeleton h="7" rounded="full" w="20" />
                    <Skeleton h="7" rounded="full" w="24" />
                  </HStack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Stack>
      ))}
    </SimpleGrid>
  );
}

const Kanban = dynamic(() => import("@/components/kanban/Kanban"), {
  loading: () => <HomeOrdersSkeleton />,
  ssr: false,
});
const ProductionOrdersView = dynamic(
  () => import("@/components/orders/ProductionOrdersView"),
  {
    loading: () => <HomeOrdersSkeleton />,
    ssr: false,
  },
);

const HomePage = () => {
  const [kanbanOrders, setKanbanOrders] = useState<Order[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordersView, setOrdersView] = useState<HomeOrdersView>(() => {
    const storedView = safeLocalStorage.getItem(HOME_ORDERS_VIEW_STORAGE_KEY);

    return storedView === "production" ? "production" : "kanban";
  });
  const { channel } = useChannels();
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const { t, i18n } = useT(["orders", "translation"]);

  const handleViewChange = (nextView: HomeOrdersView) => {
    safeLocalStorage.setItem(HOME_ORDERS_VIEW_STORAGE_KEY, nextView);
    setOrdersView(nextView);
  };

  useEffect(() => {
    if (ordersView !== "kanban") {
      setKanbanOrders(null);
      setLoading(false);
      return;
    }

    if (channel && user) {
      setLoading(true);
      const unsubscribe = onSnapshot(
        db.query<Order>(
          firestore,
          "/channels/" + channel.id + "/orders",
          30,
          undefined,
          [
            ...tenant.queryConstraints(tenantContext),
            where("active", "==", true),
            where("status", "in", [
              OrderStatus.NEW,
              OrderStatus.IN_PROGRESS,
              OrderStatus.READY,
            ]),
          ],
        ),
        (querySnap) => {
          startTransition(() => {
            setKanbanOrders(querySnap.docs.map((doc) => doc.data() as Order));
          });
          setLoading(false);
        },
      );

      return unsubscribe;
    }
  }, [channel, ordersView, tenantContext, user]);

  return (
    <>
      <Tabs.Root
        colorPalette="primary"
        mb={4}
        value={ordersView}
        onValueChange={({ value }) => {
          if (value === "kanban" || value === "production") {
            handleViewChange(value);
          }
        }}
      >
        <HStack
          gap={3}
          alignItems="center"
          justifyContent="space-between"
          flexWrap="wrap"
          mr={{ base: 0, md: 16 }}
        >
          <Tabs.List w="fit-content">
            <Tabs.Trigger value="kanban">
              <MaterialSymbol>view_kanban</MaterialSymbol>
              {t("orders.productionView.homeToggle.kanban", {
                defaultValue: "Kanban",
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="production">
              <MaterialSymbol>format_list_bulleted</MaterialSymbol>
              {t("orders.productionView.homeToggle.production", {
                defaultValue: "Production",
              })}
            </Tabs.Trigger>
            <Tabs.Indicator />
          </Tabs.List>
          <Box
            borderWidth="1px"
            borderColor="border.muted"
            rounded="full"
            bg="bg.panel"
            p={1}
            minH="40px"
            w={{ base: "100%", lg: "auto" }}
            maxW={{ base: "100%", lg: "620px" }}
          >
            <HStack gap={3} justifyContent="space-between" alignItems="center">
              <HStack gap={3} minW={0}>
                <Text
                  fontSize="sm"
                  fontWeight="medium"
                  lineClamp={1}
                  pl={{ base: 2, md: 3 }}
                >
                  {t("translation:home.mcpBanner.description", {
                    defaultValue:
                      "AI agents can now use approved Konfi tools from ChatGPT, Claude, Codex, Cursor, and more.",
                  })}
                </Text>
              </HStack>
              <ButtonLink
                href={ADMIN_TOOLS_MCP}
                lng={i18n.resolvedLanguage}
                ariaLabel={t("translation:home.mcpBanner.action", {
                  defaultValue: "Connect MCP",
                })}
                size="xs"
                variant="surface"
                rounded="full"
                flexShrink={0}
              >
                {t("translation:home.mcpBanner.action", {
                  defaultValue: "Connect MCP",
                })}
                <MaterialSymbol>arrow_outward</MaterialSymbol>
              </ButtonLink>
            </HStack>
          </Box>
        </HStack>
      </Tabs.Root>
      {ordersView === "kanban" && !loading && kanbanOrders && (
        <Kanban data={kanbanOrders} />
      )}
      {ordersView === "production" && <ProductionOrdersView />}
      {ordersView === "kanban" && loading && <HomeOrdersSkeleton />}
    </>
  );
};

export default HomePage;
