'use client'

import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'
import { Sparkles, ChevronDown, Check, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

interface ProviderInfo {
  id: string
  label: string
  models: string[]
  available: boolean
  hasKey: boolean
}
interface LlmSettings {
  provider: string
  model: string
  providers: ProviderInfo[]
}

/**
 * Chat-header model picker. Lists each provider (Mistral / OpenRouter / Ollama)
 * and its models; selecting one switches the backend live (no restart).
 * Providers without a configured key (or Ollama not running) are disabled.
 */
export function ModelSelector() {
  const queryClient = useQueryClient()
  const [data, setData] = React.useState<LlmSettings | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    apiClient
      .get<LlmSettings>('/settings/llm')
      .then(setData)
      .catch(() => {}) // silent: the read-only label just stays "Model"
  }, [])

  const select = async (provider: string, model: string) => {
    if (saving || (data?.provider === provider && data?.model === model)) return
    setSaving(true)
    try {
      await apiClient.post('/settings/llm', { provider, model })
      setData((d) => (d ? { ...d, provider, model } : d))
      // Refresh the answer-bubble label (chat page reads the same source).
      queryClient.invalidateQueries({ queryKey: ['llm-selection'] })
      toast.success(`Model switched to ${model}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not switch model')
    } finally {
      setSaving(false)
    }
  }

  const currentLabel = data?.model ?? 'Model'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            className="flex items-center gap-1.5 text-xs font-medium text-text-secondary bg-surface-primary dark:bg-card border border-border/80 rounded-lg h-8 px-2.5 hover:border-brand-primary/50 transition-colors outline-none"
            title="Choose the AI model / provider"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 text-brand-primary shrink-0 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-brand-primary shrink-0" />
            )}
            <span className="truncate max-w-[180px]">{currentLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 text-text-muted shrink-0" />
          </button>
        }
      />

      <DropdownMenuContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
        {!data && <div className="px-2 py-2 text-xs text-text-muted">Loading models…</div>}
        {data?.providers.map((p, idx) => (
          <DropdownMenuGroup key={p.id}>
            {idx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>{p.label}</span>
              {!p.available && (
                <span className="text-[10px] font-normal text-text-muted">
                  {p.id === 'ollama' ? 'not running' : 'no API key'}
                </span>
              )}
            </DropdownMenuLabel>
            {p.models.length === 0 ? (
              <div className="px-2 py-1 text-[11px] text-text-muted">
                {p.id === 'ollama' ? 'Start Ollama to see models' : 'No models'}
              </div>
            ) : (
              p.models.map((m) => {
                const active = data.provider === p.id && data.model === m
                return (
                  <DropdownMenuItem
                    key={`${p.id}:${m}`}
                    disabled={!p.available}
                    onClick={() => select(p.id, m)}
                    className="justify-between"
                  >
                    <span className="truncate">{m}</span>
                    {active && <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />}
                  </DropdownMenuItem>
                )
              })
            )}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
