# Sharable Links

A backend service for short URL generation, click tracking with fraud validation, and analytics with monthly breakdowns. Built with NestJS, PostgreSQL, and Prisma.

## Setup

### Prerequisites

- Node.js (v18+)
- Docker Desktop
- npm

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Create a `.env` file in the project root:

```env
PORT=3000
BASE_URL=http://localhost:3000
DATABASE_URL="postgresql://fiverr:fiverr_dev@localhost:5432/sharable_links?schema=public"
```

### 3. Start the database

```bash
docker compose up -d
```

This starts a PostgreSQL 16 container on port 5432 with:
- User: `fiverr`
- Password: `fiverr_dev`
- Database: `sharable_links`

### 4. Run database migrations

```bash
npx prisma migrate dev
```

### 5. Start the API

```bash
npm run start        # production mode
npm run start:dev    # watch mode (auto-reload)
```

The API will be available at `http://localhost:3000`.

### 6. Browse the database (optional)

```bash
npx prisma studio
```

Opens a visual database browser at `http://localhost:5555`.

---

## Architecture

```
src/
├── main.ts                              # NestJS bootstrap, global ValidationPipe
├── app.module.ts                        # Root module
├── prisma/
│   ├── prisma.module.ts                 # Global module (available everywhere)
│   └── prisma.service.ts               # PrismaClient with lifecycle hooks
├── fraud/
│   ├── fraud.module.ts                  # Exportable module
│   └── fraud.service.ts                # Simulated fraud check (500ms, 50% pass)
├── links/
│   ├── links.module.ts                  # Imports FraudModule
│   ├── links.controller.ts             # POST /links, GET /stats, GET /:shortCode
│   ├── links.service.ts                # Business logic
│   ├── dto/
│   │   ├── create-link.dto.ts          # Input validation (@IsUrl, @IsNotEmpty)
│   │   └── link-stats.dto.ts           # Response type definitions
│   ├── links.controller.spec.ts        # Controller unit tests
│   └── links.service.spec.ts           # Service unit tests
├── common/
│   ├── dto/
│   │   └── pagination-query.dto.ts     # Reusable page/limit params
│   └── interceptors/
│       └── transform.interceptor.ts    # Response wrapper
test/
├── jest-e2e.config.ts                   # E2E test configuration
└── links.e2e-spec.ts                    # Integration tests
```

### How components interact

```
Client Request
      │
      ▼
LinksController          ← Handles HTTP, delegates to service
      │
      ▼
LinksService             ← Business logic (nanoid, dedup, stats aggregation)
      │
      ├──▶ PrismaService ← Talks to PostgreSQL (links + clicks tables)
      │
      └──▶ FraudService  ← Simulated validation (async, fire-and-forget on redirect)
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/links` | Create a short link (201 new / 200 existing) |
| `GET` | `/:shortCode` | 302 redirect to target URL + async click tracking |
| `GET` | `/stats` | Paginated analytics with monthly breakdown |

### Request/Response Examples

**Create a link:**
```bash
curl -X POST http://localhost:3000/links \
  -H "Content-Type: application/json" \
  -d '{"url":"https://fiverr.com/signup"}'

# Response (201):
# { "shortUrl": "http://localhost:3000/xPWJXG1F", "targetUrl": "https://fiverr.com/signup" }
```

**Click a link:**
```bash
curl -I http://localhost:3000/xPWJXG1F

# Response: 302 redirect → Location: https://fiverr.com/signup
```

**View stats:**
```bash
curl http://localhost:3000/stats?page=1&limit=10

# Response:
# {
#   "data": [{
#     "shortCode": "xPWJXG1F",
#     "url": "https://fiverr.com/signup",
#     "totalClicks": 4,
#     "totalEarnings": "0.10",
#     "monthlyBreakdown": [{ "month": "02/2026", "clicks": 4, "earnings": "0.10" }]
#   }],
#   "meta": { "page": 1, "limit": 10, "totalItems": 1, "totalPages": 1 }
# }
```

---

## Testing

### Unit tests

```bash
npm test
```

Runs 13 tests covering:
- **LinksService**: link creation, dedup, collision retry, resolve, click recording, stats aggregation
- **LinksController**: HTTP status codes (201/200/302), redirect behavior, stats delegation

### E2E tests

Requires a running PostgreSQL instance (Docker):

```bash
docker compose up -d
npx prisma migrate dev
npm run test:e2e
```

Runs 11 integration tests covering:
- `POST /links` with valid, duplicate, invalid, empty, and missing URLs
- `GET /:shortCode` redirect and 404 for nonexistent codes
- `GET /stats` pagination and validation
- Full flow: create link → click it → verify stats reflect the click

### Manual verification

```bash
# Create a link
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d '{"url":"https://fiverr.com/signup"}'

# Click it
curl -L http://localhost:3000/<shortCode>

# Check stats
curl http://localhost:3000/stats

# Error cases
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d '{}'
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d '{"url":"not-a-url"}'
curl http://localhost:3000/nonexistent
```

---
- **Jest** is configured with two profiles:
  - Unit tests: `src/**/*.spec.ts` (runs via `npm test`)
  - E2E tests: `test/**/*.e2e-spec.ts` (runs via `npm run test:e2e` with separate config)
