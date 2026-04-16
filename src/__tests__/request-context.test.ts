/**
 * Tests for request-scoped credential context (AsyncLocalStorage)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requestContext, getRequestCredentials } from "../utils/request-context.js";
import { getCredentials, getClient, clearClient } from "../utils/client.js";
import type { NinjaOneCredentials } from "../utils/client.js";
import { vi } from "vitest";

// Mock the NinjaOne client library
vi.mock("../ninjaone/index.js", () => ({
  NinjaOneClient: vi.fn().mockImplementation((config) => ({
    config,
    devices: { list: vi.fn() },
    organizations: { list: vi.fn() },
    alerts: { list: vi.fn() },
    tickets: { list: vi.fn() },
  })),
}));

describe("Request Context (AsyncLocalStorage)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    clearClient();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearClient();
  });

  describe("getRequestCredentials", () => {
    it("should return undefined when no context is active", () => {
      expect(getRequestCredentials()).toBeUndefined();
    });

    it("should return credentials when inside a context", () => {
      const creds: NinjaOneCredentials = {
        clientId: "ctx-id",
        clientSecret: "ctx-secret",
        region: "eu",
        baseUrl: "https://eu.ninjarmm.com",
      };

      requestContext.run({ credentials: creds }, () => {
        expect(getRequestCredentials()).toEqual(creds);
      });
    });

    it("should return undefined after context exits", () => {
      const creds: NinjaOneCredentials = {
        clientId: "ctx-id",
        clientSecret: "ctx-secret",
        region: "eu",
        baseUrl: "https://eu.ninjarmm.com",
      };

      requestContext.run({ credentials: creds }, () => {
        // inside context
      });

      // outside context
      expect(getRequestCredentials()).toBeUndefined();
    });

    it("should propagate through async chains", async () => {
      const creds: NinjaOneCredentials = {
        clientId: "async-id",
        clientSecret: "async-secret",
        region: "ca",
        baseUrl: "https://ca.ninjarmm.com",
      };

      await requestContext.run({ credentials: creds }, async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(getRequestCredentials()).toEqual(creds);
      });
    });

    it("should isolate concurrent contexts", async () => {
      const credsA: NinjaOneCredentials = {
        clientId: "user-a",
        clientSecret: "secret-a",
        region: "us",
        baseUrl: "https://app.ninjarmm.com",
      };

      const credsB: NinjaOneCredentials = {
        clientId: "user-b",
        clientSecret: "secret-b",
        region: "eu",
        baseUrl: "https://eu.ninjarmm.com",
      };

      const results: string[] = [];

      await Promise.all([
        requestContext.run({ credentials: credsA }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          results.push(getRequestCredentials()!.clientId);
        }),
        requestContext.run({ credentials: credsB }, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          results.push(getRequestCredentials()!.clientId);
        }),
      ]);

      // B finishes first due to shorter timeout, then A
      expect(results).toEqual(["user-b", "user-a"]);
    });
  });

  describe("getCredentials with context", () => {
    it("should prefer request context over env vars", () => {
      process.env.NINJAONE_CLIENT_ID = "env-id";
      process.env.NINJAONE_CLIENT_SECRET = "env-secret";
      process.env.NINJAONE_REGION = "us";

      const ctxCreds: NinjaOneCredentials = {
        clientId: "ctx-id",
        clientSecret: "ctx-secret",
        region: "eu",
        baseUrl: "https://eu.ninjarmm.com",
      };

      requestContext.run({ credentials: ctxCreds }, () => {
        const creds = getCredentials();
        expect(creds).toEqual(ctxCreds);
      });
    });

    it("should fall back to env vars when no context", () => {
      process.env.NINJAONE_CLIENT_ID = "env-id";
      process.env.NINJAONE_CLIENT_SECRET = "env-secret";
      process.env.NINJAONE_REGION = "us";

      const creds = getCredentials();
      expect(creds).toEqual({
        clientId: "env-id",
        clientSecret: "env-secret",
        region: "us",
        baseUrl: "https://app.ninjarmm.com",
      });
    });
  });

  describe("getClient with context", () => {
    it("should create separate clients for different credential contexts", async () => {
      const credsA: NinjaOneCredentials = {
        clientId: "user-a",
        clientSecret: "secret-a",
        region: "us",
        baseUrl: "https://app.ninjarmm.com",
      };

      const credsB: NinjaOneCredentials = {
        clientId: "user-b",
        clientSecret: "secret-b",
        region: "eu",
        baseUrl: "https://eu.ninjarmm.com",
      };

      let clientA: unknown;
      let clientB: unknown;

      await requestContext.run({ credentials: credsA }, async () => {
        clientA = await getClient();
      });

      await requestContext.run({ credentials: credsB }, async () => {
        clientB = await getClient();
      });

      expect(clientA).not.toBe(clientB);
    });

    it("should reuse cached client for same credentials", async () => {
      const creds: NinjaOneCredentials = {
        clientId: "same-user",
        clientSecret: "same-secret",
        region: "us",
        baseUrl: "https://app.ninjarmm.com",
      };

      let client1: unknown;
      let client2: unknown;

      await requestContext.run({ credentials: creds }, async () => {
        client1 = await getClient();
      });

      await requestContext.run({ credentials: creds }, async () => {
        client2 = await getClient();
      });

      expect(client1).toBe(client2);
    });
  });
});
