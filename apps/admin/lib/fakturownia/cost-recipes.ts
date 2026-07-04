import "server-only";

import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/serverApp";
import type {
  FakturowniaCostRecipe,
  FakturowniaCostRecipeComponent,
} from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";

export const FAKTUROWNIA_COST_RECIPES_COLLECTION = "fakturowniaCostRecipes";

const MAX_COMPONENTS = 10;

function firestore() {
  return getAdminDb();
}

function tenantMatches(
  data: { tenantId?: string | null } | undefined,
  tenantId?: string,
): boolean {
  return !tenantId || data?.tenantId === tenantId;
}

function asCostRecipe(
  data: FirebaseFirestore.DocumentData | undefined,
  id: string,
): FakturowniaCostRecipe | undefined {
  if (!data) {
    return undefined;
  }
  return { ...(data as FakturowniaCostRecipe), id };
}

function requiredString(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function normalizeFactor(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Recipe component factor must be a positive number.");
  }
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function normalizeComponents(input: {
  components: FakturowniaCostRecipeComponent[];
  targetAttributeId: string;
  targetOptionValue: string;
}): FakturowniaCostRecipeComponent[] {
  if (input.components.length === 0) {
    throw new Error("At least one recipe component is required.");
  }
  if (input.components.length > MAX_COMPONENTS) {
    throw new Error(
      `A cost recipe cannot contain more than ${MAX_COMPONENTS} components.`,
    );
  }

  const seen = new Set<string>();
  return input.components.map((component, index) => {
    const attributeId = requiredString(
      component.attributeId,
      `Recipe component ${index + 1} attribute`,
    );
    const optionValue = requiredString(
      component.optionValue,
      `Recipe component ${index + 1} option`,
    );
    if (
      attributeId === input.targetAttributeId &&
      optionValue === input.targetOptionValue
    ) {
      throw new Error(
        "A recipe component cannot be the same as the target option.",
      );
    }
    const key = `${attributeId}:${optionValue}`;
    if (seen.has(key)) {
      throw new Error("Duplicate recipe components are not allowed.");
    }
    seen.add(key);
    const factor = normalizeFactor(component.factor);
    return {
      attributeId,
      optionValue,
      ...(factor !== 1 ? { factor } : {}),
    };
  });
}

export function buildFakturowniaCostRecipeId(input: {
  targetAttributeId: string;
  targetOptionValue: string;
  tenantId?: string;
}): string {
  const hash = createHash("sha1")
    .update(
      JSON.stringify([
        input.tenantId ?? "",
        input.targetAttributeId.trim(),
        input.targetOptionValue.trim(),
      ]),
    )
    .digest("hex");
  return `recipe-${hash}`;
}

export function normalizeFakturowniaCostRecipeInput(input: {
  name: string;
  targetAttributeId: string;
  targetOptionValue: string;
  components: FakturowniaCostRecipeComponent[];
}) {
  const name = requiredString(input.name, "Recipe name");
  const targetAttributeId = requiredString(
    input.targetAttributeId,
    "Recipe target attribute",
  );
  const targetOptionValue = requiredString(
    input.targetOptionValue,
    "Recipe target option",
  );
  const components = normalizeComponents({
    components: input.components,
    targetAttributeId,
    targetOptionValue,
  });

  return {
    name,
    targetAttributeId,
    targetOptionValue,
    components,
  };
}

export async function listFakturowniaCostRecipes(input: {
  targetKeys?: string[];
  tenantId?: string;
}): Promise<FakturowniaCostRecipe[]> {
  let query = firestore()
    .collection(FAKTUROWNIA_COST_RECIPES_COLLECTION)
    .where("active", "==", true) as FirebaseFirestore.Query;

  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }

  const targetKeys =
    input.targetKeys && input.targetKeys.length > 0
      ? new Set(input.targetKeys)
      : undefined;
  const snapshot = await query.limit(500).get();

  return snapshot.docs.flatMap((doc) => {
    const recipe = asCostRecipe(doc.data(), doc.id);
    if (!recipe || !tenantMatches(recipe, input.tenantId)) {
      return [];
    }
    if (
      targetKeys &&
      !targetKeys.has(`${recipe.targetAttributeId}:${recipe.targetOptionValue}`)
    ) {
      return [];
    }
    return [recipe];
  });
}

export async function writeFakturowniaCostRecipe(input: {
  id?: string;
  name: string;
  targetAttributeId: string;
  targetOptionValue: string;
  components: FakturowniaCostRecipeComponent[];
  tenantId?: string;
  member: { id: string; name: string };
}): Promise<string> {
  const normalized = normalizeFakturowniaCostRecipeInput(input);
  const db = firestore();
  const collection = db.collection(FAKTUROWNIA_COST_RECIPES_COLLECTION);
  const id = buildFakturowniaCostRecipeId({
    targetAttributeId: normalized.targetAttributeId,
    targetOptionValue: normalized.targetOptionValue,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });

  if (input.id && input.id !== id) {
    const oldRef = collection.doc(input.id);
    const oldSnapshot = await oldRef.get();
    if (oldSnapshot.exists) {
      const oldRecipe = asCostRecipe(oldSnapshot.data(), input.id);
      if (!tenantMatches(oldRecipe, input.tenantId)) {
        throw new Error("Cost recipe is outside the active tenant.");
      }
      await oldRef.set(
        {
          active: false,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: input.member,
        },
        { merge: true },
      );
    }
  }

  const ref = collection.doc(id);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    const existing = asCostRecipe(snapshot.data(), id);
    if (!tenantMatches(existing, input.tenantId)) {
      throw new Error("Cost recipe is outside the active tenant.");
    }
  }

  await ref.set(
    {
      id,
      active: true,
      name: normalized.name,
      targetAttributeId: normalized.targetAttributeId,
      targetOptionValue: normalized.targetOptionValue,
      components: normalized.components,
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      ...(snapshot.exists ? {} : { createdBy: input.member }),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.member,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
    { merge: true },
  );

  return id;
}

export async function softDeleteFakturowniaCostRecipe(input: {
  id: string;
  member: { id: string; name: string };
  tenantId?: string;
}): Promise<void> {
  const db = firestore();
  const ref = db.collection(FAKTUROWNIA_COST_RECIPES_COLLECTION).doc(input.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error("Cost recipe not found.");
  }
  const recipe = asCostRecipe(snapshot.data(), input.id);
  if (!tenantMatches(recipe, input.tenantId)) {
    throw new Error("Cost recipe is outside the active tenant.");
  }
  await ref.set(
    {
      active: false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.member,
    },
    { merge: true },
  );
}
