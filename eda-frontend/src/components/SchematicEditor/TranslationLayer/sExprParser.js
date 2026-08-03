/**
 * sExprParser.js — minimal S-expression reader for KiCad v6+ files.
 *
 * A parsed node is a plain array whose first element is the keyword string:
 *   (wire (pts (xy 1 2) (xy 3 4)))  →  ['wire', ['pts', ['xy', 1, 2], ['xy', 3, 4]]]
 * Numbers become JS numbers; quoted strings and bare identifiers both become
 * JS strings (KiCad never overloads the two in a way the importer cares about).
 */

/** Parse a full .kicad_sch / .kicad_sym text into the root node array. */
export function parseSExpr (text) {
  let i = 0
  const n = text.length

  function skipWs () {
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++
      else break
    }
  }

  function readString () {
    // Opening quote consumed by caller
    let out = ''
    while (i < n) {
      const c = text[i++]
      if (c === '\\' && i < n) {
        const esc = text[i++]
        if (esc === 'n') out += '\n'
        else if (esc === 't') out += '\t'
        else out += esc
      } else if (c === '"') {
        return out
      } else {
        out += c
      }
    }
    throw new Error('Unterminated string in S-expression')
  }

  function readAtom () {
    const start = i
    while (i < n) {
      const c = text[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '(' || c === ')') break
      i++
    }
    const raw = text.slice(start, i)
    const num = Number(raw)
    return raw !== '' && !isNaN(num) ? num : raw
  }

  function readList () {
    // '(' consumed by caller
    const node = []
    for (;;) {
      skipWs()
      if (i >= n) throw new Error('Unbalanced parenthesis in S-expression')
      const c = text[i]
      if (c === ')') {
        i++
        return node
      }
      if (c === '(') {
        i++
        node.push(readList())
      } else if (c === '"') {
        i++
        node.push(readString())
      } else {
        node.push(readAtom())
      }
    }
  }

  skipWs()
  if (text[i] !== '(') throw new Error('Not an S-expression file')
  i++
  const root = readList()
  return root
}

// ---------------------------------------------------------------------------
// Node helpers — nodes are arrays, atoms are strings/numbers
// ---------------------------------------------------------------------------

export function isNode (x) {
  return Array.isArray(x)
}

/** First child node with the given keyword, or null */
export function child (node, kw) {
  for (let i = 1; i < node.length; i++) {
    if (Array.isArray(node[i]) && node[i][0] === kw) return node[i]
  }
  return null
}

/** All child nodes with the given keyword */
export function children (node, kw) {
  const out = []
  for (let i = 1; i < node.length; i++) {
    if (Array.isArray(node[i]) && node[i][0] === kw) out.push(node[i])
  }
  return out
}

/** Positional atom arguments (non-node values after the keyword) */
export function atoms (node) {
  const out = []
  for (let i = 1; i < node.length; i++) {
    if (!Array.isArray(node[i])) out.push(node[i])
  }
  return out
}

/** Value of a single-atom child, e.g. (unit 1) → 1; null when absent */
export function childValue (node, kw) {
  const c = child(node, kw)
  if (!c) return null
  const a = atoms(c)
  return a.length ? a[0] : null
}
