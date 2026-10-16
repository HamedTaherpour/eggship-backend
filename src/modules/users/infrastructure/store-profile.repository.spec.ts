import { Prisma } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../infrastructure/database/prisma/prisma.service';
import { StoreProfileRepository } from './store-profile.repository';

const USER_ID = '11111111-1111-4111-8111-111111111111';

type PersistedStoreProfile = {
  id: string;
  userId: string;
  storeName: string;
  address: string;
  latitude: Prisma.Decimal;
  longitude: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

function persistedProfile(
  overrides: Partial<PersistedStoreProfile> = {},
): PersistedStoreProfile {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: USER_ID,
    storeName: 'Central Store',
    address: 'Main Street',
    latitude: new Prisma.Decimal('35.689200'),
    longitude: new Prisma.Decimal('51.389000'),
    createdAt: new Date('2026-10-17T08:00:00.000Z'),
    updatedAt: new Date('2026-10-17T08:00:00.000Z'),
    ...overrides,
  };
}

describe('StoreProfileRepository', () => {
  it('maps Prisma Decimal coordinates to domain numbers on create', async () => {
    const create = jest.fn().mockResolvedValue(persistedProfile());
    const repository = new StoreProfileRepository({
      storeProfile: { create },
    } as unknown as PrismaService);

    const result = await repository.create(USER_ID, {
      storeName: '  Central Store ',
      address: ' Main Street ',
      latitude: 35.6892,
      longitude: 51.389,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        storeName: 'Central Store',
        address: 'Main Street',
        latitude: 35.6892,
        longitude: 51.389,
      },
    });
    expect(result).toMatchObject({
      userId: USER_ID,
      latitude: 35.6892,
      longitude: 51.389,
    });
  });

  it('replaces all mutable fields in one repository update', async () => {
    const update = jest.fn().mockResolvedValue(persistedProfile());
    const repository = new StoreProfileRepository({
      storeProfile: { update },
    } as unknown as PrismaService);

    await repository.replaceForUser(USER_ID, {
      storeName: 'North Store',
      address: 'Second Street',
      latitude: 36,
      longitude: 52,
    });

    expect(update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: {
        storeName: 'North Store',
        address: 'Second Street',
        latitude: 36,
        longitude: 52,
      },
    });
  });
});
