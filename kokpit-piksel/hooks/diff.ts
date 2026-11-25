// Line diff for the changes tab: what an edit did to a file, as unified hunks
// the `Code` element draws with format="diff".

export type DiffResult = {
  added: number
  removed: number
  /** First and last changed line in the new file (1-based); null if none. */
  from: number | null
  to: number | null
  diff: string
  isTruncated: boolean
}

type Op = { k: ' ' | '-' | '+'; text: string; a: number; b: number }

const CONTEXT = 2
const MAX_LINES = 80
const MAX_LCS = 160_000

const clean = (line: string) =>
  line.replace(/\r$/, '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')

const splitLines = (text: string | null) => {
  if (text === null || text === '') return []
  const lines = text.split('\n').map(clean)
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function middleOps(a: string[], b: string[], a0: number, b0: number): Op[] {
  if (a.length * b.length > MAX_LCS) {
    return [
      ...a.map((text, i) => ({ k: '-' as const, text, a: a0 + i, b: b0 })),
      ...b.map((text, j) => ({ k: '+' as const, text, a: a0 + a.length, b: b0 + j })),
    ]
  }
  const n = a.length
  const m = b.length
  const w = m + 1
  const dp = new Uint32Array((n + 1) * w)
  const at = (i: number, j: number) => dp[i * w + j] ?? 0
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ k: ' ', text: a[i] ?? '', a: a0 + i, b: b0 + j })
      i++
      j++
    } else if (j < m && (i === n || at(i, j + 1) >= at(i + 1, j))) {
      ops.push({ k: '+', text: b[j] ?? '', a: a0 + i, b: b0 + j })
      j++
    } else {
      ops.push({ k: '-', text: a[i] ?? '', a: a0 + i, b: b0 + j })
      i++
    }
  }
  return ops
}

export function diffText(before: string | null, after: string | null): DiffResult {
  const a = splitLines(before)
  const b = splitLines(after)
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  let s = 0
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++

  const mid = middleOps(a.slice(p, a.length - s), b.slice(p, b.length - s), p, p)
  const added = mid.filter(o => o.k === '+').length
  const removed = mid.filter(o => o.k === '-').length
  if (added === 0 && removed === 0) {
    return { added, removed, from: null, to: null, diff: '', isTruncated: false }
  }

  const head: Op[] = []
  for (let i = Math.max(0, p - CONTEXT); i < p; i++) head.push({ k: ' ', text: a[i] ?? '', a: i, b: i })
  const tail: Op[] = []
  for (let t = 0; t < Math.min(CONTEXT, s); t++) {
    const ai = a.length - s + t
    const bi = b.length - s + t
    tail.push({ k: ' ', text: a[ai] ?? '', a: ai, b: bi })
  }
  const ops = [...head, ...mid, ...tail]

  // Split into hunks where a run of unchanged lines is longer than 2 x context.
  const hunks: Op[][] = []
  let cur: Op[] = []
  let run: Op[] = []
  for (const op of ops) {
    if (op.k === ' ') {
      run.push(op)
      continue
    }
    if (run.length > 0) {
      if (cur.length > 0 && run.length > CONTEXT * 2) {
        cur.push(...run.slice(0, CONTEXT))
        hunks.push(cur)
        cur = run.slice(-CONTEXT)
      } else {
        cur.push(...(cur.length === 0 ? run.slice(-CONTEXT) : run))
      }
      run = []
    }
    cur.push(op)
  }
  cur.push(...run.slice(0, CONTEXT))
  hunks.push(cur)

  let budget = MAX_LINES
  let isTruncated = false
  const out: string[] = []
  for (const hunk of hunks) {
    if (budget <= 0) {
      isTruncated = true
      break
    }
    const lines = hunk.slice(0, budget)
    const first = lines[0]
    if (!first) continue
    if (lines.length < hunk.length) isTruncated = true
    budget -= lines.length
    const oldCount = lines.filter(o => o.k !== '+').length
    const newCount = lines.filter(o => o.k !== '-').length
    const oldStart = first.a + (oldCount === 0 ? 0 : 1)
    const newStart = first.b + (newCount === 0 ? 0 : 1)
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`)
    for (const op of lines) out.push(op.k + op.text.slice(0, 400))
  }

  const changedNew = mid.filter(o => o.k === '+')
  const firstNew = changedNew[0]
  const lastNew = changedNew[changedNew.length - 1]
  const from = firstNew ? firstNew.b + 1 : Math.min(p + 1, Math.max(1, b.length))
  const to = lastNew ? lastNew.b + 1 : from

  return { added, removed, from, to, diff: out.join('\n'), isTruncated }
}
