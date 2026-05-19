import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './hooks/useAuth'
import { Navbar } from './components/layout/Navbar'
import { BottomNav } from './components/layout/BottomNav'
import { LoadingPage } from './components/ui/LoadingSpinner'

// Pages
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { CheckEmail } from './pages/CheckEmail'
import { Dashboard } from './pages/Dashboard'
import { Recipes } from './pages/Recipes'
import { RecipeDetail } from './pages/RecipeDetail'
import { Planner } from './pages/Planner'
import { Plan } from './pages/Plan'
import { ShoppingListPage } from './pages/ShoppingListPage'
import { Profile } from './pages/Profile'
import { AdminPage } from './pages/AdminPage'
import { useProfile } from './hooks/useProfile'
import { PageviewTracker } from './components/PageviewTracker'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 30 * 60 * 1000, // 30 minutes - keep data in cache longer
    },
  },
})

// Protected Route Component
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="relative min-h-screen">
      <Navbar />
      {children}
      <BottomNav />
    </div>
  )
}

// Public Route Component (redirect to dashboard if logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// Admin-only route: must be logged in AND have profiles.is_admin = true
function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  const { data: profile, isLoading: profileLoading } = useProfile()

  if (loading || profileLoading) {
    return <LoadingPage />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!profile?.is_admin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="relative min-h-screen">
      <Navbar />
      {children}
      <BottomNav />
    </div>
  )
}

// Semi-public route: accessible without login, shows Navbar only when logged in
function SemiPublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingPage />
  }

  return (
    <>
      {user && <Navbar />}
      {children}
    </>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ScrollToTop />
          <PageviewTracker />
          <Routes>
            {/* Public Routes */}
            <Route
              path="/"
              element={
                <PublicRoute>
                  <Landing />
                </PublicRoute>
              }
            />
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/signup"
              element={
                <PublicRoute>
                  <Signup />
                </PublicRoute>
              }
            />
            <Route
              path="/forgot-password"
              element={
                <PublicRoute>
                  <ForgotPassword />
                </PublicRoute>
              }
            />
            {/* /reset-password intentionally has no PublicRoute guard — the Supabase
                recovery link sets a session immediately, which would otherwise bounce
                the user to /dashboard before they can update their password. */}
            <Route path="/reset-password" element={<ResetPassword />} />
            {/* /check-email intentionally has no PublicRoute guard — there is no session
                after an unconfirmed signup, so PublicRoute would bounce the user back to
                /dashboard on a future login; bare route lets the page handle its own state. */}
            <Route path="/check-email" element={<CheckEmail />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/recipes"
              element={
                <ProtectedRoute>
                  <Recipes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/recipes/:id"
              element={
                <SemiPublicRoute>
                  <RecipeDetail />
                </SemiPublicRoute>
              }
            />
            <Route
              path="/plan"
              element={
                <ProtectedRoute>
                  <Plan />
                </ProtectedRoute>
              }
            />
            <Route
              path="/planner"
              element={
                <ProtectedRoute>
                  <Planner />
                </ProtectedRoute>
              }
            />
            <Route
              path="/shopping"
              element={
                <ProtectedRoute>
                  <ShoppingListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />

            {/* Admin Route */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />

            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
