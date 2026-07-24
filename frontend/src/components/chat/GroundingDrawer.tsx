import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { BookOpen, X, FileText } from 'lucide-react'
import { Citation } from '@/types'

interface GroundingDrawerProps {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
  selectedCitation: Citation | null
}

export function GroundingDrawer({
  isOpen,
  setIsOpen,
  selectedCitation,
}: GroundingDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && selectedCitation && (
        <motion.div 
          className="fixed inset-0 sm:absolute sm:inset-y-0 sm:left-auto sm:right-0 z-50 flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { delay: 0.2 } }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/35 backdrop-blur-xs sm:hidden"
          />
          {/* Drawer panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative flex flex-col w-[380px] max-w-full h-full border-l border-border/80 bg-surface-primary dark:bg-card p-6 shadow-2xl z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/60 pb-4 mb-5 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-brand-primary" />
                <h3 className="font-bold text-sm text-text-primary">Grounded Passage</h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text-primary p-1 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="space-y-5 flex-1">
              {/* Meta details */}
              <div className="space-y-3.5 bg-muted/30 border border-border/55 rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4.5 w-4.5 text-text-muted shrink-0" />
                  <span className="text-xs font-bold text-text-primary truncate">
                    {selectedCitation.documentName}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-border/40 text-[10px] text-text-muted uppercase font-bold tracking-wider">
                  <div>
                    <p className="text-[9px]">Grounding ID</p>
                    <p className="text-text-secondary mt-0.5 truncate">{selectedCitation.documentId}</p>
                  </div>
                  <div>
                    <p className="text-[9px]">Location</p>
                    <p className="text-text-secondary mt-0.5">
                      {selectedCitation.pageNumber ? `Page ${selectedCitation.pageNumber}` : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Vector Excerpt passage */}
              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold uppercase text-text-muted tracking-wider">
                  Similarity Index Match
                </h4>
                <div className="p-4 border border-brand-primary/10 bg-brand-primary/5 rounded-2xl">
                  <p className="text-xs text-text-secondary italic leading-relaxed whitespace-pre-wrap">
                    &ldquo;{selectedCitation.excerpt}&rdquo;
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-border/60 mt-auto shrink-0 flex justify-end">
              <Button
                onClick={() => setIsOpen(false)}
                variant="outline"
                size="sm"
                className="text-xs h-9 rounded-lg"
              >
                Close Grounding
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
