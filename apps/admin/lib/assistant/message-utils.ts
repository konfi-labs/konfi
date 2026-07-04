import type { FunctionResponsePart, Part } from "./ai-types";

export function ensurePromptParts(
  parts: (Part | FunctionResponsePart)[] | undefined,
  fallback: string,
): Part[] {
  // If no parts were produced, fall back to the user prompt
  if (!parts || parts.length === 0) {
    console.log("ensurePromptParts: Using fallback due to empty parts");
    return [{ text: fallback }];
  }

  // Validate that parts contain valid content
  const validParts = parts.filter((part) => {
    if ("text" in part) {
      return part.text && part.text.trim().length > 0;
    }
    if ("functionResponse" in part) {
      return (
        part.functionResponse &&
        part.functionResponse.name &&
        part.functionResponse.response
      );
    }
    return false;
  });

  if (validParts.length === 0) {
    console.log("ensurePromptParts: No valid parts found, using fallback");
    return [{ text: fallback }];
  }

  return validParts as Part[];
}

export function validateFunctionResponses(
  functionResponses: FunctionResponsePart[],
): FunctionResponsePart[] {
  return functionResponses.filter(
    (call) =>
      call.functionResponse &&
      call.functionResponse.name &&
      call.functionResponse.response &&
      Object.keys(call.functionResponse.response).length > 0,
  );
}
