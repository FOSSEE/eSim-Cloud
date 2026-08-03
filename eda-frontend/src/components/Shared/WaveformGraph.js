/* eslint-disable react/prop-types */
import React, { Component } from 'react'
import Chart from 'chart.js'

import 'chartjs-plugin-colorschemes'
// Chart Style Options
Chart.defaults.global.defaultFontColor = '#333'

// ── Logic Analyzer Trace Colors ──
const traceColorsDark = ['#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#cba6f7', '#94e2d5', '#fab387', '#f5c2e7'];
const traceColorsLight = ['#d20f39', '#40a02b', '#df8e1d', '#1e66f5', '#8839ef', '#179299', '#fe640b', '#ea76cb'];

class WaveformGraph extends Component {
  constructor(props) {
    super(props);
    this.chartRef = React.createRef();
    this.labelsContainerRef = React.createRef();
    this.dragHandleRef = React.createRef();
    this.currentPanelWidth = 160;
    this.state = {
      hiddenDatasets: {}, // Map of index -> boolean (true if hidden)
      showToolbar: false,
      trackHeight: 45,
      isExporting: false,
      showExportMenu: false
    };
  }

  componentDidMount () {
    this.buildChart()
  }

  componentDidUpdate (prevProps, prevState) {
    if (prevProps !== this.props || prevState.hiddenDatasets !== this.state.hiddenDatasets) {
      this.buildChart()
    }
  }

  toggleDataset = (index) => {
    this.setState(prev => ({
      hiddenDatasets: {
        ...prev.hiddenDatasets,
        [index]: !prev.hiddenDatasets[index]
      }
    }))
  }

  toggleToolbar = () => {
    this.setState(prev => ({ showToolbar: !prev.showToolbar }))
  }

  componentWillUnmount () {
    if (this.lineGraph) {
      this.lineGraph.destroy()
    }
    this.stopDrag();
  }

  exportPNG = () => {
    this.setState({ isExporting: true }, () => {
      this.lineGraph.update(0);
      const canvas = this.chartRef.current;
      const link = document.createElement('a');
      link.download = 'waveform_export.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
      this.setState({ isExporting: false }, () => this.lineGraph.update(0));
    });
  }

