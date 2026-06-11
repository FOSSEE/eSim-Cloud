/* eslint-disable react/prop-types */
import React, { Component } from 'react'
import Chart from 'chart.js'

import 'chartjs-plugin-colorschemes'
// Chart Style Options
Chart.defaults.global.defaultFontColor = '#333'

const defaultColors = [
  '#e41a1c', // red
  '#377eb8', // blue
  '#4daf4a', // green
  '#984ea3', // purple
  '#ff7f00', // orange
  '#a65628', // brown
  '#f781bf', // pink
  '#999999', // grey
  '#4be3e3' // cyan
]

const scales = {
  G: { value: 1000000000, ticks: 3 },
  M: { value: 1000000, ticks: 3 },
  K: { value: 1000, ticks: 3 },
  si: { value: 1, ticks: 3 },
  m: { value: 0.001, ticks: 5 },
  u: { value: 0.000001, ticks: 7 },
  n: { value: 0.000000001, ticks: 9 },
  p: { value: 0.000000000001, ticks: 11 }
}

class Graph extends Component {
  chartRef = React.createRef();

  state = {
    hoveredIndex: null,
    pinnedIndices: []
  };

  componentDidMount () {
    this.buildChart()
  }

  componentDidUpdate (prevProps, prevState) {
    if (
      prevProps.x !== this.props.x ||
      prevProps.y !== this.props.y ||
      prevProps.xscale !== this.props.xscale ||
      prevProps.yscale !== this.props.yscale ||
      prevProps.precision !== this.props.precision ||
      prevProps.stacked !== this.props.stacked ||
      prevProps.showLegend !== this.props.showLegend ||
      prevProps.probeColors !== this.props.probeColors ||
      prevProps.showPeaks !== this.props.showPeaks
    ) {
      this.buildChart()
    } else if (
      prevState.hoveredIndex !== this.state.hoveredIndex ||
      prevState.pinnedIndices !== this.state.pinnedIndices
    ) {
      if (this.lineGraph) {
        this.lineGraph.update(0)
      }
    }
  }

  componentWillUnmount () {
    if (this.lineGraph) {
      this.lineGraph.destroy()
    }
  }

  handleMouseMove = (e) => {
    if (!this.lineGraph) return
    const activeElements = this.lineGraph.getElementsAtEventForMode(e.nativeEvent, 'index', { intersect: false })
    if (activeElements.length > 0) {
      const index = activeElements[0]._index
      if (this.state.hoveredIndex !== index) {
        this.setState({ hoveredIndex: index })
      }
    }
  }

  handleMouseLeave = () => {
    if (this.state.hoveredIndex !== null) {
      this.setState({ hoveredIndex: null })
    }
  }

  handleClick = (e) => {
    if (!this.lineGraph) return
    const activeElements = this.lineGraph.getElementsAtEventForMode(e.nativeEvent, 'index', { intersect: false })
    if (activeElements.length > 0) {
      const index = activeElements[0]._index
      this.setState(prevState => {
        const pinned = [...prevState.pinnedIndices]
        if (pinned.includes(index)) {
          return { pinnedIndices: pinned.filter(idx => idx !== index) }
        } else {
          if (pinned.length < 5) {
            pinned.push(index)
          }
          return { pinnedIndices: pinned }
        }
      })
    }
  }

