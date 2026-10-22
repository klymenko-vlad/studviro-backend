import type { AuthorizationService } from '../authorization/authorization.service';

const ADMINISTERING_PERMISSIONS = ['offering:manage', 'enrollment:manage'] as const;

export async function administersOfferings(
  authorization: AuthorizationService,
  userId: string,
  institutionId: string,
): Promise<boolean> {
  const answers = await Promise.all(
    ADMINISTERING_PERMISSIONS.map((permission) =>
      authorization.can({
        userId,
        permission,
        scope: { type: 'institution', id: institutionId },
      }),
    ),
  );

  return answers.some(Boolean);
}
