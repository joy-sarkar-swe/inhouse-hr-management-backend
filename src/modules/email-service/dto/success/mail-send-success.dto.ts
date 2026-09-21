/**
 * @fileoverview Swagger DTOs for 201 success responses on the email send endpoints.
 * @module email-service/dto/success
 */
import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { Methods } from 'src/common/enum/methods.enum';

export class MailSendSuccessResponseDto extends SuccessResponseDto<{
  queued: number;
}> {
  @ApiProperty({ example: 'Email sent successfully' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/test/email/send' })
  declare endpoint: string;

  @ApiProperty({ example: 201 })
  declare statusCode: number;

  @ApiProperty({
    type: 'object',
    properties: { queued: { type: 'number', example: 1 } },
    example: { queued: 1 },
  })
  declare data: { queued: number };
}

export class MailSendBulkSuccessResponseDto extends SuccessResponseDto<{
  queued: number;
}> {
  @ApiProperty({ example: 'Bulk emails queued successfully' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/test/email/send-bulk' })
  declare endpoint: string;

  @ApiProperty({ example: 201 })
  declare statusCode: number;

  @ApiProperty({
    type: 'object',
    properties: { queued: { type: 'number', example: 4 } },
    example: { queued: 4 },
  })
  declare data: { queued: number };
}
