# Changelog

## 0.1.1 — 2026-11-04

Fixes the reported "the auto check-in switch turns itself off when I restart dsh".

- **The state file is now replaced atomically.** `writeFile` truncates before it
  writes, so a read landing mid-write — a restart racing a route hit, or two
  saves in flight — observed an empty or partial document. Measured on the old
  path: 53 of 120 concurrent reads parsed garbage.
- **An unreadable state file is no longer treated as "never configured".** The
  old reader answered any read or parse error with `DEFAULTS`, whose
  `autoCheckin.enabled` is `false` — indistinguishable from a switch the user
  never turned on. Now only a missing file means defaults; a damaged one is
  logged, reported as `stateError` in the panel, and left on disk untouched so
  the schedule can still be recovered by hand.
- Adds two regression tests (a torn file must not reset the config; concurrent
  writes must never expose a truncated document) and `docs/重启自检.sh`, which
  checks the disk flag, the live `scheduler.armed` flag and `nextAt` together
  instead of trusting the panel label.

## 0.1.0 — 2026-11-03

First release.

- Unified panel under Settings → Plugins → "Check-in & Credits" showing the four
  panels (Trae CN / Global, WorkBuddy CN / Global): sign-in state, available and
  total credits, today's check-in state and streak length.
- Check in all, or one target at a time. Only the domestic sides are offered,
  because the global sides have no check-in activity upstream.
- Opt-in daily automatic check-in with a configurable time, per-app coverage and
  an optional catch-up for a slot missed while the Harness was not running.
- Check-in log covering manual and scheduled runs.
- An automatic run in which every target failed does not mark the day as done,
  so the still-open slot can retry. A partially successful run does mark it.
- The startup catch-up waits 90 seconds before touching the siblings, so it does
  not race route registration and answer `fetch failed` for every target.
- Loopback-only routes; the check-in and configuration routes additionally
  verify the `Host` header, refusing foreign origins and DNS-rebinding hosts.
