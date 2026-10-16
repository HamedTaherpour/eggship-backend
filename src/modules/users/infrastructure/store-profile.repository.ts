import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  PrismaTransactionContext,
  resolvePrismaConnection,
  type PrismaConnection,
} from '../../../infrastructure/database/prisma/prisma-transaction-context';
import type { TransactionContext } from '../../../infrastructure/database/transaction';
import { PrismaService } from '../../../infrastructure/database/prisma/prisma.service';
import {
  normalizeStoreProfileInput,
  type StoreProfileInput,
  type StoreProfileRecord,
} from '../domain/store-profile';

type StoreProfileTransaction =
  Prisma.TransactionClient | TransactionContext | undefined;

type PrismaStoreProfile = {
  id: string;
  userId: string;
  storeName: string;
  address: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class StoreProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(
    userId: string,
    tx?: StoreProfileTransaction,
  ): Promise<StoreProfileRecord | null> {
    const found = await this.db(tx).storeProfile.findUnique({
      where: { userId },
    });
    return found === null ? null : mapStoreProfile(found);
  }

  /**
   * Locks the owner's profile row for an order attempt. The lock makes the
   * profile read and the four delivery snapshot values one transactionally
   * consistent unit with concurrent profile replacement.
   */
  async findByUserIdForUpdate(
    userId: string,
    tx: StoreProfileTransaction,
  ): Promise<StoreProfileRecord | null> {
    if (tx === undefined) {
      throw new Error(
        'A transaction is required for a locked StoreProfile read.',
      );
    }
    const rows = await this.db(tx).$queryRaw<PrismaStoreProfile[]>(Prisma.sql`
      SELECT "id", "userId", "storeName", "address", "latitude", "longitude",
             "createdAt", "updatedAt"
      FROM "StoreProfile"
      WHERE "userId" = ${userId}::uuid
      FOR UPDATE
    `);
    return rows.length === 0 ? null : mapStoreProfile(rows[0]!);
  }

  async create(
    userId: string,
    input: StoreProfileInput,
    tx?: StoreProfileTransaction,
  ): Promise<StoreProfileRecord> {
    const normalized = normalizeStoreProfileInput(input);
    const created = await this.db(tx).storeProfile.create({
      data: {
        userId,
        storeName: normalized.storeName,
        address: normalized.address,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
      },
    });
    return mapStoreProfile(created);
  }

  /** Replaces all profile fields in one atomic database UPDATE. */
  async replaceForUser(
    userId: string,
    input: StoreProfileInput,
    tx?: StoreProfileTransaction,
  ): Promise<StoreProfileRecord> {
    const normalized = normalizeStoreProfileInput(input);
    const updated = await this.db(tx).storeProfile.update({
      where: { userId },
      data: {
        storeName: normalized.storeName,
        address: normalized.address,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
      },
    });
    return mapStoreProfile(updated);
  }

  private db(tx: StoreProfileTransaction): PrismaConnection {
    if (tx === undefined) return this.prisma;
    if (!(tx instanceof PrismaTransactionContext)) {
      return tx as Prisma.TransactionClient;
    }
    return resolvePrismaConnection(this.prisma, tx);
  }
}

function mapStoreProfile(row: PrismaStoreProfile): StoreProfileRecord {
  return {
    id: row.id,
    userId: row.userId,
    storeName: row.storeName,
    address: row.address,
    latitude: row.latitude.toNumber(),
    longitude: row.longitude.toNumber(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
