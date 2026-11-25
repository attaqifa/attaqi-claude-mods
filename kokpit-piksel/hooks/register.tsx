import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Change, Cmd, Daily, Focus, Game, History, Live, Mood, Prefs, Ui } from '../types'
import { diffText } from './diff'
import { ROOM, scene } from './scene'
import type { Costume, SceneInput } from './scene'
import { bandShot, bandState } from './band'
import { screens } from './screen'
import type { CmdRow, FileRow } from './screen'

const PANE = 'kokpit'
const TITLE = 'Kokpit Claude'
const XP_PER_LEVEL = 500
/** CSS pixels a code-font cell is wide on desktop, rounded down. */
const CELL_PX = 7

// ---------- state ----------

const INITIAL_LIVE: Live = {
  model: '',
  mood: 'idle',
  detail: '',
  stamp: 0,
  isTurnRunning: false,
  startedAt: 0,
  usd: 0,
  hasUnknownPrice: false,
  turnStartUsd: 0,
  lastTurnUsd: 0,
  ctxPercent: null,
  ctxWindow: null,
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  turns: 0,
  reads: [],
}

const live = atom({ plugin: 'kokpit-piksel', key: 'live' } as const, INITIAL_LIVE, { shape: 'live-1' })
const changes = atom({ plugin: 'kokpit-piksel', key: 'changes' } as const, [] as Change[], { shape: 'changes-1' })
const checked = atom({ plugin: 'kokpit-piksel', key: 'checked' } as const, {} as Record<string, number>, { shape: 'checked-1' })
const cmds = atom({ plugin: 'kokpit-piksel', key: 'cmds' } as const, [] as Cmd[], { shape: 'cmds-1' })
const focus = atom({ plugin: 'kokpit-piksel', key: 'focus' } as const, { path: '', mood: 'idle', at: 0, recent: [] } as Focus, { shape: 'focus-1' })
const ui = atom({ plugin: 'kokpit-piksel', key: 'ui' } as const, { open: null } as Ui, { shape: 'ui-3' })
const prefs = atom({ plugin: 'kokpit-piksel', key: 'prefs' } as const, { kurs: 16400 } as Prefs, { shape: 'prefs-2' })
const game = atom({ plugin: 'kokpit-piksel', key: 'game' } as const, { xp: 0, lv: 1 } as Game, { shape: 'game-1' })
const NO_DAY: Daily = { day: '', usd: 0, seen: {} }
const daily = atom({ plugin: 'kokpit-piksel', key: 'daily' } as const, NO_DAY, { shape: 'daily-3' })
const history = atom({ plugin: 'kokpit-piksel', key: 'history' } as const, {} as History, { shape: 'history-1' })

// ---------- words and numbers ----------

const MODELS: Record<Costume, { title: string; accent: string }> = {
  opus: { title: 'Sang Arsitek', accent: '#7F77DD' },
  sonnet: { title: 'Sang Penyair', accent: '#1D9E75' },
  haiku: { title: 'Sang Kilat', accent: '#D4537E' },
  fable: { title: 'Sang Pendongeng', accent: '#EF9F27' },
  claude: { title: 'Sang Asisten', accent: '#D97757' },
}

const MOODS: Record<Mood, { label: string; glyph: string }> = {
  idle: { label: 'Santai', glyph: '○' },
  think: { label: 'Berpikir', glyph: '◐' },
  read: { label: 'Membaca', glyph: '▤' },
  write: { label: 'Menulis', glyph: '✎' },
  run: { label: 'Menjalankan', glyph: '▶' },
  web: { label: 'Browsing', glyph: '◍' },
  err: { label: 'Error', glyph: '✕' },
  done: { label: 'Selesai', glyph: '✓' },
}

export function modelInfo(id: string): { costume: Costume; name: string } {
  const m = /(opus|sonnet|haiku|fable)(?:[-_ ]?(\d{1,2})(?:[-._](\d{1,2}))?)?/i.exec(id)
  const word = m?.[1]
  if (!m || !word) return { costume: 'claude', name: id ? id.replace(/^claude-/, '') : 'Claude' }
  const key = word.toLowerCase() as Costume
  const cap = key.charAt(0).toUpperCase() + key.slice(1)
  return { costume: key, name: m[2] ? `${cap} ${m[2]}${m[3] ? `.${m[3]}` : ''}` : cap }
}

const pad = (n: number) => String(n).padStart(2, '0')
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
export const rupiah = (n: number) => `Rp${thousands(Math.max(0, n))}`
const dollars = (n: number) => `$${n.toFixed(2).replace('.', ',')}`
/** 1.00 → "1", 313.30 → "313,3": decimals only where they say something. */
const decimal = (n: number, places: number) => n.toFixed(places).replace(/\.?0+$/, '').replace('.', ',')
export const short = (n: number) =>
  n >= 1e6 ? `${decimal(n / 1e6, 2)} jt` : n >= 1e3 ? `${decimal(n / 1e3, 1)} rb` : String(n)
const clock = (ms: number) => {
  const d = new Date(ms)
  return `${pad(d.getHours())}.${pad(d.getMinutes())}`
}
const dayKey = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const lines = (c: { from: number | null; to: number | null }) =>
  c.from === null ? '' : c.to !== null && c.to !== c.from ? `baris ${c.from}–${c.to}` : `baris ${c.from}`

// ---------- paths, tags, risks ----------

const slash = (p: string) => p.replace(/\\/g, '/')
const baseName = (p: string) => slash(p).split('/').filter(Boolean).pop() ?? p
let root = ''

function relative(abs: string) {
  const a = slash(abs)
  const r = slash(root).replace(/\/+$/, '')
  if (r && a.toLowerCase().startsWith(`${r.toLowerCase()}/`)) return { path: a.slice(r.length + 1), isOutside: false }
  return { path: a, isOutside: r !== '' }
}

const SENSITIVE = /(^|\/)\.env(\.|$)|\.(pem|key|p12|pfx|keystore)$|(^|\/)id_(rsa|ed25519)|credential|secret/i
const DEPENDENCY = /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?|composer\.(json|lock))$/i
const CONFIG = /(^|\/)(tsconfig[^/]*\.json|[^/]*\.config\.[cm]?[jt]s|\.eslintrc[^/]*|\.prettierrc[^/]*|Dockerfile|docker-compose[^/]*\.ya?ml|\.gitignore|\.npmrc)$|(^|\/)\.github\/.*\.ya?ml$/i

