import React from 'react'
import ReactDOM from 'react-dom/client'
import posthog from 'posthog-js'
import App from './App.jsx'
import { scrubEvent, scrubPostHogStorage } from './v2/lib/analytics.js'
import './index.css'

// Analytics sends counts, fixed labels and ids, and URLs only as the origin
// plus the route pattern (src/v2/lib/analytics.js). Everything that could
// collect more is off here, so a switch in the PostHog project can't turn it
// on: session replay, heatmaps, dead clicks, exception capture, surveys, and
// the /flags request (no feature flags are used; it also carries the initial
// URL as a person property, outside before_send).
if (import.meta.env.VITE_POSTHOG_KEY) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host: import.meta.env.VITE_POSTHOG_HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    capture_performance: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    capture_exceptions: false,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_flags: true,
    person_profiles: 'identified_only',
    before_send: (event) => {
      scrubPostHogStorage(posthog, window.location.origin)
      return scrubEvent(event, window.location.origin)
    },
    loaded: (ph) => scrubPostHogStorage(ph, window.location.origin),
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
