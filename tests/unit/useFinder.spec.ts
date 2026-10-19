import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFinder } from '@/composables/useFinder';
import { nas } from '@tests/fixtures';
import {
  confirmNasEndpoint,
  discoverNas,
  forgetNas,
  listSaved,
  openNas,
  saveNas,
} from '@/services/finder';

vi.mock('@/services/finder', async (original) => ({
  ...(await original<typeof import('@/services/finder')>()),
  discoverNas: vi.fn(),
  forgetNas: vi.fn(),
  listSaved: vi.fn(),
  openNas: vi.fn(),
  confirmNasEndpoint: vi.fn(),
  saveNas: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSaved).mockResolvedValue([]);
  vi.mocked(discoverNas).mockResolvedValue([nas()]);
  vi.mocked(saveNas).mockResolvedValue();
  vi.mocked(forgetNas).mockResolvedValue();
  vi.mocked(openNas).mockResolvedValue();
});

describe('NAS discovery state', () => {
  it('keeps a changed endpoint blocked on failure and adopts the confirmed backend device on success', async () => {
    const candidate = nas({ saved: true, previousEndpoint: 'http://192.168.1.10:80/' });
    vi.mocked(discoverNas).mockResolvedValue([candidate]);
    const finder = useFinder();
    await finder.initialize();
    vi.mocked(confirmNasEndpoint).mockRejectedValueOnce('endpoint_changed');
    await finder.confirmEndpoint(candidate.id, 'http://192.168.1.15:80/', 'search');
    expect(finder.searchError.value).toBe('endpoint_changed');
    expect(finder.saved.value[0]?.previousEndpoint).toBe(candidate.previousEndpoint);
    const confirmed = nas({ saved: true });
    vi.mocked(confirmNasEndpoint).mockResolvedValue(confirmed);
    await finder.confirmEndpoint(candidate.id, 'http://192.168.1.15:80/');
    expect(confirmNasEndpoint).toHaveBeenLastCalledWith(candidate.id, 'http://192.168.1.15:80/');
    expect(finder.saved.value[0]).toEqual(confirmed);
    expect(finder.pageError.value).toBeNull();
  });
  it('loads saved devices and searches before exposing available NAS devices', async () => {
    const finder = useFinder();
    await finder.initialize();
    expect(listSaved).toHaveBeenCalledOnce();
    expect(discoverNas).toHaveBeenCalledWith('');
    expect(finder.found.value).toHaveLength(1);
    expect(finder.saved.value).toHaveLength(0);
    expect(finder.scanned.value).toBe(true);
  });

  it('updates saved state only after storage confirms the save', async () => {
    const finder = useFinder();
    await finder.initialize();
    vi.mocked(saveNas).mockRejectedValueOnce('storage_unavailable');
    await finder.save(nas().id);
    expect(finder.saved.value).toHaveLength(0);
    expect(finder.error.value).toBe('storage_unavailable');
    await finder.save(nas().id);
    expect(finder.saved.value).toHaveLength(1);
    expect(finder.error.value).toBeNull();
  });

  it('keeps a removed online device discoverable and removes an offline entry', async () => {
    vi.mocked(discoverNas).mockResolvedValue([nas({ saved: true })]);
    const finder = useFinder();
    await finder.initialize();
    await finder.forget(nas().id);
    expect(finder.saved.value).toHaveLength(0);
    expect(finder.found.value).toHaveLength(1);
    vi.mocked(discoverNas).mockResolvedValue([nas({ saved: true, online: false })]);
    await finder.search();
    await finder.forget(nas().id);
    expect(finder.devices.value).toHaveLength(0);
  });

  it('clears stale online states when refresh fails and supports retry', async () => {
    vi.mocked(discoverNas).mockResolvedValueOnce([nas({ saved: true })]);
    const finder = useFinder();
    await finder.initialize();
    vi.mocked(discoverNas).mockRejectedValueOnce('network_unavailable');
    await finder.search();
    expect(finder.found.value).toHaveLength(0);
    expect(finder.saved.value[0]?.online).toBe(false);
    expect(finder.error.value).toBe('network_unavailable');
    await finder.search('192.168.1.15');
    expect(discoverNas).toHaveBeenLastCalledWith('192.168.1.15');
    expect(finder.error.value).toBeNull();
    expect(finder.found.value).toHaveLength(1);
  });

  it('does not overwrite a saved list when loading it fails', async () => {
    vi.mocked(listSaved).mockRejectedValue('storage_unavailable');
    const finder = useFinder();
    await finder.initialize();
    expect(finder.error.value).toBe('storage_unavailable');
    expect(discoverNas).not.toHaveBeenCalled();
  });

  it('prevents overlapping operations and restores the controls after completion', async () => {
    let finish: ((devices: ReturnType<typeof nas>[]) => void) | undefined;
    vi.mocked(discoverNas).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const finder = useFinder();
    const first = finder.search();
    expect(finder.busy.value).toBe(true);
    expect(finder.searching.value).toBe(true);
    expect(finder.refreshing.value).toBe(false);
    await finder.refresh();
    await finder.search();
    expect(discoverNas).toHaveBeenCalledOnce();
    finish?.([nas()]);
    await first;
    expect(finder.busy.value).toBe(false);
    expect(finder.searching.value).toBe(false);
  });

  it('tracks refresh separately and sends each discovery error to its own view', async () => {
    let finish: ((devices: ReturnType<typeof nas>[]) => void) | undefined;
    vi.mocked(discoverNas).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );

    const finder = useFinder();
    const refreshing = finder.refresh();
    expect(finder.refreshing.value).toBe(true);
    expect(finder.searching.value).toBe(false);
    finish?.([nas()]);
    await refreshing;
    expect(finder.refreshing.value).toBe(false);
    expect(finder.searchScanned.value).toBe(false);
    vi.mocked(discoverNas).mockRejectedValueOnce('network_unavailable');
    await finder.refresh();
    expect(finder.pageError.value).toBe('network_unavailable');
    expect(finder.searchError.value).toBeNull();
    vi.mocked(discoverNas).mockRejectedValueOnce('invalid_address');
    await finder.search('invalid');
    expect(finder.searchError.value).toBe('invalid_address');
    expect(finder.pageError.value).toBeNull();
  });

  it('does not show discovery loading while saving or opening a device', async () => {
    let finish: (() => void) | undefined;
    vi.mocked(saveNas).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const finder = useFinder();
    const saving = finder.save(nas().id);
    expect(finder.busy.value).toBe(true);
    expect(finder.searching.value).toBe(false);
    expect(finder.refreshing.value).toBe(false);
    finish?.();
    await saving;

    vi.mocked(openNas).mockRejectedValueOnce('browser_unavailable');
    await finder.open(nas().id, 'search');
    expect(finder.searchError.value).toBe('browser_unavailable');
    expect(finder.pageError.value).toBeNull();
  });

  it('reports browser errors without losing the device list', async () => {
    const finder = useFinder();
    await finder.initialize();
    vi.mocked(openNas).mockRejectedValueOnce('browser_unavailable');
    await finder.open(nas().id);
    expect(finder.error.value).toBe('browser_unavailable');
    expect(finder.found.value).toHaveLength(1);
  });
});
