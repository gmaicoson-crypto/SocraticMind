import DOMPurify from 'dompurify'
import { Marked, type Tokens } from 'marked'
import hljs from 'highlight.js'
import type { WebSnapshot } from '../types/webSearch'
import { safeWebUrl } from './webSearch'

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
}

export function createMessageMarkdownRenderer() {
  let web: WebSnapshot | undefined
  let assistant = false
  let streaming = false
  const cited = new Set<string>()
  const parser = new Marked({ breaks: true, gfm: true })
  parser.use({
    extensions: [
      {
        name: 'sourceCitation',
        level: 'inline',
        start: (src) => src.indexOf('[['),
        tokenizer(src) {
          if (!assistant || this.lexer.state.inRawBlock || this.lexer.state.inLink) return undefined
          const match = /^\[\[source:(s\d+)\]\]/.exec(src)
          if (match) return { type: 'sourceCitation', raw: match[0], sourceId: match[1] }
          if (streaming && /^\[\[(?:s(?:o(?:u(?:r(?:c(?:e(?::[\w-]*\]?)?)?)?)?)?)?)?$/.test(src)) {
            return { type: 'sourceCitation', raw: src, sourceId: '' }
          }
          return undefined
        },
        renderer(token) {
          if (!token.sourceId) return ''
          const index = web?.sources.findIndex((source) => source.id === token.sourceId) ?? -1
          const source = index >= 0 ? web?.sources[index] : undefined
          const url = source && safeWebUrl(source.url)
          if (!source || !url) return '<span class="source-unavailable">[来源不可用]</span>'
          cited.add(source.id)
          return `<a class="source-citation" href="${escapeHtml(url)}" title="${escapeHtml(source.title)}">[${index + 1}]</a>`
        },
      },
    ],
    renderer: {
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(text)
      },
      code({ text, lang }: Tokens.Code) {
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
        const highlighted = hljs.highlight(text, { language }).value
        const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
        return `<div class="code-block"><div class="code-header">${label}<button type="button" class="code-copy">复制</button></div><pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre></div>`
      },
      codespan({ text }: Tokens.Codespan) {
        return `<code class="inline-code">${escapeHtml(text)}</code>`
      },
    },
  })
  return (
    text: string,
    options: { web?: WebSnapshot; assistant?: boolean; streaming?: boolean } = {},
  ) => {
    web = options.web
    assistant = options.assistant ?? false
    streaming = options.streaming ?? false
    cited.clear()
    const html = parser.parse(text) as string
    const fragment = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'form', 'input', 'textarea', 'select', 'img'],
      FORBID_ATTR: ['style'],
      ALLOW_DATA_ATTR: false,
      RETURN_DOM_FRAGMENT: true,
    })
    for (const link of fragment.querySelectorAll('a')) {
      const url = safeWebUrl(link.getAttribute('href') ?? '')
      if (url) {
        link.setAttribute('href', url)
        link.setAttribute('target', '_blank')
        link.setAttribute('rel', 'noopener noreferrer')
      } else link.removeAttribute('href')
    }
    const container = document.createElement('div')
    container.append(fragment)
    return { html: container.innerHTML, citedSourceIds: [...cited] }
  }
}

const citationRenderer = createMessageMarkdownRenderer()
export function webSnapshotForText(
  web: WebSnapshot | undefined,
  text: string,
): WebSnapshot | undefined {
  if (!web) return undefined
  return {
    ...web,
    cited_source_ids: citationRenderer(text, { web, assistant: true }).citedSourceIds,
  }
}
