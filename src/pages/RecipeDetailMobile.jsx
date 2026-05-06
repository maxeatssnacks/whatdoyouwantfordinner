import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { TopAppBar, IconBtn } from '../components/layout/TopAppBar'
import { BottomNav } from '../components/layout/BottomNav'

export function RecipeDetailMobile() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-bg pb-24">
      <div className="sticky top-0 z-30">
        <TopAppBar
          showTitle={false}
          leading={
            <IconBtn label="Back" onClick={() => navigate(-1)}>
              <ChevronLeft size={20} strokeWidth={2} />
            </IconBtn>
          }
        />
      </div>
      <div className="px-4 py-8 text-center">
        <p className="text-text-secondary font-body">Mobile detail coming.</p>
      </div>
      <BottomNav />
    </div>
  )
}
