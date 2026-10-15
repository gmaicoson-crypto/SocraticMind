import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { WebSource, WebStatus } from '../../../types/webSearch'
import MessageSources from '../MessageSources.vue'
import { webSnapshot } from '../../../test/fixtures/webSearch'

describe('message source evidence', () => {
  it.each<WebStatus>(['deciding', 'searching', 'ready', 'failed', 'unavailable'])(
    'hides %s progress and source details until the reply finishes',
    async (status) => {
      const wrapper = mount(MessageSources, {
        props: {
          web: webSnapshot({
            status,
            warnings: [{ code: 'SEARCH_TIMEOUT', message: '未能核实最新资料。', retryable: true }],
          }),
          pending: true,
        },
      })
      expect(wrapper.find('.message-sources').exists()).toBe(false)
      await wrapper.setProps({ pending: false })
      expect(wrapper.get('summary').text()).toContain('引用 1 条来源')
      expect(wrapper.text()).toContain('未能核实最新资料')
      expect(wrapper.text()).not.toContain('正在')
      expect(wrapper.text()).not.toContain('联网过程已中断')
      wrapper.unmount()
    },
  )

  it.each([false, true])('hides no-search decisions while pending=%s', (pending) => {
    const wrapper = mount(MessageSources, {
      props: { web: webSnapshot({ status: 'skipped', sources: [] }), pending },
    })
    expect(wrapper.find('.message-sources').exists()).toBe(false)
    wrapper.unmount()
  })

  it('preserves real sources even when the search decision was skipped', () => {
    const wrapper = mount(MessageSources, { props: { web: webSnapshot({ status: 'skipped' }) } })
    expect(wrapper.find('.web-status').exists()).toBe(false)
    expect(wrapper.get('summary').text()).toContain('引用 1 条来源')
    wrapper.unmount()
  })

  it('distinguishes cited sources from retrieved snippets without inventing publication dates', () => {
    const web = webSnapshot()
    web.sources.push({
      ...(web.sources[0] as WebSource),
      id: 's2',
      title: '未引用资料',
      url: 'https://other.example.com/',
    })
    const wrapper = mount(MessageSources, { props: { web } })
    expect(wrapper.get('summary').text()).toContain('引用 1 条来源')
    expect(wrapper.get('summary').text()).toContain('检索到 2 条资料')
    expect(wrapper.findAll('.source-label').map((label) => label.text())).toEqual([
      '已引用',
      '仅检索',
    ])
    expect(wrapper.text()).toContain('检索于')
    expect(wrapper.text()).not.toContain('发布于')
    expect(wrapper.get('details').attributes('open')).toBeUndefined()
    wrapper.unmount()
  })

  it('preserves final evidence warnings and prevents unsafe source links', () => {
    const web = webSnapshot({
      status: 'failed',
      warnings: [
        { code: 'SEARCH_TIMEOUT', message: '联网超时，未核实最新资料。', retryable: true },
      ],
    })
    ;(web.sources[0] as WebSource).url = 'javascript:alert(1)'
    const wrapper = mount(MessageSources, { props: { web } })
    expect(wrapper.text()).toContain('未核实最新资料')
    expect(wrapper.find('a').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each<WebStatus>(['deciding', 'searching', 'ready'])(
    'hides historical %s process statuses without sources',
    (status) => {
      const wrapper = mount(MessageSources, {
        props: { web: webSnapshot({ status, sources: [] }) },
      })
      expect(wrapper.find('.message-sources').exists()).toBe(false)
      wrapper.unmount()
    },
  )
  it('hides capacity truncation details while preserving sources and evidence warnings', () => {
    const web = webSnapshot({
      warnings: [
        {
          code: 'WEB_EVIDENCE_TRUNCATED',
          message: '部分联网资料因上下文容量限制已缩短或省略。',
          retryable: false,
        },
        {
          code: 'WEB_EVIDENCE_INSUFFICIENT',
          message: '现有资料不足以核实该结论。',
          retryable: true,
        },
      ],
    })
    const wrapper = mount(MessageSources, { props: { web } })
    expect(wrapper.text()).not.toContain('上下文容量限制')
    expect(wrapper.text()).toContain('现有资料不足以核实该结论')
    expect(wrapper.get('summary').text()).toContain('引用 1 条来源')
    expect(wrapper.get('a').attributes('href')).toBe('https://example.com/releases')
    expect(web.warnings).toHaveLength(2)
    wrapper.unmount()
  })
})
