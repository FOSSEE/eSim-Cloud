/* eslint-disable react/prop-types */
/**
 * Logic Analyzer — Vivado-style digital waveform viewer.
 *
 * Layout: [HTML signal-name panel] [drag handle] [canvas waveform panel]
 *  - Names are HTML (not baked into the canvas) so very long hierarchical
 *    names can be scrolled horizontally inside the left panel.
 *  - The left panel and the waveform viewport sync vertical scroll.
 *  - The splitter uses raw DOM mouse events and writes widths straight
 *    to element style for a flicker-free 60fps drag; React state is only
 *    committed on mouseup.
 *  - The waveform canvas is viewport-sized and virtualized: a spacer div
 *    provides the scroll extent, and only the visible region is drawn,
 *    so million-cycle dumps stay responsive.
 */

import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  AppBar, Toolbar, Typography, IconButton, Slider, Tooltip, Button
} from '@material-ui/core'
import { makeStyles } from '@material-ui/core/styles'
import CloseIcon from '@material-ui/icons/Close'
import ZoomInIcon from '@material-ui/icons/ZoomIn'
import ZoomOutIcon from '@material-ui/icons/ZoomOut'
import SettingsOverscanIcon from '@material-ui/icons/SettingsOverscan'
import PhotoCameraIcon from '@material-ui/icons/PhotoCamera'
import GetAppIcon from '@material-ui/icons/GetApp'
import PrintIcon from '@material-ui/icons/Print'

import {
  drawWaveforms, drawTimeAxis, THEME, AXIS_HEIGHT
} from './waveformRenderer'
import { writeVCD } from './vcdUtils'
import { exportPNG } from './pngExport'
import { printReport } from './pdfReport'

const MIN_ROW_HEIGHT = 15
const MAX_ROW_HEIGHT = 100
const MIN_LABEL_WIDTH = 80
const MAX_LABEL_WIDTH = 560
const MAX_BODY_WIDTH = 8000000 // scroll-extent guardrail
const ZOOM_MAX = 24 // in half-octaves above "fit"

const useStyles = makeStyles(() => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: THEME.background,
    color: THEME.labelText,
    fontFamily: '"Inter", "Roboto", sans-serif'
  },
  appBar: {
    position: 'relative',
    background: '#141416',
    borderBottom: '1px solid #2E2E33',
    boxShadow: 'none'
  },
  title: { flex: 1, fontSize: 15, fontWeight: 600 },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '4px 16px',
    background: '#1A1A1D',
    borderBottom: '1px solid #2E2E33',
    flexWrap: 'wrap'
  },
  sliderBox: {
    display: 'flex',
    alignItems: 'center',
    width: 190,
    marginRight: 8
  },
  sliderLabel: {
    fontSize: 11,
    color: THEME.axisText,
    whiteSpace: 'nowrap',
    marginRight: 10
  },
  main: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
    overflow: 'hidden'
  },
  labelsOuter: {
    display: 'flex',
    flexDirection: 'column',
    background: THEME.axisBackground,
    borderRight: '1px solid #2E2E33',
    flexShrink: 0
  },
  labelsHeader: {
    height: AXIS_HEIGHT,
    lineHeight: AXIS_HEIGHT + 'px',
    fontSize: 11,
    color: THEME.axisText,
    padding: '0 8px',
    borderBottom: '1px solid #2E2E33',
    flexShrink: 0
  },
  labelsScroll: {
    flex: 1,
    overflow: 'auto',
    scrollbarWidth: 'thin',
    '&::-webkit-scrollbar': { width: 6, height: 6 },
    '&::-webkit-scrollbar-thumb': { background: '#3A3A40' }
  },
  labelRow: {
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    borderBottom: `1px solid ${THEME.rowSeparator}`,
    padding: '0 8px',
    whiteSpace: 'nowrap',
    fontFamily: '"JetBrains Mono", "Fira Mono", monospace',
    fontSize: 12,
    width: 'max-content',
    minWidth: '100%'
  },
  labelWidthTag: { color: THEME.axisText, marginLeft: 6, fontSize: 10 },
  resizeHandle: {
    width: 6,
    cursor: 'col-resize',
    background: '#232327',
    flexShrink: 0,
    '&:hover': { background: '#3A6EA5' }
  },
  chartArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0
  },
  axisCanvas: { display: 'block', flexShrink: 0 },
  chartScroll: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
    scrollbarWidth: 'thin',
    '&::-webkit-scrollbar': { width: 10, height: 10 },
    '&::-webkit-scrollbar-thumb': { background: '#3A3A40' }
  },
  waveCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none'
  },
  toolbarBtn: { color: THEME.labelText },
  exportBtn: {
    color: THEME.labelText,
    borderColor: '#3A3A40',
    fontSize: 11,
    textTransform: 'none'
  }
}))

