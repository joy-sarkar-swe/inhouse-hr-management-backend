/**
 * @fileoverview DTO for the refresh-token endpoint.
 *
 * The client must supply the opaque refresh token string returned by login
 * or a previous refresh call. The token format is:
 *   `refresh:{userId}:{sessionId}`
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    example:
      'refresh:69b8bba8-f2e6-bd15-2e34-b0f1a1234567:c7f3e91a-4b2d-4e8f-9a1c-3d5f7b2e6a04',
    description:
      'The opaque refresh token returned by the login or refresh endpoint. ' +
      'Format: `refresh:{userId}:{sessionId}`.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^refresh:[0-9a-f-]{36}:[0-9a-f-]{36}$/i, {
    message: 'refresh_token must be a valid refresh token',
  })
  refresh_token!: string;
}
