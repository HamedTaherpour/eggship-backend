import { randomUUID } from 'node:crypto';
import type { ApplicationLogger } from '../../../common/observability/application-logger.service';
import { AuthErrorCode } from '../../auth/domain/auth-error-codes';
import { AuthSubjectType } from '../../auth/domain/subject-type';
import type { UserRecord } from '../domain/user';
import type { UserRepository } from '../infrastructure/user.repository';
import type { StoreProfileRepository } from '../infrastructure/store-profile.repository';
import { CustomerProfileService } from './customer-profile.service';

describe('CustomerProfileService', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');
  const userId = randomUUID();

  let users: jest.Mocked<Pick<UserRepository, 'findById'>>;
  let storeProfiles: jest.Mocked<
    Pick<StoreProfileRepository, 'findByUserId' | 'create' | 'replaceForUser'>
  >;
  let logger: jest.Mocked<Pick<ApplicationLogger, 'info'>>;
  let service: CustomerProfileService;

  beforeEach(() => {
    users = { findById: jest.fn() };
    storeProfiles = {
      findByUserId: jest.fn(),
      create: jest.fn(),
      replaceForUser: jest.fn(),
    };
    logger = { info: jest.fn() };
    service = new CustomerProfileService(
      users as unknown as UserRepository,
      storeProfiles as unknown as StoreProfileRepository,
      logger as unknown as ApplicationLogger,
    );
  });

  function user(overrides: Partial<UserRecord> = {}): UserRecord {
    return {
      id: userId,
      phone: '+989121234567',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('returns the authenticated user profile', async () => {
    users.findById.mockResolvedValue(user());
    storeProfiles.findByUserId.mockResolvedValue(null);
    const profile = await service.getCurrentProfile({
      subjectId: userId,
      subjectType: AuthSubjectType.USER,
      sessionId: randomUUID(),
    });
    expect(profile.id).toBe(userId);
    expect(profile.phone).toBe('+989121234567');
    expect(profile.profileComplete).toBe(true);
    expect(profile.storeProfile).toBeNull();
    expect(profile.hasCompleteStoreProfile).toBe(false);
  });

  it('rejects inactive users', async () => {
    users.findById.mockResolvedValue(user({ isActive: false }));
    await expect(
      service.getCurrentProfile({
        subjectId: userId,
        subjectType: AuthSubjectType.USER,
        sessionId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: AuthErrorCode.ACCOUNT_DISABLED });
  });

  it('creates a store profile for the authenticated owner', async () => {
    users.findById.mockResolvedValue(user());
    storeProfiles.findByUserId.mockResolvedValue(null);
    storeProfiles.create.mockResolvedValue({
      id: randomUUID(),
      userId,
      storeName: 'Central Store',
      address: 'Main Street',
      latitude: 35.6892,
      longitude: 51.389,
      createdAt: now,
      updatedAt: now,
    });
    const profile = await service.updateCurrentProfile(
      {
        subjectId: userId,
        subjectType: AuthSubjectType.USER,
        sessionId: randomUUID(),
      },
      {
        storeName: ' Central Store ',
        address: ' Main Street ',
        latitude: 35.6892,
        longitude: 51.389,
      },
    );
    expect(profile.phone).toBe('+989121234567');
    expect(profile.storeProfile?.storeName).toBe('Central Store');
    expect(profile.hasCompleteStoreProfile).toBe(true);
    expect(storeProfiles.create).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ storeName: ' Central Store ' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'user.profile.updated',
        subjectId: userId,
        fieldsUpdated: ['storeName', 'address', 'latitude', 'longitude'],
      }),
      expect.any(String),
    );
  });

  it('replaces an existing store profile for the authenticated owner', async () => {
    users.findById.mockResolvedValue(user());
    const existing = {
      id: randomUUID(),
      userId,
      storeName: 'Old Store',
      address: 'Old Address',
      latitude: 35,
      longitude: 51,
      createdAt: now,
      updatedAt: now,
    };
    storeProfiles.findByUserId.mockResolvedValue(existing);
    storeProfiles.replaceForUser.mockResolvedValue({
      ...existing,
      storeName: 'New Store',
      address: 'New Address',
      latitude: 36,
      longitude: 52,
    });

    const profile = await service.updateCurrentProfile(
      {
        subjectId: userId,
        subjectType: AuthSubjectType.USER,
        sessionId: randomUUID(),
      },
      {
        storeName: 'New Store',
        address: 'New Address',
        latitude: 36,
        longitude: 52,
      },
    );

    expect(profile.storeProfile?.storeName).toBe('New Store');
    expect(storeProfiles.replaceForUser).toHaveBeenCalledWith(userId, {
      storeName: 'New Store',
      address: 'New Address',
      latitude: 36,
      longitude: 52,
    });
  });
});