  buildChart = () => {
    const myChartRef = this.chartRef.current.getContext('2d')
    const { x, y, labels, xscale, yscale, precision } = this.props
    if (this.lineGraph) this.lineGraph.destroy()

    const datasetMinMax = []
    const scaleFactor = scales[yscale].value

    for (let i = 0; i < y.length; i++) {
      const scaledY = y[i].map(val => val / scaleFactor)
      let minVal = Math.min(...scaledY)
      let maxVal = Math.max(...scaledY)
      if (minVal === maxVal) {
        minVal -= 0.5
        maxVal += 0.5
      }
      datasetMinMax.push({ min: minVal, max: maxVal, diff: maxVal - minVal })
    }

    const dataset = () => {
      var arr = []

      for (let i = 0; i < y.length; i++) {
        if (labels[0] === labels[i + 1]) continue

        const color = this.props.probeColors && this.props.probeColors[i + 1] ? this.props.probeColors[i + 1] : undefined

        let dataPoints = []
        if (this.props.stacked) {
          const { min, diff } = datasetMinMax[i]
          dataPoints = y[i].map(val => {
            const scaledVal = val / scaleFactor
            const norm = (scaledVal - min) / diff
            return norm * 0.8 + i * 1.2
          })
        } else {
          dataPoints = y[i].map(val => val / scaleFactor)
        }

        arr.push({
          label: labels[i + 1],
          data: dataPoints,
          fill: false,
          borderColor: color,
          backgroundColor: color,
          borderWidth: 1,
          pointRadius: 0
        })
      }
      return arr
    }

    const selectLabel = () => {
      if (labels[0] === 'time') {
        if (xscale === 'si') {
          return 'Time in S'
        } else {
          return `Time in ${xscale}S`
        }
      } else if (labels[0] === 'v-sweep') {
        if (xscale === 'si') {
          return 'Voltage in V'
        } else {
          return `Voltage in ${xscale}V`
        }
      } else if (labels[0] === 'frequency') {
        if (xscale === 'si') {
          return 'frequency in Hz'
        } else {
          return `frequency in ${xscale}Hz`
        }
      } else {
        if (xscale === 'si') {
          return `${labels[0]}`
        } else {
          return `${labels[0]} in ${xscale}`
        }
      }
    }

    this.lineGraph = new Chart(myChartRef, {
      type: 'line',
      data: {
        labels: x.map(e => (e / scales[xscale].value).toFixed(precision)),
        datasets: dataset()
      },

      options: {
        plugins: {
          colorschemes: {
            scheme: 'brewer.SetOne9'
          }
        },
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          display: this.props.showLegend !== false
        },
        layout: {
          padding: {
            top: 15,
            right: this.props.fixedYWidth ? 45 : 10
          }
        },
        title: {
          display: false,
          text: ''
        },
        tooltips: {
          enabled: false
        },
        hover: {
          mode: 'nearest',
          intersect: true
        },
        scales: {
          xAxes: [
            {
              display: true,
              gridLines: {
                color: '#e0e0e0'
              },
              scaleLabel: {
                display: !this.props.hideXAxis,
                labelString: selectLabel()
              },

              ticks: {
                maxTicksLimit: scales[xscale].ticks,
                display: !this.props.hideXAxis
              }
            }
          ],
          yAxes: [
            {
              display: true,
              scaleLabel: {
                display: false,
                labelString: 'Voltage ( V )'
              },
              gridLines: {
                color: '#e0e0e0'
              },
              ticks: this.props.stacked ? {
                min: 0,
                max: y.length * 1.2 - 0.4,
                fontSize: 12,
                padding: 10,
                fontColor: 'rgba(0,0,0,0)',
                callback: (value) => {
                  const i = Math.floor((value + 0.05) / 1.2)
                  if (i >= 0 && i < datasetMinMax.length) {
                    const start = i * 1.2
                    const rel = (value - start) / 0.8
                    if (rel >= -0.01 && rel <= 1.01) {
                      const { min, max } = datasetMinMax[i]
                      const actVal = min + rel * (max - min)
                      const formatted = actVal.toFixed(precision)
                      if (Math.abs(rel - 1) < 0.01) {
                        return `${formatted} (${labels[i + 1]})`
                      }
                      return formatted
                    }
                  }
                  return ''
                }
              } : {
                fontSize: 15,
                padding: 25,
                fontColor: 'rgba(0,0,0,0)'
              },
              afterBuildTicks: this.props.stacked ? (scaleInstance) => {
                const customTicks = []
                for (let i = 0; i < y.length; i++) {
                  customTicks.push(i * 1.2)
                  customTicks.push(i * 1.2 + 0.4)
                  customTicks.push(i * 1.2 + 0.8)
                }
                scaleInstance.ticks = customTicks.sort((a, b) => b - a)
              } : undefined,
              afterFit: this.props.fixedYWidth ? (scaleInstance) => {
                scaleInstance.width = this.props.fixedYWidth
              } : undefined
            }
          ]
        }
      },
      plugins: [
        {
          id: 'colored-y-ticks',
          afterDraw: (chart) => {
            const ctx = chart.ctx
            const yScale = chart.scales['y-axis-0']
            if (!yScale) return

            ctx.save()
            ctx.textAlign = 'right'
            ctx.textBaseline = 'middle'

            const fontSize = yScale.options.ticks.fontSize || 12
            ctx.font = `${fontSize}px sans-serif`
            const padding = yScale.options.ticks.padding || 10
            const xPixel = chart.chartArea.left - padding

            const ticks = yScale.ticks || []
            ticks.forEach((tickLabel, idx) => {
              const rawVal = yScale.ticksAsNumbers ? yScale.ticksAsNumbers[idx] : parseFloat(tickLabel)
              if (isNaN(rawVal)) return

              const val = rawVal
              const i = Math.floor((val + 0.05) / 1.2)

              let tickColor = '#333'
              if (this.props.stacked && i >= 0 && i < y.length) {
                tickColor = this.props.probeColors && this.props.probeColors[i + 1] ? this.props.probeColors[i + 1] : defaultColors[i % defaultColors.length]
              } else if (!this.props.stacked && y.length === 1) {
                tickColor = this.props.probeColors && this.props.probeColors[1] ? this.props.probeColors[1] : defaultColors[0]
              }

              const yPixel = yScale.getPixelForValue(val)
              ctx.fillStyle = tickColor
              ctx.fillText(tickLabel, xPixel, yPixel)
            })

            ctx.restore()
          }
        },
        {
          id: 'band-separators',
          afterDraw: (chart) => {
            if (!this.props.stacked) return
            const ctx = chart.ctx
            const yScale = chart.scales['y-axis-0']
            if (!yScale) return

            const xMin = chart.chartArea.left
            const xMax = chart.chartArea.right

            ctx.save()

            for (let i = 0; i < y.length; i++) {
              const startVal = i * 1.2
              const endVal = i * 1.2 + 0.8
              const yStartPixel = yScale.getPixelForValue(startVal)
              const yEndPixel = yScale.getPixelForValue(endVal)

              const traceColor = this.props.probeColors && this.props.probeColors[i + 1] ? this.props.probeColors[i + 1] : defaultColors[i % defaultColors.length]
              ctx.fillStyle = traceColor + '0b'
              ctx.fillRect(xMin, yEndPixel, xMax - xMin, yStartPixel - yEndPixel)

              ctx.fillStyle = 'rgba(120, 120, 120, 0.22)'
              ctx.font = 'bold 24px sans-serif'
              ctx.textAlign = 'right'
              ctx.textBaseline = 'middle'
              ctx.fillText(labels[i + 1], xMax - 25, (yStartPixel + yEndPixel) / 2)
            }

            ctx.strokeStyle = '#aaaaaa'
            ctx.lineWidth = 1.5
            ctx.beginPath()
            for (let i = 0; i < y.length - 1; i++) {
              const boundaryValue = i * 1.2 + 1.0
              const yPixel = yScale.getPixelForValue(boundaryValue)
              ctx.moveTo(xMin, yPixel)
              ctx.lineTo(xMax, yPixel)
            }
            ctx.stroke()
            ctx.restore()
          }
        },
        {
          id: 'cursors-plugin',
          afterDraw: (chart) => {
            const ctx = chart.ctx
            const yScale = chart.scales['y-axis-0']
            if (!yScale) return

            const yMin = chart.chartArea.top
            const yMax = chart.chartArea.bottom
            const meta = chart.getDatasetMeta(0)
            if (!meta || !meta.data) return

            ctx.save()

            // 1. Draw Pinned Cursors
            const pinned = this.state.pinnedIndices || []
            pinned.forEach((idx, cIndex) => {
              if (meta.data[idx]) {
                const xPixel = meta.data[idx]._model.x

                // Draw dashed mustard yellow line
                ctx.strokeStyle = '#b8860b'
                ctx.lineWidth = 1.5
                ctx.setLineDash([4, 4])
                ctx.beginPath()
                ctx.moveTo(xPixel, yMin)
                ctx.lineTo(xPixel, yMax)
                ctx.stroke()

                // Draw label at the top
                ctx.fillStyle = '#b8860b'
                ctx.font = 'bold 10px sans-serif'
                ctx.textBaseline = 'bottom'
                ctx.textAlign = 'center'
                ctx.setLineDash([])
                ctx.fillText(`C${cIndex + 1}`, xPixel, yMin - 2)
              }
            })

            // 2. Draw Hovered Cursor
            const hoverIdx = this.state.hoveredIndex
            if (hoverIdx !== null && meta.data[hoverIdx]) {
              const xPixel = meta.data[hoverIdx]._model.x

              // Draw dashed blue line
              ctx.strokeStyle = '#2196f3'
              ctx.lineWidth = 1.5
              ctx.setLineDash([4, 4])
              ctx.beginPath()
              ctx.moveTo(xPixel, yMin)
              ctx.lineTo(xPixel, yMax)
              ctx.stroke()

              // Draw label at the top
              ctx.fillStyle = '#2196f3'
              ctx.font = 'bold 10px sans-serif'
              ctx.textBaseline = 'bottom'
              ctx.textAlign = 'center'
              ctx.setLineDash([])
              ctx.fillText('Hover', xPixel, yMin - 2)
            }

            // 3. Draw Peak/Trough Markers (if enabled)
            if (this.props.showPeaks) {
              chart.data.datasets.forEach((dataset, dIdx) => {
                const metaForTrace = chart.getDatasetMeta(dIdx)
                if (!metaForTrace || !metaForTrace.data) return

                const label = dataset.label
                const yIdx = labels.indexOf(label) - 1
                if (yIdx < 0 || yIdx >= y.length) return

                const signalYData = y[yIdx]

                // Find global extrema first
                let globalMaxVal = -Infinity
                let globalMaxIdx = 0
                let globalMinVal = Infinity
                let globalMinIdx = 0
                for (let j = 0; j < signalYData.length; j++) {
                  if (signalYData[j] > globalMaxVal) {
                    globalMaxVal = signalYData[j]
                    globalMaxIdx = j
                  }
                  if (signalYData[j] < globalMinVal) {
                    globalMinVal = signalYData[j]
                    globalMinIdx = j
                  }
                }

                const peaks = [globalMaxIdx]
                const troughs = [globalMinIdx]

                const p2p = globalMaxVal - globalMinVal
                if (p2p > 0) {
                  const threshold = p2p * 0.01 // 1% of peak-to-peak range
                  const windowSize = Math.max(1, Math.min(5, Math.floor(signalYData.length / 20)))

                  for (let j = windowSize; j < signalYData.length - windowSize; j++) {
                    if (j === globalMaxIdx || j === globalMinIdx) continue

                    const val = signalYData[j]

                    let isMax = true
                    let isMin = true
                    for (let w = -windowSize; w <= windowSize; w++) {
                      if (w === 0) continue
                      if (signalYData[j + w] >= val) isMax = false
                      if (signalYData[j + w] <= val) isMin = false
                    }

                    if (isMax) {
                      if (Math.abs(val - signalYData[j - windowSize]) > threshold || Math.abs(val - signalYData[j + windowSize]) > threshold) {
                        peaks.push(j)
                      }
                    }
                    if (isMin) {
                      if (Math.abs(val - signalYData[j - windowSize]) > threshold || Math.abs(val - signalYData[j + windowSize]) > threshold) {
                        troughs.push(j)
                      }
                    }
                  }
                }

                // Draw all peaks
                peaks.forEach(peakIdx => {
                  if (metaForTrace.data[peakIdx]) {
                    const pt = metaForTrace.data[peakIdx]._model
                    ctx.fillStyle = '#2e7d32' // green for max
                    ctx.beginPath()
                    ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI)
                    ctx.fill()

                    const val = signalYData[peakIdx]
                    const scaledMax = val / scaleFactor
                    const txt = `Max: ${scaledMax.toFixed(precision)}`
                    ctx.fillStyle = '#2e7d32'
                    ctx.font = 'bold 9px sans-serif'
                    ctx.fillText(txt, pt.x + 6, pt.y - 2)
                  }
                })

                // Draw all troughs
                troughs.forEach(troughIdx => {
                  if (metaForTrace.data[troughIdx]) {
                    const pt = metaForTrace.data[troughIdx]._model
                    ctx.fillStyle = '#9c27b0' // purple for min
                    ctx.beginPath()
                    ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI)
                    ctx.fill()

                    const val = signalYData[troughIdx]
                    const scaledMin = val / scaleFactor
                    const txt = `Min: ${scaledMin.toFixed(precision)}`
                    ctx.fillStyle = '#9c27b0'
                    ctx.font = 'bold 9px sans-serif'
                    ctx.fillText(txt, pt.x + 6, pt.y + 8)
                  }
                })
              })
            }

            ctx.restore()
          }
        }
      ]
    })
  };

  render () {
    const { x, y, labels, xscale, yscale, precision, stacked } = this.props
    if (!x || !y || y.length === 0) {
      return null
    }

    const numSignals = y ? y.length : 0
    const heightVal = (stacked && numSignals > 0) ? Math.max(550, numSignals * 80) : 550

    const activeSignals = []
    for (let i = 0; i < y.length; i++) {
      if (labels[0] === labels[i + 1]) continue
      const color = this.props.probeColors && this.props.probeColors[i + 1] ? this.props.probeColors[i + 1] : defaultColors[i % defaultColors.length]
      activeSignals.push({ name: labels[i + 1], color, index: i })
    }

    const formatXValue = (idx) => {
      if (idx === null || idx === undefined || idx < 0 || idx >= x.length) return ''
      const val = x[idx] / scales[xscale].value
      let unit = ''
      if (labels[0] === 'time') unit = 'S'
      else if (labels[0] === 'v-sweep') unit = 'V'
      else if (labels[0] === 'frequency') unit = 'Hz'
      return `${val.toFixed(precision)} ${xscale === 'si' ? '' : xscale}${unit}`
    }

    const formatYValue = (sigName, sigIdx, idx) => {
      if (idx === null || idx === undefined || idx < 0 || idx >= y[sigIdx].length) return ''
      const val = y[sigIdx][idx]
      let unit = ''
      if (sigName.toLowerCase().includes('#branch') || sigName.toLowerCase().startsWith('i(')) {
        unit = 'A'
      } else if (sigName.toLowerCase().startsWith('v(') || sigName.toLowerCase().includes('voltage')) {
        unit = 'V'
      }
      const scaledVal = val / scales[yscale].value
      return `${scaledVal.toFixed(precision)} ${yscale === 'si' ? '' : yscale}${unit}`
    }

    return (
      <div style={{ width: '100%' }}>
        <div
          onMouseMove={this.handleMouseMove}
          onMouseLeave={this.handleMouseLeave}
          onClick={this.handleClick}
          style={{ position: 'relative', height: `${heightVal}px`, width: '100%', cursor: 'crosshair' }}
        >
          <canvas ref={this.chartRef} />
        </div>

        {/* Cursor Measurements table */}
        <div style={{ marginTop: '20px', border: '1px solid #e1e4e8', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ backgroundColor: '#f6f8fa', padding: '10px 16px', borderBottom: '1px solid #e1e4e8', fontWeight: 'bold', fontSize: '13px', color: '#24292e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span>Cursor Measurements</span>
            <span style={{ fontSize: '11px', fontWeight: 'normal', color: '#586069' }}>
              Left click graph to place/remove comparison cursors (max 5)
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #e1e4e8' }}>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#586069' }}>Cursor</th>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#b8860b' }}>{labels[0] || 'X'}</th>
                  {activeSignals.map(sig => (
                    <th key={sig.name} style={{ padding: '8px 12px', fontWeight: '600', color: sig.color }}>
                      {sig.name}
                    </th>
                  ))}
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#586069', width: '80px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {/* Hovered row */}
                {this.state.hoveredIndex !== null && (
                  <tr style={{ borderBottom: '1px solid #eaecef', backgroundColor: '#f1f8ff' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#2196f3' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#2196f3', marginRight: '6px' }} />
                      Hover
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: '500', color: '#b8860b' }}>{formatXValue(this.state.hoveredIndex)}</td>
                    {activeSignals.map(sig => (
                      <td key={sig.name} style={{ padding: '8px 12px' }}>
                        {formatYValue(sig.name, sig.index, this.state.hoveredIndex)}
                      </td>
                    ))}
                    <td style={{ padding: '8px 12px', color: '#8c939d', fontStyle: 'italic' }}>-</td>
                  </tr>
                )}

                {/* Pinned rows */}
                {this.state.pinnedIndices.map((pinnedIdx, cIdx) => (
                  <tr key={pinnedIdx} style={{ borderBottom: '1px solid #eaecef', transition: 'background-color 0.2s' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#b8860b' }}>
                      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#b8860b', marginRight: '6px' }} />
                      C{cIdx + 1}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: '500', color: '#b8860b' }}>{formatXValue(pinnedIdx)}</td>
                    {activeSignals.map(sig => (
                      <td key={sig.name} style={{ padding: '8px 12px' }}>
                        {formatYValue(sig.name, sig.index, pinnedIdx)}
                      </td>
                    ))}
                    <td style={{ padding: '8px 12px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          this.setState(prevState => ({
                            pinnedIndices: prevState.pinnedIndices.filter(idx => idx !== pinnedIdx)
                          }))
                        }}
                        style={{
                          background: 'none',
                          color: '#cb2431',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          borderRadius: '3px',
                          backgroundColor: '#ffeef0',
                          border: '1px solid rgba(27,31,35,0.15)'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ffdcd3' }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#ffeef0' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {/* Empty state if nothing active */}
                {this.state.hoveredIndex === null && this.state.pinnedIndices.length === 0 && (
                  <tr>
                    <td colSpan={3 + activeSignals.length} style={{ padding: '16px', textAlign: 'center', color: '#8c939d', fontStyle: 'italic' }}>
                      Hover mouse over graph or click to see measurements
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Waveform Statistics Table */}
        <div style={{ marginTop: '20px', border: '1px solid #e1e4e8', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ backgroundColor: '#f6f8fa', padding: '10px 16px', borderBottom: '1px solid #e1e4e8', fontWeight: 'bold', fontSize: '13px', color: '#24292e', textAlign: 'left' }}>
            Waveform Statistics
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#fafbfc', borderBottom: '1px solid #e1e4e8' }}>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#586069' }}>Signal</th>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#2e7d32' }}>Maximum (Peak)</th>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#2e7d32' }}>At X</th>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#9c27b0' }}>Minimum (Trough)</th>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#9c27b0' }}>At X</th>
                  <th style={{ padding: '8px 12px', fontWeight: '600', color: '#0366d6' }}>Peak-to-Peak (Vpp)</th>
                </tr>
              </thead>
              <tbody>
                {activeSignals.map(sig => {
                  let maxVal = -Infinity
                  let maxIdx = 0
                  let minVal = Infinity
                  let minIdx = 0
                  const signalYData = y[sig.index]
                  for (let j = 0; j < signalYData.length; j++) {
                    if (signalYData[j] > maxVal) {
                      maxVal = signalYData[j]
                      maxIdx = j
                    }
                    if (signalYData[j] < minVal) {
                      minVal = signalYData[j]
                      minIdx = j
                    }
                  }

                  const diff = maxVal - minVal
                  const formattedMax = formatYValue(sig.name, sig.index, maxIdx)
                  const formattedMin = formatYValue(sig.name, sig.index, minIdx)
                  const formattedDiff = (diff / scales[yscale].value).toFixed(precision) + ' ' + (yscale === 'si' ? '' : yscale) + (sig.name.toLowerCase().includes('#branch') || sig.name.toLowerCase().startsWith('i(') ? 'A' : 'V')

                  return (
                    <tr key={sig.name} style={{ borderBottom: '1px solid #eaecef' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 'bold', color: sig.color }}>{sig.name}</td>
                      <td style={{ padding: '8px 12px', color: '#2e7d32', fontWeight: '500' }}>{formattedMax}</td>
                      <td style={{ padding: '8px 12px', color: '#2e7d32', fontWeight: '500' }}>{formatXValue(maxIdx)}</td>
                      <td style={{ padding: '8px 12px', color: '#9c27b0', fontWeight: '500' }}>{formattedMin}</td>
                      <td style={{ padding: '8px 12px', color: '#9c27b0', fontWeight: '500' }}>{formatXValue(minIdx)}</td>
                      <td style={{ padding: '8px 12px', color: '#0366d6', fontWeight: 'bold' }}>{formattedDiff}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }
}

export default Graph
