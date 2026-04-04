/**
 * NinjaOne API Client
 *
 * High-level client that maps method calls to NinjaOne REST API v2 endpoints.
 * Exposes .devices, .organizations, .alerts, and .tickets sub-APIs.
 */

import { NinjaOneHttp } from "./http.js";
import type {
  NinjaOneClientConfig,
  ApiRecord,
  TicketListParams,
  TicketCreateParams,
  TicketUpdateParams,
  TicketCommentParams,
  TicketBoardSearchParams,
  DeviceListParams,
  DeviceActivityParams,
  OrganizationListParams,
  OrganizationCreateParams,
  AlertListParams,
} from "./types.js";

// ── Devices API ────────────────────────────────────────────────

class DevicesApi {
  constructor(private http: NinjaOneHttp) {}

  async list(params?: DeviceListParams): Promise<ApiRecord[]> {
    const query: Record<string, unknown> = {};
    if (params?.pageSize) query.pageSize = params.pageSize;
    if (params?.cursor) query.cursor = params.cursor;
    if (params?.organizationId) query.organizationId = params.organizationId;

    return this.http.get<ApiRecord[]>("/v2/devices", query);
  }

  async get(deviceId: number): Promise<ApiRecord> {
    return this.http.get<ApiRecord>(`/v2/device/${deviceId}`);
  }

  async reboot(deviceId: number, reason?: string): Promise<unknown> {
    return this.http.post(`/v2/device/${deviceId}/reboot`, reason ? { reason } : undefined);
  }

  async getServices(deviceId: number): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>(`/v2/device/${deviceId}/windows-services`);
  }

  async getActivities(deviceId: number, params?: DeviceActivityParams): Promise<ApiRecord[]> {
    const query: Record<string, unknown> = {};
    if (params?.pageSize) query.pageSize = params.pageSize;

    return this.http.get<ApiRecord[]>(`/v2/device/${deviceId}/activities`, query);
  }

  async listByOrganization(orgId: number, params?: DeviceListParams): Promise<ApiRecord[]> {
    const query: Record<string, unknown> = {};
    if (params?.pageSize) query.pageSize = params.pageSize;

    return this.http.get<ApiRecord[]>(`/v2/organization/${orgId}/devices`, query);
  }
}

// ── Organizations API ──────────────────────────────────────────

class OrganizationsApi {
  constructor(private http: NinjaOneHttp) {}

  async list(params?: OrganizationListParams): Promise<ApiRecord[]> {
    const query: Record<string, unknown> = {};
    if (params?.pageSize) query.pageSize = params.pageSize;
    if (params?.cursor) query.cursor = params.cursor;

    return this.http.get<ApiRecord[]>("/v2/organizations", query);
  }

  async get(orgId: number): Promise<ApiRecord> {
    return this.http.get<ApiRecord>(`/v2/organization/${orgId}`);
  }

  async create(params: OrganizationCreateParams): Promise<ApiRecord> {
    return this.http.post<ApiRecord>("/v2/organizations", params);
  }

  async getLocations(orgId: number): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>(`/v2/organization/${orgId}/locations`);
  }
}

// ── Alerts API ─────────────────────────────────────────────────

class AlertsApi {
  constructor(private http: NinjaOneHttp) {}

  async list(params?: AlertListParams): Promise<ApiRecord[]> {
    const query: Record<string, unknown> = {};
    if (params?.severity) query.severity = params.severity;
    if (params?.organizationId) query.organizationId = params.organizationId;
    if (params?.deviceId) query.deviceId = params.deviceId;
    if (params?.sourceType) query.sourceType = params.sourceType;
    if (params?.pageSize) query.pageSize = params.pageSize;
    if (params?.cursor) query.cursor = params.cursor;

    return this.http.get<ApiRecord[]>("/v2/alerts", query);
  }

  async reset(alertUid: string): Promise<unknown> {
    return this.http.delete(`/v2/alert/${alertUid}`);
  }

  async listByDevice(deviceId: number): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>(`/v2/device/${deviceId}/alerts`);
  }

  async resetByDevice(deviceId: number): Promise<unknown> {
    return this.http.delete(`/v2/device/${deviceId}/alerts`);
  }

  async resetByOrganization(orgId: number): Promise<unknown> {
    return this.http.delete(`/v2/organization/${orgId}/alerts`);
  }
}

// ── Tickets API ────────────────────────────────────────────────

class TicketsApi {
  constructor(private http: NinjaOneHttp) {}

