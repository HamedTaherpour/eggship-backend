import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ApiErrorResponseDto } from '../../../common/openapi/dto/common-response.dto';
import { AccessTokenGuard } from '../../auth/api/access-token.guard';
import { getAuthenticatedPrincipal } from '../../auth/api/authenticated-principal.util';
import { CurrentUserResponseDto } from '../../auth/api/dto/auth-complete.dto';
import { AuthError } from '../../auth/domain/auth-error';
import { AuthErrorCode } from '../../auth/domain/auth-error-codes';
import { CustomerProfileService } from '../application/customer-profile.service';
import { UpdateUserProfileBodyDto } from './dto/update-user-profile.dto';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly profiles: CustomerProfileService) {}

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AccessTokenGuard)
  @ApiOperation({
    operationId: 'Users_updateMe',
    summary: 'Update the authenticated customer/store profile (allowlisted)',
    description: [
      'Derives the target user exclusively from the authenticated principal.',
      'Never accepts userId from the body or query.',
      'Customer subjects only: an authenticated non-customer subject is rejected with 403.',
      "Requires all StoreProfile fields together and replaces the authenticated customer's profile.",
      'Phone identity, isActive, and security fields cannot be changed here.',
      'Address/profile mutations must not rewrite future Order shipping snapshots',
      '(Orders capture immutable snapshots at creation time).',
      'CSRF protection is required for cookie-authenticated browser clients before production.',
    ].join(' '),
  })
  @ApiCookieAuth('accessCookie')
  @ApiBearerAuth('bearer')
  @ApiBody({
    type: UpdateUserProfileBodyDto,
    description:
      'All StoreProfile fields are required together. Unknown properties are rejected.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current profile after allowlisted update.',
    type: CurrentUserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failure (including unknown fields).',
    type: ApiErrorResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid access token.',
    type: ApiErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Account disabled (`AUTH_ACCOUNT_DISABLED`) or wrong subject type (`AUTH_FORBIDDEN`).',
    type: ApiErrorResponseDto,
  })
  async updateMe(
    @Req() request: Request,
    @Body() body: UpdateUserProfileBodyDto,
  ): Promise<CurrentUserResponseDto> {
    const principal = getAuthenticatedPrincipal(request);
    if (principal === undefined) {
      throw new AuthError(
        AuthErrorCode.UNAUTHENTICATED,
        'Authentication required.',
      );
    }

    const profile = await this.profiles.updateCurrentProfile(principal, body);
    return {
      data: {
        user: {
          id: profile.id,
          phone: profile.phone,
          isActive: profile.isActive,
          profileComplete: profile.profileComplete,
          storeProfile: profile.storeProfile,
          hasCompleteStoreProfile: profile.hasCompleteStoreProfile,
          createdAt: profile.createdAt.toISOString(),
          updatedAt: profile.updatedAt.toISOString(),
        },
      },
    };
  }
}
