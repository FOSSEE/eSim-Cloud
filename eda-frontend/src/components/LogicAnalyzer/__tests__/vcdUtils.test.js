import {
  parseVCD, writeVCD, chunkSignalData, signalValueAt, formatToHex,
  formatTime, collectTimestamps, parseTimescale
} from '../vcdUtils'
import { buildReportHTML, MAX_SIGNALS_PER_TABLE } from '../pdfReport'
import { niceTimeStep } from '../waveformRenderer'

const SAMPLE_VCD = `$date today $end
$version test $end
$timescale
  1 ns
$end
$scope module tb $end
$var reg 1 ! clk $end
$var reg 1 " rst $end
$scope module uut $end
$var reg 4 # count [3:0] $end
$upscope $end
$upscope $end
$enddefinitions $end
$dumpvars
0!
1"
bxxxx #
$end
#5
1!
#10
0!
0"
b0 #
#15
1!
b1 #
#20
0!
#25
1!
b10 #
#40
`

describe('parseVCD', () => {
  const parsed = parseVCD(SAMPLE_VCD)

  it('reads timescale, endtime and hierarchy', () => {
    expect(parsed.timescale).toBe('1 ns')
    expect(parsed.endtime).toBe(40)
    expect(parsed.signals.map((s) => s.name)).toEqual(
      ['tb.clk', 'tb.rst', 'tb.uut.count'])
  })

  it('extends vectors to declared width', () => {
    const count = parsed.signals[2]
    expect(count.width).toBe(4)
    expect(count.wave).toEqual([
      [0, 'xxxx'], [10, '0000'], [15, '0001'], [25, '0010']
    ])
  })

  it('records scalar transitions', () => {
    const clk = parsed.signals[0]
    expect(clk.wave[0]).toEqual([0, '0'])
    expect(clk.wave[1]).toEqual([5, '1'])
    expect(clk.wave.length).toBe(6)
  })
})

describe('writeVCD round-trip', () => {
  it('reconstructs a VCD that parses back to the same data', () => {
    const parsed = parseVCD(SAMPLE_VCD)
    const text = writeVCD(parsed.signals, parsed.timescale, parsed.endtime)
    expect(text).toContain('$timescale')
    expect(text).toContain('$scope module tb $end')
    expect(text).toContain('$enddefinitions $end')
    const reparsed = parseVCD(text)
    expect(reparsed.endtime).toBe(parsed.endtime)
    expect(reparsed.signals.map((s) => s.name)).toEqual(
      parsed.signals.map((s) => s.name))
    reparsed.signals.forEach((sig, i) => {
      expect(sig.wave).toEqual(parsed.signals[i].wave)
    })
  })
})

describe('signalValueAt', () => {
  const sig = { name: 'a', width: 4, wave: [[10, '0000'], [20, '0101']] }
  it('returns x before the first change', () => {
    expect(signalValueAt(sig, 5)).toBe('xxxx')
  })
  it('returns the last change at or before t', () => {
    expect(signalValueAt(sig, 10)).toBe('0000')
    expect(signalValueAt(sig, 19)).toBe('0000')
    expect(signalValueAt(sig, 20)).toBe('0101')
    expect(signalValueAt(sig, 999)).toBe('0101')
  })
})

describe('formatToHex', () => {
  it('converts binary vectors to hex', () => {
    expect(formatToHex('0101', 4)).toBe('0x5')
    expect(formatToHex('11111111', 8)).toBe('0xFF')
    expect(formatToHex('101010', 6)).toBe('0x2A')
  })
  it('propagates unknown bits per nibble', () => {
    expect(formatToHex('xxxx0101', 8)).toBe('0xX5')
    expect(formatToHex('zzzz', 4)).toBe('0xZ')
  })
  it('passes scalars through', () => {
    expect(formatToHex('1', 1)).toBe('1')
    expect(formatToHex('x', 1)).toBe('x')
  })
})

describe('formatTime / parseTimescale', () => {
  it('parses timescale strings', () => {
    expect(parseTimescale('1 ns')).toEqual({ mag: 1, unit: 'ns' })
    expect(parseTimescale('10ps')).toEqual({ mag: 10, unit: 'ps' })
    expect(parseTimescale('garbage')).toEqual({ mag: 1, unit: 'ns' })
  })
  it('auto-scales to readable units', () => {
    expect(formatTime(5, '1 ns')).toBe('5 ns')
    expect(formatTime(1500, '1 ns')).toBe('1.5 us')
    expect(formatTime(12000000, '1 fs')).toBe('12 ns')
    expect(formatTime(0, '1 ns')).toBe('0 s')
  })
})

describe('chunkSignalData', () => {
  it('splits into groups of at most 10', () => {
    const signals = Array.from({ length: 23 }, (_, i) => ({ name: 's' + i }))
    const chunks = chunkSignalData(signals, 10)
    expect(chunks.length).toBe(3)
    expect(chunks[0].length).toBe(10)
    expect(chunks[2].length).toBe(3)
    expect(chunks[2][0].name).toBe('s20')
  })
})

describe('collectTimestamps', () => {
  it('unions and sorts change times', () => {
    const signals = [
      { name: 'a', width: 1, wave: [[0, '0'], [10, '1']] },
      { name: 'b', width: 1, wave: [[5, '0'], [10, '1'], [20, '0']] }
    ]
    expect(collectTimestamps(signals)).toEqual([0, 5, 10, 20])
  })
  it('downsamples long time lists keeping first and last', () => {
    const wave = Array.from({ length: 1000 }, (_, i) => [i, '0'])
    const times = collectTimestamps([{ name: 'a', width: 1, wave }], 100)
    expect(times.length).toBeLessThanOrEqual(100)
    expect(times[0]).toBe(0)
    expect(times[times.length - 1]).toBe(999)
  })
})

describe('buildReportHTML', () => {
  it('duplicates the Time column in every chunked table', () => {
    const signals = Array.from({ length: 25 }, (_, i) => ({
      name: 'sig' + i,
      width: 4,
      wave: [[0, '0000'], [10, '0101']]
    }))
    const html = buildReportHTML({
      signals, timescale: '1 ns', endtime: 20, title: 'T', simulator: 'ghdl'
    })
    const tables = html.match(/<table>/g)
    expect(tables.length).toBe(Math.ceil(25 / MAX_SIGNALS_PER_TABLE))
    const timeHeaders = html.match(/<th class="time">Time<\/th>/g)
    expect(timeHeaders.length).toBe(tables.length)
    expect(html).toContain('0x5') // hex bus formatting
    expect(html).toContain('page-break')
    expect(html).toContain('A4 landscape')
  })

  it('escapes HTML in signal names', () => {
    const html = buildReportHTML({
      signals: [{ name: 'a<b>&c', width: 1, wave: [[0, '1']] }],
      timescale: '1 ns',
      endtime: 5,
      title: 'x'
    })
    expect(html).toContain('a&lt;b&gt;&amp;c')
    expect(html).not.toContain('a<b>&c')
  })
})

describe('niceTimeStep', () => {
  it('returns 1/2/5 decade steps', () => {
    const step = niceTimeStep(1) // 1 tick per px, target 90px
    expect([100, 200, 500].includes(step)).toBe(true)
    expect(niceTimeStep(0.001)).toBeLessThanOrEqual(0.5)
  })
})
