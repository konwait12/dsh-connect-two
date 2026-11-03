/**
 * dsh-connect-two — Host half.
 *
 * A companion bundle, not a fork. `dsh-connect-trae` and `dsh-connect-workbuddy`
 * stay installed and keep receiving upstream updates; the Hub only:
 *
 *   1. reads their READ-ONLY routes (`/usage`) to build one merged snapshot, and
 *   2. calls their explicit check-in route (`/checkin`) once per request.
 *
 * Both sibling plugins already implement the check-in as "read status first,
 * claim only when today is unpaid", so a repeated call is a no-op that answers
 * `alreadyCheckedIn: true`. That is what makes a timer safe here: the worst
 * case of a duplicate run is a wasted status read, never a double claim.
 *
 * Everything the Hub writes lives in one JSON file under $DSH_HOME. No package
 * is created there and neither sibling's config is touched.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-connect-two'

/** Same-origin base for the two sibling route families. */
const TRAE_USAGE = '/plugins/dsh-connect-trae/usage'
const TRAE_CHECKIN = '/plugins/dsh-connect-trae/checkin'
const WB_USAGE = '/plugins/dsh-connect-workbuddy/usage'
const WB_CHECKIN = '/plugins/dsh-connect-workbuddy/checkin'

export const HUB_PREFIX = '/plugins/dsh-connect-two'

/** State directory under $DSH_HOME. Exported so tests and docs cannot drift. */
export const STATE_DIR = 'dsh-connect-two'
export const HUB_OVERVIEW_PATH = `${HUB_PREFIX}/overview`
export const HUB_CHECKIN_PATH = `${HUB_PREFIX}/checkin`
export const HUB_CONFIG_PATH = `${HUB_PREFIX}/config`
export const HUB_HISTORY_PATH = `${HUB_PREFIX}/history`

/** Targets the panel can ask about, in card order. */
export const TARGETS = [
  { id: 'trae', app: 'trae', label: 'Trae 国内版', region: 'cn' },
  { id: 'trae-ai', app: 'trae', label: 'Trae 国际版', region: 'ai' },
  { id: 'workbuddy', app: 'workbuddy', label: 'WorkBuddy 国内版', region: 'cn' },
  { id: 'workbuddy-global', app: 'workbuddy', label: 'WorkBuddy 国际版', region: 'global' },
]

/** Targets an automatic run may touch; only the two domestic panels have check-in. */
export const CHECKIN_TARGETS = ['trae', 'workbuddy']

/**
 * Grace period before a catch-up run touches anything.
 *
 * A catch-up fires during Host startup, when the sibling plugins' routes have
 * not finished registering; claiming then answers `fetch failed` for every
 * target. Measured against the observed failure at 16:04 on 2026-11-03, which
 * failed for both siblings within the same second the bundle finished loading.
 */
const CATCH_UP_DELAY_MS = 90_000

const DEFAULTS = {
  autoCheckin: { enabled: false, time: '09:00', catchUp: false },
  targets: ['trae', 'workbuddy'],
}

// ---------------------------------------------------------------------------
// Durable state
// ---------------------------------------------------------------------------

function statePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, STATE_DIR, 'state.json')
}

function normalizeConfig(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const auto = source.autoCheckin !== null && typeof source.autoCheckin === 'object' ? source.autoCheckin : {}
  const time = typeof auto.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(auto.time) ? auto.time : DEFAULTS.autoCheckin.time
  const targets = Array.isArray(source.targets)
    ? source.targets.filter((id) => CHECKIN_TARGETS.includes(id))
    : [...DEFAULTS.targets]
  return {
    autoCheckin: {
      enabled: auto.enabled === true,
      time,
      catchUp: auto.catchUp === true,
    },
    targets: targets.length > 0 ? targets : [...DEFAULTS.targets],
  }
}

async function readState() {
  try {
    const text = await readFile(statePath(), 'utf8')
    const parsed = JSON.parse(text)
    return {
      version: 1,
      config: normalizeConfig(parsed.config),
      history: Array.isArray(parsed.history) ? parsed.history.slice(-200) : [],
      lastRunDay: typeof parsed.lastRunDay === 'string' ? parsed.lastRunDay : undefined,
    }
  } catch {
    return { version: 1, config: normalizeConfig(DEFAULTS), history: [], lastRunDay: undefined }
  }
}

