# NAS integration guide

This guide describes how NAS Finder interoperates with the setup wizard, gateway,
base firewall, launcher, and Security Center. These components remain independent
projects and communicate through the discovery protocol and existing NAS settings.

For desktop installation and usage, see the [README](README.md). For client-side
implementation and verification, see the [development guide](DEVELOPMENT.md).

## Discovery lifecycle

Discovery is available during initial setup. After setup, it remains disabled
until the user enables it in Security Center.

| Component       | Responsibility                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base firewall   | Own the `nas_discovery` set and restrict UDP port 39877 to permitted local IPv4 traffic. The set is empty by default.                                                        |
| Setup wizard    | Answer with `setup` and its HTTP port; enable discovery while setup is active. Stop the responder and clear the set before handing over to the gateway.                      |
| Gateway         | Answer with `ready` or `setup`, depending on account configuration, and advertise HTTPS when its TLS listener is active. Firewall rules determine whether requests reach it. |
| Launcher        | Manage the discovery service according to the stored setting, reapply enabled settings at startup, and notify the user when discovery is disabled after setup.               |
| Security Center | Expose **Network discovery (NAS Finder)** in the access settings, backed by `GET`/`PUT /settings/discovery`.                                                                 |

If handover fails and the wizard resumes, it restores its responder and the
firewall opening. The gateway keeps the same identity as the wizard and takes the
device name from `/etc/hostname`.

When discovery is enabled, the launcher starts `nas-os-discovery.service`;
`apply-discovery.sh` adds port 39877 to the firewall set. Disabling discovery clears
the set. The launcher reapplies an enabled setting after reboot because the runtime
firewall set starts empty.

Responders do not take over consoles, getty instances, login ports, or devices.
Discovery failures are logged without preventing the web service from starting.
Security Center's allowed-address policy also applies to discovery: an excluded
computer does not receive a response.

## Discovery protocol

The protocol uses **UDP over IPv4 on port 39877**. No announcement is sent without a
request.

### Request

The request is one UTF-8 line with no trailing newline:

```text
NAS-OS-DISCOVER/1 <nonce>
```

`nonce` is a 16-character hexadecimal value chosen for the current discovery.

### Response

The response has eight newline-separated fields, including an empty final field.
It therefore ends with a newline:

```text
NAS-OS/1
<nonce>
<64-character hexadecimal device ID>
<hostname>
<setup or ready>
<web port>
<http or https>

```

| Field           | Validation or meaning                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Protocol marker | Exactly `NAS-OS/1`.                                                     |
| Nonce           | Must match the current request.                                         |
| Device ID       | 64 hexadecimal characters.                                              |
| Hostname        | 1–63 ASCII characters; letters, digits, `.`, `-`, and `_` are accepted. |
| Status          | `setup` or `ready`.                                                     |
| Web port        | A nonzero 16-bit port number.                                           |
| Scheme          | `http` or `https`.                                                      |
| Final field     | Empty, represented by the trailing newline.                             |

NAS Finder rejects replies larger than 512 bytes or from a source port other than 39877. It derives the address from the packet's IPv4 source rather than accepting
an advertised hostname or URL. Private, link-local, and loopback addresses are
accepted by the client; public IPv4 addresses and IPv6 are rejected.

### Identity and timing

The NAS derives its ID as SHA-256 of `nas-os-discovery-v1:` followed by its
machine-id. The original machine-id is not transmitted. The wizard and gateway
must use the same derivation. Cloned installations need a fresh `/etc/machine-id`
to avoid duplicate identities.

The desktop client retransmits requests every 900 ms and listens for approximately
three seconds after interface enumeration. Linux uses `ip -j -4 address show up`;
Windows uses `Get-NetIPAddress` in PowerShell without a profile. Enumeration has a
two-second timeout, after which the client falls back to global broadcast and the
saved addresses. Manual discovery adds the specified local IPv4 address to the
saved device addresses rather than scanning every subnet host.

The client accepts at most 128 discovered identities and deduplicates by ID. It
prefers a previously saved address when that address still responds. Responders
accept requests from local IPv4 sources on non-privileged source ports and limit
responses to ten per second.

## Network and trust boundaries

The base firewall rules permit inbound requests from private and link-local IPv4
addresses and outbound replies to the local network, with rate limits. An empty
`nas_discovery` set leaves discovery closed.

Broadcast does not cross subnet boundaries and may be blocked by guest networks,
VLAN separation, or Wi-Fi client isolation. A manual address helps only if the NAS
responder is enabled and its firewall permits the requesting computer.

The protocol checks packet validity and associates replies with the current
request; it **does not authenticate the responder**. The device ID is a stable
identifier, not proof of identity. Authentication would require a coordinated new
protocol and responder implementation.

For a saved device, changes to its IP address, web port, or scheme require
**Confirm connection** in NAS Finder. The application shows the saved and new URLs,
blocks opening the candidate, and preserves the old saved record until confirmation.
This also applies when a device transitions from the HTTP setup wizard to an HTTPS
gateway. Confirmation does not replace browser certificate validation, account
checks, CA trust, or mutual TLS.

## On-device validation

Use versions of the wizard, gateway, launcher, and Security Center that include the
discovery integration. A compatible base firewall can be updated from the wizard
package with:

```sh
sudo ./install.sh --update
```

This reloads the firewall chains while preserving application sets.

| Step                                         | Expected result                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Search while the setup wizard is running.    | NAS Finder shows **Setup required**, including with a manual address.                                   |
| Inspect `nas_discovery` during setup.        | The set contains port 39877.                                                                            |
| Complete setup and hand over to the gateway. | The set is empty, discovery no longer finds the NAS, and a discovery-disabled notification is recorded. |
| Enable discovery in Security Center.         | The NAS responds with its current setup status and HTTPS when TLS is active.                            |
| Disable discovery again.                     | Subsequent discovery receives no response from the NAS.                                                 |
| Reboot with discovery enabled.               | The launcher restores the firewall opening and the NAS responds again.                                  |
| Change the connection of a saved NAS.        | NAS Finder requires confirmation before updating or opening the new connection.                         |

Inspect the firewall set with:

```sh
sudo nft list set inet nas_base nas_discovery
```

During setup or while discovery is enabled, its output should include
`elements = { 39877 }`. Also validate a secondary network adapter, an IP address
change, an unavailable NAS, and a blocked source address. The HTTPS certificate
must be trusted by the browser; mutual TLS requires the client certificate already
configured for the gateway.

## Disabling discovery

Use the Security Center switch to close the port and persist the disabled setting.
For immediate closure from a console or SSH session:

```sh
sudo nft flush set inet nas_base nas_discovery
```

This clears the runtime set only. If the stored setting remains enabled, the
launcher reopens discovery on its next startup. Disable the setting in Security
Center to keep the port closed across restarts. Do not stop or remove the base
firewall to disable discovery.
