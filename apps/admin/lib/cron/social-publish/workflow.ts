import "server-only";

import { getWorkflowMetadata } from "workflow";
import {
  type PublishCredentialsContext,
  finalizePostStep,
  loadPublishablePostStep,
  publishTargetStep,
} from "./steps";

export interface SocialPublishWorkflowResult {
  kind: "social-publish";
  postId: string;
  skipped?: true;
  targets?: {
    published: number;
    failed: number;
  };
  workflowRunId: string;
}

export async function runSocialPublishWorkflow(
  postId: string,
  tenantId?: string,
): Promise<SocialPublishWorkflowResult> {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  const ctx = await loadPublishablePostStep(postId, tenantId);

  if (!ctx) {
    return { kind: "social-publish", postId, skipped: true, workflowRunId };
  }

  const { post } = ctx;
  const publishContext: PublishCredentialsContext = ctx;

  let published = 0;
  let failed = 0;

  for (const target of post.targets) {
    const outcome = await publishTargetStep(
      postId,
      tenantId,
      target,
      post.content,
      post.media,
      publishContext,
    );

    if (outcome.outcome === "published") published++;
    else if (outcome.outcome === "failed") failed++;
  }

  await finalizePostStep(postId, tenantId);

  return {
    kind: "social-publish",
    postId,
    targets: { published, failed },
    workflowRunId,
  };
}
