import { computed, onScopeDispose, ref, watch } from 'vue'
import { getSuggestions } from '../api/chat'
import type { ChatMode } from '../types'

interface DialogueSuggestionContext {
  mode: ChatMode
  userId?: number
  modelId?: string | null
  sessionId?: string
  topicId?: number
  topicTitle?: string
  nodeKey?: string
  nodeLabel?: string
  nodeSub?: string
  hasConversation?: boolean
  conversationVersion?: string
}

const CHIP_POOL_SIZE = 12
const defaultChips = {
  socratic: [
    '我想学 Python',
    '教我机器学习',
    '讲讲数据结构',
    '学习 Web 开发',
    '学习算法基础',
    '学习编程基础',
    '学习逻辑思维',
    '了解神经网络',
    '学习数据库',
    '学习前端基础',
    '学习操作系统',
    '学习计算机网络',
  ],
  normal: [
    '今天天气怎么样',
    '推荐一部电影',
    '给我讲个笑话',
    '聊聊最近的新闻',
    '推荐一本书',
    '分享一个冷知识',
    '有什么旅行建议',
    '聊聊音乐',
    '推荐一道菜',
    '讲个有趣的故事',
    '如何安排周末',
    '聊聊科技趋势',
  ],
}

const alternateChips = {
  socratic: [
    '学习 TypeScript',
    '学习函数基础',
    '学习递归',
    '学习 Rust',
    '学习网络安全',
    '学习概率统计',
    '学习线性代数',
    '学习设计模式',
    '学习数据分析',
    '学习排序算法',
    '学习 SQL 查询',
    '了解人工智能',
  ],
  normal: [
    '推荐一首歌',
    '聊聊城市生活',
    '分享生活技巧',
    '推荐一款游戏',
    '有什么运动建议',
    '聊聊历史',
    '讲一个谜语',
    '推荐一部纪录片',
    '如何缓解压力',
    '聊聊摄影',
    '分享一个节日习俗',
    '推荐一个播客',
  ],
}

function hasSuggestionContext(context: DialogueSuggestionContext): boolean {
  return context.mode === 'socratic'
    ? Boolean(context.topicId)
    : Boolean(context.hasConversation && context.sessionId)
}

function fallbackChips(context: DialogueSuggestionContext): string[] {
  if (context.mode === 'normal' && hasSuggestionContext(context)) {
    return [
      '能展开说说刚才的内容吗？',
      '能结合我的情况举个例子吗？',
      '我接下来可以先做什么？',
      '有没有更简单的选择？',
      '刚才提到的方法怎么操作？',
      '这有哪些需要注意的地方？',
      '还有哪些相关细节值得了解？',
      '如果换个情况该怎么办？',
      '这几种选择有什么区别？',
      '能帮我梳理一下刚才的重点吗？',
      '这个建议为什么适合我？',
      '有没有其他可行的思路？',
      '刚才的建议适合什么情况？',
      '需要提前做哪些准备？',
      '如何判断哪种方式更合适？',
      '实际尝试时可能遇到什么问题？',
      '有没有容易忽略的细节？',
      '能给我一个具体的步骤吗？',
      '哪些部分可以根据情况调整？',
      '如果结果不理想可以怎么改？',
      '刚才提到的几件事有何联系？',
      '有没有类似的例子可以参考？',
      '能换个角度解释一下吗？',
      '我还需要考虑哪些因素？',
      '如何把刚才的建议用起来？',
    ]
  }
  if (context.mode !== 'socratic' || !context.topicId) {
    return [...defaultChips[context.mode], ...alternateChips[context.mode]]
  }
  const subject = context.nodeLabel || context.topicTitle || '这个知识点'
  return [
    `${subject}的核心原理是什么？`,
    `${subject}有什么实际用途？`,
    `${subject}能举个例子吗？`,
    `${subject}有哪些常见误区？`,
    `${subject}与相关概念有何区别？`,
    `${subject}如何一步步实现？`,
    '刚才的例子为什么成立？',
    '这个结论需要哪些前提？',
    '换个场景还适用吗？',
    '这一步可以再解释一下吗？',
    '有没有反例能帮助理解？',
    '如何检验我是否理解了？',
    `${subject}需要哪些基础知识？`,
    `${subject}最关键的一步是什么？`,
    `${subject}有哪些局限？`,
    `${subject}适合哪些场景？`,
    `${subject}有哪些替代方案？`,
    `${subject}如何验证效果？`,
    '刚才提到的概念有何联系？',
    '能把刚才的过程拆开说明吗？',
    '如果改变条件会发生什么？',
    '如何从例子推导这个结论？',
    '实际应用时要注意什么？',
    '有哪些容易混淆的地方？',
  ]
}

