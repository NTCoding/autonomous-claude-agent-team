# DEVELOPING State

You are overseeing the developer's implementation work. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] If entering from RESPAWN (no active agents): spawn fresh developer and reviewer now:
  - `Agent(subagent_type: "feature-team-developer", team_name: "feature-team-<ISSUE_NUMBER>", name: "developer-<iteration>", prompt: "<approved plan, current iteration number, GitHub issue number, notes from previous iterations>")`
  - `Agent(subagent_type: "feature-team-reviewer", team_name: "feature-team-<ISSUE_NUMBER>", name: "reviewer-<iteration>", prompt: "<same context as developer>")`
- [ ] Identify current iteration item from `current_iteration_task` in the injected state context
- [ ] Send developer the task assignment — send `current_iteration_task` verbatim, do not paraphrase or add scope (you may add context like acceptance criteria, relevant files, reviewer concerns, but the task boundary is fixed)
- [ ] Wait for developer to message you they are done — be patient, do NOT check in or nudge (`developer_done` resets on every RESPAWN — do NOT assume it carries over)
- [ ] Transition to REVIEWING: `/autonomous-claude-agent-team:workflow transition REVIEWING`
- [ ] Only after transition succeeds — notify reviewer their work can begin

## Constraints

- Never assign more than the single task recorded in `current_iteration_task` — additional work must go in a separate iteration
- Do NOT run lint yourself — the developer runs strict lint before signalling done
- If developer reports a blocker, transition to BLOCKED: `/autonomous-claude-agent-team:workflow transition BLOCKED`
