/**
 * expressionEvaluator.js
 *
 * Parses and evaluates user-entered math expressions over simulation
 * signal arrays, e.g. "{V(1)} - {V(2)}" or "{V(1)} * {I(R1)#branch}".
 *
 * Signal references are written as {ExactLabelText} - the braces make
 * them opaque tokens to the parser, so ngspice's own punctuation
 * (parentheses, dots, '#') inside a label never conflicts with the
 * expression grammar's own use of parentheses for grouping.
 *
 * Grammar (standard precedence, unary minus, right-assoc power):
 *   expression := term (('+' | '-') term)*
 *   term       := power (('*' | '/') power)*
 *   power      := unary ('^' power)?
 *   unary      := ('-' | '+')? primary
 *   primary    := NUMBER | SIGNAL | '(' expression ')'
 */

class ExpressionError extends Error {}

// ---------- Tokenizer ----------

function tokenize (input) {
  const tokens = []
  let i = 0
  const n = input.length

  while (i < n) {
    const c = input[i]

    if (c === ' ' || c === '\t' || c === '\n') {
      i++
      continue
    }

    if (c === '{') {
      const close = input.indexOf('}', i + 1)
      if (close === -1) {
        throw new ExpressionError(`Unclosed "{" at position ${i}`)
      }
      const raw = input.slice(i + 1, close).trim()
      if (raw.length === 0) {
        throw new ExpressionError(`Empty signal reference "{}" at position ${i}`)
      }
      tokens.push({ type: 'SIGNAL', value: raw })
      i = close + 1
      continue
    }

    if (/[0-9.]/.test(c)) {
      let j = i
      let sawDot = false
      let sawExp = false
      while (j < n) {
        const cj = input[j]
        if (/[0-9]/.test(cj)) {
          j++
        } else if (cj === '.' && !sawDot && !sawExp) {
          sawDot = true
          j++
        } else if ((cj === 'e' || cj === 'E') && !sawExp && j > i) {
          sawExp = true
          j++
          if (input[j] === '+' || input[j] === '-') j++
        } else {
          break
        }
      }
      const raw = input.slice(i, j)
      const value = Number(raw)
      if (!Number.isFinite(value)) {
        throw new ExpressionError(`Invalid number "${raw}" at position ${i}`)
      }
      tokens.push({ type: 'NUMBER', value })
      i = j
      continue
    }

    if ('+-*/^()'.includes(c)) {
      tokens.push({ type: c })
      i++
      continue
    }

    throw new ExpressionError(`Unexpected character "${c}" at position ${i}`)
  }

  tokens.push({ type: 'EOF' })
  return tokens
}

// ---------- Parser (recursive descent -> AST) ----------

function parse (tokens) {
  let pos = 0

  const peek = () => tokens[pos]
  const advance = () => tokens[pos++]
  const expect = (type) => {
    if (peek().type !== type) {
      throw new ExpressionError(`Expected "${type}" but found "${peek().type}"`)
    }
    return advance()
  }

  function parseExpression () {
    let node = parseTerm()
    while (peek().type === '+' || peek().type === '-') {
      const op = advance().type
      const right = parseTerm()
      node = { type: 'BinOp', op, left: node, right }
    }
    return node
  }

  function parseTerm () {
    let node = parsePower()
    while (peek().type === '*' || peek().type === '/') {
      const op = advance().type
      const right = parsePower()
      node = { type: 'BinOp', op, left: node, right }
    }
    return node
  }

  function parsePower () {
    const node = parseUnary()
    if (peek().type === '^') {
      advance()
      const right = parsePower() // right-associative
      return { type: 'BinOp', op: '^', left: node, right }
    }
    return node
  }

  function parseUnary () {
    if (peek().type === '-' || peek().type === '+') {
      const op = advance().type
      const operand = parseUnary()
      return { type: 'UnaryOp', op, operand }
    }
    return parsePrimary()
  }

  function parsePrimary () {
    const tok = peek()
    if (tok.type === 'NUMBER') {
      advance()
      return { type: 'Number', value: tok.value }
    }
    if (tok.type === 'SIGNAL') {
      advance()
      return { type: 'Signal', name: tok.value }
    }
    if (tok.type === '(') {
      advance()
      const inner = parseExpression()
      expect(')')
      return inner
    }
    throw new ExpressionError(`Unexpected token "${tok.type}" in expression`)
  }

  const ast = parseExpression()
  expect('EOF')
  return ast
}

// ---------- Signal name normalization / lookup ----------