async function writeState(state) {
  const path = statePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ ...state, history: state.history.slice(-200) }, null, 2), 'utf8')
}

// ---------------------------------------------------------------------------
// Sibling route calls
// ---------------------------------------------------------------------------

function originOf(ctx) {
  try {
    return ctx.webServer.getOrigin()
  } catch {
    return 'http://127.0.0.1:3080'
  }
}

async function readJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { error: `unexpected non-JSON answer (HTTP ${response.status})`, raw: text.slice(0, 300) }
  }
}

/** Read one sibling's usage document. Never throws: a failure is a per-row error. */
async function fetchUsage(ctx, target, signal) {
  const base = target.app === 'trae' ? TRAE_USAGE : WB_USAGE
  const url = `${originOf(ctx)}${base}?region=${target.region}`
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal })
    const body = await readJson(response)
    if (!response.ok) return { error: body.error ?? `HTTP ${response.status}` }
    return { body }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Normalise a sibling usage document into one panel row. */
function toRow(target, usage) {
  if (usage.error !== undefined) {
    return { ...target, status: 'error', error: usage.error, checkinSupported: false }
  }
  const body = usage.body ?? {}
  const signedIn = body.status === 'signed-in'
  const credits = body.credits ?? {}
  const checkin = body.checkin ?? {}
  const packCount = Array.isArray(credits.packages) ? credits.packages.length : Array.isArray(credits.accounts) ? credits.accounts.length : 0
  // Sibling contract: `checkin` exists only where the activity is offered.
  const checkinSupported = checkin !== null && typeof checkin === 'object' && Object.keys(checkin).length > 0
  const todayCheckedIn = checkin.todayCheckedIn === true || checkin.checkedIn === true
  return {
    ...target,
    status: signedIn ? 'signed-in' : 'signed-out',
    accountName: body.accountName ?? body.accountId ?? '',
    available: typeof credits.available === 'number' ? credits.available : typeof credits.total === 'number' ? credits.total : null,
    total: typeof credits.total === 'number' ? credits.total : null,
    packCount,
    checkinSupported,
    todayCheckedIn,
    dailyCredit: typeof checkin.dailyCredit === 'number' ? checkin.dailyCredit : typeof checkin.credits === 'number' ? checkin.credits : null,
    streakDays: typeof checkin.streakDays === 'number' ? checkin.streakDays : null,
  }
}

async function buildOverview(ctx, signal) {
  const rows = await Promise.all(TARGETS.map(async (target) => toRow(target, await fetchUsage(ctx, target, signal))))
  return { at: Date.now(), rows }
}

/** Claim one target's daily check-in. Returns a plain result, never throws. */
async function claimOne(ctx, target, signal) {
  const url = `${originOf(ctx)}${target.app === 'trae' ? TRAE_CHECKIN : WB_CHECKIN}?region=${target.region}`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: '{}',
      signal,
    })
    const body = await readJson(response)
    if (!response.ok) {
      return { ok: false, claimed: false, message: body.error ?? `HTTP ${response.status}` }
    }
    const claimed = body.claimed === true
    const already = body.alreadyCheckedIn === true
    const device = body.deviceCheckedIn === true
    const message = claimed
      ? '签到成功'
      : already
        ? '今日已领取'
        : device
          ? '本机今日名额已用'
          : '本次未领取'
    return { ok: true, claimed, alreadyCheckedIn: already, deviceCheckedIn: device, message }
  } catch (error) {
    return { ok: false, claimed: false, message: error instanceof Error ? error.message : String(error) }
  }
}

async function claimMany(ctx, ids, signal) {
  const picked = TARGETS.filter((target) => ids.includes(target.id) && CHECKIN_TARGETS.includes(target.id))
  const results = await Promise.all(
    picked.map(async (target) => ({ id: target.id, label: target.label, ...(await claimOne(ctx, target, signal)) })),
  )
  return results
}

// ---------------------------------------------------------------------------
// Daily schedule
// ---------------------------------------------------------------------------

