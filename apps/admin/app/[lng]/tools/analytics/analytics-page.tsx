"use client";

import {
  Statistics,
  type StoreAnalyticsSummary,
} from "@/components/Statistics";
import ChannelsSelect from "@/components/layout/ChannelsSelect";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Badge,
  Box,
  Button,
  createListCollection,
  FormatNumber,
  HStack,
  Skeleton,
  SimpleGrid,
  Stack,
  Stat,
  Table,
  Text,
} from "@chakra-ui/react";
import {
  CustomHeading,
  MaterialSymbol,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  Switch,
  ToggleTip,
} from "@konfi/components";
import { calculateProcessingQueue } from "@konfi/firebase";
import { type Member, OrderStatus, PaymentStatus } from "@konfi/types";
import { useChannels } from "context/channels";
import { useConfigurationMembers } from "context/configuration";
import {
  average,
  collection,
  FieldPath,
  getAggregateFromServer,
  getCountFromServer,
  getDocs,
  query,
  sum,
  Timestamp,
  where,
} from "firebase/firestore";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";
import { BreakdownBarChart } from "./components/breakdown-bar-chart";
import {
  buildMemberLeaderboardRows,
  type MemberLeaderboardAggregate,
  type MemberLeaderboardRow,
} from "./member-leaderboard";
import { RevenueChart } from "./components/revenue-chart";

interface Props {
  storeAnalytics?: StoreAnalyticsSummary | null;
}

type StatusBreakdownRow<TKey extends string> = {
  key: TKey;
  count: number;
  totalValue: number;
  share: number;
  avgAgeDays?: number;
};

type AnalyticsData = {
  ordersEstimatedRevenue: number;
  ordersEstimatedMissingRevenue: number;
  ordersCount: number;
  ordersAverageRevenue: number;
  processingQueue: number;
  pipeline: StatusBreakdownRow<OrderStatus>[];
  paymentBreakdown: StatusBreakdownRow<PaymentStatus>[];
};

const EMPTY_MEMBER_LEADERBOARD_ROWS: MemberLeaderboardRow[] = [];
const EMPTY_PAYMENT_BREAKDOWN_ROWS: StatusBreakdownRow<PaymentStatus>[] = [];
const EMPTY_PIPELINE_ROWS: StatusBreakdownRow<OrderStatus>[] = [];
const MEMBER_ACTIVITY_DAYS = 365;
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const SKELETON_ROWS = [0, 1, 2, 3, 4];

const OUTLINED_PANEL_PROPS = {
  borderWidth: "1px",
  borderColor: "border.muted",
  rounded: "xl",
  p: 5,
} as const;

const OUTLINED_STAT_CARD_PROPS = {
  ...OUTLINED_PANEL_PROPS,
  height: "100%",
} as const;

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function getActivityCellBg(level: number) {
  switch (level) {
    case 1:
      return "blue.300";
    case 2:
      return "blue.400";
    case 3:
      return "blue.500";
    case 4:
      return "blue.600";
    default:
      return "bg.muted";
  }
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_IN_DAY);
}

function getTimestampDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate() as Date;
  }

  return null;
}

function LoadingValue({
  children,
  loading,
  width = "140px",
}: {
  children: ReactNode;
  loading: boolean;
  width?: string;
}) {
  if (loading) {
    return <Skeleton height="32px" rounded="md" width={width} />;
  }

  return children;
}