export default function LogicAnalyzer (props) {
  const {
    signals = [], endtime = 1, timescale = '1ns',
    title = 'Logic Analyzer', simulator = 'HDL', onClose
  } = props
  const classes = useStyles()

  const [rowHeight, setRowHeight] = useState(34)
  const [zoom, setZoom] = useState(0) // half-octaves above fit-to-screen
  const [labelWidth, setLabelWidth] = useState(240)

  const labelsScrollRef = useRef(null)
  const labelsOuterRef = useRef(null)
  const chartScrollRef = useRef(null)
  const waveCanvasRef = useRef(null)
  const axisCanvasRef = useRef(null)
  const spacerRef = useRef(null)
  const syncing = useRef(false)
  const rafPending = useRef(false)

  const safeEndtime = Math.max(endtime, 1)

  const getViewport = useCallback(() => {
    const el = chartScrollRef.current
    if (!el) return { w: 800, h: 400 }
    return { w: el.clientWidth || 800, h: el.clientHeight || 400 }
  }, [])

  const getPxPerTick = useCallback(() => {
    const { w } = getViewport()
    const fit = Math.max(w - 20, 50) / safeEndtime
    let px = fit * Math.pow(2, zoom / 2)
    if (safeEndtime * px > MAX_BODY_WIDTH) px = MAX_BODY_WIDTH / safeEndtime
    return px
  }, [zoom, safeEndtime, getViewport])

  // ---------- drawing ----------
  const redraw = useCallback(() => {
    const scroll = chartScrollRef.current
    const canvas = waveCanvasRef.current
    const axis = axisCanvasRef.current
    if (!scroll || !canvas || !axis) return
    const { w, h } = getViewport()
    const dpr = window.devicePixelRatio || 1
    const pxPerTick = getPxPerTick()
    const scrollLeft = scroll.scrollLeft
    const scrollTop = scroll.scrollTop

    // spacer supplies the scroll extent
    if (spacerRef.current) {
      spacerRef.current.style.width =
        Math.ceil(safeEndtime * pxPerTick + 40) + 'px'
      spacerRef.current.style.height =
        (signals.length * rowHeight) + 'px'
    }

    // keep the viewport-sized canvas pinned over the visible region
    canvas.style.transform = `translate(${scrollLeft}px, ${scrollTop}px)`
    if (canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) return // jsdom / very old browsers
    ctx.setTransform(dpr, 0, 0, dpr, -scrollLeft * dpr, -scrollTop * dpr)
    drawWaveforms(ctx, {
      signals,
      rowHeight,
      pxPerTick,
      endtime: safeEndtime,
      timescale,
      scrollLeft,
      scrollTop,
      viewWidth: w,
      viewHeight: h
    })

    // time ruler (fixed above the scroll body)
    if (axis.width !== Math.round(w * dpr) ||
        axis.height !== Math.round(AXIS_HEIGHT * dpr)) {
      axis.width = Math.round(w * dpr)
      axis.height = Math.round(AXIS_HEIGHT * dpr)
      axis.style.width = w + 'px'
      axis.style.height = AXIS_HEIGHT + 'px'
    }
    const actx = axis.getContext('2d')
    if (!actx) return
    actx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawTimeAxis(actx, { width: w, pxPerTick, timescale, scrollLeft })
  }, [signals, rowHeight, timescale, safeEndtime, getPxPerTick, getViewport])

  const scheduleRedraw = useCallback(() => {
    if (rafPending.current) return
    rafPending.current = true
    window.requestAnimationFrame(() => {
      rafPending.current = false
      redraw()
    })
  }, [redraw])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    const onResize = () => scheduleRedraw()
    window.addEventListener('resize', onResize)
    let ro
    if (window.ResizeObserver && chartScrollRef.current) {
      ro = new window.ResizeObserver(onResize)
      ro.observe(chartScrollRef.current)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      if (ro) ro.disconnect()
    }
  }, [scheduleRedraw])

  // ---------- scroll synchronization ----------
  const onChartScroll = useCallback(() => {
    scheduleRedraw()
    if (syncing.current) { syncing.current = false; return }
    const labels = labelsScrollRef.current
    const chart = chartScrollRef.current
    if (labels && chart && labels.scrollTop !== chart.scrollTop) {
      syncing.current = true
      labels.scrollTop = chart.scrollTop
    }
  }, [scheduleRedraw])

  const onLabelsScroll = useCallback(() => {
    if (syncing.current) { syncing.current = false; return }
    const labels = labelsScrollRef.current
    const chart = chartScrollRef.current
    if (labels && chart && chart.scrollTop !== labels.scrollTop) {
      syncing.current = true
      chart.scrollTop = labels.scrollTop
    }
  }, [])

  // ---------- splitter drag (raw DOM events, no re-render per frame) ----
  const onHandleMouseDown = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = labelsOuterRef.current
      ? labelsOuterRef.current.offsetWidth : labelWidth
    let latest = startWidth
    const onMove = (ev) => {
      latest = Math.min(MAX_LABEL_WIDTH,
        Math.max(MIN_LABEL_WIDTH, startWidth + ev.clientX - startX))
      if (labelsOuterRef.current) {
        labelsOuterRef.current.style.width = latest + 'px'
      }
      scheduleRedraw() // canvas viewport width changed
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      setLabelWidth(latest) // commit once
    }
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [labelWidth, scheduleRedraw])

  // ---------- zoom helpers (anchor the viewport centre) ----------
  const applyZoom = useCallback((newZoom) => {
    const chart = chartScrollRef.current
    const clamped = Math.min(ZOOM_MAX, Math.max(0, newZoom))
    if (!chart) { setZoom(clamped); return }
    const { w } = getViewport()
    const oldPx = getPxPerTick()
    const centreTick = (chart.scrollLeft + w / 2) / oldPx
    setZoom(clamped)
    window.requestAnimationFrame(() => {
      const fit = Math.max(w - 20, 50) / safeEndtime
      let px = fit * Math.pow(2, clamped / 2)
      if (safeEndtime * px > MAX_BODY_WIDTH) px = MAX_BODY_WIDTH / safeEndtime
      chart.scrollLeft = Math.max(0, centreTick * px - w / 2)
    })
  }, [getPxPerTick, getViewport, safeEndtime])

  // ---------- exports ----------
  const handlePNG = () => {
    exportPNG({
      signals,
      rowHeight,
      pxPerTick: getPxPerTick(),
      endtime: safeEndtime,
      timescale,
      labelWidth: labelsOuterRef.current
        ? labelsOuterRef.current.offsetWidth : labelWidth,
      fileName: 'logic-analyzer-waveform.png'
    })
  }

  const handleVCD = () => {
    const text = writeVCD(signals, timescale, safeEndtime)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'waveform.vcd'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const handlePDF = () => {
    printReport({ signals, timescale, endtime: safeEndtime, title, simulator })
  }

  return (
    <div className={classes.root}>
      <AppBar className={classes.appBar}>
        <Toolbar variant="dense">
          <Typography variant="h6" className={classes.title}>
            {title}
          </Typography>
          <Typography variant="caption" style={{ color: THEME.axisText, marginRight: 16 }}>
            {signals.length} signals • timescale {timescale}
          </Typography>
          {onClose && (
            <IconButton edge="end" className={classes.toolbarBtn} onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      <div className={classes.controls}>
        <Tooltip title="Zoom out">
          <IconButton size="small" className={classes.toolbarBtn}
            onClick={() => applyZoom(zoom - 1)}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <div className={classes.sliderBox}>
          <Slider
            value={zoom}
            min={0}
            max={ZOOM_MAX}
            step={0.5}
            onChange={(e, v) => applyZoom(v)}
            aria-label="timeline zoom"
          />
        </div>
        <Tooltip title="Zoom in">
          <IconButton size="small" className={classes.toolbarBtn}
            onClick={() => applyZoom(zoom + 1)}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Fit whole timeline">
          <IconButton size="small" className={classes.toolbarBtn}
            onClick={() => applyZoom(0)}>
            <SettingsOverscanIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <div className={classes.sliderBox} style={{ marginLeft: 16 }}>
          <span className={classes.sliderLabel}>Row height</span>
          <Slider
            value={rowHeight}
            min={MIN_ROW_HEIGHT}
            max={MAX_ROW_HEIGHT}
            step={1}
            onChange={(e, v) => setRowHeight(v)}
            aria-label="row height"
          />
        </div>

        <div style={{ flex: 1 }} />

        <Button size="small" variant="outlined" className={classes.exportBtn}
          startIcon={<PhotoCameraIcon />} onClick={handlePNG}>
          PNG
        </Button>
        <Button size="small" variant="outlined" className={classes.exportBtn}
          startIcon={<GetAppIcon />} onClick={handleVCD}>
          VCD
        </Button>
        <Button size="small" variant="outlined" className={classes.exportBtn}
          startIcon={<PrintIcon />} onClick={handlePDF}>
          PDF Report
        </Button>
      </div>

      <div className={classes.main}>
        <div ref={labelsOuterRef} className={classes.labelsOuter}
          style={{ width: labelWidth }}>
          <div className={classes.labelsHeader}>Signals</div>
          <div ref={labelsScrollRef} className={classes.labelsScroll}
            onScroll={onLabelsScroll}>
            {signals.map((sig, i) => (
              <div key={i} className={classes.labelRow}
                style={{ height: rowHeight }}>
                <span>{sig.name}</span>
                {sig.width > 1 && (
                  <span className={classes.labelWidthTag}>
                    [{sig.width - 1}:0]
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className={classes.resizeHandle} onMouseDown={onHandleMouseDown} />

        <div className={classes.chartArea}>
          <canvas ref={axisCanvasRef} className={classes.axisCanvas} />
          <div ref={chartScrollRef} className={classes.chartScroll}
            onScroll={onChartScroll}>
            <div ref={spacerRef} />
            <canvas ref={waveCanvasRef} className={classes.waveCanvas} />
          </div>
        </div>
      </div>
    </div>
  )
}
