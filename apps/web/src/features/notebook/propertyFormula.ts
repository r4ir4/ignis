/** Small deterministic expression interpreter. Never executes JavaScript or accesses globals. */
export function evaluateFormula(expression: string, property: (name: string) => unknown): string | number | boolean | null {
  if (expression.length > 1000) throw new Error('Keep formulas under 1,000 characters.')
  const tokens = expression.match(/\s+|"(?:[^"\\]|\\.)*"|\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|==|!=|>=|<=|&&|\|\||[+*/%(),!<>-]/g) || []
  if (tokens.join('') !== expression) throw new Error('Unsupported formula syntax.')
  const input = tokens.filter(t => t.trim()); let i = 0, steps = 0
  const priorities: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 }
  const numeric = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error('Expected a number.'); return n }
  function parse(min = 0, depth = 0): unknown {
    if (++steps > 500 || depth > 30) throw new Error('Formula is too complex.')
    const token = input[i++]; let result: unknown
    if (!token) throw new Error('Incomplete formula.')
    if (token === '(') { result = parse(0, depth + 1); if (input[i++] !== ')') throw new Error('Missing closing parenthesis.') }
    else if (['-', '+', '!'].includes(token)) { const value = parse(7, depth + 1); result = token === '!' ? !value : token === '-' ? -numeric(value) : numeric(value) }
    else if (token.startsWith('"')) result = JSON.parse(token)
    else if (/^\d/.test(token)) result = Number(token)
    else if (['true', 'false', 'null'].includes(token)) result = token === 'null' ? null : token === 'true'
    else {
      if (input[i++] !== '(') throw new Error('Use prop("Property name") to reference a property.')
      const args: unknown[] = []
      if (input[i] !== ')') { do { args.push(parse(0, depth + 1)); if (input[i] !== ',') break; i++ } while (true) }
      if (input[i++] !== ')') throw new Error('Missing closing parenthesis.')
      if (token === 'prop' && args.length === 1 && typeof args[0] === 'string') result = property(args[0])
      else if (token === 'if' && args.length === 3) result = args[0] ? args[1] : args[2]
      else if (token === 'empty' && args.length === 1) result = args[0] == null || args[0] === '' || Array.isArray(args[0]) && !args[0].length
      else if (token === 'concat') result = args.map(a => String(a ?? '')).join('')
      else if (token === 'length' && args.length === 1) result = Array.isArray(args[0]) ? args[0].length : String(args[0] ?? '').length
      else if (['round', 'floor', 'ceil', 'abs'].includes(token) && args.length === 1) result = Math[token as 'round'](numeric(args[0]))
      else if (['sum', 'min', 'max'].includes(token) && args.length) { const values = args.flat().map(numeric); result = token === 'sum' ? values.reduce((a, b) => a + b, 0) : token === 'min' ? Math.min(...values) : Math.max(...values) }
      else throw new Error(`Unknown function or arguments: ${token}.`)
    }
    while (i < input.length && (priorities[input[i]] || 0) > min) {
      const op = input[i++], right = parse(priorities[op], depth + 1), left = result
      switch (op) {
        case '+': result = typeof left === 'string' || typeof right === 'string' ? String(left ?? '') + String(right ?? '') : numeric(left) + numeric(right); break
        case '-': result = numeric(left) - numeric(right); break
        case '*': result = numeric(left) * numeric(right); break
        case '/': case '%': if (numeric(right) === 0) throw new Error('Cannot divide by zero.'); result = op === '/' ? numeric(left) / numeric(right) : numeric(left) % numeric(right); break
        case '==': result = left === right; break
        case '!=': result = left !== right; break
        case '>': result = numeric(left) > numeric(right); break
        case '<': result = numeric(left) < numeric(right); break
        case '>=': result = numeric(left) >= numeric(right); break
        case '<=': result = numeric(left) <= numeric(right); break
        case '&&': result = !!left && !!right; break
        case '||': result = !!left || !!right; break
      }
    }
    return result
  }
  const result = parse()
  if (i !== input.length) throw new Error('Unexpected formula input.')
  if (result == null || typeof result === 'boolean' || typeof result === 'string' && result.length <= 2000 || typeof result === 'number' && Number.isFinite(result) && Math.abs(result) <= 1e12) return result as string | number | boolean | null
  throw new Error('Formula result must be text, a number, or a checkbox value.')
}
