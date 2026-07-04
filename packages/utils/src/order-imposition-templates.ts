import { type CreateImpositionWorkflow, type OrderItem } from "@konfi/types";

const MAX_IMPOSITION_TEMPLATE_CANDIDATES = 8;
const MAX_IMPOSITION_TEMPLATE_TEXT_LENGTH = 500;

export interface OrderImpositionTemplateSuggestionItem {
  id: string;
  label: string;
  description: string;
  productName: string;
  quantity: number;
  volume?: number;
  width?: number;
  height?: number;
}

export type OrderImpositionWorkflowCandidate = Pick<
  CreateImpositionWorkflow,
  "id" | "name"
>;

export interface OrderImpositionTemplateExistingMatch {
  orderItemId: string;
  workflowNames: string[];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function truncateMatchingText(value: string) {
  const trimmed = value.trim();

  if (trimmed.length <= MAX_IMPOSITION_TEMPLATE_TEXT_LENGTH) {
    return trimmed;
  }

  return trimmed.slice(0, MAX_IMPOSITION_TEMPLATE_TEXT_LENGTH);
}

function isShortFormatToken(token: string) {
  return /^(?:\p{L}{1,2}\d{1,4}|\d{1,4}\p{L}{1,2})$/u.test(token);
}

function containsStandaloneToken(value: string, token: string) {
  if (token.length === 0) {
    return false;
  }

  const escapedToken = RegExp.escape(token);
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapedToken}($|[^\\p{L}\\p{N}])`,
    "u",
  );

  return pattern.test(value);
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 || isShortFormatToken(token));
}

function uniqueTokens(values: readonly string[]) {
  return Array.from(new Set(values));
}

function formatDimension(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${Math.round(value)}`
    : undefined;
}

function getDimensionTokens(item: OrderImpositionTemplateSuggestionItem) {
  const width = formatDimension(item.width);
  const height = formatDimension(item.height);

  if (!width || !height) {
    return width || height ? [width ?? height ?? ""] : [];
  }

  return [width, height, `${width}x${height}`, `${height}x${width}`];
}

function getItemReferenceTokens(item: OrderImpositionTemplateSuggestionItem) {
  return uniqueTokens([
    ...tokenize(item.label),
    ...tokenize(item.productName),
    ...tokenize(item.description),
  ]);
}

function scoreWorkflowCandidate(params: {
  workflow: OrderImpositionWorkflowCandidate;
  item: OrderImpositionTemplateSuggestionItem;
}) {
  const workflowName = normalizeText(params.workflow.name);
  const workflowTokens = uniqueTokens(tokenize(params.workflow.name));
  const itemReferenceTokens = getItemReferenceTokens(params.item);
  const dimensionTokens = getDimensionTokens(params.item);

  let score = 0;

  const overlappingItemTokens = workflowTokens.filter((token) =>
    itemReferenceTokens.includes(token),
  );
  score += overlappingItemTokens.length * 3;

  const overlappingDimensionTokens = dimensionTokens.filter(
    (token) => token.length > 0 && containsStandaloneToken(workflowName, token),
  );
  if (overlappingDimensionTokens.length > 0) {
    score += 5;
  }

  if (
    params.item.label.length > 0 &&
    workflowName.includes(normalizeText(params.item.label))
  ) {
    score += 4;
  }

  if (
    params.item.productName.length > 0 &&
    workflowName.includes(normalizeText(params.item.productName))
  ) {
    score += 4;
  }

  return score;
}

export function toSerializableOrderImpositionTemplateSuggestionItems(
  items: readonly OrderItem[],
): OrderImpositionTemplateSuggestionItem[] {
  return items.map((item, index) => {
    const itemName =
      typeof (item as { name?: unknown }).name === "string"
        ? ((item as { name?: string }).name ?? "")
        : "";
    const productName = item.product?.name ?? "";
    const description = truncateMatchingText(item.description ?? "");
    const label = truncateMatchingText(
      itemName || productName || description || `Item ${index + 1}`,
    );

    return {
      id: item.id ?? `order-item-${index}`,
      label,
      description,
      productName: truncateMatchingText(productName),
      quantity: item.quantity,
      volume: typeof item.volume === "number" ? item.volume : undefined,
      width: typeof item.width === "number" ? item.width : undefined,
      height: typeof item.height === "number" ? item.height : undefined,
    };
  });
}

export function shortlistOrderImpositionWorkflowCandidates(input: {
  items: readonly OrderImpositionTemplateSuggestionItem[];
  workflows: readonly OrderImpositionWorkflowCandidate[];
  excludedWorkflowIds?: readonly string[];
  maxCandidates?: number;
}): OrderImpositionWorkflowCandidate[] {
  const maxCandidates =
    input.maxCandidates ?? MAX_IMPOSITION_TEMPLATE_CANDIDATES;
  const excludedWorkflowIds = new Set(input.excludedWorkflowIds ?? []);
  const scoredWorkflows = new Map<
    string,
    { workflow: OrderImpositionWorkflowCandidate; score: number }
  >();

  for (const item of input.items) {
    for (const workflow of input.workflows) {
      if (excludedWorkflowIds.has(workflow.id)) {
        continue;
      }

      const score = scoreWorkflowCandidate({
        workflow,
        item,
      });

      if (score <= 0) {
        continue;
      }

      const previous = scoredWorkflows.get(workflow.id);
      if (!previous || score > previous.score) {
        scoredWorkflows.set(workflow.id, { workflow, score });
      }
    }
  }

  return Array.from(scoredWorkflows.values())
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return first.workflow.name.localeCompare(second.workflow.name);
    })
    .slice(0, maxCandidates)
    .map((entry) => entry.workflow);
}

export function buildOrderImpositionTemplateSuggestionSystemPrompt(): string {
  return `You decide whether a very small number of extra imposition templates should be suggested for order items.

Choose only from the provided workflowCandidates.

Rules:
- Be strict and conservative.
- Suggest extra templates only when there is strong evidence from the order item label, product name, description, current matched template names, or explicit width/height.
- Width and height are supporting evidence only. Size alone is not enough unless the candidate template name clearly matches that size or format family.
- Current matched templates are optional context, not automatic suggestions.
- Never repeat a template that is already matched for the order item.
- Never suggest broad generic alternatives just because the product is in the same category.
- Prefer zero suggestions over weak suggestions.
- Suggest at most one extra workflow per order item.
- Suggest templates for only the clearest items.

Return only structured data.`;
}

export function buildOrderImpositionTemplateSuggestionContext(input: {
  items: readonly OrderImpositionTemplateSuggestionItem[];
  workflowCandidates: readonly OrderImpositionWorkflowCandidate[];
  existingMatchesByItem: readonly OrderImpositionTemplateExistingMatch[];
}) {
  return {
    prompt: JSON.stringify(
      {
        items: input.items.map((item) => ({
          id: item.id,
          label: item.label,
          productName: item.productName,
          description: item.description,
          quantity: item.quantity,
          volume: item.volume ?? null,
          width: item.width ?? null,
          height: item.height ?? null,
          currentMatchedTemplateNames:
            input.existingMatchesByItem.find(
              (match) => match.orderItemId === item.id,
            )?.workflowNames ?? [],
        })),
        workflowCandidates: input.workflowCandidates,
      },
      null,
      2,
    ),
  };
}
