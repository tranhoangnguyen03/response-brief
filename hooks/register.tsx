import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Brief } from '../types'

// Bump the tag when Brief's fields change: values an older version stored are then read as empty.
const briefs = atom({ plugin: 'response-brief', key: 'briefs' } as const, [], {
  shape: 'briefs-1',
})
const isOpen = atom({ plugin: 'response-brief', key: 'isOpen' } as const, false)

type Section = 'heads' | 'tldr' | 'situation'
const TAIL = 500
const ROMAN = { 1: 'I', 2: 'II', 3: 'III' } as const
const SEV_ICON = { 1: 'ℹ️', 2: '⚠️', 3: '🚨' } as const

const norm = (text: string) => text.replace(/\s+/g, ' ').trim()
const quote = (text = '') => text.split('\n').map(line => `> ${line}`).join('\n')

const ask = (answer: string) => `[Side request from a UI mod, not from the user. You have no tools. Answer straight away without thinking it over, with no preamble.]

The reply you just gave, which ended this turn, was:
<<<REPLY
${answer}
REPLY>>>

Using the whole conversation above and that reply, return ONLY one JSON object, no code fence:
{"severity": 1|2|3, "headsUp": "...", "tldr": "...", "goal": "...", "now": "...", "next": "..."}

- severity: 1 = low (nothing at risk, informational), 2 = medium (needs the user's attention or a decision), 3 = high (something is broken, risky, irreversible or blocking).
- headsUp: one or two sentences on what the user should watch for, matching the severity.
- tldr: the reply in very simple words a 10-year-old understands, at most 3 short sentences.
- goal: the original goal of this conversation, one sentence.
- now: where we are right now, one or two sentences.
- next: what happens next, and who acts (user or assistant), one or two sentences.`

const parse = (text: string): Partial<Brief> | undefined => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    const o = JSON.parse(text.slice(start, end + 1))
    const severity = [1, 2, 3].includes(o.severity) ? (o.severity as 1 | 2 | 3) : 2
    return {
      severity,
      headsUp: String(o.headsUp ?? ''),
      tldr: String(o.tldr ?? ''),
      goal: String(o.goal ?? ''),
      now: String(o.now ?? ''),
      next: String(o.next ?? ''),
    }
  } catch {
    return undefined
  }
}

const patch = ($: EngineInterface, key: string, fields: Partial<Brief>) =>
  update($, briefs, list => list.map(b => (b.key === key ? { ...b, ...fields } : b)))

const generate = async ($: EngineInterface, key: string, answer: string) => {
  const r = await $.model.fork({ prompt: ask(answer) })
  if (!r.isAnswered) {
    await patch($, key, { status: 'failed', error: r.reason, answer: undefined })
    return
  }
  $.ui.log(
    `response-brief: cache read ${r.usage.cache_read_input_tokens ?? 0}, written ${r.usage.cache_creation_input_tokens ?? 0}, output ${r.usage.output_tokens}`,
    { to: 'debug' },
  )
  const fields = parse(r.text)
  await patch($, key, {
    ...(fields ? { status: 'ready', ...fields } : { status: 'failed', error: 'unreadable reply' }),
    answer: undefined,
  })
}

export const register: Register = on => {
  // A reload (an edit of the mod, /reload-plugins) drops forks in flight while the
  // briefs stay pending in $.state; session.start runs on every load, so restart them here.
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    for (const b of await read($, briefs)) {
      if (b.status !== 'pending') continue
      const answer = b.answer
      if (answer === undefined) await patch($, b.key, { status: 'failed', error: 'interrupted by a reload' })
      else $.clock.after(0, () => void generate($, b.key, answer))
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined && e.reason === 'answer' && norm(e.answer) !== '') {
      const key = e.turnId
      const brief: Brief = { key, tail: norm(e.answer).slice(-TAIL), status: 'pending', answer: e.answer }
      await update($, briefs, list => [...list.filter(b => b.key !== key), brief].slice(-100))
      // Run the fork outside this dispatch so the turn ends without waiting for it.
      $.clock.after(0, () => void generate($, key, e.answer))
    }
    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const row = await next(e)
    const text = norm(e.props.text)
    if (text === '') return row
    const n = Math.min(TAIL, text.length)
    const list = await read($, briefs)
    const brief = [...list].reverse().find(b => b.tail.slice(-n) === text.slice(-n))
    if (brief === undefined) return row

    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    if (brief.status === 'pending') {
      return (
        <Box flexDirection="column">
          {row}
          <Text dimColor>Brief: generating…</Text>
        </Box>
      )
    }
    if (brief.status === 'failed') {
      return (
        <Box flexDirection="column">
          {row}
          <Text dimColor>Brief unavailable ({brief.error ?? 'unknown'})</Text>
        </Box>
      )
    }

    const sev = brief.severity ?? 2
    const id = (s: Section) => ({ requestId: `${brief.key}:${s}` })
    const open = {
      heads: await read($, memberOf(isOpen, id('heads'))),
      tldr: await read($, memberOf(isOpen, id('tldr'))),
      situation: await read($, memberOf(isOpen, id('situation'))),
    }
    const toggle = (s: Section) => () => void update($, memberOf(isOpen, id(s)), v => !v)
    // Faint tint of each section's color behind its header bar; the terminal draws no alpha, so it gets none.
    const tinted = e.surface !== 'terminal'

    // One bordered box per feature, always in this order. The header is a tinted
    // bar: emoji and title on the left, the arrow on the right, both toggling.
    const section = (s: Section, color: string, tint: string, title: string, body: string) => (
      <Box flexDirection="column" borderStyle="round" borderColor={color}>
        <Box
          flexDirection="row"
          justifyContent="space-between"
          paddingX={1}
          backgroundColor={tinted ? tint : undefined}
        >
          <Button key={`${brief.key}:${s}`} plain onPress={toggle(s)}>
            <Text bold>{title}</Text>
          </Button>
          <Button key={`${brief.key}:${s}:arrow`} plain onPress={toggle(s)}>
            {open[s] ? '▼' : '▶'}
          </Button>
        </Box>
        {open[s] && (
          <Box paddingX={1}>
            <Markdown text={body} />
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {row}
        <Box flexDirection="column" marginTop={1}>
          {section('heads', 'warning', '#f5a6232e', `${SEV_ICON[sev]}  HEADS-UP · ${ROMAN[sev]}`, quote(brief.headsUp))}
          {section('tldr', 'suggestion', '#5b9bff2e', '💡  TLDR', quote(brief.tldr))}
          {section(
            'situation',
            'planMode',
            '#2ea0432e',
            '🧭  SITUATION',
            `- 🎯 **Original goal:** ${brief.goal}\n- 📍 **Where we are:** ${brief.now}\n- ➡️ **What next:** ${brief.next}`,
          )}
        </Box>
      </Box>
    )
  })
}
