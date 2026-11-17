# response-brief

A Claude Code mod that adds a short brief under every reply Claude gives. It has three boxes, all closed until you click them:

- **⚠️ Heads-up · I / II / III**: what to watch for. The icon shows the severity: ℹ️ low, ⚠️ medium, 🚨 high.
- **💡 TLDR**: the reply in very simple words.
- **🧭 Situation**: 🎯 the original goal, 📍 where things stand, ➡️ what happens next.

The brief is made by one extra background request that reuses the conversation Claude already sent, so most of it comes from the prompt cache. It costs a little extra per reply, billed like any other Claude Code usage.

It works in Claude Code (the desktop app's Code tab, or the terminal), not in the regular claude.ai chat.

## Install

This repository is private: you need access to it on GitHub, and your computer needs GitHub set up for git first (run `gh auth login`, then `gh auth setup-git`, once).

**Desktop app (Code tab):** click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `tranhoangnguyen03/response-brief`, then **Add plugin**.

**Terminal session**, at the prompt:

```
/plugin install response-brief --marketplace tranhoangnguyen03/response-brief
```

**From a shell:**

```
claude plugin install response-brief --marketplace tranhoangnguyen03/response-brief
```

Answer `y` to add the marketplace, then pick the user scope. The brief appears under your next reply.
