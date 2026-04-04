/**
 * System domain handler
 *
 * Global/cross-cutting read-only tools: activities, policies, users, antivirus.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { logger } from "../utils/logger.js";

function getTools(): Tool[] {
  return [
    {
      name: "ninjaone_system_activities",
      description:
        "Get the global activity log across all devices and organizations. Returns login events, policy changes, script runs, agent installs, alerts, and more.",
      inputSchema: {
        type: "object" as const,
        properties: {
          activity_type: {
            type: "string",
            description: "Filter by activity type (e.g., ACTIONSET, CONDITION, SYSTEM, ACTION)",
          },
          status: {
            type: "string",
            description: "Filter by activity status",
          },
          device_id: {
            type: "number",
            description: "Filter activities for a specific device",
          },
          older_than: {
            type: "number",
            description: "Return activities older than this activity ID (for pagination)",
          },
          newer_than: {
            type: "number",
            description: "Return activities newer than this activity ID",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 200)",
          },
        },
      },
    },
    {
      name: "ninjaone_system_policies",
      description:
        "List all policies configured in NinjaOne. Returns policy ID, name, description, node class, and parent policy. Use to decode policy IDs referenced in device details.",
      inputSchema: {
        type: "object" as const,
        properties: {},
      },
    },
    {
      name: "ninjaone_system_users",
      description:
        "List users in NinjaOne. Can list all users, only technicians, or only end users.",
      inputSchema: {
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            enum: ["all", "technicians", "end_users"],
            description: "User type to list (default: all)",
          },
        },
      },
    },
    {
      name: "ninjaone_system_antivirus",
      description:
        "Get antivirus status or threat reports across all devices. Use type='status' for AV product info and definition status, type='threats' for detected threats.",
      inputSchema: {
        type: "object" as const,
        properties: {
          type: {
            type: "string",
            enum: ["status", "threats"],
            description: "Report type: 'status' for AV product status, 'threats' for detected threats (default: status)",
          },
          organization_id: {
            type: "number",
            description: "Filter by organization ID",
          },
          device_class: {
            type: "string",
            description: "Filter by device class",
          },
          df: {
            type: "string",
            description: "Raw NinjaOne device filter string",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 200)",
          },
        },
      },
    },
  ];
}

function buildDf(args: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  if (args.organization_id) parts.push(`org=${args.organization_id}`);
  if (args.device_class) parts.push(`class=${args.device_class}`);
  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "ninjaone_system_activities": {
      const limit = (args.limit as number) || 200;
      logger.info("API call: system.listActivities", { limit });

      const result = await client.system.listActivities({
        activityType: args.activity_type as string | undefined,
        status: args.status as string | undefined,
        deviceId: args.device_id as number | undefined,
        olderThan: args.older_than as number | undefined,
        newerThan: args.newer_than as number | undefined,
        pageSize: limit,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    case "ninjaone_system_policies": {
      logger.info("API call: system.listPolicies");
      const policies = await client.system.listPolicies();

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: policies.length, policies }, null, 2),
          },
        ],
      };
    }

    case "ninjaone_system_users": {
      const userType = (args.type as string) || "all";
      logger.info("API call: system.listUsers", { type: userType });

      let users;
      switch (userType) {
        case "technicians":
          users = await client.system.listTechnicians();
          break;
        case "end_users":
          users = await client.system.listEndUsers();
          break;
        default:
          users = await client.system.listUsers();
          break;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: users.length, type: userType, users }, null, 2),
          },
        ],
      };
    }

    case "ninjaone_system_antivirus": {
      const reportType = (args.type as string) || "status";
      const limit = (args.limit as number) || 200;
      const df = (args.df as string) || buildDf(args);

      logger.info("API call: system.antivirus", { type: reportType, df, limit });

      let response;
      if (reportType === "threats") {
        response = await client.queries.antivirusThreats({ df, pageSize: limit });
      } else {
        response = await client.queries.antivirusStatus({ df, pageSize: limit });
      }

      const results = response.results || [];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: results.length, type: reportType, results }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown system tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const systemHandler: DomainHandler = {
  getTools,
  handleCall,
};
