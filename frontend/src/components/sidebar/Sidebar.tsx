'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useWorkspaceStore } from '@/stores/workspace.store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/common/UserAvatar'
import {
  MessageSquare,
  FolderOpen,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  ChevronDown,
  Layers,
  Check,
} from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandMark'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/constants/routes'

interface SidebarProps {
  className?: string
  onCloseMobile?: () => void
}

export function Sidebar({ className, onCloseMobile }: SidebarProps) {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    fetchWorkspaces,
    addWorkspace,
  } = useWorkspaceStore()

  const [newWsName, setNewWsName] = React.useState('')
  const [newWsDesc, setNewWsDesc] = React.useState('')
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)

  React.useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  const activeWorkspace = React.useMemo(() => {
    return workspaces.find((w) => w.id === selectedWorkspaceId) || null
  }, [workspaces, selectedWorkspaceId])

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWsName.trim()) return
    try {
      await addWorkspace(newWsName, newWsDesc)
      setNewWsName('')
      setNewWsDesc('')
      setIsDialogOpen(false)
    } catch (err) {
      console.error('Failed to create workspace:', err)
    }
  }

  const navItems = [
    { label: 'AI Chat', href: ROUTES.MAIN.CHAT, icon: MessageSquare },
    { label: 'Documents', href: ROUTES.MAIN.WORKSPACE, icon: FolderOpen },
    { label: 'Analytics', href: ROUTES.MAIN.DASHBOARD, icon: BarChart3 },
    { label: 'Settings', href: ROUTES.MAIN.SETTINGS, icon: Settings },
  ]

  return (
    <div
      className={cn(
        'flex h-full w-64 flex-col border-r border-border/60 bg-surface-primary/80 dark:bg-card/45 backdrop-blur-md px-4 py-6 text-text-primary',
        className
      )}
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white shadow-md shadow-brand-primary/20">
          <BrandMark className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold text-sm leading-none tracking-tight">AETHER RAG</h2>
          <span className="text-[10px] text-text-muted">v0.1.1 • Beta</span>
        </div>
      </div>

      {/* Workspace Switcher */}
      <div className="mb-6 px-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="w-full h-11 justify-between px-3 bg-transparent border-border hover:bg-muted/50 rounded-xl"
              >
                <div className="flex items-center gap-2.5 text-left overflow-hidden">
                  <Layers className="h-4.5 w-4.5 text-brand-primary shrink-0" />
                  <div className="truncate leading-tight">
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {activeWorkspace ? activeWorkspace.name : 'Select Workspace'}
                    </p>
                    <p className="text-[10px] text-text-muted truncate">
                      {activeWorkspace ? `${activeWorkspace.documentCount} documents` : 'No workspace'}
                    </p>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-text-muted shrink-0 ml-1" />
              </Button>
            }
          />
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-text-muted">Workspaces</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.map((ws) => (
                <DropdownMenuItem
                  key={ws.id}
                  onClick={() => {
                    setSelectedWorkspaceId(ws.id)
                    if (onCloseMobile) onCloseMobile()
                  }}
                  className="flex items-center justify-between py-2 rounded-lg"
                >
                  <div className="flex flex-col max-w-[150px] overflow-hidden">
                    <span className="font-medium text-xs truncate">{ws.name}</span>
                    <span className="text-[10px] text-text-muted truncate">
                      {ws.documentCount} files
                    </span>
                  </div>
                  {selectedWorkspaceId === ws.id && (
                    <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />

              {/* Create Workspace Trigger */}
              <DropdownMenuItem
                closeOnClick={false}
                onClick={() => {
                  setIsDialogOpen(true)
                }}
                className="flex items-center gap-2 py-2 text-brand-primary font-medium focus:text-brand-primary rounded-lg cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span className="text-xs">Create Workspace</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 space-y-1.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-primary/10 text-brand-primary shadow-sm shadow-brand-primary/5'
                  : 'text-text-secondary hover:bg-muted/50 hover:text-text-primary'
              )}
            >
              <item.icon
                className={cn(
                  'h-5 w-5',
                  isActive ? 'text-brand-primary' : 'text-text-muted group-hover:text-text-secondary'
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Workspace Creation Dialog (Inline HTML/DOM style to avoid shadcn full dialog dependency block) */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-surface-primary dark:bg-card p-6 shadow-2xl">
            <h3 className="text-base font-bold text-text-primary mb-1">Create New Workspace</h3>
            <p className="text-xs text-text-muted mb-4">
              Add a workspace to categorize documents and chat conversations.
            </p>
            <form onSubmit={handleCreateWorkspace} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                  Workspace Name
                </label>
                <Input
                  required
                  placeholder="Engineering Specs, Legal Records..."
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                  Description (Optional)
                </label>
                <Input
                  placeholder="Workspace notes or contents summary..."
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDialogOpen(false)}
                  className="text-xs h-9 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-brand-primary text-white hover:bg-brand-primary/95 text-xs h-9 rounded-lg"
                >
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User profile avatar and logout */}
      {user && (
        <div className="border-t border-border/50 pt-4 mt-auto flex flex-col gap-3">
          <div className="flex items-center gap-3 px-2">
            <UserAvatar name={user.name} size="sm" />
            <div className="truncate leading-tight flex-1">
              <p className="text-xs font-bold text-text-primary truncate">{user.name}</p>
              <span className="text-[10px] font-medium text-brand-primary uppercase tracking-wide">
                {user.plan} account
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="text-text-muted hover:text-danger transition-colors p-1"
              title="Log Out"
            >
              <LogOut className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
