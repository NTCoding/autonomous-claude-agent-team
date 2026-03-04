export type ParsedInsight = {
  readonly severity: 'warning' | 'info' | 'success'
  readonly title: string
  readonly evidence: string
  readonly prompt: string
}

export type ParsedSuggestion = {
  readonly title: string
  readonly rationale: string
  readonly change: string
  readonly tradeoff: string
  readonly prompt: string
}

export type ParsedAnalysis = {
  readonly insights: readonly ParsedInsight[]
  readonly suggestions: readonly ParsedSuggestion[]
}

function classifySeverity(heading: string): 'warning' | 'info' | 'success' | undefined {
  if (heading.startsWith('⚠')) return 'warning'
  if (heading.startsWith('ℹ')) return 'info'
  if (heading.startsWith('✓') || heading.startsWith('✅')) return 'success'
  return undefined
}

function splitSections(text: string): readonly { heading: string; body: string }[] {
  const parts = text.split(/^(#{2,3}\s+.+)$/m)
  const sections: { heading: string; body: string }[] = []
  for (const [idx, part] of parts.entries()) {
    const headingMatch = /^#{2,3}\s+(.+)$/.exec(part)
    if (headingMatch) {
      /* v8 ignore next 2 */
      const body = parts[idx + 1] ?? ''
      sections.push({ heading: headingMatch[1] ?? '', body: body.trim() })
    }
  }
  return sections
}

function extractPrompt(body: string): { content: string; prompt: string } {
  const markerIdx = body.search(/\*?\*?Continue:\*?\*?\s*/i)
  if (markerIdx === -1) return { content: body, prompt: '' }
  const markerMatch = /\*?\*?Continue:\*?\*?\s*/i.exec(body.slice(markerIdx))
  /* v8 ignore next */
  const markerLen = markerMatch ? markerMatch[0].length : 'Continue:'.length
  return {
    content: body.slice(0, markerIdx).trim(),
    prompt: body.slice(markerIdx + markerLen).trim(),
  }
}

function parseInsight(heading: string, body: string, severity: 'warning' | 'info' | 'success'): ParsedInsight {
  const { content, prompt } = extractPrompt(body)
  return { severity, title: heading, evidence: content, prompt }
}

function parseSuggestion(heading: string, body: string): ParsedSuggestion {
  const { content, prompt } = extractPrompt(body)

  const changeMatch = /\*\*Change:\*\*\s*([\s\S]*?)(?=\*\*Trade-off:\*\*|$)/i.exec(content)
  const tradeoffMatch = /\*\*Trade-off:\*\*\s*([\s\S]*?)$/i.exec(content)

  const change = changeMatch?.[1]?.trim() ?? ''
  const tradeoff = tradeoffMatch?.[1]?.trim() ?? ''

  const firstBold = content.search(/\*\*(?:Change|Trade-off):\*\*/i)
  const rationale = firstBold === -1 ? content : content.slice(0, firstBold).trim()

  return { title: heading, rationale, change, tradeoff, prompt }
}

export function parseAnalysis(analysis: string): ParsedAnalysis {
  const sections = splitSections(analysis)
  const insights: ParsedInsight[] = []
  const suggestions: ParsedSuggestion[] = []

  for (const { heading, body } of sections) {
    const severity = classifySeverity(heading)
    if (severity !== undefined) {
      insights.push(parseInsight(heading, body, severity))
    } else if (heading.startsWith('💡')) {
      suggestions.push(parseSuggestion(heading, body))
    }
  }

  return { insights, suggestions }
}
