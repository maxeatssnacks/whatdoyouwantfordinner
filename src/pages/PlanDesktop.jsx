import { WeeklyPlanner } from '../components/planner/WeeklyPlanner'

export function PlanDesktop() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] mx-auto px-4 py-6 md:py-8">
        <h1 className="text-3xl font-display font-bold text-text-primary mb-6">
          Weekly Plan
        </h1>
        <WeeklyPlanner />
      </div>
    </div>
  )
}
