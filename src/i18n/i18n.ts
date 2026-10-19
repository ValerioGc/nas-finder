import { ref } from 'vue';
import en from '@/i18n/lang/en';
import it from '@/i18n/lang/it';
import type { FinderError } from '@/types';

export const messages = { en, it } as const;
export type SupportedLocale = keyof typeof messages;
export type MessageKey = keyof typeof en;
const locale = ref<SupportedLocale>('it');

export function setLocale(nextLocale: SupportedLocale) {
  locale.value = nextLocale;
  document.documentElement.lang = nextLocale;
}

export function t(key: MessageKey) {
  return messages[locale.value][key];
}

const errorKeys: Record<FinderError, MessageKey> = {
  invalid_address: 'errorInvalidAddress',
  network_unavailable: 'errorNetworkUnavailable',
  busy: 'errorBusy',
  storage_unavailable: 'errorStorageUnavailable',
  invalid_device: 'errorInvalidDevice',
  browser_unavailable: 'errorBrowserUnavailable',
  endpoint_changed: 'errorEndpointChanged',
};

export function useI18n() {
  return { locale, setLocale, t, errorText: (code: FinderError) => t(errorKeys[code]) };
}
