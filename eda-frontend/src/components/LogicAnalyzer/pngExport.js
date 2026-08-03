/**
 * PNG snapshot export.
 *
 * Signal names live in an HTML overlay (so they can scroll), not in the
 * canvas — so the exporter composites them back: it renders the full
 * waveform (no viewport culling) into an offscreen canvas, draws the
 * label column at the correct vertical offsets, then triggers a
 * download. The on-screen HTML overlay is never touched.
 */

import {
  drawWaveforms, drawTimeAxis, THEME, AXIS_HEIGHT
} from './waveformRenderer'

const MAX_EXPORT_WIDTH = 16000 // canvas size guardrail (browser limits)

export function exportPNG (opts) {
  const {
    signals, rowHeight, pxPerTick, endtime, timescale,
    labelWidth, fileName
  } = opts

  let scale = 1
  let effPxPerTick = pxPerTick
  const waveWidth = Math.ceil(endtime * pxPerTick) + 40
  if (labelWidth + waveWidth > MAX_EXPORT_WIDTH) {
    scale = (MAX_EXPORT_WIDTH - labelWidth) / waveWidth
    effPxPerTick = pxPerTick * scale
  }
  const bodyWidth = Math.ceil(endtime * effPxPerTick) + 40
  const width = labelWidth + bodyWidth
  const height = AXIS_HEIGHT + signals.length * rowHeight

  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)

  ctx.fillStyle = THEME.background
  ctx.fillRect(0, 0, width, height)

  // ---- label column (temporarily "baked" into the bitmap) ----
  ctx.save()
  ctx.fillStyle = THEME.axisBackground
  ctx.fillRect(0, 0, labelWidth, height)
  ctx.font = THEME.font
  ctx.textBaseline = 'middle'
  ctx.fillStyle = THEME.labelText
  signals.forEach((sig, r) => {
    const y = AXIS_HEIGHT + r * rowHeight + rowHeight / 2
    let name = sig.name
    // right-elide long hierarchical names to the column width
    while (name.length > 4 &&
           ctx.measureText(name).width > labelWidth - 12) {
      name = '…' + name.slice(2)
    }
    ctx.fillText(name, 8, y)
    ctx.strokeStyle = THEME.rowSeparator
    ctx.beginPath()
    ctx.moveTo(0, AXIS_HEIGHT + (r + 1) * rowHeight - 0.5)
    ctx.lineTo(labelWidth, AXIS_HEIGHT + (r + 1) * rowHeight - 0.5)
    ctx.stroke()
  })
  ctx.strokeStyle = THEME.grid
  ctx.beginPath()
  ctx.moveTo(labelWidth - 0.5, 0)
  ctx.lineTo(labelWidth - 0.5, height)
  ctx.stroke()
  ctx.restore()

  // ---- time axis ----
  ctx.save()
  ctx.translate(labelWidth, 0)
  drawTimeAxis(ctx, {
    width: bodyWidth,
    pxPerTick: effPxPerTick,
    timescale,
    scrollLeft: 0
  })
  ctx.restore()

  // ---- waveform body (full extent, no culling) ----
  ctx.save()
  ctx.translate(labelWidth, AXIS_HEIGHT)
  ctx.beginPath()
  ctx.rect(0, 0, bodyWidth, signals.length * rowHeight)
  ctx.clip()
  drawWaveforms(ctx, {
    signals,
    rowHeight,
    pxPerTick: effPxPerTick,
    endtime,
    timescale,
    scrollLeft: 0,
    scrollTop: 0,
    viewWidth: bodyWidth,
    viewHeight: signals.length * rowHeight
  })
  ctx.restore()

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName || 'waveform.png'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}
