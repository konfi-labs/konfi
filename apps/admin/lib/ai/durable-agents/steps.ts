import "server-only";

import { AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS } from "@/lib/ai/agent-harness";
import { resolveQuotePricingQuantities } from "@/lib/ai/quote-pricing";
import { createMeteredAdminGenerateText } from "@/lib/ai/metered-text";
import { formatTimestampLike } from "@/lib/ai/timestamps";
import {
  normalizeProductSearchQueries,
  rankProductSearchResults,
  scoreProductSearchMatch,
} from "@/lib/ai/product-search/product-discovery-ranking";
import { getAdminDb } from "@/lib/firebase/serverApp";
import { searchCustomersIndex } from "@konfi/meilisearch";
import { MODELS } from "@konfi/firebase";
import {
  type AgentTaskType,
  type AgentMemorySourceRun,
  Attribute,
  Customer,
  NestedCustomer,
  Order,
  Price,
  PriceTypeEnum,
  Product,
  ProductPrice,
  Settings,
  CurrencyEnum,
} from "@konfi/types";
import { calcPrice, DEFAULT_COMBINATION } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import {
  FieldValue,
  type CollectionReference,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import { z } from "zod";
import { sortCustomersByIds } from "@/lib/ai/durable-agents/sortCustomersByIds";
import type { AgentOrderItem, AgentRecentCustomerOrder } from "./types";
import {
  createAgentMemoryProposal,
  searchAgentMemories,
} from "@/lib/ai/agent-memory";
import {
  validateAgentMemoryPayload,
  type AgentMemoryPayloadInput,
} from "@konfi/utils";

export {
  normalizeProductSearchQueries,
  rankProductSearchResults,
  scoreProductSearchMatch,
};

// Helper to get Firestore instance (steps run outside workflow sandbox)
function getDb() {
  return getAdminDb();
}

async function getAiRuntime() {
  const runtime = await import("ai");

  return {
    ...runtime,
    generateText: createMeteredAdminGenerateText({
      generateText: runtime.generateText,
      model: MODELS.GEMINI_3_FLASH_LITE,
      provider: "google-vertex",
      source: "durable-agent",
    }),
  };
}

function removeUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    const cleaned: unknown[] = [];
    for (const item of value) {
      const next = removeUndefinedDeep(item);
      if (next !== undefined) {
        cleaned.push(next);
      }
    }
    return cleaned;
  }

  if (typeof value === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const next = removeUndefinedDeep(val);
      if (next !== undefined) {
        cleaned[key] = next;
      }
    }
    return cleaned;
  }

  return value;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

export const CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.9;
const CUSTOMER_SEARCH_CANDIDATE_POOL_LIMIT = 30;
const CUSTOMER_SEARCH_IN_QUERY_LIMIT = 10;
const CUSTOMER_SEARCH_MIN_TOKEN_LENGTH = 3;

export interface CustomerMatchDecision {
  autoSelect: boolean;
  confidence: number;
  rationale: string;
  selectedCustomerId: string | null;
}

export function normalizeCustomerMatchDecision({
  candidateIds,
  decision,
  minAutoSelectConfidence = CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD,
}: {
  candidateIds: readonly string[];
  decision: CustomerMatchDecision;
  minAutoSelectConfidence?: number;
}): CustomerMatchDecision {
  const knownCandidateIds = new Set(candidateIds);
  const selectedCustomerId =
    decision.selectedCustomerId &&
    knownCandidateIds.has(decision.selectedCustomerId)
      ? decision.selectedCustomerId
      : null;
  const confidence = Number.isFinite(decision.confidence)
    ? Math.min(Math.max(decision.confidence, 0), 1)
    : 0;

  return {
    autoSelect: Boolean(
      decision.autoSelect &&
      selectedCustomerId &&
      confidence >= minAutoSelectConfidence,
    ),
    confidence,
    rationale: decision.rationale.trim() || "No rationale provided",
    selectedCustomerId,
  };
}

function normalizeCustomerSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeCustomerSearchQuery(query: string): string[] {
  return Array.from(
    new Set(
      normalizeCustomerSearchText(query)
        .split(/[^a-z0-9@._+-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= CUSTOMER_SEARCH_MIN_TOKEN_LENGTH),
    ),
  );
}

export function buildCustomerSearchQueries(query: string): string[] {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const tokens = tokenizeCustomerSearchQuery(trimmedQuery);
  const reversedTokens = tokens.toReversed().join(" ");

  return Array.from(
    new Set(
      [
        trimmedQuery,
        reversedTokens &&
        reversedTokens !== normalizeCustomerSearchText(trimmedQuery)
          ? reversedTokens
          : undefined,
        ...tokens,
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  );
}

function customerSearchFields(customer: NestedCustomer): string[] {
  const contacts = customer.contacts ?? [];
  const addresses = customer.addresses ?? [];

  return [
    customer.id,
    customer.name,
    customer.personName,
    customer.email,
    customer.nip,
    ...contacts.flatMap((contact) => [
      contact.name,
      contact.email,
      contact.phone,
    ]),
    ...addresses.flatMap((address) => [
      address.name,
      address.companyName,
      address.nip,
      address.street,
      address.city,
      address.zip,
    ]),
  ]
    .map(normalizeCustomerSearchText)
    .filter(Boolean);
}

export function scoreCustomerSearchMatch(
  query: string,
  customer: NestedCustomer,
): number {
  const normalizedQuery = normalizeCustomerSearchText(query);
  const queryTokens = tokenizeCustomerSearchQuery(query);
  const fields = customerSearchFields(customer);

  if (!normalizedQuery || fields.length === 0) {
    return 0;
  }

  let score = 0;
  for (const field of fields) {
    if (field === normalizedQuery) {
      score += 100;
    } else if (field.includes(normalizedQuery)) {
      score += 60;
    }

    const fieldWords = new Set(field.split(/[^a-z0-9@._+-]+/).filter(Boolean));
    for (const token of queryTokens) {
      if (fieldWords.has(token)) {
        score += 20;
      } else if (field.includes(token)) {
        score += 10;
      }
    }
  }

  return score;
}

export function rankCustomerSearchResults(
  query: string,
  customers: readonly NestedCustomer[],
): NestedCustomer[] {
  return customers
    .map((customer, index) => ({
      customer,
      index,
      score: scoreCustomerSearchMatch(query, customer),
    }))
    .toSorted((left, right) => {
      const scoreDiff = right.score - left.score;
      return scoreDiff !== 0 ? scoreDiff : left.index - right.index;
    })
    .map(({ customer }) => customer);
}

interface PersistedAgentMessage {
  role: string;
  content: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPersistedAgentMessage(
  value: unknown,
): value is PersistedAgentMessage {
  return (
    isRecord(value) &&
    typeof value.role === "string" &&
    Object.hasOwn(value, "content")
  );
}

function cleanAgentMessages(
  messages: readonly unknown[],
): PersistedAgentMessage[] {
  return messages
    .map((message) => removeUndefinedDeep(message))
    .filter(isPersistedAgentMessage);
}

function getAgentMessageSignature(message: PersistedAgentMessage): string {
  try {
    return JSON.stringify(message);
  } catch {
    return `${message.role}:${String(message.content)}`;
  }
}

export function mergeAgentMessagesForPersistence(
  existingMessages: unknown,
  incomingMessages: readonly unknown[],
): PersistedAgentMessage[] {
  const merged: PersistedAgentMessage[] = [];
  const seen = new Set<string>();
  const existing = Array.isArray(existingMessages)
    ? existingMessages
        .map((message) => removeUndefinedDeep(message))
        .filter(isPersistedAgentMessage)
    : [];

  for (const message of [
    ...existing,
    ...cleanAgentMessages(incomingMessages),
  ]) {
    const signature = getAgentMessageSignature(message);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    merged.push(message);
  }

  return merged;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function customerSnapshotToNestedCustomer(
  snapshot: DocumentSnapshot<DocumentData>,
): NestedCustomer | null {
  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as Customer;
  if (data.active === false) {
    return null;
  }

  return {
    id: data.id || snapshot.id,
    name: data.name,
    email: data.email,
    personName: data.personName,
    nip: data.nip,
    b2b: data.b2b,
    addresses: data.addresses,
    contacts: data.contacts,
    discount: data.discount,
    specialNotes: data.specialNotes,
    allowedBankPayments: data.allowedBankPayments ?? false,
    allowedOnPickupPayments: data.allowedOnPickupPayments ?? false,
    allowedDefferedPayments: data.allowedDefferedPayments ?? false,
    linkedProductsIds: data.linkedProductsIds,
  } as NestedCustomer;
}

function addCustomerToMap(
  customersById: Map<string, NestedCustomer>,
  snapshot: DocumentSnapshot<DocumentData>,
  tenantId?: string,
) {
  if (tenantId && snapshot.data()?.tenantId !== tenantId) {
    return;
  }

  const customer = customerSnapshotToNestedCustomer(snapshot);
  if (!customer) {
    return;
  }

  customersById.set(snapshot.id, customer);
  customersById.set(customer.id, customer);
}

async function fetchCustomersByIds(
  customersRef: CollectionReference<DocumentData>,
  ids: readonly string[],
  tenantId?: string,
): Promise<NestedCustomer[]> {
  const uniqueIds = uniqueStrings(ids);
  if (uniqueIds.length === 0) {
    return [];
  }

  const customersById = new Map<string, NestedCustomer>();

  try {
    const snapshots = await customersRef.firestore.getAll(
      ...uniqueIds.map((id) => customersRef.doc(id)),
    );
    snapshots.forEach((snapshot) =>
      addCustomerToMap(customersById, snapshot, tenantId),
    );
  } catch (error) {
    console.warn("[searchCustomersStep] Failed to batch fetch customer docs", {
      error,
      ids: uniqueIds,
    });
  }

  await Promise.all(
    chunkArray(uniqueIds, CUSTOMER_SEARCH_IN_QUERY_LIMIT).map(async (chunk) => {
      try {
        let query = customersRef.where("id", "in", chunk);
        if (tenantId) {
          query = query.where("tenantId", "==", tenantId);
        }

        const snapshot = await query.get();
        snapshot.docs.forEach((doc) =>
          addCustomerToMap(customersById, doc, tenantId),
        );
      } catch (error) {
        console.warn(
          "[searchCustomersStep] Failed to fetch customers by id field",
          {
            error,
            ids: chunk,
          },
        );
      }
    }),
  );

  const seenIds = new Set<string>();
  return uniqueIds
    .map((id) => customersById.get(id))
    .filter((customer): customer is NestedCustomer => {
      if (!customer || seenIds.has(customer.id)) {
        return false;
      }
      seenIds.add(customer.id);
      return true;
    });
}

async function fetchCustomersByFirebaseFallback(
  customersRef: CollectionReference<DocumentData>,
  query: string,
  limit: number,
  tenantId?: string,
): Promise<NestedCustomer[]> {
  const customersById = new Map<string, NestedCustomer>();
  const normalizedQuery = normalizeCustomerSearchText(query);
  const tokens = tokenizeCustomerSearchQuery(query).slice(0, 5);
  const digitQuery = query.replace(/\D/g, "");

  const runQuery = async (
    field: string,
    operator: FirebaseFirestore.WhereFilterOp,
    value: string,
  ) => {
    if (!value) {
      return;
    }

    try {
      let firestoreQuery = customersRef.where(field, operator, value);
      if (tenantId) {
        firestoreQuery = firestoreQuery.where("tenantId", "==", tenantId);
      }

      const snapshot = await firestoreQuery.limit(limit).get();
      snapshot.docs.forEach((doc) =>
        addCustomerToMap(customersById, doc, tenantId),
      );
    } catch (error) {
      console.warn("[searchCustomersStep] Firebase fallback query failed", {
        error,
        field,
        value,
      });
    }
  };

  await runQuery("email", "==", query.trim().toLowerCase());
  await runQuery("email", "==", query.trim());
  await runQuery("nip", "==", digitQuery);

  for (const token of tokens) {
    await runQuery("keywords", "array-contains", token);
    await runQuery("nameSearch", "array-contains", token);
  }

  if (normalizedQuery !== query.trim().toLowerCase()) {
    await runQuery("keywords", "array-contains", normalizedQuery);
    await runQuery("nameSearch", "array-contains", normalizedQuery);
  }

  return rankCustomerSearchResults(
    query,
    Array.from(customersById.values()),
  ).slice(0, limit);
}

// Fetch prices from subcollection (matches productsSuggestionFlow behavior)
async function fetchPricesFromSubcollection(
  channelId: string,
  productId: string,
  calculatedCombination: string,
): Promise<Price[] | undefined> {
  try {
    const db = getDb();
    const priceDocRef = db
      .collection(`channels/${channelId}/products/${productId}/prices`)
      .doc(calculatedCombination);

    const priceDoc = await priceDocRef.get();

    if (priceDoc.exists) {
      const data = priceDoc.data() as ProductPrice;
      return data.prices;
    }

    const defaultPriceDocRef = db
      .collection(`channels/${channelId}/products/${productId}/prices`)
      .doc(DEFAULT_COMBINATION);

    const defaultPriceDoc = await defaultPriceDocRef.get();

    if (defaultPriceDoc.exists) {
      const data = defaultPriceDoc.data() as ProductPrice;
      return data.prices;
    }

    return undefined;
  } catch (error) {
    console.error(
      `Error fetching prices from subcollection for product ${productId}:`,
      error,
    );
    return undefined;
  }
}

export async function getExpressProcessingSettingsStep({
  channelId,
}: {
  channelId: string;
}): Promise<Settings["express"] | undefined> {
  "use step";

  try {
    const expressDoc = await getDb()
      .collection(`channels/${channelId}/settings`)
      .doc("express")
      .get();

    if (!expressDoc.exists) {
      return undefined;
    }

    const express = expressDoc.data() as Partial<Settings["express"]>;
    if (
      express.enabled !== true ||
      typeof express.percent !== "number" ||
      !Number.isFinite(express.percent) ||
      express.percent <= 0
    ) {
      return undefined;
    }

    return {
      enabled: true,
      percent: express.percent,
    };
  } catch (error) {
    console.error("[getExpressProcessingSettingsStep] Error:", error);
    return undefined;
  }
}

/**
 * Append a message to an agent's Firestore document.
 * Used to persist assistant/tool messages when the workflow pauses for user input.
 */
export async function appendAgentMessageStep({
  runId,
  message,
  messages,
  status,
  pendingHookToken,
  pendingHookType,
  result,
  error,
  stepsCount,
  clearPendingHook,
}: {
  runId: string;
  message?: PersistedAgentMessage;
  messages?: readonly PersistedAgentMessage[];
  status?: string;
  pendingHookToken?: string;
  pendingHookType?: "userConfirmation" | "quoteApproval";
  result?: unknown;
  error?: string;
  stepsCount?: number;
  clearPendingHook?: boolean;
}) {
  "use step";

  const firestore = getDb();
  const agentRef = firestore.collection("agents").doc(runId);
  const cleanedMessage = message ? removeUndefinedDeep(message) : undefined;

  const update: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (messages !== undefined) {
    const agentSnapshot = await agentRef.get();
    const incomingMessages = cleanAgentMessages([
      ...messages,
      ...(isPersistedAgentMessage(cleanedMessage) ? [cleanedMessage] : []),
    ]);
    update.messages = mergeAgentMessagesForPersistence(
      agentSnapshot.data()?.messages,
      incomingMessages,
    );
  } else if (cleanedMessage !== undefined) {
    update.messages = FieldValue.arrayUnion(cleanedMessage);
  }

  if (status) {
    update.status = status;
  }

  if (pendingHookToken) {
    update.pendingHookToken = pendingHookToken;
    update.pendingHookCreatedAt = FieldValue.serverTimestamp();
    update.pendingHookType = pendingHookType ?? "userConfirmation";
  }

  if (result !== undefined) {
    update.result = removeUndefinedDeep(result);
  }

  if (error !== undefined) {
    update.error = error;
  }

  if (typeof stepsCount === "number" && Number.isFinite(stepsCount)) {
    update.stepsCount = stepsCount;
  }

  if (clearPendingHook) {
    update.pendingHookToken = FieldValue.delete();
    update.pendingHookCreatedAt = FieldValue.delete();
    update.pendingHookType = FieldValue.delete();
  }

  await agentRef.set(update, { merge: true });
}

function compactAgentMemorySourceRun(
  sourceRun: AgentMemorySourceRun | undefined,
) {
  if (!sourceRun) return undefined;

  return {
    ...(sourceRun.channelId ? { channelId: sourceRun.channelId } : {}),
    runId: sourceRun.runId,
    taskType: sourceRun.taskType,
  };
}

export interface SearchAgentMemoryStepInput {
  channelId?: string;
  customerId?: string;
  limit?: number;
  orderId?: string;
  productId?: string;
  query: string;
  quoteId?: string;
  taskType: Exclude<AgentTaskType, "invoice">;
  tenantId?: string;
}

export async function searchAgentMemoryStep({
  tenantId,
  ...input
}: SearchAgentMemoryStepInput) {
  "use step";

  if (!tenantId) {
    return {
      memories: [],
      count: 0,
      _nextStep:
        "No tenant context was available, so approved memory was not searched.",
    };
  }

  const memories = await searchAgentMemories({
    ...input,
    tenantId,
  });

  return {
    memories: memories.map((memory) => ({
      id: memory.id,
      content: memory.content,
      status: memory.status,
      type: memory.type,
      scope: memory.scope,
      scopeMetadata: memory.scopeMetadata,
      sourceRun: compactAgentMemorySourceRun(memory.sourceRun),
      distance: memory.distance,
    })),
    count: memories.length,
    _nextStep:
      memories.length > 0
        ? "Use approved memory only as advisory context. Current tool results and deterministic validation remain authoritative."
        : "No approved memory matched this request.",
  };
}

export interface ProposeAgentMemoryStepInput extends AgentMemoryPayloadInput {
  sourceRun: {
    channelId?: string;
    prompt?: string;
    runId: string;
    taskType: Exclude<AgentTaskType, "invoice">;
  };
  tenantId?: string;
}

export async function proposeAgentMemoryStep({
  sourceRun,
  tenantId,
  ...input
}: ProposeAgentMemoryStepInput) {
  "use step";

  if (!tenantId) {
    return {
      success: false,
      error: "Tenant context is required before proposing memory.",
    };
  }

  const validation = validateAgentMemoryPayload(input);
  if (!validation.value) {
    return {
      success: false,
      error: validation.errors.join(" "),
    };
  }

  const memory = await createAgentMemoryProposal({
    payload: validation.value,
    sourceRun,
    tenantId,
  });

  return {
    success: true,
    memory: {
      id: memory.id,
      status: memory.status,
      type: memory.type,
      scope: memory.scope,
    },
    _nextStep:
      "Memory proposal saved as pending. It will not affect future runs unless an admin reviews and approves it.",
  };
}

/**
 * Search for customers by name, email, or other criteria
 * Uses Meilisearch first with Firebase fallback for better search results
 * This is a workflow step that can be retried automatically
 */
export async function searchCustomersStep({
  query,
  limit = 10,
  tenantId,
}: {
  query: string;
  limit?: number;
  tenantId?: string;
}) {
  "use step";

  try {
    const firestore = getDb();
    const customersRef = firestore.collection(`customers`);
    const requestedLimit = Math.max(1, Math.floor(limit));
    const candidatePoolLimit = Math.max(
      requestedLimit,
      CUSTOMER_SEARCH_CANDIDATE_POOL_LIMIT,
    );

    // Step 1: Try Meilisearch first for better search results
    const searchQueries = buildCustomerSearchQueries(query);
    const meilisearchResults = await Promise.allSettled(
      searchQueries.map((searchQuery) =>
        searchCustomersIndex(
          searchQuery,
          0,
          candidatePoolLimit,
          undefined,
          tenantId,
        ),
      ),
    );

    const customerIds = uniqueStrings(
      meilisearchResults.flatMap((result, index) => {
        if (result.status === "fulfilled") {
          return result.value;
        }

        console.warn(
          "[searchCustomersStep] Meilisearch failed for query variant, falling back to Firebase:",
          {
            error: result.reason,
            query: searchQueries[index],
          },
        );

        return [];
      }),
    );
    console.log(
      `[searchCustomersStep] Meilisearch found ${customerIds.length} candidate ids for "${query}"`,
    );

    // Step 2: If Meilisearch found results, fetch them from Firebase
    const meilisearchCustomers = rankCustomerSearchResults(
      query,
      sortCustomersByIds(
        await fetchCustomersByIds(customersRef, customerIds, tenantId),
        customerIds,
      ),
    );

    const firebaseCustomers = await fetchCustomersByFirebaseFallback(
      customersRef,
      query,
      candidatePoolLimit,
      tenantId,
    );

    const mergedCustomersById = new Map<string, NestedCustomer>();
    for (const customer of [...meilisearchCustomers, ...firebaseCustomers]) {
      mergedCustomersById.set(customer.id, customer);
    }

    const customers = rankCustomerSearchResults(
      query,
      Array.from(mergedCustomersById.values()),
    ).slice(0, requestedLimit);

    if (customers.length > 0) {
      return {
        customers,
        count: customers.length,
        source:
          meilisearchCustomers.length > 0 && firebaseCustomers.length > 0
            ? "meilisearch+firebase"
            : meilisearchCustomers.length > 0
              ? "meilisearch"
              : "firebase",
      };
    }

    // Step 3: Fallback to Firebase search if Meilisearch returned no results
    return {
      customers: [],
      message: "No customers found",
      source: "firebase",
    };
  } catch (error) {
    console.error("[searchCustomersStep] Error:", error);
    return { customers: [], error: "Failed to search customers" };
  }
}

/**
 * Evaluate which customer best matches the query using AI.
 * Returns a high-confidence auto-selection flag when the model is certain.
 */
export async function evaluateCustomerMatchStep({
  query,
  customers,
}: {
  query: string;
  customers: NestedCustomer[];
}) {
  "use step";

  if (!query.trim() || customers.length === 0) {
    return {
      selectedCustomerId: null,
      confidence: 0,
      autoSelect: false,
      rationale: "No query or customers to evaluate",
    };
  }

  try {
    const { getFastVertexModel } =
      await import("./durable-agent-models.server");
    const model = await getFastVertexModel();
    const { generateText, Output } = await getAiRuntime();

    const schema = z.object({
      selectedCustomerId: z.string().nullable(),
      confidence: z.number().min(0).max(1),
      autoSelect: z.boolean(),
      rationale: z.string(),
    });

    const candidates = customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      personName: customer.personName ?? "",
      email: customer.email ?? "",
      nip: customer.nip ?? "",
    }));

    const prompt = `You are matching a user query to a list of customer records.
Pick the single best customer if the match is clear and unambiguous.
If the match is ambiguous or uncertain, set selectedCustomerId to null and autoSelect to false.
Only set autoSelect to true when you are highly confident the match is correct.
The model proposes a match; deterministic code will reject unknown IDs and autoSelect below confidence ${CUSTOMER_AUTO_SELECT_CONFIDENCE_THRESHOLD}.

${AI_DETERMINISTIC_BOUNDARY_INSTRUCTIONS}

User query: "${query}"
Candidates: ${JSON.stringify(candidates)}
Return a confidence score from 0 to 1 and a short rationale.`;

    const result = await generateText({
      model,
      output: Output.object({
        schema,
      }),
      prompt,
      temperature: 0,
    });

    return normalizeCustomerMatchDecision({
      candidateIds: customers.map((customer) => customer.id),
      decision: result.output,
    });
  } catch (error) {
    console.error("[evaluateCustomerMatchStep] Error:", error);
    return {
      selectedCustomerId: null,
      confidence: 0,
      autoSelect: false,
      rationale: "AI evaluation failed",
    };
  }
}

/**
 * Get a specific customer by ID
 */
export async function getCustomerByIdStep({
  customerId,
  tenantId,
}: {
  customerId: string;
  tenantId?: string;
}) {
  "use step";

  try {
    const firestore = getDb();
    const customerRef = firestore.doc(`customers/${customerId}`);
    const doc = await customerRef.get();

    if (!doc.exists) {
      return { customer: null, error: "Customer not found" };
    }

    const data = doc.data() as Customer;
    if (tenantId && data.tenantId !== tenantId) {
      return { customer: null, error: "Customer not found" };
    }

    const customer: NestedCustomer = {
      id: data.id,
      name: data.name,
      email: data.email,
      personName: data.personName,
      nip: data.nip,
      b2b: data.b2b,
      addresses: data.addresses,
      contacts: data.contacts,
      discount: data.discount,
      specialNotes: data.specialNotes,
      allowedBankPayments: data.allowedBankPayments ?? false,
      allowedOnPickupPayments: data.allowedOnPickupPayments ?? false,
      allowedDefferedPayments: data.allowedDefferedPayments ?? false,
      linkedProductsIds: data.linkedProductsIds,
    };

    return { customer };
  } catch (error) {
    console.error("[getCustomerByIdStep] Error:", error);
    return { customer: null, error: "Failed to fetch customer" };
  }
}

export async function getRecentCustomerOrderPreferencesStep({
  channelId,
  customerId,
  limit = 2,
  tenantId,
}: {
  channelId: string;
  customerId: string;
  limit?: number;
  tenantId?: string;
}): Promise<{
  orders: AgentRecentCustomerOrder[];
  success: boolean;
}> {
  "use step";

  const safeLimit = Math.max(1, Math.min(2, Math.floor(limit)));
  let ordersQuery = getDb()
    .collection("channels")
    .doc(channelId)
    .collection("orders")
    .where("active", "==", true)
    .where("customer.id", "==", customerId);

  if (tenantId) {
    ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
  }

  const snapshot = await ordersQuery
    .orderBy("createdAt", "desc")
    .limit(safeLimit)
    .get();

  const orders = snapshot.docs.map((doc) => {
    const order = doc.data() as Order;

    return {
      createdAt: formatTimestampLike(order.createdAt),
      id: doc.id,
      number: typeof order.number === "number" ? order.number : null,
      paymentType: order.paymentType ?? null,
      shippingAddress: order.shipping ?? null,
      shippingOption: order.shippingOption ?? null,
    };
  });

  return {
    orders,
    success: true,
  };
}

/**
 * Search for products in the catalog using AI-powered suggestion
 * Uses the shared product discovery and order item suggestion service.
 */
export async function searchProductsStep(
  { query }: { query: string },
  {
    channelId,
    tenantId,
  }: {
    channelId: string;
    attributes: Attribute[];
    tenantId?: string;
  },
) {
  "use step";

  try {
    const {
      createInternalToolAuthContext,
      createInternalToolRuntime,
      suggestOrderItems: suggestOrderItemsTool,
    } = await import("@/lib/ai/tool-layer");
    const runtime = createInternalToolRuntime(
      createInternalToolAuthContext({
        channelId,
        scopes: ["products:read", "pricing:explain"],
        source: "durable-agent",
        ...(tenantId ? { tenantId } : {}),
      }),
    );
    const result = await suggestOrderItemsTool(runtime, { channelId, query });

    if (isEmpty(result.items)) {
      return {
        products: [],
        catalogCandidateCount: result.catalogCandidateCount,
        count: 0,
        totalAvailable: result.totalAvailable,
        message: result.notes[0] ?? "No matching products found for the query",
      };
    }

    console.log(
      `[searchProductsStep] Found ${result.items.length} product suggestions`,
    );

    return {
      products: result.items,
      catalogCandidateCount: result.catalogCandidateCount,
      count: result.count,
      totalAvailable: result.totalAvailable,
      message: `Found ${result.items.length} product suggestions for "${query}"`,
    };
  } catch (error) {
    console.error("[searchProductsStep] Error:", error);
    return {
      products: [],
      error:
        error instanceof Error ? error.message : "Failed to search products",
    };
  }
}

/**
 * Get product details with pricing info
 */
export async function getProductDetailsStep(
  { productId }: { productId: string },
  { channelId }: { channelId: string },
) {
  "use step";

  try {
    const firestore = getDb();
    const productRef = firestore.doc(
      `channels/${channelId}/products/${productId}`,
    );
    const doc = await productRef.get();

    if (!doc.exists) {
      return { product: null, error: "Product not found" };
    }

    const product = doc.data() as Product;

    return {
      product: {
        id: product.id,
        name: product.name,
        channelId: product.channelId,
        attributes: product.attributes,
        attributeOptions: product.attributeOptions,
        prices: product.prices,
        spec: product.spec,
      },
    };
  } catch (error) {
    console.error("[getProductDetailsStep] Error:", error);
    return { product: null, error: "Failed to fetch product" };
  }
}

/**
 * Calculate price for an order item configuration
 */
export async function calculateItemPriceStep(
  { item }: { item: AgentOrderItem },
  { channelId }: { channelId: string },
) {
  "use step";

  try {
    const firestore = getDb();
    const productChannelId = item.productSnapshot?.channelId ?? channelId;
    // Get the product to access pricing
    const productRef = firestore.doc(
      `channels/${productChannelId}/products/${item.productId}`,
    );
    const doc = await productRef.get();

    if (!doc.exists) {
      return { price: 0, error: "Product not found for pricing" };
    }

    const product = doc.data() as Product;
    const calculatedCombination = item.calculatedCombination ?? undefined;
    const pricingQuantities = resolveQuotePricingQuantities({
      defaultOrder: product.spec?.defaultOrder,
      itemQuantity: item.quantity,
      itemVolume: item.volume,
      priceType: product.priceType,
    });
    const quantity = pricingQuantities.quantity;
    const volume = pricingQuantities.volume;
    const customFormat = item.customFormat ?? false;
    const width = item.width ?? undefined;
    const height = item.height ?? undefined;
    const minimumOrder = product.spec?.minimumOrder ?? 0;
    const customSizes =
      item.customSizes && item.customSizes.length > 0
        ? item.customSizes
        : undefined;

    let prices = product.prices;
    if (calculatedCombination && (!prices || prices.length === 0)) {
      const subcollectionPrices = await fetchPricesFromSubcollection(
        product.channelId || productChannelId,
        product.id,
        calculatedCombination,
      );
      if (subcollectionPrices && subcollectionPrices.length > 0) {
        prices = subcollectionPrices;
      }
    }
    if (
      (!prices || prices.length === 0) &&
      product.priceType === PriceTypeEnum.SINGLE &&
      product.allowCustomPrice &&
      typeof item.customPrice === "number" &&
      Number.isFinite(item.customPrice) &&
      item.customPrice > 0
    ) {
      prices = [{ value: item.customPrice, currency: CurrencyEnum.PLN }];
    }

    const priceResult = calcPrice(
      quantity,
      prices,
      product.priceType,
      undefined,
      calculatedCombination,
      volume,
      customFormat,
      width,
      height,
      minimumOrder,
      item.customPrice ?? null,
      product.designSpec?.includeBleed ? product.designSpec?.bleed : undefined,
      undefined,
      customSizes,
      undefined,
      item.expressPercent,
    );

    if ("error" in priceResult) {
      return { price: 0, error: priceResult.error };
    }

    const totalPrice = "result" in priceResult ? priceResult.result : 0;

    return {
      price: totalPrice,
      quantity,
    };
  } catch (error) {
    console.error("[calculateItemPriceStep] Error:", error);
    return { price: 0, error: "Failed to calculate price" };
  }
}

/**
 * Validate quote data before submission
 */
export async function validateQuoteDataStep({
  customer,
  items,
  shippingOption: _shippingOption,
}: {
  customer?: NestedCustomer | string;
  items?: AgentOrderItem[];
  shippingOption?: string | null;
}) {
  "use step";

  const errors: string[] = [];

  if (!customer) {
    errors.push("Customer is required");
  }

  if (!items || items.length === 0) {
    errors.push("At least one item is required");
  }

  if (items) {
    items.forEach((item, index) => {
      if (!item.productId) {
        errors.push(`Item ${index + 1}: Product is required`);
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Valid quantity is required`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Tool definitions for the DurableAgent
 */
export const quoteAgentTools = {
  searchCustomers: {
    description:
      "Search for customers by name, email, phone, or NIP. Returns a list of matching customers.",
    inputSchema: z.object({
      query: z
        .string()
        .describe("Search query - can be name, email, phone, or NIP"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum results to return"),
    }),
    execute: searchCustomersStep,
  },

  getCustomerById: {
    description:
      "Get detailed information about a specific customer by their ID.",
    inputSchema: z.object({
      customerId: z.string().describe("The customer ID to look up"),
    }),
    execute: getCustomerByIdStep,
  },

  suggestOrderItems: {
    description:
      "Analyze the user's complete product request and suggest pre-configured order items with pricing. The AI parses product names, quantities, sizes, paper types, finishes, etc. from the request.",
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          "The complete user request with all product details - names, quantities, sizes, paper types, finishes, colors, and any other specifications",
        ),
    }),
    execute: searchProductsStep,
  },

  getProductDetails: {
    description:
      "Get detailed information about a specific product including pricing.",
    inputSchema: z.object({
      productId: z.string().describe("The product ID to look up"),
    }),
    execute: getProductDetailsStep,
  },

  calculateItemPrice: {
    description:
      "Calculate the price for an order item with its configuration.",
    inputSchema: z.object({
      item: z
        .object({
          productId: z.string(),
          productName: z.string().optional(),
          quantity: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          combination: z.record(z.string(), z.string()).optional(),
        })
        .describe("The order item to calculate price for"),
    }),
    execute: calculateItemPriceStep,
  },

  validateQuoteData: {
    description:
      "Validate the collected quote data before requesting approval.",
    inputSchema: z.object({
      customer: z
        .union([
          z.object({
            id: z.string(),
            name: z.string(),
          }),
          z.string(),
        ])
        .optional(),
      items: z
        .array(
          z.object({
            productId: z.string(),
            quantity: z.number().optional(),
          }),
        )
        .optional(),
      shippingOption: z.string().nullable().optional(),
    }),
    execute: validateQuoteDataStep,
  },
};
