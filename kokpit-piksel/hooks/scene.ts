// The pixel room as one SVG: every pixel a <rect>, motion as CSS flipbooks
// (frames toggled with step-end) and stepped translations, interaction as
// :hover / :active zones read with :has(). No script: the desktop draws an
// interactive Svg in a script-less sandboxed frame.

import type { Mood } from '../types'

export type Costume = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'claude'

export type SceneInput = {
  costume: Costume
  mood: Mood
  accent: string
  hour: number
  minute: number
  name: string
  title: string
  detail: string
}

type Pt = [number, number]

const W = 68
const H = 44
const OX = 24
const OY = 25
const TAU = Math.PI * 2

const C = {
  wood: '#A0703F',
  wood2: '#7A5230',
  body: '#D97757',
  hi: '#EBA083',
  sh: '#B5573A',
  ol: '#6E3420',
  eye: '#2C2C2A',
  scr: '#1E1E1C',
  frm: '#3A3A38',
  paper: '#F1EFE8',
  gold: '#EF9F27',
  gold2: '#BA7517',
  sun: '#FAC775',
  red: '#E24B4A',
  blush: '#F0997B',
}

const BASE_CSS =
  '.wall{fill:#EFE7DA}.wall2{fill:#E5DACA}.floor{fill:#D8C8B0}.floor2{fill:#CAB89D}' +
  '.shd{fill:#C4B194}.sm{fill:#B9B5AB}.wh{fill:#F7F4EE}' +
  '@media (prefers-color-scheme:dark){.wall{fill:#2B2825}.wall2{fill:#34302B}' +
  '.floor{fill:#3B342D}.floor2{fill:#322C26}.shd{fill:#24201C}.sm{fill:#6B6862}}' +
  '.fb{opacity:0}.z{pointer-events:all}.zm,.zw,.zk,.zs,.zc,.zp{cursor:pointer}' +
  '.bc,.eh,.mh,.aw,.hearts,.bird{opacity:0}' +
  '.bo{animation:bo 3.7s step-end infinite}.bc{animation:bc 3.7s step-end infinite}' +
  '@keyframes bo{0%{opacity:1}96%{opacity:0}100%{opacity:0}}' +
  '@keyframes bc{0%{opacity:0}96%{opacity:1}100%{opacity:1}}' +
  '.jump{transition:transform .14s steps(3)}' +
  'svg:has(.zm:active) .jump{transform:translateY(-4px)}' +
  'svg:has(.zm:active) .hearts{opacity:1}' +
  'svg:has(.zm:active) .eh{opacity:1}svg:has(.zm:active) .eo{opacity:0}' +
  'svg:has(.zm:hover) .blush{opacity:1}' +
  'svg:has(.zm:hover) .mh{opacity:1}svg:has(.zm:hover) .ms{opacity:0}' +
  'svg:has(.zm:hover) .aw{opacity:1}svg:has(.zm:hover) .ar{opacity:0}' +
  'svg:has(.zw:hover) .bird{opacity:1}' +
  'svg:has(.zp:hover) .plant{animation-duration:400ms}' +
  'svg:has(.zc:hover) .st{animation-duration:.7s}' +
  '.hearts{animation:hr .8s steps(5) infinite}' +
  '@keyframes hr{0%{transform:translateY(0)}100%{transform:translateY(-5px)}}' +
  '.cl1{animation:cl 22s steps(26) infinite}.cl2{animation:cl 30s steps(26) infinite;animation-delay:-13s}' +
  '@keyframes cl{0%{transform:translateX(-8px)}100%{transform:translateX(18px)}}' +
  '.bird{animation:bd 2.4s steps(12) infinite}' +
  '@keyframes bd{0%{transform:translate(0,0)}100%{transform:translate(16px,-2px)}}' +
  '.st{animation:st 1.8s steps(4) infinite}' +
  '@keyframes st{0%{transform:translateY(0);opacity:.9}100%{transform:translateY(-4px);opacity:0}}' +
  '.mv-idle{animation:bob 2.6s step-end infinite}' +
  '.mv-think,.mv-read,.mv-web{animation:bob 3.4s step-end infinite}' +
  '@keyframes bob{0%{transform:translateY(0)}50%{transform:translateY(1px)}}' +
  '.mv-run,.mv-write{animation:trot .36s step-end infinite}' +
  '@keyframes trot{0%{transform:translateY(0)}50%{transform:translateY(-1px)}}' +
  '.mv-err{animation:shake .12s step-end 12}' +
  '@keyframes shake{0%{transform:translateX(1px)}50%{transform:translateX(-1px)}}' +
  '.mv-done{animation:hop .8s step-end infinite}' +
  '@keyframes hop{0%{transform:translateY(0)}12%{transform:translateY(-2px)}25%{transform:translateY(-3px)}' +
  '37%{transform:translateY(-4px)}62%{transform:translateY(-3px)}75%{transform:translateY(-2px)}87%{transform:translateY(0)}}' +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

