/**
 * Runs the Hub Host half against a fake Cordis context and a real HTTP server.
 *
 * Why this exists: a profile-installed bundle is loaded once per Host process,
 * so editing the linked directory does not hot-swap the running module. This
 * harness exercises the CURRENT source — including the scheduler arming and the
 * re-arm-on-save path — without restarting the live Harness.
 *
 * The sibling routes are stubbed here on purpose: the claim wire contract was
 * verified against the live plugins separately (see docs/实测记录.md), and this
 * file is about the Hub's own decisions.
 */

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { HUB_CONFIG_PATH, HUB_CHECKIN_PATH, HUB_OVERVIEW_PATH, STATE_DIR } from '../src/index.js'

/** Minimal Cordis-ish context: effects, inject, timers, webServer, logger. */
function fakeContext(origin) {
  const disposers = []
  const timers = []
  const routes = new Map()
  const effects = []

  const ctx = {
    logger: { info: () => {} },
    effect(fn, _label) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      effects.push(dispose)
      return () => {}
    },
    inject(_services, callback) {
      callback(ctx)
      return () => {}
    },
    timer: {
      timeout(callback, delay) {
        const entry = { callback, delay, cleared: false }
        timers.push(entry)
        return () => { entry.cleared = true }
      },
    },
    webServer: {
      getOrigin: () => origin,
      register(route) {
        routes.set(route.path, route.handler)
        return () => routes.delete(route.path)
      },
    },
  }

  return {
    ctx,
    routes,
    timers,
    liveTimers: () => timers.filter((timer) => !timer.cleared),
    disposeAll: () => { for (const dispose of disposers) dispose?.() },
  }
}

/** Fake response object that records what the handler wrote. */
function fakeResponse() {
  const state = { status: 0, body: '', headers: {} }
  return {
    state,
    writeHead(status, headers) { state.status = status; Object.assign(state.headers, headers) },
    end(body) { state.body = body ?? '' },
  }
}

const TRAE_USAGE = { status: 'signed-in', accountName: 'trae-user', credits: { available: 490.5, total: 1600 }, checkin: { checkedIn: true, didCheckedIn: true, credits: 100, enabled: true } }
const WB_USAGE = { status: 'signed-in', accountName: 'wb-user', credits: { total: 1161.12 }, checkin: { active: true, todayCheckedIn: false, dailyCredit: 100, streakDays: 16 } }

async function scenario(t, handler) {
  const calls = []
  const server = createServer((req, res) => {
    calls.push({ method: req.method, url: req.url })
    const answer = handler(req.url, req.method)
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(answer.payload ?? {}))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const dir = await mkdtemp(join(tmpdir(), 'hub-test-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = dir
  t.after(async () => {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true, force: true })
  })
  return { calls, origin, dir }
}

test('usage reads stay read-only and one bad sibling does not blank the row', async (t) => {
  const { calls, origin } = await scenario(t, (url) => {
    if (url.startsWith('/plugins/dsh-connect-trae/usage')) return { payload: TRAE_USAGE }
    return { status: 500, payload: { error: 'upstream down' } }
  })
  const { apply } = await import('../src/index.js')
  const harness = fakeContext(origin)
  apply(harness.ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 50))

  const res = fakeResponse()
  await harness.routes.get(HUB_OVERVIEW_PATH)({ method: 'GET', headers: {} }, res)
  const body = JSON.parse(res.state.body)

  assert.equal(res.state.status, 200)
  const trae = body.rows.find((row) => row.id === 'trae')
  const wb = body.rows.find((row) => row.id === 'workbuddy')
  assert.equal(trae.status, 'signed-in')
  assert.equal(trae.available, 490.5)
  assert.equal(trae.todayCheckedIn, true)
  assert.equal(wb.status, 'error')
  assert.equal(wb.error, 'upstream down')
  // Nothing in a read path may POST.
  assert.equal(calls.every((call) => call.method === 'GET'), true)
  harness.disposeAll()
})

test('the patch config alone never arms a timer; stored state is the authority', async (t) => {
  // The patch ships `enabled: false`, but a user's saved state may say
  // otherwise. Arming on the patch would either ignore a saved schedule or
  // (worse) re-enable one the user turned off. Only state.json decides.
  const { origin } = await scenario(t, () => ({ payload: TRAE_USAGE }))
  const { apply } = await import('../src/index.js')

  const harness = fakeContext(origin)
  apply(harness.ctx, { autoCheckin: { enabled: true, time: '23:59' } })

  assert.equal(harness.liveTimers().length, 0, 'nothing may arm before the state load resolves')
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(
    harness.liveTimers().length,
    0,
    'an empty state file must win over an enabled patch default',
  )

  const overview = fakeResponse()
  await harness.routes.get(HUB_OVERVIEW_PATH)({ method: 'GET', headers: {} }, overview)
  assert.equal(JSON.parse(overview.state.body).scheduler.enabled, false)
  harness.disposeAll()
})

