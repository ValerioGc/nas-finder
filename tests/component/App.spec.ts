import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '@/App.vue';
import { setLocale } from '@/i18n/i18n';
import italian from '@/i18n/lang/it';
import { nas } from '@tests/fixtures';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

beforeEach(() => {
  setLocale('en');
  vi.clearAllMocks();
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'list_saved') {
      return [];
    }

    if (command === 'discover_nas') {
      return [nas()];
    }

    return undefined;
  });
});

it('shows the empty saved list and can find, save and open an unconfigured NAS', async () => {
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.text()).toContain('No saved NAS devices');
  const search = wrapper.findAll('button').find((button) => button.text() === 'Find NAS');
  await search?.trigger('click');
  await flushPromises();

  expect(document.body.textContent).toContain('Setup required');
  const save = Array.from(document.body.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === 'Save NAS',
  );
  save?.click();
  await flushPromises();

  expect(wrapper.text()).toContain('nas-studio');
  expect(invoke).toHaveBeenCalledWith('save_nas', { id: nas().id });
  const open = document.body.querySelector<HTMLAnchorElement>('dialog a');
  open?.click();
  await flushPromises();

  expect(invoke).toHaveBeenCalledWith('open_nas', { id: nas().id });
  wrapper.unmount();
});

it('shows configured and offline devices and prevents opening offline links', async () => {
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'discover_nas'
      ? [
          nas({ saved: true, configured: true }),
          nas({ id: 'b'.repeat(64), name: 'nas-offline', saved: true, online: false }),
        ]
      : [],
  );

  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.text()).toContain('Configured');
  expect(wrapper.text()).toContain('Unavailable');
  const links = wrapper.findAll('a');
  expect(links[0]?.attributes('href')).toBe('http://192.168.1.15:80/');
  expect(links[1]?.attributes('href')).toBeUndefined();
  await links[1]?.trigger('click');

  expect(invoke).not.toHaveBeenCalledWith('open_nas', expect.anything());
  wrapper.unmount();
});

it('switches language directly through the page header', async () => {
  const wrapper = mount(App);
  await flushPromises();
  await wrapper.find('#language').setValue('it');
  await flushPromises();
  expect(wrapper.text()).toContain(italian.savedTitle);
  await wrapper.find('#language').setValue('en');
  await flushPromises();
  expect(wrapper.find('header select').exists()).toBe(true);
  expect(document.body.querySelector('dialog')).toBeNull();
  expect(wrapper.text()).toContain('Saved devices');
  wrapper.unmount();
});

it('shows loading only in the view that starts discovery', async () => {
  const wrapper = mount(App);
  await flushPromises();
  let finish: ((devices: ReturnType<typeof nas>[]) => void) | undefined;
  vi.mocked(invoke).mockImplementation((command) => {
    if (command === 'discover_nas') {
      return new Promise((resolve) => {
        finish = resolve;
      });
    }
    return Promise.resolve();
  });

  const refresh = wrapper.findAll('button').find((button) => button.text() === 'Refresh status');
  await refresh?.trigger('click');
  expect(wrapper.findAll('.spinner')).toHaveLength(1);
  expect(wrapper.find('output').text()).toContain('Refreshing');
  const search = wrapper.findAll('button').find((button) => button.text() === 'Find NAS');
  await search?.trigger('click');
  await flushPromises();
  expect(document.body.querySelector('dialog .spinner')).toBeNull();
  expect(
    document.body.querySelector<HTMLButtonElement>('dialog button[type="submit"]')?.disabled,
  ).toBe(true);
  finish?.([nas()]);
  await flushPromises();
  document.body.querySelector('dialog form')?.dispatchEvent(new Event('submit'));
  await flushPromises();
  expect(wrapper.find('.spinner').exists()).toBe(false);
  expect(document.body.querySelectorAll('dialog .spinner')).toHaveLength(1);
  expect(document.body.querySelector('dialog output')?.textContent).toContain('Searching');
  finish?.([]);
  await flushPromises();
  expect(document.body.querySelector('dialog .spinner')).toBeNull();
  expect(document.body.textContent).toContain('No NAS devices found');
  wrapper.unmount();
});

it('opens search from the empty state and the found counter and dismisses it from the close button', async () => {
  const wrapper = mount(App);
  await flushPromises();
  await wrapper.find('.empty_state button').trigger('click');
  await flushPromises();
  expect(document.body.querySelector('dialog')).not.toBeNull();
  document.body.querySelector<HTMLButtonElement>('dialog button[aria-label="Close"]')?.click();
  await flushPromises();
  expect(document.body.querySelector('dialog')).toBeNull();
  await wrapper.find('.found_count').trigger('click');
  await flushPromises();
  expect(document.body.querySelector('dialog')).not.toBeNull();
  wrapper.unmount();
});

it('removes a saved NAS while keeping its online entry available in search', async () => {
  vi.mocked(invoke).mockImplementation(async (command) =>
    command === 'list_saved' ? [] : command === 'discover_nas' ? [nas({ saved: true })] : undefined,
  );

  const wrapper = mount(App);
  await flushPromises();
  await wrapper.find('button[aria-label="Remove from list nas-studio"]').trigger('click');
  await flushPromises();
  expect(invoke).toHaveBeenCalledWith('forget_nas', { id: nas().id });
  expect(wrapper.text()).toContain('No saved NAS devices');
  await wrapper.find('.found_count').trigger('click');
  await flushPromises();
  expect(document.body.querySelector('dialog')?.textContent).toContain('nas-studio');
  wrapper.unmount();
});
