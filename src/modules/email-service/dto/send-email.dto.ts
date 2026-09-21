/**
 * @fileoverview SendEmailDto — validation DTO for outgoing email payloads.
 *
 * Used by both the general email endpoint and the bulk endpoint.
 * Supports single-address and multi-address sends in one unified shape.
 *
 * @module email-service/dto
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

/**
 * SendEmailDto defines the parameters required for sending an email.
 * It supports both single and multiple recipients and includes validation for all fields.
 */
export class SendEmailDto {
  /**
   * The recipient's email address or an array of email addresses for bulk sending.
   * Each address must be in a valid email format.
   */
  @ApiProperty({
    description:
      'Single email address or an array of addresses for multi-recipient send.',
    oneOf: [
      { type: 'string', example: 'user@example.com' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['alice@example.com', 'bob@example.com'],
      },
    ],
  })
  @ValidateIf((o: SendEmailDto) => !Array.isArray(o.to))
  @IsEmail()
  @ValidateIf((o: SendEmailDto) => Array.isArray(o.to))
  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  to!: string | string[];

  /**
   * The subject line of the email.
   */
  @ApiProperty({
    description: 'The subject line of the email.',
    type: String,
    example: 'Welcome to our platform!',
    required: true,
  })
  @IsString()
  subject!: string;

  /**
   * The HTML content of the email body.
   * Use this for rich-text email content.
   */
  @ApiProperty({
    description: 'The HTML body of the email.',
    type: String,
    example: '<h1>Welcome!</h1><p>We are glad to have you.</p>',
    required: false,
  })
  @IsOptional()
  @IsString()
  html?: string;

  /**
   * The plain-text fallback content for the email body.
   * This is shown if the recipient's email client doesn't support HTML.
   */
  @ApiProperty({
    description: 'The plain-text body of the email for non-HTML clients.',
    type: String,
    example: 'Welcome! We are glad to have you.',
    required: false,
  })
  @IsOptional()
  @IsString()
  text?: string;
}
