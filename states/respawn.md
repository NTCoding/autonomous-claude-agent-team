# RESPAWN State

You are spawning a fresh developer and reviewer with full context for the next iteration. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Verify prerequisites are set: `githubIssue` (from SPAWN via `record-issue`), `featureBranch` (from PLANNING via `record-branch`), `userApprovedPlan` (from PLANNING via `record-plan-approval`) — if any are missing, transition to BLOCKED and tell the user
- [ ] Journal the developer's session: `/autonomous-claude-agent-team:workflow write-journal <developer-name> "Brief summary of work completed"`
- [ ] Send shutdown_request to existing developer (if any)
- [ ] Journal the reviewer's session: `/autonomous-claude-agent-team:workflow write-journal <reviewer-name> "Brief summary of work completed"`
- [ ] Send shutdown_request to existing reviewer (if any)
- [ ] Wait for both shutdown confirmations before proceeding
- [ ] Deregister existing developer from workflow state: `/autonomous-claude-agent-team:workflow shut-down <developer-name>`
- [ ] Deregister existing reviewer from workflow state: `/autonomous-claude-agent-team:workflow shut-down <reviewer-name>`
- [ ] Read the GitHub issue (`gh issue view <github_issue>`) and find the first unchecked item in the `## Iterations` checklist
- [ ] Record the current iteration task: `/autonomous-claude-agent-team:workflow assign-iteration-task "<first unchecked item text>"`
- [ ] Transition to DEVELOPING: `/autonomous-claude-agent-team:workflow transition DEVELOPING`
