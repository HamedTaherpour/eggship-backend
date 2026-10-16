import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '../../../src/generated/prisma/client';
import { postgresIntegrationImports } from '../support/postgres-testing-module';
import { PrismaService } from '../../../src/infrastructure/database/prisma/prisma.service';
import { UserRepository } from '../../../src/modules/users/infrastructure/user.repository';
import { StoreProfileRepository } from '../../../src/modules/users/infrastructure/store-profile.repository';
import { UsersModule } from '../../../src/modules/users/users.module';

let phoneCounter = 0;

function uniquePhone(): string {
  phoneCounter += 1;
  const suffix = String(Date.now() + phoneCounter).slice(-7);
  return `+98912${suffix}`;
}

describe('StoreProfile persistence (integration, STORE-02)', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let users: UserRepository;
  let profiles: StoreProfileRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [...postgresIntegrationImports([UsersModule])],
    }).compile();

    app = moduleRef;
    prisma = moduleRef.get(PrismaService);
    users = moduleRef.get(UserRepository);
    profiles = moduleRef.get(StoreProfileRepository);
    await app.init();
  });

  afterAll(async () => app.close());

  it('persists one profile per user and atomically replaces its fields', async () => {
    const user = await users.create({ phone: uniquePhone() });
    const created = await profiles.create(user.id, {
      storeName: 'Central Store',
      address: 'Main Street',
      latitude: 35.6892,
      longitude: 51.389,
    });

    expect(created).toMatchObject({
      userId: user.id,
      storeName: 'Central Store',
      address: 'Main Street',
      latitude: 35.6892,
      longitude: 51.389,
    });

    await expect(
      profiles.create(user.id, {
        storeName: 'Duplicate Store',
        address: 'Other Street',
        latitude: 36,
        longitude: 52,
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const replaced = await profiles.replaceForUser(user.id, {
      storeName: 'North Store',
      address: 'Second Street',
      latitude: 36,
      longitude: 52,
    });
    expect(replaced).toMatchObject({
      userId: user.id,
      storeName: 'North Store',
      address: 'Second Street',
      latitude: 36,
      longitude: 52,
    });

    await expect(profiles.findByUserId(user.id)).resolves.toMatchObject({
      storeName: 'North Store',
      latitude: 36,
      longitude: 52,
    });
  });

  it('rejects invalid coordinates at the domain boundary', async () => {
    const user = await users.create({ phone: uniquePhone() });

    await expect(
      profiles.create(user.id, {
        storeName: 'Invalid Store',
        address: 'Main Street',
        latitude: 90.001,
        longitude: 51,
      }),
    ).rejects.toThrow(/latitude/u);
  });

  it('keeps legacy orders nullable and rejects partial delivery snapshots', async () => {
    const user = await users.create({ phone: uniquePhone() });
    const region = await prisma.region.create({
      data: { name: `Region ${randomUUID().slice(0, 8)}` },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        customerPhone: user.phone,
        regionId: region.id,
        regionName: region.name,
        grossSubtotal: 0n,
        lineDiscountTotal: 0n,
        subtotalAfterLineDiscounts: 0n,
        orderDiscountAmount: 0n,
        total: 0n,
        pricingEvaluatedAt: new Date('2026-10-17T08:00:00.000Z'),
        commercePolicyRevision: null,
      },
    });

    expect(order.deliveryStoreName).toBeNull();
    expect(order.deliveryAddress).toBeNull();
    expect(order.deliveryLatitude).toBeNull();
    expect(order.deliveryLongitude).toBeNull();

    await expect(
      prisma.order.update({
        where: { id: order.id },
        data: { deliveryAddress: 'Partial snapshot' },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('enforces profile coordinate ranges in the database', async () => {
    const user = await users.create({ phone: uniquePhone() });

    await expect(
      prisma.storeProfile.create({
        data: {
          userId: user.id,
          storeName: 'Database Check Store',
          address: 'Main Street',
          latitude: new Prisma.Decimal('91'),
          longitude: new Prisma.Decimal('51'),
        },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
