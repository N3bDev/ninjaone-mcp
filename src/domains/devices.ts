/**
 * Devices domain handler
 *
 * Provides tools for device operations in NinjaOne.
 * Uses the NinjaOne device filter (df) parameter for efficient server-side filtering.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import { getClient } from "../utils/client.js";
import { logger } from "../utils/logger.js";

/**
 * Build a NinjaOne device filter (df) string from common parameters.
 */
function buildDf(args: Record<string, unknown>): string | undefined {
  const parts: string[] = [];

  if (args.organization_id) parts.push(`org=${args.organization_id}`);
  if (args.device_class) parts.push(`class=${args.device_class}`);

  if (args.online === true) parts.push("online");
  else if (args.online === false) parts.push("offline");

  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

/**
 * Get device domain tools
 */
function getTools(): Tool[] {
  return [
    {
      name: "ninjaone_devices_list",
      description:
        "List devices in NinjaOne with server-side filtering. Returns basic device info including ID, name, organization, class, online status, and last contact time. Use the detailed variant for full device data with references.",
      inputSchema: {
        type: "object" as const,
        properties: {
          organization_id: {
            type: "number",
            description: "Filter devices by organization ID",
          },
          device_class: {
            type: "string",
            enum: [
              "WINDOWS_WORKSTATION", "WINDOWS_SERVER", "MAC", "MAC_SERVER",
              "LINUX_WORKSTATION", "LINUX_SERVER",
              "VMWARE_VM_HOST", "VMWARE_VM_GUEST",
              "CLOUD_MONITOR_TARGET",
              "NMS_SWITCH", "NMS_ROUTER", "NMS_FIREWALL", "NMS_PRINTER",
              "NMS_WAP", "NMS_COMPUTER", "NMS_SERVER", "NMS_OTHER",
            ],
            description: "Filter by device class/type",
          },
          online: {
            type: "boolean",
            description: "Filter by online status (true = online only, false = offline only)",
          },
          df: {
            type: "string",
            description: "Raw NinjaOne device filter string for advanced filtering. Examples: 'offline AND class=WINDOWS_SERVER', 'org=1 AND online', 'created after 2024-01-01'. Overrides other filter params when provided.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
          cursor: {
            type: "string",
            description: "Pagination cursor for next page of results",
          },
        },
      },
    },
    {
      name: "ninjaone_devices_list_detailed",
      description:
        "List devices with full details including organization name, location, policy, role, warranty, backup usage, and all references. More data per device than the basic list. Use for comprehensive device inventory or when you need organization/location names.",
      inputSchema: {
        type: "object" as const,
        properties: {
          organization_id: {
            type: "number",
            description: "Filter devices by organization ID",
          },
          device_class: {
            type: "string",
            enum: [
              "WINDOWS_WORKSTATION", "WINDOWS_SERVER", "MAC", "MAC_SERVER",
              "LINUX_WORKSTATION", "LINUX_SERVER",
              "VMWARE_VM_HOST", "VMWARE_VM_GUEST",
            ],
            description: "Filter by device class/type",
          },
          online: {
            type: "boolean",
            description: "Filter by online status",
          },
          df: {
            type: "string",
            description: "Raw NinjaOne device filter string. Overrides other filter params.",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
      },
    },
    {
      name: "ninjaone_devices_search",
      description:
        "Search for devices by name or other criteria. Returns matching devices with their IDs. Use this when you need to find a device by name.",
      inputSchema: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Search query (device name, DNS name, etc.)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "ninjaone_devices_get",
      description: "Get full details for a specific device by its ID",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_health",
      description:
        "Get device health summary for all devices or filtered set. Returns offline status, alert counts, patch status, threat counts, and overall health status per device. Ideal for monitoring dashboards and identifying unhealthy devices.",
      inputSchema: {
        type: "object" as const,
        properties: {
          organization_id: {
            type: "number",
            description: "Filter by organization ID",
          },
          device_class: {
            type: "string",
            description: "Filter by device class",
          },
          health: {
            type: "string",
            enum: ["HEALTHY", "UNHEALTHY", "UNKNOWN"],
            description: "Filter by health status",
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
    {
      name: "ninjaone_devices_os",
      description:
        "Get operating system information for all devices or filtered set. Returns OS name, version, architecture, build number, last boot time, and reboot status per device.",
      inputSchema: {
        type: "object" as const,
        properties: {
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
    {
      name: "ninjaone_devices_software",
      description:
        "Get software installed on a specific device. Returns software name, publisher, version, install date, and size.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID to get software inventory for",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_disks",
      description:
        "Get disk drive information for a specific device. Returns physical disk details including model, size, interface type, and SMART status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_volumes",
      description:
        "Get storage volumes for a specific device. Returns drive letter, capacity, free space, file system, and optional BitLocker status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
          include_bitlocker: {
            type: "boolean",
            description: "Include BitLocker encryption status (default: false)",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_network_interfaces",
      description:
        "Get network interface details for a specific device. Returns adapter name, IP addresses, MAC addresses, link speed, and status.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_os_patches",
      description:
        "Get OS patches for a specific device. Can show pending/approved/rejected patches or installation history.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
          status: {
            type: "string",
            enum: ["FAILED", "INSTALLED", "APPROVED", "MANUAL"],
            description: "Filter by patch status",
          },
          installed_after: {
            type: "string",
            description: "Only include patches installed after this date (YYYY-MM-DD)",
          },
          installed_before: {
            type: "string",
            description: "Only include patches installed before this date (YYYY-MM-DD)",
          },
          type: {
            type: "string",
            enum: ["pending", "installed"],
            description: "pending = pending/rejected patches, installed = installation history (default: pending)",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_custom_fields",
      description:
        "Get or update custom field values for a specific device.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_reboot",
      description: "Schedule a reboot for a device",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID to reboot",
          },
          reason: {
            type: "string",
            description: "Reason for the reboot",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_services",
      description: "List Windows services on a device",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
          state: {
            type: "string",
            enum: ["RUNNING", "STOPPED", "PAUSED"],
            description: "Filter by service state",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_alerts",
      description: "Get active alerts for a specific device",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
          severity: {
            type: "string",
            enum: ["CRITICAL", "MAJOR", "MINOR", "NONE"],
            description: "Filter by alert severity",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_activities",
      description: "Get activity log for a device",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
          activity_type: {
            type: "string",
            description: "Filter by activity type",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default: 50)",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_processors",
      description:
        "Get CPU/processor details for a specific device. Returns architecture, clock speed, core count, and model name.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_last_user",
      description:
        "Get the last logged-on user for a specific device. Returns username and logon time.",
      inputSchema: {
        type: "object" as const,
        properties: {
          device_id: {
            type: "number",
            description: "The device ID",
          },
        },
        required: ["device_id"],
      },
    },
    {
      name: "ninjaone_devices_hardware",
      description:
        "Get hardware inventory across devices. Returns manufacturer, model, serial number, RAM, domain, and chassis type per device. Supports device filter for scoping.",
      inputSchema: {
        type: "object" as const,
        properties: {
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

/**
 * Handle a device domain tool call
 */
async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const client = await getClient();

  switch (toolName) {
    case "ninjaone_devices_list": {
      const limit = (args.limit as number) || 50;
      const cursor = args.cursor as string | undefined;
      const df = (args.df as string) || buildDf(args);

      logger.info("API call: devices.list", { df, limit, cursor });

      const devices = await client.devices.list({
        pageSize: limit,
        cursor,
        ...(df ? {} : { organizationId: args.organization_id as number | undefined }),
      });

      // If using df, we need to pass it via the detailed endpoint since basic list doesn't support df.
      // Actually the basic /v2/devices supports df too per the API docs, but our client needs updating.
      // For now, use listDetailed when df is set.
      let result;
      if (df) {
        result = await client.devices.listDetailed({ df, pageSize: limit, cursor });
      } else {
        result = devices;
      }

      logger.debug("API response: devices.list", { deviceCount: result.length });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: result.length, devices: result }, null, 2),
          },
        ],
      };
    }

    case "ninjaone_devices_list_detailed": {
      const limit = (args.limit as number) || 50;
      const df = (args.df as string) || buildDf(args);

      logger.info("API call: devices.listDetailed", { df, limit });

      const devices = await client.devices.listDetailed({ df, pageSize: limit });
      logger.debug("API response: devices.listDetailed", { deviceCount: devices.length });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: devices.length, devices }, null, 2),
          },
        ],
      };
    }

    case "ninjaone_devices_search": {
      const query = args.query as string;
      const limit = (args.limit as number) || 50;

      logger.info("API call: devices.search", { query, limit });

      const response = await client.devices.search(query, limit);
      logger.debug("API response: devices.search", { response });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    }

    case "ninjaone_devices_get": {
      const deviceId = (args.device_id ?? args.deviceId ?? args.id) as number;
      if (!deviceId) {
        return {
          content: [{ type: "text", text: "Error: device_id is required" }],
          isError: true,
        };
      }
      logger.info("API call: devices.get", { deviceId });
      const device = await client.devices.get(deviceId);
      logger.debug("API response: devices.get", { device });

      return {
        content: [{ type: "text", text: JSON.stringify(device, null, 2) }],
      };
    }

    case "ninjaone_devices_health": {
      const limit = (args.limit as number) || 200;
      const df = (args.df as string) || buildDf(args);

      logger.info("API call: queries.deviceHealth", { df, limit });

      const response = await client.queries.deviceHealth({ df, pageSize: limit });
      const results = response.results || [];
      logger.debug("API response: queries.deviceHealth", { count: results.length });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: results.length, results }, null, 2),
          },
        ],
      };
    }

    case "ninjaone_devices_os": {
      const limit = (args.limit as number) || 200;
      const df = (args.df as string) || buildDf(args);

      logger.info("API call: queries.operatingSystems", { df, limit });

      const response = await client.queries.operatingSystems({ df, pageSize: limit });
      const results = response.results || [];
      logger.debug("API response: queries.operatingSystems", { count: results.length });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: results.length, results }, null, 2),
          },
        ],
      };
    }

    case "ninjaone_devices_software": {
      const deviceId = args.device_id as number;
      logger.info("API call: devices.getSoftware", { deviceId });
      const software = await client.devices.getSoftware(deviceId);
      logger.debug("API response: devices.getSoftware", { count: Array.isArray(software) ? software.length : 0 });

      return {
        content: [{ type: "text", text: JSON.stringify(software, null, 2) }],
      };
    }

    case "ninjaone_devices_disks": {
      const deviceId = args.device_id as number;
      logger.info("API call: devices.getDisks", { deviceId });
      const disks = await client.devices.getDisks(deviceId);

      return {
        content: [{ type: "text", text: JSON.stringify(disks, null, 2) }],
      };
    }

    case "ninjaone_devices_volumes": {
      const deviceId = args.device_id as number;
      const includeBl = args.include_bitlocker ? "bl" : undefined;
      logger.info("API call: devices.getVolumes", { deviceId, includeBl });
      const volumes = await client.devices.getVolumes(deviceId, includeBl);

      return {
        content: [{ type: "text", text: JSON.stringify(volumes, null, 2) }],
      };
    }

    case "ninjaone_devices_network_interfaces": {
      const deviceId = args.device_id as number;
      logger.info("API call: devices.getNetworkInterfaces", { deviceId });
      const interfaces = await client.devices.getNetworkInterfaces(deviceId);

      return {
        content: [{ type: "text", text: JSON.stringify(interfaces, null, 2) }],
      };
    }

    case "ninjaone_devices_os_patches": {
      const deviceId = args.device_id as number;
      const patchType = (args.type as string) || "pending";
      const query: Record<string, unknown> = {};
      if (args.status) query.status = args.status;
      if (args.installed_after) query.installedAfter = args.installed_after;
      if (args.installed_before) query.installedBefore = args.installed_before;

      logger.info("API call: devices.getOsPatches", { deviceId, patchType, query });

      let patches;
      if (patchType === "installed") {
        patches = await client.devices.getOsPatchInstalls(deviceId, query);
      } else {
        patches = await client.devices.getOsPatches(deviceId, query);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(patches, null, 2) }],
      };
    }

    case "ninjaone_devices_custom_fields": {
      const deviceId = args.device_id as number;
      logger.info("API call: devices.getCustomFields", { deviceId });
      const fields = await client.devices.getCustomFields(deviceId);

      return {
        content: [{ type: "text", text: JSON.stringify(fields, null, 2) }],
      };
    }

    case "ninjaone_devices_reboot": {
      const deviceId = args.device_id as number;
      const reason = args.reason as string | undefined;
      logger.info("API call: devices.reboot", { deviceId, reason });
      const result = await client.devices.reboot(deviceId, reason);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: "Reboot scheduled", result },
              null,
              2
            ),
          },
        ],
      };
    }

    case "ninjaone_devices_services": {
      const deviceId = args.device_id as number;
      const stateFilter = args.state as string | undefined;
      logger.info("API call: devices.getServices", { deviceId, state: stateFilter });
      let services = await client.devices.getServices(deviceId);
      if (stateFilter) {
        services = services.filter((s) => s.state === stateFilter);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(services, null, 2) }],
      };
    }

    case "ninjaone_devices_alerts": {
      const deviceId = args.device_id as number;
      const severityFilter = args.severity as string | undefined;
      logger.info("API call: alerts.listByDevice", { deviceId, severity: severityFilter });
      let alerts = await client.alerts.listByDevice(deviceId);
      if (severityFilter) {
        alerts = alerts.filter((a) => a.severity === severityFilter);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(alerts, null, 2) }],
      };
    }

    case "ninjaone_devices_activities": {
      const deviceId = args.device_id as number;
      const limit = (args.limit as number) || 50;
      logger.info("API call: devices.getActivities", { deviceId, limit });
      const activities = await client.devices.getActivities(deviceId, {
        pageSize: limit,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(activities, null, 2) }],
      };
    }

    case "ninjaone_devices_processors": {
      const deviceId = args.device_id as number;
      logger.info("API call: devices.getProcessors", { deviceId });
      const processors = await client.devices.getProcessors(deviceId);

      return {
        content: [{ type: "text", text: JSON.stringify(processors, null, 2) }],
      };
    }

    case "ninjaone_devices_last_user": {
      const deviceId = args.device_id as number;
      logger.info("API call: devices.getLastLoggedOnUser", { deviceId });
      const user = await client.devices.getLastLoggedOnUser(deviceId);

      return {
        content: [{ type: "text", text: JSON.stringify(user, null, 2) }],
      };
    }

    case "ninjaone_devices_hardware": {
      const limit = (args.limit as number) || 200;
      const df = (args.df as string) || buildDf(args);

      logger.info("API call: queries.computerSystems", { df, limit });

      const response = await client.queries.computerSystems({ df, pageSize: limit });
      const results = response.results || [];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ total: results.length, results }, null, 2),
          },
        ],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown device tool: ${toolName}` }],
        isError: true,
      };
  }
}

export const devicesHandler: DomainHandler = {
  getTools,
  handleCall,
};
