import { promises as fs } from "fs";
import { requireAdminAuth } from "@/actions/auth-utils";
import { listGeneratedWhatsNewChanges } from "@/lib/whats-new/feed";
import { mergeWhatsNewChanges } from "@/lib/whats-new/feed-utils";
import { WhatsNewChange } from "@/lib/whats-new/types";
import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import path from "path";
import { z } from "zod";

const whatsNewChangeSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  title: z.record(z.string(), z.string()),
  description: z.record(z.string(), z.string()),
  imageUrl: z.string().optional(),
  seoSuggestionCount: z.number().optional(),
  campaignProposalCount: z.number().optional(),
  highlightFeatures: z
    .array(
      z.object({
        en: z.string(),
        pl: z.string(),
        category: z.record(z.string(), z.string()).optional(),
        icon: z.string().optional(),
        colorPalette: z
          .enum(["primary", "green", "orange", "purple"])
          .optional(),
        imageUrl: z.string().optional(),
      }),
    )
    .optional(),
  kind: z.string().optional(),
  source: z.string().optional(),
});

const whatsNewChangesSchema = z.array(whatsNewChangeSchema);

export async function GET(request: Request) {
  await connection();
  try {
    const cookieStore = await cookies();
    await requireAdminAuth(cookieStore);
    const summaryOnly =
      new URL(request.url).searchParams.get("summary") === "1";

    const filePath = path.join(process.cwd(), "public", "changes.json");
    const fileContents = await fs.readFile(filePath, "utf8");
    const parsedManualChanges = whatsNewChangesSchema.safeParse(
      JSON.parse(fileContents),
    );
    if (!parsedManualChanges.success) {
      throw new Error(
        `Invalid changes.json payload: ${parsedManualChanges.error.message}`,
      );
    }

    const manualChanges = parsedManualChanges.data as WhatsNewChange[];
    let generatedChanges: WhatsNewChange[] = [];

    try {
      generatedChanges = await listGeneratedWhatsNewChanges(
        summaryOnly ? 1 : undefined,
      );
    } catch (error) {
      console.error("Error loading generated changes:", error);
    }

    const changes = mergeWhatsNewChanges(manualChanges, generatedChanges);

    return NextResponse.json(
      summaryOnly
        ? {
            hasChanges: changes.length > 0,
            latestId: changes[0]?.id ?? null,
          }
        : changes,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Error reading changes.json:", error);
    return NextResponse.json(
      { error: "Failed to load changes" },
      {
        status:
          error instanceof Error &&
          error.message === "Unauthorized: Admin access required"
            ? 401
            : 500,
      },
    );
  }
}
