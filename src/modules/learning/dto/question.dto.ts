import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PageMetaDto } from '../../../common/dto/pagination.dto';
import {
  QUESTION_TYPES,
  type ChoiceAnswerKey,
  type MatchingAnswerKey,
  type NumericalAnswerKey,
  type ShortAnswerKey,
  type TrueFalseAnswerKey,
  type QuestionType,
  type QuestionVersion,
} from '../../../database/schema';
import { MAX_ACCEPTED_ANSWERS, MAX_CHOICES, MAX_PAIRS } from '../question-answer-key';
import type { QuestionVersionPage, QuestionPage } from '../question-bank.service';
import type { QuestionEntry } from '../questions.repository';

const MAX_NAME = 200;
const MAX_TEXT = 10_000;
const MAX_FEEDBACK = 5_000;
const MAX_PART = 1_000;
export const MAX_MARK = 1_000;

type AnyAnswerKey = Partial<
  ChoiceAnswerKey & TrueFalseAnswerKey & ShortAnswerKey & NumericalAnswerKey & MatchingAnswerKey
>;

export class ChoiceDto {
  @ApiProperty({ maxLength: MAX_PART })
  @IsString()
  @MaxLength(MAX_PART)
  text!: string;

  @ApiProperty()
  @IsBoolean()
  correct!: boolean;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PART })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_PART)
  feedback?: string | null;
}

export class MatchingPairDto {
  @ApiProperty({ maxLength: MAX_PART })
  @IsString()
  @MaxLength(MAX_PART)
  prompt!: string;

  @ApiProperty({ maxLength: MAX_PART })
  @IsString()
  @MaxLength(MAX_PART)
  answer!: string;
}

