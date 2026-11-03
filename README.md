# dsh-connect-two

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

One panel for the credits and daily check-in of your locally signed-in
**Trae** and **WorkBuddy** accounts, with an **opt-in** daily automatic check-in.

> A **companion bundle**, not a fork. `dsh-connect-trae` and
> `dsh-connect-workbuddy` stay installed and keep receiving upstream updates;
> this plugin only reads their read-only routes and calls the check-in route
> they already ship.

## Why not merge the two plugins

| | A. Companion bundle (this) | B. Merge into one plugin |
|---|---|---|
| One panel for both apps | ✅ | ✅ |
| Upstream keeps updating | ✅ upgrade directly | ❌ permanently diverged |
| Maintenance cost | ~500 lines | fork two 1.4 MB builds, 100+ sources |
| After uninstalling | both plugins keep working | you own all of it |

Both upstream plugins iterate fast (4.6.12 / 5.17.0 locally while upstream had
already shipped 4.7.0 / 5.18.0). Merging means hand-porting every release from
then on, so this is a companion instead.

## What it does

- **Unified panel** under Settings → Plugins → "Check-in & Credits": the four
  panels (Trae CN / Global, WorkBuddy CN / Global) with sign-in state, available
  and total credits, today's check-in state, and streak length.
- **Check in all / check in one**: shown only for the **domestic** side, because
  the global sides have no check-in activity at all.
- **Daily automatic check-in**: off by default. When enabled you choose the run
  time, which apps it covers, and whether a missed slot is caught up on the next
  start.
- **Check-in log**: manual and scheduled runs are both recorded, each row saying
  claimed / already claimed / device quota used / failed.

## Install

```sh
# In Harness, through plugin_manager:
install_bundle  target = <absolute path to this repo>
```

Or once published to npm:

```sh
dsh plugin add dsh-connect-two
```

A successful install reports `application: "applied"`. **Host-side changes need
a `dsh web` restart** to load; the Client half hot-reloads.

## Usage

1. Settings → Plugins → **Check-in & Credits**.
2. The rows are live; **Refresh** re-reads them.
3. **Check in all**, or the per-row **Check in**, claims today's reward now.
4. For automatic check-in, turn the switch on, set the time, pick the apps.
   The scheduler runs while the Harness process is up; a slot missed while it
   was down only executes if **Catch up missed runs** is enabled.

## Safety notes

- Check-in is the only operation that changes upstream account state, and it is
  driven only by your button press or by a schedule you explicitly enabled.
- Both routes are loopback-only. The Hub additionally checks the `Host` header,
  so a foreign origin or a DNS-rebinding host is refused with 403.
- Repeated claims are harmless: both upstream plugins read today's status first
  and answer `alreadyCheckedIn` instead of claiming twice.
- A run where **every** target failed does not mark the day as done, so the slot
  stays open and retries. A partially successful run does mark it.

## State

- `$DSH_HOME/dsh-connect-two/state.json` — config, log (last 200 entries), and
  the day of the last automatic run.
- Delete it to return to defaults (automatic check-in off).
- Config validation lives in one place; an invalid time is normalised back to a
  legal value instead of being stored.

## Development

```sh
npm test     # 12 contract tests, no Harness needed
npm run check
```

Layout: `src/` holds the plugin (the package root manifest points into it),
`test/` the contract tests, `docs/` the design notes and the measured log.

## Boundaries (stated plainly)

- Check-in exists on the **domestic side only**. The global sides show credits
  but no check-in button, because their upstream has no such activity.
- WorkBuddy **enterprise / education** seats are refused by the upstream write
  API (`10001`); those rows report failure as failure rather than faking success.
- Automatic check-in depends on the Harness process being alive at the chosen
  time, unless catch-up is enabled.
- The panel has not been visually reviewed in a browser by this repository's
  author; styling uses only `--dsw-alias-*` theme tokens so it follows the host
  light/dark theme.

## License

MIT. See [LICENSE](./LICENSE).
