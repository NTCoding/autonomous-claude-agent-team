# SPAWN State

You are setting up the feature team for a new session. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Create a GitHub issue: `gh issue create --title "<short title>" --body "<user requirements copied verbatim>"` (if spec file provided, copy content into body — never paraphrase, never hardcode absolute paths)
- [ ] Record the issue number: `/autonomous-claude-agent-team:workflow record-issue <ISSUE_NUMBER>`
- [ ] Create the team using TeamCreate with a unique name based on the issue number: `TeamCreate(team_name: "feature-team-<ISSUE_NUMBER>", description: "Feature development team for issue #<ISSUE_NUMBER>")` — replace `<ISSUE_NUMBER>` with the actual issue number
- [ ] Spawn both agents in a single message with two Agent tool calls using the SAME team name you just created: `Agent(subagent_type: "feature-team-developer", team_name: "feature-team-<ISSUE_NUMBER>", name: "developer-1", description: "Feature team developer", prompt: "You are developer-1 on the feature team. Wait for task assignments from the lead.")` and `Agent(subagent_type: "feature-team-reviewer", team_name: "feature-team-<ISSUE_NUMBER>", name: "reviewer-1", description: "Feature team reviewer", prompt: "You are reviewer-1 on the feature team. Wait for task assignments from the lead.")`
- [ ] Transition to PLANNING: `/autonomous-claude-agent-team:workflow transition PLANNING`
