# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS-based short URL generation and analytics platform. Creates short links, tracks clicks with fraud detection, and provides statistics with monthly earnings breakdown.

## Common Commands

```bash
# Development
npm run start:dev          # Start with hot reload
npm run build              # Build to dist/

# Database (requires PostgreSQL running)
npm run docker:up          # Start PostgreSQL via Docker
npm run docker:down        # Stop PostgreSQL
npm run db:migrate         # Apply Prisma migrations
npm run db:generate        # Regenerate Prisma client
npm run db:studio          # Open Prisma Studio UI

# Testing
npm test                   # Run unit tests
npm test -- --testPathPattern=links.service   # Run a single test file
npm run test:watch         # Unit tests in watch mode
npm run test:e2e           # End-to-end tests (needs running DB)
```

## Architecture

**Root module** (`src/app.module.ts`) imports three feature modules:

- **PrismaModule** (`src/prisma/`) — Global module exposing `PrismaService` (extends `PrismaClient`). All DB access goes through this service.
- **LinksModule** (`src/links/`) — Core business logic. Controller has three endpoints:
  - `POST /links` — Create short link (or return existing for same URL). Uses nanoid (8 chars) with 3-retry collision handling.
  - `GET /:shortCode` — 302 redirect. Click recording is fire-and-forget (non-blocking).
  - `GET /stats` — Paginated link analytics with monthly breakdown via PostgreSQL `DATE_TRUNC`.
- **FraudModule** (`src/fraud/`) — Pluggable fraud detection. Currently a mock (500ms delay, 50% random validity). Valid clicks earn $0.05.

**Global setup** in `main.ts`: `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, `transform`, and `enableImplicitConversion`.

## Database

PostgreSQL 16 via Prisma ORM. Two models:

- **Link**: `shortCode` (unique), `targetUrl` (unique — one short link per URL)
- **Click**: linked to Link, tracks `isValid` (fraud result) and `earnedCredit` (Decimal). Indexed on `(linkId, clickedAt)`.

Connection string configured via `DATABASE_URL` in `.env` (see `.env.example`).

## Key Conventions

- DTOs in `dto/` subdirectories use `class-validator` decorators
- Shared DTOs (e.g., `PaginationQueryDto`) live in `src/common/dto/`
- Unit tests are co-located as `*.spec.ts`; E2E tests are in `test/`
- E2E config is at `test/jest-e2e.config.ts`


## Git Workflow

### Commits
Use **Conventional Commits**: `<type>(<scope>): <subject>`

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Commit after each small, logical unit of work. Don't wait for entire feature.

### Branches
**Always ask before naming the branch.**

Naming: `feature/`, `fix/`, `refactor/`, `docs/` + descriptive name

Branch from main unless working on dependent feature.

### Before Push
- Test your changes
- No console errors
- Update docs if needed
- Run `unset GITHUB_TOKEN` before pushing to avoid authentication conflicts
