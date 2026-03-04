import { runWorkflow } from './autonomous-claude-agent-team-workflow.js'
import { EXIT_ERROR, EXIT_ALLOW } from './infra/hook-io.js'
import { WorkflowError } from './infra/workflow-error.js'
import { makeDeps } from './autonomous-claude-agent-team-workflow-cli-test-fixtures.js'

describe('runWorkflow - view-report command', () => {
  it('returns EXIT_ERROR when no sessionId is given', () => {
    const result = runWorkflow(['view-report'], makeDeps())
    expect(result.exitCode).toStrictEqual(EXIT_ERROR)
    expect(result.output).toContain('missing required argument')
  })

  describe('phase 1 — analysis context output', () => {
    it('outputs analysisContext from getAnalysisContext when no flags are given', () => {
      const result = runWorkflow(['view-report', 'my-session'], makeDeps({
        reportDeps: {
          getAnalysisContext: (sessionId) => `# Context for ${sessionId}`,
        },
      }))
      expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
      expect(result.output).toStrictEqual('# Context for my-session')
    })

    it('does not call generateReport in phase 1', () => {
      const calls: string[] = []
      runWorkflow(['view-report', 'abc'], makeDeps({
        reportDeps: {
          getAnalysisContext: () => 'context',
          generateReport: () => { calls.push('called'); return { path: '/tmp/report.html' } },
        },
      }))
      expect(calls).toStrictEqual([])
    })
  })

  describe('phase 2 — render with analysis file', () => {
    it('reads analysis file and passes content to generateReport', () => {
      const capturedAnalysis: Array<string | undefined> = []
      const result = runWorkflow(['view-report', 'abc-123', '--render', '/tmp/analysis.md'], makeDeps({
        reportDeps: {
          readAnalysisFile: (path) => `analysis from ${path}`,
          generateReport: (_id, options) => {
            capturedAnalysis.push(options?.analysis)
            return { path: '/tmp/session-report.html' }
          },
        },
      }))
      expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
      expect(result.output).toStrictEqual('/tmp/session-report.html')
      expect(capturedAnalysis[0]).toStrictEqual('analysis from /tmp/analysis.md')
    })

    it('handles --render before sessionId in args', () => {
      const calledWith: string[] = []
      const result = runWorkflow(['view-report', '--render', '/tmp/a.md', 'abc-123'], makeDeps({
        reportDeps: {
          readAnalysisFile: () => 'content',
          generateReport: (sessionId) => {
            calledWith.push(sessionId)
            return { path: '/tmp/report.html' }
          },
        },
      }))
      expect(calledWith[0]).toStrictEqual('abc-123')
      expect(result.output).toStrictEqual('/tmp/report.html')
    })
  })

  describe('simple mode — no analysis', () => {
    it('generates report without analysis and outputs only link', () => {
      const capturedOptions: Array<{ analysis?: string } | undefined> = []
      const result = runWorkflow(['view-report', 'abc-123', '--simple'], makeDeps({
        reportDeps: {
          generateReport: (_id, options) => {
            capturedOptions.push(options)
            return { path: '/tmp/session-report-abc-123.html' }
          },
        },
      }))
      expect(result.exitCode).toStrictEqual(EXIT_ALLOW)
      expect(result.output).toStrictEqual('/tmp/session-report-abc-123.html')
      expect(capturedOptions[0]).toStrictEqual(undefined)
    })

    it('handles --simple before sessionId in args', () => {
      const calledWith: string[] = []
      const result = runWorkflow(['view-report', '--simple', 'abc-123'], makeDeps({
        reportDeps: {
          generateReport: (sessionId) => {
            calledWith.push(sessionId)
            return { path: '/tmp/report.html' }
          },
        },
      }))
      expect(calledWith[0]).toStrictEqual('abc-123')
      expect(result.output).toStrictEqual('/tmp/report.html')
    })
  })

  describe('error handling', () => {
    it('returns EXIT_ERROR with message when getAnalysisContext throws WorkflowError', () => {
      const result = runWorkflow(['view-report', 'bad-id'], makeDeps({
        reportDeps: {
          getAnalysisContext: () => { throw new WorkflowError('No events found for session "bad-id"') },
        },
      }))
      expect(result.exitCode).toStrictEqual(EXIT_ERROR)
      expect(result.output).toContain('view-report: No events found for session "bad-id"')
    })

    it('returns EXIT_ERROR with message when generateReport throws WorkflowError', () => {
      const result = runWorkflow(['view-report', 'bad-id', '--simple'], makeDeps({
        reportDeps: {
          generateReport: () => { throw new WorkflowError('No events found for session "bad-id"') },
        },
      }))
      expect(result.exitCode).toStrictEqual(EXIT_ERROR)
      expect(result.output).toContain('view-report: No events found for session "bad-id"')
    })

    it('returns EXIT_ERROR with message when readAnalysisFile throws WorkflowError', () => {
      const result = runWorkflow(['view-report', 'abc', '--render', '/tmp/missing.md'], makeDeps({
        reportDeps: {
          readAnalysisFile: () => { throw new WorkflowError('File not found') },
        },
      }))
      expect(result.exitCode).toStrictEqual(EXIT_ERROR)
      expect(result.output).toContain('view-report: File not found')
    })

    it('re-throws non-WorkflowError exceptions', () => {
      expect(() => runWorkflow(['view-report', 'bad-id'], makeDeps({
        reportDeps: {
          getAnalysisContext: () => { throw new TypeError('unexpected') },
        },
      }))).toThrow('unexpected')
    })
  })
})
