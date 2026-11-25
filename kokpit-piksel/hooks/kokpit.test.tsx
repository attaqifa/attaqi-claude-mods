import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Mood } from '../types'
import { bandShot, bandState } from './band'
import { diffText } from './diff'
import { fit, fitMiddle, measure, normalize, textPath } from './pixfont'
import { ctxCrossed, describe as describeTool, modelInfo, riskOf, rupiah, short, sparkline, tagsFor, treeRows } from './register'
import { scene } from './scene'
import type { Costume } from './scene'
import { SVG_LIMIT, screens } from './screen'
import type { Stat } from './screen'
import type { FileRow } from './screen'

const PANE = {
  plugin: 'kokpit-piksel',
  component: 'Pane',
  requestId: 'kokpit',
  props: {
    title: 'Kokpit Claude',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const NOW = new Date(2026, 10, 25, 14, 30).getTime()
const FILE = '/proj/src/app.ts'
const BEFORE = ['const a = 1', 'const b = 2', 'const c = 3', 'export { a, b, c }'].join('\n')
const AFTER = ['const a = 1', 'const b = 20', 'const d = 4', 'const c = 3', 'export { a, b, c, d }'].join('\n')

/** The engine beneath the mod: a tiny disk, a session that costs $0.25, a fake clock. */
function engine(on: On) {
  // The kit may hand paths over resolved (a drive letter, backslashes on Windows).
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  const disk = new Map<string, string>([[norm(FILE), BEFORE]])
  const seen: string[] = []
  const filled: string[] = []
  const toasts: string[] = []
  const store = new Map<string, unknown>()
  const ctx = { percent: 12 }
  mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'kokpit' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? ''))
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: NOW - 60_000, context: { tokens: 24000, window: 1_000_000, percent: ctx.percent }, rateLimits: [], cost: { usd: 0.25 } },
  }))
  on('fs.exists', (_, e) => {
    seen.push(e.path)
    return { value: disk.has(norm(e.path)) }
  })
  on('fs.read', (_, e) => ({ value: disk.get(norm(e.path)) ?? '' }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true }
  })
  on('tool.call', (_, e) => {
    if (e.tool === 'Edit') disk.set(norm(FILE), AFTER)
    if (e.tool === 'Write') disk.set(norm(e.file_path), e.content)
    return { result: {} }
  })
  return { disk, seen, filled, toasts, store, ctx }
}

/** `/kokpit <args>` as the person types it at the prompt. */
const typed = (args: string) => ({
  command: 'kokpit',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 80 },
})

/** The pixel screen on desktop: its markup and the words it says to a screen reader. */
async function pixelScreen(ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props: Record<string, unknown> }[]> }) {
  // Room, HUD and list are three Svgs; together they are the screen.
  const all = (await ui.findAll({ type: 'Svg' })).filter(s => String(s.props.source).includes('viewBox="0 0 170 '))
  return {
    source: all.map(s => String(s.props.source)).join(''),
    alt: all.map(s => String(s.props.alt)).join(' '),
    height: all.reduce((n, s) => n + Number(s.props.height ?? 0), 0),
  }
}

