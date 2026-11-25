// The whole pane as one pixel screen: the room on top, a console beneath it
// with the HUD, the files Claude touched (the one it is on lit) and its last
// commands, drawn as three pictures. Narrow panes stack them; wide ones put the files
// beside the room. Hover zones carry the full figures and paths as tooltips.

import { FONT_CSS, LINE, fit, fitMiddle, measure, pixText } from './pixfont'
import { ROOM, sceneParts } from './scene'
import type { SceneInput } from './scene'

export type Stat = {
  label: string
  /** Ways to write the value, longest first: the first that fits is drawn. */
  values: string[]
  tip: string
  isMoney?: boolean
}

export type Hud = {
  name: string
  lv: number
  /** 0..1 of the way to the next level. */
  xp: number
  nameTip: string
  glyph: string
  status: string
  statusTip: string
  tone: 'accent' | 'bad' | 'ok'
  isRunning: boolean
  ctx: { values: string[]; share: number | null; isHigh: boolean; tip: string }
  stats: [Stat, Stat, Stat]
}

export type FileRow =
  | { kind: 'dir'; label: string; depth: number; isLit: boolean; tip: string }
  | {
      kind: 'file'
      name: string
      depth: number
      /** new and modified files not yet checked, checked ones, files only read */
      tone: 'new' | 'mod' | 'ok' | 'read'
      isActive: boolean
      isReview: boolean
      added: number | null
      removed: number | null
      isRisky: boolean
      glyph: string
      tip: string
    }

export type CmdRow = { ok: boolean | null; text: string; isRisky: boolean; tip: string }

export type ScreenInput = {
  /** CSS pixels across the pane; two columns from about 680. */
  width: number
  accent: string
  room: SceneInput
  hud: Hud
  files: { rows: FileRow[]; added: number; removed: number; hasChanges: boolean; more: number }
  cmds: CmdRow[]
}

/** The engine refuses a longer Svg; the files list gives way first. */
export const SVG_LIMIT = 131072

const COL = 170
const P = 7
const ROOM_SCALE = COL / ROOM.w

const INK = {
  bg: '#1C1B19',
  edge: '#3A3835',
  empty: '#34312D',
  text: '#F1EFE8',
  dim: '#ABA8A1',
  faint: '#85827B',
  gold: '#FAC775',
  green: '#A6D16A',
  red: '#F28B89',
  warn: '#F0B44C',
  folder: '#D9B25F',
  folderDim: '#8F7A4E',
}

const CSS =
  FONT_CSS +
  '.hz{pointer-events:all;cursor:default}.hz:hover{fill-opacity:.09}' +
  '.hbl{animation:hbl 1.1s step-end infinite}@keyframes hbl{50%{opacity:0}}' +
  '.hpl{animation:hpl 1.6s step-end infinite}@keyframes hpl{50%{opacity:.4}}' +
  '@media (prefers-reduced-motion:reduce){.hbl,.hpl{animation:none}}'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

type Box4 = [number, number, number, number]

const rects = (list: Box4[], fill: string, extra = '') =>
  list.length === 0
    ? ''
    : `<path d="${list.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h-${w}z`).join('')}" fill="${fill}"${extra}/>`

/** Lit cells of a little picture, '#' per cell, '/' between rows. */
function icon(spec: string, x: number, y: number, fill: string) {
  const list: Box4[] = []
  spec.split('/').forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (row[c] !== '#') {
        c++
        continue
      }
      let end = c
      while (row[end] === '#') end++
      list.push([x + c, y + r, end - c, 1])
      c = end
    }
  })
  return rects(list, fill)
}

const FOLDER = '##..../######/######/######/######/######'

const zone = (x: number, y: number, w: number, h: number, tip: string) =>
  `<rect class="hz" x="${x}" y="${y}" width="${w}" height="${h}" fill="#FFFFFF" fill-opacity="0"><title>${esc(tip)}</title></rect>`

