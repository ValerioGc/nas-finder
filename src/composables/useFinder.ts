import { computed, ref } from 'vue';
import {
  confirmNasEndpoint,
  discoverNas,
  errorCode,
  forgetNas,
  listSaved,
  openNas,
  saveNas,
} from '@/services/finder';
import type { FinderError, NasDevice } from '@/types';

export function useFinder() {
  const devices = ref<NasDevice[]>([]);
  const operation = ref<
    'initialize' | 'refresh' | 'search' | 'save' | 'forget' | 'open' | 'confirm' | null
  >(null);
  const busy = computed(() => operation.value !== null);
  const refreshing = computed(
    () => operation.value === 'refresh' || operation.value === 'initialize',
  );
  const searching = computed(() => operation.value === 'search');
  const error = ref<FinderError | null>(null);
  const errorContext = ref<'page' | 'search'>('page');
  const pageError = computed(() => (errorContext.value === 'page' ? error.value : null));
  const searchError = computed(() => (errorContext.value === 'search' ? error.value : null));
  const scanned = ref(false);
  const searchScanned = ref(false);
  const saved = computed(() => devices.value.filter((device) => device.saved));
  const found = computed(() => devices.value.filter((device) => device.online));

  /**
   * Runs the specified action within the context of the finder operation, handling busy state, errors, and operation type.
   * @param action - The asynchronous action to execute within the finder operation.
   * @param kind - The type of finder operation being performed.
   * @param context - The context in which the operation is executed, either 'page' or 'search'.
   * @returns A promise that resolves when the action completes or rejects if an error occurs.
   */
  async function run(
    action: () => Promise<void>,
    kind: NonNullable<typeof operation.value>,
    context: 'page' | 'search' = 'page',
  ) {
    if (busy.value) {
      return;
    }

    operation.value = kind;
    error.value = null;
    errorContext.value = context;

    try {
      await action();
    } catch (reason: unknown) {
      error.value = errorCode(reason);
    } finally {
      operation.value = null;
    }
  }

  /**
   * Discovers NAS devices on the network based on the provided target address and discovery kind.
   * @param target - The target NAS address to discover.
   * @param kind - The kind of discovery action, either 'refresh' or 'search'.
   */
  async function discover(target: string, kind: 'refresh' | 'search') {
    await run(
      async () => {
        try {
          devices.value = await discoverNas(target);
          scanned.value = true;
          if (kind === 'search') {
            searchScanned.value = true;
          }
        } catch (reason) {
          devices.value = devices.value
            .filter((device) => device.saved)
            .map((device) => ({ ...device, online: false }));
          throw reason;
        }
      },
      kind,
      kind === 'search' ? 'search' : 'page',
    );
  }

  const search = (target = '') => discover(target, 'search');
  const refresh = () => discover('', 'refresh');

  async function initialize() {
    await run(async () => {
      devices.value = await listSaved();
    }, 'initialize');

    if (!error.value) {
      await refresh();
    }
  }

  async function save(id: string) {
    await run(
      async () => {
        await saveNas(id);
        devices.value = devices.value.map((device) =>
          device.id === id ? { ...device, saved: true } : device,
        );
      },
      'save',
      'search',
    );
  }

  async function forget(id: string) {
    await run(async () => {
      await forgetNas(id);
      devices.value = devices.value.flatMap((device) => {
        if (device.id !== id) {
          return [device];
        }

        return device.online ? [{ ...device, saved: false, previousEndpoint: undefined }] : [];
      });
    }, 'forget');
  }

  async function open(id: string, context: 'page' | 'search' = 'page') {
    await run(
      async () => {
        await openNas(id);
      },
      'open',
      context,
    );
  }

  async function confirmEndpoint(
    id: string,
    expectedUrl: string,
    context: 'page' | 'search' = 'page',
  ) {
    await run(
      async () => {
        const confirmed = await confirmNasEndpoint(id, expectedUrl);
        devices.value = devices.value.map((device) => (device.id === id ? confirmed : device));
      },
      'confirm',
      context,
    );
  }

  return {
    devices,
    busy,
    refreshing,
    searching,
    error,
    pageError,
    searchError,
    scanned,
    searchScanned,
    saved,
    found,
    initialize,
    refresh,
    search,
    save,
    forget,
    open,
    confirmEndpoint,
  };
}
