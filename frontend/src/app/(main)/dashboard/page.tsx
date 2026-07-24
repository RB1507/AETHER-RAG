'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { AnalyticsData } from '@/types'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Activity,
  Cpu,
  FileText,
  Clock,
  Loader2,
  TrendingUp,
  BarChart3,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { motion } from 'framer-motion'
import { slideUp } from '@/lib/animations'

export default function DashboardPage() {
  const [isMounted, setIsMounted] = React.useState(false)

  React.useEffect(() => {
    setIsMounted(true)
  }, [])

  // Fetch analytics data
  const { data: analytics, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => apiClient.get<AnalyticsData>('/analytics'),
  })

  if (isLoading || !isMounted) {
    return (
      <div className="flex h-[calc(100vh-4rem)] md:h-screen w-full items-center justify-center bg-surface-secondary dark:bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary mx-auto mb-3" />
          <span className="text-xs text-text-muted">Loading metrics...</span>
        </div>
      </div>
    )
  }

  const kpis = [
    {
      title: 'Total Queries',
      value: analytics?.totalQueries.toLocaleString() || '0',
      description: 'Conversational queries processed',
      icon: Activity,
      colorClass: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      title: 'Tokens Processed',
      value: analytics?.totalTokens.toLocaleString() || '0',
      description: 'Input & output tokens calculated',
      icon: Cpu,
      colorClass: 'text-brand-primary bg-brand-primary/10',
    },
    {
      title: 'Grounding Files',
      value: analytics?.totalDocuments.toLocaleString() || '0',
      description: 'Vectorized database files',
      icon: FileText,
      colorClass: 'text-indigo-500 bg-indigo-500/10',
    },
    {
      title: 'Avg Response Time',
      value: `${analytics?.avgResponseTime || 0} ms`,
      description: 'Semantic vector loop latency',
      icon: Clock,
      colorClass: 'text-amber-500 bg-amber-500/10',
    },
  ]

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-border/50 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">System Analytics</h1>
        <p className="text-xs text-text-muted mt-1 leading-relaxed">
          Monitor your RAG search indices, token consumption, latency, and matching grounding documents.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, idx) => (
          <motion.div
            key={kpi.title}
            variants={slideUp}
            initial="initial"
            animate="animate"
            transition={{ delay: idx * 0.05 }}
          >
            <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                  {kpi.title}
                </CardTitle>
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${kpi.colorClass}`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-extrabold tracking-tight text-text-primary">
                  {kpi.value}
                </div>
                <p className="text-[10px] text-text-muted mt-1 truncate">
                  {kpi.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Token and query area graph */}
        <motion.div
          variants={slideUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="h-4.5 w-4.5 text-brand-primary" />
                Usage Timeline
              </CardTitle>
              <CardDescription className="text-[10px]">
                Daily query traffic and token compute charts.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={analytics?.dailyUsage || []}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/40" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9 }}
                    className="fill-text-muted"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9 }}
                    className="fill-text-muted"
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                    labelClassName="font-bold text-text-primary"
                  />
                  <Area
                    name="Tokens"
                    type="monotone"
                    dataKey="tokens"
                    stroke="var(--brand-primary)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTokens)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Documents Bar Chart */}
        <motion.div
          variants={slideUp}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.25 }}
          className="lg:col-span-1"
        >
          <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4.5 w-4.5 text-indigo-500" />
                Query Groundings
              </CardTitle>
              <CardDescription className="text-[10px]">
                Grounding documents citation matches.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-64 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics?.topDocuments.slice(0, 4) || []}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} className="fill-text-muted" tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 9 }}
                    className="fill-text-muted font-medium"
                    width={70}
                    tickFormatter={(val) => (val.length > 10 ? `${val.substring(0, 10)}...` : val)}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--surface-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '12px',
                      fontSize: '11px',
                    }}
                    labelClassName="font-bold text-text-primary"
                  />
                  <Bar
                    name="Matches"
                    dataKey="queryCount"
                    fill="oklch(0.705 0.19 267.261)" // Indigo brand matching
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Usage summary message */}
      <Card className="border border-brand-primary/10 bg-brand-primary/5 rounded-2xl">
        <CardContent className="flex items-center gap-4 py-4">
          <div className="h-10 w-10 bg-brand-primary/10 rounded-xl flex items-center justify-center text-brand-primary shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-text-primary">Monthly Compute Efficiency</h4>
            <p className="text-[10px] text-text-secondary leading-normal mt-0.5">
              Vector ingestion and semantic grounding query matching runs under an average latency of{' '}
              {analytics?.avgResponseTime}ms. Tokens consumed this week grew by 15% due to enhanced grounding
              prompts.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
