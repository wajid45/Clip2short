import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

let client: Anthropic | null = null;

export function aiConfigured() {
  return Boolean(env.anthropicKey);
}

export function anthropic(): Anthropic {
  if (!env.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set, so AI analysis is unavailable.");
  client ??= new Anthropic({ apiKey: env.anthropicKey, maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

/** Server-side refusal fallback (opt-in beta) so a policy decline is retried on the default fallback model. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Maps SDK errors to messages a customer can act on. */
export function describeAiError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "The AI service is busy right now. Please retry in a minute.";
  if (err instanceof Anthropic.AuthenticationError) return "The AI service key is invalid. Contact support.";
  if (err instanceof Anthropic.BadRequestError) return `The AI request was rejected: ${err.message}`;
  if (err instanceof Anthropic.InternalServerError) return "The AI service had a temporary error. Please retry.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Please retry.";
  if (err instanceof Error) return err.message;
  return "AI analysis failed.";
}
