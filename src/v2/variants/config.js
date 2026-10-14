// Switchable design parts for the internal variant panel. Each entry lists
// the options being tried in the real app and the default everyone sees until
// a choice is made. Letters match the files in design-system/v2/now/.
// Trim options to the winners once decided (see "v2 backlog" in PROJECT_NOTES.md).
export const VARIANT_PARTS = {
  weekHeader: {
    label: 'Week header',
    options: [
      { value: 'A', label: 'A · Day strip' },
      { value: 'C', label: 'C · Today first' },
    ],
    default: 'A',
  },
  mealCard: {
    label: 'Meal card',
    options: [
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' },
      { value: 'D', label: 'D' },
    ],
    default: 'B',
  },
  todayCard: {
    label: 'Today card',
    options: [
      { value: 'A', label: 'A' },
      { value: 'B', label: 'B' },
      { value: 'C', label: 'C' },
      { value: 'D', label: 'D' },
    ],
    default: 'D',
  },
  rolloverSheet: {
    label: 'Rollover sheet',
    options: [
      { value: 'A', label: 'A · On hand' },
      { value: 'D', label: 'D · Quick' },
    ],
    default: 'A',
  },
}

export const VARIANT_DEFAULTS = Object.fromEntries(
  Object.entries(VARIANT_PARTS).map(([key, part]) => [key, part.default]),
)