test('an edit lands on the pixel screen and reviews below it, on desktop and terminal', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'const b = 2\nconst c = 3', new_string: 'const b = 20\nconst d = 4\nconst c = 3' })
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })

  // Desktop: one Svg draws the name, figures, files and commands; nothing of it is native.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const shot = await pixelScreen(ui)
  expect(shot.alt).toContain('Opus 5.5, Lv 1.')
  expect(shot.alt).toContain('Konteks 12% dari 1 jt')
  expect(shot.alt, `fs.exists saw ${world.seen.join(', ')}`).toContain('src/app.ts +3 −2')
  expect(shot.alt).toContain('1 belum dicek')
  expect(shot.alt).toContain('git push --force origin main, berhasil, push paksa')
  expect(shot.source).toContain('<title>src/app.ts\n+3 −2 · diubah')
  expect(shot.source).not.toContain('<script')
  // Given outright: left out, the desktop draws the frame about 150 pixels tall.
  expect(shot.height).toBeGreaterThan(300)
  expect(await ui.find({ type: 'Text', text: /^Opus 5\.5$/ })).toBeUndefined()
  // Each changed file is a native button under the screen: press opens, press again closes.
  expect((await ui.find({ type: 'Button', key: 'f:src/app.ts' }))?.props.label).toBe('app.ts +3 −2')
  await ui.press({ key: 'f:src/app.ts' })
  expect((await ui.find({ type: 'Code' }))?.text).toContain('+const d = 4')
  expect((await ui.find({ type: 'Button', key: 'f:src/app.ts' }))?.props.variant).toBe('primary')
  await ui.press({ key: 'f:src/app.ts' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Progress' })).toBeUndefined()

  // Below it, the only native part: the review.
  expect((await ui.find({ type: 'Button', key: 'review' }))?.props.label).toBe('Tinjau 1 perubahan')
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  await ui.press({ key: 'review' })
  expect((await ui.find({ type: 'Text', text: /^src\/app\.ts$/ }))?.text).toBe('src/app.ts')
  expect((await ui.find({ type: 'Text', text: /baris 2–5/ }))?.text).toContain('Edit')
  const code = await ui.find({ type: 'Code' })
  expect(code?.text).toContain('-const b = 2')
  expect(code?.text).toContain('+const d = 4')
  // The file under review is outlined on the screen too.
  expect((await pixelScreen(ui)).source).toContain('fill="none" stroke="#7F77DD"')

  await ui.press({ key: 'ask' })
  expect(world.filled.at(-1)).toContain('src/app.ts')

  // Checking the last pending file closes the review.
  await ui.press({ key: 'ok' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'review' }))?.props.label).toBe('Lihat diff')
  expect((await pixelScreen(ui)).alt).toContain('semua dicek')
  expect((await pixelScreen(ui)).alt).toContain('src/app.ts +3 −2 dicek')

  // And it can be undone: the next surface starts unchecked again.
  await ui.press({ key: 'review' })
  expect((await ui.find({ type: 'Button', key: 'ok' }))?.props.label).toBe('Batal dicek')
  await ui.press({ key: 'ok' })
  expect((await ui.find({ type: 'Button', key: 'ok' }))?.props.label).toBe('✓ Dicek')
  await ui.press({ key: 'review' })
  await ui.unmount()

  // Terminal: no Svg there, so the same panel in words, each file a row to open.
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Svg' })).toBeUndefined()
  expect((await term.find({ type: 'Text', text: /^Opus 5\.5$/ }))?.text).toBe('Opus 5.5')
  expect((await term.find({ type: 'Text', text: /▾ src/ }))?.text).toBe('▾ src')
  expect((await term.find({ type: 'Button', key: 'f:src/app.ts' }))?.text).toBe('app.ts')
  expect((await term.find({ type: 'Text', text: /^\+3 −2 [MA]$/ }))?.text).toBe('+3 −2 M')
  const cmd = await term.find({ type: 'Text', text: /git push --force.*push paksa/ })
  expect(cmd?.text).toContain('✓')
  await term.press({ key: 'f:src/app.ts' })
  expect((await term.find({ type: 'Code' }))?.text).toContain('+const d = 4')
  await term.press({ key: 'ok' })
  expect(await term.find({ type: 'Code' })).toBeUndefined()
  expect((await term.find({ type: 'Text', text: /^\+3 −2 ✓ M$/ }))?.text).toBe('+3 −2 ✓ M')
  await term.unmount()
})

test('review walks the changed files in explorer order', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Write', file_path: '/proj/src/new.ts', content: 'export const n = 1\nexport const m = 2\n' })
  await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'const b = 2', new_string: 'const b = 20' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Button', key: 'review' }))?.props.label).toBe('Tinjau 2 perubahan')
  expect(await ui.find({ type: 'Button', key: 'check-all' })).toBeDefined()

  // By name, as the explorer lists them, whatever order they were edited in.
  await ui.press({ key: 'review' })
  expect((await ui.find({ type: 'Text', text: /^src\/app\.ts$/ }))?.text).toBe('src/app.ts')
  expect((await ui.find({ type: 'Text', text: /^1\/2 · / }))?.text).toBe('1/2 · +3 −2')
  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Text', text: /^2\/2 · / }))?.text).toBe('2/2 · +2 −0 · file baru')

  // Checking moves on to the next file still waiting, wrapping round, then closes.
  await ui.press({ key: 'ok' })
  expect((await ui.find({ type: 'Text', text: /^src\/app\.ts$/ }))?.text).toBe('src/app.ts')
  await ui.press({ key: 'ok' })
  expect(await ui.find({ type: 'Code' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'review' }))?.props.label).toBe('Lihat diff')
  expect(await ui.find({ type: 'Button', key: 'check-all' })).toBeUndefined()
  await ui.unmount()
})

