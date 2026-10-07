export type WebStatus =
  'off' | 'skipped' | 'deciding' | 'searching' | 'ready' | 'failed' | 'unavailable'

export interface WebSource {
  id: string
  title: string
  url: string
  domain: string
  excerpt: string
  published_at: string | null
  retrieved_at: string
}

export interface WebWarning {
  code: string
  message: string
  retryable: boolean
}

export interface WebSnapshot {
  schema_version: 1
  requested_mode: 'auto' | 'off'
  status: WebStatus
  decision?: { need_search: boolean; reason_code: string; freshness: string } | null
  queries: string[]
  searched_at: string | null
  sources: WebSource[]
  cited_source_ids: string[]
  error_code?: string | null
  warnings?: WebWarning[]
}

export type WebEvent =
  | {
      type: 'web_status'
      status: WebStatus
      web: WebSnapshot
      request_id: string
      ai_message_id: number
    }
  | {
      type: 'web_sources'
      web: WebSnapshot
      final: boolean
      request_id: string
      ai_message_id: number
    }
  | {
      type: 'web_warning'
      warning: WebWarning
      web: WebSnapshot
      request_id: string
      ai_message_id: number
    }
