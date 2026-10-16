# DEP-05: Backup strategy and isolated restore test

## Architecture

PostgreSQL is the authoritative recovery source for durable business state.
Liara DBaaS owns provider-native backup creation and storage. EggShip
Operations owns selecting a usable artifact, restoring it into isolated
non-production PostgreSQL, verifying migration/application compatibility,
reconciling business invariants, and retaining safe evidence.

Object Storage bytes are a separate recovery concern. Current verified Liara
Object Storage API facts establish bucket/object operations, migration,
access keys, and private/public policy, but do not establish provider-native
backup, snapshot, versioning, or replication recovery. Bucket durability is not
treated as a backup. Redis/BullMQ is ephemeral and is not a backup target;
recovery rebuilds it from PostgreSQL, Outbox, retries, and re-dispatch.

This design adds no backup scheduler, automatic rollback, PITR claim, retention
cleanup, or production provisioning.

## PostgreSQL backup model

Liara provider-native DBaaS backup is an approved recovery source. Migration
gates and drill evidence record only safe identifiers and timestamps: provider
backup id, backup timestamp, source environment, migration state, `APP_VERSION`,
and `GIT_SHA`.

Before the drill, the provider must document whether a backup restores directly
to a fresh Liara PostgreSQL instance or must be downloaded and restored through
a tool, plus PostgreSQL-version compatibility, encryption semantics, and
create/list/download/restore permissions. No PITR or retention guarantee is
inferred.

## Object Storage recovery options

| Option                                      | Correlated failure risk           | Deletion/credential/operator risk                             | Cost/complexity | Restore speed     | Isolation                    |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------- | --------------- | ----------------- | ---------------------------- |
| A. Copy to separate private recovery bucket | High if same provider/account     | Separate policy helps; shared credentials remain a risk       | Lowest          | Fast              | Bucket-level only            |
| B. Copy to another Liara bucket             | High provider correlation         | Better accidental-delete separation with distinct credentials | Low             | Fast              | Limited cross-tier isolation |
| C. Copy outside primary failure domain      | Lower correlation                 | Strongest credential isolation, but more operations           | Highest         | Depends on import | Strongest                    |
| D. Later provider-native feature            | Unknown until officially verified | Depends on documented controls                                | Unknown         | Unknown           | Unknown                      |

## Recommended object-storage strategy

Use a periodic private recovery copy with a separate credential and independent
object namespace as the minimum architecture. Prefer a destination outside the
primary failure domain (C) when operations can support it; B is an interim
provider-scoped improvement and A is the minimum if only one Liara account is
available. The copy process is not implemented in DEP-05. It must never make
the production bucket public, use application-server disk, reuse application
credentials, or silently delete source/destination objects. DATA-03 governs
retention and cleanup; no duration is set here.

## Cross-system consistency model

PostgreSQL and Object Storage have independent recovery artifacts; no atomic
cross-system snapshot is claimed. Every pair records independent identifiers
and timestamps. Timestamp skew requires an operator decision based on observed
writes and reconciliation results.

The read-only manifest tool compares restored PostgreSQL Media references and
Settlement receipt references with an object recovery manifest. It reports
missing referenced objects as a blocker, missing settlement Media rows as a
blocker, unexpected/unreferenced objects separately, and timestamp skew as
`MANUAL_REVIEW_REQUIRED`. It emits a safe evidence hash and performs no copy,
delete, restore, or production connection.

## Restore drill runbook

The drill must be completed before DEP-05 is DONE:

1. Declare isolated non-production PostgreSQL, a private Object Storage bucket,
   network boundaries, and separate least-privilege credentials. Confirm the
   production API and Worker cannot resolve either restored target.
2. Record the selected Liara backup id/timestamp, Object Storage copy
   id/timestamp, `APP_VERSION`, `GIT_SHA`, and migration state. Stop if required
   recovery evidence is unavailable.
