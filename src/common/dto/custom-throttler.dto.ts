/**
 * @fileoverview DTO for 429 Too Many Requests responses, used in Swagger documentation.
 *
 * The `message` and `error` fields reflect localized output — the actual value
 * returned at runtime depends on the `lang` request header (`en` | `bn`).
 */
import { ApiProperty } from '@nestjs/swagger';
import { Methods } from '../enum/methods.enum';

export class CustomTooManyRequestsDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example: 'Too many requests. Please try again later.',
    description:
      'localized message. ' +
      'EN: "Too many requests. Please try again later." | ' +
      'BN: "অনেক বেশি অনুরোধ করা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।"',
  })
  message!: string;

  @ApiProperty({ example: Methods.POST })
  method!: Methods;

  @ApiProperty({ example: '/' })
  endpoint!: string;

  @ApiProperty({ example: 429 })
  statusCode!: number;

  @ApiProperty({ example: '2026-02-23T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({
    example: 'Too many requests. Please try again later.',
    description:
      'localized error detail. ' +
      'EN: "Too many requests. Please try again later." | ' +
      'BN: "অনেক বেশি অনুরোধ করা হয়েছে। অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।"',
  })
  error!: string;
}