class Pix {
  readonly out: string[] = []
  readonly css: string[] = []
  private readonly seen = new Set<string>()

  r(x: number, y: number, w: number, h: number, c: string) {
    const paint = c.startsWith('.') ? `class="${c.slice(1)}"` : `fill="${c}"`
    this.out.push(`<rect x="${Math.round(x)}" y="${Math.round(y)}" width="${w}" height="${h}" ${paint}/>`)
  }

  p(x: number, y: number, c: string) {
    this.r(x, y, 1, 1, c)
  }

  g(cls: string, draw: () => void, attrs = '') {
    this.out.push(`<g class="${cls}"${attrs}>`)
    draw()
    this.out.push('</g>')
  }

  rule(key: string, css: string) {
    if (this.seen.has(key)) return
    this.seen.add(key)
    this.css.push(css)
  }

  /** n frames over ms, each a group shown for its slice of the loop. */
  frames(n: number, ms: number, draw: (i: number) => void, extra = '') {
    for (let i = 0; i < n; i++) {
      const k = `f${n}_${ms}_${i}`
      const a = ((i / n) * 100).toFixed(2)
      const b = (((i + 1) / n) * 100).toFixed(2)
      const kf =
        i === 0
          ? `0%{opacity:1}${b}%{opacity:0}100%{opacity:0}`
          : i === n - 1
            ? `0%{opacity:0}${a}%{opacity:1}100%{opacity:1}`
            : `0%{opacity:0}${a}%{opacity:1}${b}%{opacity:0}100%{opacity:0}`
      this.rule(k, `.${k}{animation:${k} ${ms}ms step-end infinite}${i === 0 ? `.${k}{opacity:1}` : ''}@keyframes ${k}{${kf}}`)
      this.g(`fb ${k}${extra ? ` ${extra}` : ''}`, () => draw(i))
    }
  }
}

function skyMode(hour: number) {
  if (hour >= 6 && hour < 17) return 'day'
  if ((hour >= 17 && hour < 19) || hour === 5) return 'dusk'
  return 'night'
}

