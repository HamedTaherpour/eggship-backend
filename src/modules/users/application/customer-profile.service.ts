import { Injectable } from '@nestjs/common';
import { requireCustomerOwnerId } from '../../../common/authz/resource-ownership';
import { ApplicationLogger } from '../../../common/observability/application-logger.service';
import { AuthError } from '../../auth/domain/auth-error';
import { AuthErrorCode } from '../../auth/domain/auth-error-codes';
import type { AuthenticatedPrincipal } from '../../auth/domain/authenticated-principal';
import { AuthSubjectType } from '../../auth/domain/subject-type';
import type { UserRecord } from '../domain/user';
import type {
  StoreProfileInput,
  StoreProfileRecord,
} from '../domain/store-profile';
import { StoreProfileRepository } from '../infrastructure/store-profile.repository';
import { UserRepository } from '../infrastructure/user.repository';

export interface CustomerProfileView {
  id: string;
  phone: string;
  isActive: boolean;
  profileComplete: boolean;
  createdAt: Date;
  updatedAt: Date;
  storeProfile: StoreProfileView | null;
  hasCompleteStoreProfile: boolean;
}

export interface StoreProfileView {
  storeName: string;
  address: string;
  latitude: number;
  longitude: number;
}

/**
 * Current-user profile reads/updates for the authenticated storefront subject.
 * Identity always comes from the access-token principal — never from client ids.
 */
@Injectable()
export class CustomerProfileService {
  constructor(
    private readonly users: UserRepository,
    private readonly storeProfiles: StoreProfileRepository,
    private readonly logger: ApplicationLogger,
  ) {}

  async getCurrentProfile(
    principal: AuthenticatedPrincipal,
  ): Promise<CustomerProfileView> {
    const user = await this.requireActiveUser(principal);
    const storeProfile = await this.storeProfiles.findByUserId(user.id);
    return toProfileView(user, storeProfile);
  }

  /**
   * Replaces the authenticated owner's complete StoreProfile. Phone, isActive,
   * and ids are never mutable here; request validation is enforced by the DTO
   * and the StoreProfile domain boundary.
   */
  async updateCurrentProfile(
    principal: AuthenticatedPrincipal,
    input: StoreProfileInput,
  ): Promise<CustomerProfileView> {
    const user = await this.requireActiveUser(principal);
    const existing = await this.storeProfiles.findByUserId(user.id);
    const storeProfile =
      existing === null
        ? await this.storeProfiles.create(user.id, input)
        : await this.storeProfiles.replaceForUser(user.id, input);

    this.logger.info(
      {
        module: 'users',
        operation: 'user.profile.updated',
        subjectType: AuthSubjectType.USER,
        subjectId: user.id,
        fieldsUpdated: ['storeName', 'address', 'latitude', 'longitude'],
      },
      'Customer store profile updated',
    );

    return toProfileView(user, storeProfile);
  }

  private async requireActiveUser(
    principal: AuthenticatedPrincipal,
  ): Promise<UserRecord> {
    const ownerId = requireCustomerOwnerId(principal);
    const user = await this.users.findById(ownerId);
    if (user === null) {
      throw new AuthError(
        AuthErrorCode.UNAUTHENTICATED,
        'Authentication required.',
      );
    }
    if (!user.isActive) {
      throw new AuthError(
        AuthErrorCode.ACCOUNT_DISABLED,
        'Account is disabled.',
      );
    }
    return user;
  }
}

function toProfileView(
  user: UserRecord,
  storeProfile: StoreProfileRecord | null,
): CustomerProfileView {
  return {
    id: user.id,
    phone: user.phone,
    isActive: user.isActive,
    profileComplete: true,
    storeProfile:
      storeProfile === null ? null : toStoreProfileView(storeProfile),
    hasCompleteStoreProfile: storeProfile !== null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toStoreProfileView(profile: StoreProfileRecord): StoreProfileView {
  return {
    storeName: profile.storeName,
    address: profile.address,
    latitude: profile.latitude,
    longitude: profile.longitude,
  };
}
