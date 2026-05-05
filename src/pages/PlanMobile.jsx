import { TopAppBar } from '../components/layout/TopAppBar'

export function PlanMobile() {
  return (
    <div className="min-h-screen bg-bg pb-24">
      <div className="sticky top-0 z-30">
        <TopAppBar showTitle title="Plan" />
      </div>
      <div className="px-4 py-4">
        <p className="text-text-secondary font-body">Plan mobile — coming soon.</p>
      </div>
    </div>
  )
}
