#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const inputPath = process.argv[2];

if (!inputPath || process.argv.length !== 3) {
  process.stderr.write(
    'Usage: node scripts/reconcile-recovery-manifest.mjs <manifest.json>\n',
  );
  process.exitCode = 2;
} else {
  try {
    const report = reconcile(JSON.parse(await readFile(inputPath, 'utf8')));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.verdict === 'BLOCKED' ? 1 : 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Invalid recovery manifest.'}\n`,
    );
    process.exitCode = 2;
  }
}

function reconcile(manifest) {
  assertObject(manifest, 'manifest');
  if (manifest.evidenceVersion !== 1)
    throw new Error('manifest.evidenceVersion must be 1.');
  const postgres = objectAt(manifest, 'postgres');
  const objectStorage = objectAt(manifest, 'objectStorage');
  const media = arrayAt(postgres, 'media');
  const settlements = arrayAt(postgres, 'settlements');
  const objects = arrayAt(objectStorage, 'objects');
  const mediaKeys = new Map(
    media.map((row) => [stringAt(row, 'storageKey'), row]),
  );
  const objectKeys = new Set(objects.map((row) => stringAt(row, 'key')));
  const missingReferencedObjects = [...mediaKeys.keys()].filter(
    (key) => !objectKeys.has(key),
  );
  const unexpectedObjects = [...objectKeys].filter(
    (key) => !mediaKeys.has(key),
  );
  const missingSettlementMedia = settlements
    .filter(
      (row) =>
        row.receiptMediaId !== null &&
        !media.some((mediaRow) => mediaRow.id === row.receiptMediaId),
    )
    .map((row) => stringAt(row, 'orderId'));
  const postgresTimestamp = stringAt(postgres, 'backupTimestamp');
  const objectStorageTimestamp = stringAt(objectStorage, 'copyTimestamp');
  const timestampsMatch = postgresTimestamp === objectStorageTimestamp;
  const hardFailures =
    missingReferencedObjects.length > 0 || missingSettlementMedia.length > 0;
  const manualReview = !timestampsMatch || unexpectedObjects.length > 0;
  const report = {
    evidenceVersion: 1,
    verdict: hardFailures
      ? 'BLOCKED'
      : manualReview
        ? 'MANUAL_REVIEW_REQUIRED'
        : 'READY_FOR_OPERATOR_REVIEW',
    postgres: {
      backupId: stringAt(postgres, 'backupId'),
      backupTimestamp: postgresTimestamp,
      migrationState: stringAt(postgres, 'migrationState'),
      appVersion: stringAt(postgres, 'appVersion'),
      gitSha: stringAt(postgres, 'gitSha'),
      mediaRowCount: media.length,
      settlementRowCount: settlements.length,
    },
    objectStorage: {
      copyId: stringAt(objectStorage, 'copyId'),
      copyTimestamp: objectStorageTimestamp,
      objectCount: objects.length,
    },
    consistency: {
      timestampsMatch,
      missingReferencedObjectCount: missingReferencedObjects.length,
      missingReferencedObjectKeys: missingReferencedObjects,
      missingSettlementMediaCount: missingSettlementMedia.length,
      missingSettlementOrderIds: missingSettlementMedia,
      unexpectedObjectCount: unexpectedObjects.length,
      unexpectedObjectKeys: unexpectedObjects,
      timestampMismatchRequiresHumanDecision: !timestampsMatch,
      anonymousAccessMustBeVerifiedSeparately: true,
    },
  };
  report.evidenceSha256 = createHash('sha256')
    .update(JSON.stringify(report))
    .digest('hex');
  return report;
}

function assertObject(value, name) {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${name} must be an object.`);
}
function objectAt(parent, name) {
  const value = parent[name];
  assertObject(value, `manifest.${name}`);
  return value;
}
function arrayAt(parent, name) {
  if (!Array.isArray(parent[name]))
    throw new Error(`manifest.${name} must be an array.`);
  return parent[name];
}
function stringAt(parent, name) {
  if (typeof parent[name] !== 'string' || parent[name].length === 0)
    throw new Error(`A non-empty string is required at ${name}.`);
  return parent[name];
}