/** Local-time day key, so "already ran today" follows the user's clock. */
function dayKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Milliseconds from `now` until the next occurrence of `HH:mm` local time. */
export function msUntilNextRun(now, time) {
  const [hours, minutes] = time.split(':').map(Number)
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

/**
 * Install the daily runner. Re-arms itself after every run instead of using a
 * 24h interval, so a machine that slept through the slot still fires on wake.
 */
function startScheduler(ctx, getConfig, runAuto) {
  let handle
  let stopped = false
  let state = { armed: false, nextAt: null, enabled: false, time: null }

  const disarm = () => {
    handle?.()
    handle = undefined
  }

  const arm = () => {
    if (stopped) return
    disarm()
    const config = getConfig()
    const enabled = config.autoCheckin.enabled
    if (!enabled) {
      state = { armed: false, nextAt: null, enabled: false, time: config.autoCheckin.time }
      return
    }
    const delay = msUntilNextRun(new Date(), config.autoCheckin.time)
    state = { armed: true, nextAt: Date.now() + delay, enabled: true, time: config.autoCheckin.time }
    handle = ctx.timer.timeout(() => {
      void runAuto('scheduled')
      arm()
    }, delay)
  }

  // `catchUp` runs a slot that was missed while the Host was down. It is only
  // honest at load time — a config save is not a missed slot.
  //
  // It is delayed rather than immediate: this runs while the Host is still
  // bringing services up, and the sibling plugins' routes are not listening yet,
  // so an immediate claim answers `fetch failed` for every target. Waiting for
  // the deadline to pass, then letting the day-not-burned retry path handle a
  // genuine failure, is what keeps a startup race from costing a real reward.
  const initial = getConfig()
  let catchUpTimer
  if (initial.autoCheckin.enabled && initial.autoCheckin.catchUp) {
    const now = new Date()
    const [hours, minutes] = initial.autoCheckin.time.split(':').map(Number)
    const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
    if (slot.getTime() <= now.getTime()) {
      catchUpTimer = ctx.timer.timeout(() => {
        void runAuto('catch-up')
      }, CATCH_UP_DELAY_MS)
    }
  }
  arm()

  return {
    /** Re-arm after a config change; without this an enabled timer never exists. */
    reload: () => {
      if (stopped) return
      arm()
    },
    /** Live schedule facts, so "enabled" can be checked rather than assumed. */
    status: () => ({ ...state }),
    dispose: () => {
      stopped = true
      catchUpTimer?.()
      disarm()
      state = { armed: false, nextAt: null, enabled: false, time: state.time }
    },
  }
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** Only the local page may drive the Hub; a remote origin is refused. */
function loopbackOrigin(req) {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    const { hostname } = new URL(origin)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
  } catch {
    return false
  }
}

function localHost(req) {
  const host = req.headers.host
  if (host === undefined) return true
  const name = host.split(':')[0]
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' || name === '::1'
}

function trusted(req, res) {
  if (!localHost(req)) {
    json(res, 403, { error: 'host-not-trusted' })
    return false
  }
  if (!loopbackOrigin(req)) {
    json(res, 403, { error: 'origin-not-trusted' })
    return false
  }
  return true
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx, config) {
  const initial = normalizeConfig(config)
  let state = { version: 1, config: initial, history: [], lastRunDay: undefined }
  let loaded = false

  const load = async () => {
    if (loaded) return
    state = await readState()
    loaded = true
  }

  const record = (entry) => {
    state.history.push({ at: Date.now(), ...entry })
    if (state.history.length > 200) state.history = state.history.slice(-200)
  }

  /**
   * One automatic run: check each enabled target at most once per local day.
   *
   * The day is burned only when at least one target gave a real answer. A run
   * where every target failed with a transport error is NOT a finished day —
   * the check-in slot is still open, and marking it done would silently skip
   * today's reward. That exact bug shipped once: a catch-up fired during Host
   * startup, before the Web server was listening, every target answered
   * `fetch failed`, and the day was recorded as done.
   */
  const runAuto = async (trigger) => {
    await load()
    const today = dayKey(new Date())
    if (state.lastRunDay === today) return { skipped: 'already-ran-today' }
    const ids = state.config.targets
    if (ids.length === 0) return { skipped: 'no-targets' }
    const results = await claimMany(ctx, ids, AbortSignal.timeout(60_000))
    const claimed = results.filter((row) => row.claimed).length
    const failed = results.filter((row) => row.ok === false)
    const allFailed = results.length > 0 && failed.length === results.length
    if (!allFailed) state.lastRunDay = today
    record({ trigger, source: 'auto', results, claimed, failed: failed.length, allFailed })
    await writeState(state)
    ctx.logger?.info?.(
      `[dsh-connect-two] ${trigger}: claimed ${claimed}/${results.length}${failed.length > 0 ? `, ${failed.length} failed` : ''}${allFailed ? ' (day not marked, will retry)' : ''}`,
    )
    return { trigger, results, allFailed }
  }

  let scheduler
  // `timer` is a Cordis service: it must be injected before `ctx.timer` can be
  // read, otherwise the whole Host fails to load.
  ctx.inject(['timer'], (timerCtx) => {
    timerCtx.effect(() => {
      let disposed = false
      // Arm only after the stored state is known: the patch `config` is the
      // first-run default, while what the user enabled lives in state.json. Arming
      // on the patch value would silently disarm a saved schedule on every restart.
      void load().then(() => {
        // The load is async: by the time it resolves the fiber may already be
        // disposed, and arming on a disposed context throws.
        if (disposed || scheduler !== undefined) return
        scheduler = startScheduler(timerCtx, () => state.config, runAuto)
      })
      return () => {
        disposed = true
        scheduler?.dispose()
        scheduler = undefined
      }
    }, 'dsh-connect-two: daily scheduler')
  })

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const disposeOverview = webCtx.webServer.register({
        kind: 'exact',
        path: HUB_OVERVIEW_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
          if (!trusted(req, res)) return
          await load()
          try {
            const overview = await buildOverview(webCtx, AbortSignal.timeout(30_000))
            json(res, 200, {
              ...overview,
              config: state.config,
              lastRunDay: state.lastRunDay,
              scheduler: scheduler?.status() ?? { armed: false, nextAt: null, enabled: false, time: null },
              history: state.history.slice(-20),
            })
          } catch (error) {
            json(res, 500, { error: error instanceof Error ? error.message : String(error) })
          }
        },
      })

      const disposeCheckin = webCtx.webServer.register({
        kind: 'exact',
        path: HUB_CHECKIN_PATH,
        handler: async (req, res) => {
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!trusted(req, res)) return
          const body = await readBody(req)
          if (body === null) return json(res, 400, { error: 'body must be JSON' })
          const requested = Array.isArray(body.targets) ? body.targets : CHECKIN_TARGETS
          const ids = requested.filter((id) => CHECKIN_TARGETS.includes(id))
          if (ids.length === 0) return json(res, 400, { error: 'no check-in capable target requested' })
          await load()
          const results = await claimMany(webCtx, ids, AbortSignal.timeout(60_000))
          record({ trigger: 'manual', source: 'manual', results, claimed: results.filter((row) => row.claimed).length, failed: results.filter((row) => row.ok === false).length })
          await writeState(state)
          json(res, 200, { at: Date.now(), results })
        },
      })

      const disposeConfig = webCtx.webServer.register({
        kind: 'exact',
        path: HUB_CONFIG_PATH,
        handler: async (req, res) => {
          if (req.method === 'GET') {
            if (!trusted(req, res)) return
            await load()
            return json(res, 200, { config: state.config })
          }
          if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' })
          if (!trusted(req, res)) return
          const body = await readBody(req)
          if (body === null) return json(res, 400, { error: 'body must be JSON' })
          await load()
          // Merge then re-normalise: the validator is the single source of truth
          // for what a stored config may contain.
          state.config = normalizeConfig({
            ...state.config,
            ...body,
            autoCheckin: { ...state.config.autoCheckin, ...(body.autoCheckin ?? {}) },
          })
          await writeState(state)
          // Saving a schedule without re-arming leaves the timer pointing at the
          // OLD time (or absent after disabling then enabling).
          scheduler?.reload()
          json(res, 200, { config: state.config })
        },
      })

      const disposeHistory = webCtx.webServer.register({
        kind: 'exact',
        path: HUB_HISTORY_PATH,
        handler: async (req, res) => {
          if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
          if (!trusted(req, res)) return
          await load()
          json(res, 200, { history: [...state.history].reverse() })
        },
      })

      return () => {
        disposeOverview()
        disposeCheckin()
        disposeConfig()
        disposeHistory()
      }
    }, 'dsh-connect-two: routes')
  })
}