function room(b: Pix, s: SceneInput) {
  b.r(0, 0, W, 37, '.wall')
  for (let i = 3; i < W; i += 8) b.r(i, 0, 1, 36, '.wall2')
  b.r(0, 36, W, 1, C.wood2)
  b.r(0, 37, W, 7, '.floor')
  b.r(0, 40, W, 1, '.floor2')
  b.r(0, 43, W, 1, '.floor2')
  for (let i = 5; i < W; i += 11) b.r(i, 37, 1, 3, '.floor2')
  for (let i = 0; i < W; i += 13) b.r(i, 41, 1, 2, '.floor2')

  // Window with the sky of the hour.
  const mode = skyMode(s.hour)
  const sky = mode === 'day' ? '#9FD3F0' : mode === 'dusk' ? '#F5B08A' : '#1B2240'
  b.r(4, 4, 16, 12, '#8A7560')
  b.r(5, 5, 14, 10, sky)
  b.g('', () => {
    if (mode === 'day') {
      b.r(15, 6, 3, 3, C.sun)
      b.p(14, 7, C.sun)
      b.p(18, 7, C.sun)
      b.g('cl1', () => {
        b.r(0, 9, 6, 1, '#fff')
        b.r(1, 8, 3, 1, '#fff')
      })
      b.g('cl2', () => {
        b.r(0, 12, 5, 1, '#fff')
        b.r(1, 11, 2, 1, '#fff')
      })
    } else if (mode === 'dusk') {
      b.r(9, 12, 6, 3, C.sun)
      b.r(10, 11, 4, 1, C.sun)
      b.r(5, 14, 14, 1, '#D85A30')
      b.r(6, 8, 4, 1, '#F0997B')
    } else {
      b.r(15, 6, 2, 2, C.paper)
      b.p(16, 6, sky)
      const stars: Pt[] = [[6, 6], [9, 8], [13, 6], [7, 11], [12, 12], [17, 11], [10, 6], [14, 9]]
      stars.forEach(([x, y], i) => {
        b.rule(`tw${i}`, `.tw${i}{animation:tw 2.${i}s step-end infinite;animation-delay:-${i * 0.37}s}`)
        b.g(`tw${i}`, () => b.p(x, y, C.sun))
      })
      b.rule('tw', '@keyframes tw{0%{opacity:1}70%{opacity:.2}}')
    }
    b.g('bird', () => {
      if (mode === 'night') {
        b.r(3, 6, 2, 1, C.sun)
      } else {
        b.p(3, 7, '#5F5E5A')
        b.p(4, 8, '#5F5E5A')
        b.p(5, 7, '#5F5E5A')
      }
    })
  }, ' clip-path="url(#win)"')
  b.r(11, 5, 1, 10, '#8A7560')
  b.r(5, 9, 14, 1, '#8A7560')
  b.r(3, 16, 18, 1, '#7A6550')

  // Wall clock, hands at the hour drawn.
  b.r(27, 5, 5, 1, '#5F5E5A')
  b.r(27, 11, 5, 1, '#5F5E5A')
  b.r(26, 6, 1, 5, '#5F5E5A')
  b.r(32, 6, 1, 5, '#5F5E5A')
  b.r(27, 6, 5, 5, C.paper)
  const mi = (s.minute / 60) * TAU
  const ho = (((s.hour % 12) + s.minute / 60) / 12) * TAU
  for (let k = 1; k <= 2; k++) b.p(29 + Math.sin(mi) * k, 8 - Math.cos(mi) * k, C.eye)
  b.p(29 + Math.sin(ho), 8 - Math.cos(ho), C.red)
  b.p(29, 8, C.eye)

  // Plant that sways.
  b.r(3, 33, 5, 4, '#993C1D')
  b.r(2, 32, 7, 1, '#B5573A')
  const leaves: Pt[] = [[5, 31], [5, 30], [4, 29], [6, 29], [5, 28], [3, 28], [7, 28], [4, 27], [6, 27], [5, 26], [3, 26], [7, 26], [2, 27], [8, 27]]
  b.frames(2, 1600, i => {
    leaves.forEach(([x, y], k) => b.p(x + (y < 29 ? i : 0), y, k % 3 ? '#639922' : '#3B6D11'))
  }, 'plant')

  // Desk, monitor, keyboard, mug with steam.
  b.r(34, 28, 33, 1, C.wood)
  b.r(34, 29, 33, 1, C.wood2)
  b.r(36, 30, 2, 7, C.wood2)
  b.r(63, 30, 2, 7, C.wood2)
  b.r(46, 15, 15, 12, C.frm)
  b.r(52, 27, 3, 1, C.frm)
  screen(b, s)
  b.r(40, 27, 11, 1, '#B4B2A9')
  for (let i = 41; i < 50; i += 2) b.p(i, 27, '#D3D1C7')
  b.r(62, 25, 3, 3, C.paper)
  b.p(65, 26, C.paper)
  b.r(62, 25, 3, 1, '#6B4226')
  for (let k = 0; k < 3; k++) {
    b.rule(`st${k}`, `.st${k}{animation-delay:-${k * 0.6}s}`)
    b.g(`st st${k}`, () => b.p(62 + k, 24 - (k % 2), '.sm'))
  }
}

