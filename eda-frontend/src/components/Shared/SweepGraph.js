/* eslint-disable react/prop-types */
import React, { Component } from 'react'
import Chart from 'chart.js'
import 'chartjs-plugin-colorschemes'

let sweepChart

Chart.defaults.global.defaultFontColor = '#e6e6e6'

class SweepGraph extends Component {
  chartRef = React.createRef()

  componentDidMount () { this.buildChart() }
  componentDidUpdate () { this.buildChart() }
  componentWillUnmount () {
    if (typeof sweepChart !== 'undefined') sweepChart.destroy()
  }

  buildChart = () => {
    const ctx = this.chartRef.current.getContext('2d')
    const { traces, component } = this.props
    // traces: [{ value, x: [t...], y: [out...] }, ...]

    if (typeof sweepChart !== 'undefined') sweepChart.destroy()

    // each trace carries its own x/y (steps can have different point
    // counts due to ngspice adaptive timestep) -> use {x,y} points + a
    // linear x-axis instead of one shared category-label array.
    const datasets = traces.map((tr) => ({
      label: `${component}=${tr.value}`,
      data: tr.x.map((xv, i) => ({ x: parseFloat(xv), y: parseFloat(tr.y[i]) })),
      fill: false,
      pointRadius: 0,
      borderWidth: 2,
      showLine: true
    }))

    sweepChart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        plugins: { colorschemes: { scheme: 'brewer.SetOne9' } },
        responsive: true,
        maintainAspectRatio: false,
        legend: { display: true, position: 'top' },
        tooltips: { mode: 'index', intersect: false, backgroundColor: '#39604d' },
        hover: { mode: 'nearest', intersect: true },
        scales: {
          xAxes: [{
            type: 'linear',
            position: 'bottom',
            display: true,
            gridLines: { color: '#67737e' },
            scaleLabel: { display: true, labelString: 'Time (s)' },
            ticks: { maxTicksLimit: 8 }
          }],
          yAxes: [{
            display: true,
            gridLines: { color: '#67737e' },
            scaleLabel: { display: true, labelString: 'v(out)' },
            ticks: { fontSize: 14, padding: 10 }
          }]
        }
      }
    })
  }

  render () {
    return (
      <div style={{ height: '420px', width: '100%' }}>
        <canvas ref={this.chartRef} />
      </div>
    )
  }
}

export default SweepGraph