  async list(params?: TicketListParams): Promise<{ tickets: ApiRecord[]; cursor?: string }> {
    // NinjaOne does not support GET /v2/ticketing/ticket (returns 405).
    // Ticket listing is done via the board search endpoint:
    //   POST /v2/ticketing/trigger/board/{boardId}/run
    //
    // If a boardId is provided, search that board directly.
    // Otherwise, discover all boards and aggregate results.

    const pageSize = params?.pageSize ?? 50;

    if (params?.boardId) {
      return this.listByBoard(params.boardId, params, pageSize);
    }

    // No board specified — discover boards and search all of them
    const boards = await this.listBoards();
    if (!Array.isArray(boards) || boards.length === 0) {
      return { tickets: [] };
    }

    const allTickets: ApiRecord[] = [];
    for (const board of boards) {
      const boardId = (board as Record<string, unknown>).id as number;
      if (!boardId) continue;

      const result = await this.listByBoard(boardId, params, pageSize);
      allTickets.push(...result.tickets);

      if (allTickets.length >= pageSize) {
        return { tickets: allTickets.slice(0, pageSize) };
      }
    }

    return { tickets: allTickets };
  }

  private async listByBoard(
    boardId: number,
    params?: TicketListParams,
    pageSize = 50
  ): Promise<{ tickets: ApiRecord[]; cursor?: string }> {
    const response = await this.getTicketsByBoard(boardId, {
      sortBy: [{ field: "lastUpdated", direction: "DESC" }],
      pageSize,
      lastCursorId: params?.cursor,
    });

    const obj = response as Record<string, unknown>;
    let tickets = ((obj.data ?? obj.tickets ?? []) as ApiRecord[]);

    // Apply client-side filters that the board search doesn't support
    if (params?.status) {
      tickets = tickets.filter(
        (t) => (t as Record<string, unknown>).status === params.status
      );
    }
    if (params?.priority) {
      tickets = tickets.filter(
        (t) => (t as Record<string, unknown>).priority === params.priority
      );
    }
    if (params?.organizationId) {
      tickets = tickets.filter(
        (t) => (t as Record<string, unknown>).organizationId === params.organizationId
      );
    }
    if (params?.deviceId) {
      tickets = tickets.filter(
        (t) => (t as Record<string, unknown>).nodeId === params.deviceId
      );
    }

    return {
      tickets,
      cursor: obj.cursor as string | undefined,
    };
  }

  async get(ticketId: number): Promise<ApiRecord> {
    return this.http.get<ApiRecord>(`/v2/ticketing/ticket/${ticketId}`);
  }

  async create(params: TicketCreateParams): Promise<ApiRecord> {
    return this.http.post<ApiRecord>("/v2/ticketing/ticket", params);
  }

  async update(ticketId: number, params: TicketUpdateParams): Promise<ApiRecord> {
    return this.http.put<ApiRecord>(`/v2/ticketing/ticket/${ticketId}`, params);
  }

  async delete(ticketId: number): Promise<void> {
    await this.http.delete(`/v2/ticketing/ticket/${ticketId}`);
  }

  async addComment(ticketId: number, params: TicketCommentParams): Promise<ApiRecord> {
    return this.http.post<ApiRecord>(`/v2/ticketing/ticket/${ticketId}/comment`, params);
  }

  async getComments(ticketId: number, type?: string): Promise<ApiRecord[]> {
    const query: Record<string, unknown> = {};
    if (type) query.type = type;

    return this.http.get<ApiRecord[]>(`/v2/ticketing/ticket/${ticketId}/log-entry`, query);
  }

  async listBoards(): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>("/v2/ticketing/trigger/boards");
  }

  async getTicketsByBoard(
    boardId: number,
    params?: TicketBoardSearchParams
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      sortBy: params?.sortBy ?? [{ field: "lastUpdated", direction: "DESC" }],
      pageSize: params?.pageSize ?? 50,
    };
    if (params?.lastCursorId !== undefined) body.lastCursorId = params.lastCursorId;
    if (params?.searchCriteria) body.searchCriteria = params.searchCriteria;
    if (params?.filters) body.filters = params.filters;

    return this.http.post(`/v2/ticketing/trigger/board/${boardId}/run`, body);
  }

  async listForms(): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>("/v2/ticketing/ticket-form");
  }

  async getForm(formId: number): Promise<ApiRecord> {
    return this.http.get<ApiRecord>(`/v2/ticketing/ticket-form/${formId}`);
  }

  async getStatuses(): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>("/v2/ticketing/statuses");
  }

  async getAttributes(): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>("/v2/ticketing/attributes");
  }

  async getContacts(): Promise<ApiRecord[]> {
    return this.http.get<ApiRecord[]>("/v2/ticketing/contact/contacts");
  }
}

// ── Main client ────────────────────────────────────────────────

export class NinjaOneClient {
  readonly devices: DevicesApi;
  readonly organizations: OrganizationsApi;
  readonly alerts: AlertsApi;
  readonly tickets: TicketsApi;

  constructor(config: NinjaOneClientConfig) {
    const http = new NinjaOneHttp(config);
    this.devices = new DevicesApi(http);
    this.organizations = new OrganizationsApi(http);
    this.alerts = new AlertsApi(http);
    this.tickets = new TicketsApi(http);
  }
}
