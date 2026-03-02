# PLANNING State

You are creating the implementation plan with the team. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Read the reference materials the user has provided (requirements, existing code pointers, architecture docs)
- [ ] Brief developer and reviewer on the requirements — send them a message with what needs to be done
- [ ] Ask developer to review feasibility and identify edge cases — wait for their response
- [ ] Ask reviewer to identify principles that apply (data integrity, test coverage, etc.) — wait for their response
- [ ] Incorporate team feedback into the plan
- [ ] Structure the plan as numbered iteration tasks — one task per iteration, each independently deliverable
- [ ] Present the plan to the user — summarise the approach, key risks, and acceptance criteria
- [ ] Wait for explicit user approval — do NOT proceed until the user says yes
- [ ] Record any changes to requirements as amendments on the GitHub issue (do not silently deviate)
- [ ] Record plan approval: `/autonomous-claude-agent-team:workflow record-plan-approval`
- [ ] Append iteration checklist to GitHub issue: `/autonomous-claude-agent-team:workflow append-issue-checklist <github_issue> "- [ ] Iteration 1: <task 1>\n- [ ] Iteration 2: <task 2>"`
- [ ] Create a new feature branch and record it: `git checkout -b <branch-name>` then `/autonomous-claude-agent-team:workflow record-branch "<branch-name>"` (working tree must be clean)
- [ ] Transition to RESPAWN: `/autonomous-claude-agent-team:workflow transition RESPAWN`

## Constraints

- ⛔ User approval does NOT mean "tell developer to start implementing." The developer's role in PLANNING ends when they confirm feasibility. After approval, record it and transition to RESPAWN. The developer receives the implementation spec through the RESPAWN spawn prompt — not from you now.
- If something is unclear, escalate to BLOCKED: `/autonomous-claude-agent-team:workflow transition BLOCKED`
