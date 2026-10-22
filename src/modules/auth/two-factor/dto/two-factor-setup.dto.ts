import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class TwoFactorSetupDto {
  @Expose()
  @ApiProperty({ description: 'Base32, for typing into an app that cannot scan.' })
  secret!: string;

  @Expose() @ApiProperty() otpauthUri!: string;

  @Expose()
  @ApiProperty({ description: 'The otpauth URI as an SVG QR code, in a data URL.' })
  qrCodeDataUrl!: string;

  static of(secret: string, otpauthUri: string, qrCodeDataUrl: string): TwoFactorSetupDto {
    const dto = new TwoFactorSetupDto();

    dto.secret = secret;
    dto.otpauthUri = otpauthUri;
    dto.qrCodeDataUrl = qrCodeDataUrl;

    return dto;
  }
}
