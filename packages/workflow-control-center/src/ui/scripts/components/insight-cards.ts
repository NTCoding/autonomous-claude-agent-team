import { html, esc } from '../render.js'

type InsightData = {
  severity: string
  title: string
  evidence: string
  prompt?: string
}

function renderPromptBlock(prompt: string): string {
  return html`<div class="insight-prompt"><button class="copy-btn" data-copy-prompt>Continue with Claude</button>${esc(prompt)}</div>`
}

export function renderInsightCard(insight: InsightData): string {
  const promptHtml = insight.prompt ? renderPromptBlock(insight.prompt) : ''
  return html`<div class="insight ${insight.severity}">` +
    html`<div class="insight-head"><span class="insight-title">${esc(insight.title)}</span><span class="insight-arrow">▶</span></div>` +
    html`<div class="insight-body"><div class="insight-evidence">${esc(insight.evidence)}</div>${promptHtml}</div>` +
    `</div>`
}

export function renderInsights(insights: Array<InsightData>): string {
  if (insights.length === 0) {
    return html`<div class="loading">No insights</div>`
  }
  return insights.map(renderInsightCard).join('')
}

export function attachInsightListeners(container: HTMLElement): void {
  container.querySelectorAll('.insight-head').forEach((head) => {
    head.addEventListener('click', () => {
      const body = head.nextElementSibling
      if (body) {
        body.classList.toggle('open')
        const arrow = head.querySelector('.insight-arrow')
        if (arrow) arrow.textContent = body.classList.contains('open') ? '▼' : '▶'
      }
    })
  })

  container.querySelectorAll('[data-copy-prompt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const prompt = btn.parentElement
      if (!prompt) return
      const text = prompt.textContent?.replace('Continue with Claude', '').trim() ?? ''
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'Copied!'
        setTimeout(() => { btn.textContent = 'Continue with Claude' }, 1200)
      })
    })
  })
}
