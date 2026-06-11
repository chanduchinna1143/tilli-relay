# Claude.md — Relay (Postman‑Compatible API Development Tool)

## Role & Expectations
You are acting as a **senior staff‑level software architect and backend engineer**.
Your job is to design and implement a **curl‑first API Development Tool** (Postman‑like),
built from scratch, production‑ready, secure, and enterprise‑grade.

This is a **paid internal product** intended to **replace Postman** for company use,
while remaining **compatible with Postman collections**.

## Core Non‑Negotiable Principles

### 1. curl is the Source of Truth (MANDATORY)
- Every API request **must be represented as a valid curl command**
- UI state, database records, execution logic **derive from curl**
- Never execute requests from UI fields or DB objects directly
- Execution always runs **the curl command itself**

If curl is correct → everything is correct.

### 2. UI is Secondary
- UI exists **only to construct, visualize, and edit curl**
- Any change in UI must immediately update the generated curl
- (Optional bonus) Editing curl should update UI fields

### 3. No Postman Integration
- Do **NOT** import, embed, or depend on Postman libraries
- Support **Postman Collection JSON as an import format only**
- Convert Postman requests → curl → internal model


## Technology Stack (FIXED)

### Core
- Next.js (App Router)
- React
- TypeScript
- Node.js runtime
- Native system 

### Database
- PostgreSQL
- Drizzle ORM
- Redis (sessions)

### Styling
- Tailwind CSS

### Editor (Recommended)
- Monaco Editor (or equivalent) for curl visibility
## Execution Model (CRITICAL)

### Request Execution
- Execution happens **server‑side only**
- The server **runs the curl command directly**
- Use Node.js child processes
- Apply:
  - execution timeout
  - command sanitization
  - allowed flags whitelist
  - domain restrictions (configurable)

If user clicks Send:
➡ the backend executes curl  
➡ not UI logic  
➡ not DB logic  

## Database Design Rules

### Core Rule
The database **stores curl**, not abstract request objects.

### Example Models (Conceptual)
- Request
  - id
  - name
  - curl (TEXT, REQUIRED)
  - createdAt
  - updatedAt

- Collection
  - id
  - name
  - description

- CollectionRequest
  - collectionId
  - requestId

### Important
- Method, URL, headers, auth, body are **derivable**
- No duplicated execution logic stored in DB

## Required Features (MVP)

### Request Builder
- Method (GET, POST, PUT, DELETE, PATCH)
- URL
- Headers (key/value, toggleable)
- Body (JSON / raw text)
- Authorization:
  - None
  - Basic Auth
  - Bearer Token
  - API Key (header or query)

### Curl Panel (MANDATORY)
- Always visible
- Always accurate
- Copyable
- Executable externally

### Execution
- Execute curl
- Display:
  - status code
  - response headers
  - response body
  - execution time

### Postman Collection Import
- Accept Postman Collection JSON
- Parse:
  - items
  - requests
  - headers
  - body
  - auth
- Convert each request → curl
- Generate UI from curl

## Postman Compatibility Rules

- Treat Postman Collection JSON as **input data only**
- Do **not** attempt 100% Postman feature parity
- Support common fields:
  - method
  - url
  - headers
  - body
  - auth
- Ignore advanced Postman‑only features unless required

## Security Constraints (MANDATORY)

- Never execute raw shell input without validation
- Whitelist curl flags
- Restrict protocols (http/https only)
- Apply strict execution timeout
- Disallow shell chaining (, , , etc.)

This is a **paid enterprise tool** — safety is critical.

## What NOT to Build (Explicitly Forbidden)

- No Express or Fastify
- No Postman SDK usage
- No “UI‑first execution”
- No client‑side API execution
- No DB‑driven execution logic

## Mental Model to Preserve

> This product is **not a Postman UI clone**.  
> It is a **curl execution platform with a UI wrapper**, compatible with Postman collections.

If curl is always correct and executable, the product is successful.

## Delivery Expectation

- Clean, readable, maintainable code
- Senior‑level architectural decisions
- No over‑engineering
- Focus on correctness, security, and clarity

Act accordingly.

## Operations

### Starting the application
1. `docker compose up -d` — start PostgreSQL and Redis
2. `PORT=3033 RELAY_E2E_ALLOW_LOCAL=true npx next start --port 3033` — start the server