const dots = (x: number, y: number, w: number) =>
  `<path d="M${x} ${y + 0.5}h${w}" stroke="${INK.edge}" stroke-dasharray="1 1"/>`

/** The first candidate that fits maxW, else the last cut to fit. */
function pick(values: string[], maxW: number) {
  for (const v of values) if (measure(v) <= maxW) return v
  return fit(values[values.length - 1] ?? '', maxW)
}

function hudSection(o: string[], x: number, y: number, w: number, h: Hud, accent: string): number {
  const tone = h.tone === 'bad' ? INK.red : h.tone === 'ok' ? INK.green : accent
  let cy = y + 6

  // Name, level and the XP still to go.
  const xpW = 26
  const xpX = x + w - P - xpW
  const lv = `Lv ${h.lv}`
  const lvX = xpX - 5 - measure(lv)
  o.push(pixText(fit(h.name, lvX - x - P - 6), x + P, cy, accent))
  o.push(pixText(lv, lvX, cy, INK.dim))
  const xpLit = Math.round(Math.min(1, Math.max(0, h.xp)) * xpW)
  o.push(rects([[xpX, cy + 2, xpW, 3]], INK.empty))
  if (xpLit > 0) o.push(rects([[xpX, cy + 2, xpLit, 3]], INK.gold))
  o.push(zone(x, cy - 3, w, LINE + 1, h.nameTip))
  cy += LINE + 3

  // What Claude is doing; a cursor blinks while a turn runs.
  o.push(pixText(h.glyph, x + P, cy, tone, h.isRunning ? 'hpl' : ''))
  const tx = x + P + 10
  const status = fit(h.status, x + w - P - tx - (h.isRunning ? 6 : 0))
  o.push(pixText(status, tx, cy, INK.text))
  if (h.isRunning) o.push(rects([[tx + measure(status) + 2, cy, 3, 7]], tone, ' class="hbl"'))
  o.push(zone(x, cy - 2, w, LINE + 2, h.statusTip))
  cy += LINE + 4

  o.push(dots(x + P, cy, w - P * 2))
  cy += 6

  // Context as a segmented bar.
  o.push(pixText('Konteks', x + P, cy, INK.dim))
  const value = pick(h.ctx.values, w - P * 2 - measure('Konteks') - 8)
  o.push(pixText(value, x + w - P - measure(value), cy, h.ctx.share === null ? INK.faint : INK.text))
  const n = Math.floor((w - P * 2 + 1) / 5)
  const bx = x + P + Math.floor((w - P * 2 - (n * 5 - 1)) / 2)
  const by = cy + 11
  const lit = h.ctx.share === null ? 0 : Math.min(n, Math.max(h.ctx.share > 0 ? 1 : 0, Math.round(h.ctx.share * n)))
  const on: Box4[] = []
  const off: Box4[] = []
  for (let i = 0; i < n; i++) (i < lit ? on : off).push([bx + i * 5, by, 4, 4])
  o.push(rects(off, INK.empty))
  o.push(rects(on, h.ctx.isHigh ? INK.warn : accent))
  o.push(rects(on.map(([sx, sy]) => [sx, sy, 4, 1] as Box4), '#FFFFFF', ' fill-opacity=".3"'))
  o.push(zone(x, cy - 2, w, 19, h.ctx.tip))
  cy += 21

  o.push(dots(x + P, cy, w - P * 2))
  cy += 6

  // Three figures in columns.
  const gap = 6
  const colW = Math.floor((w - P * 2 - gap * 2) / 3)
  h.stats.forEach((st, i) => {
    const sx = x + P + i * (colW + gap)
    o.push(pixText(fit(st.label, colW), sx, cy, INK.dim))
    o.push(pixText(pick(st.values, colW), sx, cy + LINE, st.isMoney ? INK.gold : INK.text))
    o.push(zone(sx - 3, cy - 2, colW + 6, LINE * 2 + 2, st.tip))
  })
  cy += LINE * 2 + 4
  return cy - y
}

