import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PasswordToggle } from '../components/ui/PasswordToggle'

export function Signup() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm()

  const password = watch('password')

  const onSubmit = async (data) => {
    try {
      setError('')
      setIsLoading(true)
      await signUp(data.email, data.password, data.displayName)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to create account. Please try again.')
    } finally {
      setIsLoading(false)
    }
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
          <p className="text-text-secondary font-body">Create your free account</p>
        </div>

        <Card>
          <h2 className="text-2xl font-display font-bold text-text-primary mb-6">
            Sign Up
          </h2>

          {error && (
            <div className="mb-4 p-4 bg-error/10 border border-error rounded-xl">
              <p className="text-error text-sm font-body">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Display Name"
              placeholder="e.g. Max"
              {...register('displayName', {
                required: 'Display name is required',
              })}
              error={errors.displayName?.message}
            />

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

            <Input
              label="Password"
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
              {isLoading ? 'Creating account...' : 'Sign Up'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-secondary font-body">
              Already have an account?{' '}
              <Link to="/login" className="text-primary font-semibold hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
