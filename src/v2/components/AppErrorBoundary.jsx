import { Component } from 'react'
import { posthog } from '../../lib/posthog'
import { routeOf } from '../lib/routes'

// A render error anywhere under the routes (or the voice sheet above them)
// shows this plain page instead of a blank screen (v2 step 7c2: the speech
// probe crashed and the Home Screen app had no way out but force-closing).
// No error text or stack is shown; app_error carries the route only, as its
// pattern ("/recipes/:id"), never the message.

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    try {
      posthog.capture('app_error', { route: routeOf(window.location.pathname) })
    } catch {
      // Analytics never gets in the way of the page.
    }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main role="alert" data-testid="app-error" className="min-h-screen flex items-center justify-center px-6 bg-background font-body text-text-primary">
        <div className="w-full max-w-[360px] flex flex-col items-center text-center gap-3">
          <h1 className="font-display text-[28px] leading-tight font-bold">Something went wrong</h1>
          <p className="text-[15px] leading-relaxed text-text-secondary">Reload the page, or go back to your week.</p>
          <div className="w-full flex flex-col gap-2.5 mt-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[52px] rounded-pill bg-primary-hover text-white text-base font-bold hover:bg-primary-pressed focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/dashboard')}
              className="min-h-[52px] rounded-pill border border-border bg-surface text-text-primary text-base font-bold hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-ring-primary"
            >
              Go to Week
            </button>
          </div>
        </div>
      </main>
    )
  }
}