function filesSection(o: string[], x: number, y: number, w: number, f: ScreenInput['files'], accent: string, isRunning: boolean, more: number): number {
  let cy = y + 6
  o.push(pixText('Perubahan', x + P, cy, INK.dim))
  if (f.hasChanges) {
    const minus = `-${f.removed}`
    const plus = `+${f.added}`
    const mx = x + w - P - measure(minus)
    o.push(pixText(minus, mx, cy, INK.red))
    o.push(pixText(plus, mx - 5 - measure(plus), cy, INK.green))
  }
  cy += LINE + 3

  if (f.rows.length === 0) {
    o.push(pixText('Belum ada file disentuh', x + P, cy, INK.faint))
    cy += LINE
  }

  for (const r of f.rows) {
    const top = cy - 2
    const ix = x + P + r.depth * 7
    if (r.kind === 'dir') {
      o.push(icon(FOLDER, ix, cy, r.isLit ? INK.folder : INK.folderDim))
      o.push(pixText(fit(r.label, x + w - P - ix - 9), ix + 9, cy, r.isLit ? INK.text : INK.faint))
      o.push(zone(x, top, w, LINE, r.tip))
      cy += LINE
      continue
    }

    if (r.isActive) {
      o.push(rects([[x, top, w, LINE]], accent, ' fill-opacity=".3"'))
      o.push(rects([[x, top, 2, LINE]], accent))
    }
    if (r.isReview) {
      o.push(`<rect x="${x + 0.5}" y="${top + 0.5}" width="${w - 1}" height="${LINE - 1}" fill="none" stroke="${accent}"/>`)
    }

    const color = r.isActive ? INK.text : r.tone === 'new' ? INK.green : r.tone === 'mod' ? INK.warn : r.tone === 'ok' ? INK.text : INK.faint

    // Right to left: checked mark or M/A, then the counts (zeros left out), then a warning.
    let rx = x + w - P
    const put = (s: string, c: string, space = 4) => {
      rx -= measure(s)
      o.push(pixText(s, rx, cy, c))
      rx -= space
    }
    if (r.added !== null && r.removed !== null) {
      if (r.tone === 'ok') put('✓', INK.green)
      else put(r.tone === 'new' ? 'A' : 'M', r.tone === 'new' ? INK.green : INK.warn)
      if (r.removed > 0) put(`-${r.removed}`, INK.red, 3)
      if (r.added > 0 || r.removed === 0) put(`+${r.added}`, INK.green)
      if (r.isRisky) put('!', INK.warn)
    }

    const nx = ix + 1
    const mark = r.isActive && isRunning ? measure(r.glyph) + 4 : 0
    const name = fitMiddle(r.name, rx - 2 - nx - mark)
    o.push(pixText(name, nx, cy, color))
    if (mark > 0) o.push(pixText(r.glyph, nx + measure(name) + 4, cy, r.isActive ? INK.text : accent, 'hpl'))
    o.push(zone(x, top, w, LINE, r.tip))
    cy += LINE
  }

  if (more > 0) {
    o.push(pixText(`+${more} lagi`, x + P, cy, INK.faint))
    cy += LINE
  }
  return cy - y + 2
}

function cmdSection(o: string[], x: number, y: number, w: number, cmds: CmdRow[]): number {
  let cy = y + 6
  o.push(pixText('Perintah', x + P, cy, INK.dim))
  cy += LINE + 3
  for (const c of cmds) {
    const glyph = c.ok === false ? '✕' : c.ok ? '✓' : '▶'
    o.push(pixText(glyph, x + P, cy, c.ok === false ? INK.red : c.ok ? INK.green : INK.faint, c.ok === null ? 'hpl' : ''))
    const right = c.isRisky ? measure('!') + 5 : 0
    if (c.isRisky) o.push(pixText('!', x + w - P - measure('!'), cy, INK.warn))
    o.push(pixText(fit(c.text, w - P * 2 - 10 - right), x + P + 10, cy, c.isRisky ? INK.warn : INK.text))
    o.push(zone(x, cy - 2, w, LINE, c.tip))
    cy += LINE
  }
  return cy - y + 2
}

