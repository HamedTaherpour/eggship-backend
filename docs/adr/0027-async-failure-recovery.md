# ADR 0027: Durable async failure inspection and recovery

ASY-04 makes PostgreSQL authoritative for normalized execution failures and durable replay commands. `OutboxEvent.PUBLISHED` remains only an execution-infrastructure acceptance acknowledgement, not processor success. Replay references the immutable original event and is permitted only for explicitly registered recovery-capable processors.

The production registry is intentionally empty until an approved side-effect processor (expected first in NOT-05) supplies idempotency and recovery semantics. BullMQ retention is infrastructure behavior; durable retention is owned by DATA lifecycle work. External alerting is out of scope and critical recovery is technically owned by EggShip engineering until an operations ownership model exists.

Detecting a job that disappears after publication requires execution receipts or heartbeats and is a future contract; ASY-04 does not claim to solve that gap.
