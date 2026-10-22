import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import {
  STUDY_GROUP_KINDS,
  TIMETABLE_EVENT_TYPES,
  type StudyGroupKind,
  type TimetableEventType,
} from '../../../database/schema';
import {
  TIMETABLE_ATTENDANCES,
  type MyTimetableEvent,
  type TimetableAttendance,
} from '../my-timetable-events.service';

@Exclude()
export class TimetableRoomDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) building!: string | null;
}

@Exclude()
export class TimetableStudyGroupDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty({ type: String, nullable: true }) name!: string | null;
  @Expose() @ApiProperty({ enum: STUDY_GROUP_KINDS }) kind!: StudyGroupKind;
}

@Exclude()
export class TimetableOfferingDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
}

@Exclude()
export class TimetableCourseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() title!: string;
}

@Exclude()
export class TimetableTermDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() code!: string;
  @Expose() @ApiProperty() name!: string;
}

@Exclude()
export class MyTimetableEventResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ enum: TIMETABLE_EVENT_TYPES }) type!: TimetableEventType;
  @Expose() @ApiProperty({ type: String, nullable: true }) title!: string | null;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) startsAt!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) endsAt!: Date;

  @Expose()
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @Expose() @ApiProperty() isCancelled!: boolean;

  @Expose()
  @ApiProperty({ enum: TIMETABLE_ATTENDANCES })
  attendance!: TimetableAttendance;

  @Expose()
  @Type(() => TimetableRoomDto)
  @ApiProperty({ type: TimetableRoomDto, nullable: true })
  room!: TimetableRoomDto | null;

  @Expose()
  @Type(() => TimetableStudyGroupDto)
  @ApiProperty({ type: TimetableStudyGroupDto, nullable: true })
  studyGroup!: TimetableStudyGroupDto | null;

  @Expose()
  @Type(() => TimetableOfferingDto)
  @ApiProperty()
  offering!: TimetableOfferingDto;

  @Expose() @Type(() => TimetableCourseDto) @ApiProperty() course!: TimetableCourseDto;
  @Expose() @Type(() => TimetableTermDto) @ApiProperty() term!: TimetableTermDto;

  static fromMyTimetableEvent(event: MyTimetableEvent): MyTimetableEventResponseDto {
    return Object.assign(new MyTimetableEventResponseDto(), event);
  }
}
