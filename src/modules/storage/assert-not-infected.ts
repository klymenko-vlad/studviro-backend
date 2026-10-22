import { ConflictError } from '../../common/errors/domain.error';
import type { FileScanStatus } from '../../database/schema';

export function assertNotInfected(scanStatus: FileScanStatus): void {
  if (scanStatus === 'infected') {
    throw new ConflictError('FILE_INFECTED', 'That file contained malware and was deleted');
  }
}
