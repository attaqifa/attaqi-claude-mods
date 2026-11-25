// A hand-drawn pixel font, upper and lower case: capitals 7 cells tall,
// small letters 5 with 2 below the line for g, j, p, q, y. Drawn as SVG
// strokes one cell thick, a run of lit cells per stroke, since the Svg may
// carry no font file. Glyph rows are written top down, '/' between rows.

const RAW: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#',
  B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####',
  F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####',
  H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '###/.#./.#./.#./.#./.#./###',
  J: '.###/...#/...#/...#/...#/#..#/.##.',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#',
  L: '#.../#.../#.../#.../#.../#.../####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
  N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
  R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.###./#...#/#..../.###./....#/#...#/.###.',
  T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.',
  X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..',
  Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '..../..../.##./...#/.###/#..#/.###',
  b: '#.../#.../###./#..#/#..#/#..#/###.',
  c: '..../..../.##./#..#/#.../#..#/.##.',
  d: '...#/...#/.###/#..#/#..#/#..#/.###',
  e: '..../..../.##./#..#/####/#.../.###',
  f: '.##/#../###/#../#../#../#..',
  g: '..../..../.###/#..#/#..#/#..#/.###/...#/.##.',
  h: '#.../#.../###./#..#/#..#/#..#/#..#',
  i: '#/./#/#/#/#/#',
  j: '..#/.../..#/..#/..#/..#/..#/#.#/.#.',
  k: '#.../#.../#..#/#.#./##../#.#./#..#',
  l: '#./#./#./#./#./#./.#',
  m: '...../...../####./#.#.#/#.#.#/#.#.#/#.#.#',
  n: '..../..../###./#..#/#..#/#..#/#..#',
  o: '..../..../.##./#..#/#..#/#..#/.##.',
  p: '..../..../###./#..#/#..#/#..#/###./#.../#...',
  q: '..../..../.###/#..#/#..#/#..#/.###/...#/...#',
  r: '..../..../#.##/##../#.../#.../#...',
  s: '..../..../.###/#.../.##./...#/###.',
  t: '.#./.#./###/.#./.#./.#./..#',
  u: '..../..../#..#/#..#/#..#/#..#/.###',
  v: '...../...../#...#/#...#/.#.#./.#.#./..#..',
  w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '..../..../#..#/#..#/.##./#..#/#..#',
  y: '..../..../#..#/#..#/#..#/#..#/.###/...#/.##.',
  z: '..../..../####/...#/.##./#.../####',
  '0': '.##./#..#/#..#/#..#/#..#/#..#/.##.',
  '1': '.#./##./.#./.#./.#./.#./###',
  '2': '.##./#..#/...#/..#./.#../#.../####',
  '3': '.##./#..#/...#/.##./...#/#..#/.##.',
  '4': '...#/..##/.#.#/#..#/####/...#/...#',
  '5': '####/#.../###./...#/...#/#..#/.##.',
  '6': '.##./#.../#.../###./#..#/#..#/.##.',
  '7': '####/...#/...#/..#./.#../.#../.#..',
  '8': '.##./#..#/#..#/.##./#..#/#..#/.##.',
  '9': '.##./#..#/#..#/.###/...#/...#/.##.',
  ' ': '...',
  '.': '././././././#',
  ',': '././././././#/#',
  ':': '././#/./././#',
  ';': '././#/./././#/#',
  '!': '#/#/#/#/#/./#',
  '?': '.##./#..#/...#/..#./.#../..../.#..',
  "'": '#/#',
  '"': '#.#/#.#',
  '`': '#./.#',
  '-': '.../.../.../.../###',
  '+': '.../.../.../.#./###/.#.',
  '=': '.../.../.../###/.../###',
  _: '..../..../..../..../..../..../..../####',
  '/': '..#/..#/.#./.#./.#./#../#..',
  '\\': '#../#../.#./.#./.#./..#/..#',
  '|': '#/#/#/#/#/#/#',
  '%': '##..#/##.#./...#./..#../.#.../.#.##/#..##',
  '#': '.#.#./.#.#./#####/.#.#./#####/.#.#./.#.#.',
  $: '..#../.####/#.#../.###./..#.#/####./..#..',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#',
  '*': '...../..#../#.#.#/.###./#.#.#/..#..',
  '@': '.###./#...#/#.###/#.#.#/#.###/#..../.####',
  '(': '.#/#./#./#./#./#./.#',
  ')': '#./.#/.#/.#/.#/.#/#.',
  '[': '##/#./#./#./#./#./##',
  ']': '##/.#/.#/.#/.#/.#/##',
  '{': '.##/.#./.#./#../.#./.#./.##',
  '}': '##./.#./.#./..#/.#./.#./##.',
  '<': '.../..#/.#./#../.#./..#',
  '>': '.../#../.#./..#/.#./#..',
  '~': '..../..../..../.#.#/#.#.',
  '^': '.#./#.#',
  '·': './././././#',
  '…': '...../...../...../...../...../...../#.#.#',
  // Marks the pane's words use for what Claude is doing.
  '✓': '...../....#/...##/#.##./###../.#...',
  '✕': '...../#...#/.#.#./..#../.#.#./#...#',
  '○': '...../.###./#...#/#...#/#...#/.###.',
  '◐': '...../.###./##..#/##..#/##..#/.###.',
  '▤': '...../#####/#...#/#####/#...#/#####',
  '✎': '...../...##/..###/.###./###../#....',
  '▶': '#.../##../###./####/###./##../#...',
  '◍': '...../.###./#.#.#/#####/#.#.#/.###.',
}

