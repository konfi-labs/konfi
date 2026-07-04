import { isAuthorizedCronRequest } from "@/lib/cron/auth";
import { isSocialFeatureEnabled } from "@/lib/social/feature-flag";
import { runForCronTenants } from "@/lib/cron/tenant-runner";
import { runSocialPublishWorkflow } from "@/lib/cron/social-publish/workflow";
import { claimDuePosts } from "@/lib/social/posts";
import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

// Social publish may fan out across multiple tenants and launch multiple
// workflow runs; 60 s is sufficient for the claim+start phase.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not configured; rejecting cron request.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSocialFeatureEnabled()) {
    return NextResponse.json({ skipped: true, reason: "social feature disabled" }, { status: 200 });
  }

  try {
    const tenantResults = await runForCronTenants(
      async ({ tenantContext, tenantId }) => {
        const posts = await claimDuePosts(tenantContext);
        const runs: { postId: string; runId: string }[] = [];

        for (const post of posts) {
          const run = tenantId
            ? await start(runSocialPublishWorkflow, [post.id, tenantId])
            : await start(runSocialPublishWorkflow, [post.id]);
          runs.push({ postId: post.id, runId: run.runId });
        }

        return { claimed: posts.length, runs };
      },
    );

    const failedCount = tenantResults.filter(
      (r) => r.status === "failed",
    ).length;

    return NextResponse.json(
      {
        success: failedCount === 0,
        tenants: tenantResults,
      },
      { status: failedCount > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Error running social-publish cron:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown social-publish cron error.",
      },
      { status: 500 },
    );
  }
}
