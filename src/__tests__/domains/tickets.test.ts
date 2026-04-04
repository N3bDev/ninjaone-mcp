/**
 * Tests for tickets domain handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Create mock functions using vi.hoisted
const {
  mockTicketsList,
  mockTicketsGet,
  mockTicketsCreate,
  mockTicketsUpdate,
  mockTicketsDelete,
  mockTicketsAddComment,
  mockTicketsGetComments,
  mockTicketsListBoards,
  mockTicketsGetTicketsByBoard,
  mockTicketsListForms,
  mockTicketsGetForm,
  mockTicketsGetStatuses,
  mockTicketsGetAttributes,
  mockTicketsGetContacts,
  mockClient,
} = vi.hoisted(() => {
  const mockTicketsList = vi.fn();
  const mockTicketsGet = vi.fn();
  const mockTicketsCreate = vi.fn();
  const mockTicketsUpdate = vi.fn();
  const mockTicketsDelete = vi.fn();
  const mockTicketsAddComment = vi.fn();
  const mockTicketsGetComments = vi.fn();
  const mockTicketsListBoards = vi.fn();
  const mockTicketsGetTicketsByBoard = vi.fn();
  const mockTicketsListForms = vi.fn();
  const mockTicketsGetForm = vi.fn();
  const mockTicketsGetStatuses = vi.fn();
  const mockTicketsGetAttributes = vi.fn();
  const mockTicketsGetContacts = vi.fn();

  const mockClient = {
    tickets: {
      list: mockTicketsList,
      get: mockTicketsGet,
      create: mockTicketsCreate,
      update: mockTicketsUpdate,
      delete: mockTicketsDelete,
      addComment: mockTicketsAddComment,
      getComments: mockTicketsGetComments,
      listBoards: mockTicketsListBoards,
      getTicketsByBoard: mockTicketsGetTicketsByBoard,
      listForms: mockTicketsListForms,
      getForm: mockTicketsGetForm,
      getStatuses: mockTicketsGetStatuses,
      getAttributes: mockTicketsGetAttributes,
      getContacts: mockTicketsGetContacts,
    },
  };

  return {
    mockTicketsList,
    mockTicketsGet,
    mockTicketsCreate,
    mockTicketsUpdate,
    mockTicketsDelete,
    mockTicketsAddComment,
    mockTicketsGetComments,
    mockTicketsListBoards,
    mockTicketsGetTicketsByBoard,
    mockTicketsListForms,
    mockTicketsGetForm,
    mockTicketsGetStatuses,
    mockTicketsGetAttributes,
    mockTicketsGetContacts,
    mockClient,
  };
});

// Mock the client module before importing the handler
vi.mock("../../utils/client.js", () => ({
  getClient: () => Promise.resolve(mockClient),
  clearClient: vi.fn(),
  getCredentials: () => ({
    clientId: "test",
    clientSecret: "test",
    region: "us",
    baseUrl: "https://app.ninjarmm.com",
  }),
}));

// Import handler after mocking
import { ticketsHandler } from "../../domains/tickets.js";

describe("Tickets Domain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset mock implementations
    mockTicketsList.mockResolvedValue({
      tickets: [
        { id: 1, subject: "Ticket 1", status: "OPEN", priority: "HIGH", type: "INCIDENT" },
        { id: 2, subject: "Ticket 2", status: "IN_PROGRESS", priority: "MEDIUM", type: "TASK" },
      ],
      cursor: "next-page",
    });
    mockTicketsGet.mockResolvedValue({
      id: 1,
      version: 3,
      subject: "Ticket 1",
      description: "Test ticket",
      status: "OPEN",
    });
    mockTicketsCreate.mockResolvedValue({
      id: 100,
      subject: "New Ticket",
      status: "OPEN",
    });
    mockTicketsUpdate.mockResolvedValue({
      id: 1,
      subject: "Updated Ticket",
      status: "IN_PROGRESS",
    });
    mockTicketsDelete.mockResolvedValue(undefined);
    mockTicketsAddComment.mockResolvedValue({
      id: 50,
      ticketId: 1,
      body: "Test comment",
    });
    mockTicketsGetComments.mockResolvedValue([
      { id: 1, body: "Comment 1", type: "COMMENT" },
      { id: 2, body: "Description update", type: "DESCRIPTION" },
    ]);
    mockTicketsListBoards.mockResolvedValue([
      { id: 1, name: "Support Board" },
      { id: 2, name: "Engineering Board" },
    ]);
    mockTicketsGetTicketsByBoard.mockResolvedValue({
      tickets: [
        { id: 1, subject: "Board Ticket 1" },
      ],
      cursor: null,
    });
    mockTicketsListForms.mockResolvedValue([
      { id: 1, name: "Default Form", isDefault: true },
      { id: 2, name: "Hardware Request", isDefault: false },
    ]);
    mockTicketsGetForm.mockResolvedValue({
      id: 1,
      name: "Default Form",
      fields: [{ name: "customField1", type: "TEXT", required: false }],
    });
    mockTicketsGetStatuses.mockResolvedValue([
      { id: 1, name: "Open", statusCode: "OPEN" },
      { id: 2, name: "In Progress", statusCode: "IN_PROGRESS" },
      { id: 3, name: "Waiting", statusCode: "WAITING" },
      { id: 4, name: "Closed", statusCode: "CLOSED" },
    ]);
    mockTicketsGetAttributes.mockResolvedValue([
      { id: 1, name: "Custom Field 1", type: "text" },
      { id: 2, name: "Custom Field 2", type: "dropdown" },
    ]);
    mockTicketsGetContacts.mockResolvedValue([
      { id: 1, name: "John Doe", email: "john@example.com" },
    ]);
  });

  describe("getTools", () => {
    it("should return all ticket tools", () => {
      const tools = ticketsHandler.getTools();

      expect(tools.length).toBe(15);

      const toolNames = tools.map((t) => t.name);
      // Core CRUD
      expect(toolNames).toContain("ninjaone_tickets_list");
      expect(toolNames).toContain("ninjaone_tickets_get");
      expect(toolNames).toContain("ninjaone_tickets_create");
      expect(toolNames).toContain("ninjaone_tickets_update");
      expect(toolNames).toContain("ninjaone_tickets_delete");
      // Comments & Log Entries
      expect(toolNames).toContain("ninjaone_tickets_add_comment");
      expect(toolNames).toContain("ninjaone_tickets_log_entries");
      // Boards
      expect(toolNames).toContain("ninjaone_tickets_list_boards");
      expect(toolNames).toContain("ninjaone_tickets_board_tickets");
      // Forms & Config
      expect(toolNames).toContain("ninjaone_tickets_list_forms");
      expect(toolNames).toContain("ninjaone_tickets_get_form");
      expect(toolNames).toContain("ninjaone_tickets_list_statuses");
      expect(toolNames).toContain("ninjaone_tickets_list_attributes");
      // Contacts
      expect(toolNames).toContain("ninjaone_tickets_list_contacts");
      // Summary
      expect(toolNames).toContain("ninjaone_tickets_summary");
    });

    it("ninjaone_tickets_get should require ticket_id", () => {
      const tools = ticketsHandler.getTools();
      const getTool = tools.find((t) => t.name === "ninjaone_tickets_get");
      expect(getTool?.inputSchema.required).toContain("ticket_id");
    });

    it("ninjaone_tickets_create should require subject and organization_id", () => {
      const tools = ticketsHandler.getTools();
      const createTool = tools.find((t) => t.name === "ninjaone_tickets_create");
      expect(createTool?.inputSchema.required).toContain("subject");
      expect(createTool?.inputSchema.required).toContain("organization_id");
    });

    it("ninjaone_tickets_add_comment should require ticket_id and body", () => {
      const tools = ticketsHandler.getTools();
      const commentTool = tools.find((t) => t.name === "ninjaone_tickets_add_comment");
      expect(commentTool?.inputSchema.required).toContain("ticket_id");
      expect(commentTool?.inputSchema.required).toContain("body");
    });

    it("ninjaone_tickets_delete should require ticket_id", () => {
      const tools = ticketsHandler.getTools();
      const tool = tools.find((t) => t.name === "ninjaone_tickets_delete");
      expect(tool?.inputSchema.required).toContain("ticket_id");
    });

    it("ninjaone_tickets_board_tickets should require board_id", () => {
      const tools = ticketsHandler.getTools();
      const tool = tools.find((t) => t.name === "ninjaone_tickets_board_tickets");
      expect(tool?.inputSchema.required).toContain("board_id");
    });

    it("ninjaone_tickets_get_form should require form_id", () => {
      const tools = ticketsHandler.getTools();
      const tool = tools.find((t) => t.name === "ninjaone_tickets_get_form");
      expect(tool?.inputSchema.required).toContain("form_id");
    });

    it("should include extended status enums (ON_HOLD, RESOLVED)", () => {
      const tools = ticketsHandler.getTools();
      const listTool = tools.find((t) => t.name === "ninjaone_tickets_list");
      const statusProp = listTool?.inputSchema.properties?.status as { enum?: string[] };
      expect(statusProp?.enum).toContain("ON_HOLD");
      expect(statusProp?.enum).toContain("RESOLVED");
    });

    it("should include NONE in priority enums", () => {
      const tools = ticketsHandler.getTools();
      const createTool = tools.find((t) => t.name === "ninjaone_tickets_create");
      const priorityProp = createTool?.inputSchema.properties?.priority as { enum?: string[] };
      expect(priorityProp?.enum).toContain("NONE");
    });

    it("should include ALERT in type enums", () => {
      const tools = ticketsHandler.getTools();
      const createTool = tools.find((t) => t.name === "ninjaone_tickets_create");
      const typeProp = createTool?.inputSchema.properties?.type as { enum?: string[] };
      expect(typeProp?.enum).toContain("ALERT");
    });
  });

  describe("handleCall", () => {
    // ── List ───────────────────────────────────────────────

    describe("ninjaone_tickets_list", () => {
      it("should list tickets with default parameters", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {});

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.tickets).toHaveLength(2);
        expect(data.cursor).toBe("next-page");
        expect(data.summary).toContain("Found 2 ticket(s)");
      });

      it("should include summary with filter info", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list", {
          status: "OPEN",
          organization_id: 5,
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("status OPEN");
        expect(data.summary).toContain("organization 5");
      });

      it("should pass filters to API including priority", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_list", {
          status: "OPEN",
          priority: "HIGH",
          organization_id: 5,
          device_id: 10,
          limit: 25,
        });

        expect(mockTicketsList).toHaveBeenCalledWith({
          status: "OPEN",
          priority: "HIGH",
          organizationId: 5,
          deviceId: 10,
          boardId: undefined,
          pageSize: 25,
        });
      });
    });

    // ── Get ────────────────────────────────────────────────

    describe("ninjaone_tickets_get", () => {
      it("should get a single ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_get", {
          ticket_id: 1,
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.id).toBe(1);
        expect(data.subject).toBe("Ticket 1");
      });

      it("should accept ticketId as parameter name", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_get", {
          ticketId: 1,
        });

        expect(result.isError).toBeUndefined();
        expect(mockTicketsGet).toHaveBeenCalledWith(1);
      });

      it("should return error when ticket_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_get", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("ticket_id is required");
      });
    });

    // ── Create ─────────────────────────────────────────────

    describe("ninjaone_tickets_create", () => {
      it("should create a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "New Ticket",
          description: "Test description",
          organization_id: 1,
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.message).toBe("Ticket created successfully");
        expect(data.ticket.id).toBe(100);
      });

      it("should pass all core fields to API", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "New Ticket",
          description: "Test description",
          organization_id: 1,
          device_id: 5,
          priority: "HIGH",
          type: "INCIDENT",
        });

        expect(mockTicketsCreate).toHaveBeenCalledWith({
          subject: "New Ticket",
          description: { public: true, body: "Test description" },
          clientId: 1,
          nodeId: 5,
          priority: "HIGH",
          type: "INCIDENT",
        });
      });

      it("should pass extended fields (tags, board_id, ticket_form_id, requester_uid, due_date, attributes)", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "New Ticket",
          organization_id: 1,
          tags: ["urgent", "hardware"],
          board_id: 3,
          ticket_form_id: 5,
          requester_uid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          due_date: 1700000000000,
          attributes: { customField1: "value1" },
        });

        expect(mockTicketsCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: ["urgent", "hardware"],
            boardId: 3,
            ticketFormId: 5,
            requesterUid: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            dueDate: 1700000000000,
            attributes: { customField1: "value1" },
          })
        );
      });

      it("should return error when subject is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_create", {
          organization_id: 1,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("subject is required");
      });

      it("should return error when subject is empty", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "  ",
          organization_id: 1,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("subject is required");
      });

      it("should return error when organization_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "Test Ticket",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("organization_id is required");
      });

      it("should trim the subject", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_create", {
          subject: "  Trimmed Subject  ",
          organization_id: 1,
        });

        expect(mockTicketsCreate).toHaveBeenCalledWith(
          expect.objectContaining({ subject: "Trimmed Subject" })
        );
      });
    });

    // ── Update ─────────────────────────────────────────────

    describe("ninjaone_tickets_update", () => {
      it("should update a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_update", {
          ticket_id: 1,
          subject: "Updated Ticket",
          status: "IN_PROGRESS",
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.message).toContain("Ticket 1 updated");
        expect(data.message).toContain("subject");
        expect(data.message).toContain("status");
      });

      it("should return error when ticket_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_update", {
          subject: "Updated",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("ticket_id is required");
      });

      it("should return error when no fields to update", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_update", {
          ticket_id: 1,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("No fields to update");
      });

      it("should pass extended fields (type, tags, due_date, attributes)", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_update", {
          ticket_id: 1,
          type: "INCIDENT",
          tags: ["escalated"],
          due_date: 1700000000000,
          attributes: { field1: "val" },
        });

        expect(mockTicketsUpdate).toHaveBeenCalledWith(1, expect.objectContaining({
          type: "INCIDENT",
          tags: ["escalated"],
          dueDate: 1700000000000,
          attributes: { field1: "val" },
        }));
      });

      it("should pass assignee_id as assignedAppUserId", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_update", {
          ticket_id: 1,
          assignee_id: 42,
        });

        expect(mockTicketsUpdate).toHaveBeenCalledWith(1, expect.objectContaining({
          assignedAppUserId: 42,
        }));
      });
    });

    // ── Delete ─────────────────────────────────────────────

    describe("ninjaone_tickets_delete", () => {
      it("should delete a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_delete", {
          ticket_id: 1,
        });

        expect(result.isError).toBeUndefined();
        expect(mockTicketsDelete).toHaveBeenCalledWith(1);

        const data = JSON.parse(result.content[0].text);
        expect(data.message).toContain("deleted successfully");
      });

      it("should return error when ticket_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_delete", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("ticket_id is required");
      });
    });

    // ── Add Comment ────────────────────────────────────────

    describe("ninjaone_tickets_add_comment", () => {
      it("should add a public comment to a ticket", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
          body: "Test comment",
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.message).toContain("Public comment added");
      });

      it("should set internal flag when public is false", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
          body: "Private comment",
          public: false,
        });

        expect(mockTicketsAddComment).toHaveBeenCalledWith(1, {
          body: "Private comment",
          internal: true,
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.message).toContain("Internal comment added");
      });

      it("should return error when ticket_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          body: "Test",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("ticket_id is required");
      });

      it("should return error when body is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("body is required");
      });

      it("should return error when body is empty", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
          body: "  ",
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("body is required");
      });

      it("should trim the comment body", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_add_comment", {
          ticket_id: 1,
          body: "  Trimmed comment  ",
        });

        expect(mockTicketsAddComment).toHaveBeenCalledWith(1, {
          body: "Trimmed comment",
          internal: false,
        });
      });
    });

    // ── Log Entries ────────────────────────────────────────

    describe("ninjaone_tickets_log_entries", () => {
      it("should get ticket log entries", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_log_entries", {
          ticket_id: 1,
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("2 log entries");
        expect(data.entries).toHaveLength(2);
      });

      it("should return error when ticket_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_log_entries", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("ticket_id is required");
      });

      it("should pass type filter to getComments", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_log_entries", {
          ticket_id: 1,
          type: "COMMENT",
        });

        expect(mockTicketsGetComments).toHaveBeenCalledWith(1, "COMMENT");
      });

      it("should include type filter in summary", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_log_entries", {
          ticket_id: 1,
          type: "COMMENT",
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("type: COMMENT");
      });

      it("should also work with the legacy tool name ninjaone_tickets_comments", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_comments", {
          ticket_id: 1,
        });

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.entries).toHaveLength(2);
      });

      it("should show singular 'entry' for single result", async () => {
        mockTicketsGetComments.mockResolvedValue([
          { id: 1, body: "Single", type: "COMMENT" },
        ]);

        const result = await ticketsHandler.handleCall("ninjaone_tickets_log_entries", {
          ticket_id: 1,
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("1 log entry");
      });
    });

    // ── Attachments ────────────────────────────────────────

    // ── Boards ─────────────────────────────────────────────

    describe("ninjaone_tickets_list_boards", () => {
      it("should list boards", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list_boards", {});

        expect(result.isError).toBeUndefined();
        expect(mockTicketsListBoards).toHaveBeenCalled();

        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("2 ticket board(s)");
        expect(data.boards).toHaveLength(2);
      });
    });

    describe("ninjaone_tickets_board_tickets", () => {
      it("should list tickets for a board", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_board_tickets", {
          board_id: 1,
        });

        expect(result.isError).toBeUndefined();
        expect(mockTicketsGetTicketsByBoard).toHaveBeenCalled();
      });

      it("should return error when board_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_board_tickets", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("board_id is required");
      });

      it("should pass sort and pagination parameters", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_board_tickets", {
          board_id: 1,
          sort_by: "createTime",
          sort_direction: "ASC",
          page_size: 100,
          last_cursor_id: "abc123",
        });

        expect(mockTicketsGetTicketsByBoard).toHaveBeenCalledWith(1, {
          sortBy: [{ field: "createTime", direction: "ASC" }],
          pageSize: 100,
          lastCursorId: "abc123",
        });
      });
    });

    // ── Forms & Configuration ──────────────────────────────

    describe("ninjaone_tickets_list_forms", () => {
      it("should list ticket forms", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list_forms", {});

        expect(result.isError).toBeUndefined();
        expect(mockTicketsListForms).toHaveBeenCalled();

        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("2 ticket form(s)");
        expect(data.forms).toHaveLength(2);
      });
    });

    describe("ninjaone_tickets_get_form", () => {
      it("should get a specific form", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_get_form", {
          form_id: 1,
        });

        expect(result.isError).toBeUndefined();
        expect(mockTicketsGetForm).toHaveBeenCalledWith(1);

        const data = JSON.parse(result.content[0].text);
        expect(data.name).toBe("Default Form");
      });

      it("should return error when form_id is missing", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_get_form", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("form_id is required");
      });
    });

    describe("ninjaone_tickets_list_statuses", () => {
      it("should list ticket statuses", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list_statuses", {});

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("ticket statuses");
        expect(data.statuses).toHaveLength(4);
      });
    });

    describe("ninjaone_tickets_list_attributes", () => {
      it("should list ticket attributes", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list_attributes", {});

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("2 ticket attribute(s)");
        expect(data.attributes).toHaveLength(2);
      });
    });

    // ── Contacts & Users ───────────────────────────────────

    describe("ninjaone_tickets_list_contacts", () => {
      it("should list contacts", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_list_contacts", {});

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("1 contact(s)");
        expect(data.contacts).toHaveLength(1);
      });
    });

    // ── Summary ────────────────────────────────────────────

    describe("ninjaone_tickets_summary", () => {
      it("should return summary grouped by status by default", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_summary", {});

        expect(result.isError).toBeUndefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.total).toBe(2);
        expect(data.byStatus).toBeDefined();
        expect(data.byStatus.OPEN).toBe(1);
        expect(data.byStatus.IN_PROGRESS).toBe(1);
      });

      it("should group by priority", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_summary", {
          group_by: "priority",
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.byPriority).toBeDefined();
        expect(data.byPriority.HIGH).toBe(1);
        expect(data.byPriority.MEDIUM).toBe(1);
      });

      it("should group by type", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_summary", {
          group_by: "type",
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.byType).toBeDefined();
        expect(data.byType.INCIDENT).toBe(1);
        expect(data.byType.TASK).toBe(1);
      });

      it("should group by all dimensions", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_summary", {
          group_by: "all",
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.byStatus).toBeDefined();
        expect(data.byPriority).toBeDefined();
        expect(data.byType).toBeDefined();
      });

      it("should include scope in summary text", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_summary", {
          organization_id: 5,
          board_id: 2,
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.summary).toContain("organization 5");
        expect(data.summary).toContain("board 2");
      });

      it("should pass filters to API", async () => {
        await ticketsHandler.handleCall("ninjaone_tickets_summary", {
          organization_id: 5,
          board_id: 2,
        });

        expect(mockTicketsList).toHaveBeenCalledWith({
          organizationId: 5,
          boardId: 2,
          pageSize: 200,
        });
      });

      it("should indicate when more results exist", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_summary", {});

        const data = JSON.parse(result.content[0].text);
        expect(data.hasMore).toBe(true);
      });
    });

    // ── Unknown tool ───────────────────────────────────────

    describe("unknown tool", () => {
      it("should return error for unknown tool", async () => {
        const result = await ticketsHandler.handleCall("ninjaone_tickets_unknown", {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Unknown ticket tool");
      });
    });
  });
});