function screen(b: Pix, s: SceneInput) {
  const sx = 47
  const sy = 16
  const a = s.accent
  const bg = s.mood === 'done' ? '#173404' : C.scr
  b.r(sx, sy, 13, 10, bg)
  switch (s.mood) {
    case 'idle':
      b.frames(16, 3200, i => {
        const u = i * 1.2
        b.r(sx + Math.abs((u % 22) - 11), sy + Math.abs(((u * 0.7) % 16) - 8), 2, 2, a)
      })
      break
    case 'think':
      b.frames(4, 1400, n => {
        for (let k = 0; k < 3; k++) b.r(sx + 3 + k * 3, sy + 4, 1, 2, k < n ? a : '#444441')
      })
      break
    case 'read':
      b.frames(5, 2500, o => {
        for (let r = 0; r < 5; r++) b.r(sx + 1, sy + 1 + r * 2, 4 + (((r + o) * 7) % 8), 1, r === o ? a : '#5F5E5A')
      })
      break
    case 'write': {
      const L: [number, number, string][] = [
        [0, 6, a], [1, 8, '#5DCAA5'], [1, 5, C.sun], [2, 7, '#85B7EB'], [1, 4, '#5DCAA5'],
        [0, 3, a], [0, 7, '#F0997B'], [1, 9, C.sun], [1, 6, '#85B7EB'],
      ]
      b.frames(L.length, 3600, i => {
        const n = i + 1
        const s0 = Math.max(0, n - 5)
        for (let r = s0; r < n; r++) {
          const line = L[r]
          if (line) b.r(sx + 1 + line[0], sy + 1 + (r - s0) * 2, line[1], 1, line[2])
        }
        const last = L[n - 1]
        if (last) b.p(sx + 2 + last[0] + last[1], sy + 1 + (n - 1 - s0) * 2, C.paper)
      })
      break
    }
    case 'run':
      b.frames(8, 2000, o => {
        for (let r = 0; r < 4; r++) {
          b.p(sx + 1, sy + 1 + r * 2, '#97C459')
          b.r(sx + 3, sy + 1 + r * 2, 2 + (((o + r) * 5) % 8), 1, '#C0DD97')
        }
        b.r(sx + 1, sy + 9, 11, 1, '#27500A')
        b.r(sx + 1, sy + 9, Math.round(((o + 1) / 8) * 11), 1, '#97C459')
      })
      break
    case 'web':
      b.frames(8, 2400, i => {
        const ph = (i * (TAU / 0.9)) / 8
        const cx = sx + 6
        const cy = sy + 5
        for (let y = -4; y <= 4; y++) {
          for (let x = -4; x <= 4; x++) {
            if (x * x + y * y > 17) continue
            const land = Math.sin((x + ph) * 0.9) + Math.cos(y * 1.2 + x * 0.3) > 0.9
            b.p(cx + x, cy + y, land ? '#639922' : '#378ADD')
          }
        }
      })
      break
    case 'err':
      b.frames(2, 500, i => b.r(sx, sy, 13, 10, i ? '#501313' : '#791F1F'))
      b.r(sx + 6, sy + 2, 1, 4, '#fff')
      b.p(sx + 6, sy + 7, '#fff')
      break
    case 'done':
      ;([[2, 5], [3, 6], [4, 7], [5, 6], [6, 5], [7, 4], [8, 3], [9, 2]] as Pt[]).forEach(([x, y]) => {
        b.p(sx + 1 + x, sy + y, '#97C459')
        b.p(sx + 1 + x, sy + y + 1, '#97C459')
      })
      break
  }
}

function eyesDefault(mood: Mood): [number, number] {
  if (mood === 'think') return [1, -1]
  if (mood === 'read') return [0, 1]
  if (mood === 'write' || mood === 'run' || mood === 'web') return [1, 0]
  return [0, 0]
}

