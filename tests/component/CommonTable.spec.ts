import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import CommonTable from '@/components/common/CommonTable.vue';
import { setLocale } from '@/i18n/i18n';
import italian from '@/i18n/lang/it';
import { nas } from '@tests/fixtures';

beforeEach(() => setLocale('en'));

it('blocks changed endpoints, shows both URLs and emits only the explicitly confirmed URL', async () => {
  const device = nas({ saved: true, previousEndpoint: 'http://192.168.1.10:80/' });
  const wrapper = mount(CommonTable, { props: { devices: [device], busy: false, mode: 'saved' } });
  expect(wrapper.text()).toContain('Connection changed');
  expect(wrapper.find('a').attributes('href')).toBeUndefined();
  expect(wrapper.find('a').attributes('aria-disabled')).toBe('true');
  await wrapper.find('a').trigger('click');
  expect(wrapper.emitted('open')).toBeUndefined();
  await wrapper.find('.save_button').trigger('click');
  await flushPromises();
  const dialog = document.body.querySelector('dialog');
  expect(dialog?.textContent).toContain('http://192.168.1.10:80/');
  expect(dialog?.textContent).toContain('http://192.168.1.15:80/');
  dialog?.querySelector<HTMLButtonElement>('.primary_button')?.click();
  await flushPromises();
  expect(wrapper.emitted('confirm')).toEqual([[device.id, 'http://192.168.1.15:80/']]);
  expect(document.body.querySelector('dialog')).toBeNull();
  wrapper.unmount();
});

it('allows cancellation without emitting a confirmation and translates table headers reactively', async () => {
  const wrapper = mount(CommonTable, {
    props: {
      devices: [nas({ saved: true, previousEndpoint: 'http://192.168.1.10:80/' })],
      busy: false,
      mode: 'search',
    },
  });
  await wrapper.find('.save_button').trigger('click');
  await flushPromises();
  document.body.querySelector<HTMLButtonElement>('dialog .secondary_button')?.click();
  await flushPromises();
  expect(wrapper.emitted('confirm')).toBeUndefined();
  expect(document.body.querySelector('dialog')).toBeNull();
  await wrapper.find('.save_button').trigger('click');
  await flushPromises();
  document.body.querySelector<HTMLButtonElement>('dialog .modal_header button')?.click();
  await flushPromises();
  expect(wrapper.emitted('confirm')).toBeUndefined();
  expect(document.body.querySelector('dialog')).toBeNull();
  setLocale('it');
  await flushPromises();
  expect(wrapper.findAll('th').map((th) => th.text())).toEqual([
    italian.name,
    italian.address,
    italian.status,
    italian.actions,
  ]);
  setLocale('en');
  await flushPromises();
  expect(wrapper.findAll('th').map((th) => th.text())).toEqual([
    'Name',
    'Address',
    'Status',
    'Actions',
  ]);
  wrapper.unmount();
});
