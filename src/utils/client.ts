/**
 * Lazy-loaded NinjaOne client
 *
 * This module provides lazy initialization of the NinjaOne client
 * to avoid loading the entire library upfront.
 *
 * Supports two credential sources:
 * 1. Request context (gateway mode) — per-request credentials via AsyncLocalStorage
 * 2. Environment variables (stdio / env mode) — process-wide credentials
 *
 * Clients are cached by credential key (clientId:region) so that
 * concurrent requests with different credentials each get their own client.
 */

import type { NinjaOneClient } from "../ninjaone/index.js";
import { isValidRegion, getBaseUrlForRegion, type NinjaOneRegion } from "./types.js";
import { getRequestCredentials } from "./request-context.js";
import { logger } from "./logger.js";

export interface NinjaOneCredentials {
  clientId: string;
  clientSecret: string;
  region: NinjaOneRegion;
  baseUrl: string;
}

/** Cache of clients keyed by "clientId:region" */
const _clientCache = new Map<string, NinjaOneClient>();

function clientCacheKey(creds: NinjaOneCredentials): string {
  return `${creds.clientId}:${creds.region}`;
}

/**
 * Get credentials from the current request context or environment variables.
 *
 * In gateway mode, per-request credentials from AsyncLocalStorage take priority.
 * Falls back to process.env for stdio / env-based HTTP mode.
 */
export function getCredentials(): NinjaOneCredentials | null {
  // 1. Check request-scoped context (gateway mode)
  const contextCreds = getRequestCredentials();
  if (contextCreds) return contextCreds;

  // 2. Fall back to environment variables
  const clientId = process.env.NINJAONE_CLIENT_ID;
  const clientSecret = process.env.NINJAONE_CLIENT_SECRET;
  const regionEnv = process.env.NINJAONE_REGION?.toLowerCase() || "us";

  if (!clientId || !clientSecret) {
    logger.warn("Missing credentials", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  if (!isValidRegion(regionEnv)) {
    logger.warn("Invalid region configured", { region: regionEnv, valid: ["us", "eu", "oc", "ca", "us2", "fed"] });
    return null;
  }

  const region = regionEnv as NinjaOneRegion;
  const baseUrl = getBaseUrlForRegion(region);

  return { clientId, clientSecret, region, baseUrl };
}

/**
 * Get or create the NinjaOne client (lazy initialization).
 *
 * Clients are cached by credential key so concurrent requests
 * with different credentials each get an isolated client instance.
 */
export async function getClient(): Promise<NinjaOneClient> {
  const creds = getCredentials();

  if (!creds) {
    throw new Error(
      "No API credentials provided. Please configure NINJAONE_CLIENT_ID, NINJAONE_CLIENT_SECRET, and optionally NINJAONE_REGION (us, eu, oc, ca, us2, fed) environment variables."
    );
  }

  const key = clientCacheKey(creds);
  let client = _clientCache.get(key);

  if (!client) {
    try {
      const { NinjaOneClient } = await import("../ninjaone/index.js");
      logger.info("Creating NinjaOne client", { region: creds.region, baseUrl: creds.baseUrl });
      client = new NinjaOneClient({
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        baseUrl: creds.baseUrl,
      });
      _clientCache.set(key, client);
    } catch (error) {
      logger.error("Failed to create NinjaOne client", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  return client;
}

/**
 * Clear all cached clients (useful for testing)
 */
export function clearClient(): void {
  _clientCache.clear();
}