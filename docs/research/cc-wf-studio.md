## cc-wf-studio (CC Workflow Studio) Research Report

### What is it?

CC Workflow Studio is a VS Code extension that provides a visual drag-and-drop editor for designing AI agent workflows. It exports workflows as markdown files that AI coding agents (Claude Code, GitHub Copilot, OpenAI Codex CLI, Gemini CLI, Roo Code, Cursor, Antigravity) can execute natively. It is not a workflow engine or runtime -- it is a workflow design tool that generates static configuration files.

### Core Identity

- Repository: [breaking-brake/cc-wf-studio](https://github.com/breaking-brake/cc-wf-studio/)
- Author: breaking-brake (solo project -- 634 of ~818 commits from primary author)
- Stars: 4,126
- Language: TypeScript 5.x (Extension Host) + React 18.x (Webview UI)
- License: AGPL-3.0-or-later
- Version: 3.26.2 (as of March 1, 2026)
- Created: November 1, 2025
- Release cadence: ~2-3 releases per week, 60+ releases in ~4 months
- Distribution: VS Code Marketplace + Open VSX
- State management: Zustand (client-side UI state)
- Visual canvas: React Flow

### What Problem Does It Solve?

Traditionally, defining Claude Code workflows means manually writing markdown files in `.claude/agents/`, `.claude/commands/`, or `.claude/skills/`. cc-wf-studio provides a visual editor so you can design these workflows graphically and export them. It also supports "Edit with AI" where an AI agent edits the visual workflow through a built-in MCP server.

### Core Concepts

**Node types:**
- `start` / `end` -- Entry and exit points
- `prompt` -- Display instructions
- `subAgent` -- AI sub-agent executing a task (model selection: sonnet/opus/haiku)
- `askUserQuestion` -- Multiple-choice branching based on user input
- `ifElse` / `switch` -- Conditional branching
- `skill` -- Reference to a Claude Code Skill (SKILL.md)
- `mcp` -- Call an MCP tool with configured parameters
- `subAgentFlow` -- Reusable sub-workflow
- `codex` -- OpenAI Codex CLI execution node

**Data model**: Workflows stored as JSON in `.vscode/workflows/*.json`. Each has nodes, connections, optional sub-agent flows, optional slash command options with hooks configuration.

**Export targets**: `.claude/agents/*.md`, `.claude/commands/*.md`, `.claude/skills/`, plus equivalent paths for Copilot, Codex, Gemini, Roo Code, Cursor, Antigravity.

**Architecture**:
```
VSCode Extension Host (Node.js)
  +-- Commands (save, load, export, run, slack, MCP handlers)
  +-- Services (file I/O, CLI execution, MCP client/server, export, skill management)
  +-- Utils (validation, schema parsing, sensitive data detection)

Webview (React)
  +-- Components (WorkflowEditor, NodePalette, Toolbar, dialogs)
  +-- Zustand Stores
  +-- Services (vscode-bridge for postMessage)

External
  +-- File System (.vscode/workflows/, .claude/)
  +-- Claude Code CLI (terminal execution)
  +-- Slack API (workflow sharing)
  +-- MCP Servers (tool discovery and execution)
```

**Built-in MCP server** (127.0.0.1):
1. `get_current_workflow` -- Retrieve current workflow from canvas
2. `get_workflow_schema` -- Get valid workflow schema
3. `apply_workflow` -- Apply/update workflow on canvas (with optional review)

### What It Does NOT Do

1. **No runtime workflow engine**: Does not execute workflows itself. The "Run" button opens a terminal and runs `claude "/workflow-name"`.

2. **No event sourcing**: No event log, no event store, no state derived from folding events. JSON files overwritten in place.

3. **No state machine**: The visual graph is a DAG of nodes and edges. No transition guards, no preconditions, no state-driven permission enforcement.

4. **No hook interception**: The `WorkflowHooks` interface serializes into exported markdown frontmatter. cc-wf-studio does not intercept or enforce hooks itself.

5. **No permission enforcement**: No mechanism for blocking tool calls or restricting file access per state.

6. **No agent lifecycle management**: No concept of registering/deregistering agents, idle blocking, or tracking active agents.

7. **No CLI orchestration interface**: Terminal execution is `terminal.sendText('claude "/workflow-name"')`.

### Comparison

| Capability | autonomous-claude-agent-team | cc-wf-studio |
|---|---|---|
| Core purpose | Runtime workflow engine | Visual editor producing static definitions |
| State machine | 11-state FSM with guards | No state machine (DAG of prompt nodes) |
| Event sourcing | Events folded to derive state | No events; JSON overwritten |
| Hook interception | Runtime enforcement | Writes hook config to markdown (no runtime) |
| Permission enforcement | Blocks writes/bash/reads per state | None |
| Agent lifecycle | Register/deregister, idle blocking | None |
| Side effects | onEntry hooks for GitHub/git/ESLint | Export writes markdown to disk |
| Execution | Code IS the spec; runs directly | Generates files for Claude Code CLI |
| Test coverage | 100% enforced | Manual E2E only |
| Interface | CLI + hook dual (Claude Code plugin) | VS Code extension UI |

### Verdict

cc-wf-studio solves a fundamentally different problem. It is a visual workflow designer that outputs static configuration files. The current system is a workflow engine that enforces state transitions, permissions, and agent lifecycle at runtime. They operate at completely different layers:

- cc-wf-studio is analogous to a GUI form builder that outputs HTML
- The current system is analogous to a server-side framework that processes requests

cc-wf-studio could theoretically be used as a front-end to design the initial workflow graph that the engine then executes, but it cannot replace any runtime capabilities.

### Sources

- [GitHub - breaking-brake/cc-wf-studio](https://github.com/breaking-brake/cc-wf-studio/)
- [VS Code Marketplace - CC Workflow Studio](https://marketplace.visualstudio.com/items?itemName=breaking-brake.cc-wf-studio)
- [Welcome to Claude Code Workflow Studio (Blog)](https://breaking-brake.com/blog/001-cc-wf-studio-intro/)
- [Quick Start Guide](https://breaking-brake.com/blog/002-quick-start-tutorial/)
