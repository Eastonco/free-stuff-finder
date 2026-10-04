import { HTTPClientError, OpenRouterError, RequestAbortedError } from "@openrouter/sdk/models/errors";

/** 408/429/5xx and dropped connections are worth retrying; other 4xx (bad key, bad request) are not. */
export function isRetryableOpenRouterError(err: unknown): boolean {
  if (err instanceof OpenRouterError) return err.statusCode === 408 || err.statusCode === 429 || err.statusCode >= 500;
  return err instanceof HTTPClientError && !(err instanceof RequestAbortedError);
}

/** True for a 4xx that's about the request itself (e.g. an image URL the provider couldn't fetch). */
export function isBadRequest(err: unknown): boolean {
  return err instanceof OpenRouterError && (err.statusCode === 400 || err.statusCode === 422);
}

export const errorKind = (err: unknown) => (err instanceof Error ? err.constructor.name : typeof err);
