import api from './index'
import type {
  IndexStatus,
  KnowledgeDocumentSummary,
  MaterialRef,
  TopicMaterialSummary,
} from '../types/knowledge'

export async function listKnowledgeDocuments(after?: string, signal?: AbortSignal) {
  return (
    await api.get<KnowledgeDocumentSummary[]>('/api/knowledge/documents', {
      params: { after, limit: 50 },
      signal,
    })
  ).data
}

export async function requestMaterialIndex(document: MaterialRef, signal?: AbortSignal) {
  return (
    await api.post<IndexStatus>(
      `/api/knowledge/documents/${document.attachment_id}/index`,
      { revision: document.revision },
      { signal },
    )
  ).data
}

export async function getTopicMaterials(topicId: number, signal?: AbortSignal) {
  return (
    await api.get<TopicMaterialSummary[]>(`/api/knowledge/topics/${topicId}/materials`, {
      signal,
    })
  ).data
}

export async function setTopicMaterials(
  topicId: number,
  materials: MaterialRef[],
  signal?: AbortSignal,
) {
  return (
    await api.put<TopicMaterialSummary[]>(
      `/api/knowledge/topics/${topicId}/materials`,
      {
        materials,
      },
      { signal },
    )
  ).data
}
