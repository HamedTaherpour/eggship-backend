# Users module

Owns customer/store identity persistence and authenticated profile reads/updates.

| Path              | Role                                                              |
| ----------------- | ----------------------------------------------------------------- |
| `domain/`         | User and StoreProfile record types, Iranian phone normalization   |
| `application/`    | `CustomerProfileService` (current-user load / allowlisted update) |
| `infrastructure/` | `UserRepository` plus `StoreProfileRepository` persistence        |
| `api/`            | `UsersController` (`PATCH /users/me`)                             |
| `users.module.ts` | Nest registration                                                 |

The authenticated storefront subject is the `User` row itself. AUTH-07 identity is phone-only; StoreProfile completion is separate from OTP authentication. Policy: [instructions/authentication.md](../../../instructions/authentication.md).

STORE-02 adds an optional one-to-one `StoreProfile` owned by this module. STORE-03
exposes it only through the authenticated customer profile routes: `GET
/auth/me` reports the optional profile and `PATCH /users/me` creates or replaces
all four fields. The repository accepts both Prisma transaction clients and the
opaque `TransactionContext` used by Orders.

STORE-04/05 requires a complete profile for new customer orders. Order creation
reads and locks the profile row inside the existing repeatable-read transaction,
then writes all four delivery snapshot fields from that one persisted row. A
missing or incomplete profile returns `STORE_PROFILE_REQUIRED` (HTTP 409). The
snapshot is immutable; later profile edits affect only future orders. Existing
orders may have an all-null snapshot because they predate this feature.

The Admin customer read endpoints extend their existing contracts with profile
completion status and, on detail, the full persisted profile. The repository
joins StoreProfile in the customer read query, avoiding per-customer fan-out.
These fields remain behind `CUSTOMER_READ` and `Cache-Control: no-store`.

Production rollout is staged: additive database migration, profile read/write
APIs, storefront profile UX, enabling the profile-required order gate, then the
Admin location UI. The order gate must not be enabled before clients can collect
the required profile, so this feature is not a production-readiness claim by
itself.