type Glyph = { w: number; runs: [row: number, col: number, len: number][] }

const GLYPHS = new Map<string, Glyph>()
for (const [ch, spec] of Object.entries(RAW)) {
  const rows = spec.split('/')
  const runs: Glyph['runs'] = []
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (row[c] !== '#') {
        c++
        continue
      }
      let end = c
      while (row[end] === '#') end++
      runs.push([r, c, end - c])
      c = end
    }
  })
  GLYPHS.set(ch, { w: Math.max(...rows.map(r => r.length)), runs })
}

/** Cells from the top of a capital to the line it stands on, and a line of text with its gap. */
export const CAP = 7
export const LINE = 12

const ALIKE: [RegExp, string][] = [
  [/[“”„«»]/g, '"'],
  [/[‘’‚]/g, "'"],
  [/[–—−‐]/g, '-'],
  [/×/g, 'x'],
  [/[⚠❗]/g, '!'],
  [/[•∙]/g, '·'],
  [/[\t\r\n]+/g, ' '],
]

/** Folds accents and look-alikes onto drawn glyphs; anything else draws as '?'. */
export function normalize(s: string): string {
  let t = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const [re, to] of ALIKE) t = t.replace(re, to)
  return [...t].map(ch => (GLYPHS.has(ch) ? ch : '?')).join('')
}

const glyph = (ch: string): Glyph => GLYPHS.get(ch) ?? GLYPHS.get('?') ?? { w: 3, runs: [] }

function widthOf(text: string) {
  let w = 0
  for (const ch of text) w += glyph(ch).w + 1
  return Math.max(0, w - 1)
}

/** Width in cells. */
export const measure = (s: string) => widthOf(normalize(s))

/** Cuts the end off to fit maxW, marking the cut with '…'. */
export function fit(s: string, maxW: number): string {
  const chars = [...normalize(s)]
  if (widthOf(chars.join('')) <= maxW) return chars.join('')
  while (chars.length > 0 && widthOf(`${chars.join('')}…`) > maxW) chars.pop()
  return `${chars.join('').trimEnd()}…`
}

/** Cuts the middle out to fit maxW, keeping the end (a file's extension). */
export function fitMiddle(s: string, maxW: number, keep = 6): string {
  const chars = [...normalize(s)]
  if (widthOf(chars.join('')) <= maxW || chars.length <= keep + 1) return fit(s, maxW)
  const tail = chars.slice(-keep).join('')
  const head = chars.slice(0, -keep)
  while (head.length > 0 && widthOf(`${head.join('')}…${tail}`) > maxW) head.pop()
  return head.length === 0 ? fit(s, maxW) : `${head.join('')}…${tail}`
}

const num = (n: number) => String(Math.round(n * 100) / 100)

/**
 * Path data for text whose top-left is (x, y): every run of lit cells one
 * stroke, written relative to the last so the markup stays small.
 */
export function textPath(s: string, x: number, y: number): string {
  const runs: [number, number, number][] = []
  let at = Math.round(x)
  for (const ch of normalize(s)) {
    const g = glyph(ch)
    for (const [r, c, len] of g.runs) runs.push([at + c, r, len])
    at += g.w + 1
  }
  runs.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  let d = ''
  let cx = 0
  let cy = 0
  for (const [rx, r, len] of runs) {
    const ry = Math.round(y) + r + 0.5
    if (d === '') d = `M${num(rx)} ${num(ry)}h${len}`
    else if (ry === cy && rx === cx) d += `h${len}`
    else d += `m${num(rx - cx)} ${num(ry - cy)}h${len}`
    cx = rx + len
    cy = ry
  }
  return d
}

/** Needed once in any Svg that draws text: strokes, no fill. */
export const FONT_CSS = '.t{fill:none;stroke-width:1}'

/** A run of text in one colour; empty text draws nothing. */
export function pixText(s: string, x: number, y: number, color: string, cls = ''): string {
  const d = textPath(s, x, y)
  if (!d) return ''
  return `<path class="t${cls ? ` ${cls}` : ''}" stroke="${color}" d="${d}"/>`
}