test('the lit file follows Claude as it reads, live', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'const b = 2', new_string: 'const b = 20' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pixelScreen(ui)).source).not.toContain('README.md')

  // The open pane redraws as the next tool starts on another file.
  await $.tool.call({ tool: 'Read', file_path: '/proj/docs/guide/README.md' })
  expect((await pixelScreen(ui)).source).toContain('<title>docs/guide/README.md\nSedang dibaca, tanpa perubahan</title>')
  expect((await pixelScreen(ui)).source).toContain('<title>docs/guide/</title>')
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /^README\.md$/ }))?.props.color).toBe('#7F77DD')
  expect((await term.find({ type: 'Text', text: /^app\.ts$/ }))?.props.color).toBe('warning')
  // A folder holding one folder shares its row, as an explorer draws it.
  expect((await term.find({ type: 'Text', text: /▾ docs/ }))?.text).toBe('▾ docs/guide')
  // A file only read has no counts and nothing to open.
  expect(await term.find({ type: 'Button', key: 'f:docs/guide/README.md' })).toBeUndefined()
  await term.unmount()
})

test('tree rows: folders first, by name, single-folder chains joined', () => {
  expect(treeRows(['src/b.ts', 'README.md', 'src/a.ts', 'src/ui/x/Button.tsx', 'src/a.ts'])).toEqual([
    { kind: 'dir', label: 'src', path: 'src', depth: 0 },
    { kind: 'dir', label: 'ui/x', path: 'src/ui/x', depth: 1 },
    { kind: 'file', name: 'Button.tsx', path: 'src/ui/x/Button.tsx', depth: 2 },
    { kind: 'file', name: 'a.ts', path: 'src/a.ts', depth: 1 },
    { kind: 'file', name: 'b.ts', path: 'src/b.ts', depth: 1 },
    { kind: 'file', name: 'README.md', path: 'README.md', depth: 0 },
  ])
})

test('/kokpit kurs sets the rate; no daily limit is left anywhere', async ($, on) => {
  const world = engine(on)
  // A save from the version with a daily limit: the rate is kept, the limit dropped.
  world.store.set('prefs', { kurs: 16000, budget: 50000 })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  // A reload runs session.start again: today's total must not count the session twice.
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pixelScreen(ui)).alt).toContain('sesi Rp4.000, hari ini Rp4.000')
  expect(world.store.get('daily')).toEqual({ day: '2026-11-25', usd: 0.25, seen: { [String(NOW - 60_000)]: 0.25 } })

  const set = await $.command.run(typed('kurs 15.000'))
  expect(set.text).toBe('Kurs disimpan: Rp15.000 per $.')
  expect(world.store.get('prefs')).toEqual({ kurs: 15000 })
  expect((await pixelScreen(ui)).alt).toContain('sesi Rp3.750')
  // The price note rides on the figures' tooltips.
  expect((await pixelScreen(ui)).source).toContain('Kurs Rp15.000 per $, ubah dengan /kokpit kurs 16400')

  const bad = await $.command.run(typed('kurs 12'))
  expect(bad.text).toContain('antara 1.000 dan 100.000')
  expect((await pixelScreen(ui)).alt).toContain('sesi Rp3.750')
  expect((await $.command.run(typed('kurs'))).text).toContain('Rp15.000 per $')
  expect((await $.command.run(typed(''))).text).toBe('Panel Kokpit Claude dibuka.')
  expect(world.toasts.filter(t => t.includes('batas'))).toEqual([])
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /kurs Rp15\.000/ }))?.text).toBe('Estimasi harga API · kurs Rp15.000/$')
  expect(await term.find({ type: 'Progress' })).toBeUndefined()
  expect(await term.find({ type: 'Input' })).toBeUndefined()
  await term.unmount()
})

test('/kokpit ringkasan sums the session up; a filling context earns one toast per mark', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'const b = 2\nconst c = 3', new_string: 'const b = 20\nconst d = 4\nconst c = 3' })
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })

  const sum = (await $.command.run(typed('ringkasan'))).text
  expect(sum).toContain('Ringkasan sesi · Opus 5.5')
  expect(sum).toContain('Durasi 1 mnt')
  expect(sum).toContain('biaya Rp4.100')
  expect(sum).toContain('File: 1 berubah (+3 −2), 1 belum dicek')
  expect(sum).toContain('Perintah: 1 dijalankan, 1 berisiko')
  expect(world.toasts.filter(t => t.includes('konteks'))).toEqual([])

  // 12% → 85%: one warning; still 85%: none; 96%: the stronger one.
  world.ctx.percent = 85
  await $.command.run(typed('ringkasan'))
  await $.command.run(typed('ringkasan'))
  world.ctx.percent = 96
  await $.command.run(typed('ringkasan'))
  expect(world.toasts.filter(t => t.includes('konteks'))).toEqual([
    'Kokpit: konteks sudah 85%, pertimbangkan /compact',
    'Kokpit: konteks 96% hampir habis, jalankan /compact sekarang',
  ])
  expect(ctxCrossed(null, 50)).toBeNull()
  expect(ctxCrossed(70, 99)).toBe(95)
  expect(ctxCrossed(30, 12)).toBeNull()
})

