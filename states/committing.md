# COMMITTING State

You are overseeing the commit and push of approved changes. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Instruct developer to commit and push the approved changes (do NOT spawn a new developer — the developer from DEVELOPING is still alive and idle) with a meaningful commit message in format `<short description> (#<github_issue>)\n\n<what was done and why>`
- [ ] Tick the completed iteration on the GitHub issue: `/autonomous-claude-agent-team:workflow tick-iteration <github_issue>`
- [ ] Check the GitHub issue `## Iterations` checklist to decide next step
- [ ] If unchecked iterations remain — transition to RESPAWN: `/autonomous-claude-agent-team:workflow transition RESPAWN`
- [ ] If all iterations checked — transition to CR_REVIEW: `/autonomous-claude-agent-team:workflow transition CR_REVIEW`