export function tagsFor(path: string, isOutside: boolean, isNew: boolean) {
  const tags: string[] = []
  if (isNew) tags.push('baru')
  if (SENSITIVE.test(path)) tags.push('sensitif')
  if (DEPENDENCY.test(path)) tags.push('dependensi')
  if (CONFIG.test(path)) tags.push('konfigurasi')
  if (isOutside) tags.push('di luar proyek')
  return tags
}

const RISKS: [RegExp, string][] = [
  [/\brm\s+-[a-z]*(rf|fr)\b|\brm\s+-[a-z]*r[a-z]*\s+-[a-z]*f/i, 'hapus paksa'],
  [/\bgit\s+push\b.*(--force\b|\s-f\b)/, 'push paksa'],
  [/\bgit\s+reset\s+--hard\b/, 'reset keras'],
  [/\bgit\s+(clean\s+-[a-z]*f|checkout\s+--\s|restore\s+\.)/, 'buang perubahan'],
  [/\bgit\s+push\b/, 'push ke remote'],
  [/\bRemove-Item\b[^|]*-Recurse|\b(rmdir|rd)\s+\/s\b|\bdel\s+\/[sq]/i, 'hapus folder'],
  [/(curl|wget)[^|]*\|\s*(ba|z)?sh\b|\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|]*\|\s*iex\b/i, 'jalankan skrip unduhan'],
  [/\b(npm|pnpm|yarn|bun)\s+(i|install|add)\b|\bpip3?\s+install\b|\bcargo\s+add\b/i, 'pasang paket'],
  [/\bsudo\b/, 'sudo'],
  [/\bchmod\s+(-R\s+)?777\b/, 'izin terbuka'],
  [/\b(drop\s+(table|database)|truncate\s+table)\b/i, 'hapus database'],
]

export const riskOf = (command: string) => RISKS.find(([re]) => re.test(command))?.[1] ?? null

// ---------- what a tool call looks like ----------

type Args = Record<string, unknown>
const text = (a: Args, k: string) => (typeof a[k] === 'string' ? (a[k] as string) : '')
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const firstLine = (s: string) => s.split('\n')[0] ?? ''

export function describe(tool: string, a: Args): { mood: Mood; detail: string } {
  const file = baseName(text(a, 'file_path') || text(a, 'notebook_path') || text(a, 'path'))
  switch (tool) {
    case 'Read':
      return { mood: 'read', detail: `Membaca ${file}` }
    case 'Grep':
      return { mood: 'read', detail: `Mencari “${cut(text(a, 'pattern'), 28)}”` }
    case 'Glob':
      return { mood: 'read', detail: `Mencari file ${cut(text(a, 'pattern'), 28)}` }
    case 'Edit':
    case 'MultiEdit':
      return { mood: 'write', detail: `Mengedit ${file}` }
    case 'Write':
      return { mood: 'write', detail: `Menulis ${file}` }
    case 'NotebookEdit':
      return { mood: 'write', detail: `Mengedit notebook ${file}` }
    case 'Bash':
    case 'PowerShell':
      return { mood: 'run', detail: `Menjalankan ${cut(firstLine(text(a, 'command')), 44)}` }
    case 'WebFetch': {
      let host = text(a, 'url')
      try {
        host = new URL(host).host
      } catch {
        // keep as given
      }
      return { mood: 'web', detail: `Membuka ${cut(host, 36)}` }
    }
    case 'WebSearch':
      return { mood: 'web', detail: `Mencari di web: ${cut(text(a, 'query'), 32)}` }
    case 'Agent':
    case 'Task':
      return { mood: 'think', detail: `Agen: ${cut(text(a, 'description') || 'tugas', 32)}` }
    default:
      if (/browser|chrome|navigate|fetch/i.test(tool)) return { mood: 'web', detail: `Browsing lewat ${cut(tool.replace(/^mcp__/, ''), 30)}` }
      if (tool.startsWith('mcp__')) return { mood: 'run', detail: `Memakai ${cut(tool.split('__')[1] ?? tool, 30)}` }
      return { mood: 'think', detail: `Memakai ${cut(tool, 30)}` }
  }
}

// ---------- the file tree ----------

export type TreeRow = { kind: 'dir'; label: string; path: string; depth: number } | { kind: 'file'; name: string; path: string; depth: number }

type Folder = { name: string; dirs: Map<string, Folder>; files: string[] }

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })

/**
 * Lays paths out as an explorer does: folders first, then files, each by name;
 * a folder holding one folder and no file shares its row (`src/components`).
 */
export function treeRows(paths: string[]): TreeRow[] {
  const root: Folder = { name: '', dirs: new Map(), files: [] }
  for (const path of new Set(paths)) {
    const parts = path.split('/').filter(Boolean)
    const name = parts.pop()
    if (!name) continue
    let at = root
    for (const part of parts) {
      let next = at.dirs.get(part)
      if (!next) {
        next = { name: part, dirs: new Map(), files: [] }
        at.dirs.set(part, next)
      }
      at = next
    }
    at.files.push(path)
  }
  const rows: TreeRow[] = []
  const walk = (folder: Folder, prefix: string, depth: number) => {
    for (const dir of [...folder.dirs.values()].sort((a, b) => byName(a.name, b.name))) {
      let label = dir.name
      let at = dir
      for (;;) {
        const only = at.files.length === 0 && at.dirs.size === 1 ? [...at.dirs.values()][0] : undefined
        if (!only) break
        label = `${label}/${only.name}`
        at = only
      }
      const path = prefix ? `${prefix}/${label}` : label
      rows.push({ kind: 'dir', label, path, depth })
      walk(at, path, depth + 1)
    }
    for (const path of [...folder.files].sort((a, b) => byName(baseName(a), baseName(b)))) {
      rows.push({ kind: 'file', name: baseName(path), path, depth })
    }
  }
  walk(root, '', 0)
  return rows
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const CMD_TOOLS = new Set(['Bash', 'PowerShell'])

// ---------- small writers ----------

async function setMood($: EngineInterface, mood: Mood, detail: string) {
  const now = await $.clock.now()
  await update($, live, l => ({ ...l, mood, detail, stamp: now }))
  return now
}

/** After ms, move from the mood set at `stamp` to another, unless it changed. */
function later($: EngineInterface, ms: number, stamp: number, mood: Mood, detail: string, onlyIfRunning = false) {
  $.clock.after(ms, () => {
    void (async () => {
      const now = await $.clock.now()
      await update($, live, l =>
        l.stamp !== stamp || (onlyIfRunning && !l.isTurnRunning) ? l : { ...l, mood, detail, stamp: now },
      )
    })()
  })
}

async function addXp($: EngineInterface, n: number) {
  const before = await read($, game)
  const after = await update($, game, g => {
    let xp = g.xp + n
    let lv = g.lv
    while (xp >= XP_PER_LEVEL) {
      xp -= XP_PER_LEVEL
      lv += 1
    }
    return { xp, lv }
  })
  await $.store.set('game', after)
  if (after.lv > before.lv) $.ui.toast(`Kokpit: naik ke Lv ${after.lv}`)
}

const isDaily = (v: unknown): v is Daily =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Daily).day === 'string' &&
  typeof (v as Daily).usd === 'number' &&
  typeof (v as Daily).seen === 'object' &&
  (v as Daily).seen !== null

