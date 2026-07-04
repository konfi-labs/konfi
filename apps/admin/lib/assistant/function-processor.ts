import type { FunctionCall, FunctionResponsePart } from "./ai-types";
import { functionHandlers, FunctionHandlerContext } from "./function-handlers";
import { FormattedOrderItem } from "@konfi/types";

interface ProcessFunctionCallsOptions {
  functionCalls: FunctionCall[];
  context: FunctionHandlerContext;
  onProgressUpdate: (log: string) => void;
}

export interface ProcessFunctionCallsResult {
  functionResponses: FunctionResponsePart[];
  processedCalls: FunctionCall[];
  processingLog: string;
  allReferences: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }>;
  orderItems?: FormattedOrderItem[];
}

export async function processFunctionCalls({
  functionCalls,
  context,
  onProgressUpdate,
}: ProcessFunctionCallsOptions): Promise<ProcessFunctionCallsResult> {
  const processedCalls: FunctionCall[] = [];
  const functionResponses: FunctionResponsePart[] = [];
  const allReferences: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }> = [];
  let returnedOrderItems: FormattedOrderItem[] | undefined;
  let processingLog = "";

  // Format function calls for the processing log
  for (const call of functionCalls) {
    let callDisplay = context.t("assistant.callingFunction", {
      name: call.name,
      defaultValue: "Calling function: {{name}}",
    });

    if (call.args) {
      const argsEntries = Object.entries(call.args);
      const argsString =
        argsEntries.length === 1
          ? `${argsEntries[0][0]}: ${argsEntries[0][1]}`
          : argsEntries.map(([key, value]) => `${key}: ${value}`).join(", ");
      callDisplay +=
        " " +
        context.t("assistant.withArguments", {
          args: argsString,
          defaultValue: "with arguments {{args}}",
        });
    }
    processingLog += processingLog ? `\n${callDisplay}` : callDisplay;
  }

  onProgressUpdate(processingLog);

  // Process each function call
  for (const call of functionCalls) {
    const handler = functionHandlers[call.name];

    if (!handler) {
      console.warn(`No handler found for function: ${call.name}`);
      continue;
    }

    try {
      const result = await handler(call, {
        ...context,
        updateProcessingLog: (message: string) => {
          processingLog += `\n${message}`;
          onProgressUpdate(processingLog);
        },
      });

      processedCalls.push(call);
      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: result.result,
        },
      });

      // Collect references if any
      if (result.references) {
        allReferences.push(...result.references);
      }

      if (call.name === "suggestProducts" && result.orderItems) {
        try {
          returnedOrderItems = JSON.parse(
            result.orderItems,
          ) as FormattedOrderItem[];
        } catch {
          /* ignore */
        }
      }

      processingLog += `\n${result.logMessage}`;
      onProgressUpdate(processingLog);
    } catch (error) {
      console.error(`Error processing function ${call.name}:`, error);
      processedCalls.push(call);
      functionResponses.push({
        functionResponse: {
          name: call.name,
          response: { error: "Function execution failed" },
        },
      });
      processingLog += `\nError executing ${call.name}`;
      onProgressUpdate(processingLog);
    }
  }

  return {
    functionResponses,
    processedCalls,
    processingLog,
    allReferences,
    orderItems: returnedOrderItems,
  };
}

export function formatFunctionCallsForProcessingLog(
  functionCalls: FunctionCall[],
  t: (key: string, options?: any) => string,
): string {
  let log = "";

  for (const call of functionCalls) {
    let callDisplay = t("assistant.callingFunction", {
      name: call.name,
      defaultValue: "Calling function: {{name}}",
    });

    if (call.args) {
      const argsEntries = Object.entries(call.args);
      const argsString =
        argsEntries.length === 1
          ? `${argsEntries[0][0]}: ${argsEntries[0][1]}`
          : argsEntries.map(([key, value]) => `${key}: ${value}`).join(", ");
      callDisplay +=
        " " +
        t("assistant.withArguments", {
          args: argsString,
          defaultValue: "with arguments {{args}}",
        });
    }
    log += log ? `\n${callDisplay}` : callDisplay;
  }

  return log;
}