function LeaderboardTableSkeleton() {
  return (
    <Table.ScrollArea>
      <Table.Root size="sm" variant="line">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader width="56px">
              <Skeleton height="14px" rounded="sm" width="20px" />
            </Table.ColumnHeader>
            <Table.ColumnHeader>
              <Skeleton height="14px" rounded="sm" width="96px" />
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              <Skeleton height="14px" ml="auto" rounded="sm" width="64px" />
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              <Skeleton height="14px" ml="auto" rounded="sm" width="112px" />
            </Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">
              <Skeleton height="14px" ml="auto" rounded="sm" width="120px" />
            </Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {SKELETON_ROWS.map((row) => (
            <Table.Row key={row}>
              <Table.Cell>
                <Skeleton height="18px" rounded="sm" width="20px" />
              </Table.Cell>
              <Table.Cell>
                <Skeleton height="18px" rounded="sm" width="min(220px, 80%)" />
              </Table.Cell>
              <Table.Cell>
                <Skeleton height="18px" ml="auto" rounded="sm" width="48px" />
              </Table.Cell>
              <Table.Cell>
                <Skeleton height="18px" ml="auto" rounded="sm" width="96px" />
              </Table.Cell>
              <Table.Cell>
                <Skeleton height="18px" ml="auto" rounded="sm" width="96px" />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}

function BreakdownChartSkeleton() {
  return (
    <Stack gap={4}>
      <HStack align="end" gap={3} height="260px">
        {SKELETON_ROWS.map((row) => (
          <Skeleton
            flex="1"
            height={`${96 + row * 28}px`}
            key={row}
            rounded="md"
          />
        ))}
      </HStack>
      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
        {SKELETON_ROWS.slice(0, 4).map((row) => (
          <HStack gap={2} key={row}>
            <Skeleton boxSize="10px" rounded="full" />
            <Skeleton height="14px" rounded="sm" width="80px" />
          </HStack>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

async function fetchAnalytics(
  channelId: string,
  timeFrameDays: number,
  membersCount: number,
): Promise<AnalyticsData | undefined> {
  if (!channelId) return;
  try {
    const ordersCollection = collection(
      firestore,
      `channels/${channelId}/orders`,
    );
    const timeThreshold = Timestamp.fromDate(
      new Date(Date.now() - timeFrameDays * MS_IN_DAY),
    );
    const estimatedRevenueQuery = query(
      ordersCollection,
      where("createdAt", ">", timeThreshold),
      where("paymentDocumentId", "!=", ""),
      where("active", "==", true),
    );
    const ordersEstimatedRevenueSnapshot = await getAggregateFromServer(
      estimatedRevenueQuery,
      {
        totalTotalPrice: sum("totalPrice"),
      },
    );
    const ordersAverageRevenueSnapshot = await getAggregateFromServer(
      estimatedRevenueQuery,
      {
        averageTotalPrice: average("totalPrice"),
      },
    );
    const processingQueue = await calculateProcessingQueue(
      channelId,
      membersCount,
      timeFrameDays,
    );

    const estimatedMissingRevenueQuery = query(
      ordersCollection,
      where("createdAt", ">", timeThreshold),
      where("paymentDocumentId", "==", ""),
      where("active", "==", true),
    );
    const ordersEstimatedMissingRevenueSnapshot = await getAggregateFromServer(
      estimatedMissingRevenueQuery,
      {
        totalTotalPrice: sum("totalPrice"),
      },
    );

    const ordersCountQuery = query(
      ordersCollection,
      where("createdAt", ">", timeThreshold),
      where("active", "==", true),
    );
    const ordersCountSnapshot = await getCountFromServer(ordersCountQuery);
    const ordersSnapshot = await getDocs(ordersCountQuery);

    const ordersCount = ordersCountSnapshot.data().count;
    const now = Date.now();

    const pipelineAccumulator = new Map<
      OrderStatus,
      { count: number; totalValue: number; totalAgeDays: number }
    >(
      Object.values(OrderStatus).map((status) => [
        status,
        { count: 0, totalValue: 0, totalAgeDays: 0 },
      ]),
    );

    const paymentAccumulator = new Map<
      PaymentStatus,
      { count: number; totalValue: number }
    >(
      Object.values(PaymentStatus).map((status) => [
        status,
        { count: 0, totalValue: 0 },
      ]),
    );

    for (const orderDocument of ordersSnapshot.docs) {
      const order = orderDocument.data();
      const totalValue =
        typeof order.totalPrice === "number" ? order.totalPrice : 0;
      const createdAt = getTimestampDate(order.createdAt);
      const status = order.status as OrderStatus | undefined;
      const paymentStatus = order.paymentStatus as PaymentStatus | undefined;

      if (status && pipelineAccumulator.has(status)) {
        const entry = pipelineAccumulator.get(status)!;
        entry.count += 1;
        entry.totalValue += totalValue;

        if (createdAt) {
          entry.totalAgeDays += (now - createdAt.getTime()) / MS_IN_DAY;
        }
      }

      if (paymentStatus && paymentAccumulator.has(paymentStatus)) {
        const entry = paymentAccumulator.get(paymentStatus)!;
        entry.count += 1;
        entry.totalValue += totalValue;
      }
    }

    const pipeline = Object.values(OrderStatus)
      .map((status) => {
        const entry = pipelineAccumulator.get(status)!;

        return {
          key: status,
          count: entry.count,
          totalValue: entry.totalValue,
          share: ordersCount === 0 ? 0 : (entry.count / ordersCount) * 100,
          avgAgeDays: entry.count === 0 ? 0 : entry.totalAgeDays / entry.count,
        } satisfies StatusBreakdownRow<OrderStatus>;
      })
      .filter((entry) => entry.count > 0);

    const paymentBreakdown = Object.values(PaymentStatus)
      .map((status) => {
        const entry = paymentAccumulator.get(status)!;

        return {
          key: status,
          count: entry.count,
          totalValue: entry.totalValue,
          share: ordersCount === 0 ? 0 : (entry.count / ordersCount) * 100,
        } satisfies StatusBreakdownRow<PaymentStatus>;
      })
      .filter((entry) => entry.count > 0);

    return {
      ordersEstimatedRevenue:
        ordersEstimatedRevenueSnapshot.data().totalTotalPrice ?? 0,
      ordersEstimatedMissingRevenue:
        ordersEstimatedMissingRevenueSnapshot.data().totalTotalPrice ?? 0,
      ordersCount: ordersCountSnapshot.data().count,
      ordersAverageRevenue:
        ordersAverageRevenueSnapshot.data().averageTotalPrice ?? 0,
      processingQueue,
      pipeline,
      paymentBreakdown,
    };
  } catch (error) {
    console.error(error);
    return;
  }
}

async function fetchAnalyticsCompare(channelId: string, timeFrameDays: number) {
  if (!channelId) return;
  try {
    const ordersCollection = collection(
      firestore,
      `channels/${channelId}/orders`,
    );
    // Define previous period: from (now - 2 * timeFrameDays) to (now - timeFrameDays)
    const comparePeriodEnd = Timestamp.fromDate(
      new Date(Date.now() - timeFrameDays * MS_IN_DAY),
    );
    const comparePeriodStart = Timestamp.fromDate(
      new Date(Date.now() - 2 * timeFrameDays * MS_IN_DAY),
    );

    const estimatedRevenueQuery = query(
      ordersCollection,
      where("createdAt", ">", comparePeriodStart),
      where("createdAt", "<=", comparePeriodEnd),
      where("paymentDocumentId", "!=", ""),
      where("active", "==", true),
    );
    const ordersEstimatedRevenueSnapshot = await getAggregateFromServer(
      estimatedRevenueQuery,
      {
        totalTotalPrice: sum("totalPrice"),
      },
    );
    const ordersAverageRevenueSnapshot = await getAggregateFromServer(
      estimatedRevenueQuery,
      {
        averageTotalPrice: average("totalPrice"),
      },
    );
    const ordersCountQuery = query(
      ordersCollection,
      where("createdAt", ">", comparePeriodStart),
      where("createdAt", "<=", comparePeriodEnd),
      where("active", "==", true),
    );
    const ordersCountSnapshot = await getCountFromServer(ordersCountQuery);

    return {
      ordersEstimatedRevenue:
        ordersEstimatedRevenueSnapshot.data().totalTotalPrice ?? 0,
      ordersCount: ordersCountSnapshot.data().count,
      ordersAverageRevenue:
        ordersAverageRevenueSnapshot.data().averageTotalPrice ?? 0,
    };
  } catch (error) {
    console.error(error);
    return;
  }
}

async function fetchMemberLeaderboard(
  channelId: string,
  timeFrameDays: number,
  members: Member[],
) {
  if (!channelId || members.length === 0) return [];

  try {
    const ordersCollection = collection(
      firestore,
      `channels/${channelId}/orders`,
    );
    const periodStart = new Date(Date.now() - timeFrameDays * MS_IN_DAY);
    const timeThreshold = Timestamp.fromDate(periodStart);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const activityPeriodStart = addDays(today, -(MEMBER_ACTIVITY_DAYS - 1));
    const activityTimeThreshold = Timestamp.fromDate(activityPeriodStart);
    const activityDatesByMemberId = new Map<string, Date[]>();
    const memberIdChunks = chunkArray(
      members.map((member) => member.id).filter(Boolean),
      30,
    );

    const activitySnapshots = await Promise.all(
      memberIdChunks.map((memberIds) =>
        getDocs(
          query(
            ordersCollection,
            where("active", "==", true),
            where(new FieldPath("createdBy", "id"), "in", memberIds),
            where("createdAt", ">", activityTimeThreshold),
          ),
        ),
      ),
    );

    for (const activitySnapshot of activitySnapshots) {
      for (const orderDocument of activitySnapshot.docs) {
        const order = orderDocument.data();
        const memberId =
          typeof order.createdBy === "object" &&
          order.createdBy !== null &&
          typeof order.createdBy.id === "string"
            ? order.createdBy.id
            : null;
        const createdAt = getTimestampDate(order.createdAt);

        if (!memberId || !createdAt) {
          continue;
        }

        const activityDates = activityDatesByMemberId.get(memberId) ?? [];
        activityDates.push(createdAt);
        activityDatesByMemberId.set(memberId, activityDates);
      }
    }

    const aggregates = await Promise.all(
      members.map(async (member): Promise<MemberLeaderboardAggregate> => {
        const memberOrdersQuery = query(
          ordersCollection,
          where("active", "==", true),
          where(new FieldPath("createdBy", "id"), "==", member.id),
          where("createdAt", ">", timeThreshold),
        );

        const [ordersCountSnapshot, totalValueSnapshot] = await Promise.all([
          getCountFromServer(memberOrdersQuery),
          getAggregateFromServer(memberOrdersQuery, {
            totalValue: sum("totalPrice"),
          }),
        ]);

        return {
          activityDates: activityDatesByMemberId.get(member.id) ?? [],
          member: {
            id: member.id,
            name: member.name,
          },
          ordersCount: ordersCountSnapshot.data().count,
          totalValue: totalValueSnapshot.data().totalValue ?? 0,
        };
      }),
    );

    return buildMemberLeaderboardRows(aggregates, {
      periodDays: MEMBER_ACTIVITY_DAYS,
      periodStart: activityPeriodStart,
    });
  } catch (error) {
    console.error(error);
    return;
  }
}

export default function AnalyticsPage({ storeAnalytics }: Props) {
  const { i18n, t } = useT();
  const { channel } = useChannels();
  const { filteredMembers } = useConfigurationMembers();
  const [timeFrame, setTimeFrame] = useState<string[]>(["14"]);
  const [compare, setCompare] = useState<boolean>(true);
  const [showMemberActivity, setShowMemberActivity] = useState<boolean>(false);
  const [selectedActivityMemberIds, setSelectedActivityMemberIds] = useState<
    string[]
  >([]);

  const visibleMembers = useMemo(
    () => (filteredMembers ?? []).filter((member) => member.active),
    [filteredMembers],
  );
  const visibleMembersKey = useMemo(
    () =>
      visibleMembers
        .map((member) => `${member.id}:${member.name}`)
        .toSorted()
        .join("|"),
    [visibleMembers],
  );

  const timeFrameOptions = createListCollection({
    items: [
      {
        label: t("analytics.timeFrameOptions.last7Days", {
          defaultValue: "Last 7 days",
        }),
        value: "7",
      },
      {
        label: t("analytics.timeFrameOptions.last14Days", {
          defaultValue: "Last 14 days",
        }),
        value: "14",
      },
      {
        label: t("analytics.timeFrameOptions.last28Days", {
          defaultValue: "Last 28 days",
        }),
        value: "28",
      },
    ],
  });

  const { data, isLoading, isValidating, mutate } = useSWRImmutable(
    channel && filteredMembers
      ? [channel.id, Number(timeFrame[0]), visibleMembers.length]
      : null,
    ([channelId, days, membersCount]) =>
      fetchAnalytics(channelId, days, membersCount),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
    },
  );

  const {
    data: memberLeaderboardRows,
    isLoading: isMemberLeaderboardLoading,
    isValidating: isMemberLeaderboardValidating,
    mutate: mutateMemberLeaderboard,
  } = useSWRImmutable(
    channel && filteredMembers
      ? [channel.id, Number(timeFrame[0]), visibleMembersKey]
      : null,
    ([channelId, days]) =>
      fetchMemberLeaderboard(channelId, days, visibleMembers),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
    },
  );

  const {
    data: compareData,
    isLoading: isCompareLoading,
    isValidating: isCompareValidating,
    mutate: mutateCompare,
  } = useSWRImmutable(
    channel && compare ? [channel.id, Number(timeFrame[0])] : null,
    ([channelId, days]) => fetchAnalyticsCompare(channelId, days),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
    },
  );

  const ordersEstimatedRevenueComparePercentage = useMemo(() => {
    if (!data || !compareData) return 0;
    if (!data.ordersEstimatedRevenue || !compareData.ordersEstimatedRevenue)
      return 0;
    return Math.floor(
      (((data.ordersEstimatedRevenue ?? 0) -
        (compareData.ordersEstimatedRevenue ?? 0)) /
        (compareData.ordersEstimatedRevenue ?? 1)) *
        100,
    );
  }, [compareData, data]);

  const ordersCountComparePercentage = useMemo(() => {
    if (!data || !compareData) return 0;
    if (!data.ordersCount || !compareData.ordersCount) return 0;
    return Math.floor(
      (((data.ordersCount ?? 0) - (compareData.ordersCount ?? 0)) /
        (compareData.ordersCount ?? 1)) *
        100,
    );
  }, [compareData, data]);

  const ordersAverageRevenueComparePercentage = useMemo(() => {
    if (!data || !compareData) return 0;
    if (!data.ordersAverageRevenue || !compareData.ordersAverageRevenue)
      return 0;
    return Math.floor(
      (((data.ordersAverageRevenue ?? 0) -
        (compareData.ordersAverageRevenue ?? 0)) /
        (compareData.ordersAverageRevenue ?? 1)) *
        100,
    );
  }, [compareData, data]);

  const processingQueue = useMemo(() => {
    if (!data) return 0;
    return data?.processingQueue ?? 0;
  }, [data]);

  const pipelineRows = data?.pipeline ?? EMPTY_PIPELINE_ROWS;
  const paymentBreakdownRows =
    data?.paymentBreakdown ?? EMPTY_PAYMENT_BREAKDOWN_ROWS;
  const teamLeaderboardRows =
    memberLeaderboardRows ?? EMPTY_MEMBER_LEADERBOARD_ROWS;
  const teamLeaderboardMemberIds = useMemo(
    () => teamLeaderboardRows.map((row) => row.memberId).join("|"),
    [teamLeaderboardRows],
  );
  const activityMemberOptions = useMemo(
    () =>
      createListCollection({
        items: teamLeaderboardRows.map((row) => ({
          label: row.memberName,
          value: row.memberId,
        })),
      }),
    [teamLeaderboardRows],
  );
  const selectedActivityRows = useMemo(() => {
    const selectedIds = new Set(selectedActivityMemberIds);

    return teamLeaderboardRows.filter((row) => selectedIds.has(row.memberId));
  }, [selectedActivityMemberIds, teamLeaderboardRows]);
  const activityDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.resolvedLanguage, {
        day: "2-digit",
        month: "short",
      }),
    [i18n.resolvedLanguage],
  );
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        currency: "PLN",
        style: "currency",
      }),
    [i18n.resolvedLanguage],
  );
  const decimalFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.resolvedLanguage, {
        style: "decimal",
      }),
    [i18n.resolvedLanguage],
  );

  const pipelineChartRows = useMemo(
    () =>
      pipelineRows.map((row) => ({
        id: row.key,
        label: t(`OrderStatus.${row.key}`, {
          defaultValue: row.key,
        }),
        count: row.count,
        totalValue: row.totalValue,
        share: row.share,
        avgAgeDays: row.avgAgeDays,
      })),
    [pipelineRows, t],
  );

  const paymentChartRows = useMemo(
    () =>
      paymentBreakdownRows.map((row) => ({
        id: row.key,
        label: t(`PaymentStatus.${row.key}`, {
          defaultValue: row.key,
        }),
        count: row.count,
        totalValue: row.totalValue,
        share: row.share,
      })),
    [paymentBreakdownRows, t],
  );

  useEffect(() => {
    if (!channel?.id) return;
    mutate();
    mutateMemberLeaderboard();
    if (compare) mutateCompare();
  }, [
    channel,
    timeFrame,
    compare,
    mutate,
    mutateCompare,
    mutateMemberLeaderboard,
  ]);

  useEffect(() => {
    if (!showMemberActivity) return;

    const availableMemberIds = teamLeaderboardMemberIds
      ? teamLeaderboardMemberIds.split("|")
      : [];
    const availableMemberIdSet = new Set(availableMemberIds);
    const nextSelectedMemberIds = selectedActivityMemberIds.filter((memberId) =>
      availableMemberIdSet.has(memberId),
    );
    const fallbackMemberId = availableMemberIds[0];

    if (nextSelectedMemberIds.length === 0 && fallbackMemberId) {
      nextSelectedMemberIds.push(fallbackMemberId);
    }

    if (
      nextSelectedMemberIds.join("|") !== selectedActivityMemberIds.join("|")
    ) {
      setSelectedActivityMemberIds(nextSelectedMemberIds);
    }
  }, [selectedActivityMemberIds, showMemberActivity, teamLeaderboardMemberIds]);

  const isPrimaryAnalyticsPending = isLoading || isValidating;
  const isComparisonPending =
    compare && (isCompareLoading || isCompareValidating);
  const isStatCardsPending = isPrimaryAnalyticsPending || isComparisonPending;
  const isMemberLeaderboardPending =
    isMemberLeaderboardLoading || isMemberLeaderboardValidating;

  return (
    <>
      <CustomHeading
        heading={t("tools.analytics", { defaultValue: "Analytics" })}
        mb={"8"}
        breadcrumb={true}
        channelsSwitch={<ChannelsSelect />}
        goBack={true}
        t={t}
      />
      <HStack justify={"space-between"} w={"100%"} mb={"6"}>
        <SelectRoot
          collection={timeFrameOptions}
          size={"xs"}
          width={"175px"}
          value={timeFrame}
          onValueChange={(details) => setTimeFrame(details.value)}
          variant={"subtle"}
        >
          <SelectLabel>
            {t("analytics.timeFrameLabel", { defaultValue: "Time period" })}
          </SelectLabel>
          <SelectTrigger>
            <SelectValueText
              placeholder={t("analytics.selectTimeFrame", {
                defaultValue: "Select time period",
              })}
            />
          </SelectTrigger>
          <SelectContent>
            {timeFrameOptions.items.map((option) => (
              <SelectItem item={option} key={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
        <Switch
          size={"sm"}
          checked={compare}
          onCheckedChange={(e) => setCompare(e.checked)}
        >
          {t("analytics.enableComparison", {
            defaultValue: "Enable Comparison",
          })}
        </Switch>
      </HStack>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} gap={4}>
        <Stat.Root {...OUTLINED_STAT_CARD_PROPS}>
          <Stat.Label>
            {t("analytics.estimatedRevenue", {
              defaultValue: "Estimated revenue",
            })}
            <ToggleTip
              content={t("analytics.estimatedRevenueTooltip", {
                timeFrame,
                defaultValue:
                  "Active orders from the last {{timeFrame}} days that have a payment document.",
              })}
            >
              <Button size="2xs" variant="ghost" p={"0"}>
                <MaterialSymbol>info</MaterialSymbol>
              </Button>
            </ToggleTip>
          </Stat.Label>
          <HStack>
            <LoadingValue loading={isStatCardsPending} width="170px">
              <Stat.ValueText>
                {currencyFormatter.format(
                  (data?.ordersEstimatedRevenue ?? 0) / 100,
                )}
              </Stat.ValueText>
            </LoadingValue>
            {!isStatCardsPending &&
              ordersEstimatedRevenueComparePercentage !== 0 && (
                <Badge
                  colorPalette={
                    ordersEstimatedRevenueComparePercentage > 0
                      ? "success"
                      : "red"
                  }
                  gap={"0"}
                >
                  {ordersEstimatedRevenueComparePercentage > 0 ? (
                    <Stat.UpIndicator />
                  ) : (
                    <Stat.DownIndicator />
                  )}
                  {ordersEstimatedRevenueComparePercentage}%
                </Badge>
              )}
          </HStack>
          {!isStatCardsPending &&
            ordersEstimatedRevenueComparePercentage !== 0 && (
              <Stat.HelpText mb="2">
                {t("analytics.comparedToPrevious", {
                  defaultValue: "compared to previous period",
                })}
              </Stat.HelpText>
            )}
        </Stat.Root>
        <Stat.Root {...OUTLINED_STAT_CARD_PROPS}>
          <Stat.Label>
            {t("analytics.missingRevenue", { defaultValue: "Missing revenue" })}
            <ToggleTip
              content={t("analytics.missingRevenueTooltip", {
                timeFrame,
                defaultValue:
                  "Active orders from the last {{timeFrame}} days that do not have a payment document.",
              })}
            >
              <Button size="2xs" variant="ghost" p={"0"}>
                <MaterialSymbol>info</MaterialSymbol>
              </Button>
            </ToggleTip>
          </Stat.Label>
          <HStack>
            <LoadingValue loading={isPrimaryAnalyticsPending} width="160px">
              <Stat.ValueText>
                {currencyFormatter.format(
                  (data?.ordersEstimatedMissingRevenue ?? 0) / 100,
                )}
              </Stat.ValueText>
            </LoadingValue>
          </HStack>
        </Stat.Root>
        <Stat.Root {...OUTLINED_STAT_CARD_PROPS}>
          <Stat.Label>
            {t("analytics.ordersCount", { defaultValue: "Number of orders" })}
            <ToggleTip
              content={t("analytics.ordersCountTooltip", {
                timeFrame,
                defaultValue: "Active orders from the last {{timeFrame}} days.",
              })}
            >
              <Button size="2xs" variant="ghost" p={"0"}>
                <MaterialSymbol>info</MaterialSymbol>
              </Button>
            </ToggleTip>
          </Stat.Label>
          <HStack>
            <LoadingValue loading={isStatCardsPending} width="96px">
              <Stat.ValueText>
                {decimalFormatter.format(data?.ordersCount ?? 0)}
              </Stat.ValueText>
            </LoadingValue>
            {!isStatCardsPending && ordersCountComparePercentage !== 0 && (
              <Badge
                colorPalette={
                  ordersCountComparePercentage > 0 ? "success" : "red"
                }
                gap={"0"}
              >
                {ordersCountComparePercentage > 0 ? (
                  <Stat.UpIndicator />
                ) : (
                  <Stat.DownIndicator />
                )}
                {ordersCountComparePercentage}%
              </Badge>
            )}
          </HStack>
          {!isStatCardsPending && ordersCountComparePercentage !== 0 && (
            <Stat.HelpText mb="2">
              {t("analytics.comparedToPrevious", {
                defaultValue: "compared to previous period",
              })}
            </Stat.HelpText>
          )}
        </Stat.Root>
        <Stat.Root {...OUTLINED_STAT_CARD_PROPS}>
          <Stat.Label>
            {t("analytics.averageOrderValue", {
              defaultValue: "Average order value",
            })}
            <ToggleTip
              content={t("analytics.averageOrderValueTooltip", {
                timeFrame,
                defaultValue:
                  "Average value of active orders from the last {{timeFrame}} days that have a payment document.",
              })}
            >
              <Button size="2xs" variant="ghost" p={"0"}>
                <MaterialSymbol>info</MaterialSymbol>
              </Button>
            </ToggleTip>
          </Stat.Label>
          <HStack>
            <LoadingValue loading={isStatCardsPending} width="160px">
              <Stat.ValueText>
                {currencyFormatter.format(
                  (data?.ordersAverageRevenue ?? 0) / 100,
                )}
              </Stat.ValueText>
            </LoadingValue>
            {!isStatCardsPending &&
              ordersAverageRevenueComparePercentage !== 0 && (
                <Badge
                  colorPalette={
                    ordersAverageRevenueComparePercentage > 0
                      ? "success"
                      : "red"
                  }
                  gap={"0"}
                >
                  {ordersAverageRevenueComparePercentage > 0 ? (
                    <Stat.UpIndicator />
                  ) : (
                    <Stat.DownIndicator />
                  )}
                  {ordersAverageRevenueComparePercentage}%
                </Badge>
              )}
          </HStack>
          {!isStatCardsPending &&
            ordersAverageRevenueComparePercentage !== 0 && (
              <Stat.HelpText mb="2">
                {t("analytics.comparedToPrevious", {
                  defaultValue: "compared to previous period",
                })}
              </Stat.HelpText>
            )}
        </Stat.Root>
        <Stat.Root {...OUTLINED_STAT_CARD_PROPS}>
          <Stat.Label>
            {t("analytics.orderProcessingDays", {
              defaultValue: "Order processing (days)",
            })}
            <ToggleTip
              content={t("analytics.processingQueueTooltip", {
                timeFrame,
                defaultValue:
                  "Average number of days waiting for order processing. Calculated based on active orders from the last {{timeFrame}} days.",
              })}
            >
              <Button size="2xs" variant="ghost" p={"0"}>
                <MaterialSymbol>info</MaterialSymbol>
              </Button>
            </ToggleTip>
          </Stat.Label>
          <LoadingValue loading={isPrimaryAnalyticsPending} width="96px">
            <Stat.ValueText>
              {decimalFormatter.format(processingQueue)}
            </Stat.ValueText>
          </LoadingValue>
          {!isStatCardsPending &&
            ordersAverageRevenueComparePercentage !== 0 && (
              <Stat.HelpText mb="2">
                {t("analytics.comparedToPrevious", {
                  defaultValue: "compared to previous period",
                })}
              </Stat.HelpText>
            )}
        </Stat.Root>
      </SimpleGrid>
      <Box mt={8} {...OUTLINED_PANEL_PROPS}>
        <Stack gap={4}>
          <Box>
            <Text fontSize="lg" fontWeight="medium">
              {t("analytics.teamLeaderboard", {
                defaultValue: "Team leaderboard",
              })}
            </Text>
            <Text color="fg.muted" fontSize="sm">
              {t("analytics.teamLeaderboardDescription", {
                defaultValue:
                  "Active orders created by visible team members in the selected period.",
              })}
            </Text>
          </Box>

          {isMemberLeaderboardPending && teamLeaderboardRows.length === 0 ? (
            <LeaderboardTableSkeleton />
          ) : teamLeaderboardRows.length > 0 ? (
            <Stack gap={5}>
              <Table.ScrollArea>
                <Table.Root size="sm" variant="line">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader width="56px">#</Table.ColumnHeader>
                      <Table.ColumnHeader>
                        {t("analytics.member", { defaultValue: "Member" })}
                      </Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        {t("analytics.ordersShort", {
                          defaultValue: "Orders",
                        })}
                      </Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        {t("analytics.totalOrderValue", {
                          defaultValue: "Total order value",
                        })}
                      </Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        {t("analytics.averageOrderValue", {
                          defaultValue: "Average order value",
                        })}
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {teamLeaderboardRows.map((row) => (
                      <Table.Row key={row.memberId}>
                        <Table.Cell color="fg.muted" fontWeight="medium">
                          {row.rank}
                        </Table.Cell>
                        <Table.Cell maxW="320px">
                          <Text fontWeight="medium" truncate>
                            {row.memberName}
                          </Text>
                        </Table.Cell>
                        <Table.Cell textAlign="end">
                          <FormatNumber value={row.ordersCount} />
                        </Table.Cell>
                        <Table.Cell textAlign="end">
                          {currencyFormatter.format(row.totalValue / 100)}
                        </Table.Cell>
                        <Table.Cell textAlign="end">
                          {currencyFormatter.format(row.averageValue / 100)}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </Table.ScrollArea>

              <Stack gap={4}>
                <HStack
                  align={{ base: "stretch", md: "end" }}
                  flexWrap="wrap"
                  justify="space-between"
                >
                  <Switch
                    checked={showMemberActivity}
                    onCheckedChange={(details) => {
                      setShowMemberActivity(details.checked);

                      if (
                        details.checked &&
                        selectedActivityMemberIds.length === 0 &&
                        teamLeaderboardRows[0]
                      ) {
                        setSelectedActivityMemberIds([
                          teamLeaderboardRows[0].memberId,
                        ]);
                      }
                    }}
                    size="sm"
                  >
                    {t("analytics.showMemberActivity", {
                      defaultValue: "Show member activity",
                    })}
                  </Switch>

                  {showMemberActivity ? (
                    <SelectRoot
                      closeOnSelect={false}
                      collection={activityMemberOptions}
                      multiple
                      onValueChange={(details) =>
                        setSelectedActivityMemberIds(details.value)
                      }
                      size="sm"
                      value={selectedActivityMemberIds}
                      variant="outline"
                      width={{ base: "100%", md: "320px" }}
                    >
                      <SelectLabel>
                        {t("analytics.selectMembers", {
                          defaultValue: "Select members",
                        })}
                      </SelectLabel>
                      <SelectTrigger>
                        <SelectValueText
                          placeholder={t("analytics.selectMembers", {
                            defaultValue: "Select members",
                          })}
                        >
                          {(items) =>
                            t("analytics.selectedMembersCount", {
                              count: items.length,
                              defaultValue: "{{count}} members selected",
                            })
                          }
                        </SelectValueText>
                      </SelectTrigger>
                      <SelectContent>
                        {activityMemberOptions.items.map((option) => (
                          <SelectItem item={option} key={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectRoot>
                  ) : null}
                </HStack>

                {showMemberActivity && selectedActivityRows.length > 0 ? (
                  <SimpleGrid columns={{ base: 1, xl: 2 }} gap={4}>
                    {selectedActivityRows.map((row) => (
                      <Box
                        borderColor="border.muted"
                        borderWidth="1px"
                        key={row.memberId}
                        minW={0}
                        p={4}
                        rounded="md"
                      >
                        <Stack gap={4}>
                          <HStack align="start" justify="space-between">
                            <HStack gap={2} minW={0}>
                              <Badge colorPalette="blue" flexShrink={0}>
                                #{row.rank}
                              </Badge>
                              <Text fontWeight="medium" truncate>
                                {row.memberName}
                              </Text>
                            </HStack>
                            <Text color="fg.muted" flexShrink={0} fontSize="xs">
                              {t("analytics.selectedDays", {
                                count: row.activityCells.length,
                                defaultValue: "{{count}} days",
                              })}
                            </Text>
                          </HStack>

                          <SimpleGrid columns={{ base: 2, md: 5 }} gap={3}>
                            <Box>
                              <Text color="fg.muted" fontSize="xs">
                                {t("analytics.ordersShort", {
                                  defaultValue: "Orders",
                                })}
                              </Text>
                              <Text fontSize="sm" fontWeight="medium">
                                <FormatNumber value={row.ordersCount} />
                              </Text>
                            </Box>
                            <Box>
                              <Text color="fg.muted" fontSize="xs">
                                {t("analytics.totalOrderValue", {
                                  defaultValue: "Total order value",
                                })}
                              </Text>
                              <Text fontSize="sm" fontWeight="medium">
                                {currencyFormatter.format(row.totalValue / 100)}
                              </Text>
                            </Box>
                            <Box>
                              <Text color="fg.muted" fontSize="xs">
                                {t("analytics.averageOrderValue", {
                                  defaultValue: "Average order value",
                                })}
                              </Text>
                              <Text fontSize="sm" fontWeight="medium">
                                {currencyFormatter.format(
                                  row.averageValue / 100,
                                )}
                              </Text>
                            </Box>
                            <Box>
                              <Text color="fg.muted" fontSize="xs">
                                {t("analytics.activeDays", {
                                  defaultValue: "Active days",
                                })}
                              </Text>
                              <Text fontSize="sm" fontWeight="medium">
                                <FormatNumber value={row.activeDays} />
                              </Text>
                            </Box>
                            <Box>
                              <Text color="fg.muted" fontSize="xs">
                                {t("analytics.longestStreak", {
                                  defaultValue: "Longest streak",
                                })}
                              </Text>
                              <Text fontSize="sm" fontWeight="medium">
                                <FormatNumber value={row.longestStreakDays} />
                              </Text>
                            </Box>
                          </SimpleGrid>

                          <Box>
                            <HStack justify="space-between" mb={2}>
                              <Text fontSize="sm" fontWeight="medium">
                                {t("analytics.orderActivity", {
                                  defaultValue: "Order activity",
                                })}
                              </Text>
                              <Text color="fg.muted" fontSize="xs">
                                {t("analytics.currentStreak", {
                                  count: row.currentStreakDays,
                                  defaultValue:
                                    "Current streak: {{count}} days",
                                })}
                              </Text>
                            </HStack>
                            <Box overflowX="auto" pb={1}>
                              <Box
                                display="grid"
                                gap={1}
                                gridAutoFlow="column"
                                gridTemplateRows="repeat(7, 10px)"
                                w="max-content"
                              >
                                {row.activityCells.map((cell) => (
                                  <Box
                                    aria-label={t(
                                      "analytics.orderActivityCellLabel",
                                      {
                                        count: cell.count,
                                        date: activityDateFormatter.format(
                                          cell.date,
                                        ),
                                        defaultValue:
                                          "{{date}}: {{count}} orders",
                                      },
                                    )}
                                    bg={getActivityCellBg(cell.level)}
                                    boxSize="10px"
                                    key={cell.dateKey}
                                    rounded="2px"
                                    title={t(
                                      "analytics.orderActivityCellLabel",
                                      {
                                        count: cell.count,
                                        date: activityDateFormatter.format(
                                          cell.date,
                                        ),
                                        defaultValue:
                                          "{{date}}: {{count}} orders",
                                      },
                                    )}
                                  />
                                ))}
                              </Box>
                            </Box>
                          </Box>
                        </Stack>
                      </Box>
                    ))}
                  </SimpleGrid>
                ) : showMemberActivity ? (
                  <Text color="fg.muted" fontSize="sm">
                    {t("analytics.noSelectedMemberActivityData", {
                      defaultValue:
                        "Select at least one member to show activity.",
                    })}
                  </Text>
                ) : null}
              </Stack>
            </Stack>
          ) : (
            <Text color="fg.muted" fontSize="sm">
              {t("analytics.noMemberLeaderboardData", {
                defaultValue:
                  "No team member created active orders in the selected period.",
              })}
            </Text>
          )}
        </Stack>
      </Box>
      {/* Revenue Chart Section */}
      <Box mt={8} {...OUTLINED_PANEL_PROPS}>
        <Text fontSize="lg" fontWeight="medium" mb={2}>
          {t("analytics.revenueOverTime", {
            defaultValue: "Revenue over time",
          })}
        </Text>
        {channel && (
          <RevenueChart
            channelId={channel.id}
            timeFrameDays={Number(timeFrame[0])}
            compare={compare}
          />
        )}
      </Box>
      {storeAnalytics ? (
        <Box my={8} {...OUTLINED_PANEL_PROPS}>
          <Stack gap={4}>
            <Box>
              <Text fontSize="lg" fontWeight="medium">
                {t("analytics.storeAnalyticsSectionTitle", {
                  defaultValue: "Store analytics",
                })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {t("analytics.storeAnalyticsSectionDescription", {
                  defaultValue:
                    "Google Analytics overview for the store across the current and previous month.",
                })}
              </Text>
            </Box>
            <Statistics analytics={storeAnalytics} mb={0} />
          </Stack>
        </Box>
      ) : null}
      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={6} mt={8}>
        <Box {...OUTLINED_PANEL_PROPS}>
          <Stack gap={4}>
            <Box>
              <Text fontSize="lg" fontWeight="medium">
                {t("analytics.orderPipeline", {
                  defaultValue: "Order pipeline",
                })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {t("analytics.activeOrdersInTimeFrame", {
                  count: data?.ordersCount ?? 0,
                  timeFrame: timeFrame[0],
                  defaultValue:
                    "{{count}} active orders in the last {{timeFrame}} days",
                })}
              </Text>
            </Box>

            {isPrimaryAnalyticsPending && pipelineRows.length === 0 ? (
              <BreakdownChartSkeleton />
            ) : pipelineRows.length > 0 ? (
              <BreakdownBarChart
                rows={pipelineChartRows}
                metric="count"
                metricLabel={t("analytics.ordersShort", {
                  defaultValue: "Orders",
                })}
                emptyText={t("analytics.noActiveOrders", {
                  defaultValue:
                    "No active orders found for the selected period.",
                })}
                labels={{
                  orders: t("analytics.ordersShort", {
                    defaultValue: "Orders",
                  }),
                  value: t("analytics.value", { defaultValue: "Value" }),
                  share: t("analytics.share", { defaultValue: "Share" }),
                  avgAgeDays: t("analytics.avgAgeDays", {
                    defaultValue: "Avg age (days)",
                  }),
                }}
              />
            ) : (
              <Text color="fg.muted" fontSize="sm">
                {t("analytics.noActiveOrders", {
                  defaultValue:
                    "No active orders found for the selected period.",
                })}
              </Text>
            )}
          </Stack>
        </Box>

        <Box {...OUTLINED_PANEL_PROPS}>
          <Stack gap={4}>
            <Box>
              <Text fontSize="lg" fontWeight="medium">
                {t("analytics.paymentOverview", {
                  defaultValue: "Payment overview",
                })}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {t("analytics.paymentOverviewDescription", {
                  defaultValue:
                    "Payment health for active orders in the selected period.",
                })}
              </Text>
            </Box>

            {isPrimaryAnalyticsPending && paymentBreakdownRows.length === 0 ? (
              <BreakdownChartSkeleton />
            ) : paymentBreakdownRows.length > 0 ? (
              <BreakdownBarChart
                rows={paymentChartRows}
                metric="count"
                metricLabel={t("analytics.ordersShort", {
                  defaultValue: "Orders",
                })}
                emptyText={t("analytics.noPaymentData", {
                  defaultValue:
                    "No payment data found for active orders in the selected period.",
                })}
                labels={{
                  orders: t("analytics.ordersShort", {
                    defaultValue: "Orders",
                  }),
                  value: t("analytics.value", { defaultValue: "Value" }),
                  share: t("analytics.share", { defaultValue: "Share" }),
                }}
              />
            ) : (
              <Text color="fg.muted" fontSize="sm">
                {t("analytics.noPaymentData", {
                  defaultValue:
                    "No payment data found for active orders in the selected period.",
                })}
              </Text>
            )}
          </Stack>
        </Box>
      </SimpleGrid>
    </>
  );
}
