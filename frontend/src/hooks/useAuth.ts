import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { authService } from '@/services/auth.service'
import { useAuthStore } from '@/stores/auth.store'
import { ROUTES } from '@/constants/routes'
import { toast } from 'sonner'

export function useAuth() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const loginStore = useAuthStore((state) => state.login)
  const logoutStore = useAuthStore((state) => state.logout)
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const loginMutation = useMutation({
    mutationFn: authService.login,
    onSuccess: (data) => {
      loginStore(data.user, data.accessToken, data.refreshToken)
      toast.success('Successfully logged in')
      router.push(ROUTES.MAIN.CHAT)
      router.refresh()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Login failed')
    },
  })

  const signupMutation = useMutation({
    mutationFn: authService.signup,
    onSuccess: (data) => {
      loginStore(data.user, data.accessToken, data.refreshToken)
      toast.success('Successfully registered!')
      router.push(ROUTES.MAIN.CHAT)
      router.refresh()
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Registration failed')
    },
  })

  const logoutMutation = useMutation({
    mutationFn: authService.logout,
    onSuccess: () => {
      logoutStore()
      queryClient.clear()
      toast.success('Successfully logged out')
      router.push(ROUTES.AUTH.LOGIN)
      router.refresh()
    },
    onError: () => {
      logoutStore()
      queryClient.clear()
      router.push(ROUTES.AUTH.LOGIN)
    },
  })

  return {
    user,
    isAuthenticated,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    signup: signupMutation.mutateAsync,
    isSigningUp: signupMutation.isPending,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  }
}
export default useAuth
