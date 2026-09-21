/**
 * @fileoverview Swagger DTOs for 413 Payload Too Large and 415 Unsupported Media Type.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Methods } from 'src/common/enum/methods.enum';

/**
 * Represents a 413 Payload Too Large error response when a single file upload exceeds the size limit.
 */
export class FileUploadPayloadTooLargeDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({ example: 'File exceeds the maximum allowed size of 5.0 MB.' })
  message!: string;

  @ApiProperty({ example: 'POST', enum: Methods })
  method!: string;

  @ApiProperty({ example: '/api/test/file-upload/single' })
  endpoint!: string;

  @ApiProperty({ example: 413 })
  statusCode!: number;

  @ApiProperty({ example: '2026-03-13T07:55:29.481Z' })
  timestamp!: string;

  @ApiProperty({ example: 'Payload Too Large' })
  error!: string;
}

/**
 * Represents a 413 Payload Too Large error response when multiple file uploads exceed the size limit.
 */
export class FileUploadPayloadTooLargeMultipleDto extends FileUploadPayloadTooLargeDto {
  @ApiProperty({ example: '/api/test/file-upload/multiple' })
  declare endpoint: string;
}

/**
 * Represents a 415 Unsupported Media Type error response when a single uploaded file has an invalid type.
 */
export class FileUploadUnsupportedMediaTypeDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example:
      'File type "application/octet-stream" is not allowed. Allowed: image/jpeg, image/png.',
  })
  message!: string;

  @ApiProperty({ example: 'POST', enum: Methods })
  method!: string;

  @ApiProperty({ example: '/api/test/file-upload/single' })
  endpoint!: string;

  @ApiProperty({ example: 415 })
  statusCode!: number;

  @ApiProperty({ example: '2026-03-13T07:55:29.481Z' })
  timestamp!: string;

  @ApiProperty({ example: 'Unsupported Media Type' })
  error!: string;
}

/**
 * Represents a 415 Unsupported Media Type error response when one or more files in a multiple upload have invalid types.
 */
export class FileUploadUnsupportedMediaTypeMultipleDto extends FileUploadUnsupportedMediaTypeDto {
  @ApiProperty({ example: '/api/test/file-upload/multiple' })
  declare endpoint: string;
}
