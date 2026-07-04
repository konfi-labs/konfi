import { searchWeb } from "../search";
import { verifyRemotePattern } from "./utils";

export interface AdvancedSearchResult {
  references: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }>;
  searchContext: string;
  processingLog: string;
}

export async function performAdvancedSearch(
  query: string,
  t: (key: string, options?: any) => string,
): Promise<AdvancedSearchResult> {
  const references: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }> = [];

  let processingLog =
    t("assistant.searchingWeb", {
      query,
      defaultValue: '🔍 Searching the web for: "{{query}}"...',
    }) + "\n";

  try {
    const searchResult = await searchWeb(query);

    if (!searchResult) {
      processingLog +=
        t("assistant.noSearchResults", {
          defaultValue: "❌ No search results found.",
        }) + "\n";
      return {
        references: [],
        searchContext: "",
        processingLog,
      };
    }

    // Process search results
    references.push(
      ...searchResult.results.map((result) => ({
        url: result.url,
        title: result.title,
        content: result.content,
        thumbnail: verifyRemotePattern(result.thumbnail)
          ? result.thumbnail
          : "",
      })),
    );

    references.push(
      ...searchResult.answers.map((answer) => ({
        url: answer.url,
        title: "",
        content: answer.answer,
        thumbnail: "",
      })),
    );

    references.push(
      ...searchResult.corrections.map((correction) => ({
        url: correction.url,
        title: correction.title,
        content: "",
        thumbnail: "",
      })),
    );

    references.push(
      ...searchResult.infoboxes.map((infobox) => ({
        url: "",
        title: infobox.img_src,
        content: infobox.content,
        thumbnail: verifyRemotePattern(infobox.img_src) ? infobox.img_src : "",
      })),
    );

    processingLog +=
      t("assistant.foundSearchResults", {
        count: references.length,
        defaultValue: "✓ Found {{count}} search results",
      }) + "\n";

    // Create search context for the model
    const searchContext = `\n\nRelevant search results:\n${references
      .map(
        (ref) =>
          `${ref.title ? `Title: ${ref.title}` : ""}${ref.content ? `\nContent: ${ref.content}` : ""}${ref.url ? `\nURL: ${ref.url}` : ""}`,
      )
      .join("\n\n")}`;

    processingLog +=
      t("assistant.processingResults", {
        defaultValue: "🧠 Processing results and thinking about the answer...",
      }) + "\n";

    return {
      references,
      searchContext,
      processingLog,
    };
  } catch (error) {
    console.error("Error in web search:", error);
    processingLog +=
      t("assistant.searchError", {
        defaultValue: "❌ An error occurred during search.",
      }) + "\n";

    return {
      references: [],
      searchContext: "",
      processingLog,
    };
  }
}