/**
 * Adds what this session has spent since it was last counted to today's total.
 *
 * The total lives in `$.store`, shared by every session, and is read fresh each
 * time so parallel sessions add to it rather than overwrite it. A session begun
 * before today counts from the moment it is first seen today.
 */
async function syncDaily($: EngineInterface, sessionStartedAt: number, sessionUsd: number) {
  const now = await $.clock.now()
  const today = dayKey(now)
  const key = String(sessionStartedAt)
  const stored = await $.store.get('daily').catch(() => undefined)
  const base = isDaily(stored) && stored.day === today ? stored : { ...NO_DAY, day: today }
  const counted = base.seen[key] ?? (dayKey(sessionStartedAt) === today ? 0 : sessionUsd)
  const next: Daily = {
    day: base.day,
    usd: base.usd + Math.max(0, sessionUsd - counted),
    seen: { ...base.seen, [key]: Math.max(counted, sessionUsd) },
  }
  await $.store.set('daily', next)
  await update($, daily, () => next)

  // The same total goes into the history, read fresh too, keeping 14 days.
  const kept = await $.store.get('history').catch(() => undefined)
  const old: History = isHistory(kept) ? kept : {}
  const hist = Object.fromEntries(
    Object.entries({ ...old, [today]: next.usd })
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, HISTORY_DAYS),
  )
  await $.store.set('history', hist)
  await update($, history, () => hist)
}

const HISTORY_DAYS = 14

const isHistory = (v: unknown): v is History =>
  typeof v === 'object' && v !== null && Object.values(v).every(x => typeof x === 'number')

/** The last `n` days up to `now`, oldest first, with what each cost. */
export function lastDays(h: History, now: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    d.setDate(d.getDate() - (n - 1 - i))
    const key = dayKey(d.getTime())
    return { key, date: d, usd: h[key] ?? 0 }
  })
}

/** Context shares that earn a toast the moment usage crosses them. */
const CTX_WARN = [80, 95]

/** The highest warning share crossed going from `before` to `after`, if any. */
export function ctxCrossed(before: number | null, after: number | null) {
  if (after === null) return null
  const from = before ?? 0
  return [...CTX_WARN].reverse().find(t => from < t && after >= t) ?? null
}

async function refreshUsage($: EngineInterface) {
  const u = await $.session.usage()
  const before = (await read($, live)).ctxPercent
  const after = u.context.percent ?? before
  const crossed = ctxCrossed(before, after)
  if (crossed !== null) {
    $.ui.toast(
      crossed >= 95
        ? `Kokpit: konteks ${after}% hampir habis, jalankan /compact sekarang`
        : `Kokpit: konteks sudah ${after}%, pertimbangkan /compact`,
    )
  }
  await update($, live, l => ({
    ...l,
    // The engine knows when the session began, even one begun before the mod loaded.
    startedAt: u.startedAt > 0 ? u.startedAt : l.startedAt,
    usd: u.cost?.usd ?? l.usd,
    hasUnknownPrice: u.cost?.hasUnknownPrice === true,
    ctxPercent: u.context.percent ?? l.ctxPercent,
    ctxWindow: u.context.window,
  }))
  if (u.cost) await syncDaily($, u.startedAt, u.cost.usd)
}

async function readFile($: EngineInterface, path: string): Promise<{ exists: boolean; text: string | null }> {
  const exists = await $.fs.exists(path).catch(() => true)
  if (!exists) return { exists: false, text: null }
  try {
    return { exists: true, text: await $.fs.read(path) }
  } catch {
    return { exists: true, text: null }
  }
}

/** Values as block bars, ▁ to █; an empty day is a low dot. */
export function sparkline(values: number[]) {
  const top = Math.max(0, ...values)
  const BARS = '▁▂▃▄▅▆▇█'
  return values.map(v => (v <= 0 || top <= 0 ? '·' : BARS[Math.max(0, Math.ceil((v / top) * BARS.length) - 1)])).join('')
}

const span = (ms: number) => {
  const mins = Math.max(0, Math.round(ms / 60000))
  return mins < 60 ? `${mins} mnt` : `${Math.floor(mins / 60)} j ${mins % 60} mnt`
}

/**
 * The changed files with their totals, and the ones still to check in review
 * (explorer) order: a file is checked up to its latest edit.
 */
export function changedFiles(all: Change[], ok: Record<string, number>) {
  const lastAt = new Map<string, number>()
  let added = 0
  let removed = 0
  for (const c of all) {
    lastAt.set(c.path, Math.max(lastAt.get(c.path) ?? 0, c.at))
    added += c.added
    removed += c.removed
  }
  const files = treeRows([...lastAt.keys()]).flatMap(r => (r.kind === 'file' ? [r.path] : []))
  const pending = files.filter(path => (ok[path] ?? 0) < (lastAt.get(path) ?? 0))
  return { files, pending, lastAt, added, removed }
}