/**
 * Same normalization style already used in SimulationScreen.js's probe
 * filtering (strip parens/dots, lowercase), so a signal reference matches
 * regardless of minor punctuation differences between how it's typed and
 * how ngspice/the probe label actually renders it.
 */
function normalizeSignalName (name) {
  return String(name).toLowerCase().replace(/[().]/g, '').trim()
}

/**
 * Builds a lookup from signal name -> y_points array, keyed by both the
 * raw label and its normalized form, so exact matches (from the
 * dropdown-inserted {Label} tokens) always hit fast, with a normalized
 * fallback for hand-edited expressions.
 */
export function buildSignalLookup (labels, yPoints) {
  const exact = new Map()
  const normalized = new Map()
  for (let i = 1; i < labels.length; i++) {
    const label = labels[i]
    const arr = yPoints[i - 1]
    exact.set(label, arr)
    normalized.set(normalizeSignalName(label), arr)
  }
  return { exact, normalized }
}

function resolveSignal (lookup, name) {
  if (lookup.exact.has(name)) return lookup.exact.get(name)
  const norm = normalizeSignalName(name)
  if (lookup.normalized.has(norm)) return lookup.normalized.get(norm)
  return null
}

// ---------- Compile: parse + resolve all signal refs against real data ----------

/**
 * Parses the expression and resolves every {Signal} reference against the
 * provided lookup. Throws ExpressionError with a clear message on any
 * syntax problem or unknown signal name - callers should catch this and
 * show it inline, not add a broken trace.
 *
 * Also validates every resolved signal array has the same length as
 * expectedLength (the shared x_points length for this result) - this is
 * always true within a single simulation run today, but the check is kept
 * as a defensive guard against any future mixed-source use (e.g. compare
 * mode), rather than silently producing a mismatched/garbage trace.
 *
 * Returns a function (index) => number|null that evaluates the compiled
 * expression at a given sample index. Division by zero, non-finite
 * results (e.g. 0^-1), or an out-of-range index all resolve to `null` for
 * that single point (Chart.js renders `null` as a gap) rather than
 * throwing or corrupting the rest of the trace.
 */
export function compileExpression (expressionText, lookup, expectedLength) {
  if (!expressionText || !expressionText.trim()) {
    throw new ExpressionError('Expression is empty')
  }

  const tokens = tokenize(expressionText)
  const ast = parse(tokens)

  const resolvedCache = new Map()
  function resolveAllSignals (node) {
    if (node.type === 'Signal') {
      const arr = resolveSignal(lookup, node.name)
      if (!arr) {
        throw new ExpressionError(`Unknown signal "${node.name}"`)
      }
      if (arr.length !== expectedLength) {
        throw new ExpressionError(
          `Signal "${node.name}" has ${arr.length} points, expected ${expectedLength}`
        )
      }
      resolvedCache.set(node.name, arr)
    } else if (node.type === 'BinOp') {
      resolveAllSignals(node.left)
      resolveAllSignals(node.right)
    } else if (node.type === 'UnaryOp') {
      resolveAllSignals(node.operand)
    }
  }
  resolveAllSignals(ast)

  function evalNode (node, idx) {
    switch (node.type) {
      case 'Number':
        return node.value
      case 'Signal':
        return resolvedCache.get(node.name)[idx]
      case 'UnaryOp': {
        const v = evalNode(node.operand, idx)
        if (v === null) return null
        return node.op === '-' ? -v : v
      }
      case 'BinOp': {
        const l = evalNode(node.left, idx)
        const r = evalNode(node.right, idx)
        if (l === null || r === null) return null
        let result
        switch (node.op) {
          case '+': result = l + r; break
          case '-': result = l - r; break
          case '*': result = l * r; break
          case '/': result = r === 0 ? NaN : l / r; break
          case '^': result = Math.pow(l, r); break
          default: throw new ExpressionError(`Unknown operator "${node.op}"`)
        }
        return Number.isFinite(result) ? result : null
      }
      default:
        throw new ExpressionError(`Unknown AST node "${node.type}"`)
    }
  }

  return (idx) => evalNode(ast, idx)
}

/**
 * Convenience: compiles and immediately evaluates over every sample index
 * (0..expectedLength-1), returning a plain array ready to push into
 * y_points alongside the real probed signals.
 */
export function evaluateExpressionSeries (expressionText, lookup, expectedLength) {
  const evalAt = compileExpression(expressionText, lookup, expectedLength)
  const out = new Array(expectedLength)
  for (let idx = 0; idx < expectedLength; idx++) {
    out[idx] = evalAt(idx)
  }
  return out
}

export { ExpressionError, normalizeSignalName }