const BAND = (surface: 'desktop' | 'terminal', over: { isWorking?: boolean; hasSurvey?: boolean } = {}) =>
  ({
    plugin: 'kokpit-piksel',
    component: 'AbovePrompt',
    surface,
    props: {
      hasSurvey: over.hasSurvey ?? false,
      isCollapsed: false,
      isWorking: over.isWorking ?? false,
      maxRows: 10,
      bodyColumns: 80,
      scroll: { offset: 0, bodyRows: 9 },
      view: {},
    },
  }) as const

test('the strip above the prompt: Claude small, one word, the context; still through a turn', async ($, on) => {
  const world = engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const strip = async (ui: { findAll: (q: { type: 'Svg' }) => Promise<{ props: Record<string, unknown> }[]> }) => {
    const all = await ui.findAll({ type: 'Svg' })
    expect(all.length).toBe(1)
    const p = all[0]?.props ?? {}
    return { source: String(p.source), alt: String(p.alt), isInteractive: p.isInteractive, width: Number(p.width), height: Number(p.height) }
  }

  const idle = await $.ui.mount(BAND('desktop'))
  const at = await strip(idle)
  expect(at.alt).toBe('Opus 5.5 · Santai. Konteks 12%.')
  // A plain image, its size given: no frame to blank on a change.
  expect(at.isInteractive).toBeUndefined()
  expect(at.height).toBe(21)
  // As wide as what it says, left-aligned, never past the band.
  expect(at.width).toBeLessThan(400)
  expect(at.source).not.toContain('<script')
  await idle.unmount()

  // Through a turn, reading then editing then running draw one and the same strip.
  const busy = await $.ui.mount(BAND('desktop', { isWorking: true }))
  const first = await strip(busy)
  expect(first.alt).toBe('Opus 5.5 · Bekerja. Konteks 12%.')
  await $.tool.call({ tool: 'Read', file_path: FILE })
  await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'const b = 2', new_string: 'const b = 20' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect((await strip(busy)).source).toBe(first.source)
  await busy.unmount()

  // A context near full turns the meter amber.
  world.ctx.percent = 85
  await $.command.run(typed('ringkasan'))
  const full = await $.ui.mount(BAND('desktop'))
  expect((await strip(full)).alt).toContain('Konteks 85%')
  expect((await strip(full)).source).toContain('#E8A33A')
  await full.unmount()

  // Nothing where Svg is not drawn, nor over a survey.
  const term = await $.ui.mount(BAND('terminal'))
  expect(await term.find({ type: 'Text' })).toBeUndefined()
  await term.unmount()
  const survey = await $.ui.mount(BAND('desktop', { hasSurvey: true }))
  expect(await survey.find({ type: 'Svg' })).toBeUndefined()
  await survey.unmount()
})

test('the strip: every costume and state fits, the turn note after Selesai', () => {
  const costumes: Costume[] = ['opus', 'sonnet', 'haiku', 'fable', 'claude']
  for (const costume of costumes) {
    for (const state of ['idle', 'work', 'done', 'err'] as const) {
      for (const width of [100, 400, 1400]) {
        const s = bandShot({ width, costume, accent: '#7F77DD', name: 'Sonnet 5.5', state, note: '42 dtk · Rp1.200', ctxPercent: 100 })
        expect(s.source.length).toBeLessThan(SVG_LIMIT)
        expect(s.height).toBe(21)
        expect(Number.isInteger(s.width)).toBe(true)
        if (width >= 400) expect(s.width).toBeLessThanOrEqual(width)
      }
    }
  }
  expect(bandShot({ width: 560, costume: 'opus', accent: '#7F77DD', name: 'Opus 5.5', state: 'done', note: '42 dtk · Rp1.200', ctxPercent: null }).alt).toBe(
    'Opus 5.5 · Selesai · 42 dtk · Rp1.200. Konteks belum diketahui.',
  )
  expect(bandState('write', true)).toBe('work')
  expect(bandState('think', false)).toBe('idle')
  expect(bandState('done', false)).toBe('done')
  expect(bandState('err', true)).toBe('err')
})