/** Claude with its costume, body top-left at (ox, oy); `isSmall` leaves out the floor shadow and the thought bubble. */
function buddy(b: Pix, s: SceneInput, ox = OX, oy = OY, isSmall = false) {
  const { mood, costume } = s
  const a = s.accent

  if (!isSmall) b.r(ox + 2, oy + 12, 12, 1, '.shd')

  b.g('jump', () =>
    b.g(`mv mv-${mood}`, () => {
      // Back of the costume.
      if (costume === 'opus') {
        b.frames(4, 1000, i => {
          const ph = (i * TAU) / 4
          for (let c = -1; c < 17; c++) {
            b.r(ox + c, oy + 2, 1, 9 + (Math.sin(ph + c * 0.7) > 0 ? 2 : 1), c % 2 ? '#534AB7' : '#3C3489')
          }
        })
      }
      if (costume === 'haiku') {
        b.frames(4, 600, i => {
          const ph = (i * TAU) / 4
          for (let q = 0; q < 2; q++) {
            for (let j = 1; j <= 5; j++) {
              b.p(ox - 1 - j, oy + 1 + q + Math.round(Math.sin(ph - j * 0.9) * (j / 3)), j % 2 ? C.paper : C.red)
            }
          }
        })
      }

      // Body with outline, shade and light.
      b.r(ox + 1, oy - 1, 14, 1, C.ol)
      b.r(ox + 1, oy + 10, 14, 1, C.ol)
      b.r(ox - 1, oy + 1, 1, 8, C.ol)
      b.r(ox + 16, oy + 1, 1, 8, C.ol)
      b.p(ox, oy, C.ol)
      b.p(ox + 15, oy, C.ol)
      b.p(ox, oy + 9, C.ol)
      b.p(ox + 15, oy + 9, C.ol)
      b.r(ox + 1, oy, 14, 1, C.body)
      b.r(ox, oy + 1, 16, 8, C.body)
      b.r(ox + 1, oy + 9, 14, 1, C.sh)
      b.r(ox + 15, oy + 1, 1, 8, C.sh)
      b.r(ox + 3, oy + 1, 2, 1, C.hi)
      b.p(ox + 2, oy + 1, C.hi)
      b.p(ox + 2, oy + 2, C.hi)

      // Legs.
      const legs = [2, 5, 10, 13]
      if (mood === 'run') {
        b.frames(2, 300, lp => legs.forEach((lx, k) => b.r(ox + lx, oy + 10, 1, k % 2 === lp ? 1 : 2, C.sh)))
      } else {
        legs.forEach(lx => b.r(ox + lx, oy + 10, 1, mood === 'done' ? 1 : 2, C.sh))
      }

      // Arms by what it is doing.
      const leftArm = () => b.r(ox - 2, oy + 4, 2, 3, C.body)
      if (mood === 'write') {
        b.frames(2, 260, i => {
          b.r(ox - 2, oy + 4 + i, 2, 2, C.body)
          b.r(ox + 16, oy + 3 + (1 - i), 3, 2, C.body)
        })
      } else if (mood === 'done') {
        b.r(ox - 2, oy + 1, 2, 3, C.body)
        b.r(ox + 16, oy + 1, 2, 3, C.body)
      } else if (mood === 'read') {
        b.r(ox + 1, oy + 6, 2, 2, C.sh)
        b.r(ox + 13, oy + 6, 2, 2, C.sh)
      } else if (mood === 'web') {
        leftArm()
        b.r(ox + 16, oy + 3, 2, 2, C.body)
      } else {
        leftArm()
        b.g('ar', () => {
          if (mood === 'idle') {
            b.frames(12, 6000, i => b.r(ox + 16, oy + (i === 9 || i === 11 ? 2 : 4), 2, 3, C.body))
          } else {
            b.r(ox + 16, oy + 4, 2, 3, C.body)
          }
        })
        b.g('aw', () => b.frames(2, 320, i => b.r(ox + 16, oy + (i ? 3 : 1), 2, 3, C.body)))
      }

      // Eyes: follow the pointer zones, blink, squint when pressed.
      const [dx, dy] = eyesDefault(mood)
      b.rule('eyes', `.eyes{transform:translate(${dx}px,${dy}px)}`)
      b.g('eyes', () => {
        for (const bx of [ox + 4, ox + 10]) {
          const by = oy + 3
          if (mood === 'err') {
            b.g('eo', () => ([[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]] as Pt[]).forEach(([x, y]) => b.p(bx + x, by + y, C.eye)))
          } else if (mood === 'done') {
            b.p(bx, by + 1, C.eye)
            b.p(bx + 1, by, C.eye)
            b.p(bx + 2, by + 1, C.eye)
          } else {
            b.g('eo', () => {
              b.g('bo', () => {
                b.r(bx, by, 2, 3, C.eye)
                b.p(bx, by, '#fff')
              })
              b.g('bc', () => b.r(bx, by + 2, 2, 1, C.eye))
            })
          }
          if (mood !== 'done') {
            b.g('eh', () => {
              b.p(bx, by + 1, C.eye)
              b.p(bx + 1, by, C.eye)
              b.p(bx + 2, by + 1, C.eye)
            })
          }
        }
      })

      // Mouth by mood, a smile on hover.
      b.g('ms', () => {
        if (mood === 'done') {
          b.p(ox + 6, oy + 6, C.eye)
          b.r(ox + 7, oy + 7, 2, 1, C.eye)
          b.p(ox + 9, oy + 6, C.eye)
        } else if (mood === 'err') {
          b.p(ox + 6, oy + 7, C.eye)
          b.p(ox + 7, oy + 6, C.eye)
          b.p(ox + 8, oy + 7, C.eye)
          b.p(ox + 9, oy + 6, C.eye)
        } else if (mood === 'think') {
          b.p(ox + 8, oy + 7, C.eye)
        }
      })
      b.g('mh', () => {
        b.p(ox + 6, oy + 6, C.eye)
        b.r(ox + 7, oy + 7, 2, 1, C.eye)
        b.p(ox + 9, oy + 6, C.eye)
      })
      b.g('blush', () => {
        b.r(ox + 2, oy + 6, 2, 1, C.blush)
        b.r(ox + 12, oy + 6, 2, 1, C.blush)
      }, mood === 'done' ? '' : ' opacity="0"')

      // Front of the costume.
      if (costume === 'opus') {
        const G = C.gold
        b.r(ox + 4, oy - 2, 8, 1, G)
        b.r(ox + 4, oy - 1, 8, 1, C.gold2)
        ;([[4, -3], [4, -4], [7, -3], [8, -3], [7, -4], [8, -4], [7, -5], [8, -5], [11, -3], [11, -4]] as Pt[]).forEach(([x, y]) => b.p(ox + x, oy + y, G))
        b.p(ox + 7, oy - 2, '#7F77DD')
        b.p(ox + 8, oy - 2, '#7F77DD')
        b.p(ox + 5, oy - 2, C.red)
        b.p(ox + 10, oy - 2, C.red)
        b.frames(8, 2600, i => {
          if (i !== 0) return
          b.p(ox + 13, oy - 5, '#fff')
          b.p(ox + 12, oy - 5, C.sun)
          b.p(ox + 14, oy - 5, C.sun)
          b.p(ox + 13, oy - 6, C.sun)
          b.p(ox + 13, oy - 4, C.sun)
        })
      }
      if (costume === 'sonnet') {
        const T1 = '#1D9E75'
        const T2 = '#0F6E56'
        const T3 = '#5DCAA5'
        b.r(ox + 2, oy - 1, 12, 1, T2)
        b.r(ox + 3, oy - 2, 11, 1, T1)
        b.r(ox + 5, oy - 3, 8, 1, T1)
        b.p(ox + 7, oy - 3, T3)
        b.p(ox + 6, oy - 2, T3)
        b.p(ox + 10, oy - 4, T2)
        for (let c = 0; c < 16; c++) b.r(ox + c, oy + 8, 1, 2, c % 4 < 2 ? T1 : T3)
        b.frames(4, 900, i => {
          const ph = (i * TAU) / 4
          for (let q = 0; q < 4; q++) b.r(ox + 12 + Math.round(Math.sin(ph - q * 0.8) * (q / 2)), oy + 10 + q, 2, 1, q % 2 ? T3 : T1)
        })
        if (mood === 'write') {
          b.p(ox + 19, oy, C.paper)
          b.p(ox + 19, oy + 1, C.paper)
          b.p(ox + 18, oy + 1, C.paper)
          b.p(ox + 18, oy + 2, C.paper)
          b.p(ox + 17, oy + 3, C.eye)
        }
      }
      if (costume === 'haiku') {
        b.r(ox, oy + 1, 16, 1, C.paper)
        b.r(ox + 7, oy + 1, 2, 1, C.red)
        b.p(ox - 1, oy + 1, C.paper)
        b.p(ox - 1, oy + 2, C.paper)
        if (mood === 'run' || mood === 'write') {
          b.frames(4, 400, i => {
            for (let q = 0; q < 3; q++) b.r(ox - 6 - ((i * 4 + q * 7) % 8), oy + 3 + q * 3, 4, 1, '.sm')
          })
        }
      }
      if (costume === 'fable') {
        const H1 = '#854F0B'
        const GO = C.sun
        b.r(ox - 1, oy - 1, 18, 1, '#633806')
        b.r(ox + 3, oy - 2, 10, 1, GO)
        b.r(ox + 4, oy - 3, 8, 1, H1)
        b.r(ox + 5, oy - 4, 6, 1, H1)
        b.r(ox + 6, oy - 5, 4, 1, H1)
        b.r(ox + 7, oy - 6, 3, 1, H1)
        b.p(ox + 6, oy - 4, GO)
        b.frames(4, 2400, i => {
          const sw = [0, 1, 0, -1][i] ?? 0
          b.r(ox + 8 + (sw > 0 ? 1 : 0), oy - 7, 2, 1, H1)
          b.p(ox + 10 + sw, oy - 8, H1)
          b.p(ox + 11 + sw, oy - 9, GO)
        })
        b.frames(2, 1800, i => {
          if (i === 0) b.p(ox + 9, oy - 3, GO)
        })
        b.frames(12, 3000, i => {
          for (let k = 0; k < 3; k++) {
            const an = (i * TAU) / 12 + k * 2.094
            b.p(ox + 8 + Math.cos(an) * 12, oy + 4 + Math.sin(an) * 5, k % 2 ? '#fff' : GO)
          }
        })
      }

      // Props by mood.
      if (mood === 'read') {
        b.r(ox + 3, oy + 6, 10, 5, a)
        b.r(ox + 4, oy + 6, 3, 4, C.paper)
        b.r(ox + 9, oy + 6, 3, 4, C.paper)
        b.r(ox + 7, oy + 6, 2, 5, a)
        for (let l = 0; l < 2; l++) {
          b.r(ox + 4, oy + 7 + l * 2, 3, 1, '#B4B2A9')
          b.r(ox + 9, oy + 7 + l * 2, 3, 1, '#B4B2A9')
        }
        b.frames(6, 1800, i => {
          if (i === 0) b.r(ox + 7, oy + 5, 2, 1, C.paper)
          if (costume === 'fable') b.p(ox + 8, oy + 4 - (i % 3), GO_SPARK)
        })
      }
      if (mood === 'web') {
        b.frames(8, 2000, i => {
          const ph = (i * TAU) / 8
          const mx = ox + 18 + Math.round(Math.sin(ph))
          const my = oy - 1 + Math.round(Math.cos(ph))
          b.r(mx, my, 3, 1, '#5F5E5A')
          b.r(mx, my + 3, 3, 1, '#5F5E5A')
          b.r(mx - 1, my + 1, 1, 2, '#5F5E5A')
          b.r(mx + 3, my + 1, 1, 2, '#5F5E5A')
          b.r(mx, my + 1, 3, 2, '#B5D4F4')
          b.p(mx - 1, my + 4, '#5F5E5A')
          b.p(mx - 2, my + 5, '#5F5E5A')
        })
      }
      if (mood === 'think' && !isSmall) {
        b.p(ox + 14, oy - 3, '.sm')
        b.r(ox + 15, oy - 6, 2, 2, '.sm')
        const bx = ox + 14
        const by = oy - 16
        b.r(bx + 1, by, 9, 6, '.sm')
        b.r(bx, by + 1, 11, 4, '.sm')
        b.r(bx + 1, by + 1, 9, 4, '.wh')
        b.frames(4, 1400, n => {
          for (let k = 0; k < 3; k++) b.r(bx + 3 + k * 2, by + 2, 1, 2, k < n ? C.eye : '#D3D1C7')
        })
      }
      if (mood === 'run') {
        b.frames(3, 750, i => b.p(ox + 16, oy - 1 + i, '#85B7EB'))
      }

      // Hearts while pressed.
      b.g('hearts', () => {
        const heart: Pt[] = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]]
        const spots: Pt[] = [[ox - 2, oy - 8], [ox + 13, oy - 10]]
        for (const [hx, hy] of spots) heart.forEach(([x, y]) => b.p(hx + x, hy + y, C.red))
      })
    }),
  )
}