test('saving an enabled schedule arms a timer, disabling clears it', async (t) => {
  const { origin } = await scenario(t, () => ({ payload: TRAE_USAGE }))
  const { apply } = await import('../src/index.js')

  const harness = fakeContext(origin)
  apply(harness.ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(harness.liveTimers().length, 0)

  const configHandler = harness.routes.get(HUB_CONFIG_PATH)
  const post = (payload) => {
    const req = (async function* () { yield Buffer.from(JSON.stringify(payload)) })()
    req.method = 'POST'
    req.headers = {}
    const res = fakeResponse()
    return configHandler(req, res).then(() => res)
  }

  const enabled = await post({ autoCheckin: { enabled: true, time: '07:15' } })
  assert.equal(enabled.state.status, 200)
  assert.equal(JSON.parse(enabled.state.body).config.autoCheckin.time, '07:15')
  assert.equal(harness.liveTimers().length, 1, 'enabling must arm exactly one timer')

  const armed = harness.liveTimers()[0]
  assert.ok(armed.delay > 0 && armed.delay <= 24 * 60 * 60 * 1000)

  const disabled = await post({ autoCheckin: { enabled: false } })
  assert.equal(JSON.parse(disabled.state.body).config.autoCheckin.enabled, false)
  assert.equal(harness.liveTimers().length, 0, 'disabling must clear the timer')

  const reEnabled = await post({ autoCheckin: { enabled: true, time: '08:20' } })
  assert.equal(JSON.parse(reEnabled.state.body).config.autoCheckin.time, '08:20')
  assert.equal(harness.liveTimers().length, 1)

  const overview = fakeResponse()
  await harness.routes.get(HUB_OVERVIEW_PATH)({ method: 'GET', headers: {} }, overview)
  const scheduler = JSON.parse(overview.state.body).scheduler
  assert.equal(scheduler.enabled, true)
  assert.equal(scheduler.armed, true)
  assert.equal(scheduler.time, '08:20')
  assert.ok(scheduler.nextAt > Date.now())
  harness.disposeAll()
})

test('manual check-in posts only to check-in capable domestic targets', async (t) => {
  const { calls, origin } = await scenario(t, (url) => {
    if (url.startsWith('/plugins/dsh-connect-trae/usage')) return { payload: TRAE_USAGE }
    if (url.startsWith('/plugins/dsh-connect-workbuddy/usage')) return { payload: WB_USAGE }
    if (url.includes('/checkin')) return { payload: { claimed: true, alreadyCheckedIn: false } }
    return { status: 404, payload: {} }
  })
  const { apply } = await import('../src/index.js')
  const harness = fakeContext(origin)
  apply(harness.ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 50))

  const req = (async function* () { yield Buffer.from(JSON.stringify({ targets: ['workbuddy-global', 'trae-ai'] })) })()
  req.method = 'POST'
  req.headers = {}
  const res = fakeResponse()
  await harness.routes.get(HUB_CHECKIN_PATH)(req, res)

  // Global regions have no check-in activity: the request must be refused, and
  // no upstream write may be attempted.
  assert.equal(res.state.status, 400)
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0)

  const req2 = (async function* () { yield Buffer.from(JSON.stringify({ targets: ['trae'] })) })()
  req2.method = 'POST'
  req2.headers = {}
  const res2 = fakeResponse()
  await harness.routes.get(HUB_CHECKIN_PATH)(req2, res2)
  const body = JSON.parse(res2.state.body)
  assert.equal(res2.state.status, 200)
  assert.equal(body.results.length, 1)
  assert.equal(body.results[0].id, 'trae')
  assert.equal(body.results[0].claimed, true)
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  harness.disposeAll()
})

test('a remote origin is refused on both read and write routes', async (t) => {
  const { origin } = await scenario(t, () => ({ payload: TRAE_USAGE }))
  const { apply } = await import('../src/index.js')
  const harness = fakeContext(origin)
  apply(harness.ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 50))

  for (const path of [HUB_OVERVIEW_PATH, HUB_CHECKIN_PATH]) {
    const res = fakeResponse()
    await harness.routes.get(path)(
      { method: path.endsWith('overview') ? 'GET' : 'POST', headers: { origin: 'https://evil.example.com' } },
      res,
    )
    assert.equal(res.state.status, 403, `${path} must refuse a foreign origin`)
  }
  harness.disposeAll()
})

test('an all-failed automatic run does NOT burn the day, so it can retry', async (t) => {
  // Regression for the 2026-11-03 startup race: a catch-up fired before the
  // sibling routes were listening, every target answered `fetch failed`, and the
  // day was marked done — so the real reward for that day was silently skipped.
  const { dir, origin } = await scenario(t, () => ({ status: 500, payload: { error: 'not listening yet' } }))
  const { apply } = await import('../src/index.js')
  const { writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')

  // Seed an enabled schedule with catch-up so a catch-up run is attempted.
  await writeFile(join(dir, STATE_DIR, 'state.json'), JSON.stringify({
    version: 1,
    config: { autoCheckin: { enabled: true, time: '00:01', catchUp: true }, targets: ['trae'] },
    history: [],
  })).catch(async (error) => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(dir, STATE_DIR), { recursive: true })
    await writeFile(join(dir, STATE_DIR, 'state.json'), JSON.stringify({
      version: 1,
      config: { autoCheckin: { enabled: true, time: '00:01', catchUp: true }, targets: ['trae'] },
      history: [],
    }))
    if (error) return
  })

  const harness = fakeContext(origin)
  apply(harness.ctx, {})
  await new Promise((resolve) => setTimeout(resolve, 80))

  // The catch-up is delayed on purpose; run it by invoking the pending timer.
  const catchUp = harness.liveTimers().find((timer) => timer.delay === 90_000)
  assert.ok(catchUp !== undefined, 'a catch-up must be scheduled after the startup grace period')
  assert.equal(catchUp.delay, 90_000, 'catch-up must not run in the same tick as startup')
  await catchUp.callback()
  await new Promise((resolve) => setTimeout(resolve, 120))

  const { readFile } = await import('node:fs/promises')
  const stored = JSON.parse(await readFile(join(dir, STATE_DIR, 'state.json'), 'utf8'))
  // The day must remain open: no day key recorded, so the next slot retries.
  assert.equal(stored.lastRunDay, undefined, 'a fully failed run must not burn the day')
  const last = stored.history.at(-1)
  assert.equal(last.allFailed, true, 'the run must record that every target failed')
  assert.equal(last.failed, 1)
  harness.disposeAll()
})
