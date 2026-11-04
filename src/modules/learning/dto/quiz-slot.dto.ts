import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  QUESTION_TYPES,
  QUIZ_SLOT_KINDS,
  type QuestionType,
  type QuizSlot,
  type QuizSlotKind,
} from '../../../database/schema';
import { MAX_RANDOM_PICK } from '../quiz-policy';
import type { SlotQuestion, SlotRow } from '../quiz-slots.repository';
import type { SlotPage } from '../quiz-slots.service';

import { MAX_MARK } from './question.dto';

const MAX_PICKED = 50;

export class AddQuizSlotsDto {
  @ApiProperty({
    enum: QUIZ_SLOT_KINDS,
    enumName: 'QuizSlotKind',
    description: 'question: these questions, by hand; random: some drawn from a category.',
  })
  @IsIn(QUIZ_SLOT_KINDS)
  kind!: QuizSlotKind;

  @ApiPropertyOptional({ type: String, isArray: true, format: 'uuid', nullable: true })
  @ValidateIf((dto: AddQuizSlotsDto) => dto.kind === 'question')
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PICKED)
  @IsUUID('all', { each: true })
  questionIds?: string[] | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  @ValidateIf((dto: AddQuizSlotsDto) => dto.kind === 'random')
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, maximum: MAX_RANDOM_PICK })
  @ValidateIf((dto: AddQuizSlotsDto) => dto.kind === 'random')
  @IsInt()
  @Min(1)
  @Max(MAX_RANDOM_PICK)
  pickCount?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    maximum: MAX_MARK,
    description:
      'The mark of each question. By hand it defaults to the question’s default mark; drawn at random, to 1.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @IsPositive()
  @Max(MAX_MARK)
  mark?: number | null;
}

export class UpdateQuizSlotDto {
  @ApiPropertyOptional({ minimum: 0, description: 'Move it to this place, counted from 0.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ maximum: MAX_MARK })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(MAX_MARK)
  mark?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_RANDOM_PICK })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_RANDOM_PICK)
  pickCount?: number;
}

export class ListQuizSlotsQueryDto {
  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to questions, or categories drawn from, containing this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

@Exclude()
export class SlotQuestionDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() text!: string;
  @Expose()
  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  type!: QuestionType;

  @Expose()
  @ApiProperty({ description: 'The latest version, which an attempt started now would ask.' })
  version!: number;
}

@Exclude()
export class QuizSlotResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty() position!: number;
  @Expose()
  @ApiProperty({ enum: QUIZ_SLOT_KINDS, enumName: 'QuizSlotKind' })
  kind!: QuizSlotKind;
  @Expose() @ApiProperty() mark!: number;

  @Expose()
  @ApiProperty({ type: SlotQuestionDto, nullable: true })
  question!: SlotQuestionDto | null;

  @Expose()
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  categoryId!: string | null;

  @Expose() @ApiProperty({ type: String, nullable: true }) categoryName!: string | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) pickCount!: number | null;

  static from(
    slot: QuizSlot,
    question: SlotQuestion | null = null,
    categoryName: string | null = null,
  ) {
    return Object.assign(new QuizSlotResponseDto(), {
      id: slot.id,
      position: slot.position,
      kind: slot.kind,
      mark: Number(slot.mark),
      question: question === null ? null : Object.assign(new SlotQuestionDto(), question),
      categoryId: slot.categoryId,
      categoryName,
      pickCount: slot.pickCount,
    });
  }

  static fromRow(row: SlotRow): QuizSlotResponseDto {
    return QuizSlotResponseDto.from(row.slot, row.question, row.categoryName);
  }
}

@Exclude()
export class QuizSlotPageResponseDto {
  @Expose()
  @ApiProperty({ type: QuizSlotResponseDto, isArray: true })
  items!: QuizSlotResponseDto[];
  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  @Expose()
  @ApiProperty({ description: 'How many questions an attempt asks, across every page.' })
  questionCount!: number;

  @Expose()
  @ApiProperty({ description: 'The sum of the question marks, scaled to the quiz’s points.' })
  totalMarks!: number;

  static from(page: SlotPage): QuizSlotPageResponseDto {
    return Object.assign(new QuizSlotPageResponseDto(), {
      items: page.rows.map((row) => QuizSlotResponseDto.fromRow(row)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
      questionCount: page.questionCount,
      totalMarks: page.totalMarks,
    });
  }
}
