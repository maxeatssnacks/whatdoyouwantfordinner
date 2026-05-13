import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PasswordToggle } from '../components/ui/PasswordToggle'

export function ResetPassword() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const { session, loading: authLoading, updatePassword } = useAuth()
  const navigate = useNavigate()

  // Capture initial hash on first mount — Supabase parses & clears it as it sets the session.
  const hadRecoveryHashRef = useRef(
    typeof window !== 'undefined' &&
      (window.location.hash.includes('access_token') ||
        window.location.hash.includes('type=recovery')),
  )

  useEffect(() => {
    if (authLoading) return
    if (session) return
    if (!hadRecoveryHashRef.current) {
      setIsExpired(true)
    }
  }, [authLoading, session])

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm()

  const password = watch('password')

  const onSubmit = async (data) => {
    setError('')
    setIsLoading(true)
    const { error: updateError } = await updatePassword(data.password)
    setIsLoading(false)
    if (updateError) {
      setError(updateError.message || 'Failed to update password. Please try again.')
      return
    }
    navigate('/dashboard')
  }

  const renderToggle = (visible, setVisible) => (
    <PasswordToggle visible={visible} onClick={() => setVisible((s) => !s)} />
  )

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
          <p className="text-text-secondary font-body">Choose a new password</p>
        </div>

        <Card>
          {isExpired ? (
            <div className="text-center">
              <h2 className="text-2xl font-display font-bold text-text-primary mb-3">
                Link expired
              </h2>
              <p className="text-text-secondary font-body mb-6">
                This password reset link is invalid or has expired. Request a new link.
              </p>
              <Link to="/forgot-password">
                <Button variant="primary" size="md" className="w-full">
                  Request New Link
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-display font-bold text-text-primary mb-6">
                Reset Password
              </h2>

              {error && (
                <div className="mb-4 p-4 bg-error/10 border border-error rounded-xl">
                  <p className="text-error text-sm font-body">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="New Password"
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters',
                    },
                  })}
                  error={errors.password?.message}
                  trailingIcon={renderToggle(showPassword, setShowPassword)}
                />

                <Input
                  label="Confirm Password"
                  type={showConfirm ? 'text' : 'password'}
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (value) =>
                      value === password || 'Passwords do not match',
                  })}
                  error={errors.confirmPassword?.message}
                  trailingIcon={renderToggle(showConfirm, setShowConfirm)}
                />

                <Button type="submit" disabled={isLoading} size="md" className="w-full">
                  {isLoading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
