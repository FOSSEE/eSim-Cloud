/**
 * Canvas rendering engine for the Logic Analyzer.
 *
 * Vivado-style dark theme: slate background, thin gridlines, green
 * scalar traces with translucent state shading under the high level,
 * classic hex-annotated bus lanes with crossover transitions.
 *
 * All drawing is done in CSS pixels; the caller scales the backing
 * store by devicePixelRatio.
 */

import { formatToHex, formatTime } from './vcdUtils'

export const THEME = {
  background: '#1E1E1E',
  rowSeparator: '#2A2A2E',
  grid: '#2E2E33',
  axisBackground: '#252528',
  axisText: '#9E9EA4',
  scalarLine: '#3FB950',
  scalarFill: 'rgba(63, 185, 80, 0.18)',
  scalarLowLine: '#2EA043',
  busLine: '#58A6FF',
  busFill: 'rgba(88, 166, 255, 0.08)',
  busText: '#C9D1D9',
  unknown: '#F85149',
  unknownFill: 'rgba(248, 81, 73, 0.25)',
  highZ: '#D29922',
  labelText: '#C9D1D9',
  font: '11px "JetBrains Mono", "Fira Mono", monospace'
}

export const AXIS_HEIGHT = 26

/** Pick a 1/2/5*10^n tick step so gridlines land ~targetPx apart. */
export function niceTimeStep (ticksPerPx, targetPx = 90) {
  const raw = ticksPerPx * targetPx
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  for (const m of [1, 2, 5, 10]) {
    if (m * pow >= raw) return m * pow
  }
  return 10 * pow
}

/**
 * Draw the time ruler into its own canvas (kept outside the scrolling
 * body so it stays pinned while scrolling vertically).
 */
export function drawTimeAxis (ctx, opts) {
  const { width, pxPerTick, timescale, scrollLeft } = opts
  ctx.fillStyle = THEME.axisBackground
  ctx.fillRect(0, 0, width, AXIS_HEIGHT)
  ctx.strokeStyle = THEME.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, AXIS_HEIGHT - 0.5)
  ctx.lineTo(width, AXIS_HEIGHT - 0.5)
  ctx.stroke()

  const step = niceTimeStep(1 / pxPerTick)
  const firstTick = Math.floor((scrollLeft / pxPerTick) / step) * step
  ctx.fillStyle = THEME.axisText
  ctx.font = THEME.font
  ctx.textBaseline = 'middle'
  for (let t = firstTick; ; t += step) {
    const x = t * pxPerTick - scrollLeft
    if (x > width) break
    if (x < -80) continue
    ctx.strokeStyle = THEME.grid
    ctx.beginPath()
    ctx.moveTo(Math.round(x) + 0.5, AXIS_HEIGHT - 8)
    ctx.lineTo(Math.round(x) + 0.5, AXIS_HEIGHT)
    ctx.stroke()
    ctx.fillText(formatTime(t, timescale), x + 4, AXIS_HEIGHT / 2)
  }
}

function drawScalarRow (ctx, sig, opts) {
  const { y, rowHeight, pxPerTick, endtime, x0, x1 } = opts
  const pad = Math.max(3, rowHeight * 0.18)
  const yHigh = y + pad
  const yLow = y + rowHeight - pad
  const wave = sig.wave

  // walk segments [tStart, tEnd) with constant value
  for (let i = 0; i < wave.length; i++) {
    const t = wave[i][0]
    const v = wave[i][1]
    const tNext = i + 1 < wave.length ? wave[i + 1][0] : endtime
    const xa = Math.max(t * pxPerTick, x0)
    const xb = Math.min(tNext * pxPerTick, x1)
    if (xb < x0 || xa > x1) continue

    if (v === '1') {
      // state shading: translucent fill from the high level down to the
      // baseline makes 1-runs pop out against 0-runs at a glance
      ctx.fillStyle = THEME.scalarFill
      ctx.fillRect(xa, yHigh, Math.max(xb - xa, 1), yLow - yHigh)
      ctx.strokeStyle = THEME.scalarLine
      ctx.beginPath()
      ctx.moveTo(xa, yHigh + 0.5)
      ctx.lineTo(xb, yHigh + 0.5)
      ctx.stroke()
    } else if (v === '0') {
      ctx.strokeStyle = THEME.scalarLowLine
      ctx.beginPath()
      ctx.moveTo(xa, yLow - 0.5)
      ctx.lineTo(xb, yLow - 0.5)
      ctx.stroke()
    } else if (v === 'z') {
      const yMid = (yHigh + yLow) / 2
      ctx.strokeStyle = THEME.highZ
      ctx.beginPath()
      ctx.moveTo(xa, yMid + 0.5)
      ctx.lineTo(xb, yMid + 0.5)
      ctx.stroke()
    } else { // 'x' and anything else unknown
      ctx.fillStyle = THEME.unknownFill
      ctx.fillRect(xa, yHigh, Math.max(xb - xa, 1), yLow - yHigh)
      ctx.strokeStyle = THEME.unknown
      ctx.strokeRect(xa, yHigh, Math.max(xb - xa, 1), yLow - yHigh)
    }

    // vertical edge at the transition point
    if (i > 0) {
      const xEdge = t * pxPerTick
      if (xEdge >= x0 && xEdge <= x1) {
        const prev = wave[i - 1][1]
        ctx.strokeStyle = (v === 'x' || prev === 'x')
          ? THEME.unknown : THEME.scalarLine
        ctx.beginPath()
        ctx.moveTo(xEdge + 0.5, yHigh)
        ctx.lineTo(xEdge + 0.5, yLow)
        ctx.stroke()
      }
    }
  }
}

