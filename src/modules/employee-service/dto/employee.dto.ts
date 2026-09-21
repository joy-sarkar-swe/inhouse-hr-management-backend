/**
 * @fileoverview Employee DTOs — validation, success, and error shapes.
 */
import {
  IsString, IsEmail, IsOptional, IsNumber, IsPositive,
  IsEnum, Min, Max, Matches, IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum EmployeeStatusDto {
  Active = 'Active',
  Probation = 'Probation',
  OnLeave = 'On Leave',
  Suspended = 'Suspended',
  Resigned = 'Resigned',
  Terminated = 'Terminated',
}

export enum EmploymentTypeDto {
  FullTime = 'Full-Time',
  PartTime = 'Part-Time',
  Contract = 'Contract',
}

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dob?: string;
  @ApiProperty() @IsString() @IsNotEmpty() department!: string;
  @ApiProperty() @IsString() @IsNotEmpty() designation!: string;

  @ApiPropertyOptional({ enum: EmployeeStatusDto })
  @IsOptional()
  @IsEnum(EmployeeStatusDto)
  status?: EmployeeStatusDto;

  @ApiPropertyOptional({ enum: EmploymentTypeDto })
  @IsOptional()
  @IsEnum(EmploymentTypeDto)
  type?: EmploymentTypeDto;

  @ApiProperty() @IsNumber() @IsPositive() @Type(() => Number) hourlyRate!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(24) @Type(() => Number) dailyHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Type(() => Number) weeklyHours?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{2}:\d{2}$/) workStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) breakMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() joinDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dob?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() designation?: string;
  @ApiPropertyOptional({ enum: EmployeeStatusDto }) @IsOptional() @IsEnum(EmployeeStatusDto) status?: EmployeeStatusDto;
  @ApiPropertyOptional({ enum: EmploymentTypeDto }) @IsOptional() @IsEnum(EmploymentTypeDto) type?: EmploymentTypeDto;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) hourlyRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Max(24) @Type(() => Number) dailyHours?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Type(() => Number) weeklyHours?: number;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{2}:\d{2}$/) workStart?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) breakMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() joinDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateMyProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
}
