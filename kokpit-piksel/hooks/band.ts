// The strip above the prompt: Claude peeking in small, one word of what it is
// up to, how full the context is, and the files changed so far. No box of its
// own: it sits on the band's background, left-aligned, as wide as what it says.
// Drawn as a plain image (no frame, no hover); its markup changes only when one
// of those changes, not on every tool call. What moves (the dots after
// "Bekerja", the zzz, a drop of sweat) is CSS inside the image. In mode santai
// a line of Claude's own goes first, at the left.

import { CAP, FONT_CSS, fit, measure, pixText } from './pixfont'
import { buddyParts } from './scene'
import type { Costume } from './scene'

/** What the strip shows; a turn's tools all draw as one `work`. */
export type BandState = 'idle' | 'work' | 'done' | 'err'

export type BandInput = {
  /** CSS pixels the band gives at most. */
  width: number
  costume: Costume
  accent: string
  /** For the words a screen reader hears; the footer already shows the model. */
  name: string
  state: BandState
  /** After `done`: how long the turn took and what it cost. */
  note: string
  ctxPercent: number | null
  /** Where auto-compaction runs on the same scale, marked on the meter; absent or null when off. */
  ctxMark?: number | null
  /** Amber and sweat; absent, from `ctxPercent` alone (80% and up). */
  isCtxHigh?: boolean
  /** Files changed this session and their lines; nothing is drawn at 0 files. */
  files: { count: number; added: number; removed: number }
  /** Mode santai: what Claude mutters, at the left; absent or '' for none. Drawn whole or not at all. */
  quip?: string
}

export type BandShot = { source: string; width: number; height: number; alt: string }

/**
 * CSS pixels a cell takes: the 7-cell capitals come out about as tall as the
 * prompt's own text. The strip is H cells: Claude to the waist, legs below the edge.
 */
const SCALE = 1.5
const H = 14
const OX = 6
const OY = 5
/** After Claude and the room its zzz take. */
const TEXT_X = OX + 29
/** Cells from the end of mode santai's line to the strip's own left edge (the sweat drop sits 3 in). */
const QUIP_GAP = 4

// Colours for a dark band, with lighter-theme ones in case the app is light.
// `w`/`d` stroke the text, `wf`/`df` fill the dots and the zzz, `e` an empty cell.
const CSS =
  '.w{stroke:#F1EFE8}.d{stroke:#ABA8A1}.wf{fill:#F1EFE8}.df{fill:#ABA8A1}.e{fill:#3A3835}' +
  '@media (prefers-color-scheme:light){.w{stroke:#2C2C2A}.d{stroke:#6B6862}.wf{fill:#2C2C2A}.df{fill:#6B6862}.e{fill:#D3D1C7}}' +
  // "Bekerja" then ".", "..", "...", over and over. Still (all three) with reduced motion.
  '.bk1{animation:bk1 1.6s step-end infinite}.bk2{animation:bk2 1.6s step-end infinite}.bk3{animation:bk3 1.6s step-end infinite}' +
  '@keyframes bk1{0%{opacity:0}25%{opacity:1}}@keyframes bk2{0%{opacity:0}50%{opacity:1}}@keyframes bk3{0%{opacity:0}75%{opacity:1}}' +
  // Two z's rising one after the other while Claude rests.
  '.zz1{animation:zz 2.8s step-end infinite}.zz2{animation:zz 2.8s step-end infinite;animation-delay:-2s}' +
  '@keyframes zz{0%{opacity:0;transform:translateY(0)}15%{opacity:1}45%{transform:translateY(-1px)}75%{opacity:0}}' +
  // A drop of sweat sliding down while the context is nearly full.
  '.sw{animation:sw 1.8s step-end infinite}' +
  '@keyframes sw{0%{opacity:1;transform:translateY(0)}40%{transform:translateY(1px)}70%{transform:translateY(2px)}85%{opacity:0}}'
const GREEN = '#7FB83E'
const RED = '#E5645F'
const WARN = '#E8A33A'
/** Softer than the status colours: the file lines are a footnote. */
const ADDED = '#6E9E45'
const REMOVED = '#C2605B'
const DROP = '#8FD0F0'
const DROP_DARK = '#5AA9D6'

const WORDS: Record<BandState, string> = { idle: 'Santai', work: 'Bekerja', done: 'Selesai', err: 'Ada error' }
const POSE = { idle: 'idle', work: 'run', done: 'done', err: 'err' } as const

