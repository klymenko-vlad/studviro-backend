import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

import type { WaitingStudent } from '../offering-waitlist.service';

@Exclude()
export class WaitingStudentResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) enrollmentId!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) userId!: string;
  @Expose() @ApiProperty() displayName!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) email!: string | null;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  waitlistedAt!: Date | null;

  static from(entry: WaitingStudent): WaitingStudentResponseDto {
    return Object.assign(new WaitingStudentResponseDto(), entry);
  }
}
