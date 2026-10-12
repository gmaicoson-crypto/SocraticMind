import type { WebSource } from '../../types/webSearch'
import { describe, expect, it } from 'vitest'
import { createMessageMarkdownRenderer, webSnapshotForText } from '../messageMarkdown'
import { webSnapshot } from '../../test/fixtures/webSearch'

describe('assistant source citations and untrusted Markdown', () => {
  it('maps only known source ids in assistant prose, leaving code, escaped markers and users unchanged', () => {
    const render = createMessageMarkdownRenderer()
    const text =
      '事实 [[source:s1]]，无效 [[source:s99]]\n\n`[[source:s1]]`\n\n```text\n[[source:s1]]\n```\n\n    [[source:s1]]\n\n\\[[source:s1]]'
    const result = render(text, { assistant: true, web: webSnapshot() })
    const container = document.createElement('div')
    container.innerHTML = result.html
    expect(container.querySelectorAll('a.source-citation')).toHaveLength(1)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com/releases')
    expect(container.querySelectorAll('code')).toHaveLength(3)
    expect(container.querySelectorAll('code')[0].textContent).toBe('[[source:s1]]')
    expect(container.textContent).toContain('来源不可用')
    expect(result.citedSourceIds).toEqual(['s1'])
    expect(render('[[source:s1]]', { web: webSnapshot() }).html).not.toContain('source-citation')
  })

  it.each(['[[', '[[s', '[[source:', '[[source:s1', '[[source:s1]'])(
    'hides an incomplete streaming marker %s',
    (tail) => {
      const render = createMessageMarkdownRenderer()
      const result = render(`事实 ${tail}`, {
        assistant: true,
        streaming: true,
        web: webSnapshot(),
      })
      expect(result.html).not.toContain('[[')
      expect(result.html).toContain('事实')
      expect(result.citedSourceIds).toEqual([])
    },
  )

  it('does not interpret tilde fences, unfinished fences, or multiline inline code as citations', () => {
    const render = createMessageMarkdownRenderer()
    for (const text of [
      '~~~\n[[source:s1]]\n~~~',
      '```\n[[source:s1]]',
      '`code\n[[source:s1]]`',
      '<code>[[source:s1]]</code>',
    ]) {
      expect(render(text, { assistant: true, web: webSnapshot() }).citedSourceIds).toEqual([])
    }
  })

  it('sanitizes HTML, unsafe URL schemes and malicious code language labels', () => {
    const render = createMessageMarkdownRenderer()
    const text =
      '<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(1)">unsafe</a>\n\n[data](data:text/html,hello)\n\n```\"><img/src=x/onerror=alert(1)>\nconst x = "<img>"\n```\n\n[safe](https://example.com)'
    const container = document.createElement('div')
    container.innerHTML = render(text).html
    expect(container.querySelector('script,img,[onclick],[onerror]')).toBeNull()
    expect(
      [...container.querySelectorAll('a[href]')].every((link) =>
        link.getAttribute('href')!.startsWith('https://'),
      ),
    ).toBe(true)
    const safe = container.querySelector('a[href]')!
    expect(safe.getAttribute('rel')).toBe('noopener noreferrer')
    expect(safe.getAttribute('target')).toBe('_blank')
    expect(container.querySelector('code')?.textContent).toContain('const x = "<img>"')
  })

  it('does not let raw HTML impersonate a verified source citation', () => {
    const render = createMessageMarkdownRenderer()
    const result = render('<a class="source-citation" href="https://attacker.example">[1]</a>', {
      assistant: true,
      web: webSnapshot(),
    })
    const container = document.createElement('div')
    container.innerHTML = result.html
    expect(container.querySelector('a.source-citation')).toBeNull()
    expect(container.textContent).toContain('source-citation')
    expect(result.citedSourceIds).toEqual([])
  })

  it('recomputes partial citations from the text actually retained', () => {
    const web = webSnapshot({ cited_source_ids: [] })
    expect(
      webSnapshotForText(web, '部分 [[source:s1]] `[[source:s99]]`')?.cited_source_ids,
    ).toEqual(['s1'])
    expect(web.cited_source_ids).toEqual([])
    ;(web.sources[0] as WebSource).url = 'javascript:alert(1)'
    expect(webSnapshotForText(web, '[[source:s1]]')?.cited_source_ids).toEqual([])
  })
})
