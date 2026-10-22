import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import { ENROLLMENT_STATUSES, type EnrollmentStatus } from '../../../database/schema';
import {
  ENROLLMENT_REASONS,
  ENROLLMENT_WINDOW_STATES,
  type EnrollableOffering,
  type EnrollmentReason,
  type EnrollmentWindowState,
} from '../enrollable-offerings.service';

@Exclude()
export class EnrollmentAvailabilityDto {
  @Expose() @ApiProperty() canEnroll!: boolean;
  @Expose() @ApiProperty() canWithdraw!: boolean;

  @Expose()
  @ApiProperty({ description: 'The course is full, and the caller may queue for a place.' })
  canJoinWaitlist!: boolean;
  @Expose() @ApiProperty({ enum: ENROLLMENT_REASONS }) reason!: EnrollmentReason;
}

@Exclude()
export class MyEnrollmentSummaryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: ENROLLMENT_STATUSES }) status!: EnrollmentStatus;
}

@Exclude()
export class EnrollableCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) credits!: number | null;
}

@Exclude()
export class EnrollableTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
}

@Exclude()
export class EnrollableOfferingResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ type: Number, nullable: true }) capacity!: number | null;
  @Expose() @ApiProperty() occupiedSeats!: number;

  @Expose()
  @ApiProperty({ type: Number, nullable: true })
  seatsRemaining!: number | null;

  @Expose() @ApiProperty() isFull!: boolean;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrollmentOpensAt!: Date | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  enrollmentClosesAt!: Date | null;

  @Expose()
  @ApiProperty({ enum: ENROLLMENT_WINDOW_STATES })
  windowState!: EnrollmentWindowState;

  @Expose()
  @Type(() => EnrollmentAvailabilityDto)
  @ApiProperty()
  availability!: EnrollmentAvailabilityDto;

  @Expose()
  @Type(() => MyEnrollmentSummaryDto)
  @ApiProperty({ type: MyEnrollmentSummaryDto, nullable: true })
  myEnrollment!: MyEnrollmentSummaryDto | null;

  @Expose() @Type(() => EnrollableCourseDto) @ApiProperty() course!: EnrollableCourseDto;
  @Expose() @Type(() => EnrollableTermDto) @ApiProperty() term!: EnrollableTermDto;

  static from(offering: EnrollableOffering): EnrollableOfferingResponseDto {
    return Object.assign(new EnrollableOfferingResponseDto(), offering);
  }
}
