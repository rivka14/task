# Fiverr Sharable Links - Backend Service

## Context
Fiverr wants to empower sellers to share their work everywhere via short, trackable URLs. Each valid click earns the seller $0.05 in Fiverr credits. We need a production-grade backend service with link generation, redirection + fraud validation, and analytics with monthly breakdowns.

## Final Stack
- **Runtime**: Node.js + TypeScript (strict mode)
- **Framework**: NestJS (modular architecture, DI, built-in validation & testing)
- **Database**: PostgreSQL (via Docker) - aggregations, ACID transactions, concurrency
- **ORM**: Prisma (type-safe, clean migrations, schema-first)
- **Short codes**: nanoid (8 chars, URL-safe, unpredictable)
- **Testing**: Jest (NestJS built-in) - unit + e2e tests
- **Validation**: class-validator + class-transformer (NestJS pipes)

---

## 1. Project Setup

- Initialize a fresh NestJS project with `@nestjs/cli`
- Configure: TypeScript strict mode, ESLint, Prettier
- Set up `docker-compose.yml` with PostgreSQL 16
- Configure Prisma with PostgreSQL datasource
- Add `.env` with `DATABASE_URL`, `PORT`, `BASE_URL`
- Add `.gitignore` (node_modules, dist, .env, .DS_Store)

---

## 2. Database Schema (Prisma)

```prisma
model Link {
  id          Int      @id @default(autoincrement())
  shortCode   String   @unique @map("short_code")
  targetUrl   String   @map("target_url")
  createdAt   DateTime @default(now()) @map("created_at")
  clicks      Click[]

  @@unique([targetUrl])
  @@map("links")
}

model Click {
  id          Int      @id @default(autoincrement())
  linkId      Int      @map("link_id")
  isValid     Boolean  @map("is_valid")
  earnedCredit Decimal @map("earned_credit") @db.Decimal(10, 2)
  clickedAt   DateTime @default(now()) @map("clicked_at")
  link        Link     @relation(fields: [linkId], references: [id])

  @@index([linkId, clickedAt])
  @@map("clicks")
}
```

**Key decisions**:
- `targetUrl` has a unique constraint → guarantees same URL returns existing short link
- `Click` stores each individual click with `isValid` and `earnedCredit` (0.00 or 0.05)
- Composite index on `[linkId, clickedAt]` → fast monthly aggregation queries
- Using `Decimal` for money (never use float for currency)

---

## 3. Project Structure

```
src/
├── app.module.ts
├── main.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts
├── links/
│   ├── links.module.ts
│   ├── links.controller.ts
│   ├── links.service.ts
│   ├── dto/
│   │   ├── create-link.dto.ts        # Input validation
│   │   └── link-stats.dto.ts         # Response shape
│   └── links.controller.spec.ts
├── fraud/
│   ├── fraud.module.ts
│   └── fraud.service.ts              # Simulated fraud validation
├── common/
│   ├── dto/
│   │   └── pagination-query.dto.ts   # Reusable pagination params
│   └── interceptors/
│       └── transform.interceptor.ts  # Consistent response shape
test/
├── links.e2e-spec.ts                 # End-to-end API tests
```

---

## 4. API Endpoints

### POST /links - Generate Short Link
- **Input**: `{ "url": "https://fiverr.com/some-gig" }`
- **Validation**:
  - `url` is required, must be a valid URL (class-validator `@IsUrl()`)
  - Reject empty strings, non-URL strings, missing body
- **Logic**:
  1. Check if `targetUrl` already exists in DB → return existing short link
  2. If new: generate 8-char nanoid, create Link record
  3. Handle unlikely collision: retry nanoid generation if `shortCode` unique constraint fails
- **Response** (201 or 200): `{ "shortUrl": "http://localhost:3000/abc12345", "targetUrl": "https://fiverr.com/some-gig" }`