/** Two columns once the pane gives every cell of them at least 2 CSS pixels. */
const WIDE_AT = (COL * 2 + 1) * 2

/** One picture's markup and the size to draw it at, in CSS pixels. */
export type Shot = { source: string; width: number; height: number }

/**
 * The screen as three pictures: the room, the HUD, and the files with the
 * commands. Each is redrawn by the desktop only when its own markup changes,
 * so a new token count does not blank the room, nor a mood change the list.
 */
export type Screens = { isWide: boolean; room: Shot; hud: Shot; list: Shot }

function wrap(W: number, H: number, colPx: number, css: string, defs: string, body: string): Shot {
  // As wide as the column allows, between 1 and 3 CSS pixels a cell.
  const scale = Math.min(3, Math.max(1, colPx / W))
  const width = Math.round(W * scale)
  const height = Math.round(H * scale)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `<style>${css}</style>${defs ? `<defs>${defs}</defs>` : ''}` +
    `<rect width="${W}" height="${H}" fill="${INK.bg}"/>${body}</svg>`
  return { source, width, height }
}

function roomShot(s: ScreenInput, colPx: number): Shot {
  const room = sceneParts(s.room)
  const roomH = Math.round(ROOM.h * ROOM_SCALE)
  const body = `<g transform="scale(${ROOM_SCALE})">${room.body}</g>` + rects([[0, roomH, COL, 1]], s.accent)
  return wrap(COL, roomH + 1, colPx, room.css, room.defs, body)
}

function hudShot(s: ScreenInput, colPx: number): Shot {
  const o: string[] = []
  const h = hudSection(o, 0, 0, COL, s.hud, s.accent)
  return wrap(COL, h, colPx, CSS, '', o.join(''))
}

function listOf(s: ScreenInput, rows: FileRow[], more: number, colPx: number): Shot {
  const o: string[] = []
  o.push(rects([[0, 0, COL, 1]], INK.edge))
  let y = 1
  y += filesSection(o, 0, y, COL, { ...s.files, rows }, s.accent, s.hud.isRunning, more)
  if (s.cmds.length > 0) {
    o.push(rects([[0, y, COL, 1]], INK.edge))
    y += 1
    y += cmdSection(o, 0, y, COL, s.cmds)
  }
  return wrap(COL, y, colPx, CSS, '', o.join(''))
}

/** The files and commands, the list cut short if it would pass the Svg limit. */
function listShot(s: ScreenInput, colPx: number): Shot {
  const all = s.files.rows
  const full = listOf(s, all, s.files.more, colPx)
  if (full.source.length < SVG_LIMIT || all.length === 0) return full

  const filesIn = (rows: FileRow[]) => rows.filter(r => r.kind === 'file').length
  const withRows = (n: number) => {
    const rows = all.slice(0, n)
    return listOf(s, rows, s.files.more + filesIn(all) - filesIn(rows), colPx)
  }
  // Guess from the average row how many fit, then step back until one does.
  const bare = withRows(0).source.length
  const perRow = Math.max(1, (full.source.length - bare) / all.length)
  let n = Math.max(0, Math.min(all.length - 1, Math.floor((SVG_LIMIT * 0.97 - bare) / perRow)))
  let shot = withRows(n)
  while (shot.source.length >= SVG_LIMIT && n > 0) {
    n = Math.max(0, n - 4)
    shot = withRows(n)
  }
  return shot
}

/** Narrow panes stack the three; wide ones put the list beside the room and HUD. */
export function screens(s: ScreenInput): Screens {
  const isWide = s.width >= WIDE_AT
  const colPx = isWide ? Math.floor((s.width - 8) / 2) : s.width
  return { isWide, room: roomShot(s, colPx), hud: hudShot(s, colPx), list: listShot(s, colPx) }
}
