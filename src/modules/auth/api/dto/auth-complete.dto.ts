import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { StoreProfileResponseDto } from '../../../users/api/dto/store-profile-response.dto';

export class CompleteAuthBodyDto {
  @ApiProperty({
    format: 'uuid',
    example: '22222222-2222-4222-8222-222222222222',
    description: [
      'Single-use verification grant id from Auth_verifyOtp.',
      'Canonical phone is taken from the grant; clients must not send phone.',
    ].join(' '),
  })
  @IsUUID('4')
  verificationGrantId!: string;

  @ApiPropertyOptional({
    description: 'Optional Visitor referral code for a new registration.',
    example: 'ABCD2345EF',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  referralCode?: string;
}

export class CompleteAuthUserDto {
  @ApiProperty({
    format: 'uuid',
    example: '33333333-3333-4333-8333-333333333333',
  })
  id!: string;
}

export class CompleteAuthDataDto {
  @ApiProperty({ example: true })
  authenticated!: boolean;

  @ApiProperty({
    example: true,
    description: 'True when this completion created a new User row.',
  })
  isNewUser!: boolean;

  @ApiProperty({
    example: true,
    description: [
      'AUTH-07 identity profile is phone-only and complete once a User exists.',
      'StoreProfile completion is reported separately by the authenticated /auth/me response.',
    ].join(' '),
  })
  profileComplete!: boolean;

  @ApiProperty({ type: CompleteAuthUserDto })
  user!: CompleteAuthUserDto;
}

export class CompleteAuthResponseDto {
  @ApiProperty({ type: CompleteAuthDataDto })
  data!: CompleteAuthDataDto;
}

export class CurrentUserDto {
  @ApiProperty({
    format: 'uuid',
    example: '33333333-3333-4333-8333-333333333333',
  })
  id!: string;

  @ApiProperty({
    example: '+989121234567',
    description:
      'Canonical E.164 Iranian mobile for the authenticated subject.',
  })
  phone!: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({
    example: true,
    description:
      'Identity profile completeness for AUTH-07 (phone-only). Business fields deferred.',
  })
  profileComplete!: boolean;

  @ApiProperty({
    type: StoreProfileResponseDto,
    nullable: true,
    description: 'The authenticated customer store profile, when completed.',
  })
  storeProfile!: StoreProfileResponseDto | null;

  @ApiProperty({
    example: false,
    description: 'Whether all required StoreProfile fields are persisted.',
  })
  hasCompleteStoreProfile!: boolean;

  @ApiProperty({
    example: '2026-08-20T12:00:00.000Z',
    description: 'ISO 8601 UTC timestamp.',
  })
  createdAt!: string;

  @ApiProperty({
    example: '2026-08-20T12:00:00.000Z',
    description: 'ISO 8601 UTC timestamp.',
  })
  updatedAt!: string;
}

export class CurrentUserDataDto {
  @ApiProperty({ type: CurrentUserDto })
  user!: CurrentUserDto;
}

export class CurrentUserResponseDto {
  @ApiProperty({ type: CurrentUserDataDto })
  data!: CurrentUserDataDto;
}
