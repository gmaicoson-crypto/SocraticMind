import type { AttachmentSummary } from './attachments'

export interface MaterialRef {
  attachment_id: string
  revision: number
}

export interface TopicMaterialSummary {
  document: KnowledgeDocumentSummary
  revision: number
  available: boolean
}

export interface IndexStatus {
  status:
    | 'disabled'
    | 'not_indexed'
    | 'pending'
    | 'running'
    | 'ready'
    | 'failed'
    | 'cancelled'
    | 'unavailable'
  completed_chunks: number
  total_chunks: number
  error_code?: string | null
}

export interface KnowledgeDocumentSummary extends AttachmentSummary {
  index_status?: IndexStatus | null
}

export function indexStatusLabel(index?: IndexStatus | null): string {
  if (!index) return ''
  const labels = {
    disabled: '未启用语义检索，使用关键词检索',
    not_indexed: '尚未建立语义索引',
    pending: '语义索引排队中',
    running: `正在建立语义索引（${index.completed_chunks}/${index.total_chunks}）`,
    ready: '语义索引已就绪',
    failed: '语义索引失败，暂用关键词检索',
    cancelled: '语义索引已停止，请检查资料版本',
    unavailable: '语义服务不可用，暂用关键词检索',
  }
  return labels[index.status]
}