test('the last seven days show as bars, kept across sessions in the store', async ($, on) => {
  const world = engine(on)
  world.store.set('history', { '2026-11-24': 1, '2026-11-01': 9 })
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  expect(world.store.get('history')).toEqual({ '2026-11-25': 0.25, '2026-11-24': 1, '2026-11-01': 9 })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const screen = (await pixelScreen(ui)).source
  expect(screen).toContain('7 hari terakhir Rp20.500')
  expect(screen).toContain('Sel 24/11: Rp16.400')
  expect(screen).toContain('Rab 25/11: Rp4.100')
  await ui.unmount()

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.find({ type: 'Text', text: /^7 hari / }))?.text).toBe('7 hari ·····█▂ Rp20.500')
  await term.unmount()
  expect(sparkline([0, 1, 8])).toBe('·▁█')
})

test('the pixel screen fits long inputs in both layouts and stays under the Svg limit', () => {
  const long = 'Menjalankan npm run test -- --watch=false <a & b> '.repeat(8)
  const rows: FileRow[] = Array.from({ length: 200 }, (_, i) =>
    i % 5 === 0
      ? { kind: 'dir', label: `paket-${i}/dengan/nama/folder/panjang`, depth: 0, isLit: i === 0, tip: `<dir ${i}>` }
      : {
          kind: 'file',
          name: `komponen-dengan-nama-sangat-panjang-${i}.test.tsx`,
          depth: 1 + (i % 3),
          tone: (['new', 'mod', 'ok', 'read'] as const)[i % 4] ?? 'mod',
          isActive: i === 3,
          isReview: i === 4,
          added: i % 4 === 3 ? null : i * 1000,
          removed: i % 4 === 3 ? null : i * 7,
          isRisky: i % 2 === 0,
          glyph: '✎',
          tip: long,
        },
  )
  const input = (paneWidth: number, isRunning: boolean, tokens: string) => ({
    width: paneWidth,
    accent: '#1D9E75',
    room: { costume: 'sonnet' as const, mood: 'write' as const, accent: '#1D9E75', hour: 21, minute: 9, name: 'Sonnet 5.5', title: 'Sang Penyair', detail: long },
    hud: {
      name: 'Sonnet 5.5 dengan nama yang sangat panjang sekali',
      lv: 999,
      xp: 1.7,
      nameTip: 'Sonnet <b>',
      glyph: '▶',
      status: long,
      statusTip: long,
      tone: 'accent' as const,
      isRunning,
      ctx: { values: ['100% dari 1 jt', '100%'], share: 1.4, isHigh: true, tip: 'a' },
      stats: [
        { label: 'Token', values: [tokens], tip: 't' },
        { label: 'Sesi', values: ['Rp123.456.789', 'Rp123,46 jt'], tip: 's', isMoney: true },
        { label: 'Hari ini', values: ['Rp9.999.999', 'Rp10 jt'], tip: 'u', isMoney: true },
      ] as [Stat, Stat, Stat],
    },
    files: { rows, added: 123456, removed: 98765, hasChanges: true, more: 3 },
    cmds: [
      { ok: true, text: long, isRisky: true, tip: long },
      { ok: false, text: 'ls', isRisky: false, tip: 'ls' },
      { ok: null, text: 'npm test', isRisky: false, tip: 'npm test' },
    ],
  })
  for (const [paneWidth, isWide] of [[336, false], [2000, true]] as const) {
    for (const isRunning of [true, false]) {
      const shots = screens(input(paneWidth, isRunning, '999,99 jt'))
      expect(shots.isWide).toBe(isWide)
      for (const shot of [shots.room, shots.hud, shots.list]) {
        const svg = shot.source
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.length).toBeLessThan(SVG_LIMIT)
        expect(svg).not.toContain('<script')
        expect(svg).not.toContain('<a & b>')
        // Never wider than 3 screen pixels a cell; a narrower column scales it down.
        expect(shot.width).toBe(isWide ? 510 : 336)
        expect(svg).toContain(`width="${shot.width}" height="${shot.height}"`)
      }
      expect(shots.hud.source).toContain('&lt;a &amp; b&gt;')
      expect(shots.list.source).toContain('&lt;a &amp; b&gt;')

      // A new figure redraws the HUD alone: the room and the list keep their markup, so their frames do not blank.
      const next = screens(input(paneWidth, isRunning, '1 jt'))
      expect(next.hud.source).not.toBe(shots.hud.source)
      expect(next.room.source).toBe(shots.room.source)
      expect(next.list.source).toBe(shots.list.source)
    }
  }
})

