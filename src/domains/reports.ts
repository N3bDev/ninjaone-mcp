/**
 * Reports domain handler
 *
 * Provides a single tool for generating device and ticket reports
 * from NinjaOne data with built-in filtering and formatting.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { DomainHandler, CallToolResult } from "../utils/types.js";
import type { ApiRecord, TicketStatus, TicketPriority } from "../ninjaone/index.js";
import type { NinjaOneClient } from "../ninjaone/client.js";
import { getClient } from "../utils/client.js";
import { logger } from "../utils/logger.js";

// ── Device filter builder ─────────────────────────────────────

/**
 * Build a NinjaOne device filter (`df`) string from report parameters.
 */
function buildDeviceFilter(args: Record<string, unknown>): string | undefined {
  const parts: string[] = [];

  if (args.organization_id) {
    parts.push(`org=${args.organization_id}`);
  }
  if (args.device_class) {
    parts.push(`class=${args.device_class}`);
  }

  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

/**
 * Build a device filter that includes the offline predicate.
 */
function buildOfflineDeviceFilter(args: Record<string, unknown>): string {
  const base = buildDeviceFilter(args);
  return base ? `offline AND ${base}` : "offline";
}

// ── Timestamp helpers ─────────────────────────────────────────

/** Convert a NinjaOne timestamp to milliseconds. Handles both seconds and ms. */
function toMs(ts: unknown): number {
  const n = Number(ts);
  if (!n || isNaN(n)) return 0;
  // If the number is smaller than year 2100 in seconds (~4.1e9), treat as seconds
  return n < 5_000_000_000 ? n * 1000 : n;
}

function daysAgo(days: number): number {
  return Date.now() - days * 86_400_000;
}

function formatDuration(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days}d`;
  const hours = Math.floor(ms / 3_600_000);
  return `${hours}h`;
}

function formatDate(ts: number): string {
  return new Date(ts).toISOString().split("T")[0];
}

// ── Output formatting ─────────────────────────────────────────

type FormatType = "summary" | "detailed" | "csv";

interface ReportResult {
  title: string;
  total: number;
  records: ApiRecord[];
  groups?: Record<string, number>;
  extraLines?: string[];
}

function formatReport(result: ReportResult, format: FormatType, csvColumns?: string[]): string {
  const { title, total, records, groups, extraLines } = result;

  if (format === "detailed") {
    return JSON.stringify(
      {
        report: title,
        total,
        generated: new Date().toISOString(),
        ...(groups ? { groups } : {}),
        records,
      },
      null,
      2
    );
  }

  if (format === "csv" && csvColumns) {
    const header = csvColumns.join(",");
    const rows = records.map((r) => {
      const rec = r as Record<string, unknown>;
      return csvColumns
        .map((col) => {
          const val = rec[col];
          if (val === undefined || val === null) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(",");
    });
    return [
      `# ${title}`,
      `# Total: ${total} | Generated: ${new Date().toISOString()}`,
      header,
      ...rows,
    ].join("\n");
  }

  // Summary format (default)
  const lines: string[] = [
    `## ${title}`,
    `**Total:** ${total} | **Generated:** ${new Date().toISOString()}`,
    "",
  ];

  if (groups && Object.keys(groups).length > 0) {
    lines.push("### Breakdown");
    for (const [key, count] of Object.entries(groups)) {
      lines.push(`- **${key}**: ${count}`);
    }
    lines.push("");
  }

  if (extraLines && extraLines.length > 0) {
    lines.push(...extraLines, "");
  }

  // Show top records in summary
  if (records.length > 0) {
    const showCount = Math.min(records.length, 10);
    lines.push(`### Top ${showCount} Records`);
    for (let i = 0; i < showCount; i++) {
      const rec = records[i] as Record<string, unknown>;
      const name =
        rec.displayName || rec.systemName || rec.subject || rec.name || `ID: ${rec.id || rec.deviceId}`;
      const detail = rec._reportDetail || "";
      lines.push(`${i + 1}. **${name}**${detail ? ` — ${detail}` : ""}`);
    }
  }

  return lines.join("\n");
}

// ── Report implementations ────────────────────────────────────

