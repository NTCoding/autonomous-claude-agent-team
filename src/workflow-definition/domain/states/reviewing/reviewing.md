# REVIEWING State

You are overseeing the reviewer's code review. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Tell reviewer to begin review — do NOT provide a file list, the reviewer uses `git diff` to see uncommitted changes
- [ ] Wait for reviewer verdict
- [ ] If APPROVED — transition to COMMITTING: `/autonomous-claude-agent-team:workflow transition COMMITTING`
- [ ] If REJECTED — send the reviewer's feedback to the developer, then transition back to DEVELOPING: `/autonomous-claude-agent-team:workflow transition DEVELOPING`
