# Changelog

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
