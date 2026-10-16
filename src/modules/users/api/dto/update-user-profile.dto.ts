import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Customer-owned StoreProfile replacement.
 *
 * Identity/security fields are intentionally absent. All four store fields are
 * required together; unknown properties are rejected by the global validation
 * pipe (`whitelist` + `forbidNonWhitelisted`).
 */
export class UpdateUserProfileBodyDto {
  @ApiProperty({ example: 'Central Store', maxLength: 160 })
  @IsString()
  @Matches(/\S/u)
  @MinLength(1)
  @MaxLength(160)
  storeName!: string;

  @ApiProperty({ example: 'Main Street 12', maxLength: 500 })
  @IsString()
  @Matches(/\S/u)
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  @ApiProperty({ example: 35.6892, minimum: -90, maximum: 90 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 51.389, minimum: -180, maximum: 180 })
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}
