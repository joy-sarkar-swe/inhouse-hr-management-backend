/**
 * @fileoverview DTO for 401 Unauthorized responses, used in Swagger documentation.
 *
 * The `message` and `error` fields reflect localized output — the actual value
 * returned at runtime depends on the `lang` request header (`en` | `bn`).
 */
import { ApiProperty } from '@nestjs/swagger';
import { Methods } from '../enum/methods.enum';

export class CustomUnauthorizedDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example: 'Session expired or invalid token',
    description:
      'localized message. ' +
      'EN: "Session expired or invalid token" | ' +
      'BN: "সেশনের মেয়াদ শেষ হয়েছে বা টোকেন অকার্যকর"',
  })
  message!: string;

  @ApiProperty({ example: Methods.POST })
  method!: Methods;

  @ApiProperty({ example: '/' })
  endpoint!: string;

  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({ example: '2026-02-22T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({
    example: 'Session expired or invalid token',
    description:
      'localized error detail. ' +
      'EN: "Session expired or invalid token" | ' +
      'BN: "সেশনের মেয়াদ শেষ হয়েছে বা টোকেন অকার্যকর"',
  })
  error!: string;
}
