import { Injectable } from '@nestjs/common';

import { ExternalIdentityResponseDto } from './dto/external-identity-response.dto';
import { ExternalIdentitiesRepository } from './external-identities.repository';

@Injectable()
export class ExternalIdentitiesService {
  constructor(private readonly identities: ExternalIdentitiesRepository) {}

  async listForUser(userId: string): Promise<ExternalIdentityResponseDto[]> {
    const found = await this.identities.findAllForUser(userId);

    return found.map((identity) => ExternalIdentityResponseDto.fromEntity(identity));
  }
}