/** `/kokpit ringkasan`: the session in a few lines. */
export function summary(s: {
  l: Live
  all: Change[]
  ok: Record<string, number>
  commands: Cmd[]
  kurs: number
  history: History
  now: number
}) {
  const rp = (usd: number) => rupiah(usd * s.kurs)
  const { l } = s
  const f = changedFiles(s.all, s.ok)
  const failed = s.commands.filter(c => c.ok === false).length
  const risky = s.commands.filter(c => c.risk !== null).length
  const tokens = l.tokens.input + l.tokens.output + l.tokens.cacheRead + l.tokens.cacheWrite
  const week = lastDays(s.history, s.now, 7).reduce((n, d) => n + d.usd, 0)
  const today = s.history[dayKey(s.now)] ?? 0
  return [
    `Ringkasan sesi · ${modelInfo(l.model).name}`,
    `Durasi ${span(s.now - (l.startedAt || s.now))} · ${l.turns} turn`,
    `Token ${short(tokens)} · biaya ${rp(l.usd)}`,
    `Hari ini ${rp(today)} · 7 hari ${rp(week)}`,
    f.files.length === 0
      ? 'File: belum ada yang berubah'
      : `File: ${f.files.length} berubah (+${f.added} −${f.removed})${f.pending.length > 0 ? `, ${f.pending.length} belum dicek` : ', semua dicek'}`,
    s.commands.length === 0
      ? 'Perintah: belum ada'
      : `Perintah: ${s.commands.length} dijalankan${failed > 0 ? `, ${failed} gagal` : ''}${risky > 0 ? `, ${risky} berisiko` : ''}`,
    `Estimasi harga API dengan kurs ${rupiah(s.kurs)} per $, bukan tagihan.`,
  ].join('\n')
}

