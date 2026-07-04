import { requireSuperAdminAuth } from "@/actions/auth-utils";
import { getAdminDb } from "@/lib/firebase/serverApp";

import { connection, NextResponse } from "next/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ benchmarkRunId: string }> },
) {
  await connection();

  try {
    await requireSuperAdminAuth();

    const { benchmarkRunId } = await params;
    if (!benchmarkRunId) {
      return NextResponse.json(
        { error: "Missing benchmarkRunId" },
        { status: 400 },
      );
    }

    const firestore = getAdminDb();
    const docRef = firestore.collection("aiBenchmarkRuns").doc(benchmarkRunId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return NextResponse.json(
        { error: "Benchmark run not found" },
        { status: 404 },
      );
    }

    await docRef.delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AI Benchmarks Delete] Error:", error);
    const status =
      error instanceof Error && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete benchmark run",
      },
      { status },
    );
  }
}
