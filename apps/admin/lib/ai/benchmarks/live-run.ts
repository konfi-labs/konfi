import type { ProductAgentData } from "@/lib/ai/durable-agents/product-workflow.types";
import type { QuoteAgentData } from "@/lib/ai/durable-agents/types";
import type {
  AiBenchmarkLiveRunField,
  AiBenchmarkLiveRunSummary,
  BenchmarkAgentTaskType,
} from "./types";

function formatValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value.trim() || undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function getCustomerName(customer: QuoteAgentData["customer"]) {
  if (typeof customer === "string") {
    return customer;
  }

  return customer?.name;
}

function addField(
  fields: AiBenchmarkLiveRunField[],
  field: string,
  label: string,
  value: unknown,
) {
  const formattedValue = formatValue(value);

  if (!formattedValue) {
    return;
  }

  fields.push({
    field,
    label,
    value: formattedValue,
  });
}

function summarizeOrderLiveRun(
  output: Partial<QuoteAgentData>,
): AiBenchmarkLiveRunField[] {
  const fields: AiBenchmarkLiveRunField[] = [];
  const itemCount = output.items?.length;

  addField(fields, "customer", "Customer", getCustomerName(output.customer));
  addField(fields, "itemCount", "Item count", itemCount);
  addField(fields, "totalPrice", "Total price", output.totalPrice);
  addField(fields, "shippingOption", "Shipping option", output.shippingOption);
  addField(fields, "shippingPrice", "Shipping price", output.shippingPrice);

  const itemLabels = output.items
    ?.slice(0, 5)
    .map((item) => {
      const quantity = item.quantity ? `${item.quantity}x ` : "";
      return `${quantity}${item.productName || item.description}`;
    })
    .filter((item) => item.trim().length > 0)
    .join(", ");

  addField(fields, "items", "Items", itemLabels);

  return fields;
}

function summarizeProductLiveRun(
  output: Partial<ProductAgentData>,
): AiBenchmarkLiveRunField[] {
  const fields: AiBenchmarkLiveRunField[] = [];
  const draft = output.draft;
  const product = draft?.product;
  const prices = product?.prices;

  addField(fields, "productName", "Product", product?.name);
  addField(fields, "readyForCreate", "Ready for create", output.readyForCreate);
  addField(fields, "priceType", "Price type", draft?.priceType);
  addField(
    fields,
    "priceRows",
    "Price rows",
    Array.isArray(prices) ? prices.length : undefined,
  );
  addField(
    fields,
    "selectedAttributes",
    "Selected attributes",
    draft?.selectedAttributes.length,
  );
  addField(
    fields,
    "blockedItems",
    "Blocked items",
    output.blockedItems?.length,
  );

  return fields;
}

export function summarizeLiveRunBenchmarkOutput(options: {
  output: unknown;
  taskType: BenchmarkAgentTaskType;
}): AiBenchmarkLiveRunSummary {
  const fields =
    options.taskType === "product"
      ? summarizeProductLiveRun(options.output as Partial<ProductAgentData>)
      : summarizeOrderLiveRun(options.output as Partial<QuoteAgentData>);

  return {
    fields,
    taskType: options.taskType,
  };
}
