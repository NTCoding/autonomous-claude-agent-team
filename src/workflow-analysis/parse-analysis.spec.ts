import { parseAnalysis } from './parse-analysis.js'
import type { ParsedInsight, ParsedSuggestion } from './parse-analysis.js'

function firstInsight(md: string): ParsedInsight {
  const result = parseAnalysis(md)
  expect(result.insights.length).toBeGreaterThan(0)
  return result.insights[0] ?? { severity: 'info', title: '', evidence: '', prompt: '' }
}

function firstSuggestion(md: string): ParsedSuggestion {
  const result = parseAnalysis(md)
  expect(result.suggestions.length).toBeGreaterThan(0)
  return result.suggestions[0] ?? { title: '', rationale: '', change: '', tradeoff: '', prompt: '' }
}

describe('parseAnalysis', () => {
  it('returns empty arrays for empty input', () => {
    const result = parseAnalysis('')
    expect(result.insights).toStrictEqual([])
    expect(result.suggestions).toStrictEqual([])
  })

  it('returns empty arrays for text without headings', () => {
    const result = parseAnalysis('Just some text\nwithout any headings')
    expect(result.insights).toStrictEqual([])
    expect(result.suggestions).toStrictEqual([])
  })

  it('ignores top-level # headings', () => {
    const result = parseAnalysis('# Key Issues\nSome text')
    expect(result.insights).toStrictEqual([])
    expect(result.suggestions).toStrictEqual([])
  })

  it('parses ⚠ heading as warning insight', () => {
    const insight = firstInsight('## ⚠ Too many rejections\nEvidence text here')
    expect(insight.severity).toStrictEqual('warning')
    expect(insight.title).toStrictEqual('⚠ Too many rejections')
    expect(insight.evidence).toStrictEqual('Evidence text here')
    expect(insight.prompt).toStrictEqual('')
  })

  it('parses ℹ heading as info insight', () => {
    const insight = firstInsight('## ℹ Velocity trend\nIterations improved')
    expect(insight.severity).toStrictEqual('info')
    expect(insight.title).toStrictEqual('ℹ Velocity trend')
  })

  it('parses ✓ heading as success insight', () => {
    const insight = firstInsight('## ✓ Clean session\nNo issues')
    expect(insight.severity).toStrictEqual('success')
  })

  it('parses ✅ heading as success insight', () => {
    const insight = firstInsight('## ✅ All good\nPerfect')
    expect(insight.severity).toStrictEqual('success')
  })

  it('parses 💡 heading as suggestion', () => {
    const suggestion = firstSuggestion('## 💡 Expand write scope\nRationale here')
    expect(suggestion.title).toStrictEqual('💡 Expand write scope')
    expect(suggestion.rationale).toStrictEqual('Rationale here')
  })

  it('extracts Continue: prompt from insight body', () => {
    const insight = firstInsight('## ⚠ Problem\nEvidence\n\nContinue: workflow analyze abc')
    expect(insight.evidence).toStrictEqual('Evidence')
    expect(insight.prompt).toStrictEqual('workflow analyze abc')
  })

  it('extracts **Continue:** prompt with bold markers', () => {
    const insight = firstInsight('## ⚠ Problem\nEvidence\n\n**Continue:** bold prompt')
    expect(insight.evidence).toStrictEqual('Evidence')
    expect(insight.prompt).toStrictEqual('bold prompt')
  })

  it('parses suggestion with Change and Trade-off labels', () => {
    const md = [
      '## 💡 Add config path',
      'Developer was blocked.',
      '',
      '**Change:** Add src/config/ to scope',
      '',
      '**Trade-off:** Wider access',
    ].join('\n')
    const suggestion = firstSuggestion(md)
    expect(suggestion.rationale).toStrictEqual('Developer was blocked.')
    expect(suggestion.change).toStrictEqual('Add src/config/ to scope')
    expect(suggestion.tradeoff).toStrictEqual('Wider access')
  })

  it('parses suggestion with prompt after Change and Trade-off', () => {
    const md = [
      '## 💡 Fix it',
      'Rationale.',
      '**Change:** Do X',
      '**Trade-off:** Risk Y',
      'Continue: workflow fix',
    ].join('\n')
    const suggestion = firstSuggestion(md)
    expect(suggestion.prompt).toStrictEqual('workflow fix')
    expect(suggestion.change).toStrictEqual('Do X')
    expect(suggestion.tradeoff).toStrictEqual('Risk Y')
  })

  it('handles suggestion without Change or Trade-off', () => {
    const suggestion = firstSuggestion('## 💡 Simple suggestion\nJust a rationale')
    expect(suggestion.rationale).toStrictEqual('Just a rationale')
    expect(suggestion.change).toStrictEqual('')
    expect(suggestion.tradeoff).toStrictEqual('')
  })

  it('handles ### headings', () => {
    const insight = firstInsight('### ⚠ Sub-heading insight\nBody')
    expect(insight.title).toStrictEqual('⚠ Sub-heading insight')
  })

  it('parses multiple sections in order', () => {
    const md = [
      '## ⚠ Warning one',
      'Evidence 1',
      '## ℹ Info one',
      'Evidence 2',
      '## 💡 Suggestion one',
      'Rationale 1',
    ].join('\n')
    const result = parseAnalysis(md)
    expect(result.insights).toHaveLength(2)
    expect(result.suggestions).toHaveLength(1)
    const w = result.insights[0] ?? { severity: 'info', title: '', evidence: '', prompt: '' }
    const i = result.insights[1] ?? { severity: 'info', title: '', evidence: '', prompt: '' }
    expect(w.severity).toStrictEqual('warning')
    expect(i.severity).toStrictEqual('info')
  })

  it('skips unclassified headings', () => {
    const md = [
      '## Summary',
      'Some text',
      '## ⚠ Real insight',
      'Evidence',
    ].join('\n')
    const insight = firstInsight(md)
    expect(insight.title).toStrictEqual('⚠ Real insight')
  })

  it('trims whitespace from parsed fields', () => {
    const insight = firstInsight('## ⚠ Title\n\n  Evidence with leading space  \n\nContinue:  prompt text  ')
    expect(insight.evidence).toStrictEqual('Evidence with leading space')
    expect(insight.prompt).toStrictEqual('prompt text')
  })

  it('handles multiline evidence', () => {
    const insight = firstInsight('## ⚠ Title\nLine one\nLine two\nLine three')
    expect(insight.evidence).toStrictEqual('Line one\nLine two\nLine three')
  })

  it('handles multiline prompt', () => {
    const insight = firstInsight('## ⚠ Title\nEvidence\n\nContinue: workflow analyze abc\n\nRead the transcript and check iteration 2')
    expect(insight.prompt).toStrictEqual('workflow analyze abc\n\nRead the transcript and check iteration 2')
  })
})
