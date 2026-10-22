import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../common/crypto/password.service';
import { InvalidInputError, PermissionDeniedError } from '../../common/errors/domain.error';
import { AppConfigService } from '../../config/app-config.service';
import type { Transaction } from '../../database/database.tokens';
import { isUniqueViolation } from '../../database/repository/database-error';
import type { Invitation } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { TokenService } from '../auth/token.service';
import type { ScopeRef } from '../authorization/authorization.constants';
import { AuthorizationService } from '../authorization/authorization.service';
import { isGrantable } from '../authorization/permissions';
import { RoleAssignmentsRepository } from '../authorization/role-assignments.repository';
import { ScopeHierarchyService } from '../authorization/scope-hierarchy.service';
import { UsersRepository } from '../users/users.repository';

import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationResponseDto } from './dto/invitation-response.dto';
import { InvitationMailer } from './invitation-mailer';
import { InvitationsRepository } from './invitations.repository';
import { MergeService } from './merge.service';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Deliberately one message and one code for every way a token can fail to
 * redeem: unknown, expired and already-consumed all read the same, because
 * distinguishing them tells whoever is guessing which guess was closer.
 */
function invalidToken(): InvalidInputError {
  return new InvalidInputError(
    'INVITATION_TOKEN_INVALID',
    'This invitation link is no longer valid',
  );
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    private readonly roleAssignments: RoleAssignmentsRepository,
    private readonly hierarchy: ScopeHierarchyService,
    private readonly authorization: AuthorizationService,
    private readonly merge: MergeService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly txHost: TransactionHost,
    private readonly config: AppConfigService,
    private readonly mailer: InvitationMailer,
  ) {}

  async create(
    institutionId: string,
    dto: CreateInvitationDto,
    inviterId: string,
  ): Promise<InvitationResponseDto> {
    const scope = this.scopeOf(institutionId, dto);
    const resolved = await this.hierarchy.resolve(scope);
    if (resolved?.institutionId !== institutionId) {
      throw new InvalidInputError(
        'SCOPE_OUTSIDE_INSTITUTION',
        'That scope belongs to another institution',
        {
          scopeId: scope.id,
        },
      );
    }

    const [mayAssign, inviterPermissions] = await Promise.all([
      this.authorization.can({ userId: inviterId, permission: 'role:assign', scope }),
      this.authorization.permissionsIn(inviterId, scope),
    ]);

    if (!mayAssign) {
      throw new PermissionDeniedError(
        'ROLE_ASSIGN_SCOPE_DENIED',
        'You do not hold role:assign at this scope',
      );
    }
    if (!isGrantable(new Set(inviterPermissions), dto.role)) {
      throw new PermissionDeniedError(
        'ROLE_NOT_HELD_BY_GRANTER',
        'You cannot invite someone to a role you do not hold yourself',
      );
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = this.tokens.hash(token);

    const created = await this.invitations.create({
      institutionId,
      address: dto.address.trim().toLowerCase(),
      role: dto.role,
      scopeType: dto.scopeType,
      scopeId: dto.scopeId ?? null,
      invitedById: inviterId,
      tokenHash,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
    await this.mailer.send(created, token);

    return InvitationResponseDto.fromEntity(
      created,
      this.config.isProduction ? undefined : token,
    );
  }

  /**
   * Issues an invitation for `institution_admin` at institution scope inside
   * an already-open transaction, for `POST /institutions`'s email-based first
   * admin path (ADR 0017's consequence, settled in ADR 0018). Returns the raw
   * token the same way {@link create} does, subject to the same
   * production-hides-it rule.
   */
  async createForNewInstitution(
    institutionId: string,
    address: string,
    tx: Transaction,
  ): Promise<{ invitation: Invitation; token: string }> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.tokens.hash(token);

    const created = await this.invitations.create(
      {
        institutionId,
        address: address.trim().toLowerCase(),
        role: 'institution_admin',
        scopeType: 'institution',
        scopeId: null,
        invitedById: null,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      tx,
    );

    return { invitation: created, token };
  }

  /** Whether a caller may be shown a raw token directly, absent mail transport. */
  isDevToken(): boolean {
    return !this.config.isProduction;
  }

  async accept(rawToken: string, dto: AcceptInvitationDto): Promise<void> {
    const tokenHash = this.tokens.hash(rawToken);

    await this.txHost.run(async (tx) => {
      const invitation = await this.invitations.findByTokenHash(tokenHash, {}, tx);

      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.expiresAt.getTime() <= Date.now()
      ) {
        throw invalidToken();
      }

      const active = await this.users.findSignInCandidate(
        invitation.address,
        { consistent: true },
        tx,
      );
      const shadow = await this.users.findInvitedByEmail(invitation.address, tx);

      let survivorId: string;

      if (active) {
        survivorId = active.id;
        if (shadow && shadow.id !== active.id) {
          await this.merge.merge(shadow.id, active.id, tx);
        }
      } else if (shadow) {
        if (!dto.password) {
          throw new InvalidInputError(
            'PASSWORD_REQUIRED',
            'Set a password to claim this account',
          );
        }

        await this.users.update(
          shadow.id,
          {
            status: 'active',
            passwordHash: await this.passwords.hash(dto.password),
            ...(dto.displayName ? { displayName: dto.displayName } : {}),
            ...(dto.locale ? { locale: dto.locale } : {}),
          },
          tx,
        );
        survivorId = shadow.id;
      } else {
        if (!dto.password || !dto.displayName) {
          throw new InvalidInputError(
            'PROFILE_REQUIRED',
            'A display name and password are required to create this account',
          );
        }

        const createdUser = await this.users.create(
          {
            email: invitation.address,
            displayName: dto.displayName,
            passwordHash: await this.passwords.hash(dto.password),
            status: 'active',
            locale: dto.locale ?? 'en',
          },
          tx,
        );
        survivorId = createdUser.id;
      }

      await this.grantIfMissing(invitation, survivorId, tx);

      await this.invitations.update(
        invitation.id,
        { acceptedAt: new Date(), acceptedUserId: survivorId },
        tx,
      );
    });
  }

  private async grantIfMissing(
    invitation: {
      institutionId: string;
      role: CanonicalRoleLike;
      scopeType: ScopeTypeLike;
      scopeId: string | null;
    },
    userId: string,
    tx: Transaction,
  ): Promise<void> {
    try {
      await this.roleAssignments.create(
        {
          institutionId: invitation.institutionId,
          userId,
          role: invitation.role,
          scopeType: invitation.scopeType,
          scopeId: invitation.scopeId,
        },
        tx,
      );
    } catch (error) {
      // Already granted (a re-accept, or the survivor already held it): the
      // invitation is still consumed, this is not a failure to report.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  private scopeOf(institutionId: string, dto: CreateInvitationDto): ScopeRef {
    if (dto.scopeType === 'institution') {
      if (dto.scopeId) {
        throw new InvalidInputError(
          'SCOPE_ID_NOT_ALLOWED',
          'An institution-wide role cannot name a narrower scope',
        );
      }

      return { type: 'institution', id: institutionId };
    }

    if (!dto.scopeId) {
      throw new InvalidInputError(
        'SCOPE_ID_REQUIRED',
        `A ${dto.scopeType} role must name the scope it applies to`,
      );
    }

    return { type: dto.scopeType, id: dto.scopeId };
  }
}

type CanonicalRoleLike = Parameters<RoleAssignmentsRepository['create']>[0]['role'];
type ScopeTypeLike = Parameters<RoleAssignmentsRepository['create']>[0]['scopeType'];
