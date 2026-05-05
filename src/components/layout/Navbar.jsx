import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Menu, X, User, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/useProfile'
import { Button } from '../ui/Button'

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const location = useLocation()
  const isAdmin = profile?.is_admin === true

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  const isActive = (path) => location.pathname === path

  const navLinks = user ? [
    { path: '/recipes', label: 'Recipes' },
    { path: '/shopping', label: 'Shopping' },
  ] : []

  return (
    <nav className="hidden md:block bg-surface border-b border-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={user ? '/dashboard' : '/'} className="flex items-center">
            <span className="text-2xl font-display font-bold text-primary">
              What Do You Want For Dinner?
            </span>
          </Link>

          {/* Desktop Navigation + Profile */}
          {user && (
            <div className="hidden md:flex items-center space-x-8">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`font-body font-semibold transition-colors ${
                    isActive(link.path)
                      ? 'text-primary'
                      : 'text-text-secondary hover:text-primary'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center space-x-2 text-text-primary hover:text-primary transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User size={20} className="text-primary" />
                  </div>
                </button>

                {isProfileOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsProfileOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-surface rounded-xl shadow-elevated border border-border z-20">
                      <Link
                        to="/profile"
                        className="block px-4 py-3 text-text-primary hover:bg-background transition-colors font-body"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        Profile
                      </Link>
                      {isAdmin && (
                        <Link
                          to="/admin"
                          className="flex items-center gap-2 px-4 py-3 text-text-primary hover:bg-background transition-colors font-body"
                          onClick={() => setIsProfileOpen(false)}
                        >
                          <ShieldCheck size={15} className="text-primary" />
                          Admin
                        </Link>
                      )}
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-3 text-error hover:bg-background transition-colors font-body flex items-center space-x-2"
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mobile menu button */}
          {user && (
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden text-text-primary"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {user && isMenuOpen && (
        <div className="md:hidden border-t border-border">
          <div className="px-4 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`block py-2 font-body font-semibold ${
                  isActive(link.path)
                    ? 'text-primary'
                    : 'text-text-secondary'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/profile"
              className="block py-2 font-body font-semibold text-text-secondary"
              onClick={() => setIsMenuOpen(false)}
            >
              Profile
            </Link>
            {isAdmin && (
              <Link
                to="/admin"
                className="flex items-center gap-2 py-2 font-body font-semibold text-text-secondary"
                onClick={() => setIsMenuOpen(false)}
              >
                <ShieldCheck size={15} className="text-primary" />
                Admin
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="block py-2 font-body font-semibold text-error"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
