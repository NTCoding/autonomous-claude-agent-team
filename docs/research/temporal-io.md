## Temporal.io Research Analysis: Potential Replacement for Custom Workflow Engine

### 1. What Is Temporal?

Temporal is an open-source durable execution platform originally derived from Uber's Cadence project. It guarantees that application logic runs to completion even in the presence of failures -- process crashes, network outages, infrastructure restarts. The core idea is "workflow-as-code": you write orchestration logic as normal functions in your programming language, and Temporal handles state persistence, retries, timeouts, and recovery automatically.

Temporal is not a state machine framework. Their own blog post is titled "Temporal: Beyond State Machines for Reliable Distributed Applications." Rather than explicitly modeling states and transitions, you write imperative code that reads linearly, and Temporal's infrastructure makes that code durable.

Key facts:
- 183,000+ weekly active open-source developers
- 7 million+ unique Temporal clusters deployed
- Used by Netflix, Snap, Datadog, HashiCorp, OpenAI, Replit, Lovable
- Series D: $300M at $5B valuation (February 2026)
- SDKs: Go, Java, Python, TypeScript, .NET, PHP, Ruby

### 2. Core Concepts

**Workflows** -- Deterministic functions that define orchestration logic. They can run for seconds, hours, days, or years. They survive infrastructure failures because Temporal replays event history to reconstruct their state after a crash.

**Activities** -- Non-deterministic functions that perform actual work: API calls, file I/O, LLM invocations, git operations. Activities can fail, time out, and are retried automatically according to configurable policies.

**Signals** -- Asynchronous messages sent to a running Workflow to change its state. Signals are durably persisted in the event history. A workflow can block using `workflow.condition()` until a signal changes internal state.

**Queries** -- Synchronous, read-only requests against a running Workflow's current state.

**Updates** -- Synchronous requests that can mutate workflow state and return a result.

**Child Workflows** -- Workflows spawned from parent workflows with independent event histories.

**Continue-As-New** -- Mechanism for long-running workflows to reset their event history (capped at 51,200 events or 50 MB).

### 3. Event History and Replay

Temporal uses event sourcing internally. Every workflow execution produces an Event History -- a durable, ordered log of events. When a Worker crashes and restarts, Temporal replays the event history through the workflow code to reconstruct the exact pre-crash state.

Critical requirement: workflow code must be deterministic. Given the same event history, the workflow must produce the same sequence of Commands. No direct I/O, no random numbers, no `Date.now()`, no network calls in workflow code. All non-deterministic operations must go through Activities.

### 4. TypeScript SDK

In the TypeScript SDK, a workflow is an async function:

```typescript
import * as wf from '@temporalio/workflow';
import type * as activities from './activities';

const { sendEmail, processPayment } = wf.proxyActivities<typeof activities>({
  startToCloseTimeout: '30s',
  retry: { maximumAttempts: 3 },
});

export const approveSignal = wf.defineSignal('approve');
export const statusQuery = wf.defineQuery<string>('status');

export async function orderWorkflow(orderId: string): Promise<string> {
  let approved = false;
  let status = 'pending';

  wf.setHandler(approveSignal, () => { approved = true; });
  wf.setHandler(statusQuery, () => status);

  await wf.condition(() => approved);

  status = 'processing';
  await processPayment(orderId);

  status = 'complete';
  await sendEmail(orderId);

  return 'done';
}
```

The SDK also supports interceptors -- a middleware chain pattern for intercepting workflow, activity, and client operations.

### 5. Testing

The TypeScript SDK provides `@temporalio/testing` with `TestWorkflowEnvironment`:
- Spins up a lightweight test Temporal server
- Time skipping (workflows sleeping for days complete in milliseconds during tests)
- Activity mocking via mock implementations on the test Worker
- Replay testing (record event histories and replay against modified code)
- Works with Jest and Mocha

However, Temporal recommends integration tests as the primary strategy, not unit tests. The test server is a real (lightweight) Temporal server. Fundamentally different from pure function unit tests.

### 6. Mapping the Current System to Temporal

**How states would map**: The current system has 11 explicit states with a registry. In Temporal, there is no explicit FSM abstraction. The workflow function IS the state machine:

```typescript
export async function featureWorkflow(input: FeatureInput): Promise<void> {
  // SPAWN state
  const issue = await spawnActivities(input);
  // PLANNING state
  await wf.condition(() => planApproved);
  // DEVELOPING state (loop for iterations)
  while (\!allIterationsComplete) {
    await developIteration(currentTask);
    // REVIEWING state
    const reviewResult = await reviewCode();
    if (reviewResult === 'rejected') continue;
    // COMMITTING state
    await commitChanges();
    // CR_REVIEW state
    await handleCoderabbitFeedback();
  }
  // PR_CREATION -> FEEDBACK -> COMPLETE
  await createPullRequest();
  await awaitPrChecks();
}
```