  exportPDF = () => {
    this.setState({ isExporting: true }, () => {
      this.lineGraph.update(0);
      const canvas = this.chartRef.current;
      const dataUrl = canvas.toDataURL('image/png');
      this.setState({ isExporting: false }, () => this.lineGraph.update(0));
      
      const { x, y, labels } = this.props;
      
      const visibleIndices = [];
      y.forEach((_, i) => {
          if (!this.state.hiddenDatasets[i]) {
              visibleIndices.push(i);
          }
      });
      
      let tableHtml = "";
      const chunkSize = 10; // Max 10 signals per table to fit A4 page width
      
      for (let i = 0; i < visibleIndices.length; i += chunkSize) {
          const chunk = visibleIndices.slice(i, i + chunkSize);
          
          tableHtml += `<table style="width: 100%; border-collapse: collapse; margin-top: 40px; margin-bottom: 40px; font-family: monospace; font-size: 11px; text-align: center; page-break-inside: auto;">`;
          tableHtml += `<thead><tr style="background: #f0f0f0; color: #333;">`;
          tableHtml += `<th style="border: 1px solid #aaa; padding: 6px; width: 60px;">Time</th>`;
          
          chunk.forEach(sigIdx => {
              tableHtml += `<th style="border: 1px solid #aaa; padding: 6px; word-break: break-all; min-width: 40px;">${labels[sigIdx] || 'Signal_'+sigIdx}</th>`;
          });
          tableHtml += `</tr></thead><tbody>`;
          
          for (let timeIdx = 0; timeIdx < x.length; timeIdx++) {
              tableHtml += `<tr>`;
              tableHtml += `<td style="border: 1px solid #aaa; padding: 4px; font-weight: bold; background: #fafafa; color: #333;">${x[timeIdx]}</td>`;
              
              chunk.forEach(sigIdx => {
                  let val = parseFloat(y[sigIdx][timeIdx]);
                  let displayVal = val > 1 ? '0x' + parseInt(val, 10).toString(16).toUpperCase() : val;
                  tableHtml += `<td style="border: 1px solid #aaa; padding: 4px; color: #333;">${displayVal}</td>`;
              });
              tableHtml += `</tr>`;
              
              if (timeIdx > 3000) {
                  tableHtml += `<tr><td colspan="${chunk.length + 1}" style="padding:10px;">... (Data truncated for PDF size limits) ...</td></tr>`;
                  break;
              }
          }
          tableHtml += `</tbody></table>`;
      }
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
          printWindow.document.write(`
            <html>
            <head>
              <title>Waveform Simulation Report</title>
              <style>
                 @media print {
                    @page { margin: 1cm; size: landscape; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    thead { display: table-header-group; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                 }
              </style>
            </head>
            <body style="margin:0; padding:20px; font-family: sans-serif; background: #fff; color: #333;">
                <h2 style="text-align:center; color: #333; margin-bottom: 30px;">Simulation Event Log & Waveform Report</h2>
                <div style="display:flex; justify-content:center; margin-bottom: 30px;">
                    <img src="${dataUrl}" style="max-width:100%; height:auto; border: 1px solid #ccc; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
                </div>
                ${tableHtml}
            </body>
            <script>window.onload = function() { window.print(); }</script>
            </html>
          `);
          printWindow.document.close();
      }
    });
  }

  exportVCD = () => {
    const { x, y, labels } = this.props;
    let vcd = `$date\n  Today\n$end\n$version\n  eSim Waveform Exporter\n$end\n$timescale\n  1ns\n$end\n$scope module TOP $end\n`;
    
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+,-./:;<=>?@[\\]^_`{|}~";
    let symbols = [];
    y.forEach((_, i) => {
        const sym = chars[i % chars.length];
        symbols.push(sym);
        const name = labels[i] || 'Signal_' + i;
        vcd += `$var wire 1 ${sym} ${name} $end\n`;
    });
    vcd += `$upscope $end\n$enddefinitions $end\n`;
    
    for (let timeIdx = 0; timeIdx < x.length; timeIdx++) {
        vcd += `#${x[timeIdx]}\n`;
        for (let sigIdx = 0; sigIdx < y.length; sigIdx++) {
            vcd += `b${y[sigIdx][timeIdx]} ${symbols[sigIdx]}\n`;
        }
    }
    
    const blob = new Blob([vcd], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = 'waveform_export.vcd';
    link.href = window.URL.createObjectURL(blob);
    link.click();
  }

  startDrag = (e) => {
    e.preventDefault();
    this.isDragging = true;
    document.addEventListener('mousemove', this.onDrag);
    document.addEventListener('mouseup', this.stopDrag);
    if (this.labelsContainerRef.current) {
      this.labelsContainerRef.current.style.pointerEvents = 'none'; // Prevent text selection during drag
    }
  }

  onDrag = (e) => {
    if (!this.isDragging || !this.chartRef.current) return;
    const rect = this.chartRef.current.parentElement.getBoundingClientRect();
    const newWidth = Math.max(80, Math.min(e.clientX - rect.left, rect.width - 50));
    
    this.currentPanelWidth = newWidth;
    
    if (this.labelsContainerRef.current) {
        this.labelsContainerRef.current.style.width = newWidth + 'px';
    }
    if (this.dragHandleRef.current) {
        this.dragHandleRef.current.style.left = (newWidth - 2) + 'px';
    }
    
    if (this.lineGraph) {
        this.lineGraph.options.layout.padding.left = newWidth;
        this.lineGraph.update(0); // Synchronous update for smooth dragging
    }
  }

  stopDrag = () => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.stopDrag);
    if (this.labelsContainerRef.current) {
      this.labelsContainerRef.current.style.pointerEvents = 'auto';
    }
  }

  buildChart = () => {
    const myChartRef = this.chartRef.current.getContext('2d')
    const { x, y, labels, xscale, yscale, precision } = this.props
    const isStepped = this.props.stepped || false
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
      let trackIndex = 0;
      this.visibleTrackLabels = {};

      for (var i = 0; i < y.length; i++) {
        if (!isStepped && labels[0] === labels[i + 1]) continue
        
        const isHidden = !!this.state.hiddenDatasets[i];
        const baseColor = this.props.probeColors && this.props.probeColors[i + 1] ? this.props.probeColors[i + 1] : undefined
        
        const palette = this.props.isDarkMode ? traceColorsDark : traceColorsLight;
        const traceColor = isStepped ? palette[i % palette.length] : baseColor;

        const labelName = isStepped ? (labels[i] || 'Signal ' + i) : labels[i + 1]

        let processedData = [];
        let originalData = [];
        let isBus = false;
        if (isStepped) {
            const rawData = y[i].map(e => parseFloat(e));
            originalData = [...rawData]; 
            
            if (!isHidden) {
                let min = Math.min(...rawData);
                let max = Math.max(...rawData);
                if (min === max) { min = 0; max = max === 0 ? 1 : max; }
                const range = max - min;
                
                if (max > 1) {
                    isBus = true;
                }
                
                processedData = rawData.map(val => {
                    if (isBus) return trackIndex;
                    const normalized = (val - min) / range;
                    return trackIndex - 0.4 + (normalized * 0.8);
                });
                this.visibleTrackLabels[trackIndex] = labelName;
                trackIndex++;
            }
        } else {
            processedData = y[i].map(e => (e / scales[yscale || 'si'].value).toFixed(precision || 0));
        }

        arr.push({
          label: labelName,
          data: processedData,
          originalData: isStepped ? originalData : undefined,
          isBus: isBus,
          traceColor: traceColor,
          fill: false,
          borderColor: (isStepped && isBus) ? 'transparent' : traceColor,
          backgroundColor: 'transparent',
          borderWidth: isStepped ? 1.5 : 1,
          pointRadius: 0,
          steppedLine: isStepped ? 'before' : false,
          yAxisID: 'y-axis-0',
          hidden: isHidden,
          trackIndex: (isStepped && !isHidden) ? trackIndex - 1 : undefined
        })
      }
      this.totalVisibleTracks = trackIndex;
      return arr
    }
    const selectLabel = () => {
      if (isStepped) return 'Time (simulation units)'
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
        labels: isStepped ? x.map(e => String(e)) : x.map(e => (e / scales[xscale || 'si'].value).toFixed(precision || 0)),
        datasets: dataset()
      },

      options: {
        layout: {
          padding: isStepped ? { left: this.currentPanelWidth } : {}
        },
        plugins: {
          colorschemes: { scheme: 'brewer.SetOne9' }
        },
        responsive: true,
        maintainAspectRatio: false,
        legend: {
          display: !isStepped
        },
        title: {
          display: false,
          text: ''
        },
        tooltips: {
          mode: isStepped ? 'nearest' : 'index',
          intersect: false,
          backgroundColor: this.props.isDarkMode ? (isStepped ? '#181825' : '#1e1e2e') : '#f5f5f5',
          titleFontColor: this.props.isDarkMode ? '#cdd6f4' : '#333',
          bodyFontColor: this.props.isDarkMode ? '#cdd6f4' : '#333',
          borderColor: this.props.isDarkMode ? '#313244' : '#ddd',
          borderWidth: 1,
          callbacks: {
            label: function(tooltipItem, data) {
              const dataset = data.datasets[tooltipItem.datasetIndex];
              let val = tooltipItem.yLabel;
              if (isStepped && dataset.originalData) {
                  val = dataset.originalData[tooltipItem.index];
              }
              return dataset.label + ': ' + val;
            }
          }
        },
        hover: {
          mode: 'nearest',
          intersect: true
        },
        scales: {
          xAxes: [
            {
              position: isStepped ? 'top' : 'bottom',
              display: true,
              gridLines: {
                color: isStepped ? (this.props.isDarkMode ? '#333333' : '#e0e0e0') : (this.props.isDarkMode ? '#313244' : '#e0e0e0'),
                zeroLineColor: isStepped ? (this.props.isDarkMode ? '#555555' : '#cccccc') : (this.props.isDarkMode ? '#313244' : '#e0e0e0'),
                borderDash: isStepped ? [4, 4] : [],
                drawBorder: false
              },
              scaleLabel: {
                display: true,
                labelString: selectLabel(),
                fontColor: isStepped ? '#a6adc8' : (this.props.isDarkMode ? '#cdd6f4' : '#333')
              },
              ticks: {
                maxTicksLimit: (scales[xscale || 'si'] || scales.si).ticks,
                fontColor: isStepped ? '#a6adc8' : (this.props.isDarkMode ? '#a6adc8' : '#333')
              }
            }
          ],
          yAxes: isStepped 
            ? [
                {
                  id: 'y-axis-0',
                  display: true,
                  gridLines: { 
                    color: this.props.isDarkMode ? '#222222' : '#f0f0f0', 
                    zeroLineColor: this.props.isDarkMode ? '#222222' : '#f0f0f0',
                    drawBorder: false
                  },
                  ticks: { 
                    reverse: true,
                    min: -0.5, 
                    max: this.totalVisibleTracks ? this.totalVisibleTracks - 0.5 : 1,
                    stepSize: 0.5,
                    fontColor: 'transparent',
                    fontFamily: 'monospace',
                    fontSize: 1,
                    callback: () => ''
                  }
                }
              ]
            : [
                {
                  id: 'y-axis-0',
                  display: true,
                  scaleLabel: {
                    display: false,
                    labelString: 'Voltage ( V )',
                    fontColor: this.props.isDarkMode ? '#cdd6f4' : '#333'
                  },
                  gridLines: {
                    color: this.props.isDarkMode ? '#313244' : '#e0e0e0',
                    zeroLineColor: this.props.isDarkMode ? '#313244' : '#e0e0e0'
                  },
                  ticks: {
                    fontSize: 15,
                    padding: 25,
                    fontColor: this.props.isDarkMode ? '#a6adc8' : '#333'
                  }
                }
              ]
        }
      },
      plugins: isStepped ? [{
        afterDatasetsDraw: (chart) => {
          const ctx = chart.ctx;
          const yAxis = chart.scales['y-axis-0'];
          if (!yAxis) return;
          
          chart.data.datasets.forEach((meta, i) => {
            if (meta.hidden) return;
            const datasetMeta = chart.getDatasetMeta(i);
            if (!datasetMeta || !datasetMeta.data || datasetMeta.data.length === 0) return;
            
            ctx.save();
            
            if (meta.isBus) {
                const yCenter = datasetMeta.data[0]._model.y; 
                const yHeight = 12; // half-height of the bus hexagon
                
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '12px monospace';
                
                let prevX = datasetMeta.data[0]._model.x;
                let prevVal = meta.originalData[0];
                
                for (let index = 1; index < datasetMeta.data.length; index++) {
                   const x = datasetMeta.data[index]._model.x;
                   const val = meta.originalData[index];
                   
                   if (val !== prevVal || index === datasetMeta.data.length - 1) {
                       let drawX = x;
                       
                       ctx.fillStyle = meta.traceColor;
                       ctx.strokeStyle = meta.traceColor;
                       ctx.lineWidth = 1.5;
                       
                       ctx.beginPath();
                       ctx.moveTo(prevX + 4, yCenter - yHeight);
                       ctx.lineTo(drawX - 4, yCenter - yHeight);
                       ctx.lineTo(drawX, yCenter);
                       ctx.lineTo(drawX - 4, yCenter + yHeight);
                       ctx.lineTo(prevX + 4, yCenter + yHeight);
                       ctx.lineTo(prevX, yCenter);
                       ctx.closePath();
                       
                       ctx.stroke();
                       
                       ctx.globalAlpha = 0.2;
                       ctx.fill();
                       ctx.globalAlpha = 1.0;
                       
                       const textX = (prevX + drawX) / 2;
                       const hexStr = '0x' + parseInt(prevVal, 10).toString(16).toUpperCase();
                       
                       const textWidth = ctx.measureText(hexStr).width;
                       if (drawX - prevX > textWidth + 8) {
                           ctx.fillStyle = this.props.isDarkMode ? '#ffffff' : '#000000';
                           ctx.fillText(hexStr, textX, yCenter);
                       }
                       
                       prevX = drawX;
                       prevVal = val;
                   }
                }
            } else {
                // Scalar net shading for '1' signal
                const trackIdx = meta.trackIndex;
                if (trackIdx === undefined) {
                    ctx.restore();
                    return;
                }
                
                // baseline is trackIdx - 0.4, high is trackIdx + 0.4
                const baselineY = yAxis.getPixelForValue(trackIdx - 0.4);
                const highY = yAxis.getPixelForValue(trackIdx + 0.4);
                
                const rectTop = Math.min(baselineY, highY);
                const rectHeight = Math.abs(baselineY - highY);
                
                let prevX = datasetMeta.data[0]._model.x;
                let prevVal = meta.originalData[0];
                
                for (let index = 1; index < datasetMeta.data.length; index++) {
                   const x = datasetMeta.data[index]._model.x;
                   const val = meta.originalData[index];
                   
                   if (val !== prevVal || index === datasetMeta.data.length - 1) {
                       let drawX = x;
                       
                       if (prevVal > 0) {
                           ctx.fillStyle = meta.traceColor;
                           ctx.globalAlpha = 0.2;
                           ctx.fillRect(prevX, rectTop, drawX - prevX, rectHeight);
                           ctx.globalAlpha = 1.0;
                       }
                       
                       prevX = drawX;
                       prevVal = val;
                   }
                }
            }
            ctx.restore();
          });
        },
        afterDraw: (chart) => {
          const ctx = chart.ctx;
          const chartArea = chart.chartArea;
          const yAxis = chart.scales['y-axis-0'];
          if (!yAxis) return;
          
          const panelWidth = this.currentPanelWidth || 160;
          const isDark = this.props.isDarkMode;
          
          ctx.save();
          
          // 1. Draw Table Header Background
          ctx.fillStyle = isDark ? '#1a1a24' : '#e6e6e6';
          ctx.fillRect(0, 0, panelWidth, chartArea.top);
          
          // 2. Draw Table Header Text
          ctx.fillStyle = isDark ? '#cdd6f4' : '#333333';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText('Name', 15, chartArea.top / 2);
          
          // 3. Draw rows
          for (let i = 0; i < this.totalVisibleTracks; i++) {
              const yTop = yAxis.getPixelForValue(i - 0.5);
              const yBottom = yAxis.getPixelForValue(i + 0.5);
              
              // Row background
              ctx.fillStyle = i % 2 === 0 ? (isDark ? '#11111b' : '#fafafa') : (isDark ? '#181825' : '#ffffff');
              ctx.fillRect(0, yTop, panelWidth, yBottom - yTop);
              
              // Bottom border for row
              ctx.strokeStyle = isDark ? '#313244' : '#e0e0e0';
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(0, yBottom);
              ctx.lineTo(panelWidth, yBottom);
              ctx.stroke();
              
              // Text rendering for PNG/PDF Export
              if (this.state.isExporting) {
                  const label = this.visibleTrackLabels[i] || '';
                  ctx.fillStyle = isDark ? '#cdd6f4' : '#333333';
                  ctx.font = '13px monospace';
                  ctx.textAlign = 'left';
                  ctx.textBaseline = 'middle';
                  
                  ctx.save();
                  ctx.beginPath();
                  ctx.rect(0, yTop, panelWidth - 5, yBottom - yTop);
                  ctx.clip();
                  ctx.fillText(label, 15, (yTop + yBottom) / 2);
                  ctx.restore();
              }
          }
          
          // Right border for the entire panel
          ctx.strokeStyle = isDark ? '#313244' : '#cccccc';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(panelWidth, 0);
          ctx.lineTo(panelWidth, chart.canvas.height);
          ctx.stroke();
          
          ctx.restore();
          
          // 4. Update HTML overlay for labels (hide during export so canvas captures text)
          if (this.labelsContainerRef && this.labelsContainerRef.current) {
              const container = this.labelsContainerRef.current;
              container.style.top = chartArea.top + 'px';
              container.style.height = (chartArea.bottom - chartArea.top) + 'px';
              container.style.display = this.state.isExporting ? 'none' : 'block';
              
              if (container.children.length !== this.totalVisibleTracks) {
                  container.innerHTML = '';
                  for (let i = 0; i < this.totalVisibleTracks; i++) {
                      const el = document.createElement('div');
                      el.style.display = 'flex';
                      el.style.alignItems = 'center';
                      el.style.overflowX = 'auto';
                      el.style.paddingLeft = '15px';
                      el.style.paddingRight = '5px';
                      el.style.color = isDark ? '#cdd6f4' : '#333333';
                      el.style.font = '13px monospace';
                      el.style.whiteSpace = 'nowrap';
                      // Hide scrollbar but keep scroll functionality
                      el.style.scrollbarWidth = 'none'; // Firefox
                      el.style.msOverflowStyle = 'none'; // IE/Edge
                      
                      const inner = document.createElement('span');
                      inner.innerText = this.visibleTrackLabels[i] || '';
                      el.appendChild(inner);
                      
                      container.appendChild(el);
                  }
              }
              // Align heights precisely with canvas grid
              for (let i = 0; i < this.totalVisibleTracks; i++) {
                  const child = container.children[i];
                  if (child) {
                      const yTop = yAxis.getPixelForValue(i - 0.5) - chartArea.top;
                      const yBottom = yAxis.getPixelForValue(i + 0.5) - chartArea.top;
                      child.style.height = (yBottom - yTop) + 'px';
                  }
              }
          }
        }
      }] : []
    })
  };

  render () {
    const isStepped = this.props.stepped || false;
    const { y, labels } = this.props;
    
    const visibleTracksCount = (y && isStepped) ? y.filter((_, i) => !this.state.hiddenDatasets[i]).length : 0;

    return (
      <div style={isStepped ? { display: 'flex', flexDirection: 'column', height: '100%', width: '100%' } : {}}>
        {isStepped && (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            backgroundColor: this.props.isDarkMode ? '#181825' : '#e6e9ef',
            borderBottom: `1px solid ${this.props.isDarkMode ? '#313244' : '#ccd0da'}`,
          }}>
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '8px 12px',
                userSelect: 'none'
              }}
            >
              <span onClick={this.toggleToolbar} style={{ fontWeight: 'bold', color: this.props.isDarkMode ? '#a6adc8' : '#6c6f85', fontSize: '13px', cursor: 'pointer' }}>
                <span style={{ display: 'inline-block', width: '16px', marginRight: '4px' }}>
                  {this.state.showToolbar ? '▼' : '▶'}
                </span>
                Toggle Signals
              </span>
              
              <div style={{ display: 'flex', alignItems: 'center' }}>
                 <span style={{ fontSize: '11px', color: this.props.isDarkMode ? '#8c8fa1' : '#8c8fa1', marginRight: '8px' }}>Row Height:</span>
                 <input 
                    type="range" 
                    min="15" 
                    max="100" 
                    value={this.state.trackHeight} 
                    onChange={e => this.setState({ trackHeight: parseInt(e.target.value, 10) })}
                    style={{ width: '80px', cursor: 'ew-resize', marginRight: '16px' }}
                 />
                 <span style={{ fontSize: '12px', color: this.props.isDarkMode ? '#a6adc8' : '#8c8fa1', fontWeight: 'bold' }}>
                   {Object.values(this.state.hiddenDatasets).filter(Boolean).length} hidden
                 </span>
                 
                 <div style={{ position: 'relative', marginLeft: '12px' }} onMouseLeave={() => this.setState({ showExportMenu: false })}>
                    <button 
                       onClick={(e) => { e.stopPropagation(); this.setState(p => ({ showExportMenu: !p.showExportMenu })) }}
                       style={{ background: '#3498DB', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                       Export ▾
                    </button>
                    {this.state.showExportMenu && (
                       <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: '4px', background: this.props.isDarkMode ? '#1e1e2e' : 'white', border: `1px solid ${this.props.isDarkMode ? '#313244' : '#ccc'}`, borderRadius: '4px', zIndex: 100, display: 'flex', flexDirection: 'column', width: '130px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
                          <div onClick={(e) => { e.stopPropagation(); this.exportPNG(); this.setState({showExportMenu: false}) }} style={{ padding: '8px 12px', fontSize: '12px', color: this.props.isDarkMode ? '#cdd6f4' : '#333', cursor: 'pointer', borderBottom: `1px solid ${this.props.isDarkMode ? '#313244' : '#eee'}` }}>Download PNG</div>
                          <div onClick={(e) => { e.stopPropagation(); this.exportPDF(); this.setState({showExportMenu: false}) }} style={{ padding: '8px 12px', fontSize: '12px', color: this.props.isDarkMode ? '#cdd6f4' : '#333', cursor: 'pointer', borderBottom: `1px solid ${this.props.isDarkMode ? '#313244' : '#eee'}` }}>Print Report (PDF)</div>
                          <div onClick={(e) => { e.stopPropagation(); this.exportVCD(); this.setState({showExportMenu: false}) }} style={{ padding: '8px 12px', fontSize: '12px', color: this.props.isDarkMode ? '#cdd6f4' : '#333', cursor: 'pointer' }}>Export VCD</div>
                       </div>
                    )}
                 </div>
              </div>
            </div>
            
            {this.state.showToolbar && (
              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px', 
                padding: '0 12px 12px 12px',
                alignItems: 'center'
              }}>
                {y.map((_, i) => {
                  const labelName = labels[i] || 'Signal ' + i;
                  const isHidden = !!this.state.hiddenDatasets[i];
                  
                  const palette = this.props.isDarkMode ? traceColorsDark : traceColorsLight;
                  const traceColor = palette[i % palette.length];
                  
                  return (
                    <label key={i} style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      cursor: 'pointer', 
                      fontSize: '12px', 
                      userSelect: 'none',
                      color: traceColor,
                      fontWeight: 'bold',
                      background: this.props.isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                      padding: '4px 8px',
                      borderRadius: '4px'
                    }}>
                      <input 
                        type="checkbox" 
                        checked={!isHidden} 
                        onChange={() => this.toggleDataset(i)} 
                        style={{ marginRight: '6px', cursor: 'pointer', accentColor: traceColor }}
                      />
                      {labelName}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
        <div style={isStepped ? { 
          flexGrow: 1, 
          position: 'relative', 
          backgroundColor: this.props.isDarkMode ? '#000000' : '#ffffff',
          margin: '10px',
          border: `1px solid ${this.props.isDarkMode ? '#313244' : '#ccd0da'}`,
          borderRadius: '6px',
          padding: '10px',
          paddingLeft: '0px',
          overflowY: 'auto',
          overflowX: 'hidden'
        } : {}}>
          <div style={{ height: isStepped ? Math.max(400, visibleTracksCount * this.state.trackHeight) + 'px' : '100%', position: 'relative' }}>
            {isStepped && (
              <div 
                ref={this.labelsContainerRef} 
                style={{ 
                  position: 'absolute', 
                  left: 0, 
                  width: `${this.currentPanelWidth}px`, 
                  zIndex: 10,
                  pointerEvents: 'auto' 
                }}
              />
            )}
            {isStepped && (
              <div 
                ref={this.dragHandleRef}
                onMouseDown={this.startDrag}
                style={{
                  position: 'absolute',
                  left: `${this.currentPanelWidth - 2}px`,
                  top: 0,
                  width: '5px',
                  height: '100%',
                  cursor: 'col-resize',
                  zIndex: 20,
                  backgroundColor: 'transparent'
                }}
              />
            )}
            <canvas ref={this.chartRef} />
          </div>
        </div>
      </div>
    )
  }
}

export default WaveformGraph
