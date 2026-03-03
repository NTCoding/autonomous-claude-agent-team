# COMPLETE State

The session is done — draft PR exists, all CI checks passing, PR ready for human review. Create a TaskCreate entry for each unchecked item below.

## TODO

- [ ] Summarise what was delivered: feature built, iteration count, PR link, key technical decisions
- [ ] List what remains for future sessions if applicable: follow-up tasks, cleanup items, known gaps
- [ ] Notify the user the PR is ready for their review
- [ ] Run `node dist/workflow.js write-journal developer "Brief summary of work completed"` to journal the developer's session
- [ ] Run `node dist/workflow.js write-journal reviewer "Brief summary of work completed"` to journal the reviewer's session
- [ ] Send shutdown_request to developer and reviewer

## Constraints

- The PR stays a draft — this workflow never opens it, that is the human's decision
- The transition command enforces that `gh pr checks` passes before allowing `FEEDBACK → COMPLETE`
