import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

export function ForgotPassword() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sentToEmail, setSentToEmail] = useState('')
  const { resetPasswordForEmail } = useAuth()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm()

  const onSubmit = async (data) => {
    setError('')
    setIsLoading(true)
    const { error: resetError } = await resetPasswordForEmail(data.email)
    setIsLoading(false)
    if (resetError) {
      setError(resetError.message || 'Failed to send reset link. Please try again.')
      return
    }
    setSentToEmail(data.email)
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
          <p className="text-text-secondary font-body">Reset your password</p>
        </div>

        <Card>
          {sentToEmail ? (
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold text-text-primary mb-3">
                Check your email
              </h2>
              <p className="text-text-secondary font-body mb-6">
                We sent a password reset link to{' '}
                <span className="font-semibold text-text-primary">{sentToEmail}</span>. Click the link to set a new password.
              </p>
              <Link to="/login">
                <Button variant="ghost" size="md" className="w-full">
                  Back to Login
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-display font-bold text-text-primary mb-2">
                Forgot Password
              </h2>
              <p className="text-text-secondary font-body text-sm mb-6">
                Enter the email associated with your account and we'll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 p-4 bg-error/10 border border-error rounded-xl">
                  <p className="text-error text-sm font-body">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  {...register('email', {
                    required: 'Email is required',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Invalid email address',
                    },
                  })}
                  error={errors.email?.message}
                />

                <Button type="submit" disabled={isLoading} size="md" className="w-full">
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-text-secondary font-body">
                  Remembered it?{' '}
                  <Link to="/login" className="text-primary font-semibold hover:underline">
                    Log in
                  </Link>
                </p>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
