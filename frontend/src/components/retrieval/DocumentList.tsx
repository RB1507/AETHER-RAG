import * as React from 'react'
import { motion } from 'framer-motion'
import { scaleIn } from '@/lib/animations'
import { formatBytes, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Search, Loader2, FileText, FileSpreadsheet, FileCode, FileJson, Trash2 } from 'lucide-react'
import { Document } from '@/types'

interface DocumentListProps {
  documents: Document[]
  isLoadingDocs: boolean
  searchTerm: string
  setSearchTerm: (term: string) => void
  deleteDoc: (id: string) => void
  isDeleting: boolean
}

export function DocumentList({
  documents,
  isLoadingDocs,
  searchTerm,
  setSearchTerm,
  deleteDoc,
  isDeleting,
}: DocumentListProps) {
  // Get file icon based on extension
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'csv':
        return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
      case 'md':
        return <FileCode className="h-5 w-5 text-indigo-500" />
      case 'json':
        return <FileJson className="h-5 w-5 text-amber-500" />
      default:
        return <FileText className="h-5 w-5 text-brand-primary" />
    }
  }

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="md:col-span-2">
      <Card className="border border-border/60 bg-surface-primary/80 backdrop-blur-md rounded-2xl shadow-sm h-full">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-sm font-bold">Grounding Sources</CardTitle>
            <CardDescription className="text-[10px]">
              Manage active files vectorized in this workspace.
            </CardDescription>
          </div>
          {documents.length > 0 && (
            <div className="relative w-full sm:w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-text-muted" />
              <Input
                type="text"
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs bg-transparent border-border focus-visible:ring-brand-primary rounded-lg"
              />
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-2">
          {isLoadingDocs ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-3" />
              <span className="text-xs">Loading documents...</span>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="text-center py-20 border-2 border-dashed border-border/40 rounded-xl">
              <FileText className="h-10 w-10 text-text-muted mx-auto mb-3" />
              <p className="text-xs font-semibold text-text-primary">No documents found</p>
              <p className="text-[10px] text-text-muted mt-1 max-w-[200px] mx-auto leading-relaxed">
                {searchTerm
                  ? 'Try modifying your search criteria.'
                  : 'Upload PDF, DOCX, TXT, CSV, or MD files to start grounding your queries.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredDocs.map((doc) => (
                <motion.div
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                  key={doc.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border/55 bg-surface-primary/30 hover:bg-muted/30 transition-colors gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 bg-muted rounded-lg flex items-center justify-center shrink-0">
                      {getFileIcon(doc.name)}
                    </div>
                    <div className="min-w-0 leading-tight">
                      <h4 className="text-xs font-semibold text-text-primary truncate max-w-[250px] sm:max-w-md">
                        {doc.name}
                      </h4>
                      <p className="text-[10px] text-text-muted mt-1.5 flex flex-wrap gap-x-2.5">
                        <span>{formatBytes(doc.size)}</span>
                        <span>•</span>
                        <span>{doc.pageCount} pages ({doc.chunkCount} chunks)</span>
                        <span>•</span>
                        <span>Uploaded {formatDate(doc.uploadedAt, 'short')}</span>
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isDeleting}
                    onClick={() => {
                      if (confirm(`Delete grounding file "${doc.name}"?`)) {
                        deleteDoc(doc.id)
                      }
                    }}
                    className="hover:bg-danger/10 hover:text-danger rounded-lg h-8 w-8 text-text-muted shrink-0"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
