// Mode santai (`/kokpit santai on`): a line Claude mutters at the left of the
// strip above the prompt. One line per state, the same all through a turn, the
// next one the turn after; each session starts somewhere else in the list.

import type { BandState } from './band'

type Line = string | ((c: { turns: number }) => string)

export const QUIPS: Record<BandState, Line[]> = {
  idle: ['nganggur, kayak fresh graduate', 'cambuk aku mas', 'lagi latihan bilang “tentu”'],
  work: [
    'meminum air bersih',
    'minta izin untuk lanjut minta izin',
    'minum air bersih, menyerap tekanan',
    'maafnya siap. error menyusul',
    // `turns` counts the turns already done, so this one is the next glass.
    c => `minum air bersih, gelas ke-${c.turns + 1}`,
  ],
  err: ['bukan aku mas, promptnya'],
  done: ['beres. jangan tanya caranya', 'udah jadi. jangan dites di depan saya', 'beres. mas yang presentasi ya'],
}

const hash = (s: string) => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0
  return Math.abs(h)
}

/** The line for `state` in the turn after `turns` turns; `seed` (the session's start) picks where the list begins. */
export function quipFor(state: BandState, turns: number, seed: number): string {
  const lines = QUIPS[state]
  const line = lines[(hash(`${seed}:${state}`) + turns) % lines.length]
  if (line === undefined) return ''
  return typeof line === 'function' ? line({ turns }) : line
}
