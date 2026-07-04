import { getAdminConfigFlags } from "@/actions";
import {
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext,
} from "@/actions/auth-utils";
import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import i18next from "@/i18n/i18next";
import type {
  FakturowniaCostEvidence,
  FakturowniaCostMapping,
} from "@konfi/types";
import type { Metadata } from "next";
import { Suspense } from "react";
import FakturowniaCostsPage, {
  type FakturowniaCostReviewItem,
} from "./fakturownia-costs-page";

export const instant = false;

function serializeReviewItem(input: {
  evidence?: FakturowniaCostEvidence;
  mapping: FakturowniaCostMapping;
}): FakturowniaCostReviewItem {
  return {
    ...(input.evidence
      ? {
          evidence: {
            ...(input.evidence.conversion
              ? { conversion: input.evidence.conversion }
              : {}),
            currency: input.evidence.currency,
            id: input.evidence.id,
            invoice: input.evidence.invoice,
            ...(input.evidence.invoiceKind
              ? { invoiceKind: input.evidence.invoiceKind }
              : {}),
            name: input.evidence.name,
            position: input.evidence.position,
            ...(input.evidence.priceGross !== undefined
              ? { priceGross: input.evidence.priceGross }
              : {}),
            ...(input.evidence.priceNet !== undefined
              ? { priceNet: input.evidence.priceNet }
              : {}),
            quantity: input.evidence.quantity,
            ...(input.evidence.quantityUnit
              ? { quantityUnit: input.evidence.quantityUnit }
              : {}),
            supplier: input.evidence.supplier,
            ...(input.evidence.totalPriceGross !== undefined
              ? { totalPriceGross: input.evidence.totalPriceGross }
              : {}),
            ...(input.evidence.totalPriceNet !== undefined
              ? { totalPriceNet: input.evidence.totalPriceNet }
              : {}),
            ...(input.evidence.unitCostGross !== undefined
              ? { unitCostGross: input.evidence.unitCostGross }
              : {}),
            ...(input.evidence.unitCostNet !== undefined
              ? { unitCostNet: input.evidence.unitCostNet }
              : {}),
          },
        }
      : {}),
    mapping: {
      aliases: input.mapping.aliases,
      ...(input.mapping.attributeId
        ? { attributeId: input.mapping.attributeId }
        : {}),
      ...(input.mapping.attributeName
        ? { attributeName: input.mapping.attributeName }
        : {}),
      ...(input.mapping.combinationId
        ? { combinationId: input.mapping.combinationId }
        : {}),
      confidence: input.mapping.confidence,
      id: input.mapping.id,
      name: input.mapping.name,
      ...(input.mapping.optionLabel
        ? { optionLabel: input.mapping.optionLabel }
        : {}),
      ...(input.mapping.optionValue
        ? { optionValue: input.mapping.optionValue }
        : {}),
      ...(input.mapping.productId
        ? { productId: input.mapping.productId }
        : {}),
      ...(input.mapping.productIds
        ? { productIds: input.mapping.productIds }
        : {}),
      ...(input.mapping.productLinks
        ? { productLinks: input.mapping.productLinks }
        : {}),
      ...(input.mapping.productName
        ? { productName: input.mapping.productName }
        : {}),
      ...(input.mapping.reasoning
        ? { reasoning: input.mapping.reasoning }
        : {}),
      sourceSignals: input.mapping.sourceSignals,
      ...(input.mapping.supplierId
        ? { supplierId: input.mapping.supplierId }
        : {}),
      ...(input.mapping.supplierName
        ? { supplierName: input.mapping.supplierName }
        : {}),
      ...(input.mapping.packaging
        ? { packaging: input.mapping.packaging }
        : {}),
      ...(input.mapping.reference
        ? { reference: input.mapping.reference }
        : {}),
    },
  };
}

export default function Page() {
  return (
    <Suspense fallback={<AdminLoadingSkeleton variant="table" rows={8} />}>
      <FakturowniaCostsPageContent />
    </Suspense>
  );
}

async function FakturowniaCostsPageContent() {
  const flags = await getAdminConfigFlags();
  const authContext = await requireTenantAdminAuthContext();
  const tenantId = getTenantAdminScopeTenantId(authContext.tenantContext);
  const {
    getFakturowniaCostSyncState,
    listFakturowniaCostMappingSelectorProducts,
    listFakturowniaCostReviewData,
  } = await import("@/lib/fakturownia/cost-intelligence");
  const tenantArg = tenantId ? { tenantId } : {};
  const [reviewData, selectorProducts, syncState] = await Promise.all([
    listFakturowniaCostReviewData(tenantArg),
    listFakturowniaCostMappingSelectorProducts(tenantArg),
    getFakturowniaCostSyncState(tenantArg),
  ]);

  return (
    <FakturowniaCostsPage
      approved={reviewData.approved.map(serializeReviewItem)}
      hasFakturowniaIntegration={flags.fakturowniaApiKeyProvided}
      {...(syncState?.lastSyncedAt
        ? { lastSyncedAt: syncState.lastSyncedAt }
        : {})}
      {...(syncState?.result ? { lastSyncResult: syncState.result } : {})}
      pending={reviewData.pending.map(serializeReviewItem)}
      selectorProducts={selectorProducts}
    />
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lng: string }>;
}): Promise<Metadata> {
  const { lng } = await params;
  const t = i18next.getFixedT(lng, ["fakturownia", "translation"]);
  return {
    title: t("fakturownia.costs.title", {
      defaultValue: "Cost intelligence",
    }),
  };
}
