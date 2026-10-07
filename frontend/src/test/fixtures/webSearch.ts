import type { WebSnapshot } from '../../types/webSearch'

export function webSnapshot(overrides: Partial<WebSnapshot> = {}): WebSnapshot {
  return {
    schema_version: 1,
    requested_mode: 'auto',
    status: 'ready',
    queries: ['测试查询'],
    searched_at: '2026-09-30T12:00:00Z',
    sources: [
      {
        id: 's1',
        title: '官方发布说明',
        url: 'https://example.com/releases',
        domain: 'example.com',
        excerpt: '本次版本的变化。',
        published_at: null,
        retrieved_at: '2026-09-30T12:00:00Z',
      },
    ],
    cited_source_ids: ['s1'],
    ...overrides,
  }
}
