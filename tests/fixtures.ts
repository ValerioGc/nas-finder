import type { NasDevice } from '@/types';

export function nas(overrides: Partial<NasDevice> = {}): NasDevice {
  return {
    id: 'a'.repeat(64),
    name: 'nas-studio',
    address: '192.168.1.15',
    port: 80,
    secure: false,
    configured: false,
    online: true,
    saved: false,
    ...overrides,
  };
}