async function reportDevicesOffline(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  const days = (args.days as number) || 30;
  const df = buildOfflineDeviceFilter(args);
  const cutoff = daysAgo(days);

  logger.info("Report: devices_offline", { df, days, cutoff });

  const devices = await client.devices.listDetailed({ df, pageSize: Math.min(limit, 1000) });

  // Client-side duration filter: only include devices offline for >= `days`
  const filtered = devices
    .filter((d) => {
      const lastContact = toMs((d as Record<string, unknown>).lastContact);
      return lastContact > 0 && lastContact <= cutoff;
    })
    .sort((a, b) => {
      const aTime = toMs((a as Record<string, unknown>).lastContact);
      const bTime = toMs((b as Record<string, unknown>).lastContact);
      return aTime - bTime; // Longest offline first
    })
    .slice(0, limit);

  // Enrich with report detail
  const now = Date.now();
  const records = filtered.map((d) => {
    const rec = d as Record<string, unknown>;
    const lastContact = toMs(rec.lastContact);
    const offlineDuration = now - lastContact;
    return {
      ...rec,
      _reportDetail: `Offline for ${formatDuration(offlineDuration)} (last seen: ${formatDate(lastContact)})`,
      _offlineDays: Math.floor(offlineDuration / 86_400_000),
    };
  });

  // Group by organization if multiple
  const groups: Record<string, number> = {};
  for (const rec of records) {
    const r = rec as Record<string, unknown>;
    const orgName = String(
      (r.references as Record<string, unknown>)?.organization
        ? ((r.references as Record<string, unknown>).organization as Record<string, unknown>).name
        : r.organizationId || "Unknown"
    );
    groups[orgName] = (groups[orgName] || 0) + 1;
  }

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: `Devices Offline ${days}+ Days`,
            total: records.length,
            records,
            groups: Object.keys(groups).length > 1 ? groups : undefined,
          },
          format,
          ["id", "displayName", "systemName", "organizationId", "nodeClass", "lastContact", "_offlineDays"]
        ),
      },
    ],
  };
}

async function reportDevicesSummary(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  const df = buildDeviceFilter(args);
  logger.info("Report: devices_summary", { df });

  const response = await client.queries.deviceHealth({ df, pageSize: Math.min(limit, 1000) });
  const results = response.results || [];

  let offlineCount = 0;
  let alertCount = 0;
  let patchIssues = 0;
  let threatCount = 0;
  let healthCounts: Record<string, number> = {};

  for (const r of results) {
    const rec = r as Record<string, unknown>;
    if (rec.offline) offlineCount++;
    alertCount += (rec.alertCount as number) || 0;
    patchIssues += ((rec.failedOSPatchesCount as number) || 0) + ((rec.failedSoftwarePatchesCount as number) || 0);
    threatCount += (rec.activeThreatsCount as number) || 0;
    const health = String(rec.healthStatus || "UNKNOWN");
    healthCounts[health] = (healthCounts[health] || 0) + 1;
  }

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: "Device Health Summary",
            total: results.length,
            records: results.slice(0, limit),
            groups: healthCounts,
            extraLines: [
              `### Key Metrics`,
              `- **Offline:** ${offlineCount}`,
              `- **Active Alerts:** ${alertCount}`,
              `- **Patch Failures:** ${patchIssues}`,
              `- **Active Threats:** ${threatCount}`,
            ],
          },
          format,
          ["deviceId", "healthStatus", "offline", "alertCount", "activeThreatsCount", "failedOSPatchesCount", "pendingOSPatchesCount"]
        ),
      },
    ],
  };
}

async function reportDevicesByOs(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  const df = buildDeviceFilter(args);
  logger.info("Report: devices_by_os", { df });

  const response = await client.queries.operatingSystems({ df, pageSize: Math.min(limit, 1000) });
  const results = response.results || [];

  const groups: Record<string, number> = {};
  for (const r of results) {
    const rec = r as Record<string, unknown>;
    const osName = String(rec.name || "Unknown");
    groups[osName] = (groups[osName] || 0) + 1;
  }

  // Sort groups by count descending
  const sortedGroups = Object.fromEntries(
    Object.entries(groups).sort(([, a], [, b]) => b - a)
  );

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: "Devices by Operating System",
            total: results.length,
            records: results.slice(0, limit),
            groups: sortedGroups,
          },
          format,
          ["deviceId", "name", "architecture", "buildNumber", "releaseId", "lastBootTime"]
        ),
      },
    ],
  };
}

async function reportTicketsRecent(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  const days = (args.days as number) || 7;
  const cutoffMs = daysAgo(days);

  logger.info("Report: tickets_recent", { days, cutoffDate: new Date(cutoffMs).toISOString() });

  const tickets = await client.tickets.listAll({
    status: args.status as TicketStatus | undefined,
    priority: args.priority as TicketPriority | undefined,
    organizationId: args.organization_id as number | undefined,
    boardId: args.board_id as number | undefined,
    maxRecords: limit,
    createdAfterMs: cutoffMs,
  });

  const filtered = tickets;

  // Sort newest first
  filtered.sort((a, b) => {
    const aTime = toMs((a as Record<string, unknown>).createTime);
    const bTime = toMs((b as Record<string, unknown>).createTime);
    return bTime - aTime;
  });

  const records = filtered.slice(0, limit).map((t) => {
    const rec = t as Record<string, unknown>;
    const createTime = toMs(rec.createTime);
    return {
      ...rec,
      _reportDetail: `Created ${formatDate(createTime)} | Status: ${rec.status || "?"} | Priority: ${rec.priority || "?"}`,
    };
  });

  // Group by status
  const groups: Record<string, number> = {};
  for (const rec of records) {
    const r = rec as Record<string, unknown>;
    const status = String(r.status || "UNKNOWN");
    groups[status] = (groups[status] || 0) + 1;
  }

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: `Tickets Created in Last ${days} Days`,
            total: records.length,
            records,
            groups,
          },
          format,
          ["id", "subject", "status", "priority", "type", "clientId", "createTime", "assignedAppUserId"]
        ),
      },
    ],
  };
}

