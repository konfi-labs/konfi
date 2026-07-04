import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import type { FakturowniaMaterialGroup } from "@konfi/types";
import { FieldValue } from "firebase-admin/firestore";
import { getApprovedAttributeOptionCosts } from "./cost-intelligence";
import type { ApprovedFakturowniaCostEntry } from "@konfi/types";

// ---------------------------------------------------------------------------
// Material-group suggestion clustering
// ---------------------------------------------------------------------------

export interface MaterialGroupSuggestion {
  suggestedName: string;
  attributeIds: string[];
  attributeNames: string[];
  sharedValueCount: number;
  sampleSharedValues: string[];
  materialLike: boolean;
}

const MATERIAL_KEYWORD_RE =
  /papier|laminat|folia|material|materiał|karton|tektura|winyl|vinyl/i;

/** Strip Polish/Latin diacritics and lowercase for name-normalisation. */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Union-Find with path compression and union-by-rank for O(α·n) clustering.
 */
class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]);
    }
    return this.parent[x];
  }

  union(x: number, y: number): void {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    if (this.rank[px] < this.rank[py]) {
      this.parent[px] = py;
    } else if (this.rank[px] > this.rank[py]) {
      this.parent[py] = px;
    } else {
      this.parent[py] = px;
      this.rank[px]++;
    }
  }
}

/**
 * Pure clustering helper: groups attributes that share ≥ 2 option values OR
 * have the same normalised name. Returns up to 25 suggestions, sorted by
 * materialLike (desc) then sharedValueCount (desc).
 */
export function buildMaterialGroupSuggestions(
  attributes: Array<{
    id: string;
    name: string;
    options: Array<{ value: string }>;
    materialLike?: boolean;
  }>,
  excludeAttributeIds: ReadonlySet<string>,
): MaterialGroupSuggestion[] {
  // Filter out already-grouped attributes
  const candidates = attributes.filter((a) => !excludeAttributeIds.has(a.id));
  const n = candidates.length;
  if (n < 2) return [];

  const uf = new UnionFind(n);

  // --- link by normalised name ---
  const nameToIndices = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const key = normaliseName(candidates[i].name);
    const existing = nameToIndices.get(key);
    if (existing) {
      existing.push(i);
    } else {
      nameToIndices.set(key, [i]);
    }
  }
  for (const indices of nameToIndices.values()) {
    if (indices.length >= 2) {
      for (let k = 1; k < indices.length; k++) {
        uf.union(indices[0], indices[k]);
      }
    }
  }

  // --- link by shared option values (≥ 2 shared values per pair) ---
  // Build inverted index: value -> list of attribute indices
  const valueToIndices = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    for (const opt of candidates[i].options) {
      const v = opt.value.trim();
      if (!v) continue;
      const list = valueToIndices.get(v);
      if (list) {
        list.push(i);
      } else {
        valueToIndices.set(v, [i]);
      }
    }
  }
  // Count shared values per pair via a temporary map
  const pairSharedCount = new Map<string, number>();
  for (const indices of valueToIndices.values()) {
    if (indices.length < 2) continue;
    for (let a = 0; a < indices.length; a++) {
      for (let b = a + 1; b < indices.length; b++) {
        const key = `${indices[a]},${indices[b]}`;
        pairSharedCount.set(key, (pairSharedCount.get(key) ?? 0) + 1);
      }
    }
  }
  for (const [key, count] of pairSharedCount) {
    if (count >= 2) {
      const [a, b] = key.split(",").map(Number);
      uf.union(a, b);
    }
  }

  // --- collect clusters with ≥ 2 members ---
  const clusterMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    const list = clusterMap.get(root);
    if (list) {
      list.push(i);
    } else {
      clusterMap.set(root, [i]);
    }
  }

  const suggestions: MaterialGroupSuggestion[] = [];

  for (const indices of clusterMap.values()) {
    if (indices.length < 2) continue;

    const clusterAttrs = indices.map((i) => candidates[i]);

    // Compute shared option values: values that appear in ≥ 2 cluster attrs
    const valueAttrCount = new Map<string, number>();
    for (const attr of clusterAttrs) {
      const seen = new Set<string>();
      for (const opt of attr.options) {
        const v = opt.value.trim();
        if (v && !seen.has(v)) {
          seen.add(v);
          valueAttrCount.set(v, (valueAttrCount.get(v) ?? 0) + 1);
        }
      }
    }
    const sharedValues = Array.from(valueAttrCount.entries())
      .filter(([, count]) => count >= 2)
      .map(([v]) => v);

    // Suggested name: most frequent attribute name (tie -> alphabetical first)
    const nameFreq = new Map<string, number>();
    for (const attr of clusterAttrs) {
      nameFreq.set(attr.name, (nameFreq.get(attr.name) ?? 0) + 1);
    }
    const sortedNames = Array.from(nameFreq.entries()).sort(
      ([na, fa], [nb, fb]) => fb - fa || na.localeCompare(nb),
    );
    const suggestedName = sortedNames[0][0];

    // materialLike
    const materialLike = clusterAttrs.some(
      (a) => (a.materialLike ?? false) || MATERIAL_KEYWORD_RE.test(a.name),
    );

    suggestions.push({
      suggestedName,
      attributeIds: clusterAttrs.map((a) => a.id),
      attributeNames: clusterAttrs.map((a) => a.name),
      sharedValueCount: sharedValues.length,
      sampleSharedValues: sharedValues.slice(0, 6),
      materialLike,
    });
  }

  // Sort: materialLike desc, sharedValueCount desc; cap at 25
  suggestions.sort(
    (a, b) =>
      Number(b.materialLike) - Number(a.materialLike) ||
      b.sharedValueCount - a.sharedValueCount,
  );

  return suggestions.slice(0, 25);
}

