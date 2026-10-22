import { Injectable } from '@nestjs/common';

import type { Transaction } from '../../../database/database.tokens';

import { hashRecoveryCode, looksLikeRecoveryCode } from './recovery-codes';
import { RecoveryCodesRepository } from './recovery-codes.repository';
import { SecretCipherService } from './secret-cipher.service';
import { matchingStep } from './totp';
import { TwoFactorCredentialsRepository } from './two-factor-credentials.repository';

@Injectable()
export class TwoFactorVerifier {
  constructor(
    private readonly credentials: TwoFactorCredentialsRepository,
    private readonly recoveryCodes: RecoveryCodesRepository,
    private readonly cipher: SecretCipherService,
  ) {}

  async verify(userId: string, code: string, tx?: Transaction): Promise<boolean> {
    const credential = await this.credentials.findEnabledFor(userId, tx);
    if (!credential) return false;

    if (looksLikeRecoveryCode(code)) {
      return this.recoveryCodes.consume(userId, hashRecoveryCode(code), tx);
    }

    const step = matchingStep(
      this.cipher.decrypt(credential.secretCiphertext),
      code.replace(/\s/g, ''),
      new Date(),
    );

    return step !== undefined && this.credentials.claimStep(credential.id, step, tx);
  }
}
