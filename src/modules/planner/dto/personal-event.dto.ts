import { ApiProperty } from '@nestjs/swagger';

import type { PersonalEvent } from '../../../database/schema';

export class PersonalEventDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty() readonly title: string;
  @ApiProperty({ type: String, nullable: true }) readonly note: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly location: string | null;
  @ApiProperty({ type: String, format: 'date-time' }) readonly startsAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly endsAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly createdAt: Date;
  @ApiProperty({ type: String, format: 'date-time' }) readonly updatedAt: Date;

  constructor(event: PersonalEvent) {
    this.id = event.id;
    this.title = event.title;
    this.note = event.note;
    this.location = event.location;
    this.startsAt = event.startsAt;
    this.endsAt = event.endsAt;
    this.createdAt = event.createdAt;
    this.updatedAt = event.updatedAt;
  }
}
