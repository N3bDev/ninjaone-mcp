/**
 * Low-level HTTP client with OAuth2 client_credentials authentication.
 *
 * Handles token acquisition, caching, automatic refresh, and retry on 401.
 * Uses the Node.js built-in fetch() (available since Node 18).
 */

import type { NinjaOneClientConfig, OAuthTokenResponse } from "./types.js";

/** Buffer (ms) before token expiry to trigger a proactive refresh. */
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

/** Default timeout (ms) for all HTTP requests. */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Maximum number of retries for 429 (rate limited) responses. */
const MAX_RATE_LIMIT_RETRIES = 3;

/** Default backoff (ms) when no Retry-After header is provided. */
const DEFAULT_RATE_LIMIT_BACKOFF_MS = 2_000;

export class NinjaOneHttp {
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: NinjaOneClientConfig) {
    // Strip trailing slash from baseUrl for consistent path joining.
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  // ── Token management ───────────────────────────────────────

  /**
   * Fetch a new access token from the NinjaOne OAuth2 endpoint.
   */
  private async fetchToken(): Promise<void> {
    const tokenUrl = `${this.baseUrl}/ws/oauth/token`;

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: "monitoring management",
    });

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `NinjaOne OAuth2 token request failed (${res.status}): ${text || res.statusText}`
      );
    }

    const data = (await res.json()) as OAuthTokenResponse;

    if (!data.access_token) {
      throw new Error("NinjaOne OAuth2 response missing access_token");
    }

    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000 - TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Ensure we have a valid (non-expired) access token.
   */
  private async ensureToken(): Promise<string> {
    if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
      await this.fetchToken();
    }
    return this.accessToken!;
  }

  // ── HTTP helpers ───────────────────────────────────────────

  /**
   * Build a full URL from a path and optional query parameters.
   */
  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const url = new URL(`/api${path}`, this.baseUrl);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Parse the Retry-After header value into milliseconds.
   * Supports both delay-seconds and HTTP-date formats.
   */
  private parseRetryAfter(res: Response): number {
    const header = res.headers.get("Retry-After");
    if (!header) return DEFAULT_RATE_LIMIT_BACKOFF_MS;

    const seconds = Number(header);
    if (!isNaN(seconds)) return seconds * 1000;

    // Try HTTP-date format
    const date = Date.parse(header);
    if (!isNaN(date)) return Math.max(0, date - Date.now());

    return DEFAULT_RATE_LIMIT_BACKOFF_MS;
  }

  /**
   * Make an authenticated HTTP request to the NinjaOne API.
   * Retries once on 401 (expired token) and up to 3 times on 429 (rate limited).
   */
  async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, unknown>;
    }
  ): Promise<T> {
    const url = this.buildUrl(path, options?.query);
    const token = await this.ensureToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };

    let bodyStr: string | undefined;
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(options.body);
    }

    let res = await fetch(url, { method, headers, body: bodyStr, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });

    // Retry once on 401 — token may have been revoked or expired.
    if (res.status === 401) {
      this.accessToken = null;
      const newToken = await this.ensureToken();
      headers.Authorization = `Bearer ${newToken}`;
      res = await fetch(url, { method, headers, body: bodyStr, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    }

    // Retry on 429 with exponential backoff
    for (let attempt = 0; attempt < MAX_RATE_LIMIT_RETRIES && res.status === 429; attempt++) {
      const delay = this.parseRetryAfter(res) * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      res = await fetch(url, { method, headers, body: bodyStr, signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS) });
    }

    // 204 No Content — return empty
    if (res.status === 204) {
      return undefined as T;
    }

    const responseText = await res.text();

    if (!res.ok) {
      let detail = responseText;
      try {
        const parsed = JSON.parse(responseText);
        detail = parsed.message || parsed.error || responseText;
      } catch {
        // use raw text
      }
      throw new Error(`NinjaOne API error (${res.status} ${method} ${path}): ${detail}`);
    }

    // Some endpoints return empty body on success
    if (!responseText) {
      return undefined as T;
    }

    return JSON.parse(responseText) as T;
  }

  // ── Convenience methods ────────────────────────────────────

  async get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  async post<T = unknown>(path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}
