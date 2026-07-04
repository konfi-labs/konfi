"use server";

import {
  getAuthenticatedAdminUid,
  requireSuperAdminAuth,
} from "@/actions/auth-utils";
import { revalidateTagCache } from "@/actions/index";
import { getAdminAuth } from "@/lib/firebase/serverApp";
import {
  applyAllMonthlySeoSuggestions,
  applyMonthlySeoSuggestion,
} from "@/lib/whats-new/seo-suggestions";

async function getAppliedByMember() {
  const adminUid = await getAuthenticatedAdminUid();
  const userRecord = await getAdminAuth().getUser(adminUid);

  return {
    id: adminUid,
    name: userRecord.displayName || userRecord.email || adminUid,
  };
}

async function revalidateProductSeoTags() {
  await Promise.all([
    revalidateTagCache("products"),
    revalidateTagCache("productMetadata"),
    revalidateTagCache("categorizedCardProducts"),
    revalidateTagCache("featuredProducts"),
    revalidateTagCache("popularProducts"),
  ]);
}

export async function applyWhatsNewSeoSuggestion(
  changeId: string,
  productId: string,
) {
  await requireSuperAdminAuth();
  const appliedBy = await getAppliedByMember();
  const result = await applyMonthlySeoSuggestion(
    changeId,
    productId,
    appliedBy,
  );
  await revalidateProductSeoTags();
  return result;
}

export async function applyAllWhatsNewSeoSuggestions(changeId: string) {
  await requireSuperAdminAuth();
  const appliedBy = await getAppliedByMember();
  const result = await applyAllMonthlySeoSuggestions(changeId, appliedBy);

  if (result.appliedCount > 0) {
    await revalidateProductSeoTags();
  }

  return result;
}
