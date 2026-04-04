/**
 * NinjaOne API type definitions
 *
 * These types mirror the NinjaOne REST API v2 data model.
 * Only fields actively used by the MCP domain handlers are typed;
 * additional fields returned by the API are preserved via permissive typing.
 */

// ── Ticket enums ───────────────────────────────────────────────

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "ON_HOLD"
  | "RESOLVED"
  | "CLOSED";

export type TicketPriority =
  | "NONE"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

export type TicketType =
  | "PROBLEM"
  | "QUESTION"
  | "INCIDENT"
  | "TASK"
  | "ALERT";

// ── Alert enums ────────────────────────────────────────────────

export type AlertSeverity =
  | "CRITICAL"
  | "MAJOR"
  | "MINOR"
  | "NONE";

export type AlertSourceType = string;

// ── Client configuration ───────────────────────────────────────

export interface NinjaOneClientConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

// ── OAuth2 ─────────────────────────────────────────────────────

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

// ── Generic API types ──────────────────────────────────────────

/** Permissive record — the API may return more fields than we type. */
export type ApiRecord = Record<string, unknown>;

export interface PaginatedResponse<T = ApiRecord> {
  data: T[];
  cursor?: string;
  totalCount?: number;
}

// ── Ticket request types ───────────────────────────────────────

export interface TicketListParams {
  status?: TicketStatus;
  priority?: TicketPriority;
  organizationId?: number;
  deviceId?: number;
  boardId?: number;
  pageSize?: number;
  cursor?: string;
}

export interface TicketCreateParams {
  subject: string;
  clientId: number;
  description?: { public: boolean; body: string; htmlBody?: string; timeTracked?: number };
  nodeId?: number;
  status?: string;
  priority?: TicketPriority;
  severity?: string;
  type?: TicketType;
  tags?: string[];
  boardId?: number;
  ticketFormId?: number;
  requesterUid?: string;
  dueDate?: number;
  attributes?: unknown[];
  assignedAppUserId?: number;
  [key: string]: unknown;
}

export interface TicketUpdateParams {
  version?: number;
  subject?: string;
  status?: string;
  priority?: TicketPriority;
  severity?: string;
  type?: TicketType;
  assignedAppUserId?: number;
  clientId?: number;
  nodeId?: number;
  locationId?: number;
  ticketFormId?: number;
  requesterUid?: string;
  tags?: string[];
  dueDate?: number;
  attributes?: unknown[];
  [key: string]: unknown;
}

export interface TicketCommentParams {
  body: string;
  internal?: boolean;
}

export interface TicketBoardSearchParams {
  sortBy?: Array<{ field: string; direction: string }>;
  pageSize?: number;
  lastCursorId?: string | number;
  searchCriteria?: string;
  filters?: Array<{ field: string; operator: string; value: string }>;
}

// ── Device request types ───────────────────────────────────────

export interface DeviceListParams {
  organizationId?: number;
  pageSize?: number;
  cursor?: string;
}

export interface DeviceActivityParams {
  pageSize?: number;
}

// ── Organization request types ─────────────────────────────────

export interface OrganizationListParams {
  pageSize?: number;
  cursor?: string;
}

export interface OrganizationCreateParams {
  name: string;
  description?: string;
  nodeApprovalMode?: string;
  policyId?: number;
  [key: string]: unknown;
}

// ── Alert request types ────────────────────────────────────────

export interface AlertListParams {
  severity?: AlertSeverity;
  organizationId?: number;
  deviceId?: number;
  sourceType?: AlertSourceType;
  pageSize?: number;
  cursor?: string;
}

// ── Query / Report request types ──────────────────────────────

/** Parameters for /v2/queries/* endpoints that support the device filter */
export interface QueryParams {
  df?: string;
  pageSize?: number;
  cursor?: string;
}

/** Parameters for /v2/devices-detailed */
export interface DeviceDetailedListParams {
  df?: string;
  pageSize?: number;
  cursor?: string;
  organizationId?: number;
}

/** Paginated response from /v2/queries/* endpoints */
export interface QueryResponse<T = ApiRecord> {
  cursor?: { name: string; offset: number; count: number; expires: number };
  results: T[];
}

// ── Activity request types ────────────────────────────────────

export interface ActivityListParams {
  activityType?: string;
  status?: string;
  deviceId?: number;
  seriesUid?: string;
  olderThan?: number;
  newerThan?: number;
  pageSize?: number;
  lang?: string;
  tz?: string;
}
