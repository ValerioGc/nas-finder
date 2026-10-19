import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import PageHeader from '@/components/layout/PageHeader.vue';
import { setTheme } from '@/composables/useTheme';
import { setLocale } from '@/i18n/i18n';
import italian from '@/i18n/lang/it';

beforeEach(() => {
  setLocale('en');
  setTheme('dark');
});

it('applies the selected theme and language while keeping accessible names on icon controls', async () => {
  const wrapper = mount(PageHeader);
  expect(wrapper.find('label').exists()).toBe(false);
  expect(wrapper.find('#theme').attributes('aria-label')).toBe('Theme');
  expect(wrapper.find('#language').attributes('aria-label')).toBe('Language');
  await wrapper.find('#theme').setValue('light');
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(document.documentElement.style.colorScheme).toBe('light');
  await wrapper.find('#theme').setValue('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  await wrapper.find('#language').setValue('it');
  expect(document.documentElement.lang).toBe('it');
  expect(wrapper.find('#language').attributes('aria-label')).toBe(italian.language);
  await wrapper.find('#language').setValue('en');
  expect(document.documentElement.lang).toBe('en');
  expect(wrapper.find('#language').attributes('aria-label')).toBe('Language');
  wrapper.unmount();
});

it('keeps the selector and the document in sync with programmatic theme changes', async () => {
  const wrapper = mount(PageHeader);
  setTheme('light');
  await flushPromises();
  expect((wrapper.find('#theme').element as HTMLSelectElement).value).toBe('light');
  expect(document.documentElement.dataset.theme).toBe('light');
  setTheme('dark');
  await flushPromises();
  expect((wrapper.find('#theme').element as HTMLSelectElement).value).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  wrapper.unmount();
});
