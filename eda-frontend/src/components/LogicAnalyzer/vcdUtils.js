/* eslint-disable camelcase */
/**
 * Pure utilities for the Logic Analyzer:
 *  - parseVCD:        VCD text -> { timescale, endtime, signals }
 *  - writeVCD:        signals  -> standard-compliant VCD text (client-side,
 *                     no backend roundtrip)
 *  - chunkSignalData: split signal list into <=N-signal groups for the
 *                     landscape-A4 PDF tables
 *  - signalValueAt:   value of a signal at an arbitrary time
 *  - formatToHex:     binary vector string -> 0x.. hex (x/z aware)
 *  - formatTime:      raw VCD ticks + timescale -> human-readable string
 *
 * Signal shape used everywhere:
 *   { name: 'tb.uut.count', width: 4, wave: [[time, value], ...] }
 * Scalar values: '0' | '1' | 'x' | 'z'. Vectors: plain binary strings.
 */

const TIMESCALE_UNITS = { fs: 1, ps: 1e3, ns: 1e6, us: 1e9, ms: 1e12, s: 1e15 }

/** Parse '$timescale 1 ns $end' body like '1 ns' -> { mag: 1, unit: 'ns' } */
export function parseTimescale (ts) {
  const m = /(\d+)\s*(fs|ps|ns|us|ms|s)/.exec(ts || '')
  if (!m) return { mag: 1, unit: 'ns' }
  return { mag: parseInt(m[1], 10), unit: m[2] }
}

/** Raw tick count -> readable time, auto-scaled ('12.5 us'). */
export function formatTime (ticks, timescale) {
  const { mag, unit } = parseTimescale(timescale)
  const fs = ticks * mag * TIMESCALE_UNITS[unit]
  const order = ['s', 'ms', 'us', 'ns', 'ps', 'fs']
  for (let i = 0; i < order.length; i++) {
    const v = fs / TIMESCALE_UNITS[order[i]]
    if (v >= 1) {
      const rounded = Math.round(v * 100) / 100
      return `${rounded} ${order[i]}`
    }
  }
  return '0 s'
}

function extendVector (value, width) {
  if (value.length >= width) {
    return value.length > width ? value.slice(-width) : value
  }
  const pad = (value[0] === 'x' || value[0] === 'z') ? value[0] : '0'
  return pad.repeat(width - value.length) + value
}

/**
 * Client-side VCD parser (mirrors backend helpers/vcd_parser.py) so that
 * .vcd files can be dropped straight into the viewer without a backend.
 */
export function parseVCD (text) {
  const signalsById = {}
  const order = []
  const scopeStack = []
  let timescale = '1ns'

  const tsMatch = /\$timescale\s+([\s\S]+?)\s*\$end/.exec(text)
  if (tsMatch) timescale = tsMatch[1].replace(/\s+/g, ' ').trim()

  const lines = text.split('\n')
  let i = 0
  // ---- header ----
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('$scope')) {
      const m = /\$scope\s+\w+\s+(\S+)\s+\$end/.exec(line)
      if (m) scopeStack.push(m[1])
    } else if (line.startsWith('$upscope')) {
      scopeStack.pop()
    } else if (line.startsWith('$var')) {
      const m = /\$var\s+\w+\s+(\d+)\s+(\S+)\s+(.+?)\s+\$end/.exec(line)
      if (m) {
        const width = parseInt(m[1], 10)
        const id = m[2]
        const name = m[3].split('[')[0].trim()
        if (!signalsById[id]) {
          signalsById[id] = {
            name: scopeStack.concat(name).join('.'),
            width,
            wave: []
          }
          order.push(id)
        }
      }
    } else if (line.startsWith('$enddefinitions')) {
      i++
      break
    }
  }

  // ---- value changes ----
  let time = 0
  let endtime = 0
  for (; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const c = line[0]
    if (c === '#') {
      const t = parseInt(line.slice(1), 10)
      if (!isNaN(t)) {
        time = t
        if (t > endtime) endtime = t
      }
    } else if (c === 'b' || c === 'B') {
      const parts = line.split(/\s+/)
      if (parts.length === 2) {
        const sig = signalsById[parts[1]]
        if (sig) {
          sig.wave.push([time, extendVector(parts[0].slice(1).toLowerCase(), sig.width)])
        }
      }
    } else if (c === 'r' || c === 'R') {
      const parts = line.split(/\s+/)
      if (parts.length === 2) {
        const sig = signalsById[parts[1]]
        if (sig) sig.wave.push([time, parts[0].slice(1)])
      }
    } else if ('01xXzZ'.indexOf(c) !== -1) {
      const sig = signalsById[line.slice(1)]
      if (sig) sig.wave.push([time, c.toLowerCase()])
    }
  }

  return {
    timescale,
    endtime,
    signals: order.map((id) => signalsById[id])
  }
}

