/**
 * @fileoverview `ApiSuccessResponse` — composite Swagger decorator for 2xx success responses.
 *
 * Standardises success-response schema registration so every controller method
 * uses the same `$ref` / array schema pattern.
 *
 * @module common/decorators
 */
import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Documents a successful API response in Swagger using the provided DTO model.
 * It automatically handles single objects and arrays of the specified model.
 *
 * @param model - The DTO class used to describe the response data structure.
 * @param status - The HTTP status code indicating success (default: 200 OK).
 * @param isArray - A boolean flag indicating if the response data is an array (default: false).
 * @returns A composite decorator combining the necessary Swagger response metadata.
 *
 * @example
 * ```ts
 * @ApiSuccessResponse(GetUserResponseDto, 200)
 * @ApiSuccessResponse(GetUsersResponseDto, 200, true)
 * ```
 */
export function ApiSuccessResponse<TModel extends Type<any>>(
  model: TModel,
  status = HttpStatus.OK,
  isArray = false,
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status,
      schema: isArray
        ? { type: 'array', items: { $ref: getSchemaPath(model) } }
        : { $ref: getSchemaPath(model) },
    }),
  );
}