async function reportTicketsByStatus(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  logger.info("Report: tickets_by_status");

  const tickets = await client.tickets.listAll({
    organizationId: args.organization_id as number | undefined,
    boardId: args.board_id as number | undefined,
    priority: args.priority as TicketPriority | undefined,
    maxRecords: limit,
  });

  const groups: Record<string, number> = {};
  for (const t of tickets) {
    const rec = t as Record<string, unknown>;
    const status = String(rec.status || "UNKNOWN");
    groups[status] = (groups[status] || 0) + 1;
  }

  const sortedGroups = Object.fromEntries(
    Object.entries(groups).sort(([, a], [, b]) => b - a)
  );

  const records = tickets.slice(0, limit).map((t) => {
    const rec = t as Record<string, unknown>;
    return {
      ...rec,
      _reportDetail: `Status: ${rec.status || "?"} | Priority: ${rec.priority || "?"}`,
    };
  });

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: "Tickets by Status",
            total: tickets.length,
            records,
            groups: sortedGroups,
          },
          format,
          ["id", "subject", "status", "priority", "type", "clientId", "createTime"]
        ),
      },
    ],
  };
}

async function reportTicketsByPriority(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  logger.info("Report: tickets_by_priority");

  const tickets = await client.tickets.listAll({
    organizationId: args.organization_id as number | undefined,
    boardId: args.board_id as number | undefined,
    status: args.status as TicketStatus | undefined,
    maxRecords: limit,
  });

  const groups: Record<string, number> = {};
  for (const t of tickets) {
    const rec = t as Record<string, unknown>;
    const priority = String(rec.priority || "UNKNOWN");
    groups[priority] = (groups[priority] || 0) + 1;
  }

  // Sort by priority order
  const priorityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE", "UNKNOWN"];
  const sortedGroups = Object.fromEntries(
    Object.entries(groups).sort(
      ([a], [b]) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b)
    )
  );

  const records = tickets.slice(0, limit).map((t) => {
    const rec = t as Record<string, unknown>;
    return {
      ...rec,
      _reportDetail: `Priority: ${rec.priority || "?"} | Status: ${rec.status || "?"}`,
    };
  });

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: "Tickets by Priority",
            total: tickets.length,
            records,
            groups: sortedGroups,
          },
          format,
          ["id", "subject", "priority", "status", "type", "clientId", "createTime"]
        ),
      },
    ],
  };
}

async function reportTicketsAging(
  client: NinjaOneClient,
  args: Record<string, unknown>,
  format: FormatType,
  limit: number
): Promise<CallToolResult> {
  const days = (args.days as number) || 0; // 0 = all non-closed tickets
  logger.info("Report: tickets_aging", { days });

  const tickets = await client.tickets.listAll({
    organizationId: args.organization_id as number | undefined,
    boardId: args.board_id as number | undefined,
    maxRecords: limit,
  });

  const now = Date.now();

  // Filter to non-closed tickets and compute age
  const closedStatuses = new Set(["CLOSED", "RESOLVED"]);
  let aged = tickets
    .filter((t) => {
      const rec = t as Record<string, unknown>;
      // Exclude closed/resolved tickets
      const status = String(rec.status || "");
      // The board search returns status as an object or string depending on context
      const statusName = typeof rec.status === "object" && rec.status !== null
        ? String((rec.status as Record<string, unknown>).name || "")
        : status;
      return !closedStatuses.has(statusName.toUpperCase());
    })
    .map((t) => {
      const rec = t as Record<string, unknown>;
      const createTime = toMs(rec.createTime);
      const age = now - createTime;
      return {
        ...rec,
        _ageDays: Math.floor(age / 86_400_000),
        _reportDetail: `Age: ${formatDuration(age)} | Status: ${rec.status || "?"} | Priority: ${rec.priority || "?"}`,
      };
    })
    .sort((a, b) => (b._ageDays as number) - (a._ageDays as number));

  // If days specified, only show tickets older than N days
  if (days > 0) {
    aged = aged.filter((t) => (t._ageDays as number) >= days);
  }

  const records = aged.slice(0, limit);

  // Group by age brackets
  const brackets: Record<string, number> = {
    "0-7 days": 0,
    "7-30 days": 0,
    "30-90 days": 0,
    "90+ days": 0,
  };
  for (const rec of aged) {
    const d = rec._ageDays as number;
    if (d < 7) brackets["0-7 days"]++;
    else if (d < 30) brackets["7-30 days"]++;
    else if (d < 90) brackets["30-90 days"]++;
    else brackets["90+ days"]++;
  }

  return {
    content: [
      {
        type: "text",
        text: formatReport(
          {
            title: days > 0 ? `Open Tickets Older Than ${days} Days` : "Ticket Aging Report",
            total: aged.length,
            records,
            groups: brackets,
          },
          format,
          ["id", "subject", "status", "priority", "type", "clientId", "createTime", "_ageDays"]
        ),
      },
    ],
  };
}

