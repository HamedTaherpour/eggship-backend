# REL-03 performance harness

This directory contains bounded k6 scenarios for a deployed non-production API.
It is separate from Jest and real-infrastructure integration tests. A Grafana
Cloud account is not required; the local k6 CLI is sufficient.

## Install and run

Install k6 using the [official k6 installation guide](https://grafana.com/docs/k6/latest/set-up/install-k6/). For the local authenticated scenarios, prepare the ignored fixture/configuration files first:

```bash
NODE_ENV=development pnpm load:prepare
set -a
source .local/eggship-k6.env
set +a
pnpm load:validate
```

`load:prepare` refuses non-development or non-loopback PostgreSQL/API targets,
test/staging/production/Liara markers, Redis DB 2, reset/reseed flags, and
non-development OTP providers. It verifies the canonical catalog/region,
commerce, and inventory rows, authenticates synthetic customers through the
real development OTP endpoints, provisions or reuses an ignored synthetic
`SUPER_ADMIN`, and creates/replays one owned order per synthetic customer through
the real Orders API with deterministic idempotency keys. The comma-separated
customer tokens and order IDs are kept in the same customer order so detail
reads always exercise an owner-matched session. It stores bearer/refresh material only in
`.local/eggship-k6.env` and `.local/eggship-k6-auth.json`; neither file is
tracked or included in k6 reports.

Authentication state is checkpointed after each successful customer session and
after Admin authentication, so later runs refresh those sessions before
requesting another OTP. A rate-limited request is not retried automatically
because each retry can consume the same fixed-window abuse budget; the failure
reports the endpoint, stable error code, and sanitized `Retry-After` seconds.

Run the bounded scenarios from the same Git Bash shell:

```bash
pnpm load:order-reads
pnpm load:orders
pnpm load:analytics
```

The workflow never runs k6 as part of preparation, never resets or truncates
the database, never calls real SMS/Firebase providers, and preserves existing
orders and inventory history. If an existing synthetic Admin has lost its
ignored password file, preparation stops rather than changing that account.

For manual configuration or staging, export the required configuration:

```text
LOAD_TESTS_ENABLED=true
LOAD_TEST_ENV=local                 # local or staging; never production
LOAD_TEST_BASE_URL=http://127.0.0.1:3000
LOAD_TEST_USER_TOKENS=token-a,token-b
LOAD_TEST_ADMIN_TOKEN=admin-token   # needed only for analytics
LOAD_TEST_PRODUCT_IDS=uuid-a,uuid-b
LOAD_TEST_REGION_ID=region-uuid
LOAD_TEST_ORDER_IDS=order-uuid,...  # owner-matched synthetic orders for detail reads
```

Use the repository commands so the approved bounds are not accidentally
replaced with raw k6 flags:

| Scenario    | Flow                         | Bound                                                    |
| ----------- | ---------------------------- | -------------------------------------------------------- |
| smoke       | health                       | 2 VUs / 20 seconds                                       |
| browse      | public catalog               | 10 VUs / 60 seconds                                      |
| order-reads | authenticated order reads    | 10 VUs / 60 seconds                                      |
| orders      | authenticated order creation | 5 concurrent VUs / 50 total attempts / 30-second ceiling |
| analytics   | Admin analytics              | 2 VUs / 30 seconds                                       |

```text
pnpm load:smoke       # 2 VUs / 20 seconds
pnpm load:browse      # 10 VUs / 60 seconds
pnpm load:order-reads # 10 VUs / 60 seconds
pnpm load:orders      # 5 concurrent VUs / 50 total attempts; mutating, isolated fixtures only
pnpm load:analytics   # 2 VUs / 30 seconds
```

Authenticated tokens must be short-lived and operators must verify token TTL
before each run; expired tokens are fixture failures, not performance evidence.
The analytics scenario requires an Admin token with `ANALYTICS_READ`.

`LOAD_TEST_RUNNER_APPROVED=true` is additionally required for `staging`; this
is an operator acknowledgement that the run is from a separate approved
runner, not the app host. Local runs require a loopback target. The launcher
rejects missing markers, production-like targets, unsafe bounds, and all
reset/reseed requests. It never provisions OTPs, sends SMS, or logs tokens.

## Fixture contract

Prepare fixtures separately with non-production tooling or an approved
operator run. The fixture set must contain active categories, active regions,
active products, normal inventory with ample stock, synthetic users with
short-lived bearer tokens, one owner-matched synthetic order per customer for reads, and an Admin
with `ANALYTICS_READ`. Pass only IDs/tokens through the process environment;
never commit them or put them in result artifacts. Order creation uses isolated
synthetic users, one product/region set, and a fresh UUID idempotency key per
logical order. There is intentionally no reset command in this harness.

The order-creation scenario uses k6's `shared-iterations` executor: 50 total
attempts across up to 5 concurrent VUs, with a 30-second ceiling. Each attempt
reserves at most one unit, so the worst-case impact is 50 reservations and 50
order mutations. Preparation verifies at least 50 available units for every
selected product before fixture creation and verifies the same floor again
after fixture creation. Deterministic idempotency keys make repeated runs
replay the same logical attempts instead of silently creating unlimited orders.

## Results and interpretation

k6 writes `artifacts/load-tests/<timestamp>-<scenario>.json` and `.md`. The
scenario entry point must re-export the shared `handleSummary`; the launcher
also verifies both files exist after a successful k6 process. Missing output is
an explicit failed execution, never a fully evidenced pass. JSON contains
timestamp, Git SHA, APP_VERSION, scenario, environment, credential-free base
URL, execution configuration, request/iteration/status counts, p50/median/
p90/p95/p99/max, business counters, safe expected-rejection code counts,
unexpected failures, explicit attempted/successful/rejected order counts, and
a correctness verdict. Tokens, cookies, passwords,
connection URLs, idempotency keys, and raw PII are excluded. Latency
distributions are evidence, not SLAs. VUs are concurrent workers; they are not
RPS, capacity, or a production promise. Expected business rejection (for
example insufficient stock or ordering policy rejection) is counted separately
from infrastructure failure; unexpected 5xx, malformed responses, and
network/runtime errors fail the correctness verdict. Expected rejection codes
are reported individually; an unclassified or unexpected rejection is not final
evidence.

The final REL-03 claim is local baseline evidence only. It does not establish
production RPS, concurrent-user capacity, provider capacity, or production
p95/p99/SLA. REL-04 and REL-05 own the later stress/scale/capacity and
database/query/pool/resource work.

REL-03 deliberately does not include stress, spike, soak, hot-SKU pressure,
pool changes, caching, indexes, or production traffic. REL-04 owns normal,
hot-SKU, spike, stress, and soak design. REL-05 owns query/pool/resource
review. Future hot-SKU verification must use a separate test-side PostgreSQL
verifier to prove no oversell, non-negative stock/reservations, reservation /
ledger consistency, and no duplicate effects. Future staging runs must record
API replicas/pool configuration/errors, PostgreSQL connections/waits/locks/
deadlocks/retries/query duration, and Redis/BullMQ queue health; no provider
monitoring integration is added here.
