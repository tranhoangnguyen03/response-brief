export type BriefStatus = 'pending' | 'ready' | 'failed'

export type Brief = {
  /** The turn this brief belongs to. */
  key: string
  /** The last 500 characters of the reply, whitespace collapsed: how a drawn block finds its brief. */
  tail: string
  status: BriefStatus
  /** The full reply, kept only while pending so a reload can restart the fork. */
  answer?: string
  severity?: 1 | 2 | 3
  headsUp?: string
  tldr?: string
  goal?: string
  now?: string
  next?: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'response-brief': {
      briefs: Shaped<Brief[]>
      isOpen: StateFamily<boolean>
    }
  }
}
