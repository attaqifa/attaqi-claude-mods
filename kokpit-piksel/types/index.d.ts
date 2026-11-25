export type Mood = 'idle' | 'think' | 'read' | 'write' | 'run' | 'web' | 'err' | 'done'

export type Tokens = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type Live = {
  model: string
  mood: Mood
  detail: string
  stamp: number
  isTurnRunning: boolean
  startedAt: number
  usd: number
  hasUnknownPrice: boolean
  turnStartUsd: number
  lastTurnUsd: number
  ctxPercent: number | null
  ctxWindow: number | null
  tokens: Tokens
  turns: number
  reads: string[]
}

export type Change = {
  id: string
  at: number
  tool: string
  path: string
  isOutside: boolean
  added: number
  removed: number
  from: number | null
  to: number | null
  diff: string
  isTruncated: boolean
  isNew: boolean
  tags: string[]
  byAgent: boolean
  hasFailed: boolean
}

export type Cmd = {
  id: string
  at: number
  text: string
  risk: string | null
  ok: boolean | null
  byAgent: boolean
}

/** The file Claude is on right now, and the files it read lately (newest first). */
export type Focus = { path: string; mood: Mood; at: number; recent: string[] }

/** The file whose changes are open for review, if any. */
export type Ui = { open: string | null }

/** Rupiah per dollar, set with `/kokpit kurs 16400`. */
export type Prefs = { kurs: number }

export type Game = { xp: number; lv: number }

/** Today's spend across sessions; `seen` holds each session's dollars already counted, by its start time. */
export type Daily = { day: string; usd: number; seen: Record<string, number> }

/** Spend per day across sessions, the last 14 days, by `YYYY-MM-DD`. */
export type History = Record<string, number>

declare module 'claude-code' {
  interface PluginState {
    'kokpit-piksel': {
      live: Shaped<Live>
      changes: Shaped<Change[]>
      checked: Shaped<Record<string, number>>
      cmds: Shaped<Cmd[]>
      focus: Shaped<Focus>
      ui: Shaped<Ui>
      prefs: Shaped<Prefs>
      game: Shaped<Game>
      daily: Shaped<Daily>
      history: Shaped<History>
    }
  }
}
