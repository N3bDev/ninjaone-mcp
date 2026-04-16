# NinjaOne MCP Server

A Model Context Protocol (MCP) server for interacting with NinjaOne RMM. Exposes devices, organizations, alerts, and ticketing tools directly to AI assistants like Claude.

## Setup

### 1. Get NinjaOne API Credentials

1. Log in to your NinjaOne admin panel
2. Go to **Administration > Apps > API > Client App IDs**
3. Create a new client app with **Client Credentials (machine-to-machine)** grant type
4. Copy the Client ID and Client Secret

### 2. Install & Build

```bash
git clone https://github.com/n3bdev/ninjaone-mcp.git
cd ninjaone-mcp
npm install
npm run build
```

### 3. Configure Claude Desktop

Add to your Claude Desktop config file:
- **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ninjaone": {
      "command": "node",
      "args": ["/path/to/ninjaone-mcp/dist/index.js"],
      "env": {
        "NINJAONE_CLIENT_ID": "your-client-id",
        "NINJAONE_CLIENT_SECRET": "your-client-secret",
        "NINJAONE_REGION": "us"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `NINJAONE_CLIENT_ID` | Yes | OAuth 2.0 Client ID |
| `NINJAONE_CLIENT_SECRET` | Yes | OAuth 2.0 Client Secret |
| `NINJAONE_REGION` | No | Region code (default: `us`) |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `LOG_LEVEL` | No | `error`, `warn`, `info` (default), `debug` |

### Regions

| Region | Code | Base URL |
|--------|------|----------|
| United States | `us` | `https://app.ninjarmm.com` |
| United States 2 | `us2` | `https://us2.ninjarmm.com` |
| Europe | `eu` | `https://eu.ninjarmm.com` |
| Oceania | `oc` | `https://oc.ninjarmm.com` |
| Canada | `ca` | `https://ca.ninjarmm.com` |
| US Federal | `fed` | `https://fed.ninjarmm.com` |

## Available Tools

All tools are exposed directly — no navigation required.

### Devices (6 tools)

| Tool | Description |
|------|-------------|
| `ninjaone_devices_list` | List devices with filters (org, class, online status) |
| `ninjaone_devices_get` | Get full device details |
| `ninjaone_devices_reboot` | Schedule a device reboot |
| `ninjaone_devices_services` | List Windows services on a device |
| `ninjaone_devices_alerts` | Get alerts for a specific device |
| `ninjaone_devices_activities` | View device activity log |

### Organizations (5 tools)

| Tool | Description |
|------|-------------|
| `ninjaone_organizations_list` | List all organizations |
| `ninjaone_organizations_get` | Get organization details |
| `ninjaone_organizations_create` | Create a new organization |
| `ninjaone_organizations_locations` | List organization locations |
| `ninjaone_organizations_devices` | List devices for an organization |

### Alerts (4 tools)

| Tool | Description |
|------|-------------|
| `ninjaone_alerts_list` | List alerts with severity/org/device filters |
| `ninjaone_alerts_reset` | Dismiss a single alert |
| `ninjaone_alerts_reset_all` | Reset all alerts for a device or organization |
| `ninjaone_alerts_summary` | Get alert count summary grouped by severity or org |

### Tickets (15 tools)

| Tool | Description |
|------|-------------|
| `ninjaone_tickets_list` | List tickets across all boards with filters |
| `ninjaone_tickets_get` | Get full ticket details |
| `ninjaone_tickets_create` | Create a new ticket |
| `ninjaone_tickets_update` | Update ticket fields (status, priority, assignee, etc.) |
| `ninjaone_tickets_delete` | Delete a ticket |
| `ninjaone_tickets_add_comment` | Add a public or internal comment |
| `ninjaone_tickets_log_entries` | Get ticket activity log (comments, changes, conditions) |
| `ninjaone_tickets_list_boards` | List all ticket boards |
| `ninjaone_tickets_board_tickets` | Search tickets within a board with sorting and pagination |
| `ninjaone_tickets_list_forms` | List available ticket forms |
| `ninjaone_tickets_get_form` | Get form details with custom field definitions |
| `ninjaone_tickets_list_statuses` | Get all configured ticket statuses |
| `ninjaone_tickets_list_attributes` | List custom ticket field definitions |
| `ninjaone_tickets_list_contacts` | List contacts available for ticketing |
| `ninjaone_tickets_summary` | Get ticket counts grouped by status, priority, or type |

### Utility (1 tool)

| Tool | Description |
|------|-------------|
| `ninjaone_status` | Show server status, credential check, and available domains |

## Example Usage

Once configured, just ask Claude naturally:

- "Show me all open tickets"
- "List critical alerts"
- "What devices are offline?"
- "Create a ticket for the printer issue at Acme Corp"
- "Give me a weekly ticket summary"

## Team Deployment

Three options for deploying to your team, depending on your needs:

### Option A: Individual Local Setup (Simplest)

Each team member runs the server locally via Claude Desktop. Everyone gets their own NinjaOne API credentials and configures their own Claude Desktop config as shown in [Setup](#3-configure-claude-desktop) above.

**Pros**: No shared infrastructure, each person controls their own access.
**Best for**: Small teams where each member needs their own NinjaOne API identity.

### Option B: Shared Server (Single Identity)

Run one Docker instance with shared credentials. All team members point their MCP client at the same endpoint.

```bash
# Copy and edit the example env file
cp .env.example .env
# Edit .env with your shared credentials

# Start the server
docker compose up -d
```

The server will be available at `http://your-server:8080/mcp`.

**Pros**: Single server to manage, simple setup.
**Best for**: Teams that share one NinjaOne API identity.

### Option C: Shared Server with Gateway Mode (Multi-User)

Run one Docker instance in gateway mode. Each team member passes their own credentials via headers on every request, keeping API identities separate.

```bash
# In your .env file, set:
AUTH_MODE=gateway
MCP_TRANSPORT=http

# Start the server
docker compose up -d
```

Each team member's MCP client sends credentials via headers:
- `X-Ninja-Client-ID` — Their NinjaOne Client ID
- `X-Ninja-Client-Secret` — Their NinjaOne Client Secret
- `X-Ninja-Region` (optional) — Their NinjaOne region

**Pros**: Each person uses their own API credentials, full audit trail per user.
**Best for**: Teams that need per-user access control and auditing.

## HTTP Transport

For hosted deployments, set `MCP_TRANSPORT=http`:

```bash
export MCP_TRANSPORT=http
export MCP_HTTP_PORT=8080
node dist/index.js
```

Endpoints:
- `POST /mcp` — MCP protocol endpoint
- `GET /health` — Health check

Gateway mode (`AUTH_MODE=gateway`) accepts credentials via request headers instead of environment variables:
- `X-Ninja-Client-ID`
- `X-Ninja-Client-Secret`
- `X-Ninja-Region`

## Development

```bash
npm install
npm run build    # TypeScript compilation
npm test         # Run test suite
```

## License

Apache-2.0
