/**
 * @fileoverview BulkValidationPipe — validates an array of `SendEmailDto` items.
 *
 * Throws a structured 400 with per-item `{ index, field, message }` errors.
 */
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendEmailDto } from 'src/modules/email-service/dto/send-email.dto';

const VALIDATION_FAILED = 'Validation failed';
const BODY_MUST_BE_ARRAY = 'Request body must be an array';
const BODY_MUST_NOT_BE_EMPTY = 'Request body must contain at least one item';
const BULK_VALIDATION_FAILED = 'One or more items failed validation';

@Injectable()
export class BulkValidationPipe implements PipeTransform {
  async transform(
    value: unknown,
    _metadata: ArgumentMetadata,
  ): Promise<unknown> {
    if (!Array.isArray(value)) {
      throw new BadRequestException({
        message: VALIDATION_FAILED,
        errors: [{ field: 'body', message: BODY_MUST_BE_ARRAY }],
      });
    }

    if (value.length === 0) {
      throw new BadRequestException({
        message: VALIDATION_FAILED,
        errors: [{ field: 'body', message: BODY_MUST_NOT_BE_EMPTY }],
      });
    }

    const errors: { index: number; field: string; message: string }[] = [];

    for (let i = 0; i < value.length; i++) {
      const dto = plainToInstance(SendEmailDto, value[i]);

      const validationErrors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

      for (const err of validationErrors) {
        const constraints = Object.values(err.constraints || {});
        for (const msg of constraints) {
          errors.push({ index: i, field: err.property, message: msg });
        }
      }
    }

    if (errors.length) {
      throw new BadRequestException({
        message: BULK_VALIDATION_FAILED,
        errors,
      });
    }

    return value;
  }
}
