import { NextResponse } from 'next/server'

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000'

export async function POST(request: Request) {
  const url = new URL(request.url)
  const path = url.pathname

  // 1. LOGIN ROUTE
  if (path.endsWith('/api/auth/login')) {
    try {
      const { email, password } = await request.json()

      // Backend uses OAuth2PasswordRequestForm (form-data with username/password)
      const formData = new URLSearchParams()
      formData.append('username', email)
      formData.append('password', password)

      const backendResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })

      if (backendResponse.ok) {
        const data = await backendResponse.json()
        // Backend returns: { access_token, token_type }
        // Frontend expects: { user, accessToken, refreshToken }
        return NextResponse.json({
          user: {
            id: 'usr_backend',
            name: email.split('@')[0],
            email: email,
            plan: 'pro',
            createdAt: new Date().toISOString(),
          },
          accessToken: data.access_token,
          refreshToken: data.refresh_token ?? data.access_token,
        })
      } else {
        const errorData = await backendResponse.json().catch(() => ({}))
        return NextResponse.json(
          { message: errorData.detail || 'Invalid email or password' },
          { status: backendResponse.status }
        )
      }
    } catch (backendError) {
      console.warn('Backend auth not available:', backendError)
      return NextResponse.json(
        { message: 'Authentication service unavailable. Ensure backend is running.' },
        { status: 503 }
      )
    }
  }

  // 2. SIGNUP ROUTE
  if (path.endsWith('/api/auth/signup')) {
    try {
      const { name, email, password } = await request.json()
      if (!email || !password) {
        return NextResponse.json({ message: 'Email and password are required' }, { status: 400 })
      }

      // Register with backend
      const registerResponse = await fetch(`${BACKEND_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!registerResponse.ok) {
        const errorData = await registerResponse.json().catch(() => ({}))
        return NextResponse.json(
          { message: errorData.detail || 'Registration failed' },
          { status: registerResponse.status }
        )
      }

      // Auto-login after registration
      const formData = new URLSearchParams()
      formData.append('username', email)
      formData.append('password', password)

      const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      })

      if (loginResponse.ok) {
        const loginData = await loginResponse.json()
        return NextResponse.json({
          user: {
            id: `usr_${Math.random().toString(36).substr(2, 9)}`,
            name: name || email.split('@')[0],
            email,
            plan: 'free',
            createdAt: new Date().toISOString(),
          },
          accessToken: loginData.access_token,
          refreshToken: loginData.refresh_token ?? loginData.access_token,
        })
      }

      // Registration succeeded but auto-login failed
      return NextResponse.json({
        user: {
          id: `usr_${Math.random().toString(36).substr(2, 9)}`,
          name: name || email.split('@')[0],
          email,
          plan: 'free',
          createdAt: new Date().toISOString(),
        },
        accessToken: 'pending_login',
        refreshToken: 'pending_login',
      })
    } catch (backendError) {
      console.warn('Backend signup not available:', backendError)
      return NextResponse.json(
        { message: 'Registration service unavailable. Ensure backend is running.' },
        { status: 503 }
      )
    }
  }

  // 3. REFRESH ROUTE — exchange a refresh token for a fresh access token.
  if (path.endsWith('/api/auth/refresh')) {
    try {
      const { refreshToken } = await request.json()
      if (!refreshToken) {
        return NextResponse.json({ message: 'Token is required' }, { status: 401 })
      }

      const backendResponse = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (!backendResponse.ok) {
        // Refresh token expired/invalid — client should send the user to login.
        return NextResponse.json({ message: 'Session expired' }, { status: 401 })
      }

      const data = await backendResponse.json()
      return NextResponse.json({ accessToken: data.access_token })
    } catch (backendError) {
      console.warn('Backend refresh not available:', backendError)
      return NextResponse.json({ message: 'Bad request' }, { status: 400 })
    }
  }

  // 4. LOGOUT ROUTE
  if (path.endsWith('/api/auth/logout')) {
    return NextResponse.json({ success: true })
  }

  // 5. RESET PASSWORD ROUTE — local direct reset (no email link; the desktop
  // app has no mail server, so the owner sets a new password directly).
  if (path.endsWith('/api/auth/reset-password')) {
    try {
      const { email, password } = await request.json()
      if (!email || !password) {
        return NextResponse.json(
          { message: 'Email and new password are required' },
          { status: 400 }
        )
      }

      const backendResponse = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, new_password: password }),
      })

      if (!backendResponse.ok) {
        const errorData = await backendResponse.json().catch(() => ({}))
        return NextResponse.json(
          { message: errorData.detail || 'Password reset failed' },
          { status: backendResponse.status }
        )
      }

      return NextResponse.json({ success: true })
    } catch (backendError) {
      console.warn('Backend reset not available:', backendError)
      return NextResponse.json(
        { message: 'Password reset service unavailable. Ensure backend is running.' },
        { status: 503 }
      )
    }
  }

  return NextResponse.json({ message: 'Not Found' }, { status: 404 })
}

// Support other methods with 405
export async function GET() {
  return NextResponse.json({ message: 'Method Not Allowed' }, { status: 405 })
}
