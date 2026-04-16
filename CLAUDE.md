# CLAUDE.md

## Project Overview

NinjaOne MCP server — exposes NinjaOne RMM API operations as MCP tools for Claude. Supports stdio (local Claude Desktop/CLI) and HTTP (hosted deployment with optional multi-tenant gateway mode).

## Build & Test

```bash
npm install          # Install dependencies
npm run build        # TypeScript compilation (tsc)
npm run typecheck    # Type-check without emitting
npm test             # Run vitest suite (195 tests)
npm run lint         # ESLint
npm run dev          # Watch mode (tsc --watch)
```

All four commands (build, typecheck, test, lint) must pass clean before committing.

## Architecture

```
src/index.ts                    → MCP server, transport selection, tool routing
src/domains/{devices,organizations,alerts,tickets}.ts → Domain tool handlers
src/domains/index.ts            → Lazy-loading domain registry
src/ninjaone/client.ts          → High-level API client (DevicesApi, OrganizationsApi, etc.)
src/ninjaone/http.ts            → Low-level HTTP with OAuth2, token caching, 401/429 retry
src/utils/client.ts             → Credential resolution + client caching
src/utils/request-context.ts    → AsyncLocalStorage for per-request credentials (gateway mode)
src/utils/logger.ts             → Structured logger (stderr only, to avoid MCP protocol corruption)
src/utils/elicitation.ts        → Optional interactive prompts (degrades gracefully)
src/utils/types.ts              → Shared types, region validation
```

## Key Patterns

- **Domain handler pattern**: Each domain exports `getTools()` + `handleCall()`, loaded lazily via dynamic import and cached.
- **Client caching**: `NinjaOneClient` instances cached by `clientId:region` key for multi-tenant isolation.
- **Gateway mode**: `AsyncLocalStorage` propagates per-request credentials from HTTP headers through the async call chain.
- **Tool naming**: `ninjaone_{domain}_{operation}` (e.g., `ninjaone_tickets_create`).
- **Error handling**: Domain handlers return `{ isError: true }` results — no thrown exceptions to the MCP layer.
- **API responses**: Passed through as-is (permissive `ApiRecord = Record<string, unknown>`). Only actively-used fields are typed.

## Adding a New Domain

1. Create `src/domains/{name}.ts` following the existing handler pattern
2. Add the domain name to `DomainName` type in `src/utils/types.ts`
3. Add the import case to `src/domains/index.ts`
4. Add to `getAvailableDomains()` in `src/domains/index.ts`
5. Add API methods to `src/ninjaone/client.ts` if needed
6. Add tests in `src/__tests__/domains/{name}.test.ts`

## Conventions

- TypeScript strict mode, ESM only
- Conventional commits (feat:, fix:, docs:, chore:)
- Snake_case in MCP tool schemas, camelCase in TypeScript code
- Logger output goes to stderr (never stdout — that's the MCP protocol channel in stdio mode)
- Single production dependency (`@modelcontextprotocol/sdk`); everything else is Node builtins