The state is implicit in the program counter. Where the workflow's execution is currently paused IS the current state.

**Transition guards**: Become `wf.condition()` calls that block until preconditions are met, or explicit `if` checks.

**Event sourcing**: Built-in and automatic. You do NOT write a fold function -- Temporal's runtime handles it by re-executing your workflow code up to the current point.

**Hook interception (the hardest problem)**: The current system intercepts Claude Code tool calls synchronously and must return allow/block immediately. Temporal's interceptors are for Temporal's own operations, not for intercepting external tool calls. The hook handler would need to query the Temporal workflow (via a Query) to determine current state and permissions, adding latency. The hook interception layer would remain a local adapter that communicates with Temporal.

### 7. Trade-Off Analysis

**What You Gain:**
| Capability | Current System | With Temporal |
|---|---|---|
| Durability | SQLite event store, manual replay | Automatic -- survives any crash |
| Visibility | `cat /tmp/... \| jq` | Web UI with search, filtering, event timeline |
| Long-running support | Works but no safeguards | First-class: Continue-As-New, durable timers |
| Retry policies | Manual | Configurable per-activity with backoff |
| Observability | Event log in JSON | Prometheus metrics, distributed tracing |
| Multi-worker | Single process | Horizontal scaling |
| AI agent patterns | Custom | Temporal investing in AI agent orchestration |

**What You Lose:**
| Concern | Current System | With Temporal |
|---|---|---|
| Simplicity | ~164-line engine + ~143-line fold | Temporal server + SDK + Workers + database |
| Zero infrastructure | Runs as a Claude Code plugin | Requires Temporal server (even dev server is a process) |
| Pure testability | 100% unit test coverage with pure functions | Integration tests against test server |
| Hook interception | Direct, in-process, synchronous | External adapter querying Temporal; added latency |
| Startup latency | Instant (read SQLite, fold events) | Server connection, worker registration, gRPC overhead |
| Determinism constraint | None -- your code, your rules | Strict: no I/O in workflow code |
| Deployment | `pnpm install` -- done | Temporal server + database + workers |
| Code-is-spec | State definitions are the specification | Spec spread across workflow code, activities, config |

### 8. Infrastructure Requirements

Self-hosted: PostgreSQL + 4 Temporal services + optional Elasticsearch (minimum 7 components).

Temporal Cloud (managed): $25-$1000+/month depending on volume.

Local development: `temporal server start-dev` runs an ephemeral server.

For a Claude Code plugin that runs locally on a developer's machine, requiring a Temporal server is a significant architectural mismatch.

### 9. Verdict

Temporal should NOT replace the custom engine for this system. Reasons:

1. **Infrastructure mismatch**: CLI plugin on developer machines. Requiring a Temporal server violates the zero-dependency runtime model.

2. **Hook interception unsolved**: The most sophisticated part of the system -- intercepting tool calls synchronously -- cannot live inside a Temporal workflow. It would remain external code querying Temporal, adding latency and complexity.

3. **100% test coverage at risk**: Pure-function approach makes 100% coverage trivial. Temporal's integration-test-first approach makes this harder.

4. **The system is right-sized**: ~700 lines of custom engine with 100% test coverage and zero dependencies is not a problem needing a distributed systems platform.

5. **Temporal solves problems this system doesn't have**: Distributed workers, horizontal scaling, multi-service orchestration, cross-datacenter durability.

**Where Temporal WOULD make sense**: If the system evolved to run as a hosted service orchestrating multiple agent sessions across machines, with long-running workflows spanning days, needing crash recovery and operational visibility across many concurrent workflows.

### Sources

- [Understanding Temporal](https://docs.temporal.io/evaluate/understanding-temporal)
- [How the Temporal Platform Works](https://temporal.io/how-it-works)
- [Temporal: Beyond State Machines](https://temporal.io/blog/temporal-replaces-state-machines-for-distributed-applications)
- [TypeScript SDK Developer Guide](https://docs.temporal.io/develop/typescript)
- [Core Application - TypeScript SDK](https://docs.temporal.io/develop/typescript/core-application)
- [Workflow Message Passing](https://docs.temporal.io/develop/typescript/message-passing)
- [Testing - TypeScript SDK](https://docs.temporal.io/develop/typescript/testing-suite)
- [Interceptors](https://docs.temporal.io/develop/typescript/interceptors)
- [Events and Event History](https://docs.temporal.io/workflow-execution/event)
- [Temporal Cloud Pricing](https://docs.temporal.io/cloud/pricing)
- [Temporal Raises $300M Series D](https://www.businesswire.com/news/home/20260217453156)
- [Multi-Agent Architectures with Temporal](https://temporal.io/blog/using-multi-agent-architectures-with-temporal)