export const FAKTUROWNIA_MATERIAL_GROUPS_COLLECTION =
  "fakturowniaMaterialGroups";

function firestore() {
  return getAdminDb();
}

function tenantMatches(
  data: { tenantId?: string | null } | undefined,
  tenantId?: string,
): boolean {
  return !tenantId || data?.tenantId === tenantId;
}

function asMaterialGroup(
  data: FirebaseFirestore.DocumentData | undefined,
  id: string,
): FakturowniaMaterialGroup | undefined {
  if (!data) {
    return undefined;
  }
  return { ...(data as FakturowniaMaterialGroup), id };
}

// ---------------------------------------------------------------------------
// Attribute loader for suggestions
// ---------------------------------------------------------------------------

export interface AttributeForSuggestion {
  id: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  materialLike: boolean;
}

/**
 * Loads active attributes (with their options) for use in
 * `buildMaterialGroupSuggestions`. Scoped to the tenant when provided.
 * materialLike is derived from the attribute name matching a keyword list
 * (the Attribute type does not carry that field natively).
 */
export async function listAttributesForGroupSuggestions(input: {
  tenantId?: string;
}): Promise<AttributeForSuggestion[]> {
  const db = firestore();
  let query = db.collection("attributes").where("active", "==", true);
  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }
  const snapshot = await query.limit(300).get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const name: string = data.name ?? "";
    return {
      id: doc.id,
      name,
      options: Array.isArray(data.options)
        ? (data.options as Array<{ value: string; label?: string }>)
            .filter((o) => typeof o.value === "string")
            .map((o) => ({ value: o.value, label: o.label ?? o.value }))
        : [],
      materialLike: MATERIAL_KEYWORD_RE.test(name),
    };
  });
}

/**
 * Lists all active material groups, optionally scoped to a tenant.
 * When `tenantId` is undefined (dedicated mode) all groups are returned.
 */
export async function listFakturowniaMaterialGroups(input: {
  tenantId?: string;
}): Promise<FakturowniaMaterialGroup[]> {
  // active == true (not != false) so the tenant-scoped query stays on
  // single-field auto-indexes — an inequality + equality would need a composite
  // index. Writes always set active: true; soft-delete sets active: false.
  let query = firestore()
    .collection(FAKTUROWNIA_MATERIAL_GROUPS_COLLECTION)
    .where("active", "==", true) as FirebaseFirestore.Query;

  if (input.tenantId) {
    query = query.where("tenantId", "==", input.tenantId);
  }

  const snapshot = await query.get();

  return snapshot.docs.flatMap((doc) => {
    const group = asMaterialGroup(doc.data(), doc.id);
    if (!group || !tenantMatches(group, input.tenantId)) {
      return [];
    }
    return [group];
  });
}

/**
 * Given a single (attributeId, optionValue) pair, returns the expanded set of
 * attributeIds and optionValues that belong to the same material group.
 *
 * - If no group covers the attributeId, returns the original pair unchanged.
 * - Canonical value: `group.valueAliases?.[optionValue] ?? optionValue`.
 * - optionValues: the canonical value + every alias key that maps to it.
 */
