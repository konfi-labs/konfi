import { type AllegroManualParameterValue } from "@/lib/allegro-product-offer-publication";
import { type AllegroExportParameterMapping } from "@/lib/allegro-export-preview";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripMarkdownLinks(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ");
}

function stripInlineMarkdown(value: string): string {
  return stripMarkdownLinks(value)
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatInlineMarkdown(value: string): string {
  const escapedValue = escapeHtml(stripMarkdownLinks(value));
  return escapedValue
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<b>$1</b>");
}

function flushParagraph(lines: string[], output: string[]): void {
  const paragraph = lines.join(" ").trim();
  if (paragraph) {
    output.push(`<p>${formatInlineMarkdown(paragraph)}</p>`);
  }
  lines.length = 0;
}

function closeList(
  currentListType: "ol" | "ul" | null,
  output: string[],
): null {
  if (currentListType) {
    output.push(`</${currentListType}>`);
  }
  return null;
}

export function renderMarkdownToAllegroHtml(markdown: string): string {
  const output: string[] = [];
  const paragraphLines: string[] = [];
  let currentListType: "ol" | "ul" | null = null;
  let inCodeFence = false;

  for (const rawLine of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();

    if (line.startsWith("```")) {
      flushParagraph(paragraphLines, output);
      currentListType = closeList(currentListType, output);
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    if (!line) {
      flushParagraph(paragraphLines, output);
      currentListType = closeList(currentListType, output);
      continue;
    }

    if (/^(import|export)\s/.test(line)) continue;

    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph(paragraphLines, output);
      currentListType = closeList(currentListType, output);
      const tag = headingMatch[1].length === 1 ? "h1" : "h2";
      output.push(
        `<${tag}>${escapeHtml(stripInlineMarkdown(headingMatch[2]))}</${tag}>`,
      );
      continue;
    }

    const unorderedMatch = /^[-*+]\s+(.+)$/.exec(line);
    const orderedMatch = /^\d+[.)]\s+(.+)$/.exec(line);
    const listType = orderedMatch ? "ol" : unorderedMatch ? "ul" : null;
    if (listType) {
      flushParagraph(paragraphLines, output);
      if (currentListType !== listType) {
        currentListType = closeList(currentListType, output);
        output.push(`<${listType}>`);
        currentListType = listType;
      }
      output.push(
        `<li>${formatInlineMarkdown((orderedMatch ?? unorderedMatch)?.[1] ?? "")}</li>`,
      );
      continue;
    }

    currentListType = closeList(currentListType, output);
    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, output);
  closeList(currentListType, output);

  return output.join("");
}

export function createAllegroDescriptionContent(input: {
  configurationDescription: string;
  customFormatLabel?: string;
  description: string;
  manualParameters?: AllegroManualParameterValue[];
  parameters: AllegroExportParameterMapping[];
  productName: string;
  quantity: number;
}): string {
  const configurationItems = [
    ["Produkt", input.productName],
    ["Nakład", String(input.quantity)],
    ...(input.customFormatLabel ? [["Format", input.customFormatLabel]] : []),
    ["Konfiguracja", input.configurationDescription],
    ...input.parameters.map(
      (parameter) => [parameter.attributeName, parameter.valueLabel] as const,
    ),
    ...(input.manualParameters ?? []).map(
      (parameter) => [parameter.parameterName, parameter.valueLabel] as const,
    ),
  ].filter(([, value]) => value.trim());

  const configurationContent =
    configurationItems.length === 0
      ? ""
      : [
          "<h2>Konfiguracja</h2>",
          "<ul>",
          ...configurationItems.map(
            ([label, value]) =>
              `<li><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</li>`,
          ),
          "</ul>",
        ].join("");

  const fileContent = [
    "<h2>Pliki do druku</h2>",
    "<p>Oferta obejmuje druk na podstawie gotowych plików przesłanych przez kupującego. Przygotowanie projektu graficznego nie jest zawarte w cenie oferty.</p>",
    "<p>Inne konfiguracje produktu, takie jak różne nakłady, formaty, papiery lub wykończenia, są dostępne w osobnych ofertach.</p>",
  ].join("");

  return [
    renderMarkdownToAllegroHtml(input.description),
    fileContent,
    configurationContent,
  ]
    .filter(Boolean)
    .join("");
}
