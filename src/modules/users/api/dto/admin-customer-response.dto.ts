import { ApiProperty } from '@nestjs/swagger';
import { createPaginatedResponseDto } from '../../../../common/list';
import type {
  AdminCustomerRecord,
  AdminCustomerReferralView,
  AdminCustomerStoreProfileView,
} from '../../domain/customer-admin';

export class AdminCustomerReferralDto {
  @ApiProperty({ format: 'uuid' })
  visitorId!: string;

  @ApiProperty({ example: 'Tehran bazaar promoter' })
  visitorName!: string;

  @ApiProperty({ example: true })
  visitorIsActive!: boolean;

  @ApiProperty({ example: 'ABCD2345EF' })
  referralCode!: string;

  @ApiProperty({ example: '2026-08-21T12:00:00.000Z' })
  attributedAt!: string;
}

/** Admin customer/store list item. Phone is purpose-limited to CUSTOMER_READ operators. */
export class AdminCustomerListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '+989121234567' })
  phone!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2026-08-21T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-21T12:00:00.000Z' })
  updatedAt!: string;

  @ApiProperty({ example: true })
  hasReferral!: boolean;

  @ApiProperty({ example: 'ABCD2345EF', nullable: true })
  referralCode!: string | null;

  @ApiProperty({ example: 'Central Store', nullable: true, maxLength: 160 })
  storeName!: string | null;

  @ApiProperty()
  hasCompleteStoreProfile!: boolean;
}

/** Admin customer/store detail with immutable referral evidence. */
export class AdminCustomerDetailDto extends AdminCustomerListItemDto {
  @ApiProperty({ type: AdminCustomerReferralDto, nullable: true })
  referral!: AdminCustomerReferralDto | null;

  @ApiProperty({ type: () => AdminCustomerStoreProfileDto, nullable: true })
  storeProfile!: AdminCustomerStoreProfileDto | null;
}

export class AdminCustomerStoreProfileDto {
  @ApiProperty({ example: 'Central Store', maxLength: 160 })
  storeName!: string;

  @ApiProperty({ example: 'Main Street 1', maxLength: 500 })
  address!: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  latitude!: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  longitude!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class AdminCustomerResponseDto {
  @ApiProperty({ type: AdminCustomerDetailDto })
  data!: AdminCustomerDetailDto;
}

export const AdminCustomerListResponseDto = createPaginatedResponseDto(
  AdminCustomerListItemDto,
  { name: 'AdminCustomerListResponseDto' },
);

function toListItem(record: AdminCustomerRecord): AdminCustomerListItemDto {
  return {
    id: record.id,
    phone: record.phone,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    hasReferral: record.referral !== null,
    referralCode: record.referral?.referralCode ?? null,
    storeName: record.storeName ?? null,
    hasCompleteStoreProfile: record.hasCompleteStoreProfile ?? false,
  };
}

function toReferralDto(
  referral: AdminCustomerReferralView,
): AdminCustomerReferralDto {
  return {
    visitorId: referral.visitorId,
    visitorName: referral.visitorName,
    visitorIsActive: referral.visitorIsActive,
    referralCode: referral.referralCode,
    attributedAt: referral.attributedAt.toISOString(),
  };
}

export function toAdminCustomerListItemDto(
  record: AdminCustomerRecord,
): AdminCustomerListItemDto {
  return toListItem(record);
}

export function toAdminCustomerDetailDto(
  record: AdminCustomerRecord,
): AdminCustomerDetailDto {
  return {
    ...toListItem(record),
    referral: record.referral === null ? null : toReferralDto(record.referral),
    storeProfile:
      record.storeProfile == null
        ? null
        : toStoreProfileDto(record.storeProfile),
  };
}

function toStoreProfileDto(
  profile: AdminCustomerStoreProfileView,
): AdminCustomerStoreProfileDto {
  return {
    storeName: profile.storeName,
    address: profile.address,
    latitude: profile.latitude,
    longitude: profile.longitude,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}
