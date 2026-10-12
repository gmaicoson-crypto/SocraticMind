export type AttachmentStatus =
  'pending' | 'processing' | 'needs_confirmation' | 'ready' | 'failed' | 'deleted'
export interface AttachmentLocator {
  page?: number
  slide?: number
  paragraph?: number
  table?: number
  section?: string
}
export interface AttachmentSummary {
  id: string
  name: string
  mime_type: string
  size: number
  kind: 'image' | 'document'
  status: AttachmentStatus
  revision: number
  pages?: number | null
  width?: number | null
  height?: number | null
  warnings: string[]
  coverage?: {
    recognized_pages: number[]
    missing_pages: number[]
    reasons?: Record<string, string>
  } | null
  accepted_coverage?: { recognized_pages?: number[]; missing_pages?: number[] } | null
  retryable?: boolean
  error_code?: string | null
  error_message?: string | null
}
export interface AttachmentCapabilities {
  allowed_extensions: string[]
  limits: {
    max_attachments: number
    max_image_bytes: number
    max_document_bytes: number
    max_message_bytes: number
    max_user_bytes: number
    max_image_pixels: number
    max_pages: number
  }
  parsers: {
    legacy_office: boolean
    legacy_office_error?: string | null
    parser_isolation?: boolean
  }
  ocr_available: boolean
}
export interface AttachmentScope {
  session_id: string
  mode: 'normal' | 'socratic'
  topic_id?: number
}
export interface AttachmentDraft {
  clientId: string
  file: File
  attachment: AttachmentSummary
  uploadState: 'queued' | 'uploading' | 'uploaded' | 'failed'
  progress: number
  error?: string
  previewUrl?: string
}
export interface AttachmentChunk {
  attachment_id: string
  revision: number
  chunk_id: string
  text: string
  locator: AttachmentLocator
  block_type: string
  title_path: string[]
}
export interface AttachmentContextEvent {
  type: 'attachment_context_preparing' | 'attachment_context_progress' | 'attachment_context_ready'
  request_id?: string
  ai_message_id?: number
  completed?: number
  total?: number
  message?: string
}
export function attachmentLocation(locator: AttachmentLocator = {}): string {
  if (locator.page) return `第 ${locator.page} 页`
  if (locator.slide) return `第 ${locator.slide} 张`
  return [
    locator.section,
    locator.paragraph ? `第 ${locator.paragraph} 段` : '',
    locator.table ? `表格 ${locator.table}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}