// ── Tool definitions ──────────────────────────────────────────

function getTools(): Tool[] {
  return [
    {
      name: "ninjaone_reports_generate",
      description:
        "Generate a report from NinjaOne data in a single call. Supports device reports (offline devices, health summary, OS breakdown) and ticket reports (recent tickets, status/priority breakdown, aging). Uses server-side filtering where possible for efficiency.",
      inputSchema: {
        type: "object" as const,
        properties: {
          report_type: {
            type: "string",
            enum: [
              "devices_offline",
              "devices_summary",
              "devices_by_os",
              "tickets_recent",
              "tickets_by_status",
              "tickets_by_priority",
              "tickets_aging",
            ],
            description:
              "Type of report. devices_offline = devices offline for N+ days. devices_summary = device health overview. devices_by_os = device count by OS. tickets_recent = tickets created in last N days. tickets_by_status = ticket breakdown by status. tickets_by_priority = ticket breakdown by priority. tickets_aging = open tickets sorted by age.",
          },
          days: {
            type: "number",
            description:
              "Time window in days. For devices_offline: minimum offline duration (default: 30). For tickets_recent: lookback period (default: 7). For tickets_aging: minimum age filter (default: 0 = all open).",
          },
          organization_id: {
            type: "number",
            description: "Scope report to a specific organization ID.",
          },
          device_class: {
            type: "string",
            enum: [
              "WINDOWS_WORKSTATION",
              "WINDOWS_SERVER",
              "MAC",
              "LINUX_WORKSTATION",
              "LINUX_SERVER",
              "VMWARE_VM_HOST",
              "VMWARE_VM_GUEST",
              "MAC_SERVER",
            ],
            description: "Filter by device class (device reports only).",
          },
          status: {
            type: "string",
            description: "Filter tickets by status (ticket reports only).",
          },
          priority: {
            type: "string",
            enum: ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
            description: "Filter tickets by priority (ticket reports only).",
          },
          board_id: {
            type: "number",
            description: "Filter tickets by board ID (ticket reports only).",
          },
          format: {
            type: "string",
            enum: ["summary", "detailed", "csv"],
            description:
              "Output format. summary = markdown with counts and top items (default). detailed = full JSON records. csv = comma-separated values.",
          },
          limit: {
            type: "number",
            description: "Maximum number of records to include (default: 200, max: 1000).",
          },
        },
        required: ["report_type"],
      },
    },
  ];
}

// ── Handler ───────────────────────────────────────────────────

async function handleCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (toolName !== "ninjaone_reports_generate") {
    return {
      content: [{ type: "text", text: `Unknown report tool: ${toolName}` }],
      isError: true,
    };
  }

  const client = await getClient();
  const reportType = args.report_type as string;
  const format = (args.format as FormatType) || "summary";
  const limit = Math.min((args.limit as number) || 200, 1000);

  switch (reportType) {
    case "devices_offline":
      return reportDevicesOffline(client, args, format, limit);
    case "devices_summary":
      return reportDevicesSummary(client, args, format, limit);
    case "devices_by_os":
      return reportDevicesByOs(client, args, format, limit);
    case "tickets_recent":
      return reportTicketsRecent(client, args, format, limit);
    case "tickets_by_status":
      return reportTicketsByStatus(client, args, format, limit);
    case "tickets_by_priority":
      return reportTicketsByPriority(client, args, format, limit);
    case "tickets_aging":
      return reportTicketsAging(client, args, format, limit);
    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown report type: ${reportType}. Valid types: devices_offline, devices_summary, devices_by_os, tickets_recent, tickets_by_status, tickets_by_priority, tickets_aging`,
          },
        ],
        isError: true,
      };
  }
}

export const reportsHandler: DomainHandler = {
  getTools,
  handleCall,
};
