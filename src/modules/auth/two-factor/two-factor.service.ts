import { Injectable } from '@nestjs/common';
import { toString as qrCodeSvg } from 'qrcode';

import { ConflictError, InvalidInputError } from '../../../common/errors/domain.error';
import { AppConfigService } from '../../../config/app-config.service';
import { TransactionHost } from '../../../database/transaction.host';
import { PasswordConfirmation } from '../password-confirmation.service';

import { RecoveryCodesDto } from './dto/recovery-codes.dto';
import { TwoFactorSetupDto } from './dto/two-factor-setup.dto';
import { TwoFactorStatusDto } from './dto/two-factor-status.dto';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes';
import { RecoveryCodesRepository } from './recovery-codes.repository';
import { SecretCipherService } from './secret-cipher.service';
import { generateTotpSecret, matchingStep, otpauthUri } from './totp';
import { TwoFactorCredentialsRepository } from './two-factor-credentials.repository';

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly credentials: TwoFactorCredentialsRepository,
    private readonly recoveryCodes: RecoveryCodesRepository,
    private readonly cipher: SecretCipherService,
    private readonly confirmation: PasswordConfirmation,
    private readonly config: AppConfigService,
    private readonly txHost: TransactionHost,
  ) {}

  async status(userId: string): Promise<TwoFactorStatusDto> {
    const credential = await this.credentials.findEnabledFor(userId);
    if (!credential) return TwoFactorStatusDto.of(null, 0);

    return TwoFactorStatusDto.of(
      credential.enabledAt,
      await this.recoveryCodes.countUnused(userId),
    );
  }

  /** Replaces any unfinished pairing, so abandoning one and starting again just works. */
  async beginSetup(userId: string, currentPassword: string): Promise<TwoFactorSetupDto> {
    const user = await this.confirmation.confirm(userId, currentPassword);
    if (await this.credentials.isEnabledFor(userId)) throw alreadyEnabled();

    const secret = generateTotpSecret();
    await this.txHost.run(async (tx) => {
      await this.credentials.removeFor(userId, tx);
      await this.credentials.create(
        { userId, secretCiphertext: this.cipher.encrypt(secret) },
        tx,
      );
    });

    const uri = otpauthUri(secret, user.email, this.config.twoFactor.issuer);
    const svg = await qrCodeSvg(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

    return TwoFactorSetupDto.of(
      secret,
      uri,
      `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    );
  }

  async enable(userId: string, code: string): Promise<RecoveryCodesDto> {
    const pending = await this.credentials.findFor(userId);
    if (!pending) {
      throw new ConflictError(
        'TWO_FACTOR_SETUP_NOT_STARTED',
        'Start setting up two-factor authentication first',
      );
    }
    if (pending.enabledAt) throw alreadyEnabled();

    const step = matchingStep(
      this.cipher.decrypt(pending.secretCiphertext),
      code.replace(/\s/g, ''),
      new Date(),
    );
    if (step === undefined) {
      throw new InvalidInputError('TWO_FACTOR_CODE_INVALID', 'That code is not valid', {
        field: 'code',
      });
    }

    const codes = generateRecoveryCodes();
    await this.txHost.run(async (tx) => {
      await this.credentials.update(
        pending.id,
        { enabledAt: new Date(), lastUsedStep: step },
        tx,
      );
      await this.recoveryCodes.replaceFor(userId, codes.map(hashRecoveryCode), tx);
    });

    return RecoveryCodesDto.of(codes);
  }

  async disable(userId: string, currentPassword: string): Promise<void> {
    await this.confirmation.confirm(userId, currentPassword);

    await this.txHost.run(async (tx) => {
      await this.credentials.removeFor(userId, tx);
      await this.recoveryCodes.removeFor(userId, tx);
    });
  }

  async regenerateRecoveryCodes(
    userId: string,
    currentPassword: string,
  ): Promise<RecoveryCodesDto> {
    await this.confirmation.confirm(userId, currentPassword);
    if (!(await this.credentials.isEnabledFor(userId))) {
      throw new ConflictError('TWO_FACTOR_NOT_ENABLED', 'Two-factor authentication is off');
    }

    const codes = generateRecoveryCodes();
    await this.recoveryCodes.replaceFor(userId, codes.map(hashRecoveryCode));

    return RecoveryCodesDto.of(codes);
  }
}

function alreadyEnabled(): ConflictError {
  return new ConflictError(
    'TWO_FACTOR_ALREADY_ENABLED',
    'Two-factor authentication is already on',
  );
}