// ---------- the mod ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    root = e.cwd
    await $.command.register({
      name: 'kokpit',
      description: 'Buka panel Kokpit Claude, lihat ringkasan sesi, atau ubah kurs Rupiah',
      argumentHint: '[ringkasan | kurs 16400]',
    })

    const [savedPrefs, savedGame, savedHistory] = await Promise.all([
      $.store.get('prefs'),
      $.store.get('game'),
      $.store.get('history').catch(() => undefined),
    ])
    if (isHistory(savedHistory)) await update($, history, () => savedHistory)
    // An older save may still carry a daily limit beside the rate: only the rate is kept.
    const isPrefs = (v: unknown): v is Prefs => typeof v === 'object' && v !== null && typeof (v as Prefs).kurs === 'number'
    const isGame = (v: unknown): v is Game =>
      typeof v === 'object' && v !== null && typeof (v as Game).xp === 'number' && typeof (v as Game).lv === 'number'
    if (isPrefs(savedPrefs)) await update($, prefs, () => ({ kurs: savedPrefs.kurs }))
    if (isGame(savedGame)) await update($, game, () => savedGame)

    const now = await $.clock.now()
    const model = await $.session.model().catch(() => '')
    await update($, live, l => ({ ...l, startedAt: l.startedAt || now, model: model || l.model }))
    await refreshUsage($).catch(() => undefined)

    if (e.surface === 'desktop') void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'kokpit' }, async ($, e) => {
    // `/kokpit kurs 16400` sets the rate, `/kokpit kurs` says it; anything else opens the pane.
    // A plugin's `$.command.run` may leave `args` out for a bare `/kokpit`.
    const typed: string = typeof e.args === 'string' ? e.args : ''
    const asked = /^kurs\b\s*(.*)$/i.exec(typed.trim())
    if (asked) {
      const p = await read($, prefs)
      const given = asked[1] ?? ''
      if (given === '') return { text: `Kurs sekarang ${rupiah(p.kurs)} per $. Ubah dengan /kokpit kurs 16400.` }
      const n = Number(given.replace(/[^\d]/g, ''))
      if (!Number.isFinite(n) || n < 1000 || n > 100000) {
        return { text: 'Kurs harus antara 1.000 dan 100.000, misalnya /kokpit kurs 16400.' }
      }
      const next = await update($, prefs, () => ({ kurs: n }))
      await $.store.set('prefs', next)
      return { text: `Kurs disimpan: ${rupiah(n)} per $.` }
    }
    if (/^ringkasan\b/i.test(typed.trim())) {
      await refreshUsage($).catch(() => undefined)
      const [l, all, ok, commands, p, h, now] = await Promise.all([
        read($, live),
        read($, changes),
        read($, checked),
        read($, cmds),
        read($, prefs),
        read($, history),
        $.clock.now(),
      ])
      return { text: summary({ l, all, ok, commands, kurs: p.kurs, history: h, now }) }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Panel Kokpit Claude dibuka.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      const l = await read($, live)
      await update($, live, x => ({ ...x, isTurnRunning: true, turnStartUsd: l.usd }))
      await setMood($, 'think', '')
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && e.model) {
      await update($, live, l => (l.model === e.model ? l : { ...l, model: e.model }))
    }
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      await update($, live, l => ({
        ...l,
        model: e.agentId === undefined && u.model ? u.model : l.model,
        tokens: {
          input: l.tokens.input + u.input_tokens,
          output: l.tokens.output + u.output_tokens,
          cacheRead: l.tokens.cacheRead + u.cache_read_input_tokens,
          cacheWrite: l.tokens.cacheWrite + u.cache_creation_input_tokens,
        },
      }))
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    await refreshUsage($).catch(() => undefined)
    const l = await read($, live)
    const cost = Math.max(0, l.usd - l.turnStartUsd)
    await update($, live, x => ({ ...x, isTurnRunning: false, lastTurnUsd: cost, turns: x.turns + 1 }))

    if (e.isAborted) {
      await setMood($, 'idle', 'Dihentikan')
    } else {
      const p = await read($, prefs)
      const secs = Math.max(1, Math.round(e.durationMs / 1000))
      const stamp = await setMood($, 'done', `${secs} dtk · ${rupiah(cost * p.kurs)}`)
      later($, 8000, stamp, 'idle', '')
      await addXp($, 10)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const a = e as unknown as Args
    const tool = e.tool
    const byAgent = e.agentId !== undefined
    const { mood, detail } = describe(tool, a)
    await setMood($, mood, byAgent ? `Agen: ${detail}` : detail)

    const file = text(a, 'file_path') || text(a, 'notebook_path')
    const isEdit = EDIT_TOOLS.has(tool) && file !== ''
    if (file !== '' && (isEdit || tool === 'Read')) {
      // Light the file in the tree the moment the tool starts on it.
      const { path } = relative(file)
      const at = await $.clock.now()
      await update($, focus, f => ({
        path,
        mood,
        at,
        recent: tool === 'Read' ? [path, ...f.recent.filter(p => p !== path)].slice(0, 6) : f.recent,
      }))
    }
    const before = isEdit ? await readFile($, file) : null

    let cmdId: string | null = null
    if (CMD_TOOLS.has(tool)) {
      const command = text(a, 'command')
      cmdId = e.tool_use_id
      const at = await $.clock.now()
      await update($, cmds, list =>
        [{ id: e.tool_use_id, at, text: command, risk: riskOf(command), ok: null, byAgent }, ...list].slice(0, 30),
      )
    }

    const ran = await next(e)
    const isDenied = ran.deny !== undefined
    const hasFailed = isDenied || ran.isError === true

    if (isEdit && before) {
      const after = hasFailed ? null : await readFile($, file)
      let d = diffText(before.text, after?.text ?? null)
      if (!hasFailed && (before.text === null || after?.text === null) && tool === 'Edit') {
        d = { ...diffText(text(a, 'old_string'), text(a, 'new_string')), from: null, to: null }
      }
      if (!hasFailed) {
        const { path, isOutside } = relative(file)
        const at = await $.clock.now()
        const change: Change = {
          id: e.tool_use_id,
          at,
          tool,
          path,
          isOutside,
          added: d.added,
          removed: d.removed,
          from: d.from,
          to: d.to,
          diff: d.diff,
          isTruncated: d.isTruncated,
          isNew: !before.exists,
          tags: tagsFor(path, isOutside, !before.exists),
          byAgent,
          hasFailed: false,
        }
        await update($, changes, list => [change, ...list].slice(0, 60))
        await addXp($, 3)
      }
    }

    if (cmdId !== null) {
      await update($, cmds, list => list.map(c => (c.id === cmdId ? { ...c, ok: !hasFailed } : c)))
    }

    if (tool === 'Read' && file && !hasFailed) {
      const { path } = relative(file)
      await update($, live, l => (l.reads.includes(path) ? l : { ...l, reads: [...l.reads, path].slice(-300) }))
    }

    await addXp($, 2)

    if (hasFailed && !isDenied) {
      const stamp = await setMood($, 'err', `${detail} gagal`)
      later($, 2600, stamp, 'think', '', true)
    } else {
      const l = await read($, live)
      if (l.isTurnRunning) await setMood($, 'think', '')
    }
    return ran
  }).catch(($, e, next) => next(e))

  // After /compact the context is smaller at once, not at the next turn's end.
  on('session.compact', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) await refreshUsage($).catch(() => undefined)
    return r
  })

  // Above the prompt: a thin pixel strip, Claude small with one word, the
  // context meter and the files changed. Surfaces without Svg (the terminal) get nothing.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.surface === 'terminal') return next(e)
    const [l, all] = await Promise.all([read($, live), read($, changes)])
    const f = changedFiles(all, {})
    const info = modelInfo(l.model)
    const state = bandState(l.mood, e.props.isWorking || l.isTurnRunning)
    const shot = bandShot({
      width: Math.round((e.props.bodyColumns > 0 ? e.props.bodyColumns : 60) * CELL_PX),
      costume: info.costume,
      accent: MODELS[info.costume].accent,
      name: info.name,
      state,
      note: state === 'done' ? l.detail : '',
      ctxPercent: l.ctxPercent,
      files: { count: f.files.length, added: f.added, removed: f.removed },
    })
    const { Svg } = $.ui.resolve(e)
    // A plain image: no frame to reload, so a change swaps the picture.
    return <Svg source={shot.source} alt={shot.alt} width={shot.width} height={shot.height} />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const [l, all, ok, commands, fo, view, p, g, d, hist, now] = await Promise.all([
      read($, live),
      read($, changes),
      read($, checked),
      read($, cmds),
      read($, focus),
      read($, ui),
      read($, prefs),
      read($, game),
      read($, daily),
      read($, history),
      $.clock.now(),
    ])
    const info = modelInfo(l.model)
    const meta = MODELS[info.costume]
    const m = MOODS[l.mood]
    const rp = (usd: number) => rupiah(usd * p.kurs)
    const rpShort = (usd: number) => `Rp${short(Math.round(usd * p.kurs))}`
    const todayUsd = d.day === dayKey(now) ? d.usd : 0
    const tokensTotal = l.tokens.input + l.tokens.output + l.tokens.cacheRead + l.tokens.cacheWrite
    // The last seven days, today's bar from the same figure as "Hari ini".
    const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
    const week = lastDays(hist, now, 7).map((x, i, list) => {
      const isToday = i === list.length - 1
      const usd = isToday ? todayUsd : x.usd
      return { usd, isToday, tip: `${DAY_NAMES[x.date.getDay()]} ${x.date.getDate()}/${x.date.getMonth() + 1}: ${rp(usd)}` }
    })
    const weekUsd = week.reduce((n, x) => n + x.usd, 0)

    // Files: newest change first, one entry per file.
    const byFile = new Map<string, Change[]>()
    for (const c of all) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c])
    const files = [...byFile.entries()].flatMap(([path, list]) => {
      const last = list[0]
      if (!last) return []
      return [
        {
          path,
          list,
          last,
          // Checked up to this file's latest edit: a newer edit shows as pending again.
          isChecked: (ok[path] ?? 0) >= last.at,
          isNew: list.some(c => c.isNew),
          tags: [...new Set(list.flatMap(c => c.tags))],
          added: list.reduce((n, c) => n + c.added, 0),
          removed: list.reduce((n, c) => n + c.removed, 0),
        },
      ]
    })
    type FileEntry = (typeof files)[number]
    const byPath = new Map(files.map(f => [f.path, f] as const))
    const pending = files.filter(f => !f.isChecked).length
    const totalAdded = files.reduce((n, f) => n + f.added, 0)
    const totalRemoved = files.reduce((n, f) => n + f.removed, 0)
    // Review goes through the changed files as the explorer lists them, top to bottom.
    const order = treeRows(files.map(f => f.path)).flatMap(r => (r.kind === 'file' ? [r.path] : []))
    const open = view.open === null ? undefined : byPath.get(view.open)

    const room: SceneInput = {
      costume: info.costume,
      mood: l.mood,
      accent: meta.accent,
      hour: new Date(now).getHours(),
      // The wall clock moves in quarter hours, so the room is not redrawn every minute.
      minute: Math.floor(new Date(now).getMinutes() / 15) * 15,
      name: info.name,
      title: meta.title,
      // Only the mood: the tool detail changes every call, and the HUD shows it.
      detail: m.label,
    }
    const statusText = l.detail || m.label
    const ctxText = l.ctxPercent === null ? '–' : `${l.ctxPercent}%${l.ctxWindow ? ` dari ${short(l.ctxWindow)}` : ''}`
    const priceNote =
      `Estimasi harga API, bukan tagihan${l.hasUnknownPrice ? ' (sebagian model tanpa harga)' : ''}.\n` +
      `Kurs ${rupiah(p.kurs)} per $, ubah dengan /kokpit kurs 16400`

    // The explorer: changed files, the file Claude is on, and what it read lately;
    // the reads give way first when the list grows long.
    const MAX_ROWS = 16
    const here = fo.path ? [fo.path] : []
    let tree = treeRows([...files.map(f => f.path), ...fo.recent, ...here])
    if (tree.length > MAX_ROWS) tree = treeRows([...files.map(f => f.path), ...here])
    const shown = tree.slice(0, MAX_ROWS)
    const more = tree.slice(MAX_ROWS).filter(r => r.kind === 'file').length

    const fileTip = (path: string) => {
      const f = byPath.get(path)
      if (!f) return `${path}\n${fo.path === path ? 'Sedang dibaca' : 'Dibaca'}, tanpa perubahan`
      const where = lines(f.last)
      return [
        path,
        `+${f.added} −${f.removed} · ${f.isNew ? 'file baru' : 'diubah'} · ${f.list.length} edit`,
        `Terakhir ${clock(f.last.at)} · ${f.last.tool}${where ? ` · ${where}` : ''}${f.last.byAgent ? ' · agen' : ''}`,
        ...(f.tags.length > 0 ? [f.tags.join(' · ')] : []),
        f.isChecked ? 'Sudah dicek' : 'Belum dicek',
      ].join('\n')
    }

    const fill = (prompt: string) => void $.prompt.fill({ text: prompt })
    const setOpen = (path: string | null) => update($, ui, () => ({ open: path }))
    /** The file after `path` in review order, wrapping round; null when there is none. */
    const after = (path: string, onlyPending: boolean) => {
      const i = order.indexOf(path)
      const rest = [...order.slice(i + 1), ...order.slice(0, Math.max(0, i))]
      return rest.find(x => !onlyPending || byPath.get(x)?.isChecked === false) ?? null
    }

    const art = (width?: number) => {
      if (e.surface === 'terminal') {
        const hat: Record<Costume, string> = { opus: '   ▴▴▴', sonnet: '   ▄██▄', haiku: ' ━━━●━━━', fable: '     ▲', claude: '' }
        return (
          <Box flexDirection="column">
            {hat[info.costume] !== '' && <Text color={meta.accent}>{hat[info.costume]}</Text>}
            <Text color="claude"> ▐▛███▜▌</Text>
            <Text color="claude">▝▜█████▛▘</Text>
            <Text color="claude">  ▘▘ ▝▝</Text>
          </Box>
        )
      }
      const { Svg } = $.ui.resolve(e)
      const alt = `${info.name} ${m.label.toLowerCase()}${l.detail ? `: ${l.detail}` : ''}`
      // Both sizes given: left without a height, the desktop draws the frame short.
      const w = width ?? ROOM.w * 4
      return <Svg source={scene(room)} alt={alt} isInteractive width={w} height={Math.round((w * ROOM.h) / ROOM.w)} />
    }

    if (e.props.placement === 'widget') {
      return (
        <Box flexDirection="column" gap="xs">
          {art(220)}
          <Text weight="semibold" color={meta.accent}>
            {m.glyph} {m.label} · {rp(l.usd)}
          </Text>
          <Text dimColor wrap="truncate-end">
            {fo.path && l.isTurnRunning
              ? `${MOODS[fo.mood].glyph} ${baseName(fo.path)}`
              : `${files.length} file berubah${pending > 0 ? ` · ${pending} belum dicek` : ''}`}
          </Text>
        </Box>
      )
    }

    // Below the screen, the only native parts: reviewing a change needs real
    // buttons and a real diff, which no Svg can give.
    const reviewBar = () => (
      <Box key="review-bar" flexDirection="row" gap="xs" flexWrap="wrap">
        <Button
          key="review"
          label={open ? 'Tutup tinjauan' : pending > 0 ? `Tinjau ${pending} perubahan` : 'Lihat diff'}
          variant={!open && pending > 0 ? 'primary' : 'secondary'}
          onPress={() => setOpen(open ? null : (order.find(x => byPath.get(x)?.isChecked === false) ?? order[0] ?? null))}
        />
        {!open && pending > 1 && (
          <Button
            key="check-all"
            label="Tandai semua dicek"
            onPress={async () => {
              await update($, checked, x => Object.fromEntries([...Object.entries(x), ...files.map(f => [f.path, f.last.at] as const)]))
            }}
          />
        )}
      </Box>
    )

    // Clicks inside the Svg never reach the mod, so each changed file gets a
    // native button here: press to open its review, press again to close it.
    const fileChips = () => (
      <Box key="files" flexDirection="row" gap="xs" flexWrap="wrap">
        {order.map(path => {
          const f = byPath.get(path)
          if (!f) return null
          const isOpen = open?.path === path
          return (
            <Button
              key={`f:${path}`}
              label={`${baseName(path)} +${f.added} −${f.removed}${f.isChecked ? ' ✓' : ''}`}
              variant={isOpen ? 'primary' : 'secondary'}
              onPress={() => setOpen(isOpen ? null : path)}
            />
          )
        })}
      </Box>
    )

    const card = (f: FileEntry) => {
      const warnings = f.tags.filter(t => t !== 'baru')
      return (
        <Box key="card" flexDirection="column" gap="xs">
          <Text weight="semibold" wrap="truncate-start">
            {f.path}
          </Text>
          <Text dimColor tabular wrap="wrap">
            {order.indexOf(f.path) + 1}/{order.length} · <Text color="diffAdded">+{f.added}</Text> <Text color="diffRemoved">−{f.removed}</Text>
            {f.isNew ? ' · file baru' : ''}
            {warnings.length > 0 ? <Text color="warning"> · {warnings.join(' · ')}</Text> : ''}
          </Text>
          {f.list.slice(0, 3).map(c => (
            <Box key={`c:${c.id}`} flexDirection="column">
              <Text size="caption" dimColor>
                {clock(c.at)} · {c.tool}
                {c.byAgent ? ' · agen' : ''}
                {lines(c) ? ` · ${lines(c)}` : ''}
              </Text>
              {c.diff !== '' ? <Code source={c.diff} format="diff" path={c.path} wrap="truncate-end" /> : <Text dimColor>Isi sama</Text>}
              {c.isTruncated && <Text dimColor>… dipotong</Text>}
            </Box>
          ))}
          {f.list.length > 3 && <Text dimColor>+{f.list.length - 3} edit lain</Text>}
          <Box flexDirection="row" gap="xs" flexWrap="wrap">
            <Button
              key="ok"
              label={f.isChecked ? 'Batal dicek' : '✓ Dicek'}
              variant={f.isChecked ? 'secondary' : 'primary'}
              onPress={async () => {
                if (f.isChecked) {
                  await update($, checked, x => ({ ...x, [f.path]: 0 }))
                  return
                }
                await update($, checked, x => ({ ...x, [f.path]: f.last.at }))
                // On to the next file still waiting; the review closes when none is.
                await setOpen(after(f.path, true))
              }}
            />
            <Button
              key="ask"
              label="Tanya"
              onPress={() =>
                fill(
                  `Jelaskan perubahan yang kamu buat di ${f.path}${lines(f.last) ? ` (${lines(f.last)})` : ''}: apa yang diubah, kenapa, dan apa yang perlu saya cek?`,
                )
              }
            />
            {order.length > 1 && <Button key="next" label="Berikutnya" onPress={() => setOpen(after(f.path, false))} />}
          </Box>
        </Box>
      )
    }

    if (e.surface !== 'terminal') {
      // Everything else is one pixel screen; its hover zones carry the full figures.
      const { Svg } = $.ui.resolve(e)
      const rows = shown.map((r): FileRow => {
        if (r.kind === 'dir') return { kind: 'dir', label: r.label, depth: r.depth, isLit: fo.path.startsWith(`${r.path}/`), tip: `${r.path}/` }
        const f = byPath.get(r.path)
        return {
          kind: 'file',
          name: r.name,
          depth: r.depth,
          tone: !f ? 'read' : f.isChecked ? 'ok' : f.isNew ? 'new' : 'mod',
          isActive: fo.path === r.path,
          isReview: open?.path === r.path,
          added: f ? f.added : null,
          removed: f ? f.removed : null,
          isRisky: f?.tags.some(t => t !== 'baru') === true,
          glyph: MOODS[fo.mood].glyph,
          tip: fileTip(r.path),
        }
      })
      const cmdRows = commands.slice(0, 3).map(
        (c): CmdRow => ({
          ok: c.ok,
          text: firstLine(c.text),
          isRisky: c.risk !== null,
          tip: [
            cut(c.text, 300),
            `${clock(c.at)} · ${c.ok === null ? 'berjalan' : c.ok ? 'berhasil' : 'gagal'}${c.byAgent ? ' · agen' : ''}`,
            ...(c.risk ? [`! ${c.risk}`] : []),
          ].join('\n'),
        }),
      )
      // The pane's width comes in code-font cells; about 7 CSS pixels each, kept on
      // the small side so the screen never runs past the pane's edge.
      const paneWidth = Math.max(ROOM.w * 2, Math.round((e.props.bodyColumns > 0 ? e.props.bodyColumns : 48) * CELL_PX))
      const shot = screens({
        width: paneWidth,
        accent: meta.accent,
        room,
        hud: {
          name: info.name,
          lv: g.lv,
          xp: g.xp / XP_PER_LEVEL,
          nameTip: `${info.name} · ${meta.title}\nLv ${g.lv} · XP ${g.xp}/${XP_PER_LEVEL}`,
          glyph: m.glyph,
          status: statusText,
          statusTip: `${m.label}${l.detail ? `: ${l.detail}` : ''}`,
          tone: l.mood === 'err' ? 'bad' : l.mood === 'done' ? 'ok' : 'accent',
          isRunning: l.isTurnRunning,
          ctx: {
            values: [ctxText, l.ctxPercent === null ? '–' : `${l.ctxPercent}%`],
            share: l.ctxPercent === null ? null : l.ctxPercent / 100,
            isHigh: (l.ctxPercent ?? 0) > 80,
            tip: l.ctxPercent === null ? 'Konteks belum diketahui' : `Konteks terpakai ${ctxText} token`,
          },
          stats: [
            {
              label: 'Token',
              values: [short(tokensTotal)],
              tip: `Token sesi ini ${short(tokensTotal)}\ninput ${short(l.tokens.input)} · output ${short(l.tokens.output)} · cache ${short(l.tokens.cacheRead + l.tokens.cacheWrite)}`,
            },
            {
              label: 'Sesi',
              values: [rp(l.usd), rpShort(l.usd)],
              tip: `Sesi ini ${rp(l.usd)} (${dollars(l.usd)})\nTurn terakhir ${rp(l.lastTurnUsd)}\n${priceNote}`,
              isMoney: true,
            },
            {
              label: 'Hari ini',
              values: [rp(todayUsd), rpShort(todayUsd)],
              tip: `Hari ini ${rp(todayUsd)} (${dollars(todayUsd)}), semua sesi\n${priceNote}`,
              isMoney: true,
            },
          ],
          week: {
            bars: week.map(x => ({ value: x.usd, isToday: x.isToday, tip: x.tip })),
            values: [rp(weekUsd), rpShort(weekUsd)],
            tip: `7 hari terakhir ${rp(weekUsd)}, semua sesi\n${priceNote}`,
          },
        },
        files: { rows, added: totalAdded, removed: totalRemoved, hasChanges: files.length > 0, more },
        cmds: cmdRows,
      })

      // The same figures in words, for a screen reader.
      const fileWords =
        files.length === 0
          ? 'Belum ada perubahan.'
          : `${files.length} file berubah, +${totalAdded} −${totalRemoved}, ${pending > 0 ? `${pending} belum dicek` : 'semua dicek'}: ` +
            order
              .slice(0, 8)
              .flatMap(path => {
                const f = byPath.get(path)
                return f ? [`${path} +${f.added} −${f.removed}${f.isChecked ? ' dicek' : ''}`] : []
              })
              .join(', ') +
            (order.length > 8 ? `, dan ${order.length - 8} lagi.` : '.')
      const lastCmd = commands[0]
      const hudAlt =
        `${info.name}, Lv ${g.lv}. ${statusText}. Konteks ${ctxText}. ` +
        `Token ${short(tokensTotal)}, sesi ${rp(l.usd)}, hari ini ${rp(todayUsd)}.`
      const listAlt =
        (fo.path && l.isTurnRunning ? `Sedang dikerjakan: ${fo.path}. ` : '') +
        fileWords +
        (lastCmd
          ? ` Perintah terakhir: ${cut(firstLine(lastCmd.text), 60)}, ${lastCmd.ok === null ? 'berjalan' : lastCmd.ok ? 'berhasil' : 'gagal'}${lastCmd.risk ? `, ${lastCmd.risk}` : ''}.`
          : '')

      // Heights must be given: left out, the desktop draws each frame short and
      // shrinks the picture into it. Each picture's frame reloads, blank for a
      // moment, only when its own markup changes.
      const roomSvg = <Svg source={shot.room.source} alt={`${info.name} ${m.label.toLowerCase()}`} isInteractive height={shot.room.height} />
      const hudSvg = <Svg source={shot.hud.source} alt={hudAlt} isInteractive height={shot.hud.height} />
      const listSvg = <Svg source={shot.list.source} alt={listAlt} isInteractive height={shot.list.height} />
      return (
        <Box flexDirection="column" gap="sm">
          {shot.isWide ? (
            <Box flexDirection="row" gap="sm" alignItems="flex-start">
              <Box flexDirection="column">
                {roomSvg}
                {hudSvg}
              </Box>
              {listSvg}
            </Box>
          ) : (
            <Box flexDirection="column">
              {roomSvg}
              {hudSvg}
              {listSvg}
            </Box>
          )}
          {files.length > 0 && fileChips()}
          {files.length > 0 && reviewBar()}
          {open && card(open)}
        </Box>
      )
    }

    // The terminal draws no Svg: the same panel in words.
    const stat = (label: string, value: string) => (
      <Box flexDirection="column">
        <Text size="caption" dimColor>
          {label}
        </Text>
        <Text weight="semibold" tabular>
          {value}
        </Text>
      </Box>
    )

    const dirRow = (r: Extract<TreeRow, { kind: 'dir' }>) => (
      <Box key={`dir:${r.path}`} paddingLeft={r.depth * 2}>
        <Text dimColor={!fo.path.startsWith(`${r.path}/`)} wrap="truncate-start">
          ▾ {r.label}
        </Text>
      </Box>
    )

    const fileRow = (r: Extract<TreeRow, { kind: 'file' }>) => {
      const f = byPath.get(r.path)
      const isActive = fo.path === r.path
      const isRisky = f?.tags.some(t => t !== 'baru') === true
      const color = isActive || open?.path === r.path ? meta.accent : f && !f.isChecked ? (f.isNew ? 'success' : 'warning') : undefined
      const name = (
        <Text {...(color ? { color } : {})} {...(isActive ? { weight: 'semibold' as const } : {})} dimColor={!f && !isActive}>
          {r.name}
          {isActive && l.isTurnRunning ? ` ${MOODS[fo.mood].glyph}` : ''}
        </Text>
      )
      return (
        <Box key={`line:${r.path}`} flexDirection="row" justifyContent="space-between" gap="sm" paddingLeft={r.depth * 2}>
          {f ? (
            <Button key={`f:${r.path}`} plain onPress={() => setOpen(open?.path === r.path ? null : r.path)}>
              {name}
            </Button>
          ) : (
            name
          )}
          {f && (
            <Text tabular>
              <Text color="diffAdded">+{f.added}</Text> <Text color="diffRemoved">−{f.removed}</Text>
              {isRisky ? <Text color="warning"> ⚠</Text> : ''}
              {f.isChecked ? <Text color="success"> ✓</Text> : ''}
              <Text color={f.isNew ? 'success' : 'warning'} weight="semibold">
                {f.isNew ? ' A' : ' M'}
              </Text>
            </Text>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm">
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text weight="semibold" color={meta.accent}>
            {info.name}
          </Text>
          <Text dimColor tabular>
            Lv {g.lv}
          </Text>
        </Box>
        {art()}
        <Text wrap="truncate-end">
          <Text weight="semibold" color={l.mood === 'err' ? 'error' : meta.accent}>
            {m.glyph} {m.label}
          </Text>
          {l.detail ? <Text dimColor> · {l.detail}</Text> : ''}
        </Text>
        <Box flexDirection="row" justifyContent="space-between" gap="sm">
          {stat('Token', short(tokensTotal))}
          {stat('Konteks', l.ctxPercent === null ? '–' : `${l.ctxPercent}%`)}
          {stat('Sesi', rp(l.usd))}
          {stat('Hari ini', rp(todayUsd))}
        </Box>
        <Text wrap="truncate-end">
          <Text dimColor>7 hari </Text>
          <Text color="warning">{sparkline(week.map(x => x.usd))}</Text>
          <Text dimColor> {rp(weekUsd)}</Text>
        </Text>
        <Text dimColor size="caption" wrap="wrap">
          Estimasi harga API · kurs {rupiah(p.kurs)}/$
        </Text>
        <Box key="tree" flexDirection="column">
          {files.length === 0 ? (
            <Text dimColor>Belum ada perubahan</Text>
          ) : (
            <Text>
              <Text color="diffAdded">+{totalAdded}</Text> <Text color="diffRemoved">−{totalRemoved}</Text> di {files.length} file
              {pending > 0 ? <Text color="warning"> · {pending} belum dicek</Text> : <Text color="success"> · semua dicek</Text>}
            </Text>
          )}
          {shown.map(r => (r.kind === 'dir' ? dirRow(r) : fileRow(r)))}
          {more > 0 && <Text dimColor>+{more} lagi</Text>}
        </Box>
        {commands.length > 0 && (
          <Box flexDirection="column">
            <Text size="caption" dimColor>
              Perintah
            </Text>
            {commands.slice(0, 3).map(c => (
              <Text wrap="truncate-end">
                <Text color={c.ok === false ? 'error' : c.ok ? 'success' : 'suggestion'}>{c.ok === false ? '✕' : c.ok ? '✓' : '…'}</Text>{' '}
                {cut(firstLine(c.text), 80)}
                {c.risk ? <Text color="warning"> [{c.risk}]</Text> : ''}
                {c.byAgent ? <Text dimColor> · agen</Text> : ''}
              </Text>
            ))}
          </Box>
        )}
        {files.length > 0 && reviewBar()}
        {open && card(open)}
      </Box>
    )
  })
}
