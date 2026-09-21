/**
 * @fileoverview User profile validation DTOs.
 * @module user-service/dto/validation
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User display name',
    maxLength: 100,
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