const GO_SPARK = '#FAC775'

function particles(b: Pix, s: SceneInput) {
  if (s.costume === 'haiku') {
    for (let k = 0; k < 10; k++) {
      const x0 = ((k * 13 + 5) % 70) - 12
      b.rule(
        `pt${k}`,
        `.pt${k}{animation:pt${k} ${6 + (k % 3)}s steps(48) infinite;animation-delay:-${(k * 0.73).toFixed(2)}s}` +
          `@keyframes pt${k}{0%{transform:translate(0,-2px)}100%{transform:translate(${14 + (k % 4) * 3}px,48px)}}`,
      )
      b.g(`pt${k}`, () => b.r(x0, 0, k % 3 === 0 ? 2 : 1, 1, k % 2 ? '#ED93B1' : '#F4C0D1'))
    }
  }
  if (s.mood === 'err') {
    for (let k = 0; k < 6; k++) {
      const dx = (k % 2 ? 1 : -1) * (1 + (k % 3))
      b.rule(
        `sk${k}`,
        `.sk${k}{animation:sk${k} 1.2s steps(9) infinite;animation-delay:-${(k * 0.2).toFixed(1)}s}` +
          `@keyframes sk${k}{0%{transform:translate(0,0);opacity:1}100%{transform:translate(${dx}px,-9px);opacity:0}}`,
      )
      b.g(`sk${k}`, () => b.r(OX + 6 + (k % 3) * 2, OY - 2, k % 2 ? 2 : 1, k % 2 ? 2 : 1, '.sm'))
    }
  }
  if (s.mood === 'done') {
    const palette = [s.accent, C.gold, '#5DCAA5', '#ED93B1', '#85B7EB']
    for (let k = 0; k < 18; k++) {
      const x0 = (k * 11 + 3) % W
      b.rule(
        `cf${k}`,
        `.cf${k}{animation:cf${k} ${(2.6 + (k % 4) * 0.4).toFixed(1)}s steps(40) infinite;animation-delay:-${(k * 0.31).toFixed(2)}s}` +
          `@keyframes cf${k}{0%{transform:translate(0,-4px)}100%{transform:translate(${((k % 5) - 2) * 3}px,50px)}}`,
      )
      b.g(`cf${k}`, () => b.r(x0, 0, k % 3 === 0 ? 2 : 1, 1, palette[k % palette.length] ?? s.accent))
    }
  }
}

