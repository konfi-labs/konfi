type FunctionLoader = () => unknown;

const functionLoaders: Record<string, FunctionLoader> = {
  onBeforeCreate: () => require("./customers/onBeforeCreate").onBeforeCreate,
  syncCustomersToMeilisearch: () =>
    require("./search/meilisearchSync").syncCustomersToMeilisearch,
  syncProductsToMeilisearch: () =>
    require("./search/meilisearchSync").syncProductsToMeilisearch,
  syncOrdersToMeilisearch: () =>
    require("./search/meilisearchSync").syncOrdersToMeilisearch,
};

function parseFunctionExportList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0) ?? []
  );
}

function getFunctionNamesToExport(): string[] {
  const selectedExports = parseFunctionExportList(
    process.env.KONFI_FUNCTION_EXPORTS,
  );

  if (selectedExports.length > 0) {
    return selectedExports;
  }

  const functionName = process.env.FUNCTION_NAME?.trim();
  if (functionName) {
    return [functionName];
  }

  return Object.keys(functionLoaders);
}

for (const functionName of getFunctionNamesToExport()) {
  const loadFunction = functionLoaders[functionName];

  if (loadFunction) {
    (exports as Record<string, unknown>)[functionName] = loadFunction();
  }
}
