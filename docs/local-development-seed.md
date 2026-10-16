# Local development seed

Run the canonical fixture with:

```bash
NODE_ENV=development pnpm db:seed:dev
```

PostgreSQL must be running locally, the database must be named `eggship`, and
`.env` must contain its development `DATABASE_URL`. Apply migrations first with
`pnpm prisma:migrate:dev` when needed.

The seed is deterministic, idempotent, and does not reset, drop, truncate, or
modify unrelated rows. It creates three active categories, one active Tehran
development region, three active products with integer-Toman prices, the
canonical inventory history, three synthetic customers, two complete
StoreProfiles, one clearly identified customer without a StoreProfile, two
delivered historical orders, and the commerce singleton when absent (schedule
disabled, minimum quantity 1, revision 1). Each seeded order has all four
delivery snapshot fields copied from its corresponding StoreProfile in the
same seed transaction. Seeded historical shipments reduce the first product to
99 available units and the second to 98; the third remains at 100. No
discounts or media are seeded.

Commerce foreign keys require one deterministic inactive synthetic Admin row,
`seed-actor@localhost.test`, as provenance for the local settings. Its password hash
is unusable and it cannot authenticate.

The normal guard accepts only `NODE_ENV=development`, PostgreSQL, a loopback
host (`localhost`, `127.0.0.1`, or `::1`), and database name exactly `eggship`;
it fails before connecting for production, staging, test, remote, or unknown
targets. For isolated verification only, set `EGGSHIP_SEED_TARGET=test` and
map an explicit `TEST_DATABASE_URL` to `DATABASE_URL`; the same loopback guard
then permits only `/eggship_test`. The command prints seeded customer/profile/
order counts, snapshot counts, product IDs, prices, and available stock.

Use `pnpm load:prepare` for the complete authenticated REL-03 fixture workflow
after the canonical seed is present. It validates these fixed IDs and writes
the ignored `.local/eggship-k6.env` configuration without printing tokens.
Preparation checkpoints successful customer/Admin refresh sessions in the
ignored `.local/eggship-k6-auth.json` file, so interrupted runs reuse valid
sessions instead of requesting OTPs again. OTP rate-limit responses fail fast
with the endpoint, stable error code, and `Retry-After` duration; the workflow
does not bypass or reset the authentication limiter.

For faster local fixture preparation, explicitly opt into the development-only
OTP defaults before starting the API:

```bash
export NODE_ENV=development
export EGGSHIP_LOCAL_DEVELOPMENT=true
export OTP_RESEND_COOLDOWN_SECONDS=2
export OTP_PHONE_WINDOW_SECONDS=300
export OTP_PHONE_WINDOW_LIMIT=20
export OTP_IP_WINDOW_SECONDS=300
export OTP_IP_WINDOW_LIMIT=100
```

The opt-in requires loopback PostgreSQL and Redis targets. Production/staging
configuration retains the 60-second, 3600-second, 5-request, and 20-request
defaults. Existing Redis cooldown keys retain their original TTL and expire
naturally; changing configuration does not delete or rewrite them.
The fixed IDs are also:

```bash
export LOAD_TEST_PRODUCT_IDS=00000000-0000-4000-8000-000000000201,00000000-0000-4000-8000-000000000202,00000000-0000-4000-8000-000000000203
export LOAD_TEST_REGION_ID=00000000-0000-4000-8000-000000000010
```

The customer with phone `+989123333333` intentionally has no StoreProfile and
is suitable for negative order-creation checks. The two seeded orders are
historical `DELIVERED` fixtures; repeated seed execution preserves their
snapshots and does not create duplicates.

`pnpm load:prepare` creates separate synthetic customers, deterministically
replaces their StoreProfiles, and verifies the immutable delivery snapshot on
each created or replayed order. The profile-less seeded customer remains
available for negative order-gate checks and is not used by k6 scenarios.