function cacheStorageKey(context: DialogueSuggestionContext): string | null {
  if (context.mode === 'normal') return hasSuggestionContext(context) ? null : 'sm_chips_normal'
  // 旧的学习缓存混合了主题入口和追问，不能用于新的主题推荐。
  return context.topicId ? null : `sm_chips_socratic_topics_v2:${context.userId ?? 'local'}`
}

function loadCachedChips(context: DialogueSuggestionContext): string[] {
  const key = cacheStorageKey(context)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    const cached: unknown = raw ? JSON.parse(raw) : null
    if (
      Array.isArray(cached) &&
      cached.length >= CHIP_POOL_SIZE &&
      cached.every((chip) => typeof chip === 'string' && chip.trim())
    ) {
      return cached.slice(0, CHIP_POOL_SIZE)
    }
  } catch (error) {
    console.warn(`建议词缓存 ${key} 读取失败`, error)
  }
  return []
}

function selectSuggestions(candidates: string[], shown: Set<string>): string[] {
  const selected = new Set<string>()
  for (const suggestion of candidates) {
    const text = suggestion.trim()
    if (text && !shown.has(text)) selected.add(text)
    if (selected.size === CHIP_POOL_SIZE) break
  }
  return [...selected]
}

export function useDialogueSuggestions(
  getContext: () => DialogueSuggestionContext,
  enabled: () => boolean,
) {
  const chips = ref<string[]>([])
  const chipsLoading = ref(false)
  const context = computed(getContext)
  const contextKey = computed(() => JSON.stringify(context.value))
  // 对话追问仅保存在有上限的内存缓存中，按会话、节点和对话内容隔离。
  const cache = new Map<string, string[]>()
  let requestVersion = 0
  let loadingKey: string | null = null

  function cachedChips(key: string, scope: DialogueSuggestionContext) {
    return cache.get(key) ?? loadCachedChips(scope)
  }

  async function loadSuggestions(force = false, shown: string[] = []) {
    const scope = context.value
    const key = contextKey.value
    if (!enabled() || loadingKey === key) return
    const cached = cachedChips(key, scope)
    if (cached.length && !force) {
      chips.value = cached
      return
    }
    const version = ++requestVersion
    const previous = chips.value
    const fallback = fallbackChips(scope)
    const visible = new Set(shown)
    loadingKey = key
    chipsLoading.value = true
    try {
      const result = hasSuggestionContext(scope)
        ? await getSuggestions(scope.mode, shown, {
            sessionId: scope.sessionId,
            ...(scope.mode === 'socratic'
              ? { topicId: scope.topicId, nodeKey: scope.nodeKey }
              : {}),
          })
        : await getSuggestions(scope.mode, shown)
      if (version !== requestVersion || key !== contextKey.value) return
      chips.value = selectSuggestions(
        result.source === 'fallback'
          ? [...previous, ...fallback, ...result.suggestions]
          : [...result.suggestions, ...previous, ...fallback],
        visible,
      )
      if (result.source !== 'fallback' && chips.value.length === CHIP_POOL_SIZE) {
        cache.delete(key)
        cache.set(key, chips.value)
        if (cache.size > 30) cache.delete(cache.keys().next().value!)
        const storageKey = cacheStorageKey(scope)
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(chips.value))
          } catch (error) {
            console.warn(`建议词缓存 ${storageKey} 保存失败`, error)
          }
        }
      }
    } catch {
      if (version === requestVersion && key === contextKey.value) {
        chips.value = selectSuggestions([...previous, ...fallback], visible)
      }
    } finally {
      if (version === requestVersion) {
        loadingKey = null
        chipsLoading.value = false
      }
    }
  }

  watch(
    [contextKey, enabled],
    ([key, canLoad]) => {
      requestVersion += 1
      loadingKey = null
      chipsLoading.value = false
      const scope = context.value
      const cached = cachedChips(key, scope)
      chips.value = cached.length ? cached : fallbackChips(scope).slice(0, CHIP_POOL_SIZE)
      if (canLoad && hasSuggestionContext(scope)) void loadSuggestions()
    },
    { immediate: true, flush: 'post' },
  )

  onScopeDispose(() => {
    requestVersion += 1
    cache.clear()
  })

  return {
    chips,
    chipsLoading,
    refreshSuggestions: (shown: string[]) => void loadSuggestions(true, shown),
  }
}
