/**
 * @fileoverview `ApiErrorResponses` — composite Swagger decorator for error responses.
 *
 * Consolidates multiple `@ApiXxxResponse()` calls into a single decorator so
 * each controller method only needs one annotation for its full error surface.
 *
 * @module common/decorators
 */
import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiPayloadTooLargeResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { CustomConflictDto } from '../dto/custom-conflict.dto';
import { CustomForbiddenDto } from '../dto/custom-forbidden.dto';
import { CustomNotFoundDto } from '../dto/custom-not-found.dto';
import { CustomUnauthorizedDto } from '../dto/custom-unauthorized.dto';
import { CustomUnsupportedMediaTypeDto } from '../dto/custom-unsupported-media-type.dto';
import { ValidationErrorResponseDto } from '../dto/validation-error.dto';
import { FileUploadPayloadTooLargeDto } from '../file-upload/dto/error/file-upload-validation-error.dto';

/**
 * Interface representing the map of optional error DTOs for different HTTP status codes.
 * Each key corresponds to a specific error scenario that can be documented in Swagger.
 */
interface ErrorDtoMap {
  /** 400 Bad Request — validation errors. */
  validation?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 401 Unauthorized — authentication failure. */
  unauthorized?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 403 Forbidden — authorization failure. */
  forbidden?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 404 Not Found — resource not found. */
  notFound?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 409 Conflict — resource state conflict. */
  conflict?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 413 Payload Too Large — request entity too large. */
  payloadTooLarge?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 415 Unsupported Media Type — media type not supported. */
  unsupported?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 500 Internal Server Error — unexpected server error. */
  internal?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
  /** 429 Too Many Requests — rate limiting. */
  throttle?:
    | Type<unknown>
    | ((...args: any[]) => any)
    | [(...args: any[]) => any]
    | string;
}

/**
 * Composite decorator that registers multiple Swagger error-response schemas at once.
 * It simplifies controller methods by grouping standard error responses into a single decorator call.
 *
 * @param dtos - A map of error types to their respective Swagger DTO classes or descriptions.
 * @returns A composite decorator combining all specified Swagger error responses.
 *
 * @example
 * ```ts
 * @ApiErrorResponses({ validation: MyValidationDto, internal: MyInternalDto })
 * ```
 */
export function ApiErrorResponses(dtos: ErrorDtoMap) {
  const decorators: (MethodDecorator & ClassDecorator)[] = [];

  if (dtos.validation)
    decorators.push(
      ApiBadRequestResponse({
        type: dtos.validation || ValidationErrorResponseDto,
      }),
    );
  if (dtos.unauthorized)
    decorators.push(
      ApiUnauthorizedResponse({
        type: dtos.unauthorized || CustomUnauthorizedDto,
      }),
    );
  if (dtos.forbidden)
    decorators.push(
      ApiForbiddenResponse({ type: dtos.forbidden || CustomForbiddenDto }),
    );
  if (dtos.notFound)
    decorators.push(
      ApiNotFoundResponse({ type: dtos.notFound || CustomNotFoundDto }),
    );
  if (dtos.conflict)
    decorators.push(
      ApiConflictResponse({ type: dtos.conflict || CustomConflictDto }),
    );
  if (dtos.payloadTooLarge)
    decorators.push(
      ApiPayloadTooLargeResponse({
        type: dtos.payloadTooLarge || FileUploadPayloadTooLargeDto,
      }),
    );
  if (dtos.unsupported)
    decorators.push(
      ApiUnsupportedMediaTypeResponse({
        type: dtos.unsupported || CustomUnsupportedMediaTypeDto,
      }),
    );
  if (dtos.throttle)
    decorators.push(ApiTooManyRequestsResponse({ type: dtos.throttle }));

  return applyDecorators(...decorators);
}
