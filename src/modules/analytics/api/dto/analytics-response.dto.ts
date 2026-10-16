import { ApiProperty } from '@nestjs/swagger';

export class AnalyticsProductDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() isActive!: boolean;
}
export class CurrentStockDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() onHand!: number;
  @ApiProperty() reserved!: number;
  @ApiProperty() available!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
export class DailyStockItemDto {
  @ApiProperty() productId!: string;
  @ApiProperty() date!: string;
  @ApiProperty() openingStock!: number;
  @ApiProperty() received!: number;
  @ApiProperty() shipped!: number;
  @ApiProperty() returnedToStock!: number;
  @ApiProperty() writeOff!: number;
  @ApiProperty() adjustment!: number;
  @ApiProperty() closingStock!: number;
}
export class DailyStockResponseDto {
  @ApiProperty({ type: AnalyticsProductDto }) product!: AnalyticsProductDto;
  @ApiProperty({ type: [DailyStockItemDto] }) days!: DailyStockItemDto[];
}
export class InitialPriceAnchorDto {
  @ApiProperty() price!: number;
  @ApiProperty({ format: 'date-time' }) effectiveAt!: string;
  @ApiProperty() inferred!: boolean;
}
export class PriceChangeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() oldPrice!: number;
  @ApiProperty() newPrice!: number;
  @ApiProperty({ format: 'date-time' }) changedAt!: string;
}
export class PriceHistoryResponseDto {
  @ApiProperty({ type: AnalyticsProductDto }) product!: AnalyticsProductDto;
  @ApiProperty() currentPrice!: number;
  @ApiProperty({ type: InitialPriceAnchorDto })
  initialPrice!: InitialPriceAnchorDto;
  @ApiProperty({ type: InitialPriceAnchorDto, nullable: true })
  priceAtRangeStart!: InitialPriceAnchorDto | null;
  @ApiProperty({ type: [PriceChangeDto] }) changes!: PriceChangeDto[];
}

export class AnalyticsSalesOverviewDto {
  @ApiProperty() ordersCreated!: number;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  createdOrderValue!: number | string;
  @ApiProperty() ordersConfirmed!: number;
  @ApiProperty() ordersShipped!: number;
  @ApiProperty() ordersDelivered!: number;
  @ApiProperty() ordersCancelled!: number;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  cancelledOrderValue!: number | string;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  grossSales!: number | string;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  lineDiscounts!: number | string;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  orderDiscounts!: number | string;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  totalDiscounts!: number | string;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman amount. Values above JavaScript safe-integer range are decimal strings.',
  })
  netSales!: number | string;
}

export class AnalyticsTopProductDto {
  @ApiProperty({ format: 'uuid' }) productId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({
    oneOf: [
      { type: 'integer', format: 'int64' },
      { type: 'string', pattern: '^[0-9]+$' },
    ],
    description:
      'Integer Toman value for DELIVERED_VALUE; otherwise an integer quantity. Large exact values are decimal strings.',
  })
  value!: number | string;
}

export class AnalyticsTopProductsResponseDto {
  @ApiProperty({
    enum: ['DELIVERED_QUANTITY', 'DELIVERED_VALUE', 'SHIPPED_QUANTITY'],
  })
  basis!: string;
  @ApiProperty({ type: [AnalyticsTopProductDto] })
  items!: AnalyticsTopProductDto[];
}

export class AnalyticsTodayPulseDto extends AnalyticsSalesOverviewDto {
  @ApiProperty() stockReceived!: number;
  @ApiProperty() stockShipped!: number;
  @ApiProperty() stockReturnedToStock!: number;
  @ApiProperty() awaitingReviewCurrent!: number;
}
