"use client";

import { useSocial } from "@/context/social";
import { type SocialPostView } from "@/actions/social";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Grid,
  GridItem,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useEffect, useState } from "react";

const STATUS_PALETTE: Record<SocialPostView["status"], string> = {
  draft: "gray",
  scheduled: "blue",
  publishing: "orange",
  published: "green",
  partial: "orange",
  failed: "red",
};

function getMonthRange(year: number, month: number) {
  const from = new Date(year, month, 1).getTime();
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
  return { from, to };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstWeekday(year: number, month: number) {
  // 0 = Sunday; shift so Monday = 0
  const raw = new Date(year, month, 1).getDay();
  return (raw + 6) % 7; // Mon-based
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function PostsCalendar({
  onEdit,
}: {
  onEdit: (post: SocialPostView) => void;
}) {
  const { t, i18n } = useT();
  const { posts, refreshPosts } = useSocial();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Reload when month changes
  useEffect(() => {
    const { from, to } = getMonthRange(year, month);
    refreshPosts({ from, to });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshPosts is a context function; adding it would cause infinite re-fetch loops
  }, [year, month]);

  function goToPrev() {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNext() {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstWeekday(year, month);

  // Map day number → posts scheduled that day
  const postsByDay = new Map<number, SocialPostView[]>();
  for (const post of posts) {
    if (!post.scheduledAt) continue;
    const d = new Date(post.scheduledAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      const existing = postsByDay.get(day) ?? [];
      existing.push(post);
      postsByDay.set(day, existing);
    }
  }

  const monthLabel = new Date(year, month, 1).toLocaleString(
    i18n.resolvedLanguage,
    { month: "long", year: "numeric" },
  );

  const todayDay =
    today.getFullYear() === year && today.getMonth() === month
      ? today.getDate()
      : null;

  // Build grid cells: leading empty cells + day cells
  const leadingEmpties = firstWeekday;
  const totalCells = leadingEmpties + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  return (
    <VStack align="stretch" gap={4}>
      {/* Header */}
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Text fontWeight="semibold" fontSize="lg">
          {monthLabel}
        </Text>
        <HStack gap={2}>
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrev}
            aria-label={t("social.calendarPrev", { defaultValue: "Previous month" })}
          >
            <MaterialSymbol>chevron_left</MaterialSymbol>
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            {t("social.calendarToday", { defaultValue: "Today" })}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNext}
            aria-label={t("social.calendarNext", { defaultValue: "Next month" })}
          >
            <MaterialSymbol>chevron_right</MaterialSymbol>
          </Button>
        </HStack>
      </HStack>

      {/* Weekday labels */}
      <Grid templateColumns="repeat(7, 1fr)" gap={0}>
        {WEEKDAY_LABELS.map((label) => (
          <GridItem key={label} textAlign="center" py={1}>
            <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
              {t(`social.weekday.${label.toLowerCase()}`, { defaultValue: label })}
            </Text>
          </GridItem>
        ))}
      </Grid>

      {/* Day grid */}
      <Grid templateColumns="repeat(7, 1fr)" gap="1px" bg="border">
        {Array.from({ length: rows * 7 }, (_, i) => {
          const cellIndex = i;
          const day =
            cellIndex < leadingEmpties
              ? null
              : cellIndex - leadingEmpties + 1 > daysInMonth
                ? null
                : cellIndex - leadingEmpties + 1;

          const dayPosts = day ? (postsByDay.get(day) ?? []) : [];
          const isToday = day !== null && day === todayDay;

          return (
            <GridItem key={i} bg="bg" minH="80px" p={1}>
              {day !== null && (
                <VStack align="stretch" gap={1} h="full">
                  <Box
                    w={6}
                    h={6}
                    borderRadius="full"
                    bg={isToday ? "primary.solid" : undefined}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    alignSelf="flex-start"
                  >
                    <Text
                      fontSize="xs"
                      fontWeight={isToday ? "bold" : "normal"}
                      color={isToday ? "primary.contrast" : "fg"}
                    >
                      {day}
                    </Text>
                  </Box>
                  <VStack align="stretch" gap={0.5} overflow="hidden">
                    {dayPosts.slice(0, 3).map((post) => (
                      <Badge
                        key={post.id}
                        colorPalette={STATUS_PALETTE[post.status] ?? "gray"}
                        size="sm"
                        cursor="pointer"
                        truncate
                        onClick={() => onEdit(post)}
                        title={post.name}
                      >
                        {post.name}
                      </Badge>
                    ))}
                    {dayPosts.length > 3 && (
                      <Text fontSize="2xs" color="fg.muted">
                        +{dayPosts.length - 3}{" "}
                        {t("social.calendarMore", { defaultValue: "more" })}
                      </Text>
                    )}
                  </VStack>
                </VStack>
              )}
            </GridItem>
          );
        })}
      </Grid>
    </VStack>
  );
}