3. Select/download the real provider backup through Liara's documented
   procedure, keeping it outside the repository as PII-bearing material.
4. Restore it into isolated PostgreSQL. Never point production API/Worker at it.
5. Verify migration state with the approved migration workflow; never rewrite an
   applied migration.
6. Copy recovery objects into the isolated private bucket without changing the
   production policy.
7. Export safe reconciliation inputs: Media id/storageKey, Settlement
   orderId/receiptMediaId, counts, and invariant results. Exclude names, phones,
   addresses, passwords, tokens, and raw PII.
8. Run `node scripts/reconcile-recovery-manifest.mjs <manifest.json>`. Preserve
   the JSON outside the repository. `BLOCKED` stops the drill; manual review
   statuses require an operator decision and are not repair instructions.
9. Verify anonymous access to the isolated bucket/object endpoint is denied;
   verify authorized private reads only with the isolated credential. Record
   status codes/counts, never credentials or signed URLs.
10. Verify Order/OrderLine snapshots, Inventory `reserved <= onHand`, ledger
    after-states, reservation relationships, OrderSettlement ownership and
    receipt references, and AuditLog continuity where expected.
11. Record failures, missing/unexpected objects, timestamp skew, migration/app
    compatibility, and cleanup approval. Cleanup remains DATA-03 governed.

## Reconciliation checks

Evidence covers migration identity; representative counts and opaque IDs for
Order, OrderLine, Inventory, InventoryLedger, InventoryReservation,
OrderSettlement, Media, and AuditLog; Order→OrderLine and Order→Settlement;
Product→Inventory and reservation/ledger relationships; settlement receipt→
Media→object existence; missing references; unexpected objects; AuditLog
continuity; and private-bucket anonymous denial. No result authorizes mutation.

## Migration recovery gate

Before a high-risk/destructive migration, the release owner must have a usable
PostgreSQL artifact, verified Object Storage recovery coverage, recorded
identifiers/timestamps, and `APP_VERSION`/`GIT_SHA`/migration state. Missing
evidence blocks the migration. This is a gate, not automatic rollback and not
DEP-06.

## Security / PII model

Restored databases and object copies are PII-bearing. Use isolated,
least-privilege credentials, private networking where available, private bucket
policy, and separate source/recovery/drill credentials. Never put credentials
in evidence, logs, repository files, or command output. Evidence contains
counts, timestamps, hashes, and opaque identifiers only. Cleanup/retention
follows DATA-03. DEP-05 adds no HTTP endpoint; authentication, authorization,
ownership, transactions, and AuditLog writes are not changed.

## Evidence format

The manifest schema is intentionally small:

```json
{
  "evidenceVersion": 1,
  "postgres": {
    "backupId": "provider-opaque-id",
    "backupTimestamp": "2026-09-04T10:00:00Z",
    "migrationState": "20260904090000_med02_private_media_access",
    "appVersion": "0.1.0",
    "gitSha": "verified-source-sha",
    "media": [{ "id": "media-opaque-id", "storageKey": "media/..." }],
    "settlements": [
      { "orderId": "order-opaque-id", "receiptMediaId": "media-opaque-id" }
    ]
  },
  "objectStorage": {
    "copyId": "recovery-copy-opaque-id",
    "copyTimestamp": "2026-09-04T10:15:00Z",
    "objects": [
      { "key": "media/...", "sha256": "optional-safe-hash", "bytes": 123 }
    ]
  }
}
```

The command emits counts, opaque IDs/keys, mismatch categories, a verdict,
and `evidenceSha256`. It is read-only and exits non-zero only for `BLOCKED` or
invalid input.

## Verified Liara facts

- Official Liara DBaaS API documentation exposes create, list, and download
  database-backup operations; this is an approved PostgreSQL recovery source.
- PITR is not verified and is not claimed.
- Official Liara Object Storage API documentation exposes bucket/object,
  migration, access-key, and private/public-policy operations.
