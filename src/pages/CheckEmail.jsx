import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function CheckEmail() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const email = state?.email

  if (!email) {
    navigate('/login', { replace: true })
    return null
  }

  const handleWrongEmail = async () => {
    try {
      setIsLoading(true)
      await signOut()
    } catch {
      // signOut failure is non-blocking — navigate regardless
    } finally {
      navigate('/signup', { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/">
            <h1 className="text-3xl font-display font-bold mb-2 leading-tight">
              <span className="text-text-primary">What Do You Want</span>
              <br />
              <span className="text-primary">For Dinner?</span>
            </h1>
          </Link>
          <p className="text-text-secondary font-body">Check your inbox to finish signing up.</p>
        </div>

        <Card>
          <h2 className="text-2xl font-display font-bold text-text-primary mb-6">
            Almost there!
          </h2>

          <div className="space-y-4 font-body">
            <p className="text-text-secondary">We just sent a confirmation link to:</p>
            <p className="font-semibold text-text-primary">{email}</p>
            <p className="text-text-secondary">
              Tap the link in the email to finish signing up. Once confirmed,
              you'll be able to log in.
            </p>
            <p className="text-sm text-text-secondary">
              Can't find it? Check your spam folder — and since we're a new sender,
              it might take a minute or two to arrive.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-sm text-text-secondary font-body mb-3">Wrong email address?</p>
            <Button
              variant="secondary"
              size="md"
              className="w-full"
              onClick={handleWrongEmail}
              disabled={isLoading}
            >
              {isLoading ? 'Signing out…' : 'Sign out and try again'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
