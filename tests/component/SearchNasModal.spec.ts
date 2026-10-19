import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import SearchNasModal from '@/components/SearchNasModal.vue';
import { setLocale } from '@/i18n/i18n';

beforeEach(() => setLocale('en'));

it('submits an optional manual address and exposes discovery errors', async () => {
  const wrapper = mount(SearchNasModal, {
    props: { devices: [], busy: false, error: 'invalid_address', scanned: true },
  });

  await flushPromises();
  const input = document.body.querySelector<HTMLInputElement>('#nas_address');
  if (input) {
    input.value = '192.168.1.15';
    input.dispatchEvent(new Event('input'));
  }

  await flushPromises();
  document.body.querySelector('form')?.dispatchEvent(new Event('submit'));
  expect(wrapper.emitted('search')).toEqual([['192.168.1.15']]);
  expect(document.body.textContent).toContain('private or local IPv4');
  wrapper.unmount();
});

it('shows an empty result and can be dismissed with Escape', async () => {
  const wrapper = mount(SearchNasModal, {
    props: { devices: [], busy: false, error: null, scanned: true },
  });

  await flushPromises();
  expect(document.body.textContent).toContain('No NAS devices found');
  document.body.querySelector('dialog')?.dispatchEvent(new Event('cancel', { cancelable: true }));
  expect(wrapper.emitted('close')).toHaveLength(1);
  wrapper.unmount();
});

it('keeps a blocked search distinct from an active search', async () => {
  const wrapper = mount(SearchNasModal, {
    props: { devices: [], busy: false, blocked: true, error: null, scanned: false },
  });

  await flushPromises();
  expect(document.body.querySelector('dialog .spinner')).toBeNull();
  document.body.querySelector('form')?.dispatchEvent(new Event('submit'));
  expect(wrapper.emitted('search')).toBeUndefined();
  await wrapper.setProps({ busy: true });
  expect(document.body.querySelectorAll('dialog .spinner')).toHaveLength(1);
  wrapper.unmount();
});
