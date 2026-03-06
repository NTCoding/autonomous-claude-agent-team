import { stateColor } from '../render.js'

type LinePoint = { x: number; y: number; label?: string }
type BarSegment = { label: string; value: number; color?: string }

export function renderLineChart(
  points: Array<LinePoint>,
  config: { width?: number; height?: number; title?: string } = {},
): string {
  const width = config.width ?? 400
  const height = config.height ?? 200
  const padding = 40

  if (points.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="${height / 2}" fill="#999" text-anchor="middle" font-size="12">No data</text>
    </svg>`
  }

  const maxY = Math.max(...points.map((p) => p.y), 1)
  const minX = Math.min(...points.map((p) => p.x))
  const maxX = Math.max(...points.map((p) => p.x))
  const rangeX = maxX - minX || 1

  const scaleX = (x: number) => padding + ((x - minX) / rangeX) * (width - 2 * padding)
  const scaleY = (y: number) => height - padding - (y / maxY) * (height - 2 * padding)

  const polyline = points.map((p) => `${scaleX(p.x)},${scaleY(p.y)}`).join(' ')
  const circles = points
    .map(
      (p) =>
        `<circle cx="${scaleX(p.x)}" cy="${scaleY(p.y)}" r="3" fill="#3498db" />`,
    )
    .join('')

  const titleEl = config.title
    ? `<text x="${width / 2}" y="16" fill="#1a1a1a" text-anchor="middle" font-size="13" font-weight="600">${config.title}</text>`
    : ''

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    ${titleEl}
    <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#ddd" />
    <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#ddd" />
    <polyline points="${polyline}" fill="none" stroke="#3498db" stroke-width="2" />
    ${circles}
  </svg>`
}

export function renderBarChart(
  bars: Array<BarSegment>,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): string {
  const width = 400
  const height = orientation === 'horizontal' ? Math.max(bars.length * 30 + 20, 60) : 200

  if (bars.length === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <text x="${width / 2}" y="${height / 2}" fill="#999" text-anchor="middle" font-size="12">No data</text>
    </svg>`
  }

  const maxVal = Math.max(...bars.map((b) => b.value), 1)

  if (orientation === 'horizontal') {
    const barHeight = 20
    const gap = 8
    const rects = bars
      .map((b, i) => {
        const y = 10 + i * (barHeight + gap)
        const w = (b.value / maxVal) * (width - 140)
        const color = b.color ?? '#3498db'
        return `<rect x="120" y="${y}" width="${w}" height="${barHeight}" fill="${color}" rx="2" />
          <text x="0" y="${y + 14}" fill="#666" font-size="11">${b.label}</text>
          <text x="${122 + w}" y="${y + 14}" fill="#888" font-size="11">${b.value}</text>`
      })
      .join('')

    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
  }

  const barWidth = (width - 40) / bars.length - 4
  const rects = bars
    .map((b, i) => {
      const x = 20 + i * (barWidth + 4)
      const h = (b.value / maxVal) * (height - 40)
      const color = b.color ?? '#3498db'
      return `<rect x="${x}" y="${height - 20 - h}" width="${barWidth}" height="${h}" fill="${color}" rx="2" />`
    })
    .join('')

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
}

export function renderStackedBar(segments: Array<BarSegment>): string {
  const width = 400
  const height = 40
  const totalVal = segments.reduce((sum, s) => sum + s.value, 0)

  if (totalVal === 0) {
    return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="8" width="${width}" height="24" fill="#eee" rx="3" />
    </svg>`
  }

  let x = 0
  const rects = segments
    .map((s) => {
      const w = (s.value / totalVal) * width
      const color = s.color ?? stateColor(s.label)
      const rect = `<rect x="${x}" y="8" width="${w}" height="24" fill="${color}"><title>${s.label}: ${s.value}</title></rect>`
      x += w
      return rect
    })
    .join('')

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`
}
