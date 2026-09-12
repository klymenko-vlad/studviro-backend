import { ApiProperty } from '@nestjs/swagger';

export class DemoRequestAcceptedDto {
  @ApiProperty({ enum: ['accepted'], example: 'accepted' })
  status!: 'accepted';
}
