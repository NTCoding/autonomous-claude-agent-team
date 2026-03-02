# FEEDBACK State

You are processing PR review feedback from human reviewers. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Read all PR review comments with the team
- [ ] Triage each comment with the team: accept (implement the change), reject (add PR reply with strong technical reason), or escalate (unclear/business decision — ask the user)
- [ ] If there are accepted changes to implement — transition to RESPAWN: `/autonomous-claude-agent-team:workflow transition RESPAWN`
- [ ] If all feedback is resolved (accepted + fixed, or rejected with explanations) — transition to COMPLETE: `/autonomous-claude-agent-team:workflow transition COMPLETE`

## Constraints

- Default to accepting feedback — reviewers know their codebase
- Reject only with a concrete technical argument
- Never accept feedback silently without a reply on the PR comment