/** VCD identifier codes: printable ASCII 33..126, multi-char after 94. */
function vcdId (index) {
  const base = 94 // printable chars ! (33) .. ~ (126)
  let id = ''
  let n = index
  do {
    id += String.fromCharCode(33 + (n % base))
    n = Math.floor(n / base) - 1
  } while (n >= 0)
  return id
}

/**
 * Reconstruct standard-compliant VCD text from the active dataset —
 * lets the user download a .vcd instantly without a backend roundtrip.
 */
export function writeVCD (signals, timescale, endtime) {
  const lines = []
  lines.push('$date')
  lines.push('  ' + new Date().toString())
  lines.push('$end')
  lines.push('$version')
  lines.push('  eSim-Cloud Logic Analyzer export')
  lines.push('$end')
  lines.push('$timescale')
  lines.push('  ' + (timescale || '1ns'))
  lines.push('$end')

  // Rebuild scope tree from dotted names.
  const ids = signals.map((s, i) => vcdId(i))
  let openScopes = []
  signals.forEach((sig, i) => {
    const parts = sig.name.split('.')
    const scopes = parts.slice(0, -1)
    const leaf = parts[parts.length - 1]
    // close scopes that no longer match
    let common = 0
    while (common < openScopes.length && common < scopes.length &&
           openScopes[common] === scopes[common]) common++
    while (openScopes.length > common) {
      lines.push('$upscope $end')
      openScopes.pop()
    }
    for (let d = common; d < scopes.length; d++) {
      lines.push(`$scope module ${scopes[d]} $end`)
      openScopes.push(scopes[d])
    }
    const ref = sig.width > 1 ? `${leaf} [${sig.width - 1}:0]` : leaf
    lines.push(`$var wire ${sig.width} ${ids[i]} ${ref} $end`)
  })
  while (openScopes.length > 0) {
    lines.push('$upscope $end')
    openScopes.pop()
  }
  lines.push('$enddefinitions $end')

  // Merge all change lists into a single time-ordered stream.
  const events = {} // time -> [line, ...]
  signals.forEach((sig, i) => {
    sig.wave.forEach(([t, v]) => {
      if (!events[t]) events[t] = []
      events[t].push(sig.width > 1 ? `b${v} ${ids[i]}` : `${v}${ids[i]}`)
    })
  })
  const times = Object.keys(events).map(Number).sort((a, b) => a - b)
  times.forEach((t) => {
    lines.push('#' + t)
    events[t].forEach((l) => lines.push(l))
  })
  if (endtime && (times.length === 0 || times[times.length - 1] < endtime)) {
    lines.push('#' + endtime)
  }
  return lines.join('\n') + '\n'
}

/** Value of a signal at time t (last change at or before t). */
export function signalValueAt (signal, t) {
  const wave = signal.wave
  if (wave.length === 0 || t < wave[0][0]) {
    return signal.width > 1 ? 'x'.repeat(signal.width) : 'x'
  }
  // binary search for the last index with time <= t
  let lo = 0
  let hi = wave.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (wave[mid][0] <= t) lo = mid
    else hi = mid - 1
  }
  return wave[lo][1]
}

/**
 * Binary vector string -> hex ('0x2A'). Buses containing x/z propagate
 * per-nibble ('0x2X'). Scalars pass through unchanged.
 */
export function formatToHex (value, width) {
  if (width <= 1 || value.length <= 1) return value
  if (/^[-+0-9.eE]+$/.test(value) && /[.eE]/.test(value)) return value // real
  const padded = extendVector(value, Math.ceil(value.length / 4) * 4)
  let hex = ''
  for (let i = 0; i < padded.length; i += 4) {
    const nibble = padded.slice(i, i + 4)
    if (nibble.indexOf('x') !== -1) hex += 'X'
    else if (nibble.indexOf('z') !== -1) hex += 'Z'
    else hex += parseInt(nibble, 2).toString(16).toUpperCase()
  }
  return '0x' + hex
}

/**
 * Split the signal list into groups of at most maxSignalsPerTable for
 * landscape-A4 PDF tables. The Time column is re-emitted per chunk by
 * the report generator so every table keeps its coordinate reference.
 */
export function chunkSignalData (signals, maxSignalsPerTable = 10) {
  const chunks = []
  for (let i = 0; i < signals.length; i += maxSignalsPerTable) {
    chunks.push(signals.slice(i, i + maxSignalsPerTable))
  }
  return chunks
}

/**
 * Union of all signal change times, uniformly downsampled to at most
 * maxRows entries (first/last always kept) for the PDF report.
 */
export function collectTimestamps (signals, maxRows = 400) {
  const set = {}
  signals.forEach((sig) => {
    sig.wave.forEach(([t]) => { set[t] = true })
  })
  const times = Object.keys(set).map(Number).sort((a, b) => a - b)
  if (times.length <= maxRows) return times
  const step = (times.length - 1) / (maxRows - 1)
  const sampled = []
  for (let i = 0; i < maxRows; i++) {
    sampled.push(times[Math.round(i * step)])
  }
  return sampled.filter((t, i) => i === 0 || t !== sampled[i - 1])
}