function zones(b: Pix, s: SceneInput) {
  const rows: Pt[] = [[0, 18], [18, 16], [34, 10]]
  const cols: Pt[] = [[0, 22], [22, 22], [44, 24]]
  const zone = (cls: string, x: number, y: number, w: number, h: number, title = '') =>
    b.out.push(
      `<rect class="z ${cls}" x="${x}" y="${y}" width="${w}" height="${h}" fill="#000" fill-opacity="0">${title ? `<title>${esc(title)}</title>` : ''}</rect>`,
    )
  const look = (cls: string, x: number, y: number) =>
    b.rule(`look-${cls}`, `svg:has(.${cls}:hover) .eyes{transform:translate(${x}px,${y}px)}`)

  cols.forEach(([x, w], c) =>
    rows.forEach(([y, h], r) => {
      zone(`zg${c}${r}`, x, y, w, h)
      look(`zg${c}${r}`, c - 1, r - 1)
    }),
  )
  const hh = String(s.hour).padStart(2, '0')
  const mm = String(s.minute).padStart(2, '0')
  const sky = skyMode(s.hour)
  zone('zw', 3, 3, 18, 14, sky === 'day' ? 'Langit siang yang cerah' : sky === 'dusk' ? 'Senja yang tenang' : 'Lembur malam, ya?')
  look('zw', -1, -1)
  zone('zk', 25, 4, 9, 9, `Pukul ${hh}.${mm}`)
  look('zk', 0, -1)
  zone('zs', 45, 14, 17, 14, s.detail)
  look('zs', 1, -1)
  zone('zc', 60, 22, 7, 7, 'Kopi panas, biar fokus')
  look('zc', 1, 0)
  zone('zp', 1, 24, 9, 13, 'Si tanaman ikut bekerja')
  look('zp', -1, 0)
  zone('zm', OX - 3, OY - 9, 23, 21, `${s.name} · ${s.title}. Tekan dan tahan untuk melompat`)
  look('zm', 0, 0)
}

/** The room's size in its own pixels. */
export const ROOM = { w: W, h: H }

/** The room's pieces, for a bigger drawing to place: its style, its defs, its pixels. */
export function sceneParts(s: SceneInput): { css: string; defs: string; body: string } {
  const b = new Pix()
  room(b, s)
  buddy(b, s)
  particles(b, s)
  zones(b, s)
  return {
    css: BASE_CSS + b.css.join(''),
    defs: '<clipPath id="win"><rect x="5" y="5" width="14" height="10"/></clipPath>',
    body: b.out.join(''),
  }
}

/** Claude alone, for a strip outside the room: its style and its pixels. */
export function buddyParts(s: SceneInput, ox: number, oy: number): { css: string; body: string } {
  const b = new Pix()
  buddy(b, s, ox, oy, true)
  return { css: BASE_CSS + b.css.join(''), body: b.out.join('') }
}

export function scene(s: SceneInput): string {
  const { css, defs, body } = sceneParts(s)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 10}" height="${H * 10}" shape-rendering="crispEdges">` +
    `<style>${css}</style><defs>${defs}</defs>${body}</svg>`
  )
}
