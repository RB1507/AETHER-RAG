import { create } from 'zustand'
import { User } from '@/types'
import { APP_CONFIG } from '@/constants/config'

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  login: (user: User, accessToken: string, refreshToken: string) => void
  logout: () => void
  setUser: (user: User) => void
  setAccessToken: (accessToken: string) => void
}

const getInitialState = () => {
  if (typeof window === 'undefined') {
    return { user: null, accessToken: null, isAuthenticated: false }
  }

  // Require a fresh login on every app launch. sessionStorage is empty on each
  // new app start (Electron spawns a fresh renderer) but survives in-app
  // navigation/refresh, so we clear the stored session exactly once per launch.
  // Saved credentials for autofill (aether_saved_*) live in localStorage and
  // are intentionally preserved here.
  if (!sessionStorage.getItem('aether_session_active')) {
    sessionStorage.setItem('aether_session_active', '1')
    localStorage.removeItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY)
    localStorage.removeItem(APP_CONFIG.AUTH.REFRESH_TOKEN_KEY)
    localStorage.removeItem('aether_user')
    document.cookie =
      'aether_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
    return { user: null, accessToken: null, isAuthenticated: false }
  }

  const accessToken = localStorage.getItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY)
  const userJson = localStorage.getItem('aether_user')
  let user: User | null = null

  if (userJson) {
    try {
      user = JSON.parse(userJson)
    } catch {
      localStorage.removeItem('aether_user')
    }
  }

  return {
    user,
    accessToken,
    isAuthenticated: !!accessToken,
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...getInitialState(),

  login: (user, accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY, accessToken)
      localStorage.setItem(APP_CONFIG.AUTH.REFRESH_TOKEN_KEY, refreshToken)
      localStorage.setItem('aether_user', JSON.stringify(user))

      // Set cookie for middleware route protection
      document.cookie = `aether_authenticated=true; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`
    }

    set({ user, accessToken, isAuthenticated: true })
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY)
      localStorage.removeItem(APP_CONFIG.AUTH.REFRESH_TOKEN_KEY)
      localStorage.removeItem('aether_user')

      // Clear cookie
      document.cookie = 'aether_authenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
    }

    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  setUser: (user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('aether_user', JSON.stringify(user))
    }
    set({ user })
  },

  // Sync a silently-refreshed access token into memory (the api client also
  // writes it to localStorage). Keeps store-driven callers using a live token.
  setAccessToken: (accessToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(APP_CONFIG.AUTH.ACCESS_TOKEN_KEY, accessToken)
    }
    set({ accessToken, isAuthenticated: true })
  },
}))
