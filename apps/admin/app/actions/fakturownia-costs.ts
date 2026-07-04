"use server";

import {
  getAuthenticatedAdminMember,
  getTenantAdminScopeTenantId,
  requireTenantAdminAuthContext,
} from "@/actions/auth-utils";
import { checkFakturowniaEnv } from "@/actions";
import {
  getCostInvoiceSupplierDraft,
  createManualFakturowniaCost,
  importSupplierFromCostInvoice,
  linkCostMappingSupplierByIdentity,
  setFakturowniaCostMappingPackaging,
  syncFakturowniaCostInvoices,
  unapproveFakturowniaCostMapping,
  updateFakturowniaCostMappingStatus,
} from "@/lib/fakturownia/cost-intelligence";
import type {
  CostInvoiceSupplierDraft,
  ImportSupplierFromCostResult,
  SyncFakturowniaCostInvoicesResult,
} from "@/lib/fakturownia/cost-intelligence";
import type {
  Address,
  FakturowniaCostPackaging,
  FakturowniaCostProductLink,
  FakturowniaCostRecipe,
  FakturowniaCostRecipeComponent,
  FakturowniaCostUnit,
} from "@konfi/types";
import { revalidatePath } from "next/cache";

export interface SyncFakturowniaCostInvoicesActionState {
  error?: string;
  ok: boolean;
  result?: SyncFakturowniaCostInvoicesResult;
}

