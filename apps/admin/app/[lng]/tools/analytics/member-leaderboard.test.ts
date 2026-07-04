import { describe, expect, it } from "vitest";
import { buildMemberLeaderboardRows } from "./member-leaderboard";

describe("buildMemberLeaderboardRows", () => {
  it("hides zero-order members and ranks rows by order count then total value", () => {
    const rows = buildMemberLeaderboardRows([
      {
        member: { id: "member-1", name: "Ada" },
        ordersCount: 3,
        totalValue: 9000,
      },
      {
        member: { id: "member-2", name: "Bruno" },
        ordersCount: 0,
        totalValue: 20000,
      },
      {
        member: { id: "member-3", name: "Celina" },
        ordersCount: 5,
        totalValue: 5000,
      },
      {
        member: { id: "member-4", name: "Daniel" },
        ordersCount: 5,
        totalValue: 12000,
      },
    ]);

    expect(rows).toMatchObject([
      {
        averageValue: 2400,
        memberId: "member-4",
        memberName: "Daniel",
        ordersCount: 5,
        rank: 1,
        totalValue: 12000,
      },
      {
        averageValue: 1000,
        memberId: "member-3",
        memberName: "Celina",
        ordersCount: 5,
        rank: 2,
        totalValue: 5000,
      },
      {
        averageValue: 3000,
        memberId: "member-1",
        memberName: "Ada",
        ordersCount: 3,
        rank: 3,
        totalValue: 9000,
      },
    ]);
  });

  it("treats missing totals as zero and uses member name as the final tie-breaker", () => {
    const rows = buildMemberLeaderboardRows([
      {
        member: { id: "member-2", name: "Bruno" },
        ordersCount: 2,
      },
      {
        member: { id: "member-1", name: "Ada" },
        ordersCount: 2,
        totalValue: null,
      },
    ]);

    expect(rows).toMatchObject([
      {
        averageValue: 0,
        memberId: "member-1",
        memberName: "Ada",
        ordersCount: 2,
        rank: 1,
        totalValue: 0,
      },
      {
        averageValue: 0,
        memberId: "member-2",
        memberName: "Bruno",
        ordersCount: 2,
        rank: 2,
        totalValue: 0,
      },
    ]);
  });

  it("builds activity cells and streak metrics for the configured period", () => {
    const rows = buildMemberLeaderboardRows(
      [
        {
          activityDates: [
            new Date("2026-06-01T10:00:00.000Z"),
            new Date("2026-06-03T10:00:00.000Z"),
            new Date("2026-06-03T12:00:00.000Z"),
            new Date("2026-06-04T10:00:00.000Z"),
          ],
          member: { id: "member-1", name: "Ada" },
          ordersCount: 4,
          totalValue: 12000,
        },
      ],
      {
        periodDays: 5,
        periodStart: new Date("2026-06-01T00:00:00.000Z"),
      },
    );

    expect(rows[0]).toMatchObject({
      activeDays: 3,
      currentStreakDays: 0,
      longestStreakDays: 2,
    });
    expect(rows[0]?.activityCells.map((cell) => cell.count)).toEqual([
      1, 0, 2, 1, 0,
    ]);
    expect(rows[0]?.activityCells.map((cell) => cell.level)).toEqual([
      2, 0, 4, 2, 0,
    ]);
  });
});
