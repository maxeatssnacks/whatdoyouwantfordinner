import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../hooks/useAuth'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PasswordToggle } from '../components/ui/PasswordToggle'

export function Login() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm()

  const onSubmit = async (data) => {
    try {
      setError('')
      setIsLoading(true)
      await signIn(data.email, data.password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to sign in. Please check your credentials.')
    } finally {
      setIsLoading(false)
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
          <p className="text-text-secondary font-body">Welcome back!</p>
        </div>

        <Card>
          <h2 className="text-2xl font-display font-bold text-text-primary mb-6">
            Log In
          </h2>

          {error && (
            <div className="mb-4 p-4 bg-error/10 border border-error rounded-xl">
              <p className="text-error text-sm font-body">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              platform="mobile"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address',
                },
              })}
              error={errors.email?.message}
            />

            <div>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                platform="mobile"
                {...register('password', {
                  required: 'Password is required',
                  minLength: {
                    value: 6,
                    message: 'Password must be at least 6 characters',
                  },
                })}
                error={errors.password?.message}
                trailingIcon={
                  <PasswordToggle visible={showPassword} onClick={() => setShowPassword((s) => !s)} />
                }
              />
              <div className="mt-1.5 text-right">
                <Link to="/forgot-password" className="text-sm text-primary font-semibold hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>

            <Button type="submit" disabled={isLoading} platform="mobile" size="md" className="w-full">
              {isLoading ? 'Logging in...' : 'Log In'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-text-secondary font-body">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary font-semibold hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
