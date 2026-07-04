import type { Timestamp } from "firebase/firestore";
import type { Base } from "./base";
import type { TenantOwned } from "./tenant";

export const SOCIAL_POST_STATUSES = [
  "draft",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
] as const;

export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number];

export type SocialProviderKey = "facebook" | "instagram";

export interface SocialPostMedia {
  storagePath: string;
  downloadUrl: string;
  contentType: string;
}

export interface SocialPostTarget {
  provider: SocialProviderKey;
  targetId: string;
  targetName: string;
  status: "pending" | "published" | "failed";
  externalPostId?: string;
  error?: string;
  publishedAt?: Omit<Timestamp, "toJSON">;
}

export interface SocialPost extends Base, TenantOwned {
  channelId?: string;
  content: string;
  media: SocialPostMedia[];
  targets: SocialPostTarget[];
  scheduledAt?: Omit<Timestamp, "toJSON">;
  status: SocialPostStatus;
}
