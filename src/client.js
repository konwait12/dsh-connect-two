/**
 * dsh-connect-two — Client half.
 *
 * One settings tab that merges what the two provider plugins each show on their
 * own card: every signed-in account's remaining credits and today's check-in
 * state, the daily sign-in buttons, and the automatic check-in schedule.
 *
 * Plain JavaScript through the Web module table: no bundler, no Client package
 * import. Styling uses only `--dsw-alias-*` theme tokens so light/dark follows
 * the host.
 */
window.__ModuleLoader__.load({
  id: 'dsh-connect-two',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useMemo, useState } = React
    const h = React.createElement

    const NS = 'settings.connectHub'
    const OVERVIEW = '/plugins/dsh-connect-two/overview'
    const CHECKIN = '/plugins/dsh-connect-two/checkin'
    const CONFIG = '/plugins/dsh-connect-two/config'

    const zh = {
      'tab.label': '签到与积分',
      'title': '统一面板',
      'subtitle': 'Trae 与 WorkBuddy 的积分和每日签到集中在这里。两个模型插件仍独立工作，本面板只负责汇总与签到。',
      'refresh': '刷新',
      'refreshing': '刷新中…',
      'checkinAll': '全部签到',
      'checkinOne': '签到',
      'checking': '签到中…',
      'todayChecked': '今日已签',
      'notChecked': '今日未签',
      'noCheckin': '该区域无签到活动',
      'signedOut': '未登录',
      'error': '读取失败',
      'credits': '可用积分',
      'total': '总额度',
      'streak': '连续 {n} 天',
      'daily': '每日 +{n}',
      'account': '账号',
      'autoTitle': '每日自动签到',
      'autoDesc': '开启后，每天到点自动为选中的应用签到。默认关闭；关闭时只在你点「签到」时执行。',
      'autoEnable': '启用自动签到',
      'autoTime': '执行时间',
      'autoCatchUp': '错过了也补签',
      'autoCatchUpDesc': '开启后，如果到点时 Harness 没在运行，下次启动会补执行一次。',
      'targets': '自动签到覆盖',
      'history': '签到记录',
      'historyEmpty': '还没有签到记录。',
      'manual': '手动',
      'scheduled': '定时',
      'catchUp': '补签',
      'claimed': '成功',
      'already': '已领过',
      'device': '本机已用',
      'failed': '失败',
      'saved': '已保存',
      'saveFailed': '保存失败',
      'lastRun': '上次自动执行',
      'never': '尚未执行',
      'note.domesticOnly': '签到只有国内版提供：Trae 国际版、WorkBuddy 国际版没有签到活动，故不显示按钮。',
      'note.enterprise': 'WorkBuddy 企业版 / 教育版席位的写接口会被上游拒绝，这类账号不做签到。',
    }
    const en = {
      'tab.label': 'Check-in & Credits',
      'title': 'Unified panel',
      'subtitle': 'Trae and WorkBuddy credits and daily check-in in one place. Both provider plugins keep working on their own; this panel only aggregates and claims.',
      'refresh': 'Refresh',
      'refreshing': 'Refreshing…',
      'checkinAll': 'Check in all',
      'checkinOne': 'Check in',
      'checking': 'Checking in…',
      'todayChecked': 'Checked in today',
      'notChecked': 'Not yet today',
      'noCheckin': 'No check-in in this region',
      'signedOut': 'Not signed in',
      'error': 'Read failed',
      'credits': 'Available credits',
      'total': 'Total',
      'streak': '{n} day streak',
      'daily': '+{n} daily',
      'account': 'Account',
      'autoTitle': 'Daily auto check-in',
      'autoDesc': 'When on, the selected apps are checked in automatically once a day at the chosen time. Off by default; when off, only your button press claims.',
      'autoEnable': 'Enable auto check-in',
      'autoTime': 'Run at',
      'autoCatchUp': 'Catch up missed runs',
      'autoCatchUpDesc': 'When on, a slot missed while Harness was not running executes on the next start.',
      'targets': 'Covered by auto',
      'history': 'Check-in log',
      'historyEmpty': 'No check-in recorded yet.',
      'manual': 'manual',
      'scheduled': 'scheduled',
      'catchUp': 'catch-up',
      'claimed': 'claimed',
      'already': 'already',
      'device': 'device used',
      'failed': 'failed',
      'saved': 'Saved',
      'saveFailed': 'Save failed',
      'lastRun': 'Last auto run',
      'never': 'never',
      'note.domesticOnly': 'Check-in exists on the domestic side only: Trae Global and WorkBuddy Global have no check-in activity, so no button is shown.',
      'note.enterprise': 'WorkBuddy enterprise / education seats are refused by the upstream write API, so those accounts are skipped.',
    }

    const T = {
      '--dsw-alias-bg-layer-1': 'var(--dsw-alias-bg-layer-1)',
    }

    const styles = {
      wrap: {
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        padding: '4px 2px 32px',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
      },
      head: { display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
      titleBox: { flex: '1 1 320px', minWidth: 0 },
      title: { margin: 0, fontSize: 16, fontWeight: 600 },
      subtitle: { margin: '6px 0 0', color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6, fontSize: 12 },
      actions: { display: 'flex', gap: 8, alignItems: 'center' },
      btn: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        cursor: 'pointer',
        lineHeight: 1.4,
      },
      btnPrimary: {
        appearance: 'none',
        border: '1px solid transparent',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        cursor: 'pointer',
        lineHeight: 1.4,
        fontWeight: 500,
      },
      btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
      group: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1)',
        overflow: 'hidden',
      },
      groupHead: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      dot: { width: 8, height: 8, borderRadius: 999, flex: '0 0 auto' },
      appName: { fontWeight: 600, fontSize: 13 },
      appMeta: { color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      row: {
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, 1.2fr) minmax(120px, 1fr) minmax(110px, 0.9fr) minmax(150px, auto)',
        gap: 12,
        alignItems: 'center',
        padding: '12px 14px',
        borderTop: '1px solid var(--dsw-alias-border-l1)',
      },
      rowFirst: { borderTop: 'none' },
      cellLabel: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, marginBottom: 3 },
      cellValue: { fontSize: 13 },
      mono: { fontVariantNumeric: 'tabular-nums' },
      badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      section: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1)',
        padding: '14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      },
      field: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      fieldLabel: { minWidth: 96, color: 'var(--dsw-alias-label-secondary)', fontSize: 12 },
      input: {
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        borderRadius: 8,
        padding: '5px 9px',
        fontSize: 12,
        fontFamily: 'inherit',
      },
      hint: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, lineHeight: 1.6, margin: 0 },
      hist: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        maxHeight: 220,
        overflowY: 'auto',
      },
      histRow: {
        display: 'flex',
        gap: 10,
        alignItems: 'baseline',
        fontSize: 12,
        padding: '6px 8px',
        borderRadius: 8,
        background: 'var(--dsw-alias-bg-layer-2)',
      },
      histTime: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11, flex: '0 0 auto', fontVariantNumeric: 'tabular-nums' },
      banner: {
        border: '1px solid var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-state-error-primary)',
        borderRadius: 8,
        padding: '8px 10px',
        fontSize: 12,
      },
    }

    function Switch({ checked, onChange, label, ariaLabel }) {
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': ariaLabel ?? label,
          onClick: () => onChange(!checked),
          style: {
            ...styles.btn,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            paddingRight: 10,
          },
        },
        h('span', {
          'aria-hidden': true,
          style: {
            width: 30,
            height: 17,
            borderRadius: 999,
            background: checked ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-state-idle-primary)',
            position: 'relative',
            transition: 'background 120ms',
            flex: '0 0 auto',
          },
        }, h('span', {
          style: {
            position: 'absolute',
            top: 2,
            left: checked ? 15 : 2,
            width: 13,
            height: 13,
            borderRadius: 999,
            background: '#fff',
            transition: 'left 120ms',
          },
        })),
        label ? h('span', null, label) : null,
      )
    }

    function formatNumber(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    }

    function formatTime(ms) {
      if (typeof ms !== 'number') return ''
      const d = new Date(ms)
      const pad = (n) => String(n).padStart(2, '0')
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const statusColor = {
      checked: 'var(--dsw-alias-state-success-primary)',
      unchecked: 'var(--dsw-alias-state-warn-primary)',
      none: 'var(--dsw-alias-state-idle-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      signedOut: 'var(--dsw-alias-state-idle-primary)',
    }

    function ResultLine({ t, result }) {
      const tone = result.ok === false ? statusColor.error : result.claimed ? statusColor.checked : statusColor.none
      const kind = result.ok === false
        ? t('failed')
        : result.claimed
          ? t('claimed')
          : result.alreadyCheckedIn
            ? t('already')
            : result.deviceCheckedIn
              ? t('device')
              : ''
      return h('div', { style: styles.histRow },
        h('span', { style: styles.histTime }, result.label ?? result.id ?? ''),
        h('span', { style: { color: tone } }, kind),
        result.message ? h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, result.message) : null,
      )
    }

    function HubPanel({ t }) {
      const [overview, setOverview] = useState(null)
      const [config, setConfig] = useState(null)
      const [loading, setLoading] = useState(true)
      const [busy, setBusy] = useState({})
      const [error, setError] = useState('')
      const [toast, setToast] = useState('')
      const [results, setResults] = useState([])

      const load = useCallback(async () => {
        setError('')
        try {
          const response = await fetch(OVERVIEW, { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
          setOverview(body)
          if (body.config !== undefined) setConfig(body.config)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setLoading(false)
        }
      }, [])

      useEffect(() => {
        void load()
      }, [load])

      useEffect(() => {
        if (!toast) return undefined
        const id = setTimeout(() => setToast(''), 2200)
        return () => clearTimeout(id)
      }, [toast])

      const saveConfig = useCallback(async (patch) => {
        const previous = config
        const next = { ...(config ?? {}), ...patch }
        setConfig(next)
        try {
          const response = await fetch(CONFIG, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(patch),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
          setConfig(body.config)
          setToast(t('saved'))
        } catch (err) {
          setConfig(previous)
          setToast(`${t('saveFailed')}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }, [config, t])

      const claim = useCallback(async (targets) => {
        setBusy((prev) => {
          const next = { ...prev }
          for (const id of targets) next[id] = true
          return next
        })
        try {
          const response = await fetch(CHECKIN, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ targets }),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
          setResults(body.results ?? [])
          await load()
        } catch (err) {
          setToast(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy((prev) => {
            const next = { ...prev }
            for (const id of targets) delete next[id]
            return next
          })
        }
      }, [load])

      const rows = overview?.rows ?? []
      const groups = useMemo(() => {
        const map = new Map()
        for (const row of rows) {
          if (!map.has(row.app)) map.set(row.app, [])
          map.get(row.app).push(row)
        }
        return [...map.entries()]
      }, [rows])

      const claimable = rows.filter((row) => row.checkinSupported && row.status === 'signed-in' && !row.todayCheckedIn)
      const autoCheckin = config?.autoCheckin ?? { enabled: false, time: '09:00', catchUp: false }
      const enabledTargets = config?.targets ?? ['trae', 'workbuddy']
      const history = overview?.history ?? []

      return h('div', { style: styles.wrap },
        h('div', { style: styles.head },
          h('div', { style: styles.titleBox },
            h('h2', { style: styles.title }, t('title')),
            h('p', { style: styles.subtitle }, t('subtitle')),
          ),
          h('div', { style: styles.actions },
            h('button', {
              type: 'button',
              style: { ...styles.btn, ...(loading ? styles.btnDisabled : {}) },
              disabled: loading,
              onClick: () => { setLoading(true); void load() },
            }, loading ? t('refreshing') : t('refresh')),
            h('button', {
              type: 'button',
              style: { ...styles.btnPrimary, ...(claimable.length === 0 ? styles.btnDisabled : {}) },
              disabled: claimable.length === 0,
              onClick: () => void claim(claimable.map((row) => row.id)),
            }, t('checkinAll')),
          ),
        ),

        error ? h('div', { style: styles.banner }, `${t('error')}: ${error}`) : null,
        toast ? h('div', { style: { ...styles.badge, alignSelf: 'flex-start' } }, toast) : null,

        groups.length === 0 && !loading && !error
          ? h('div', { style: styles.section }, h('p', { style: styles.hint }, t('signedOut')))
          : null,

        groups.map(([app, appRows]) => h('div', { key: app, style: styles.group },
          h('div', { style: styles.groupHead },
            h('span', { style: { ...styles.dot, background: app === 'trae' ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-state-success-primary)' } }),
            h('span', { style: styles.appName }, app === 'trae' ? 'Trae' : 'WorkBuddy'),
            h('span', { style: styles.appMeta }, `${appRows.filter((row) => row.status === 'signed-in').length}/${appRows.length}`),
          ),
          appRows.map((row, index) => {
            const checked = row.todayCheckedIn
            const tone = row.status === 'error'
              ? statusColor.error
              : row.status === 'signed-out'
                ? statusColor.signedOut
                : !row.checkinSupported
                  ? statusColor.none
                  : checked
                    ? statusColor.checked
                    : statusColor.unchecked
            const canClaim = row.checkinSupported && row.status === 'signed-in' && !checked
            return h('div', { key: row.id, style: { ...styles.row, ...(index === 0 ? styles.rowFirst : {}) } },
              h('div', null,
                h('div', { style: styles.cellLabel }, row.label),
                h('div', { style: styles.cellValue }, row.status === 'signed-in' ? (row.accountName || '—') : t('signedOut')),
              ),
              h('div', null,
                h('div', { style: styles.cellLabel }, t('credits')),
                h('div', { style: { ...styles.cellValue, ...styles.mono } },
                  row.status === 'error' ? '—' : formatNumber(row.available),
                  row.total !== null && row.total !== undefined
                    ? h('span', { style: { color: 'var(--dsw-alias-label-secondary)', fontSize: 11 } }, ` / ${formatNumber(row.total)}`)
                    : null,
                ),
              ),
              h('div', null,
                h('div', { style: styles.cellLabel }, replaceBraces(t('streak'), { n: row.streakDays ?? 0 })),
                h('div', { style: { ...styles.badge, color: tone, borderColor: tone } },
                  row.status === 'error'
                    ? t('error')
                    : !row.checkinSupported
                      ? t('noCheckin')
                      : checked
                        ? t('todayChecked')
                        : t('notChecked'),
                ),
              ),
              h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
                row.dailyCredit !== null && row.dailyCredit !== undefined && row.checkinSupported
                  ? h('span', { style: { ...styles.badge, color: 'var(--dsw-alias-label-secondary)' } }, replaceBraces(t('daily'), { n: row.dailyCredit }))
                  : null,
                h('button', {
                  type: 'button',
                  style: { ...styles.btn, ...(!canClaim || busy[row.id] ? styles.btnDisabled : {}) },
                  disabled: !canClaim || busy[row.id] === true,
                  onClick: () => void claim([row.id]),
                }, busy[row.id] ? t('checking') : checked ? t('todayChecked') : t('checkinOne')),
              ),
            )
          }),
        )),

        results.length > 0
          ? h('div', { style: styles.section },
            h('div', { style: { fontWeight: 600, fontSize: 13 } }, t('history')),
            h('div', { style: styles.hist }, results.map((result, index) => h(ResultLine, { key: `${result.id ?? index}-${index}`, t, result }))),
          )
          : null,

        h('div', { style: styles.section },
          h('div', { style: { fontWeight: 600, fontSize: 13 } }, t('autoTitle')),
          h('p', { style: styles.hint }, t('autoDesc')),
          h('div', { style: styles.field },
            h('span', { style: styles.fieldLabel }, t('autoEnable')),
            h(Switch, {
              checked: autoCheckin.enabled === true,
              ariaLabel: t('autoEnable'),
              onChange: (next) => void saveConfig({ autoCheckin: { enabled: next } }),
            }),
          ),
          h('div', { style: styles.field },
            h('label', { style: styles.fieldLabel, htmlFor: 'dsh-hub-time' }, t('autoTime')),
            h('input', {
              id: 'dsh-hub-time',
              type: 'time',
              value: autoCheckin.time ?? '09:00',
              style: styles.input,
              disabled: autoCheckin.enabled !== true,
              onChange: (event) => void saveConfig({ autoCheckin: { time: event.target.value } }),
            }),
          ),
          h('div', { style: styles.field },
            h('span', { style: styles.fieldLabel }, t('autoCatchUp')),
            h(Switch, {
              checked: autoCheckin.catchUp === true,
              ariaLabel: t('autoCatchUp'),
              onChange: (next) => void saveConfig({ autoCheckin: { catchUp: next } }),
            }),
            h('span', { style: styles.hint }, t('autoCatchUpDesc')),
          ),
          h('div', { style: styles.field },
            h('span', { style: styles.fieldLabel }, t('targets')),
            ['trae', 'workbuddy'].map((id) => h(Switch, {
              key: id,
              label: id === 'trae' ? 'Trae' : 'WorkBuddy',
              checked: enabledTargets.includes(id),
              ariaLabel: `${t('targets')}: ${id}`,
              onChange: (next) => {
                const set = new Set(enabledTargets)
                if (next) set.add(id)
                else set.delete(id)
                const list = ['trae', 'workbuddy'].filter((value) => set.has(value))
                if (list.length === 0) return
                void saveConfig({ targets: list })
              },
            })),
          ),
          h('p', { style: styles.hint },
            `${t('lastRun')}: ${overview?.lastRunDay ? overview.lastRunDay : t('never')}`),
        ),

        history.length > 0
          ? h('div', { style: styles.section },
            h('div', { style: { fontWeight: 600, fontSize: 13 } }, t('history')),
            h('div', { style: styles.hist },
              history.map((entry, index) => h('div', { key: `${entry.at}-${index}`, style: styles.histRow },
                h('span', { style: styles.histTime }, formatTime(entry.at)),
                h('span', { style: styles.badge },
                  entry.source === 'auto' ? (entry.trigger === 'catch-up' ? t('catchUp') : t('scheduled')) : t('manual')),
                h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } },
                  (entry.results ?? []).map((row) => `${row.label ?? row.id}: ${row.claimed ? t('claimed') : row.ok === false ? t('failed') : t('already')}`).join(' · ')),
              )),
            ),
          )
          : null,

        h('p', { style: styles.hint }, t('note.domesticOnly')),
        h('p', { style: styles.hint }, t('note.enterprise')),
      )
    }

    function replaceBraces(template, values) {
      return String(template).replace(/\{(\w+)\}/g, (whole, key) => (values[key] !== undefined ? String(values[key]) : whole))
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-connect-two: locale')
        const t = ctx.locale.bind(NS)
        const translate = (key) => {
          const value = t(key)
          return typeof value === 'string' && value !== key ? value : (zh[key] ?? key)
        }

        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'dsh-connect-two',
          order: 20,
          label: () => translate('tab.label'),
        }, () => h(HubPanel, { t: translate })))
      },
    }
  },
})
