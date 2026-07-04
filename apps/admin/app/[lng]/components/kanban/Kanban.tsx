import { useT } from "@/i18n/client";
import {
  Box,
  HStack,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  useBreakpointValue,
} from "@chakra-ui/react";
import { Order, OrderStatus } from "@konfi/types";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useSwipeable } from "react-swipeable";

const KANBAN_COLUMN_SKELETON_CARDS = [0, 1, 2, 3];

function KanbanColumnSkeleton() {
  return (
    <Stack gap={4} p={4} rounded="3xl">
      <HStack justify="space-between">
        <Skeleton h="6" rounded="md" w="48%" />
        <Skeleton h="6" rounded="full" w="10" />
      </HStack>
      <Stack gap={3}>
        {KANBAN_COLUMN_SKELETON_CARDS.map((card) => (
          <Box
            bg="bg.panel"
            borderColor="border.muted"
            borderWidth="1px"
            key={card}
            p={4}
            rounded="2xl"
          >
            <Stack gap={3}>
              <Skeleton h="5" rounded="md" w="64%" />
              <Skeleton h="4" rounded="md" w="88%" />
              <Skeleton h="4" rounded="md" w="72%" />
              <HStack gap={2}>
                <Skeleton h="7" rounded="full" w="20" />
                <Skeleton h="7" rounded="full" w="16" />
              </HStack>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

const Column = dynamic(() => import("./Column"), {
  loading: () => <KanbanColumnSkeleton />,
  ssr: false,
});
type KanbanProps = {
  data: Order[];
};

const Kanban = ({ data }: KanbanProps) => {
  const { t } = useT();
  const variants: "Tabs" | "SimpleGrid" | undefined = useBreakpointValue(
    { base: "Tabs", md: "SimpleGrid" },
    { ssr: false },
  );
  const [tabIndex, setTabIndex] = useState(0);
  const selectedTabValue = useMemo(() => {
    switch (tabIndex) {
      case 0:
        return "new";
      case 1:
        return "in_progress";
      case 2:
        return "ready";
      case 3:
        return "fulfilled";
      default:
        return "new";
    }
  }, [tabIndex]);
  const tabsHandler = useSwipeable({
    onSwipedLeft: () =>
      handleTabsChange(Math.min(Math.max(tabIndex + 1, 0), 3)),
    onSwipedRight: () =>
      handleTabsChange(Math.min(Math.max(tabIndex - 1, 0), 3)),
  });

  function handleTabsChange(index: number) {
    setTabIndex(index);
  }

  return variants === "Tabs" ? (
    <Tabs.Root
      value={selectedTabValue}
      onValueChange={({ value: nextValue }) =>
        handleTabsChange(
          nextValue === "new"
            ? 0
            : nextValue === "in_progress"
              ? 1
              : nextValue === "ready"
                ? 2
                : 3,
        )
      }
      colorPalette={"primary"}
      {...tabsHandler}
    >
      <Tabs.List mb={"4"}>
        <Tabs.Trigger value={"new"}>{t("kanban.new")}</Tabs.Trigger>
        <Tabs.Trigger value={"in_progress"}>
          {t("kanban.inProgress")}
        </Tabs.Trigger>
        <Tabs.Trigger value={"ready"}>{t("kanban.ready")}</Tabs.Trigger>
        <Tabs.Trigger value={"fulfilled"}>{t("kanban.fulfilled")}</Tabs.Trigger>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Content value={"new"} p={"0"}>
        <Column
          column={"NEW"}
          data={data.filter((order) => order.status === OrderStatus.NEW)}
        />
      </Tabs.Content>
      <Tabs.Content value={"in_progress"} p={"0"}>
        <Column
          column={"IN_PROGRESS"}
          data={data.filter(
            (order) => order.status === OrderStatus.IN_PROGRESS,
          )}
          max={5}
        />
      </Tabs.Content>
      <Tabs.Content value={"ready"} p={"0"}>
        <Column
          column={"READY"}
          data={data.filter((order) => order.status === OrderStatus.READY)}
        />
      </Tabs.Content>
      <Tabs.Content value={"fulfilled"} p={"0"}>
        <Column column={"FULFILLED"} data={[]} />
      </Tabs.Content>
    </Tabs.Root>
  ) : (
    <SimpleGrid
      px={4}
      columns={14}
      bgColor={{ base: "gray.50", _dark: "black" }}
      rounded={"3xl"}
    >
      <Column
        colSpan={4}
        column={"NEW"}
        data={data.filter((order) => order.status === OrderStatus.NEW)}
      />
      <Column
        colSpan={4}
        column={"IN_PROGRESS"}
        data={data.filter((order) => order.status === OrderStatus.IN_PROGRESS)}
        max={5}
      />
      <Column
        colSpan={4}
        column={"READY"}
        data={data.filter((order) => order.status === OrderStatus.READY)}
      />
      <Column colSpan={2} column={"FULFILLED"} data={[]} />
    </SimpleGrid>
  );
};

export default Kanban;