- Object Storage backup/snapshot/versioning/replication recovery capability is
  not verified from those API facts.

## Remaining provider questions

1. What is the exact restore procedure for a Liara PostgreSQL backup?
2. Can a downloaded backup restore directly to a fresh Liara PostgreSQL
   instance, and which tool/version/flags are required?
3. What are backup encryption-at-rest/in-transit semantics and key ownership?
4. Which roles/scopes can create, list, download, and restore backups?
5. What PostgreSQL major-version and extension compatibility constraints apply?
6. Does Object Storage have any backup, versioning, replication, or recovery
   feature absent from current official API docs? Provide exact documentation.
7. Can a private recovery bucket use a distinct credential/policy boundary,
   and what cross-region/cross-account options exist?

No answer is inferred from S3 compatibility or bucket durability.

## RPO / RTO / retention status

Numeric RPO, RTO, and retention values remain unresolved operational/business
policy. Independent timestamps and the stable evidence schema support defining
them later without redesign.

## Roadmap status

DEP-05 is `IN_PROGRESS`: architecture, gate, runbook, evidence format, and
read-only reconciliation are implemented, but the required provider-backed
isolated restore drill has not been demonstrated in this environment.

## Provider-verification update (2026-09-04)

This update records only facts present in the current official Liara OpenAPI
documentation and Liara's official database-move guide. It does not replace
the architecture above, provision resources, or claim that a restore drill
has run.

### PostgreSQL backup facts

The current DBaaS API documents these operations for a database owned by the
authenticated user:

- `POST /v1/databases/{id}/backups` creates a backup.
- `GET /v1/databases/{id}/backups` lists backups and exposes `name`,
  `lastModified`, `etag`, and `size`.
- `POST /v1/databases/{id}/backups/{name}/download` returns a `link`.

The API documentation does not identify the backup's logical/physical form,
archive/compression format, `pg_dump` compatibility, embedded credentials or
metadata, extension requirements, or PostgreSQL major-version compatibility.
The official Liara database-move guide does add one important fact: the
downloaded backup is compressed, must be extracted, and contains SQL files for
the transfer step. It does not document a PostgreSQL-specific `psql` or
`pg_restore` command.

### PostgreSQL restore facts and isolation boundary

No provider-side restore endpoint is present in the current DBaaS API index.
The documented move procedure is: create a target database with the same
database version, create/download/extract the source backup, then restore the
SQL files into the target. The PostgreSQL tab in that guide says to use the
Liara control-panel import path described there; it does not provide a
PostgreSQL CLI command or a credential/hostname placeholder contract.

Liara documents database creation with an explicit `version`, `publicNetwork`,
and a private-network option in the returned database metadata. However, the
official move guide explicitly says the target should use the desired private
network **and have public-network access enabled during setup**. Therefore a
private-network-only, approved-verification-environment restore cannot be
treated as verified. A temporary public-network exception would require human
approval and an exact provider-supported connection procedure; it is not
approved by DEP-05.

### Object Storage recovery facts

The current official Object Storage documentation verifies ordinary recovery
copy operations:

- list objects with pagination (maximum 50 per page), returning keys, size,
  last-modified time, ETag, and related listing fields;
- obtain a presigned download URL for an object;
- obtain a presigned upload URL for a destination object;
- obtain object statistics including size, metadata, last-modified time,
  `versionId`, and ETag;
- create a private bucket and change its public/private policy;
- create/update keys with a declared bucket set; and
- use the documented bucket migration operation with `from`, `to`, and `path`.

These are sufficient to design a bounded download/upload recovery-copy tool,
or to evaluate Liara's bucket migration operation, subject to a real staging
proof. They are not a verified Liara backup, snapshot, versioning, replication,
undelete, lifecycle-recovery, or cross-failure-domain feature. The presence of
`versionId` in the object-stat response is not treated as proof that bucket
versioning is enabled or recoverable. The documentation also does not establish
AWS-specific `CopyObject`, multipart-copy, object-lock, or checksum semantics;
the drill must use only operations actually verified against the provider.

