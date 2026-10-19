import { test as base } from 'playwright-bdd';
import type { NasDevice } from '../../../src/types';

interface FinderFixture {
  found: NasDevice[];
  saved: NasDevice[];
  opened: string[];
  error: string | null;
  commands: string[];
}

declare global {
  interface Window {
    __finderFixture: FinderFixture;
  }
}

export const test = base.extend<{ nativeFinder: void }>({
  nativeFinder: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const fixture: FinderFixture = {
          found: [
            {
              id: 'a'.repeat(64),
              name: 'nas-studio',
              address: '192.168.1.15',
              port: 80,
              secure: false,
              configured: false,
              online: true,
              saved: false,
            },
          ],
          saved: [],
          opened: [],
          error: null,
          commands: [],
        };
        window.__finderFixture = fixture;
        Object.defineProperty(window, '__TAURI_INTERNALS__', {
          value: {
            invoke: async (command: string, args: Record<string, unknown> = {}) => {
              fixture.commands.push(command);
              if (command === 'list_saved') {
                return fixture.saved.map((device) => ({ ...device, online: false }));
              }

              if (command === 'discover_nas') {
                if (fixture.error) {
                  throw fixture.error;
                }

                if (args.target && args.target !== '192.168.1.15') {
                  throw 'invalid_address';
                }

                const url = (device: NasDevice) =>
                  `${device.secure ? 'https' : 'http'}://${device.address}:${device.port}/`;
                const found = fixture.found.map((device) => {
                  const previous = fixture.saved.find((saved) => saved.id === device.id);
                  return {
                    ...device,
                    saved: !!previous,
                    previousEndpoint:
                      previous && url(previous) !== url(device) ? url(previous) : undefined,
                  };
                });

                const missing = fixture.saved
                  .filter((device) => !found.some((found) => found.id === device.id))
                  .map((device) => ({ ...device, online: false }));

                const all = [...found, ...missing];
                fixture.saved = all
                  .filter((device) => device.saved)
                  .map((device) =>
                    device.previousEndpoint
                      ? fixture.saved.find((previous) => previous.id === device.id)!
                      : device,
                  );
                return all;
              }

              if (command === 'confirm_nas_endpoint') {
                const device = fixture.found.find((device) => device.id === args.id);
                if (
                  !device ||
                  args.expectedUrl !==
                    `${device.secure ? 'https' : 'http'}://${device.address}:${device.port}/`
                ) {
                  throw 'endpoint_changed';
                }
                const confirmed = { ...device, saved: true, previousEndpoint: undefined };
                fixture.saved = fixture.saved.map((previous) =>
                  previous.id === device.id ? confirmed : previous,
                );
                return confirmed;
              }

              if (command === 'save_nas') {
                const device = fixture.found.find((device) => device.id === args.id);
                if (device && !fixture.saved.some((saved) => saved.id === device.id)) {
                  fixture.saved.push({ ...device, saved: true });
                }

                return;
              }

              if (command === 'forget_nas') {
                fixture.saved = fixture.saved.filter((device) => device.id !== args.id);
                return;
              }

              if (command === 'open_nas') {
                fixture.opened.push(String(args.id));
              }
            },
          },
        });
      });
      await use();
    },
    { auto: true },
  ],
});