const px = (x: number, y: number, w: number, h: number, paint: string) =>
  paint.startsWith('#') ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${paint}"/>` : `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${paint}"/>`

/** A small z (3 cells) and a bigger one (4), up and to the right of Claude's head, clear of the text. */
function zzz(): string {
  const small = [px(OX + 17, 3, 3, 1, 'df'), px(OX + 18, 4, 1, 1, 'df'), px(OX + 17, 5, 3, 1, 'df')]
  const big = [px(OX + 20, 0, 4, 1, 'df'), px(OX + 22, 1, 1, 1, 'df'), px(OX + 21, 2, 1, 1, 'df'), px(OX + 20, 3, 4, 1, 'df')]
  return `<g class="zz1">${small.join('')}</g><g class="zz2">${big.join('')}</g>`
}

/** A drop on the left of Claude's head. */
function sweat(): string {
  return (
    `<g class="sw">${px(OX - 2, 3, 1, 1, DROP)}${px(OX - 3, 4, 2, 1, DROP)}` +
    `${px(OX - 3, 5, 2, 1, DROP_DARK)}</g>`
  )
}

export function bandShot(s: BandInput): BandShot {
  const maxW = Math.max(100, Math.floor(s.width / SCALE))
  const o: string[] = []

  const sprite = buddyParts(
    { costume: s.costume, mood: POSE[s.state], accent: s.accent, hour: 12, minute: 0, name: s.name, title: '', detail: '' },
    OX,
    OY,
  )
  o.push(sprite.body)

  const pct = s.ctxPercent
  const isHigh = s.isCtxHigh ?? (pct !== null && pct >= 80)
  const mark = s.ctxMark ?? null
  if (s.state === 'idle') o.push(zzz())
  if (isHigh) o.push(sweat())

  // After the word: "konteks", ten cells, the share; then the files, if any.
  const pctText = pct === null ? '–' : `${pct}%`
  const label = 'konteks'
  const labelW = measure(label) + 5
  const cells = 10
  const meterW = cells * 4 - 1
  const hasFiles = s.files.count > 0
  const fileText = `${s.files.count} file`
  const addText = `+${s.files.added}`
  const delText = `-${s.files.removed}`
  const filesW = hasFiles ? 10 + measure(fileText) + 4 + measure(addText) + 3 + measure(delText) : 0
  const dotsW = s.state === 'work' ? 6 : 0
  const bare = dotsW + 12 + meterW + 4 + measure(pctText) + filesW + 2

  const ty = Math.floor((H - CAP) / 2)
  const full = s.state === 'done' && s.note ? `${WORDS.done} · ${s.note}` : WORDS[s.state]

  // Mode santai's line is never cut. Short of room, the "konteks" label goes
  // first, then the turn note is cut, and only then is the line left out.
  const quip = s.quip ?? ''
  const quipW = quip ? 2 + measure(quip) + QUIP_GAP : 0
  const fits = (withLabel: boolean, w: string) => quipW + TEXT_X + measure(w) + bare + (withLabel ? labelW : 0) <= maxW
  const [lead, hasLabel] =
    quipW === 0 ? [0, true] : fits(true, full) ? [quipW, true] : fits(false, WORDS[s.state]) ? [quipW, false] : [0, true]
  const tail = bare + (hasLabel ? labelW : 0)
  const word = fit(full, Math.max(24, maxW - lead - TEXT_X - tail))
  if (s.state === 'done') o.push(pixText(word, TEXT_X, ty, GREEN))
  else if (s.state === 'err') o.push(pixText(word, TEXT_X, ty, RED))
  else o.push(pixText(word, TEXT_X, ty, '#F1EFE8', s.state === 'work' ? 'w' : 'd'))

  let x = TEXT_X + measure(word)
  if (s.state === 'work') {
    const by = ty + CAP - 1
    o.push(`<g class="bk1">${px(x + 1, by, 1, 1, 'wf')}</g><g class="bk2">${px(x + 3, by, 1, 1, 'wf')}</g><g class="bk3">${px(x + 5, by, 1, 1, 'wf')}</g>`)
    x += dotsW
  }

  x += 12
  if (hasLabel) {
    o.push(pixText(label, x, ty, '#ABA8A1', 'd'))
    x += labelW
  }
  const lit = pct === null ? 0 : Math.min(cells, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * cells)))
  for (let i = 0; i < cells; i++) o.push(px(x + i * 4, ty + 2, 3, 3, i >= lit ? 'e' : isHigh ? WARN : s.accent))
  // Auto-compaction's spot: a tick above and below the meter, amber, red once the context reaches it.
  if (mark !== null) {
    const mx = x + Math.min(meterW - 1, Math.round((mark / 100) * meterW))
    const tick = pct !== null && pct >= mark ? RED : WARN
    o.push(px(mx, ty, 1, 2, tick), px(mx, ty + 5, 1, 2, tick))
  }
  x += meterW + 4
  o.push(isHigh ? pixText(pctText, x, ty, WARN) : pixText(pctText, x, ty, '#ABA8A1', 'd'))
  x += measure(pctText)

  if (hasFiles) {
    x += 10
    o.push(pixText(fileText, x, ty, '#ABA8A1', 'd'))
    x += measure(fileText) + 4
    o.push(pixText(addText, x, ty, ADDED))
    x += measure(addText) + 3
    o.push(pixText(delText, x, ty, REMOVED))
    x += measure(delText)
  }

  // Even, so the scaled width is whole pixels and the cells stay square.
  const W = Math.ceil((lead + x + 2) / 2) * 2

  // The line at the left; the strip as it always is, moved over to make room.
  const body = lead > 0 ? `${pixText(quip, 2, ty, '#ABA8A1', 'd')}<g transform="translate(${lead} 0)">${o.join('')}</g>` : o.join('')
  const width = W * SCALE
  const height = Math.round(H * SCALE)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `<style>${FONT_CSS}${sprite.css}${CSS}</style>${body}</svg>`
  const files = hasFiles ? ` ${s.files.count} file berubah, +${s.files.added} −${s.files.removed}.` : ''
  const said = lead > 0 ? ` Celetuk: ${quip}.` : ''
  const auto = mark !== null ? ` Autocompact di ${mark}%.` : ''
  const alt = `${s.name} · ${full}. Konteks ${pct === null ? 'belum diketahui' : `${pct}%`}.${auto}${files}${said}`
  return { source, width, height, alt }
}

/** A turn's moods fold into one, so the strip is redrawn a few times a turn, not per tool. */
export function bandState(mood: string, isWorking: boolean): BandState {
  if (mood === 'err') return 'err'
  if (mood === 'done') return 'done'
  return isWorking ? 'work' : 'idle'
}
