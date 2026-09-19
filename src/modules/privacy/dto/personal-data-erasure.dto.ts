import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';

import type { ErasureTally } from '../erasure-rules';

@Exclude()
export class ErasureTallyDto implements ErasureTally {
  @Expose() @ApiProperty() refreshTokens!: number;
  @Expose() @ApiProperty() passwordResetTokens!: number;
  @Expose() @ApiProperty() userEmails!: number;
  @Expose() @ApiProperty() externalIdentities!: number;
  @Expose() @ApiProperty() invitations!: number;
  @Expose() @ApiProperty() submissionFiles!: number;
  @Expose() @ApiProperty() storedObjects!: number;
  @Expose() @ApiProperty() conflictNotes!: number;
  @Expose() @ApiProperty() assessmentFeedback!: number;
  @Expose() @ApiProperty() submissionNotes!: number;
}

export interface PersonalDataErasure {
  erasureId: string;
  erasedAt: Date;
  tally: ErasureTally;
}

/**
 * Names the erasure rather than the person: the id here is the erasure's own,
 * and it is what the audit event is filed under (ADR 0030).
 */
@Exclude()
export class PersonalDataErasureResponseDto {
  @Expose() @ApiProperty({ format: 'uuid' }) erasureId!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) erasedAt!: Date;

  @Expose()
  @Type(() => ErasureTallyDto)
  @ApiProperty({ type: ErasureTallyDto })
  tally!: ErasureTally;

  static from(erasure: PersonalDataErasure): PersonalDataErasureResponseDto {
    return Object.assign(new PersonalDataErasureResponseDto(), erasure);
  }
}
