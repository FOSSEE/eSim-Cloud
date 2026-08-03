import React from 'react'
import ReactDOM from 'react-dom'
import LogicAnalyzer from '../LogicAnalyzer'

const SIGNALS = [
  { name: 'tb.clk', width: 1, wave: [[0, '0'], [5, '1'], [10, '0']] },
  {
    name: 'tb.uut.instruction_decoder.alu_ctrl.op_code',
    width: 8,
    wave: [[0, 'xxxxxxxx'], [10, '00101010']]
  }
]

describe('LogicAnalyzer smoke test', () => {
  let container

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(container)
    document.body.removeChild(container)
  })

  it('mounts with signals and renders label rows + controls', () => {
    ReactDOM.render(
      <LogicAnalyzer
        signals={SIGNALS}
        endtime={20}
        timescale="1 ns"
        title="Test Analyzer"
        simulator="ghdl"
        onClose={() => {}}
      />,
      container
    )
    const text = container.textContent
    expect(text).toContain('Test Analyzer')
    expect(text).toContain('tb.clk')
    expect(text).toContain('tb.uut.instruction_decoder.alu_ctrl.op_code')
    expect(text).toContain('[7:0]') // bus width tag
    expect(text).toContain('PNG')
    expect(text).toContain('VCD')
    expect(text).toContain('PDF Report')
    // both canvases (axis + waveform body) present
    expect(container.querySelectorAll('canvas').length).toBe(2)
    // splitter + sliders present
    expect(container.querySelectorAll('[aria-label]').length)
      .toBeGreaterThan(0)
  })

  it('mounts with an empty signal list without crashing', () => {
    ReactDOM.render(
      <LogicAnalyzer signals={[]} endtime={1} timescale="1 ns" />,
      container
    )
    expect(container.textContent).toContain('0 signals')
  })
})
