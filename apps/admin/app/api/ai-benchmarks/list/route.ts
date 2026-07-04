import { requireSuperAdminAuth } from "@/actions/auth-utils";
import { mapBenchmarkDocToRun } from "@/lib/ai/benchmarks/firestore";
import { getAdminDb } from "@/lib/firebase/serverApp";

import { connection, NextRequest, NextResponse } from "next/server";

const DEFAULT_PAGE_SIZE = 10;
const FALLBACK_HISTORY_LIMIT = 1000;
const MAX_PAGE_SIZE = 50;

function parsePageSize(value: string | null) {
  if (!value) {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function isMissingIndexError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("requires an index") ||
      error.message.includes("FAILED_PRECONDITION"))
  );
}

export async function GET(request: NextRequest) {
  await connection();

  try {
    await requireSuperAdminAuth();

    const channelId = request.nextUrl.searchParams.get("channelId");
    const cursor = request.nextUrl.searchParams.get("cursor");
    const pageSize = parsePageSize(request.nextUrl.searchParams.get("limit"));
    if (!channelId) {
      return NextResponse.json(
        { error: "Missing channelId parameter" },
        { status: 400 },
      );
    }

    const firestore = getAdminDb();
    const baseQuery = firestore
      .collection("aiBenchmarkRuns")
      .where("channelId", "==", channelId);
    let runsQuery = baseQuery.orderBy("createdAt", "desc");

    if (cursor) {
      const cursorSnapshot = await firestore
        .collection("aiBenchmarkRuns")
        .doc(cursor)
        .get();

      if (
        !cursorSnapshot.exists ||
        cursorSnapshot.data()?.channelId !== channelId
      ) {
        return NextResponse.json(
          { error: "Invalid history cursor" },
          { status: 400 },
        );
      }

      runsQuery = runsQuery.startAfter(cursorSnapshot);
    }

    const totalSnapshotPromise = baseQuery.count().get();
    let runs: ReturnType<typeof mapBenchmarkDocToRun>[] = [];
    let hasMore = false;
    let nextCursor: string | undefined;

    try {
      const snapshot = await runsQuery.limit(pageSize + 1).get();
      const visibleDocs = snapshot.docs.slice(0, pageSize);
      hasMore = snapshot.docs.length > pageSize;
      nextCursor = hasMore ? visibleDocs.at(-1)?.id : undefined;
      runs = visibleDocs.map((doc) =>
        mapBenchmarkDocToRun({ id: doc.id, data: doc.data() }),
      );
    } catch (error) {
      if (!isMissingIndexError(error)) {
        throw error;
      }

      const fallbackSnapshot = await baseQuery
        .limit(FALLBACK_HISTORY_LIMIT)
        .get();
      const sortedRuns = fallbackSnapshot.docs
        .map((doc) => mapBenchmarkDocToRun({ id: doc.id, data: doc.data() }))
        .toSorted(
          (left, right) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        );
      const cursorIndex = cursor
        ? sortedRuns.findIndex((run) => run.id === cursor)
        : -1;
      const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

      runs = sortedRuns.slice(startIndex, startIndex + pageSize);
      hasMore = sortedRuns.length > startIndex + pageSize;
      nextCursor = hasMore ? runs.at(-1)?.id : undefined;
    }

    const totalSnapshot = await totalSnapshotPromise;

    return NextResponse.json({
      hasMore,
      nextCursor,
      runs,
      totalCount: totalSnapshot.data().count,
    });
  } catch (error) {
    console.error("[AI Benchmarks List] Error:", error);
    const status =
      error instanceof Error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list runs" },
      { status },
    );
  }
}
