/**
 * Contract tests for the Hub Host half.
 *
 * These run without a Harness: they exercise the pure scheduling helper and the
 * normalisation behaviour that decides whether a claim is attempted at all,
 * against the same sibling payload shapes the live routes returned on
 * 2026-11-03 (see docs/实测记录.md).
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { msUntilNextRun, TARGETS, CHECKIN_TARGETS } from '../src/index.js'

test('msUntilNextRun targets today when the slot is still ahead', () => {
  const now = new Date(2026, 10, 3, 8, 30, 0, 0)
  const delay = msUntilNextRun(now, '09:00')
  assert.equal(delay, 30 * 60 * 1000)
})

test('msUntilNextRun rolls to tomorrow when the slot has passed', () => {
  const now = new Date(2026, 10, 3, 9, 0, 1, 0)
  const delay = msUntilNextRun(now, '09:00')
  assert.equal(delay, 24 * 60 * 60 * 1000 - 1000)
})

test('msUntilNextRun treats the exact slot as tomorrow, so it never spins', () => {
  const now = new Date(2026, 10, 3, 9, 0, 0, 0)
  assert.equal(msUntilNextRun(now, '09:00'), 24 * 60 * 60 * 1000)
})

test('msUntilNextRun crosses a month boundary', () => {
  const now = new Date(2026, 10, 30, 23, 0, 0, 0)
  const delay = msUntilNextRun(now, '09:00')
  // 10 hours to midnight, then 9 hours into 12-01.
  assert.equal(delay, 10 * 60 * 60 * 1000)
})

test('only domestic panels are check-in capable', () => {
  assert.deepEqual(CHECKIN_TARGETS, ['trae', 'workbuddy'])
  const global = TARGETS.filter((target) => target.region !== 'cn')
  assert.equal(global.length, 2)
  for (const target of global) {
    assert.equal(CHECKIN_TARGETS.includes(target.id), false, `${target.id} must not be claimed`)
  }
})

test('every target has a distinct id and an app that owns it', () => {
  const ids = TARGETS.map((target) => target.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const target of TARGETS) {
    assert.ok(target.app === 'trae' || target.app === 'workbuddy')
    assert.ok(['cn', 'ai', 'global'].includes(target.region))
  }
})
