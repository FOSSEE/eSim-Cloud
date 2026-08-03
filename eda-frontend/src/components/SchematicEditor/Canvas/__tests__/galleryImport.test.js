/**
 * galleryImport.test.js — every real old-editor gallery schematic imports
 * through the netlist-driven redraw pipeline: components placed, each net
 * rewired into a single electrical node, no wire cutting through a foreign
 * component body.
 *
 * Fixtures are the actual backend gallery dumps (workflowAPI), the same
 * XML users load from the Gallery page.
 *
 * Run: CI=true NODE_OPTIONS=--openssl-legacy-provider npx react-scripts test \
 *        --watchAll=false --testPathPattern=galleryImport
 */
import fs from 'fs'
import path from 'path'
import { fromLegacyXml } from '../LegacyMxGraphSerializer'
import { wirePointGroups } from '../../TranslationLayer/autoWire'
import { schematicStore } from '../schematicStore'
import { buildNetwork } from '../dsuNetlist'
import { componentBBox, pathClear } from '../geometry'

const FIXTURE = path.resolve(__dirname, '../../../../../..',
  'esim-cloud-backend/workflowAPI/fixtures/gallery_setup.json')

describe('gallery fixtures import', () => {
  const rows = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
    .filter((r) => r.fields && String(r.fields.data_dump).startsWith('<mxGraphModel'))

  for (const row of rows) {
    it(`imports "${row.fields.name}"`, () => {
      const doc = fromLegacyXml(row.fields.data_dump)
      expect(doc.components.length).toBeGreaterThan(0)
      expect(doc.wires).toHaveLength(0)
      expect(doc.legacyNetGroups.length).toBeGreaterThan(0)

      schematicStore.loadDocument(doc, { undoable: false })
      wirePointGroups(doc.legacyNetGroups)
      const state = schematicStore.getState()
      expect(state.wires.length).toBeGreaterThan(0)

      // every net group must be electrically one node after redraw
      const net = buildNetwork(state)
      const key = (p) => Math.round(p.x) + ',' + Math.round(p.y)
      for (const group of doc.legacyNetGroups) {
        const roots = new Set(group.map((p) => net.dsu.find(key(p))))
        expect(roots.size).toBe(1)
      }

      // no wire may cut through a foreign component body (bodies owning a
      // wire endpoint are exempt: old symbols keep pins inside their artwork)
      const boxes = state.components.map(componentBBox)
      const owns = (r, p) => p.x >= r.x - 2 && p.x <= r.x + r.width + 2 &&
        p.y >= r.y - 2 && p.y <= r.y + r.height + 2
      let blocked = 0
      for (const wire of state.wires) {
        const a = wire.points[0]
        const b = wire.points[wire.points.length - 1]
        const foreignBoxes = boxes.filter((r) => !owns(r, a) && !owns(r, b))
        if (!pathClear(wire.points, foreignBoxes)) blocked++
      }
      expect(blocked).toBe(0)
    })
  }
})
