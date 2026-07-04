export interface MemberLeaderboardMember {
  id: string;
  name: string;
}

export interface MemberLeaderboardAggregate {
  activityDates?: Date[];
  member: MemberLeaderboardMember;
  ordersCount: number;
  totalValue?: number | null;
}

export interface MemberActivityCell {
  count: number;
  date: Date;
  dateKey: string;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface MemberLeaderboardRow {
  activeDays: number;
  activityCells: MemberActivityCell[];
  averageValue: number;
  currentStreakDays: number;
  longestStreakDays: number;
  memberId: string;
  memberName: string;
  ordersCount: number;
  rank: number;
  totalValue: number;
}

interface BuildMemberLeaderboardRowsOptions {
  periodDays?: number;
  periodStart?: Date;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getActivityLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0;

  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function buildActivityCells(
  activityDates: Date[] | undefined,
  options: BuildMemberLeaderboardRowsOptions,
): MemberActivityCell[] {
  const { periodDays, periodStart } = options;

  if (!periodDays || !periodStart || periodDays <= 0) {
    return [];
  }

  const countsByDate = new Map<string, number>();
  for (const activityDate of activityDates ?? []) {
    const dateKey = getDateKey(activityDate);
    countsByDate.set(dateKey, (countsByDate.get(dateKey) ?? 0) + 1);
  }

  const maxCount = Math.max(0, ...countsByDate.values());

  return Array.from({ length: periodDays }, (_, index) => {
    const date = addDays(periodStart, index);
    const dateKey = getDateKey(date);
    const count = countsByDate.get(dateKey) ?? 0;

    return {
      count,
      date,
      dateKey,
      level: getActivityLevel(count, maxCount),
    };
  });
}

function getLongestStreak(cells: MemberActivityCell[]) {
  let longestStreak = 0;
  let currentStreak = 0;

  for (const cell of cells) {
    if (cell.count > 0) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return longestStreak;
}

function getCurrentStreak(cells: MemberActivityCell[]) {
  let currentStreak = 0;

  for (const cell of cells.toReversed()) {
    if (cell.count === 0) {
      break;
    }

    currentStreak += 1;
  }

  return currentStreak;
}

export function buildMemberLeaderboardRows(
  aggregates: MemberLeaderboardAggregate[],
  options: BuildMemberLeaderboardRowsOptions = {},
): MemberLeaderboardRow[] {
  return aggregates
    .filter((aggregate) => aggregate.ordersCount > 0)
    .map((aggregate) => {
      const totalValue =
        typeof aggregate.totalValue === "number" ? aggregate.totalValue : 0;
      const activityCells = buildActivityCells(
        aggregate.activityDates,
        options,
      );

      return {
        activeDays: activityCells.filter((cell) => cell.count > 0).length,
        activityCells,
        averageValue: totalValue / aggregate.ordersCount,
        currentStreakDays: getCurrentStreak(activityCells),
        longestStreakDays: getLongestStreak(activityCells),
        memberId: aggregate.member.id,
        memberName: aggregate.member.name,
        ordersCount: aggregate.ordersCount,
        rank: 0,
        totalValue,
      };
    })
    .toSorted((first, second) => {
      if (second.ordersCount !== first.ordersCount) {
        return second.ordersCount - first.ordersCount;
      }

      if (second.totalValue !== first.totalValue) {
        return second.totalValue - first.totalValue;
      }

      return first.memberName.localeCompare(second.memberName);
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));
}
