import useColumnDrop from "@/hooks/useColumnDrop";
import useColumnOrder from "@/hooks/useColumnOrder";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  GridItem,
  Heading,
  HStack,
  ScrollArea,
  Skeleton,
  Stack,
} from "@chakra-ui/react";
import { Order, OrderStatus } from "@konfi/types";
import { SCROLL_MASK_CSS } from "@konfi/utils";
import { useChannels } from "context/channels";
import { isNull } from "es-toolkit";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

function KanbanCardSkeleton() {
  return (
    <Box
      bg="bg.panel"
      borderColor="border.muted"
      borderWidth="1px"
      p={4}
      rounded="2xl"
    >
      <Stack gap={3}>
        <HStack justify="space-between">
          <Skeleton h="5" rounded="md" w="56%" />
          <Skeleton h="6" rounded="full" w="16" />
        </HStack>
        <Skeleton h="4" rounded="md" w="88%" />
        <Skeleton h="4" rounded="md" w="68%" />
        <HStack gap={2}>
          <Skeleton h="7" rounded="full" w="20" />
          <Skeleton h="7" rounded="full" w="16" />
        </HStack>
      </Stack>
    </Box>
  );
}

const Card = dynamic(() => import("./Card"), {
  loading: () => <KanbanCardSkeleton />,
  ssr: false,
});

type ColumnProps = {
  column: keyof typeof OrderStatus;
  data: Order[];
  max?: number;
  colSpan?: number;
};

const Column = ({ column, data, max, colSpan }: ColumnProps) => {
  const { t } = useT();
  const { channel } = useChannels();
  const [hasScroll, setHasScroll] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  if (isNull(channel)) throw "channel is null";
  const { dropTaskFrom } = useColumnOrder(column, data, channel.id, max);
  const { dropRef, isOver } = useColumnDrop(column, dropTaskFrom);

  useEffect(() => {
    const checkScroll = () => {
      if (viewportRef.current) {
        const hasVerticalScroll =
          viewportRef.current.scrollHeight > viewportRef.current.clientHeight;
        setHasScroll(hasVerticalScroll);
      }
    };

    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [data.length]);

  return (
    <GridItem rounded={"3xl"} colSpan={colSpan}>
      <Heading pl={"6"} pt={"6"} size={"lg"}>
        {t(`OrderStatus.${column}`)}
        {data.length > 0 && (
          <Badge
            ml={"2"}
            bgColor={{ base: "white", _dark: "gray.950" }}
            minW={"8"}
            justifyContent={"center"}
          >
            {max ? ` ${data.length}/${max}` : ` ${data.length}`}
          </Badge>
        )}
      </Heading>
      <Stack
        ref={dropRef}
        direction={"column"}
        h={{ base: 580, md: 1000 }}
        py={4}
        pl={4}
        pr={1}
        mt={"2"}
        overflow={"auto"}
        mb={"4"}
        rounded={"3xl"}
        bgColor={isOver ? { base: "gray.100", _dark: "gray.900" } : undefined}
      >
        <ScrollArea.Root>
          <ScrollArea.Viewport
            ref={viewportRef}
            css={hasScroll ? SCROLL_MASK_CSS : undefined}
          >
            <ScrollArea.Content paddingEnd="4" spaceY="4">
              {data.map((order, index) => (
                <Card key={order.id} index={index} order={order} />
              ))}
            </ScrollArea.Content>
            <ScrollArea.Scrollbar />
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </Stack>
    </GridItem>
  );
};

export default Column;
