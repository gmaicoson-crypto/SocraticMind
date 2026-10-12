import type { AttachmentCapabilities, AttachmentSummary } from '../../types/attachments'
export const attachmentCapabilities: AttachmentCapabilities = {
  allowed_extensions: ['.jpg', '.jpeg', '.png', '.webp', '.doc', '.docx', '.pdf', '.ppt', '.pptx'],
  limits: {
    max_attachments: 9,
    max_image_bytes: 10485760,
    max_document_bytes: 20971520,
    max_message_bytes: 52428800,
    max_user_bytes: 524288000,
    max_image_pixels: 40000000,
    max_pages: 200,
  },
  parsers: { legacy_office: true },
  ocr_available: false,
}
export function attachment(overrides: Partial<AttachmentSummary> = {}): AttachmentSummary {
  return {
    id: 'attachment-1',
    name: '讲义.pdf',
    mime_type: 'application/pdf',
    size: 100,
    kind: 'document',
    status: 'ready',
    revision: 1,
    warnings: [],
    ...overrides,
  }
}
