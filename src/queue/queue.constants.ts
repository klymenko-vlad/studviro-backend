export const QUEUES = {
  EMAIL: 'email',
  MEDIA: 'media',
  MAINTENANCE: 'maintenance',
  SYNCHRONIZATION: 'synchronization',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const ALL_QUEUES: QueueName[] = Object.values(QUEUES);
