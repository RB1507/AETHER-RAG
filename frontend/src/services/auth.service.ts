import apiClient from '@/lib/api-client'
import { User } from '@/types'

export interface LoginResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface SignupResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export const authService = {
  login: async (credentials: Record<string, string>): Promise<LoginResponse> => {
    return apiClient.post<LoginResponse>('/auth/login', credentials)
  },

  signup: async (data: Record<string, string>): Promise<SignupResponse> => {
    return apiClient.post<SignupResponse>('/auth/signup', data)
  },

  logout: async (): Promise<{ success: boolean }> => {
    return apiClient.post<{ success: boolean }>('/auth/logout', {})
  },
}
export default authService
