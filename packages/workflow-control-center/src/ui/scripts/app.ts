import { parseRoute, onRouteChange } from './router.js'
import type { Route } from './router.js'
import { renderDashboard } from './views/dashboard.js'
import { renderSessionDetail } from './views/session-detail.js'
import { renderAnalytics } from './views/analytics.js'
import { renderSessionCompare } from './views/session-compare.js'
import { createSseClient } from './sse-client.js'

function getAppContainer(): HTMLElement {
  const el = document.getElementById('app')
  if (!el) throw new Error('Missing #app element')
  return el
}

async function renderRoute(route: Route): Promise<void> {
  const container = getAppContainer()

  document.querySelectorAll('.nav-link').forEach((link) => {
    const linkRoute = (link as HTMLElement).dataset['route'] ?? ''
    link.classList.toggle('active', route.view === 'dashboard' ? linkRoute === '/' : linkRoute === `/${route.view}`)
  })

  switch (route.view) {
    case 'dashboard':
      await renderDashboard(container)
      break
    case 'session':
      await renderSessionDetail(container, route.id)
      break
    case 'analytics':
      await renderAnalytics(container)
      break
    case 'compare':
      await renderSessionCompare(container, route.a, route.b)
      break
  }
}

function initSse(): void {
  createSseClient({
    onNewEvent() {
      const route = parseRoute()
      if (route.view === 'dashboard') {
        renderRoute(route)
      }
    },
    onStateChange() {
      const route = parseRoute()
      if (route.view === 'dashboard' || route.view === 'session') {
        renderRoute(route)
      }
    },
    onSessionStarted() {
      const route = parseRoute()
      if (route.view === 'dashboard') {
        renderRoute(route)
      }
    },
  })
}

const initialRoute = parseRoute()
renderRoute(initialRoute)
onRouteChange(renderRoute)
initSse()
