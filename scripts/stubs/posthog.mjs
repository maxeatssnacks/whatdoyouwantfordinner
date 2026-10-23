// Analytics events are kept in globalThis.__posthogEvents; nothing is sent.
globalThis.__posthogEvents = []
export const posthog = { capture: (event, properties = {}) => globalThis.__posthogEvents.push({ event, properties }) }