### Stopping the application
1. Stop the Next.js server process
2. `docker compose down` — stop PostgreSQL and Redis

Always start Docker before the application and stop Docker after stopping the application.

---

## ARCHITECTURE DECISIONS (Finalized)

### Folder Structure

```
Reqify/
├── drizzle/
│   └── *.sql                 # Drizzle migrations
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Main workspace
│   │   ├── globals.css
│   │   └── api/
│   │       ├── requests/
│   │       │   ├── route.ts          # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── route.ts      # GET, PUT, DELETE single request
│   │       ├── execute/
│   │       │   └── route.ts          # POST — runs curl server-side
│   │       ├── collections/
│   │       │   ├── route.ts          # GET (list), POST (create)
│   │       │   └── [id]/
│   │       │       └── route.ts      # GET, PUT, DELETE single collection
│   │       └── import/
│   │           └── postman/
│   │               └── route.ts      # POST — Postman JSON import
│   ├── components/
│   │   ├── RequestBuilder/
│   │   │   ├── RequestBuilder.tsx    # Main builder container
│   │   │   ├── MethodUrlBar.tsx      # Method dropdown + URL input
│   │   │   ├── HeadersEditor.tsx     # Key/value rows, toggleable
│   │   │   ├── BodyEditor.tsx        # JSON / raw text body
│   │   │   └── AuthEditor.tsx        # Auth type + conditional fields
│   │   ├── CurlPanel/
│   │   │   └── CurlPanel.tsx         # Monaco editor — live curl display, editable, copyable
│   │   ├── ResponseViewer/
│   │   │   ├── ResponseViewer.tsx    # Container with tabs
│   │   │   ├── ResponseHeaders.tsx
│   │   │   └── ResponseBody.tsx
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx           # Collection/request tree
│   │   │   └── ImportButton.tsx
│   │   └── Layout/
│   │       └── WorkspaceLayout.tsx   # Main 3-panel layout shell
│   ├── lib/
│   │   ├── curl/
│   │   │   ├── builder.ts            # UI state → curl string
│   │   │   ├── parser.ts             # curl string → UI state
│   │   │   ├── sanitizer.ts          # Whitelist validation, security gate
│   │   │   └── executor.ts           # child_process.execFile, timeout, parse output
│   │   ├── postman/
│   │   │   └── importer.ts           # Postman Collection v2.1 JSON → curl strings
│   │   ├── db.ts                     # Drizzle client + connection pool
│   │   └── types.ts                  # Shared TypeScript interfaces
│   └── hooks/
│       ├── useRequestState.ts        # Request form state management
│       └── useCurlSync.ts            # Bidirectional sync: UI fields ↔ curl string
├── .env
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
└── package.json
```

### Database Schema (Drizzle — src/lib/schema.ts)

Core tables (see `src/lib/schema.ts` for full definitions):



- **users** — id, email, passwordHash
- **teams** — id, name, slug
- **teamMembers** — teamId, userId, role (pgEnum: owner/editor/viewer)
- **requests** — id, name, curl (TEXT), userId, teamId
- **collections** — id, name, description, folderId, userId, teamId
- **collectionRequests** — collectionId, requestId, sortOrder
- **folders** — id, name, userId, teamId
- **environments** — id, name, userId, teamId, isActive
- **environmentVariables** — id, key, value (encrypted), environmentId, userId
- **historyEntries** — id, userId, method, url, curl, statusCode, timeMs, response
- **sharedRequests** — id, requestId, sharedByUserId, token, expiresAt
- **activityLogs** — id, teamId, userId, action, resourceType, resourceId

No method/URL/headers/body columns — all derivable from `curl`.

### Data Flow

```
UI Fields ──► builder.ts ──► curl string (canonical state) ──► CurlPanel (Monaco)
CurlPanel ──► parser.ts  ──► UI Fields (reverse sync)

[Save]  → POST /api/requests        → stores { name, curl } in PostgreSQL
[Send]  → POST /api/execute          → sanitizer validates → executor runs curl via execFile → returns { status, headers, body, timeMs }
[Import]→ POST /api/import/postman   → parses Postman JSON → converts each request to curl → creates Collection + Request records
```

### Core Library Contracts

#### `lib/curl/builder.ts`
- Input: `RequestState` (method, url, headers[], body, auth)
- Output: valid curl command string
- Must produce a command that is copy-pasteable into any terminal