### GET /:shortCode - Redirect & Track
- **Logic**:
  1. Look up Link by `shortCode` → 404 if not found
  2. Immediately respond with **302 redirect** to `targetUrl` (don't block the user)
  3. Asynchronously (fire-and-forget): run fraud validation, record Click
- **Fraud validation** (simulated):
  - `await new Promise(resolve => setTimeout(resolve, 500))`
  - Return `Math.random() < 0.5` (true/false with 50% probability)
  - If valid: `earnedCredit = 0.05`, if invalid: `earnedCredit = 0.00`
- **Edge cases**: invalid/nonexistent short code → 404 with message

### GET /stats - Global Analytics
- **Query params**: `page` (default 1), `limit` (default 10, max 100)
- **Response**:
```json
{
  "data": [
    {
      "shortCode": "abc12345",
      "url": "https://fiverr.com/signup",
      "totalClicks": 16,
      "totalEarnings": "1.05",
      "monthlyBreakdown": [
        { "month": "12/2025", "clicks": 12, "earnings": "1.00" },
        { "month": "01/2026", "clicks": 4, "earnings": "0.05" }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "totalItems": 42,
    "totalPages": 5
  }
}
```
- **Implementation**:
  - Paginate links with Prisma `skip/take`
  - For each link, aggregate clicks grouped by month using raw SQL `DATE_TRUNC` or Prisma `groupBy`
  - Sort monthly breakdown chronologically

---

## 5. Fraud Validation Service

```typescript
// fraud.service.ts
@Injectable()
export class FraudService {
  async validate(): Promise<boolean> {
    await new Promise(resolve => setTimeout(resolve, 500));
    return Math.random() < 0.5;
  }
}
```

Extracted as its own module/service for:
- Easy to swap with real implementation later
- Easy to mock in tests
- Clean separation of concerns

---

## 6. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| Missing `url` in POST body | 400 - `"url is required"` |
| Invalid URL format | 400 - `"url must be a valid URL"` |
| Empty string URL | 400 - `"url should not be empty"` |
| Duplicate target URL | 200 - return existing link (not 201) |
| Non-existent short code | 404 - `"Short link not found"` |
| Invalid pagination params | 400 - `"page must be a positive integer"` |
| Page beyond range | 200 - return empty data array with correct meta |
| nanoid collision (DB unique violation) | Retry with new nanoid (up to 3 attempts) |

NestJS global exception filter + validation pipe handles most of this automatically.

---

## 7. Testing Strategy

### Unit Tests (Jest)
- **LinksService**:
  - Creates new link and returns short URL
  - Returns existing link for duplicate target URL
  - Handles nanoid collision retry
- **FraudService**:
  - Returns boolean after ~500ms delay
- **LinksController**:
  - Correct HTTP status codes (201 for new, 200 for existing, 302 for redirect)

### E2E Tests (supertest + Jest)
- POST /links with valid URL → 201 + short URL
- POST /links with same URL → 200 + same short URL
- POST /links with invalid URL → 400
- POST /links with missing body → 400
- GET /:shortCode → 302 redirect to target
- GET /nonexistent → 404
- GET /stats → paginated response with correct structure
- GET /stats?page=1&limit=5 → correct pagination meta
- Full flow: create link → click it → check stats show the click

---

## 8. Docker Setup

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: fiverr
      POSTGRES_PASSWORD: fiverr_dev
      POSTGRES_DB: sharable_links
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## 9. Implementation Order

1. **Setup**: NestJS project, Docker, Prisma schema, migration
2. **Prisma module**: Reusable database service
3. **POST /links**: Link generation with validation & deduplication
4. **GET /:shortCode**: Redirect with async fraud validation & click tracking
5. **GET /stats**: Analytics with monthly aggregation & pagination
6. **Error handling**: Global filters, validation pipes
7. **Tests**: Unit tests for services, e2e tests for all endpoints
8. **Verification**: Manual curl/Postman tests documented in README

---

## 10. Verification Plan

After implementation, verify with curl:
```bash
# Create a link
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d '{"url":"https://fiverr.com/signup"}'

# Click the link (follow redirect)
curl -L http://localhost:3000/<shortCode>

# Check stats
curl http://localhost:3000/stats?page=1&limit=10

# Edge cases
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d '{}'
curl -X POST http://localhost:3000/links -H "Content-Type: application/json" -d '{"url":"not-a-url"}'
curl http://localhost:3000/nonexistent
```

Run automated tests:
```bash
npm run test        # Unit tests
npm run test:e2e    # E2e tests
```
