import { generateModelCard, generateSubcircuit } from './spiceEmitter'

test('diode .model card', () => {
  expect(
    generateModelCard({ name: 'MyDiode', deviceType: 'D', params: { IS: '1e-14', N: '1.5' } })
  ).toBe('.model MyDiode D (IS=1e-14 N=1.5)')
})

test('model with no params omits the parens', () => {
  expect(generateModelCard({ name: 'D1', deviceType: 'd' })).toBe('.model D1 D')
})

test('subcircuit block wraps body in .subckt/.ends', () => {
  expect(
    generateSubcircuit({
      name: 'RCFilter',
      ports: ['in', 'out', 'gnd'],
      body: 'R1 in out 1k\nC1 out gnd 10u'
    })
  ).toBe('.subckt RCFilter in out gnd\nR1 in out 1k\nC1 out gnd 10u\n.ends RCFilter')
})