### Security and failure-domain limits

The Liara API pages require a bearer API token and describe backup operations as
belonging to the authenticated user. They do not document backup encryption at
rest, backup retention/expiration, key ownership, or distinct backup roles or
scopes beyond that ownership boundary. Object Storage documents private/public
bucket policy, HTTPS service endpoints, presigned URLs, and bucket-scoped key
assignment. It does not establish encryption-at-rest semantics or that two
Liara buckets, projects, or accounts are independent disaster-recovery failure
domains. The external failure-domain recommendation remains preferred.

### Conditional first-drill plan

The following is the exact sequence once the two blocking provider questions
are answered in writing and approved:

1. **HUMAN APPROVAL:** approve a named source backup, target database version,
   target network, verification environment, credential scopes, and whether a
   temporary public-network exception is permitted.
2. **VERIFIED PROVIDER OPERATION:** create the temporary target database with
   the source PostgreSQL version and recorded network/public-network settings.
   **UNVERIFIED / BLOCKING:** private-only connectivity and the safe connection
   path are not established by current documentation.
3. **VERIFIED PROVIDER OPERATION:** create/list the source backup and request
   its download link. **EGGSHIP OPERATION:** keep the downloaded PII-bearing
   artifact outside the repository and record only safe identifiers/timestamps.
4. **UNVERIFIED / BLOCKING:** inspect the artifact, determine the supported
   PostgreSQL restore tool/command, and import it into the target. Do not use
   `psql` or `pg_restore` until Liara confirms the format and compatibility.
5. **EGGSHIP OPERATION:** verify migrations, application compatibility, and the
   approved invariant set against the isolated database.
6. **VERIFIED PROVIDER OPERATION:** create a private destination bucket and a
   destination-scoped key. **EGGSHIP OPERATION:** enumerate source objects,
   download each selected object, upload to the destination, and verify key,
   size, metadata, and digest where the provider exposes one. Do not use the
   migration endpoint as a backup claim.
7. **EGGSHIP OPERATION:** produce the safe object manifest and run
   `node scripts/reconcile-recovery-manifest.mjs <manifest.json>`; a blocked
   verdict stops the drill.
8. **EGGSHIP OPERATION:** perform cross-system Media/Settlement reconciliation,
   private-bucket anonymous-denial and authorized-read checks, and preserve
   evidence outside the repository.
9. **HUMAN APPROVAL:** review evidence, timestamp skew, failures, and cleanup.
   **VERIFIED PROVIDER OPERATION:** delete the temporary bucket/key/database
   only after approval; the current docs expose bucket/database/key deletion,
   but do not establish recoverability after deletion.

### Provider-verification verdict

Current provider facts are **partially sufficient** for the Object Storage
copy mechanics and for selecting/downloading a DB backup. They are not
sufficient for a safe executable restore drill because the PostgreSQL backup
format/tooling, version constraints, security/retention semantics, and
private-only target connectivity remain unverified. DEP-05 stays
`IN_PROGRESS`; no resources are provisioned and no production resource is
touched.

Authoritative sources checked:

- [Liara DBaaS backup API](https://developers.liara.ir/dbass/backups/get-all-backups),
  [create backup](https://developers.liara.ir/dbass/backups/backup-a-database),
  and [download backup](https://developers.liara.ir/dbass/backups/download-a-backup)
- [Liara database-move guide](https://github.com/liara-cloud/docs/blob/master/src/pages/dbaas/move.mdx)
- [Liara Object Storage API](https://developers.liara.ir/pages/object-storage),
  [list objects](https://developers.liara.ir/object-storage/object/list-objects),
  [object statistics](https://developers.liara.ir/object-storage/object/get-stat-object),
  and [bucket migration](https://developers.liara.ir/object-storage/bucket/migrating-buckets)
