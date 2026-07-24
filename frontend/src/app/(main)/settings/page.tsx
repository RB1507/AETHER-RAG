'use client'

import * as React from 'react'
import { useAuthStore } from '@/stores/auth.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  User,
  Key,
  Sliders,
  Sparkles,
  Loader2,
  Plus,
  Trash2,
  Copy,
  Check,
  Moon,
  Sun,
  Laptop,
  ShieldQuestion,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { slideUp } from '@/lib/animations'
import { SECURITY_QUESTIONS } from '@/constants/security-questions'
import apiClient from '@/lib/api-client'

interface ApiKey {
  id: string
  name: string
  key: string
  createdAt: string
}

export default function SettingsPage() {
  const { user, setUser } = useAuthStore()
  const { streamingSpeed, setStreamingSpeed } = useWorkspaceStore()
  const { theme, setTheme } = useTheme()

  const [activeTab, setActiveTab] = React.useState('profile')
  const [profileName, setProfileName] = React.useState(user?.name || '')
  const [profileEmail, setProfileEmail] = React.useState(user?.email || '')
  const [isSavingProfile, setIsSavingProfile] = React.useState(false)

  // Security question (offline password recovery)
  const [currentQuestion, setCurrentQuestion] = React.useState<string | null>(null)
  const [secQuestion, setSecQuestion] = React.useState('')
  const [secAnswer, setSecAnswer] = React.useState('')
  const [secCurrentPassword, setSecCurrentPassword] = React.useState('')
  const [isSavingSecurity, setIsSavingSecurity] = React.useState(false)

  // Load the account's currently-set security question (public lookup by email).
  React.useEffect(() => {
    if (!user?.email) return
    fetch(`/api/auth/security-question?email=${encodeURIComponent(user.email)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setCurrentQuestion(d?.securityQuestion ?? null))
      .catch(() => {})
  }, [user?.email])

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!secQuestion || secAnswer.trim().length < 2 || !secCurrentPassword) {
      toast.error('Choose a question, enter an answer, and confirm your current password.')
      return
    }
    setIsSavingSecurity(true)
    try {
      const res = await apiClient.put<{ securityQuestion: string | null }>(
        '/settings/security-question',
        {
          current_password: secCurrentPassword,
          security_question: secQuestion,
          security_answer: secAnswer,
        }
      )
      setCurrentQuestion(res.securityQuestion ?? secQuestion)
      setSecAnswer('')
      setSecCurrentPassword('')
      toast.success('Security question updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update security question')
    } finally {
      setIsSavingSecurity(false)
    }
  }

  // API keys state
  const [apiKeys, setApiKeys] = React.useState<ApiKey[]>(() => [
    {
      id: 'key_1',
      name: 'Development Groundings Key',
      key: 'sk_aether_4a8bc9••••••••••••••4e81',
      createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ])
  const [newKeyName, setNewKeyName] = React.useState('')
  const [copiedKeyId, setCopiedKeyId] = React.useState<string | null>(null)

  // Real OpenRouter key via the Electron desktop bridge (no key is bundled).
  const isDesktop = typeof window !== 'undefined' && !!window.aetherRAG
  const [openRouterKey, setOpenRouterKey] = React.useState('')
  const [isSavingKey, setIsSavingKey] = React.useState(false)
  const [keyConfigured, setKeyConfigured] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    window.aetherRAG
      ?.getApiKeyStatus()
      .then((s) => setKeyConfigured(s.configured))
      .catch(() => {})
  }, [])

  const handleSaveOpenRouterKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!window.aetherRAG) {
      toast.error('API key entry is only available in the desktop app.')
      return
    }
    setIsSavingKey(true)
    try {
      const res = await window.aetherRAG.setApiKey(openRouterKey)
      if (res.ok) {
        toast.success('OpenRouter key saved. The backend is restarting…')
        setKeyConfigured(true)
        setOpenRouterKey('')
      } else {
        toast.error(res.error || 'Failed to save key.')
      }
    } finally {
      setIsSavingKey(false)
    }
  }

  // Model parameters (Simulated)
  const [temperature, setTemperature] = React.useState(0.7)

  // Save profile updates
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileName.trim() || !profileEmail.trim() || !user) return

    setIsSavingProfile(true)
    await new Promise((r) => setTimeout(r, 600)) // simulate latency
    
    setUser({
      ...user,
      name: profileName,
      email: profileEmail,
    })
    setIsSavingProfile(false)
    toast.success('Profile updated successfully')
  }

  // Generate mock API Key
  const handleCreateApiKey = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newKeyName.trim()) return

    const randomHex = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
    const secretKey = `sk_aether_${randomHex.slice(0, 6)}••••••••••••••${randomHex.slice(12)}`

    const newKey: ApiKey = {
      id: `key_${Math.random().toString(36).substr(2, 9)}`,
      name: newKeyName,
      key: secretKey,
      createdAt: new Date().toISOString(),
    }

    setApiKeys((prev) => [...prev, newKey])
    setNewKeyName('')
    toast.success(`Generated API Key: ${newKey.name}`)
  }

  // Revoke API Key
  const handleRevokeKey = (id: string) => {
    if (confirm('Are you sure you want to revoke this API key? Apps using it will fail.')) {
      setApiKeys((prev) => prev.filter((k) => k.id !== id))
      toast.success('API key revoked')
    }
  }

  // Copy API key to clipboard simulation
  const handleCopyKey = (key: ApiKey) => {
    navigator.clipboard.writeText(`sk_aether_mock_full_key_${key.id}`)
    setCopiedKeyId(key.id)
    toast.success('API key copied to clipboard')
    setTimeout(() => setCopiedKeyId(null), 2000)
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="border-b border-border/50 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">System Settings</h1>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Manage your account profile, configure API integration credentials, and personalize chat layouts.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 w-full max-w-md bg-muted/65 p-1 rounded-xl">
          <TabsTrigger value="profile" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="apikeys" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2">
            <Key className="h-4 w-4" />
            API Credentials
          </TabsTrigger>
          <TabsTrigger value="preferences" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2">
            <Sliders className="h-4 w-4" />
            Preferences
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Profile */}
        <TabsContent value="profile">
          <motion.div variants={slideUp} initial="initial" animate="animate" className="space-y-6">
            <form onSubmit={handleSaveProfile}>
              <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Profile Details</CardTitle>
                  <CardDescription className="text-[10px]">
                    Manage your personal account credentials and plan settings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Full Name</label>
                    <Input
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      disabled={isSavingProfile}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Email Address</label>
                    <Input
                      type="email"
                      value={profileEmail}
                      onChange={(e) => setProfileEmail(e.target.value)}
                      disabled={isSavingProfile}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary"
                    />
                  </div>
                  
                  {/* Account Plan Tier */}
                  <div className="border border-border/60 bg-muted/20 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-text-primary">Subscription Plan</h4>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        Upgrade plan for unlimited index storage and faster model rates.
                      </p>
                    </div>
                    <span className="px-3 py-1.5 bg-brand-primary/10 text-brand-primary border border-brand-primary/15 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">
                      {user?.plan} Account
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="border-t border-border/50 py-3 flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSavingProfile}
                    className="bg-brand-primary text-white hover:bg-brand-primary/95 text-xs h-9 rounded-lg px-4"
                  >
                    {isSavingProfile ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>

            {/* Security question — used for offline password recovery */}
            <form onSubmit={handleSaveSecurity}>
              <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <ShieldQuestion className="h-4 w-4 text-brand-primary" />
                    Security Question
                    <span
                      className={cn(
                        'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border',
                        currentQuestion
                          ? 'bg-success/10 text-success border-success/20'
                          : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      )}
                    >
                      {currentQuestion ? 'Set' : 'Not set'}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-[10px]">
                    Used to verify it's you when resetting a forgotten password. Changing it
                    requires your current password.
                    {currentQuestion && (
                      <>
                        {' '}Current question: <span className="text-text-secondary">“{currentQuestion}”</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Security Question</label>
                    <select
                      value={secQuestion}
                      onChange={(e) => setSecQuestion(e.target.value)}
                      disabled={isSavingSecurity}
                      className="w-full h-10 px-3 rounded-md bg-transparent border border-border text-xs text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary disabled:opacity-50"
                    >
                      <option value="" disabled>
                        Choose a question…
                      </option>
                      {SECURITY_QUESTIONS.map((q) => (
                        <option key={q} value={q}>
                          {q}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Your Answer</label>
                    <Input
                      value={secAnswer}
                      onChange={(e) => setSecAnswer(e.target.value)}
                      placeholder="Remember this — you'll need it to reset your password"
                      disabled={isSavingSecurity}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Current Password</label>
                    <Input
                      type="password"
                      value={secCurrentPassword}
                      onChange={(e) => setSecCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={isSavingSecurity}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary"
                    />
                  </div>
                </CardContent>
                <CardFooter className="border-t border-border/50 py-3 flex justify-end">
                  <Button
                    type="submit"
                    disabled={isSavingSecurity}
                    className="bg-brand-primary text-white hover:bg-brand-primary/95 text-xs h-9 rounded-lg px-4"
                  >
                    {isSavingSecurity ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </span>
                    ) : currentQuestion ? (
                      'Update Security Question'
                    ) : (
                      'Set Security Question'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </motion.div>
        </TabsContent>

        {/* Tab 2: API Keys */}
        <TabsContent value="apikeys">
          <motion.div variants={slideUp} initial="initial" animate="animate" className="space-y-6">
            {/* OpenRouter key — the real credential used to generate answers */}
            <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  OpenRouter API Key
                  {keyConfigured && (
                    <span className="px-2 py-0.5 bg-success/10 text-success border border-success/20 rounded-full text-[9px] font-bold uppercase tracking-wider">
                      Configured
                    </span>
                  )}
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Required to generate answers. Get a free key at openrouter.ai/keys — it is stored
                  locally on this device and never bundled into the app.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveOpenRouterKey} className="flex gap-2 items-end max-w-lg">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Key</label>
                    <Input
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={openRouterKey}
                      onChange={(e) => setOpenRouterKey(e.target.value)}
                      disabled={isSavingKey || !isDesktop}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary font-mono"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={isSavingKey || !openRouterKey || !isDesktop}
                    className="bg-brand-primary text-white hover:bg-brand-primary/95 text-xs h-10 rounded-lg shrink-0 px-4"
                  >
                    {isSavingKey ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Saving...
                      </span>
                    ) : (
                      'Save Key'
                    )}
                  </Button>
                </form>
                {!isDesktop && (
                  <p className="mt-3 text-[10px] text-text-muted">
                    Key entry is available in the desktop app. In dev, set{' '}
                    <code className="font-mono">OPENROUTER_API_KEY</code> in{' '}
                    <code className="font-mono">backend/.env</code>.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Generate Key */}
            <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold">API Access Tokens</CardTitle>
                <CardDescription className="text-[10px]">
                  Generate system keys to query vector grounding datasets directly from outside CLI tools.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateApiKey} className="flex gap-2 items-end max-w-lg">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Token Name</label>
                    <Input
                      placeholder="Dev, Staging server..."
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      required
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="bg-brand-primary text-white hover:bg-brand-primary/95 text-xs h-10 rounded-lg shrink-0 px-4"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Generate Key
                  </Button>
                </form>

                {/* API Key List */}
                <div className="mt-6 space-y-2 border-t border-border/50 pt-6">
                  <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-wider mb-2">
                    Active API Credentials
                  </h4>
                  {apiKeys.length === 0 ? (
                    <div className="text-center py-6 text-text-muted text-xs border border-dashed border-border/55 rounded-xl">
                      No API credentials generated yet
                    </div>
                  ) : (
                    apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-border/55 bg-surface-primary/30"
                      >
                        <div className="min-w-0 space-y-1 leading-tight text-left">
                          <p className="text-xs font-semibold text-text-primary truncate">
                            {key.name}
                          </p>
                          <p className="text-[10px] text-text-muted flex gap-2 font-mono">
                            <span>{key.key}</span>
                            <span>•</span>
                            <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-4">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyKey(key)}
                            className="hover:bg-muted rounded-lg h-8 w-8 text-text-muted"
                            title="Copy Key"
                          >
                            {copiedKeyId === key.id ? (
                              <Check className="h-4 w-4 text-success" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevokeKey(key.id)}
                            className="hover:bg-danger/10 hover:text-danger rounded-lg h-8 w-8 text-text-muted"
                            title="Revoke Key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>

        {/* Tab 3: Preferences */}
        <TabsContent value="preferences">
          <motion.div variants={slideUp} initial="initial" animate="animate" className="space-y-6">
            <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold">Preferences Panel</CardTitle>
                <CardDescription className="text-[10px]">
                  Personalize your theme, typing speed, and model settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* 1. Theme Preferences */}
                <div className="space-y-2 text-left">
                  <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                    Interface Theme
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'light', name: 'Light Mode', icon: Sun },
                      { id: 'dark', name: 'Dark Mode', icon: Moon },
                      { id: 'system', name: 'System Default', icon: Laptop },
                    ].map((t) => {
                      const Icon = t.icon
                      const isActive = theme === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setTheme(t.id)}
                          className={cn(
                            'flex items-center justify-center gap-2 py-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer',
                            isActive
                              ? 'border-brand-primary bg-brand-primary/5 text-brand-primary shadow-xs'
                              : 'border-border bg-surface-primary/30 text-text-secondary hover:bg-muted/40'
                          )}
                        >
                          <Icon className="h-4.5 w-4.5 shrink-0" />
                          {t.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 2. Typing speed preference */}
                <div className="space-y-2 border-t border-border/50 pt-5 text-left">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                      Chat Ingestion Speeds
                    </h4>
                    <span className="text-[10px] font-semibold text-brand-primary uppercase bg-brand-primary/10 px-2 py-0.5 rounded">
                      {streamingSpeed} speed
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'slow', label: 'Slow (Ingest)', note: '80ms latency' },
                      { id: 'normal', label: 'Normal (Fast)', note: '30ms latency' },
                      { id: 'fast', label: 'Immediate', note: '10ms latency' },
                    ].map((sp) => {
                      const isActive = streamingSpeed === sp.id
                      return (
                        <button
                          key={sp.id}
                          type="button"
                          onClick={() => setStreamingSpeed(sp.id as 'slow' | 'normal' | 'fast')}
                          className={cn(
                            'flex flex-col items-center justify-center py-2.5 rounded-xl border cursor-pointer transition-all',
                            isActive
                              ? 'border-brand-primary bg-brand-primary/5 text-brand-primary'
                              : 'border-border bg-surface-primary/30 text-text-secondary hover:bg-muted/40'
                          )}
                        >
                          <span className="text-xs font-semibold">{sp.label}</span>
                          <span className="text-[9px] text-text-muted mt-0.5">{sp.note}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 3. Model Parameters (Simulated slider) */}
                <div className="space-y-2 border-t border-border/50 pt-5 text-left">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                      Model Temperature (Creativity)
                    </h4>
                    <span className="text-xs font-semibold text-text-primary font-mono">{temperature}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="flex-1 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-brand-primary"
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-text-muted font-bold uppercase">
                    <span>Precise (0.0)</span>
                    <span>Creative (1.0)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
