import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MessageSources from '../MessageSources.vue'
import { webSnapshot } from '../../../test/fixtures/webSearch'

describe('message source evidence', () => {
  it('distinguishes cited sources from retrieved snippets without inventing publication dates', () => {
    const web = webSnapshot()
    web.sources.push({
      ...web.sources[0],
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

  it('shows warnings before answer text and prevents unsafe source links', () => {
    const web = webSnapshot({
      status: 'failed',
      warnings: [
        { code: 'SEARCH_TIMEOUT', message: '联网超时，未核实最新资料。', retryable: true },
      ],
    })
    web.sources[0].url = 'javascript:alert(1)'
    const wrapper = mount(MessageSources, { props: { web, pending: true } })
    expect(wrapper.text()).toContain('未核实最新资料')
    expect(wrapper.find('a').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not show an interrupted historical search as still running', () => {
    const wrapper = mount(MessageSources, {
      props: { web: webSnapshot({ status: 'searching', sources: [] }) },
    })
    expect(wrapper.text()).toContain('联网过程已中断')
    expect(wrapper.text()).not.toContain('正在搜索')
    wrapper.unmount()
  })
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
