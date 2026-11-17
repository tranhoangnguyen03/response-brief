import { expect, mock, test } from 'claude-code/testing'

const ANSWER = 'All three panels are wired.\n\nNext you reload and look.'
const USAGE = {
  input_tokens: 10,
  output_tokens: 40,
  cache_read_input_tokens: 9000,
  cache_creation_input_tokens: 0,
}
const REPLY = JSON.stringify({
  severity: 3,
  headsUp: 'Prod is down.',
  tldr: 'Thing broke.',
  goal: 'Ship panels.',
  now: 'Panels built.',
  next: 'User reloads.',
})

const message = (surface: 'terminal' | 'desktop', text: string) =>
  ({
    plugin: 'response-brief',
    surface,
    component: 'AssistantMessage',
    requestId: 'msg-1',
    props: { text, isFirstOfReply: true },
  }) as const

test('a reply gets three closed toggles that open on press', async ($, on) => {
  const clock = mock.clock(on)
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: '```json\n' + REPLY + '\n```', usage: USAGE } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })

  await $.turn.complete({
    answer: ANSWER,
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })
  await clock.settle()

  expect(forks).toHaveLength(1)
  expect(forks[0]).toContain('Next you reload and look.')

  for (const surface of ['terminal', 'desktop'] as const) {
    // The drawn block is the reply's last paragraph alone: it still finds the brief.
    const ui = await $.ui.mount(message(surface, 'Next you reload and look.'))
    expect((await ui.find({ type: 'Text', text: /engine row/ }))?.text).toBe('engine row')
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(6)
    expect((await ui.find({ key: 't1:heads' }))?.text).toBe('🚨  HEADS-UP · III')
    expect((await ui.find({ key: 't1:heads:arrow' }))?.text).toBe('▶')
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

    await ui.press({ key: 't1:heads' })
    const heads = await ui.find({ type: 'Markdown' })
    expect(heads?.text).toContain('Prod is down.')
    expect(heads?.text).not.toContain('Heads-up')
    expect((await ui.find({ key: 't1:heads:arrow' }))?.text).toBe('▼')
    await ui.press({ key: 't1:heads:arrow' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

    await ui.press({ key: 't1:tldr' })
    expect((await ui.find({ type: 'Markdown' }))?.text).toBe('> Thing broke.')
    await ui.press({ key: 't1:tldr' })
    expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
    await ui.unmount()
  }

  // A block from some other reply draws as the engine has it.
  const other = await $.ui.mount(message('desktop', 'Something unrelated.'))
  expect(await other.findAll({ type: 'Button' })).toHaveLength(0)
  await other.unmount()
})

test('subagent turns are not briefed', async ($, on) => {
  const clock = mock.clock(on)
  let forks = 0
  on('model.fork', () => {
    forks++
    return { value: { isAnswered: true, text: REPLY, usage: USAGE } }
  })
  on('turn.complete', () => ({ text: '' }))

  await $.turn.complete({
    answer: ANSWER,
    durationMs: 1000,
    isAborted: false,
    turnId: 't2',
    agentId: 'a1',
    reason: 'answer',
  })
  await clock.settle()
  expect(forks).toBe(0)
})

test('a brief left pending is restarted when the mod loads again', async ($, on) => {
  const clock = mock.clock(on)
  const forks: string[] = []
  on('model.fork', (_, e) => {
    forks.push(e.prompt)
    return { value: { isAnswered: true, text: REPLY, usage: USAGE } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('turn.complete', () => ({ text: '' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine row</Text>
  })

  // The turn ends and its fork is scheduled but has not run (a reload drops it).
  await $.turn.complete({ answer: ANSWER, durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
  const pending = await $.ui.mount(message('desktop', ANSWER))
  expect((await pending.find({ type: 'Text', text: /generating/ }))?.text).toContain('generating')
  await pending.unmount()

  // The load's session.start finds it pending and forks again with the stored reply.
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  expect(forks.length).toBeGreaterThanOrEqual(2)
  expect(forks.at(-1)).toContain('Next you reload and look.')

  const ui = await $.ui.mount(message('desktop', ANSWER))
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(6)
  await ui.unmount()
})