function formString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formPositiveNumber(
  formData: FormData,
  key: string,
): number | undefined {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function validateDate(
  value: string | undefined,
  field: string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD format.`);
  }

  return value;
}

function formCostUnit(
  formData: FormData,
  key: string,
): FakturowniaCostUnit | undefined {
  const value = formString(formData, key);
  if (
    value === "piece" ||
    value === "area_m2" ||
    value === "sheet" ||
    value === "metre"
  ) {
    return value;
  }
  return undefined;
}

function formProductLinks(formData: FormData): FakturowniaCostProductLink[] {
  const raw = formString(formData, "productLinks");
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.flatMap((item): FakturowniaCostProductLink[] => {
          if (!item || typeof item !== "object") {
            return [];
          }
          const record = item as Record<string, unknown>;
          const productId =
            typeof record.productId === "string" ? record.productId.trim() : "";
          if (!productId) {
            return [];
          }
          const link: FakturowniaCostProductLink = { productId };
          if (
            typeof record.productName === "string" &&
            record.productName.trim()
          ) {
            link.productName = record.productName.trim();
          }
          if (
            typeof record.attributeId === "string" &&
            record.attributeId.trim()
          ) {
            link.attributeId = record.attributeId.trim();
          }
          if (
            typeof record.attributeName === "string" &&
            record.attributeName.trim()
          ) {
            link.attributeName = record.attributeName.trim();
          }
          if (
            typeof record.combinationId === "string" &&
            record.combinationId.trim()
          ) {
            link.combinationId = record.combinationId.trim();
          }
          if (
            typeof record.optionLabel === "string" &&
            record.optionLabel.trim()
          ) {
            link.optionLabel = record.optionLabel.trim();
          }
          if (
            typeof record.optionValue === "string" &&
            record.optionValue.trim()
          ) {
            link.optionValue = record.optionValue.trim();
          }
          return [link];
        });
      }
    } catch {
      throw new Error("Product links must be valid JSON.");
    }
  }

  const productId = formString(formData, "productId");
  if (!productId) {
    return [];
  }

  return [
    {
      productId,
      ...(formString(formData, "productName")
        ? { productName: formString(formData, "productName") }
        : {}),
      ...(formString(formData, "attributeId")
        ? { attributeId: formString(formData, "attributeId") }
        : {}),
      ...(formString(formData, "attributeName")
        ? { attributeName: formString(formData, "attributeName") }
        : {}),
      ...(formString(formData, "optionLabel")
        ? { optionLabel: formString(formData, "optionLabel") }
        : {}),
      ...(formString(formData, "optionValue")
        ? { optionValue: formString(formData, "optionValue") }
        : {}),
    },
  ];
}

function revalidateCostReviewPath(lng: string | undefined): void {
  revalidatePath(`/${lng ?? "pl"}/fakturownia/costs`);
}

async function getCostActionContext() {
  const [authContext, member] = await Promise.all([
    requireTenantAdminAuthContext(),
    getAuthenticatedAdminMember(),
  ]);

  return {
    member,
    tenantId: getTenantAdminScopeTenantId(authContext.tenantContext),
  };
}

export async function syncFakturowniaCostInvoicesAction(
  _prevState: SyncFakturowniaCostInvoicesActionState,
  formData: FormData,
): Promise<SyncFakturowniaCostInvoicesActionState> {
  try {
    await checkFakturowniaEnv();
    const { member, tenantId } = await getCostActionContext();
    const lng = formString(formData, "lng");
    const dateFrom = validateDate(formString(formData, "dateFrom"), "dateFrom");
    const dateTo = validateDate(formString(formData, "dateTo"), "dateTo");

    const result = await syncFakturowniaCostInvoices({
      createdBy: member,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(tenantId ? { tenantId } : {}),
    });

    revalidateCostReviewPath(lng);

    return { ok: true, result };
  } catch (error: unknown) {
    return {
      error: error instanceof Error ? error.message : "Sync failed.",
      ok: false,
    };
  }
}

export interface CreateManualCostActionState {
  error?: string;
  ok: boolean;
  mappingId?: string;
}

export async function createManualFakturowniaCostAction(
  _prevState: CreateManualCostActionState,
  formData: FormData,
): Promise<CreateManualCostActionState> {
  try {
    const name = formString(formData, "name");
    if (!name) {
      throw new Error("Cost name is required.");
    }

    const unitCostNet = formPositiveNumber(formData, "unitCostNet");
    if (!unitCostNet) {
      throw new Error("Net unit cost is required.");
    }

    const unit = formCostUnit(formData, "unit");
    if (!unit) {
      throw new Error("Cost unit is required.");
    }

    const { member, tenantId } = await getCostActionContext();
    const lng = formString(formData, "lng");
    const productId = formString(formData, "productId");
    const productName = formString(formData, "productName");
    const productLinks = formProductLinks(formData);
    const attributeId = formString(formData, "attributeId");
    const attributeName = formString(formData, "attributeName");
    const optionLabel = formString(formData, "optionLabel");
    const optionValue = formString(formData, "optionValue");
    const issueDate = validateDate(
      formString(formData, "issueDate"),
      "issueDate",
    );
    const sheetWidthMm = formPositiveNumber(formData, "sheetWidthMm");
    const sheetHeightMm = formPositiveNumber(formData, "sheetHeightMm");
    const thicknessMicron = formPositiveNumber(formData, "thicknessMicron");

    const packaging: FakturowniaCostPackaging = {
      manual: true,
      ...(sheetWidthMm ? { sheetWidthMm } : {}),
      ...(sheetHeightMm ? { sheetHeightMm } : {}),
      ...(thicknessMicron ? { thicknessMicron } : {}),
    };

    const result = await createManualFakturowniaCost({
      ...(attributeId ? { attributeId } : {}),
      ...(attributeName ? { attributeName } : {}),
      ...(issueDate ? { issueDate } : {}),
      member,
      name,
      ...(optionLabel ? { optionLabel } : {}),
      ...(optionValue ? { optionValue } : {}),
      packaging,
      ...(productLinks.length > 0 ? { productLinks } : {}),
      ...(productId ? { productId } : {}),
      ...(productName ? { productName } : {}),
      ...(formString(formData, "supplierName")
        ? { supplierName: formString(formData, "supplierName") }
        : {}),
      ...(tenantId ? { tenantId } : {}),
      unit,
      unitCostNet,
    });

    revalidateCostReviewPath(lng);
    return { ok: true, mappingId: result.mappingId };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to create manual cost.",
      ok: false,
    };
  }
}

export async function approveFakturowniaCostMappingAction(
  formData: FormData,
): Promise<void> {
  const mappingId = formString(formData, "mappingId");
  if (!mappingId) {
    throw new Error("Cost mapping ID is required.");
  }

  const { member, tenantId } = await getCostActionContext();
  const attributeId = formString(formData, "attributeId");
  const attributeName = formString(formData, "attributeName");
  const optionLabel = formString(formData, "optionLabel");
  const optionValue = formString(formData, "optionValue");
  const productId = formString(formData, "productId");
  const productName = formString(formData, "productName");
  const productLinks = formProductLinks(formData);
  await updateFakturowniaCostMappingStatus({
    ...(attributeId ? { attributeId } : {}),
    ...(attributeName ? { attributeName } : {}),
    mappingId,
    member,
    ...(optionLabel ? { optionLabel } : {}),
    ...(optionValue ? { optionValue } : {}),
    ...(productLinks.length > 0 ? { productLinks } : {}),
    ...(productId ? { productId } : {}),
    ...(productName ? { productName } : {}),
    status: "approved",
    ...(tenantId ? { tenantId } : {}),
  });
  revalidateCostReviewPath(formString(formData, "lng"));
}

function collectMappingIds(formData: FormData): string[] {
  const ids = new Set<string>();
  for (const value of formData.getAll("mappingId")) {
    if (typeof value !== "string") {
      continue;
    }
    for (const part of value.split(",")) {
      const trimmed = part.trim();
      if (trimmed) {
        ids.add(trimmed);
      }
    }
  }
  return [...ids];
}

export async function bulkApproveFakturowniaCostMappingsAction(
  formData: FormData,
): Promise<void> {
  const mappingIds = collectMappingIds(formData);
  if (mappingIds.length === 0) {
    return;
  }

  const { member, tenantId } = await getCostActionContext();
  const results = await Promise.allSettled(
    mappingIds.map((mappingId) =>
      updateFakturowniaCostMappingStatus({
        mappingId,
        member,
        status: "approved",
        ...(tenantId ? { tenantId } : {}),
      }),
    ),
  );

  const failed = results.filter(
    (result) => result.status === "rejected",
  ).length;
  if (failed > 0) {
    console.error(
      `[bulkApproveFakturowniaCostMappingsAction] ${failed} of ${mappingIds.length} approvals failed.`,
    );
  }

  revalidateCostReviewPath(formString(formData, "lng"));
}

export async function rejectFakturowniaCostMappingAction(
  formData: FormData,
): Promise<void> {
  const mappingId = formString(formData, "mappingId");
  if (!mappingId) {
    throw new Error("Cost mapping ID is required.");
  }

  const { member, tenantId } = await getCostActionContext();
  await updateFakturowniaCostMappingStatus({
    mappingId,
    member,
    status: "rejected",
    ...(tenantId ? { tenantId } : {}),
  });
  revalidateCostReviewPath(formString(formData, "lng"));
}

export async function saveCostAsReferenceFromCostMappingAction(
  formData: FormData,
): Promise<void> {
  const mappingId = formString(formData, "mappingId");
  if (!mappingId) {
    throw new Error("Cost mapping ID is required.");
  }

  const { member, tenantId } = await getCostActionContext();
  await updateFakturowniaCostMappingStatus({
    mappingId,
    member,
    reference: true,
    status: "approved",
    ...(tenantId ? { tenantId } : {}),
  });
  revalidateCostReviewPath(formString(formData, "lng"));
}

export interface ImportSupplierActionState {
  created?: boolean;
  error?: string;
  ok: boolean;
  supplierName?: string;
}

export async function importSupplierFromCostInvoiceAction(
  _prevState: ImportSupplierActionState,
  formData: FormData,
): Promise<ImportSupplierActionState> {
  try {
    const evidenceId = formString(formData, "evidenceId");
    if (!evidenceId) {
      throw new Error("Cost evidence ID is required.");
    }

    const { member, tenantId } = await getCostActionContext();
    const mappingId = formString(formData, "mappingId");
    const result: ImportSupplierFromCostResult =
      await importSupplierFromCostInvoice({
        evidenceId,
        ...(mappingId ? { mappingId } : {}),
        member,
        ...(tenantId ? { tenantId } : {}),
      });

    revalidateCostReviewPath(formString(formData, "lng"));

    return {
      created: result.created,
      ok: true,
      supplierName: result.supplierName,
    };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to import supplier.",
      ok: false,
    };
  }
}

export interface CostSupplierDraftState {
  ok: boolean;
  error?: string;
  draft?: {
    name?: string;
    companyName?: string;
    nip?: string;
    email?: string;
    phone?: string;
    currency?: string;
    addresses: Address[];
  };
  alreadyExists?: { id: string; name: string };
}

export async function getCostInvoiceSupplierDraftAction(input: {
  evidenceId: string;
}): Promise<CostSupplierDraftState> {
  try {
    const { tenantId } = await getCostActionContext();
    const draft: CostInvoiceSupplierDraft = await getCostInvoiceSupplierDraft({
      evidenceId: input.evidenceId,
      ...(tenantId ? { tenantId } : {}),
    });
    const { existingSupplier, ...rest } = draft;
    return {
      ok: true,
      draft: rest,
      ...(existingSupplier ? { alreadyExists: existingSupplier } : {}),
    };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to load supplier draft.",
      ok: false,
    };
  }
}

export async function linkCostMappingSupplierAction(input: {
  mappingId: string;
  name?: string;
  nip?: string;
  lng?: string;
}): Promise<{
  ok: boolean;
  linked?: boolean;
  supplierName?: string;
  error?: string;
}> {
  try {
    const { member, tenantId } = await getCostActionContext();
    const result = await linkCostMappingSupplierByIdentity({
      mappingId: input.mappingId,
      ...(input.name ? { name: input.name } : {}),
      ...(input.nip ? { nip: input.nip } : {}),
      member,
      ...(tenantId ? { tenantId } : {}),
    });
    revalidateCostReviewPath(input.lng);
    return {
      ok: true,
      linked: result.linked,
      supplierName: result.supplierName,
    };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to link supplier.",
      ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Material-group CRUD
// ---------------------------------------------------------------------------

export interface MaterialGroupPlain {
  id: string;
  name: string;
  attributeIds: string[];
  valueAliases?: Record<string, string>;
}

function serializeMaterialGroup(
  group: import("@konfi/types").FakturowniaMaterialGroup,
): MaterialGroupPlain {
  // Strip Firestore Timestamps and nested member objects so the result is a
  // plain, client-serializable object.
  return {
    id: group.id,
    name: group.name,
    attributeIds: group.attributeIds,
    ...(group.valueAliases ? { valueAliases: group.valueAliases } : {}),
  };
}

export async function listMaterialGroupsAction(): Promise<{
  ok: boolean;
  groups?: MaterialGroupPlain[];
  error?: string;
}> {
  try {
    const { tenantId } = await getCostActionContext();
    const { listFakturowniaMaterialGroups } =
      await import("@/lib/fakturownia/material-groups");
    const groups = await listFakturowniaMaterialGroups(
      tenantId ? { tenantId } : {},
    );
    return { ok: true, groups: groups.map(serializeMaterialGroup) };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list material groups.",
    };
  }
}

export async function saveMaterialGroupAction(input: {
  id?: string;
  name: string;
  attributeIds: string[];
  valueAliases?: Record<string, string>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const name = input.name?.trim();
    if (!name) {
      return { ok: false, error: "Material group name is required." };
    }
    if (!Array.isArray(input.attributeIds) || input.attributeIds.length < 1) {
      return {
        ok: false,
        error: "At least one attribute ID is required.",
      };
    }
    // Bound the live read fan-out (attributeIds × alias values per option lookup).
    if (input.attributeIds.length > 25) {
      return {
        ok: false,
        error: "A material group cannot contain more than 25 attributes.",
      };
    }
    if (input.valueAliases && Object.keys(input.valueAliases).length > 50) {
      return {
        ok: false,
        error: "A material group cannot contain more than 50 value aliases.",
      };
    }

    const { member, tenantId } = await getCostActionContext();
    const { writeFakturowniaMaterialGroup } =
      await import("@/lib/fakturownia/material-groups");
    const id = await writeFakturowniaMaterialGroup({
      ...(input.id ? { id: input.id } : {}),
      name,
      attributeIds: input.attributeIds,
      ...(input.valueAliases !== undefined
        ? { valueAliases: input.valueAliases }
        : {}),
      ...(tenantId ? { tenantId } : {}),
      member,
    });
    return { ok: true, id };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to save material group.",
    };
  }
}

export async function deleteMaterialGroupAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const id = input.id?.trim();
    if (!id) {
      return { ok: false, error: "Material group ID is required." };
    }

    const { member, tenantId } = await getCostActionContext();
    const { softDeleteFakturowniaMaterialGroup } =
      await import("@/lib/fakturownia/material-groups");
    await softDeleteFakturowniaMaterialGroup({
      id,
      member,
      ...(tenantId ? { tenantId } : {}),
    });
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete material group.",
    };
  }
}

// ---------------------------------------------------------------------------
// Cost recipe CRUD
// ---------------------------------------------------------------------------

export interface CostRecipePlain {
  id: string;
  name: string;
  targetAttributeId: string;
  targetOptionValue: string;
  components: FakturowniaCostRecipeComponent[];
}

function serializeCostRecipe(recipe: FakturowniaCostRecipe): CostRecipePlain {
  return {
    id: recipe.id,
    name: recipe.name,
    targetAttributeId: recipe.targetAttributeId,
    targetOptionValue: recipe.targetOptionValue,
    components: recipe.components.map((component) => ({
      attributeId: component.attributeId,
      optionValue: component.optionValue,
      ...(component.factor !== undefined ? { factor: component.factor } : {}),
    })),
  };
}

export async function listCostRecipesAction(): Promise<{
  ok: boolean;
  recipes?: CostRecipePlain[];
  error?: string;
}> {
  try {
    const { tenantId } = await getCostActionContext();
    const { listFakturowniaCostRecipes } =
      await import("@/lib/fakturownia/cost-recipes");
    const recipes = await listFakturowniaCostRecipes(
      tenantId ? { tenantId } : {},
    );
    return { ok: true, recipes: recipes.map(serializeCostRecipe) };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to list cost recipes.",
    };
  }
}

export async function saveCostRecipeAction(input: {
  id?: string;
  name: string;
  targetAttributeId: string;
  targetOptionValue: string;
  components: FakturowniaCostRecipeComponent[];
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const { member, tenantId } = await getCostActionContext();
    const { writeFakturowniaCostRecipe } =
      await import("@/lib/fakturownia/cost-recipes");
    const id = await writeFakturowniaCostRecipe({
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      targetAttributeId: input.targetAttributeId,
      targetOptionValue: input.targetOptionValue,
      components: input.components,
      ...(tenantId ? { tenantId } : {}),
      member,
    });
    return { ok: true, id };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Failed to save cost recipe.",
    };
  }
}

export async function deleteCostRecipeAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const id = input.id?.trim();
    if (!id) {
      return { ok: false, error: "Cost recipe ID is required." };
    }

    const { member, tenantId } = await getCostActionContext();
    const { softDeleteFakturowniaCostRecipe } =
      await import("@/lib/fakturownia/cost-recipes");
    await softDeleteFakturowniaCostRecipe({
      id,
      member,
      ...(tenantId ? { tenantId } : {}),
    });
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to delete cost recipe.",
    };
  }
}

export async function listCostRecipeCatalogAction(): Promise<{
  ok: boolean;
  attributes?: AttributeCatalogItem[];
  error?: string;
}> {
  try {
    const { tenantId } = await getCostActionContext();
    const { listAttributesForGroupSuggestions } =
      await import("@/lib/fakturownia/material-groups");
    const attributes = (
      await listAttributesForGroupSuggestions(tenantId ? { tenantId } : {})
    )
      .map((attribute) => ({
        id: attribute.id,
        name: attribute.name,
        options: attribute.options,
        optionCount: attribute.options.length,
        materialLike: attribute.materialLike,
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name));

    return { ok: true, attributes };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to load cost recipe catalog.",
    };
  }
}

// ---------------------------------------------------------------------------
// Material-group suggestions
// ---------------------------------------------------------------------------

export interface AttributeCatalogItem {
  id: string;
  name: string;
  optionCount: number;
  materialLike: boolean;
  options: Array<{ value: string; label: string }>;
}

export async function suggestMaterialGroupsAction(): Promise<{
  ok: boolean;
  attributes?: AttributeCatalogItem[];
  suggestions?: import("@/lib/fakturownia/material-groups").MaterialGroupSuggestion[];
  error?: string;
}> {
  try {
    const { tenantId } = await getCostActionContext();
    const {
      listAttributesForGroupSuggestions,
      buildMaterialGroupSuggestions,
      listFakturowniaMaterialGroups,
    } = await import("@/lib/fakturownia/material-groups");

    const [rawAttributes, existingGroups] = await Promise.all([
      listAttributesForGroupSuggestions(tenantId ? { tenantId } : {}),
      listFakturowniaMaterialGroups(tenantId ? { tenantId } : {}),
    ]);

    // Build exclude set from all already-grouped attribute IDs
    const excludeAttributeIds = new Set(
      existingGroups.flatMap((g) => g.attributeIds),
    );

    const suggestions = buildMaterialGroupSuggestions(
      rawAttributes,
      excludeAttributeIds,
    );

    // Plain catalog sorted by name (same-named attrs are adjacent)
    const attributes: AttributeCatalogItem[] = rawAttributes
      .map((a) => ({
        id: a.id,
        name: a.name,
        options: a.options,
        optionCount: a.options.length,
        materialLike: a.materialLike,
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name));

    return { ok: true, attributes, suggestions };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to compute material group suggestions.",
    };
  }
}

export async function removeApprovedFakturowniaCostMappingAction(
  formData: FormData,
): Promise<void> {
  const mappingId = formString(formData, "mappingId");
  if (!mappingId) {
    throw new Error("Cost mapping ID is required.");
  }

  const { member, tenantId } = await getCostActionContext();
  await unapproveFakturowniaCostMapping({
    mappingId,
    member,
    ...(tenantId ? { tenantId } : {}),
  });
  revalidateCostReviewPath(formString(formData, "lng"));
}

export async function saveFakturowniaCostMappingPackagingAction(
  formData: FormData,
): Promise<void> {
  const mappingId = formString(formData, "mappingId");
  if (!mappingId) {
    throw new Error("Cost mapping ID is required.");
  }

  const { member, tenantId } = await getCostActionContext();
  const basis = formString(formData, "costBasis");

  const rollWidthMm = formPositiveNumber(formData, "rollWidthMm");
  const rollLengthMm = formPositiveNumber(formData, "rollLengthMm");
  const sheetWidthMm = formPositiveNumber(formData, "sheetWidthMm");
  const sheetHeightMm = formPositiveNumber(formData, "sheetHeightMm");
  const sheetsPerPack = formPositiveNumber(formData, "sheetsPerPack");
  const thicknessMicron = formPositiveNumber(formData, "thicknessMicron");

  let packaging: FakturowniaCostPackaging | null;

  if (basis === "roll") {
    if (!rollWidthMm || !rollLengthMm) {
      throw new Error("Roll width and length are required for the roll basis.");
    }
    packaging = {
      purchaseUnit: "rolka",
      rollWidthMm,
      rollLengthM: rollLengthMm / 1000,
      manual: true,
      ...(thicknessMicron ? { thicknessMicron } : {}),
    };
  } else if (basis === "sheet") {
    if (!sheetWidthMm || !sheetHeightMm) {
      throw new Error(
        "Sheet width and height are required for the sheet basis.",
      );
    }
    packaging = {
      purchaseUnit: "ryza",
      sheetWidthMm,
      sheetHeightMm,
      ...(sheetsPerPack ? { sheetsPerPack } : {}),
      manual: true,
      ...(thicknessMicron ? { thicknessMicron } : {}),
    };
  } else if (basis === "area_m2") {
    packaging = { purchaseUnit: "m2", manual: true };
  } else if (basis === "metre") {
    packaging = { purchaseUnit: "mb", manual: true };
  } else if (basis === "piece") {
    packaging = { purchaseUnit: "szt", manual: true };
  } else {
    // "clear" or any unrecognised value clears packaging
    packaging = null;
  }

  await setFakturowniaCostMappingPackaging({
    mappingId,
    member,
    packaging,
    ...(tenantId ? { tenantId } : {}),
  });
  revalidateCostReviewPath(formString(formData, "lng"));
}
