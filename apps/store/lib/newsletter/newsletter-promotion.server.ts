import "server-only";

import { sendEmail } from "@/lib/email";
import {
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import { NewsletterPromotion } from "@konfi/emails";
import { requireTenantContextTenantId, withTenantId } from "@konfi/firebase";
import {
  ApplicationMethodAllocationEnum,
  ApplicationMethodTargetTypeEnum,
  ApplicationMethodTypeEnum,
  Promotion,
  PromotionRuleAttributeEnum,
  PromotionRuleOperatorEnum,
  PromotionTypeEnum,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import { randomBytes } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";

const NEWSLETTER_PROMOTION_PREFIX = "N-";
const NEWSLETTER_PROMOTION_CODE_LENGTH = 6;
const NEWSLETTER_PROMOTION_DISCOUNT_VALUE = 10;
const NEWSLETTER_PROMOTION_CURRENCY = "PLN";
const PROMOTION_DELETE_CHUNK_SIZE = 10;
const PROMOTION_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shouldScopeByTenant(tenantContext: TenantContext) {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function withTenantOwned<T extends object>(
  data: T & { tenantId?: string },
  tenantContext: TenantContext,
  operationName: string,
): T & { tenantId?: string } {
  return shouldScopeByTenant(tenantContext)
    ? withTenantId(data, tenantContext, operationName)
    : data;
}

function createNewsletterPromotionCode(): string {
  const bytes = randomBytes(NEWSLETTER_PROMOTION_CODE_LENGTH);
  const suffix = Array.from(bytes, (byte) =>
    PROMOTION_CODE_ALPHABET.charAt(byte % PROMOTION_CODE_ALPHABET.length),
  ).join("");

  return `${NEWSLETTER_PROMOTION_PREFIX}${suffix}`;
}

function shouldDeletePromotionAfterCheckout(
  promotion: Pick<Promotion, "code" | "isOneTime">,
) {
  return Boolean(
    promotion.isOneTime ||
    promotion.code?.startsWith(NEWSLETTER_PROMOTION_PREFIX),
  );
}

function getPromotionDiscountLabel(promotion: Promotion): string {
  const value = promotion.applicationMethod?.value ?? 0;
  const type = promotion.applicationMethod?.type;

  return type === ApplicationMethodTypeEnum.FIXED
    ? `${value} ${promotion.applicationMethod?.currencyCode ?? ""}`.trim()
    : `${value}%`;
}

export async function createNewsletterPromotionForSubscriber(params: {
  email: string;
  userId: string;
}) {
  const firestore = getAdminDb();
  const tenantContext = await getTenantContextForRequest();
  const promotionRef = firestore.collection("promotions").doc();
  const promotion: Promotion = withTenantOwned(
    {
      id: promotionRef.id,
      code: createNewsletterPromotionCode(),
      type: PromotionTypeEnum.STANDARD,
      isAutomatic: false,
      isOneTime: true,
      rules: [
        {
          id: "",
          description: "Znizka dla uzytkownika",
          attribute: PromotionRuleAttributeEnum.USER,
          operator: PromotionRuleOperatorEnum.IN,
          values: [params.userId],
        },
      ],
      applicationMethod: {
        id: "",
        type: ApplicationMethodTypeEnum.PERCENTAGE,
        targetType: ApplicationMethodTargetTypeEnum.ITEMS,
        allocation: ApplicationMethodAllocationEnum.EACH,
        maxQuantity: 0,
        value: NEWSLETTER_PROMOTION_DISCOUNT_VALUE,
        currencyCode: NEWSLETTER_PROMOTION_CURRENCY,
        targetRules: [
          {
            id: "",
            description: "Znizka dla uzytkownika",
            attribute: PromotionRuleAttributeEnum.USER,
            operator: PromotionRuleOperatorEnum.IN,
            values: [params.userId],
          },
        ],
      },
      active: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    tenantContext,
    "newsletter promotion",
  );

  await promotionRef.set(promotion);

  const noReplyEmail = process.env.NO_REPLY_EMAIL?.trim();
  if (!noReplyEmail) {
    console.warn(
      "Skipping newsletter promotion email because NO_REPLY_EMAIL is not configured.",
    );
    return promotion;
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  await sendEmail({
    to: params.email,
    from: noReplyEmail,
    subject: "Kod rabatowy",
    template: NewsletterPromotion({
      code: promotion.code ?? "",
      discountLabel: getPromotionDiscountLabel(promotion),
      url: runtimeConfig?.storeBaseUrl,
    }),
  });

  return promotion;
}

export async function deleteAppliedOneTimePromotions(params: {
  appliedPromotionCodes: string[];
  tenantContext?: TenantContext;
}) {
  const uniqueCodes = [...new Set(params.appliedPromotionCodes)]
    .map((code) => code.trim())
    .filter(Boolean);

  if (uniqueCodes.length === 0) {
    return;
  }

  const firestore = getAdminDb();
  const tenantContext =
    params.tenantContext ?? (await getTenantContextForRequest());

  for (
    let index = 0;
    index < uniqueCodes.length;
    index += PROMOTION_DELETE_CHUNK_SIZE
  ) {
    const codeChunk = uniqueCodes.slice(
      index,
      index + PROMOTION_DELETE_CHUNK_SIZE,
    );
    let query = firestore
      .collection("promotions")
      .where("code", "in", codeChunk);

    if (shouldScopeByTenant(tenantContext)) {
      query = query.where(
        "tenantId",
        "==",
        requireTenantContextTenantId(
          tenantContext,
          "newsletter promotion cleanup",
        ),
      );
    }

    const promotionsSnapshot = await query.get();
    const deleteBatch = firestore.batch();
    let deleteCount = 0;

    for (const promotionDocument of promotionsSnapshot.docs) {
      const promotion = promotionDocument.data() as Promotion;
      if (!shouldDeletePromotionAfterCheckout(promotion)) {
        continue;
      }

      deleteBatch.delete(promotionDocument.ref);
      deleteCount += 1;
    }

    if (deleteCount > 0) {
      await deleteBatch.commit();
    }
  }
}
