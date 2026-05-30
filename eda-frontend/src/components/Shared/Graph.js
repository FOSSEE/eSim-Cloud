/* eslint-disable react/prop-types */
import React, { Component } from 'react'
import Chart from 'chart.js'

import 'chartjs-plugin-colorschemes'
// Chart Style Options
Chart.defaults.global.defaultFontColor = '#333'

class Graph extends Component {
  chartRef = React.createRef();

  componentDidMount () {
    this.buildChart()
  }

  componentDidUpdate () {
    this.buildChart()
  }

  componentWillUnmount () {
    if (this.lineGraph) {
      this.lineGraph.destroy()
    }
  }

  buildChart = () => {
    const myChartRef = this.chartRef.current.getContext('2d')
    const { x, y, labels, xscale, yscale, precision } = this.props
    // ticks are the number of points to show on x axis
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
    if (this.lineGraph) this.lineGraph.destroy()

    const dataset = () => {
      var arr = []

      for (var i = 0; i < y.length; i++) {
        if (labels[0] === labels[i + 1]) continue
        
        const color = this.props.probeColors && this.props.probeColors[i + 1] ? this.props.probeColors[i + 1] : undefined

        arr.push({
          label: labels[i + 1],
          data: y[i].map(e => (e / scales[yscale].value).toFixed(precision)),
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

        // labels: x,
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
        title: {
          display: false,
          text: ''
        },
        tooltips: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#f5f5f5',
          titleFontColor: '#333',
          bodyFontColor: '#333',
          borderColor: '#ddd',
          borderWidth: 1
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
                display: true,
                labelString: selectLabel()
              },

              ticks: {
                maxTicksLimit: scales[xscale].ticks
              }
            }
          ],
          yAxes: [
            {
              display: true,
              scaleLabel: {
                display: false,
                labelString: 'Volatge ( V )'
              },
              gridLines: {
                color: '#e0e0e0'
              },
              ticks: {
                // beginAtZero: true,
                fontSize: 15,
                padding: 25
              }
            }
          ]
        }
      }
    })
  };

  render () {
    return (
      <div>
        <canvas ref={this.chartRef} />
      </div>
    )
  }
}

export default Graph