#### `lib/curl/parser.ts`
- Input: curl command string
- Output: `RequestState`
- Handles: `-X`, `-H`, `-d`/`--data`, `-u`, `-H "Authorization: ..."`, URL extraction
- Used when user edits curl in Monaco and during Postman import

#### `lib/curl/sanitizer.ts`
- Whitelist of allowed flags: `-X`, `-H`, `-d`, `--data`, `--data-raw`, `--data-binary`, `-u`, `-A`, `-b`, `-L`, `-k`, `-s`, `-S`, `-w`, `-o /dev/null`, `--connect-timeout`, `--max-time`
- Blocks: `;`, `|`, `&&`, `||`, backticks, `$()`, `>`, `<`, newlines
- Enforces: URL must start with `http://` or `https://`
- Returns: `{ valid: boolean, error?: string, sanitizedArgs: string[] }`

#### `lib/curl/executor.ts`
- Uses `child_process.execFile("curl", args)` — NOT `exec` (no shell involved)
- Appends `-s -S` (silent + show errors)
- Appends `-w "\n%{http_code}\n%{time_total}"` for metadata extraction
- Appends `-D -` or `-i` to capture response headers
- Configurable timeout (default: 30s)
- Returns: `{ status: number, headers: Record<string, string>, body: string, timeMs: number }`

#### `lib/postman/importer.ts`
- Accepts Postman Collection v2.1 JSON
- Recursively walks `item[]` (supports nested folders → nested collections)
- Converts each item's `request` object (method, url, header, body, auth) → curl via `builder.ts`
- Creates DB records via Drizzle

### Component Responsibilities

| Component | Responsibility |
|---|---|
| `MethodUrlBar` | Method dropdown (GET/POST/PUT/DELETE/PATCH) + URL text input |
| `HeadersEditor` | Dynamic key/value rows with enable/disable toggle per row |
| `BodyEditor` | Textarea or Monaco for JSON/raw body, content-type aware |
| `AuthEditor` | Auth type dropdown (None/Basic/Bearer/API Key) → conditional fields |
| `CurlPanel` | Monaco editor showing live curl, editable, copy-to-clipboard button |
| `ResponseViewer` | Tabbed display: Body (syntax highlighted), Headers (table), Status + Timing |
| `Sidebar` | Tree view of collections/requests, click to load, import button |
| `WorkspaceLayout` | 3-panel layout: sidebar | request builder + curl panel | response viewer |

### Sync Strategy (useCurlSync hook)

- Holds canonical `curlString` state
- `updateFromFields(fields)` → calls `builder.ts` → updates `curlString`
- `updateFromCurl(raw)` → calls `parser.ts` → updates UI fields
- Monaco edits are debounced (300ms) before triggering `updateFromCurl`
- Any UI field change immediately triggers `updateFromFields`

### Execution Flow (Send Button)

1. Client sends `POST /api/execute` with `{ curl: "curl -X GET https://..." }`
2. `sanitizer.validate(curl)` — rejects with error if invalid
3. `executor.run(sanitizedArgs)` — `execFile("curl", args, { timeout: 30000 })`
4. Parse stdout for response body, extract status code and timing from `-w` output
5. Return `{ status, headers, body, timeMs }` to client
6. `ResponseViewer` renders the result

### Implementation Order

1. **Phase 1 — Scaffolding**: Next.js + TypeScript + Tailwind + Drizzle + PostgreSQL + Redis setup
2. **Phase 2 — curl Library**: `builder.ts`, `parser.ts`, `sanitizer.ts`, `executor.ts` (with tests)
3. **Phase 3 — API Routes**: `/api/execute`, `/api/requests`, `/api/collections`
4. **Phase 4 — UI Components**: RequestBuilder, CurlPanel, ResponseViewer, Sidebar
5. **Phase 5 — Postman Import**: `importer.ts` + `/api/import/postman` route
6. **Phase 6 — Polish**: Error handling, loading states, keyboard shortcuts, responsive layout

### Post-MVP Features (Deferred)

- **History table** — store every execution (timestamp, curl, response status) for replay
- **Environment variables** — `{{base_url}}`, `{{token}}` substitution before execution
- **Tabs** — multiple open requests in the workspace
- **Export** — export collections back to Postman format or as shell scripts

