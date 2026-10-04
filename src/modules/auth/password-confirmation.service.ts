import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../common/crypto/password.service';
import { InvalidInputError } from '../../common/errors/domain.error';
import type { User } from '../../database/schema';
import { UsersRepository } from '../users/users.repository';

@Injectable()
export class PasswordConfirmation {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
  ) {}

  async confirm(userId: string, currentPassword: string): Promise<User> {
    const user = await this.users.findByIdOrFail(userId, { consistent: true });
    const matches =
      user.passwordHash !== null &&
      (await this.passwords.verify(user.passwordHash, currentPassword));

    if (!matches) {
      throw new InvalidInputError(
        'CURRENT_PASSWORD_INCORRECT',
        'The current password is incorrect',
        {
          field: 'currentPassword',
        },
      );
    }

    return user;
  }
}
