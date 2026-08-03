/**
 * Formatted PDF report via the browser print engine.
 *
 * Opens a hidden iframe with a landscape-A4 @media print layout and
 * calls print(). Wide signal sets are chunked into tables of at most
 * 10 signals; the Time column is duplicated on the left edge of every
 * chunk so each table keeps its coordinate reference. Bus values are
 * rendered in hex.
 */

import {
  chunkSignalData, collectTimestamps, signalValueAt, formatToHex,
  formatTime
} from './vcdUtils'

export const MAX_SIGNALS_PER_TABLE = 10

function escapeHtml (s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function buildReportHTML (opts) {
  const { signals, timescale, endtime, title, simulator } = opts
  const chunks = chunkSignalData(signals, MAX_SIGNALS_PER_TABLE)
  const timestamps = collectTimestamps(signals)

  let body = `
    <h1>${escapeHtml(title || 'Logic Analyzer Report')}</h1>
    <div class="meta">
      Generated ${escapeHtml(new Date().toLocaleString())}
      &nbsp;•&nbsp; Simulator: ${escapeHtml(simulator || 'HDL')}
      &nbsp;•&nbsp; Timescale: ${escapeHtml(timescale)}
      &nbsp;•&nbsp; End time: ${escapeHtml(formatTime(endtime, timescale))}
      &nbsp;•&nbsp; ${signals.length} signals, ${timestamps.length} sampled
      time points
    </div>`

  chunks.forEach((chunk, ci) => {
    body += `
    <h2>Signals ${ci * MAX_SIGNALS_PER_TABLE + 1}–${ci *
      MAX_SIGNALS_PER_TABLE + chunk.length} of ${signals.length}</h2>
    <table>
      <thead>
        <tr>
          <th class="time">Time</th>
          ${chunk.map((sig) =>
            `<th>${escapeHtml(sig.name)}${sig.width > 1
              ? `<span class="width">[${sig.width - 1}:0]</span>` : ''}</th>`
          ).join('')}
        </tr>
      </thead>
      <tbody>
        ${timestamps.map((t) => `
        <tr>
          <td class="time">${escapeHtml(formatTime(t, timescale))}</td>
          ${chunk.map((sig) => {
            const v = signalValueAt(sig, t)
            return `<td>${escapeHtml(formatToHex(v, sig.width))}</td>`
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
    ${ci < chunks.length - 1 ? '<div class="page-break"></div>' : ''}`
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || 'Logic Analyzer Report')}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  @media print {
    .page-break { page-break-after: always; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    margin: 24px;
  }
  h1 { font-size: 18px; margin: 0 0 4px 0; }
  h2 { font-size: 13px; margin: 18px 0 6px 0; }
  .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 10px;
    font-family: "Courier New", monospace;
  }
  th, td {
    border: 1px solid #999;
    padding: 2px 6px;
    text-align: center;
    white-space: nowrap;
  }
  th {
    background: #E8E8E8;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    word-break: break-all;
    white-space: normal;
    max-width: 90px;
  }
  th .width { color: #777; font-weight: normal; }
  th.time, td.time {
    background: #F3F3F3;
    font-weight: bold;
    text-align: right;
  }
  tbody tr:nth-child(even) td { background: #FAFAFA; }
  tbody tr:nth-child(even) td.time { background: #EFEFEF; }
</style>
</head>
<body>${body}</body>
</html>`
}

/** Render the report in a hidden iframe and invoke the print dialog. */
export function printReport (opts) {
  const html = buildReportHTML(opts)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow.document
  doc.open()
  doc.write(html)
  doc.close()
  iframe.onload = () => {
    iframe.contentWindow.focus()
    iframe.contentWindow.print()
    // leave the iframe in place long enough for the dialog to grab it
    setTimeout(() => document.body.removeChild(iframe), 60000)
  }
}
