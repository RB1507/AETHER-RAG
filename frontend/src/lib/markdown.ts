import type { PluggableList } from 'unified'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

// remark-gfm enables GitHub-Flavored Markdown (tables, strikethrough, task lists,
// autolinks). Without it, `| col | col |` table syntax renders as plain text.
export const markdownRemarkPlugins = [remarkGfm]

// The model's output is grounded on user-uploaded documents, so it is not fully
// trusted (a document could carry an HTML/prompt-injection payload). Since we run
// rehype-raw to render legitimate inline HTML like <br> in table cells, we MUST
// sanitize the resulting tree to strip <script>, event handlers, javascript: URLs,
// etc. The GitHub default schema already permits table tags, <br>, and
// `language-*` code classes; we extend it to keep table cell alignment.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    td: [...(defaultSchema.attributes?.td ?? []), 'align'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align'],
  },
}

// Order matters:
//  1. rehype-raw    — parse raw HTML (e.g. <br>) the model emits into real nodes.
//  2. rehype-sanitize — remove anything dangerous from that parsed HTML.
//  3. rehype-highlight — add syntax-highlight classes AFTER sanitizing, so its own
//     hljs classes survive.
export const markdownRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  rehypeHighlight,
]

// Markdown theme classes for consistent typography across light and dark modes
export const markdownTypographyClass = 
  'prose prose-sm dark:prose-invert max-w-none ' +
  'prose-headings:font-sans prose-headings:font-semibold prose-headings:tracking-tight ' +
  'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base ' +
  'prose-p:leading-relaxed prose-p:text-text-secondary dark:prose-p:text-text-secondary ' +
  'prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline ' +
  'prose-strong:font-semibold prose-strong:text-text-primary dark:prose-strong:text-text-primary ' +
  'prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 ' +
  'prose-code:text-xs prose-code:font-mono prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ' +
  'prose-pre:bg-muted prose-pre:p-0 prose-pre:rounded-lg prose-pre:border prose-pre:border-border-subtle'
