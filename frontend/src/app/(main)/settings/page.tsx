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
  Trash2,
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

// Presets fill the OpenAI-compatible endpoint for popular providers so users
// only paste a key + model. Gemini and Anthropic are reached via their
// official OpenAI-compatibility endpoints. Base URL stays editable.
const LLM_PRESETS: Record<string, { label: string; baseUrl: string; modelHint: string }> = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    modelHint: 'gemini-2.5-flash',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com/v1',
    modelHint: 'claude-3-5-sonnet-latest',
  },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelHint: 'gpt-4o-mini' },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    modelHint: 'llama-3.3-70b-versatile',
  },
  custom: { label: 'Other (enter URL)', baseUrl: '', modelHint: 'model-id' },
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

  // Real OpenRouter key via the Electron desktop bridge (no key is bundled).
  const isDesktop = typeof window !== 'undefined' && !!window.aetherRAG
  const [openRouterKey, setOpenRouterKey] = React.useState('')
  const [isSavingKey, setIsSavingKey] = React.useState(false)
  const [keyConfigured, setKeyConfigured] = React.useState<boolean | null>(null)

  // Custom OpenAI-compatible providers (bring your own key). Any number can be
  // saved; each is addressed as custom:<id>.
  const [customPreset, setCustomPreset] = React.useState('gemini')
  const [customBaseUrl, setCustomBaseUrl] = React.useState(LLM_PRESETS.gemini.baseUrl)
  const [customApiKey, setCustomApiKey] = React.useState('')
  const [customModel, setCustomModel] = React.useState('')
  const [isSavingCustom, setIsSavingCustom] = React.useState(false)
  const [savedProviders, setSavedProviders] = React.useState<
    { id: string; label: string; model: string }[]
  >([])

  const applyPreset = (id: string) => {
    setCustomPreset(id)
    setCustomBaseUrl(LLM_PRESETS[id].baseUrl)
  }

  const refreshSavedProviders = React.useCallback(async () => {
    try {
      const data = await apiClient.get<{ providers: { id: string; label: string; models: string[] }[] }>(
        '/settings/llm'
      )
      setSavedProviders(
        (data.providers || [])
          .filter((p) => p.id.startsWith('custom:'))
          .map((p) => ({ id: p.id, label: p.label, model: p.models[0] || '' }))
      )
    } catch {
      /* backend down — leave the list empty */
    }
  }, [])

  React.useEffect(() => {
    refreshSavedProviders()
  }, [refreshSavedProviders])

  const handleSaveCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customBaseUrl.trim() || !customApiKey.trim() || !customModel.trim()) {
      toast.error('Base URL, API key and model are all required.')
      return
    }
    setIsSavingCustom(true)
    try {
      const label = customPreset === 'custom' ? 'Custom' : LLM_PRESETS[customPreset].label
      await apiClient.post('/settings/llm/custom', {
        base_url: customBaseUrl,
        api_key: customApiKey,
        model: customModel,
        label,
      })
      setCustomApiKey('')
      setCustomModel('')
      await refreshSavedProviders()
      toast.success(`Added ${label} (${customModel}). Pick it from the model menu in chat.`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save provider')
    } finally {
      setIsSavingCustom(false)
    }
  }

  const handleDeleteProvider = async (id: string, label: string) => {
    try {
      await apiClient.delete(`/settings/llm/custom/${id.replace('custom:', '')}`)
      await refreshSavedProviders()
      toast.success(`Removed ${label}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove provider')
    }
  }

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

            {/* Custom OpenAI-compatible provider — use any API key */}
            <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-bold">Bring your own model / API key</CardTitle>
                <CardDescription className="text-[10px]">
                  Use your own key from Google Gemini, Anthropic (Claude), OpenAI, Groq, or any
                  OpenAI-compatible API. Pick a provider, paste your key, enter a model id — then
                  select it from the model menu in chat. Your key is stored locally on this device.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveCustom} className="space-y-3 max-w-lg">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Provider</label>
                    <select
                      value={customPreset}
                      onChange={(e) => applyPreset(e.target.value)}
                      disabled={isSavingCustom}
                      className="w-full h-10 px-3 rounded-md bg-transparent border border-border text-xs text-text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-primary disabled:opacity-50"
                    >
                      {Object.entries(LLM_PRESETS).map(([id, p]) => (
                        <option key={id} value={id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Base URL</label>
                    <Input
                      placeholder="https://api.openai.com/v1"
                      value={customBaseUrl}
                      onChange={(e) => setCustomBaseUrl(e.target.value)}
                      disabled={isSavingCustom}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">API Key</label>
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={customApiKey}
                      onChange={(e) => setCustomApiKey(e.target.value)}
                      disabled={isSavingCustom}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-text-secondary">Model ID</label>
                    <Input
                      placeholder={LLM_PRESETS[customPreset].modelHint}
                      value={customModel}
                      onChange={(e) => setCustomModel(e.target.value)}
                      disabled={isSavingCustom}
                      className="h-10 text-xs bg-transparent border-border focus-visible:ring-brand-primary font-mono"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={isSavingCustom}
                      className="bg-brand-primary text-white hover:bg-brand-primary/95 text-xs h-9 rounded-lg px-4"
                    >
                      {isSavingCustom ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        'Add provider'
                      )}
                    </Button>
                  </div>
                </form>

                {savedProviders.length > 0 && (
                  <div className="mt-6 space-y-2 border-t border-border/50 pt-6">
                    <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-wider mb-2">
                      Saved providers
                    </h4>
                    {savedProviders.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/55 bg-surface-primary/30"
                      >
                        <div className="min-w-0 leading-tight text-left">
                          <p className="text-xs font-semibold text-text-primary truncate">{p.label}</p>
                          <p className="text-[10px] text-text-muted font-mono truncate">{p.model}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteProvider(p.id, p.label)}
                          className="hover:bg-danger/10 hover:text-danger rounded-lg h-8 w-8 text-text-muted shrink-0 ml-4"
                          title="Remove provider"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
