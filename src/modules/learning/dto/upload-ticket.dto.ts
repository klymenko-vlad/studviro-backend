import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import type { UploadTicket } from '../../storage/storage.types';

const MAX_FILENAME = 255;
const MAX_CONTENT_TYPE = 255;

export class RequestUploadTicketDto {
  @ApiProperty({ maxLength: MAX_FILENAME, example: 'lecture-01.pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_FILENAME)
  filename!: string;

  @ApiProperty({ maxLength: MAX_CONTENT_TYPE, example: 'application/pdf' })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_CONTENT_TYPE)
  contentType!: string;
}

@Exclude()
export class UploadTicketResponseDto {
  @Expose() @ApiProperty({ description: 'PUT the bytes here, unchanged.' }) url!: string;

  @Expose()
  @ApiProperty({ type: Object, additionalProperties: { type: 'string' } })
  headers!: Record<string, string>;

  @Expose() @ApiProperty() key!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @Expose() @ApiProperty() maxBytes!: number;

  static from(ticket: UploadTicket): UploadTicketResponseDto {
    return Object.assign(new UploadTicketResponseDto(), {
      url: ticket.url,
      headers: ticket.headers,
      key: ticket.key,
      expiresAt: ticket.expiresAt,
      maxBytes: ticket.maxBytes,
    });
  }
}

@Exclude()
export class DownloadUrlResponseDto {
  @Expose() @ApiProperty({ description: 'Short-lived, and forces a download.' }) url!: string;

  static from(url: string): DownloadUrlResponseDto {
    return Object.assign(new DownloadUrlResponseDto(), { url });
  }
}
