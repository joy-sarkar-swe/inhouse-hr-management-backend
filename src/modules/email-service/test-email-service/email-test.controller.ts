/**
 * @fileoverview Email test controller — ADMIN-only REST endpoints for exercising the email pipeline.
 *
 * Routes:
 *  POST /v1/test/email/send      — Enqueue a single email (or fan-out per address).
 *  POST /v1/test/email/send-bulk — Enqueue multiple independent emails in one call.
 *
 * All delivery is handled asynchronously by the BullMQ worker; API responses
 * return immediately with the number of jobs enqueued.
 *
 * @module email-service/test-email-service
 */
import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from 'src/common/decorators/api-error-response.decorator';
import { ApiSuccessResponse } from 'src/common/decorators/api-success-response.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { BulkValidationPipe } from 'src/common/pipes/bulk-validation.pipe';
import { JwtAuthGuard } from 'src/modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from 'src/modules/auth-service/guards/roles.guard';
import { ServicePayload } from 'src/shared/interfaces/response.interface';
import {
  MailSendBulkValidationDto,
  MailSendValidationDto,
} from '../dto/error/mail-send-validation-error.dto';
import { SendEmailDto } from '../dto/send-email.dto';
import {
  MailSendBulkSuccessResponseDto,
  MailSendSuccessResponseDto,
} from '../dto/success/mail-send-success.dto';
import { EmailService } from '../email.service';

/**
 * EmailTestController provides endpoints to test the background email sending functionality.
 * It allows for sending single and bulk emails to verify the integration with BullMQ and Nodemailer.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('hr')
@ApiTags('Email Test')
@Controller({
  path: 'test/email',
  version: '1',
})
export class EmailTestController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Enqueue a single email for background delivery.
   *
   * When `dto.to` is an array, one BullMQ job is created per recipient
   * (fan-out). Returns immediately with the count of enqueued jobs.
   *
   * @param dto - Email payload with recipient(s), subject, and body.
   * @returns `{ message, data: { queued } }` — number of jobs enqueued.
   */
  @ApiOperation({ summary: 'Send a single email in the background' })
  @ApiSuccessResponse(MailSendSuccessResponseDto, 201)
  @ApiErrorResponses({
    validation: MailSendValidationDto,
  })
  @Post('send')
  async sendEmail(
    @Body() dto: SendEmailDto,
  ): Promise<ServicePayload<{ queued: number }>> {
    const result = await this.emailService.sendEmail(dto);
    return { message: result.message, data: { queued: result.queued } };
  }

  /**
   * Enqueue multiple independent emails in a single call.
   *
   * Each DTO in the array may target a single address or multiple addresses.
   * Returns immediately with the total count of jobs enqueued across all items.
   *
   * @param dto - Array of email payloads, each independently validated.
   * @returns `{ message, data: { queued } }` — total jobs enqueued.
   */
  @ApiOperation({ summary: 'Send multiple emails in the background (bulk)' })
  @ApiBody({ type: SendEmailDto, isArray: true })
  @ApiSuccessResponse(MailSendBulkSuccessResponseDto, 201)
  @ApiErrorResponses({
    validation: MailSendBulkValidationDto,
  })
  @Post('send-bulk')
  @UsePipes(new BulkValidationPipe())
  async sendBulkEmail(@Body() dto: SendEmailDto[]) {
    const result = await this.emailService.sendBulkEmail(dto);

    return {
      message: result.message,
      data: { queued: result.queued },
    };
  }
}
