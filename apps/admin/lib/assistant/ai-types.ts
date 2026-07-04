/**
 * Lightweight types used by the assistant tooling.
 *
 * These intentionally avoid importing from `firebase/ai` so this package cannot
 * accidentally pull the client AI SDK into bundles.
 */

export type FunctionCall = {
  name: string;
  args?: Record<string, unknown>;
};

export type FunctionResponsePart = {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
};

export type Part = { text: string } | FunctionResponsePart;
