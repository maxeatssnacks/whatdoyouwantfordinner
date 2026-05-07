import { Link, useLocation } from 'react-router-dom'
import { Home, BookOpen, Calendar, ShoppingCart, User } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Sidebar() {
  const location = useLocation()

  const links = [
    { path: '/dashboard', label: 'Dashboard', icon: Home },
    { path: '/recipes', label: 'Recipes', icon: BookOpen },
    { path: '/planner', label: 'Planner', icon: Calendar },
    { path: '/shopping', label: 'Shopping', icon: ShoppingCart },
    { path: '/profile', label: 'Profile', icon: User },
  ]

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-surface border-r border-border min-h-screen">
      <div className="p-6">
        <h2 className="text-xl font-display font-bold text-primary">Menu</h2>
      </div>
      <nav className="flex-1 px-4">
        {links.map((link) => {
          const Icon = link.icon
          const isActive = location.pathname === link.path

          return (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                'flex items-center space-x-3 px-4 py-3 rounded-xl mb-2',
                'font-body font-semibold transition-all duration-150',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:bg-background hover:text-primary'
              )}
            >
              <Icon size={20} />
              <span>{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