function drawBusRow (ctx, sig, opts) {
  const { y, rowHeight, pxPerTick, endtime, x0, x1 } = opts
  const pad = Math.max(3, rowHeight * 0.18)
  const yTop = y + pad
  const yBot = y + rowHeight - pad
  const yMid = (yTop + yBot) / 2
  const slope = Math.min(4, rowHeight * 0.15) // crossover half-width
  const wave = sig.wave
  ctx.font = THEME.font
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'

  for (let i = 0; i < wave.length; i++) {
    const t = wave[i][0]
    const v = wave[i][1]
    const tNext = i + 1 < wave.length ? wave[i + 1][0] : endtime
    const xa = t * pxPerTick
    const xb = tNext * pxPerTick
    if (xb < x0 || xa > x1) continue

    const unknown = v.indexOf('x') !== -1
    const lineColor = unknown ? THEME.unknown : THEME.busLine
    const openL = Math.min(slope, (xb - xa) / 2)
    const openR = Math.min(slope, (xb - xa) / 2)

    if (unknown) {
      ctx.fillStyle = THEME.unknownFill
      ctx.fillRect(Math.max(xa, x0), yTop,
        Math.max(Math.min(xb, x1) - Math.max(xa, x0), 1), yBot - yTop)
    } else {
      ctx.fillStyle = THEME.busFill
      ctx.fillRect(Math.max(xa + openL, x0), yTop,
        Math.max(Math.min(xb - openR, x1) - Math.max(xa + openL, x0), 0),
        yBot - yTop)
    }

    // hexagon outline: < value >
    ctx.strokeStyle = lineColor
    ctx.beginPath()
    ctx.moveTo(xa, yMid)
    ctx.lineTo(xa + openL, yTop)
    ctx.lineTo(xb - openR, yTop)
    ctx.lineTo(xb, yMid)
    ctx.moveTo(xa, yMid)
    ctx.lineTo(xa + openL, yBot)
    ctx.lineTo(xb - openR, yBot)
    ctx.lineTo(xb, yMid)
    ctx.stroke()

    // centered hex label if the segment is wide enough
    const label = formatToHex(v, sig.width)
    const segW = xb - xa
    if (segW > 14 && rowHeight >= 13) {
      const textW = ctx.measureText(label).width
      if (textW + 8 < segW) {
        const cx = Math.min(Math.max((xa + xb) / 2, x0 + textW / 2 + 4),
          x1 - textW / 2 - 4)
        ctx.fillStyle = unknown ? THEME.unknown : THEME.busText
        ctx.fillText(label, cx, yMid)
      }
    }
  }
  ctx.textAlign = 'left'
}

/**
 * Draw all rows of the waveform body onto ctx.
 *
 * opts: { signals, rowHeight, pxPerTick, endtime, timescale,
 *         width, height, scrollLeft, scrollTop, viewWidth, viewHeight }
 * Only the region visible through the scroll viewport is rendered.
 */
export function drawWaveforms (ctx, opts) {
  const {
    signals, rowHeight, pxPerTick, endtime, timescale,
    scrollLeft, scrollTop, viewWidth, viewHeight
  } = opts
  const x0 = scrollLeft
  const x1 = scrollLeft + viewWidth

  ctx.fillStyle = THEME.background
  ctx.fillRect(x0, scrollTop, viewWidth, viewHeight)

  // thin vertical gridlines on the same "nice" step as the axis
  const step = niceTimeStep(1 / pxPerTick)
  ctx.strokeStyle = THEME.grid
  ctx.lineWidth = 1
  const firstTick = Math.floor(x0 / pxPerTick / step) * step
  for (let t = firstTick; t * pxPerTick <= x1; t += step) {
    const x = Math.round(t * pxPerTick) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, scrollTop)
    ctx.lineTo(x, scrollTop + viewHeight)
    ctx.stroke()
  }

  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight))
  const lastRow = Math.min(signals.length - 1,
    Math.ceil((scrollTop + viewHeight) / rowHeight))

  for (let r = firstRow; r <= lastRow; r++) {
    const sig = signals[r]
    const y = r * rowHeight
    // row separator
    ctx.strokeStyle = THEME.rowSeparator
    ctx.beginPath()
    ctx.moveTo(x0, y + rowHeight - 0.5)
    ctx.lineTo(x1, y + rowHeight - 0.5)
    ctx.stroke()

    const rowOpts = { y, rowHeight, pxPerTick, endtime, timescale, x0, x1 }
    if (sig.width > 1) drawBusRow(ctx, sig, rowOpts)
    else drawScalarRow(ctx, sig, rowOpts)
  }
}