test('the pixel font: upper and lower case, accents, fitting', () => {
  expect(normalize('Rp4.100 · café')).toBe('Rp4.100 · cafe')
  expect(normalize('日本 – “x”')).toBe('?? - "x"')
  expect(measure('A')).toBe(5)
  expect(measure('AA')).toBe(11)
  expect(measure('i')).toBe(1)
  const cut = fit('Mengedit register.tsx', 40)
  expect(cut.endsWith('…')).toBe(true)
  expect(measure(cut)).toBeLessThan(41)
  expect(fit('OK', 40)).toBe('OK')
  const mid = fitMiddle('komponen-yang-sangat-panjang.tsx', 60)
  expect(mid).toContain('…')
  expect(mid.endsWith('ng.tsx')).toBe(true)
  expect(measure(mid)).toBeLessThan(61)
  expect(textPath(' ', 0, 0)).toBe('')
  expect(textPath('.', 2, 3)).toBe('M2 9.5h1')
})

test('the widget placement stays small', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/proj', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...PANE.props, placement: 'widget' } })
  expect((await ui.find({ type: 'Text', text: /file berubah/ }))?.text).toContain('0 file berubah')
  expect(await ui.find({ type: 'Button' })).toBeUndefined()
  await ui.unmount()
})

test('every costume and mood draws a scene under the Svg limit', () => {
  const costumes: Costume[] = ['opus', 'sonnet', 'haiku', 'fable', 'claude']
  const moods: Mood[] = ['idle', 'think', 'read', 'write', 'run', 'web', 'err', 'done']
  for (const costume of costumes) {
    for (const mood of moods) {
      for (const hour of [3, 12, 18]) {
        const svg = scene({ costume, mood, accent: '#7F77DD', hour, minute: 5, name: 'Opus 5.5', title: 'Sang Arsitek', detail: 'Mengedit <a & b>.ts' })
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.length).toBeLessThan(SVG_LIMIT)
        expect(svg).not.toContain('<script')
        expect(svg).not.toContain('<a & b>')
      }
    }
  }
})

test('line diffs count and place changes', () => {
  const d = diffText(BEFORE, AFTER)
  // b = 2 → b = 20, d = 4 inserted, the export line widened.
  expect(d.added).toBe(3)
  expect(d.removed).toBe(2)
  expect(d.from).toBe(2)
  expect(d.to).toBe(5)
  expect(d.diff).toContain('@@ -1,4 +1,5 @@')

  const fresh = diffText(null, 'a\nb\n')
  expect(fresh.added).toBe(2)
  expect(fresh.removed).toBe(0)
  expect(fresh.diff).toContain('@@ -0,0 +1,2 @@')

  expect(diffText('same', 'same').diff).toBe('')

  const big = diffText(null, Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n'))
  expect(big.added).toBe(300)
  expect(big.isTruncated).toBe(true)
})

test('words: models, money, tags and risky commands', () => {
  expect(modelInfo('claude-opus-5-5')).toEqual({ costume: 'opus', name: 'Opus 5.5' })
  expect(modelInfo('claude-sonnet-5-5').costume).toBe('sonnet')
  expect(modelInfo('claude-haiku-5-5').name).toBe('Haiku 5.5')
  expect(modelInfo('claude-fable-5-2').name).toBe('Fable 5.2')
  expect(modelInfo('').costume).toBe('claude')
  expect(rupiah(1234567)).toBe('Rp1.234.567')
  expect(short(1_000_000)).toBe('1 jt')
  expect(short(313_300)).toBe('313,3 rb')
  expect(short(1_250_000)).toBe('1,25 jt')
  expect(short(715)).toBe('715')
  expect(tagsFor('.env.local', false, true)).toEqual(['baru', 'sensitif'])
  expect(tagsFor('package.json', false, false)).toEqual(['dependensi'])
  expect(riskOf('rm -rf build')).toBe('hapus paksa')
  expect(riskOf('npm install left-pad')).toBe('pasang paket')
  expect(riskOf('ls -la')).toBe(null)
  expect(describeTool('Read', { file_path: 'C:\\x\\notes.md' })).toEqual({ mood: 'read', detail: 'Membaca notes.md' })
})
