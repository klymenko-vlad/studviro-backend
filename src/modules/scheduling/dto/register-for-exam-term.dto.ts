import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RegisterForExamTermDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  examTermId!: string;
}
