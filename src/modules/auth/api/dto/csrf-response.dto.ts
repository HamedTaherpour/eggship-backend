import { ApiProperty } from '@nestjs/swagger';

export class CsrfTokenDataDto {
  @ApiProperty({
    description: 'Frontend-readable signed double-submit CSRF token.',
    example: 'synthetic-token-value',
  })
  token!: string;
}

export class CsrfTokenResponseDto {
  @ApiProperty({ type: CsrfTokenDataDto })
  data!: CsrfTokenDataDto;
}
