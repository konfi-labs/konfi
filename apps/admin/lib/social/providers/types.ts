/**
 * Thrown when a publish failure is transient (rate-limit, network hiccup, etc.).
 * The workflow step runtime should retry on this error class.
 */
export class RetryableProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableProviderError";
  }
}

/**
 * Thrown when a publish failure is permanent (bad content, invalid token, etc.).
 * The step should record the failure and move on — no retry.
 */
export class PermanentProviderError extends Error {
  /** True when the error indicates an expired or invalidated access token. */
  tokenExpired?: boolean;

  constructor(message: string, opts?: { tokenExpired?: boolean }) {
    super(message);
    this.name = "PermanentProviderError";
    this.tokenExpired = opts?.tokenExpired;
  }
}

export interface PublishResult {
  externalPostId: string;
}
