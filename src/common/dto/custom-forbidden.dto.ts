/**
 * @fileoverview DTO for 403 Forbidden responses, used in Swagger documentation.
 *
 * The `message` and `error` fields reflect localized output — the actual value
 * returned at runtime depends on the `lang` request header (`en` | `bn`).
 */
import { ApiProperty } from '@nestjs/swagger';
import { Methods } from '../enum/methods.enum';

export class CustomForbiddenDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example: 'Insufficient permissions',
    description:
      'localized message. ' +
      'EN: "Insufficient permissions" | ' +
      'BN: "অপর্যাপ্ত অনুমতি"',
  })
  message!: string;

  @ApiProperty({ example: Methods.POST })
  method!: Methods;

  @ApiProperty({ example: '/' })
  endpoint!: string;

  @ApiProperty({ example: 403 })
  statusCode!: number;

  @ApiProperty({ example: '2026-02-22T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({
    example: 'Insufficient permissions',
    description:
      'localized error detail. ' +
      'EN: "Insufficient permissions" | ' +
      'BN: "অপর্যাপ্ত অনুমতি"',
  })
  error!: string;
}
