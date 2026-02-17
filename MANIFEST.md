# Manifest

## What Works

- **Short link generation** (`POST /links`) - Creates 8-character nanoid short codes, deduplicates by target URL (returns existing link with 200 instead of creating duplicates)
- **Click redirect** (`GET /:shortCode`) - 302 redirect to target URL, non-blocking to the user
- **Async click tracking** - Fire-and-forget fraud validation + click recording happens after the redirect is sent
- **Fraud validation** - Simulated service with 500ms delay and 50% random pass rate. Valid clicks earn $0.05, invalid earn $0.00
- **Analytics** (`GET /stats`) - Paginated endpoint returning per-link totals and monthly breakdown using PostgreSQL `DATE_TRUNC` aggregation
- **Input validation** - URL format validation, empty/missing body rejection, pagination bounds checking
- **Collision handling** - nanoid short code collision retries up to 3 attempts
- **Full test coverage** - 13 unit tests + 11 e2e integration tests, all passing

## What Can Be Improved

- **Authentication** - No auth layer. In production, sellers should only see their own links/stats
- **Rate limiting** - No protection against abuse on link creation or click endpoints
- **Real fraud detection** - Current service is a random coin flip. Real implementation would check IP, user-agent, click patterns, geo, etc.
- **Caching** - Short code → target URL lookups could be cached (Redis) since links are immutable
- **Seller model** - No `User`/`Seller` entity. Links aren't associated with any user
- **Click metadata** - Not storing IP, user-agent, referrer, or geo data (useful for real fraud detection and analytics)
- **Soft deletes** - No way to deactivate/delete a link
- **Custom short codes** - Sellers can't choose their own vanity codes
- **Stats query performance** - The N+1 pattern in stats (one aggregation per link) could be replaced with a single raw SQL query joining links and clicks
- **Monitoring/logging** - No structured logging, no health check endpoint, no metrics

## Why PostgreSQL

PostgreSQL was chosen over alternatives for these reasons:

| Consideration | PostgreSQL | MongoDB | SQLite |
|---|---|---|---|
| **ACID transactions** | Full support | Limited (multi-doc since 4.0) | Full but single-writer |
| **Aggregation** | `DATE_TRUNC`, `GROUP BY`, window functions | Aggregation pipeline (verbose) | Basic |
| **Unique constraints** | Native, enforced at DB level | Unique indexes (same) | Same |
| **Decimal precision** | `DECIMAL(10,2)` native | No native decimal type | No native decimal |
| **Concurrency** | MVCC, handles concurrent writes well | Good | Single-writer lock |
| **Prisma support** | First-class | Supported | Supported |
| **Production readiness** | Battle-tested at scale | Good | Not for multi-user servers |

The key driver: **money tracking requires ACID guarantees and exact decimal arithmetic**. PostgreSQL's `DECIMAL(10,2)` ensures we never lose a cent to floating-point errors, and `DATE_TRUNC` makes monthly aggregation a one-liner.

## Trade-offs

### Fire-and-forget click recording
- **Pro**: User gets instant redirect (no 500ms wait for fraud check)
- **Con**: If the server crashes mid-processing, the click is lost. No retry mechanism
- **Why**: User experience matters more than 100% click accuracy for a simulated service

### nanoid over UUID
- **Pro**: 8 chars vs 36 chars = shorter URLs, URL-safe alphabet
- **Con**: Higher collision probability than UUID (but still negligible at 8 chars with retry logic)
- **Why**: Short URLs should be *short*. 3 retries handles the theoretical collision case

### Target URL uniqueness constraint
- **Pro**: Same URL always returns the same short link, prevents database bloat
- **Con**: Two sellers sharing the same gig URL would get the same short code (can't track per-seller)
- **Why**: Per the spec, this is a global link service. Per-seller tracking would need a `sellerId` foreign key

### Raw SQL for monthly aggregation
- **Pro**: `DATE_TRUNC('month', clicked_at)` is fast and clean, uses the composite index
- **Con**: Bypasses Prisma's type safety, couples to PostgreSQL dialect
- **Why**: Prisma `groupBy` doesn't support date truncation natively. The raw query is readable and performant

### Decimal as string in API responses
- **Pro**: No floating-point precision loss (`"0.05"` not `0.050000000000000003`)
- **Con**: Clients need to parse strings to numbers for calculations
- **Why**: Standard practice for money in JSON APIs (Stripe, PayPal all do this)

## AI Prompts & Documentation

The full AI planning and implementation conversation is documented in the [`docs/`](./docs/) folder:

- [`docs/PLAN.md`](./docs/PLAN.md) - Original requirements, stack decisions, database schema design, API spec, and testing strategy
- [`docs/IMPLEMENT.md`](./docs/IMPLEMENT.md) - Step-by-step implementation plan used during development
- [`docs/FINAL.md`](./docs/FINAL.md) - Post-implementation summary and verification results
