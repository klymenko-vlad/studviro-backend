import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../../config/app-config.service';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const VERSION = 'v1';
const SCRYPT_SALT = 'studviro.connector-credential-cipher';

@Injectable()
export class ConnectorCredentialCipherService {
  private readonly key: Buffer;

  constructor(config: AppConfigService) {
    this.key = scryptSync(config.connectorCredentialSecret, SCRYPT_SALT, KEY_LENGTH);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const cipherText = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      cipherText.toString('base64'),
    ].join('.');
  }

  decrypt(token: string): string {
    const [version, ivPart, tagPart, cipherTextPart, ...rest] = token.split('.');
    if (version !== VERSION || !ivPart || !tagPart || !cipherTextPart || rest.length > 0) {
      throw new Error('Malformed connector credential token');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(cipherTextPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
