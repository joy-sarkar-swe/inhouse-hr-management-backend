/**
 * @fileoverview Global request validation pipe.
 *
 * Runs class-validator against every incoming DTO and, on failure, throws a
 * `BadRequestException` shaped as:
 * ```json
 * { "message": "Validation failed", "errors": [{ "field": "email", "message": "email must be an email" }] }
 * ```
 *
 * Options:
 *  - `whitelist: true` — strips properties not declared on the DTO.
 *  - `forbidNonWhitelisted: true` — rejects the request if it contains
 *    properties not declared on the DTO (instead of silently dropping them).
 *  - `stopAtFirstError: true` — only the first failing constraint per field
 *    is reported, keeping error payloads short and predictable.
 *
 * Nested DTOs (validated via `@ValidateNested()`) are flattened recursively
 * so `errors` is always a flat `{ field, message }[]`, regardless of nesting
 * depth — `error.children` is walked until each leaf constraint is reached.
 *
 * @module common/pipes
 */
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

const VALIDATION_FAILED = 'Validation failed';

@Injectable()
export class ValidationPipe implements PipeTransform {
  async transform(value: unknown, metadata: ArgumentMetadata): Promise<any> {
    if (!metadata.metatype || !this.toValidate(metadata.metatype)) {
      return value;
    }

    const object = plainToInstance(metadata.metatype, value);
    const errors = await validate(object as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: VALIDATION_FAILED,
        errors: this.flattenErrors(errors),
      });
    }

    return object;
  }

  /** Skips validation for primitive wrapper types — only plain DTO classes are validated. */
  private toValidate(metatype: unknown): boolean {
    const primitiveTypes = [String, Boolean, Number, Array, Object];
    return !primitiveTypes.includes(metatype as any);
  }

  /** Recursively flattens class-validator's ValidationError tree into a flat field/message list. */
  private flattenErrors(
    errors: ValidationError[],
    parentPath = '',
  ): { field: string; message: string }[] {
    const result: { field: string; message: string }[] = [];

    for (const error of errors) {
      const field = parentPath
        ? `${parentPath}.${error.property}`
        : error.property;

      if (error.constraints) {
        const firstConstraintKey = Object.keys(error.constraints)[0];
        result.push({
          field,
          message: error.constraints[firstConstraintKey],
        });
      }

      if (error.children && error.children.length > 0) {
        result.push(...this.flattenErrors(error.children, field));
      }
    }

    return result;
  }
}