export function resolveMaterialGroupScope(
  groups: FakturowniaMaterialGroup[],
  attributeId: string,
  optionValue: string,
): { attributeIds: string[]; optionValues: string[] } {
  const group = groups.find((g) => g.attributeIds.includes(attributeId));

  if (!group) {
    return { attributeIds: [attributeId], optionValues: [optionValue] };
  }

  const canonical = group.valueAliases?.[optionValue] ?? optionValue;

  // Collect all alias keys that resolve to the same canonical value
  const variantKeys = group.valueAliases
    ? Object.entries(group.valueAliases)
        .filter(([, v]) => v === canonical)
        .map(([k]) => k)
    : [];

  const optionValues = Array.from(new Set([canonical, ...variantKeys]));

  return { attributeIds: group.attributeIds, optionValues };
}

/**
 * Fetches all approved cost entries for the given cross-product of attributeIds
 * × optionValues, merging results and deduplicating by evidenceId.
 * Groups are small so the O(n×m) call fan-out is intentionally unbounded but
 * practically tiny (≤ a few dozen combinations).
 */
export async function getApprovedMaterialGroupCosts(input: {
  attributeIds: string[];
  optionValues: string[];
  tenantId?: string;
}): Promise<ApprovedFakturowniaCostEntry[]> {
  const byEvidenceId = new Map<string, ApprovedFakturowniaCostEntry>();

  await Promise.all(
    input.attributeIds.flatMap((attributeId) =>
      input.optionValues.map(async (optionValue) => {
        const entries = await getApprovedAttributeOptionCosts({
          attributeId,
          optionValue,
          ...(input.tenantId ? { tenantId: input.tenantId } : {}),
          limit: 100,
        });
        for (const entry of entries) {
          if (!byEvidenceId.has(entry.evidenceId)) {
            byEvidenceId.set(entry.evidenceId, entry);
          }
        }
      }),
    ),
  );

  return Array.from(byEvidenceId.values());
}

/**
 * Writes or updates a material group document.
 * When `id` is provided, merges into an existing doc; otherwise creates a new one.
 */
export async function writeFakturowniaMaterialGroup(input: {
  id?: string;
  name: string;
  attributeIds: string[];
  valueAliases?: Record<string, string>;
  tenantId?: string;
  member: { id: string; name: string };
}): Promise<string> {
  const db = firestore();
  const coll = db.collection(FAKTUROWNIA_MATERIAL_GROUPS_COLLECTION);

  if (input.id) {
    // Update path. Use update() (not set+merge) so valueAliases/attributeIds are
    // REPLACED wholesale — merge:true deep-merges maps, which would leave removed
    // aliases (or removed attributes) behind. FieldValue.delete() drops the
    // aliases field entirely when none remain.
    const ref = coll.doc(input.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new Error("Material group not found.");
    }
    const existing = asMaterialGroup(snapshot.data(), input.id);
    if (!tenantMatches(existing, input.tenantId)) {
      throw new Error("Material group is outside the active tenant.");
    }
    await ref.update({
      name: input.name,
      attributeIds: input.attributeIds,
      valueAliases:
        input.valueAliases && Object.keys(input.valueAliases).length > 0
          ? input.valueAliases
          : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.member,
    });
    return input.id;
  }

  // Create path — let Firestore generate the id
  const ref = coll.doc();
  const id = ref.id;
  await ref.set({
    id,
    name: input.name,
    attributeIds: input.attributeIds,
    ...(input.valueAliases !== undefined
      ? { valueAliases: input.valueAliases }
      : {}),
    active: true,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: input.member,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.member,
    ...(input.tenantId ? { tenantId: input.tenantId } : {}),
  });
  return id;
}

/**
 * Soft-deletes a material group by setting `active: false`.
 * Matches the codebase convention used by other small config entities.
 */
export async function softDeleteFakturowniaMaterialGroup(input: {
  id: string;
  member: { id: string; name: string };
  tenantId?: string;
}): Promise<void> {
  const db = firestore();
  const ref = db
    .collection(FAKTUROWNIA_MATERIAL_GROUPS_COLLECTION)
    .doc(input.id);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error("Material group not found.");
  }
  const existing = asMaterialGroup(snapshot.data(), input.id);
  if (!tenantMatches(existing, input.tenantId)) {
    throw new Error("Material group is outside the active tenant.");
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