export class CreateQuestionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  categoryId!: string;

  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  @IsIn(QUESTION_TYPES)
  type!: QuestionType;

  @ApiProperty({ maxLength: MAX_NAME, description: 'A short name to find it by in the bank.' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_NAME)
  name!: string;

  @ApiProperty({ maxLength: MAX_TEXT, description: 'The question as the student reads it.' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_TEXT)
  text!: string;

  @ApiProperty({ minimum: 0, exclusiveMinimum: true, maximum: MAX_MARK })
  @IsNumber()
  @IsPositive()
  @Max(MAX_MARK)
  defaultMark!: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_FEEDBACK })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_FEEDBACK)
  generalFeedback?: string | null;

  @ApiPropertyOptional({
    type: ChoiceDto,
    isArray: true,
    nullable: true,
    description: 'Single and multiple choice.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(MAX_CHOICES + 1)
  @ValidateNested({ each: true })
  @Type(() => ChoiceDto)
  choices?: ChoiceDto[] | null;

  @ApiPropertyOptional({
    type: Boolean,
    nullable: true,
    description: 'True or false: whether the statement is true.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  correct?: boolean | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PART })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_PART)
  trueFeedback?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: MAX_PART })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(MAX_PART)
  falseFeedback?: string | null;

  @ApiPropertyOptional({
    type: String,
    isArray: true,
    nullable: true,
    description: 'Short answer: every answer that earns the mark.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(MAX_ACCEPTED_ANSWERS + 1)
  @IsString({ each: true })
  @MaxLength(MAX_PART, { each: true })
  acceptedAnswers?: string[] | null;

  @ApiPropertyOptional({ type: Boolean, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  caseSensitive?: boolean | null;

  @ApiPropertyOptional({ type: Number, nullable: true, description: 'Numerical: the answer.' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  value?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 0,
    description: 'Numerical: how far from the answer still earns the mark.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  tolerance?: number | null;

  @ApiPropertyOptional({ type: MatchingPairDto, isArray: true, nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsArray()
  @ArrayMaxSize(MAX_PAIRS + 1)
  @ValidateNested({ each: true })
  @Type(() => MatchingPairDto)
  pairs?: MatchingPairDto[] | null;
}

export class ReviseQuestionDto extends OmitType(CreateQuestionDto, ['type'] as const) {}

export class ListQuestionsQueryDto {
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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  @IsOptional()
  @IsIn(QUESTION_TYPES)
  type?: QuestionType;

  @ApiPropertyOptional({
    type: String,
    description: 'Narrows to questions whose name or text contains this',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class ListQuestionVersionsQueryDto extends OmitType(ListQuestionsQueryDto, [
  'categoryId',
  'type',
  'q',
] as const) {}

@Exclude()
export class ChoiceResponseDto {
  @Expose() @ApiProperty() text!: string;
  @Expose() @ApiProperty() correct!: boolean;
  @Expose() @ApiProperty({ type: String, nullable: true }) feedback!: string | null;
}

@Exclude()
export class MatchingPairResponseDto {
  @Expose() @ApiProperty() prompt!: string;
  @Expose() @ApiProperty() answer!: string;
}

@Exclude()
export class QuestionVersionResponseDto {
  @Expose() @ApiProperty() version!: number;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() text!: string;
  @Expose() @ApiProperty() defaultMark!: number;
  @Expose() @ApiProperty({ type: String, nullable: true }) generalFeedback!: string | null;

  @Expose()
  @ApiProperty({ type: ChoiceResponseDto, isArray: true, nullable: true })
  choices!: ChoiceResponseDto[] | null;

  @Expose() @ApiProperty({ type: Boolean, nullable: true }) correct!: boolean | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) trueFeedback!: string | null;
  @Expose() @ApiProperty({ type: String, nullable: true }) falseFeedback!: string | null;

  @Expose()
  @ApiProperty({ type: String, isArray: true, nullable: true })
  acceptedAnswers!: string[] | null;

  @Expose() @ApiProperty({ type: Boolean, nullable: true }) caseSensitive!: boolean | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) value!: number | null;
  @Expose() @ApiProperty({ type: Number, nullable: true }) tolerance!: number | null;

  @Expose()
  @ApiProperty({ type: MatchingPairResponseDto, isArray: true, nullable: true })
  pairs!: MatchingPairResponseDto[] | null;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;

  static from(version: QuestionVersion): QuestionVersionResponseDto {
    return Object.assign(new QuestionVersionResponseDto(), versionFields(version));
  }
}

@Exclude()
export class QuestionResponseDto extends QuestionVersionResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @Expose() @ApiProperty() categoryName!: string;
  @Expose()
  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  type!: QuestionType;

  static fromEntry(entry: QuestionEntry): QuestionResponseDto {
    return Object.assign(new QuestionResponseDto(), {
      ...versionFields(entry.version),
      id: entry.question.id,
      categoryId: entry.question.categoryId,
      categoryName: entry.categoryName,
      type: entry.question.type,
    });
  }
}

@Exclude()
export class QuestionSummaryDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose() @ApiProperty({ format: 'uuid' }) categoryId!: string;
  @Expose() @ApiProperty() categoryName!: string;
  @Expose()
  @ApiProperty({ enum: QUESTION_TYPES, enumName: 'QuestionType' })
  type!: QuestionType;
  @Expose() @ApiProperty() version!: number;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() text!: string;
  @Expose() @ApiProperty() defaultMark!: number;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;

  static from(entry: QuestionEntry): QuestionSummaryDto {
    return Object.assign(new QuestionSummaryDto(), {
      id: entry.question.id,
      categoryId: entry.question.categoryId,
      categoryName: entry.categoryName,
      type: entry.question.type,
      version: entry.version.version,
      name: entry.version.name,
      text: entry.version.text,
      defaultMark: Number(entry.version.defaultMark),
      updatedAt: entry.version.createdAt,
    });
  }
}

@Exclude()
export class QuestionPageResponseDto {
  @Expose()
  @ApiProperty({ type: QuestionSummaryDto, isArray: true })
  items!: QuestionSummaryDto[];
  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: QuestionPage): QuestionPageResponseDto {
    return Object.assign(new QuestionPageResponseDto(), {
      items: page.entries.map((entry) => QuestionSummaryDto.from(entry)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}

@Exclude()
export class QuestionVersionPageResponseDto {
  @Expose()
  @ApiProperty({ type: QuestionVersionResponseDto, isArray: true })
  items!: QuestionVersionResponseDto[];

  @Expose() @ApiProperty({ type: PageMetaDto }) meta!: PageMetaDto;

  static from(page: QuestionVersionPage): QuestionVersionPageResponseDto {
    return Object.assign(new QuestionVersionPageResponseDto(), {
      items: page.versions.map((version) => QuestionVersionResponseDto.from(version)),
      meta: new PageMetaDto(page.page, page.limit, page.total),
    });
  }
}

function versionFields(version: QuestionVersion) {
  const key: AnyAnswerKey = version.answerKey;

  return {
    version: version.version,
    name: version.name,
    text: version.text,
    defaultMark: Number(version.defaultMark),
    generalFeedback: version.generalFeedback,
    choices: key.choices ?? null,
    correct: key.correct ?? null,
    trueFeedback: key.trueFeedback ?? null,
    falseFeedback: key.falseFeedback ?? null,
    acceptedAnswers: key.acceptedAnswers ?? null,
    caseSensitive: key.caseSensitive ?? null,
    value: key.value ?? null,
    tolerance: key.tolerance ?? null,
    pairs: key.pairs ?? null,
    createdAt: version.createdAt,
  };
}
