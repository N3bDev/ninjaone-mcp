#!/usr/bin/env node
/**
 * NinjaOne MCP Server
 *
 * Exposes all domain tools (devices, organizations, alerts, tickets)
 * directly without requiring navigation.
 *
 * Supports both stdio and HTTP transports:
 * - stdio (default): For local Claude Desktop / CLI usage
 * - http: For hosted deployment with optional gateway auth
 *
 * Credentials are provided via environment variables:
 * - NINJAONE_CLIENT_ID
 * - NINJAONE_CLIENT_SECRET
 * - NINJAONE_REGION (us, eu, oc, ca, us2, fed)
 *
 * Or via gateway headers (when AUTH_MODE=gateway):
 * - X-Ninja-Client-ID
 * - X-Ninja-Client-Secret
 * - X-Ninja-Region
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getDomainHandler, getAvailableDomains } from "./domains/index.js";
import { getCredentials } from "./utils/client.js";
import { logger } from "./utils/logger.js";
import { setServerRef } from "./utils/server-ref.js";

// Create the MCP server
const server = new Server(
  {
    name: "ninjaone-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);
setServerRef(server);

/**
 * Status tool - shows server state and verifies credentials
 */
const statusTool: Tool = {
  name: "ninjaone_status",
  description:
    "Show NinjaOne MCP server status. Verifies API credentials are configured and lists available tool domains.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/**
 * Load all tools from all domains
 */
async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [statusTool];
  const domains = getAvailableDomains();

  for (const domain of domains) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }

  return tools;
}

// Handle ListTools requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = await getAllTools();
  return { tools };
});

// Handle CallTool requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logger.info("Tool call received", { tool: name, arguments: args });

  try {
    // Handle status
    if (name === "ninjaone_status") {
      const creds = getCredentials();
      const credStatus = creds
        ? `Configured (region: ${creds.region}, base URL: ${creds.baseUrl})`
        : "NOT CONFIGURED - Please set environment variables";

      return {
        content: [
          {
            type: "text",
            text: `NinjaOne MCP Server Status\n\nCredentials: ${credStatus}\nAvailable domains: ${getAvailableDomains().join(", ")}`,
          },
        ],
      };
    }

    // Route to the correct domain handler based on tool name prefix
    const domains = getAvailableDomains();
    for (const domain of domains) {
      const handler = await getDomainHandler(domain);
      const domainTools = handler.getTools();
      const toolExists = domainTools.some((t) => t.name === name);

      if (toolExists) {
        const result = await handler.handleCall(name, args as Record<string, unknown>);
        logger.debug("Tool call completed", {
          tool: name,
          responseSize: JSON.stringify(result).length,
        });
        return result;
      }
    }

    // Tool not found
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}. Use ninjaone_status to see available domains.`,
        },
      ],
      isError: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("Tool call failed", { tool: name, error: message, stack });
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server with stdio transport (default)
 */
async function startStdioTransport(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("NinjaOne MCP server running on stdio");
}

/**
 * Start the server with HTTP Streamable transport
 * Supports gateway mode where credentials come from request headers
 */
async function startHttpTransport(): Promise<void> {
  const port = parseInt(process.env.MCP_HTTP_PORT || "8080", 10);
  const host = process.env.MCP_HTTP_HOST || "0.0.0.0";
  const isGatewayMode = process.env.AUTH_MODE === "gateway";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: true,
  });

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    // Health endpoint - no auth required
    if (url.pathname === "/health") {
      const creds = getCredentials();
      const status = creds ? "ok" : "degraded";
      const statusCode = creds ? 200 : 503;

      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status,
          transport: "http",
          authMode: isGatewayMode ? "gateway" : "env",
          timestamp: new Date().toISOString(),
          credentials: {
            configured: !!creds,
            region: creds?.region ?? null,
            hasClientId: !!process.env.NINJAONE_CLIENT_ID,
            hasClientSecret: !!process.env.NINJAONE_CLIENT_SECRET,
          },
          logLevel: process.env.LOG_LEVEL || "info",
          version: "1.0.0",
        })
      );
      return;
    }

    // MCP endpoint
    if (url.pathname === "/mcp") {
      // In gateway mode, extract credentials from headers
      if (isGatewayMode) {
        const clientId = req.headers["x-ninja-client-id"] as string | undefined;
        const clientSecret = req.headers["x-ninja-client-secret"] as string | undefined;
        const region = req.headers["x-ninja-region"] as string | undefined;

        if (!clientId || !clientSecret) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: "Missing credentials",
              message:
                "Gateway mode requires X-Ninja-Client-ID and X-Ninja-Client-Secret headers",
              required: ["X-Ninja-Client-ID", "X-Ninja-Client-Secret"],
              optional: ["X-Ninja-Region"],
            })
          );
          return;
        }

        // Set environment variables for this request so getCredentials() picks them up
        process.env.NINJAONE_CLIENT_ID = clientId;
        process.env.NINJAONE_CLIENT_SECRET = clientSecret;
        if (region) {
          process.env.NINJAONE_REGION = region;
        }
      }

      transport.handleRequest(req, res);
      return;
    }

    // 404 for everything else
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found", endpoints: ["/mcp", "/health"] }));
  });

  await server.connect(transport);

  await new Promise<void>((resolve) => {
    httpServer.listen(port, host, () => {
      logger.info(`NinjaOne MCP server listening on http://${host}:${port}/mcp`);
      logger.info(`Health check available at http://${host}:${port}/health`);
      logger.info(`Authentication mode: ${isGatewayMode ? "gateway (header-based)" : "env (environment variables)"}`);
      resolve();
    });
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down NinjaOne MCP server...");
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/**
 * Main entry point - select transport based on MCP_TRANSPORT env var
 */
async function main() {
  const transportType = process.env.MCP_TRANSPORT || "stdio";
  logger.info("Starting NinjaOne MCP server", {
    transport: transportType,
    logLevel: process.env.LOG_LEVEL || "info",
    nodeVersion: process.version,
  });

  if (transportType === "http") {
    await startHttpTransport();
  } else {
    await startStdioTransport();
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  process.exit(1);
});
