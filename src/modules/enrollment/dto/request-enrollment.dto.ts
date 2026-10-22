import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RequestEnrollmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  courseOfferingId!: string;
}
