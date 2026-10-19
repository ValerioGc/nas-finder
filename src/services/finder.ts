import { invoke } from '@tauri-apps/api/core';
import type { FinderError, NasDevice } from '@/types';

export function errorCode(error: unknown): FinderError {
  const codes: FinderError[] = [
    'invalid_address',
    'network_unavailable',
    'busy',
    'storage_unavailable',
    'invalid_device',
    'browser_unavailable',
    'endpoint_changed',
  ];
  return typeof error === 'string' && codes.includes(error as FinderError)
    ? (error as FinderError)
    : 'network_unavailable';
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args);
}

// Finder service commands for interacting with NAS devices
export const listSaved = () => command<NasDevice[]>('list_saved');
export const discoverNas = (target = '') =>
  command<NasDevice[]>('discover_nas', { target: target.trim() || null });
export const saveNas = (id: string) => command<void>('save_nas', { id });
export const forgetNas = (id: string) => command<void>('forget_nas', { id });
export const openNas = (id: string) => command<void>('open_nas', { id });
export const confirmNasEndpoint = (id: string, expectedUrl: string) =>
  command<NasDevice>('confirm_nas_endpoint', { id, expectedUrl });
export const deviceUrl = (device: NasDevice) =>
  `${device.secure ? 'https' : 'http'}://${device.address}:${device.port}/`;
