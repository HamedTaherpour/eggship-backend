import { ApiProperty } from '@nestjs/swagger';

export class StoreProfileResponseDto {
  @ApiProperty({ example: 'Central Store', maxLength: 160 })
  storeName!: string;

  @ApiProperty({ example: 'Main Street 12', maxLength: 500 })
  address!: string;

  @ApiProperty({ example: 35.6892, minimum: -90, maximum: 90 })
  latitude!: number;

  @ApiProperty({ example: 51.389, minimum: -180, maximum: 180 })
  longitude!: number;
}
