import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  deviceUrl,
  discoverNas,
  errorCode,
  forgetNas,
  listSaved,
  openNas,
  saveNas,
} from '@/services/finder';
import { nas } from '@tests/fixtures';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(invoke).mockResolvedValue([]);
});

it('sends typed commands and never sends a URL or filesystem path to the opener', async () => {
  await listSaved();
  expect(invoke).toHaveBeenLastCalledWith('list_saved', undefined);
  await discoverNas(' 192.168.1.15 ');
  expect(invoke).toHaveBeenLastCalledWith('discover_nas', { target: '192.168.1.15' });
  await discoverNas();
  expect(invoke).toHaveBeenLastCalledWith('discover_nas', { target: null });
  await saveNas(nas().id);
  expect(invoke).toHaveBeenLastCalledWith('save_nas', { id: nas().id });
  await forgetNas(nas().id);
  expect(invoke).toHaveBeenLastCalledWith('forget_nas', { id: nas().id });
  await openNas(nas().id);
  expect(invoke).toHaveBeenLastCalledWith('open_nas', { id: nas().id });
});

it('maps known errors and builds links for HTTP and HTTPS', () => {
  expect(errorCode('invalid_address')).toBe('invalid_address');
  expect(errorCode(new Error('private details'))).toBe('network_unavailable');
  expect(deviceUrl(nas())).toBe('http://192.168.1.15:80/');
  expect(deviceUrl(nas({ secure: true, port: 443 }))).toBe('https://192.168.1.15:443/');
});
