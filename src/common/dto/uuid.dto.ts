/**
 * @fileoverview DTO for validating UUID route parameters.
 *
 * Defines DTO classes for validating UUID route parameters:
 * - UuidDto: generic `:id` parameter
 * - ShopIdDto: `:shopId` parameter
 * - ProductIdDto: `:productId` parameter
 * - OrderIdDto: `:orderId` parameter
 * - ItemIdDto: `:itemId` parameter
 * - UuidsDto: array of UUIDs
 *
 * Usage: @Param() params: UuidDto (or appropriate DTO for the route parameter name)
 */
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsUUID } from 'class-validator';

export class UuidDto {
  /** A valid UUID v4. */
  @IsUUID('4', { message: 'ID must be a valid UUID' })
  @IsNotEmpty({ message: 'ID is required' })
  id!: string;
}

export class ShopIdDto {
  @IsUUID('4', { message: 'Shop ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Shop ID is required' })
  shopId!: string;
}

export class ProductIdDto {
  @IsUUID('4', { message: 'Product ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Product ID is required' })
  productId!: string;
}

export class OrderIdDto {
  @IsUUID('4', { message: 'Order ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId!: string;
}

export class ItemIdDto {
  @IsUUID('4', { message: 'Item ID must be a valid UUID' })
  @IsNotEmpty({ message: 'Item ID is required' })
  itemId!: string;
}

export class UuidsDto {
  @IsArray({ message: 'ids must be an array' })
  @ArrayNotEmpty({ message: 'IDs array cannot be empty' })
  @IsUUID('4', { each: true, message: 'Each ID must be a valid UUID' })
  ids!: string[];
}
