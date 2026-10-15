import { Navigate, useLocation } from 'react-router-dom'

// /plan and /planner are replaced by the Week page; keep old links working,
// including ?day= (and ?week=).
export function PlanRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/dashboard${search}`} replace />
}
