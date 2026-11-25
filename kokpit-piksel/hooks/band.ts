// The strip above the prompt: Claude peeking in small, one word of what it is
// up to, and how full the context is. No box of its own: it sits on the band's
// background, left-aligned, as wide as what it says. Drawn as a plain image (no
// frame, no hover); its markup changes only when one of those changes, not on
// every tool call.

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
const TEXT_X = OX + 25

// Colours for a dark band, with lighter-theme strokes in case the app is light.
const CSS =
  '.w{stroke:#F1EFE8}.d{stroke:#ABA8A1}.e{fill:#3A3835}' +
  '@media (prefers-color-scheme:light){.w{stroke:#2C2C2A}.d{stroke:#6B6862}.e{fill:#D3D1C7}}'
const GREEN = '#7FB83E'
const RED = '#E5645F'
const WARN = '#E8A33A'

const WORDS: Record<BandState, string> = { idle: 'Santai', work: 'Bekerja', done: 'Selesai', err: 'Ada error' }
const POSE = { idle: 'idle', work: 'run', done: 'done', err: 'err' } as const

export function bandShot(s: BandInput): BandShot {
  const maxW = Math.max(100, Math.floor(s.width / SCALE))
  const o: string[] = []

  const sprite = buddyParts(
    { costume: s.costume, mood: POSE[s.state], accent: s.accent, hour: 12, minute: 0, name: s.name, title: '', detail: '' },
    OX,
    OY,
  )
  o.push(sprite.body)

  // The context goes right after the word: "konteks", ten cells, the share.
  const pct = s.ctxPercent
  const pctText = pct === null ? '–' : `${pct}%`
  const isHigh = pct !== null && pct >= 80
  const label = 'konteks'
  const cells = 10
  const meterW = cells * 4 - 1
  const tail = 12 + measure(label) + 5 + meterW + 4 + measure(pctText) + 2

  const ty = Math.floor((H - CAP) / 2)
  const full = s.state === 'done' && s.note ? `${WORDS.done} · ${s.note}` : WORDS[s.state]
  const word = fit(full, Math.max(24, maxW - TEXT_X - tail))
  if (s.state === 'done') o.push(pixText(word, TEXT_X, ty, GREEN))
  else if (s.state === 'err') o.push(pixText(word, TEXT_X, ty, RED))
  else o.push(pixText(word, TEXT_X, ty, '#F1EFE8', s.state === 'work' ? 'w' : 'd'))

  let x = TEXT_X + measure(word) + 12
  o.push(pixText(label, x, ty, '#ABA8A1', 'd'))
  x += measure(label) + 5
  const lit = pct === null ? 0 : Math.min(cells, Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * cells)))
  for (let i = 0; i < cells; i++) {
    const at = `x="${x + i * 4}" y="${ty + 2}" width="3" height="3"`
    o.push(i < lit ? `<rect ${at} fill="${isHigh ? WARN : s.accent}"/>` : `<rect ${at} class="e"/>`)
  }
  x += meterW + 4
  o.push(isHigh ? pixText(pctText, x, ty, WARN) : pixText(pctText, x, ty, '#ABA8A1', 'd'))
  // Even, so the scaled width is whole pixels and the cells stay square.
  const W = Math.ceil((x + measure(pctText) + 2) / 2) * 2

  const width = W * SCALE
  const height = Math.round(H * SCALE)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${width}" height="${height}" shape-rendering="crispEdges">` +
    `<style>${FONT_CSS}${sprite.css}${CSS}</style>${o.join('')}</svg>`
  const alt = `${s.name} · ${full}. Konteks ${pct === null ? 'belum diketahui' : `${pct}%`}.`
  return { source, width, height, alt }
}

/** A turn's moods fold into one, so the strip is redrawn a few times a turn, not per tool. */
export function bandState(mood: string, isWorking: boolean): BandState {
  if (mood === 'err') return 'err'
  if (mood === 'done') return 'done'
  return isWorking ? 'work' : 'idle'
}
