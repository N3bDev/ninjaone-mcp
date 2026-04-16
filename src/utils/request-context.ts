/**
 * Request-scoped context using AsyncLocalStorage.
 *
 * In gateway mode (HTTP transport), each incoming request carries its own
 * NinjaOne credentials via headers. This module stores those credentials
 * in an AsyncLocalStorage context so they propagate through the entire
 * async call chain without polluting process.env.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { NinjaOneCredentials } from "./client.js";

interface RequestContext {
  credentials: NinjaOneCredentials;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Get credentials from the current request context (if any).
 * Returns undefined when called outside a requestContext.run() scope
 * (e.g., in stdio mode or env-based HTTP mode).
 */
export function getRequestCredentials(): NinjaOneCredentials | undefined {
  return requestContext.getStore()?.credentials;
}
