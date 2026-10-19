# NAS Finder

NAS Finder is a Tauri desktop application for discovering NAS devices on the local
IPv4 network, including devices that have not completed setup. It provides a saved
device list, network discovery, and access to the NAS setup wizard or gateway in the
default browser.

The desktop targets are **Linux and Windows**. The interface supports English and
Italian, with light and dark themes.

## Features

- Discover devices through IPv4 broadcast or a specific local IPv4 address.
- Identify devices that are configured, awaiting setup, or unavailable.
- Save devices locally and track them by a stable identifier.
- Review changes to a saved device's address, port, or protocol before opening it.
- Select the interface language and theme from the page header.

## Getting started

### Requirements

| Requirement      | Details                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Node.js          | A version supported by `package.json`; CI uses Node.js 24.               |
| Package manager  | pnpm for local development, or npm with the committed npm lockfile.      |
| Rust             | Version 1.89 or later.                                                   |
| Native libraries | The Tauri build dependencies for the target operating system.            |
| NAS software     | A wizard or gateway with a `NAS-OS-DISCOVER/1` responder.                |
| Network          | The computer and NAS must be able to exchange traffic on UDP port 39877. |

Run these commands from the repository root:

```sh
pnpm install
pnpm run tauri:dev
```

For an npm installation, use `npm ci` and `npm run tauri:dev` instead.
The desktop application communicates directly with the Rust backend through Tauri
IPC. Running the Vite development server alone does not provide discovery or native
window commands.

### Build commands

| Command               | Result                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `npm run build`       | Type-check the project and compile the frontend into `dist/tauri`. |
| `npm run tauri:build` | Build the native application and desktop packages.                 |

## Using the application

The steps below use the English interface labels.

1. Select **Find NAS** to open network discovery.
2. Leave **IPv4 address** empty to search the local network, or enter a specific
   local IPv4 address when broadcast discovery does not find the device.
3. Select **Save NAS** to add a discovered device to the saved list.
4. Use **Set up NAS** or **Open page** to launch its page in the default browser.
5. Use **Refresh status** to check the saved devices again.

| Status                 | Meaning                                                     |
| ---------------------- | ----------------------------------------------------------- |
| **Setup required**     | The NAS is responding and has not completed setup.          |
| **Configured**         | The NAS is responding and reports that setup is complete.   |
| **Unavailable**        | A saved NAS did not respond to the latest discovery.        |
| **Connection changed** | A saved NAS reports a different address, port, or protocol. |

For **Connection changed**, select **Confirm connection**, compare the saved and
new URLs, and confirm only after checking the device. The saved connection remains
unchanged and opening the new connection stays blocked until confirmation.

## NAS and network requirements

During initial setup, the wizard enables discovery through the NAS base firewall.
After the transition to the gateway, discovery is disabled until the user enables
**Network discovery (NAS Finder)** in Security Center's access settings.

Discovery uses UDP port **39877**. Broadcast traffic stays within the local network
and may be blocked by guest networks, VLAN separation, or wireless client isolation.
A manual address can help when broadcast is blocked, but it cannot bypass the NAS
firewall or enable a disabled responder. Older NAS software without the responder
will not answer either search method.

The discovery protocol does not authenticate a NAS or grant access to it. Browser
certificate validation and the gateway's account, CA, and mutual TLS requirements
still apply. Connection confirmation protects against silently replacing a saved
URL; it is not cryptographic proof of device identity.

## Documentation

| Document                                                   | Audience and scope                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Development guide](DEVELOPMENT.md)                        | Architecture, IPC, storage, verification, and release tooling.                 |
| [NAS integration guide](NAS-INTEGRATION.md)                | Discovery protocol, responder lifecycle, firewall setup, and on-device checks. |
| [Changelog](CHANGELOG.txt)                                 | Release notes consumed by the release pipeline.                                |
| [GLib compatibility patch](backend/vendor/glib/PATCHES.md) | The vendored Linux dependency fix and its regression test.                     |

## Validation scope

Automated checks cover frontend behavior, simulated IPC, local UDP discovery,
storage transactions, and release tooling. Validation of broadcast discovery on a
physical network, Windows interface enumeration, the native WebView, and actual
browser launching requires the corresponding desktop and NAS environment. Device
status is refreshed at startup and on discovery or **Refresh status**; there is no
continuous background polling.
