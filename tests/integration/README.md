# Infrastructure integration tests

Real PostgreSQL and Redis integration suites live here. They are separate from ordinary unit and lightweight e2e tests.

```bash
pnpm test                 # no Docker / no live infra
pnpm test:e2e             # no Docker / no live infra
pnpm test:integration     # requires INTEGRATION_TESTS_ENABLED + TEST_* URLs
pnpm test:integration:postgres
pnpm test:integration:redis
pnpm test:integration:storage   # optional dedicated TEST object storage; never production
```

See [instructions/testing.md](../../instructions/testing.md) for taxonomy, safety, isolation, CI, and remote TEST resource rules.

Auth persistence suites under `postgres/` may truncate `User` / `AuthSession` between cases. That requires `INTEGRATION_ALLOW_DESTRUCTIVE=true` in addition to `INTEGRATION_TESTS_ENABLED=true` (set in CI for the ephemeral integration database).

Combined PostgreSQL + Redis domain suites live under `domain/` and run only with `pnpm test:integration` (`--suite=all`). PostgreSQL-only suites (`pnpm test:integration:postgres`) do not require Redis isolation; Redis-only suites do not contact PostgreSQL.

## HTTP E2E boundary classification

The repository has 30 HTTP suites. The ordinary `pnpm test:e2e` target includes
only the 27 infrastructure-free suites listed below. They replace persistence
and external-service adapters with in-memory doubles (and `app.e2e-spec.ts`
explicitly verifies Redis is disabled), so they are protected by the synthetic
`example.invalid` database URL.

| Classification                 | Suites                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reasoning                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Infrastructure-free E2E (27)   | `admin-audit-logs`, `admin-auth`, `admin-blog-content`, `admin-commerce-policy`, `admin-customers`, `admin-inventory`, `admin-management`, `admin-orders-dispatch`, `admin-pricing`, `admin-settlements`, `admin-visitors`, `anl-02-analytics`, `app`, `auth-complete`, `auth-otp`, `auth`, `authorization`, `blog-content`, `catalog-reference`, `list-query`, `media-library`, `notifications`, `orders-cancel`, `orders-create`, `orders-read`, `product-catalog`, `subject-separation` | HTTP behavior is exercised with test doubles; no live PostgreSQL or Redis is required.                 |
| PostgreSQL integration E2E (2) | `tests/integration/postgres/anl-03-analytics-http.integration-spec.ts`, `tests/integration/postgres/not-04-push-installations-http.integration-spec.ts`                                                                                                                                                                                                                                                                                                                                    | The suites create/query real Prisma rows and require the dedicated PostgreSQL integration environment. |
| Redis integration E2E (0)      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | No original suite is Redis-only.                                                                       |
| Combined integration E2E (1)   | `tests/integration/domain/asy-04-admin-api.integration-spec.ts`                                                                                                                                                                                                                                                                                                                                                                                                                            | The suite exercises real PostgreSQL state and queue/replay behavior backed by Redis.                   |

The three integration suites were moved out of `test/` without deleting or
weakening assertions. Their specialized Jest configurations remain opt-in;
the combined suite is routed through the `all` integration setup so Redis
isolation is required and explicit.
