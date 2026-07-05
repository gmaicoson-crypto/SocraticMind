import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLearningStore } from '../stores/learning'
import type { Topic } from '../types'
import { searchNodes, type SearchedNode } from '../api/topic'

export function useGlobalSearch() {
  const store = useLearningStore()
  const router = useRouter()
  const query = ref('')
  const focused = ref(false)
  const showDropdown = ref(false)
  const activeIndex = ref(-1)
  const inputRef = ref<HTMLInputElement | null>(null)
  const nodeResults = ref<SearchedNode[]>([])
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let searchSeq = 0

  const topicResults = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    if (!keyword) return []
    return store.topics.filter((topic) => topic.title.toLowerCase().includes(keyword)).slice(0, 3)
  })
  const results = computed<(SearchedNode | Topic)[]>(() => [
    ...nodeResults.value,
    ...topicResults.value,
  ])

  watch(query, (value) => {
    if (searchTimer) clearTimeout(searchTimer)
    activeIndex.value = -1
    const keyword = value.trim()
    if (!keyword) {
      nodeResults.value = []
      return
    }
    const seq = ++searchSeq
    searchTimer = setTimeout(async () => {
      try {
        const data = await searchNodes(keyword, 6)
        if (seq === searchSeq) nodeResults.value = data
      } catch {
        if (seq === searchSeq) nodeResults.value = []
      }
    }, 200)
  })

  function closeSearch() {
    query.value = ''
    focused.value = false
    showDropdown.value = false
    activeIndex.value = -1
    inputRef.value?.blur()
  }
  function clearSearch() {
    query.value = ''
    activeIndex.value = -1
    inputRef.value?.focus()
  }
  function onBlur() {
    setTimeout(() => {
      focused.value = false
      showDropdown.value = false
      activeIndex.value = -1
    }, 150)
  }
  function moveDown() {
    activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1)
  }
  function moveUp() {
    activeIndex.value = Math.max(activeIndex.value - 1, -1)
  }
  function stateLabel(state: string) {
    return { mastered: '已掌握', available: '可学习', locked: '已锁定' }[state] || state
  }

  async function selectNode(item: SearchedNode) {
    closeSearch()
    await router.push('/')
    if (store.activeTopicId !== String(item.topic_id))
      await store.setActiveTopic(String(item.topic_id))
    const localNode = store.nodes.find((node) => node.id === item.node_key)
    if (localNode) store.setActiveNode(localNode)
  }
  async function selectTopic(topic: Topic) {
    closeSearch()
    await router.push('/')
    await store.setActiveTopic(topic.id)
  }
  function selectCurrent() {
    if (activeIndex.value < 0) return
    if (activeIndex.value < nodeResults.value.length)
      selectNode(nodeResults.value[activeIndex.value])
    else selectTopic(topicResults.value[activeIndex.value - nodeResults.value.length])
  }
  function handleKeydown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      inputRef.value?.focus()
      showDropdown.value = true
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    if (searchTimer) clearTimeout(searchTimer)
  })

  return {
    query,
    focused,
    showDropdown,
    activeIndex,
    inputRef,
    nodeResults,
    topicResults,
    results,
    closeSearch,
    clearSearch,
    onBlur,
    moveDown,
    moveUp,
    selectCurrent,
    selectNode,
    selectTopic,
    stateLabel,
  }
}
