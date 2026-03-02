# PR_CREATION State

You are overseeing the creation of the pull request. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Instruct developer to create the draft PR and write the PR number to the state file
- [ ] Wait for CI results — if CI fails, tell the developer to fix and push, stay in this state until CI passes (if cause is unclear, transition to BLOCKED: `/autonomous-claude-agent-team:workflow transition BLOCKED`)
- [ ] When CI is green, notify the user with the PR URL and let them know it is ready for review
- [ ] Transition to FEEDBACK: `/autonomous-claude-agent-team:workflow transition FEEDBACK`
