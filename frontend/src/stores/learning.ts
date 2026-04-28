import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { KNode, KEdge, Topic, Message } from '../types'

const DEFAULT_NODES: KNode[] = [
  { id: 'py-basics',    label: 'Python 基础', sub: 'Fundamentals',     x: 300, y: 140,  state: 'mastered' },
  { id: 'vars',         label: '变量',        sub: 'Variables',        x: 130, y: 260, state: 'mastered' },
  { id: 'types',        label: '数据类型',    sub: 'Data Types',       x: 300, y: 260, state: 'mastered' },
  { id: 'operators',    label: '运算符',      sub: 'Operators',        x: 470, y: 260, state: 'mastered' },
  { id: 'conditionals', label: '条件语句',    sub: 'if · elif · else', x: 200, y: 400, state: 'available' },
  { id: 'comparison',   label: '比较运算',    sub: '== · != · >',      x: 400, y: 400, state: 'available' },
  { id: 'loops',        label: '循环',        sub: 'for · while',      x: 130, y: 540, state: 'locked' },
  { id: 'functions',    label: '函数',        sub: 'def · return',     x: 320, y: 540, state: 'locked' },
  { id: 'scope',        label: '作用域',      sub: 'Scope',            x: 480, y: 540, state: 'locked' },
  { id: 'data-struct',  label: '数据结构',    sub: 'list · dict',      x: 220, y: 660, state: 'locked' },
  { id: 'modules',      label: '模块',        sub: 'import',           x: 410, y: 660, state: 'locked' },
]

const DEFAULT_EDGES: KEdge[] = [
  { source: 'py-basics', target: 'vars' },
  { source: 'py-basics', target: 'types' },
  { source: 'py-basics', target: 'operators' },
  { source: 'vars',      target: 'conditionals' },
  { source: 'types',     target: 'conditionals' },
  { source: 'operators', target: 'comparison' },
  { source: 'types',     target: 'comparison' },
  { source: 'conditionals', target: 'loops' },
  { source: 'conditionals', target: 'functions' },
  { source: 'comparison',   target: 'functions' },
  { source: 'operators',    target: 'scope' },
  { source: 'functions',    target: 'scope' },
  { source: 'loops',        target: 'data-struct' },
  { source: 'functions',    target: 'data-struct' },
  { source: 'functions',    target: 'modules' },
  { source: 'scope',        target: 'modules' },
]

const DEFAULT_TOPICS: Topic[] = [
  { id: 'py',   title: 'Python 基础知识',  nodes: 11, mastered: 4,  emoji: '🐍' },
  { id: 'math', title: '线性代数',         nodes: 18, mastered: 12, emoji: '∑'  },
  { id: 'ml',   title: '机器学习入门',     nodes: 24, mastered: 6,  emoji: '◊'  },
  { id: 'alg',  title: '算法与数据结构',   nodes: 32, mastered: 0,  emoji: '⌥'  },
]

export const useLearningStore = defineStore('learning', () => {
  const isDark = ref(false)
  const nodes = ref<KNode[]>(DEFAULT_NODES)
  const edges = ref<KEdge[]>(DEFAULT_EDGES)
  const topics = ref<Topic[]>(DEFAULT_TOPICS)
  const activeTopicId = ref('py')
  const activeNode = ref<KNode | null>(null)
  const messages = ref<Message[]>([])

  const masteredCount = computed(() => nodes.value.filter(n => n.state === 'mastered').length)
  const totalCount = computed(() => nodes.value.length)
  const availableCount = computed(() => nodes.value.filter(n => n.state === 'available').length)

  function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light')
}

  function setActiveNode(node: KNode | null) {
    activeNode.value = node
  }

  function masterNode(nodeId: string) {
    nodes.value = nodes.value.map(n => {
      if (n.id === nodeId && n.state !== 'mastered') {
        return { ...n, state: 'mastered' as const }
      }
      return n
    })
    // 解锁子节点
    const masteredIds = new Set(nodes.value.filter(n => n.state === 'mastered').map(n => n.id))
    nodes.value = nodes.value.map(n => {
      if (n.state === 'locked') {
        const parents = edges.value.filter(e => e.target === n.id).map(e => e.source)
        if (parents.some(p => masteredIds.has(p))) {
          return { ...n, state: 'available' as const }
        }
      }
      return n
    })
  }

  function addMessage(msg: Message) {
    messages.value.push(msg)
  }

  function setActiveTopic(id: string) {
    activeTopicId.value = id
  }

  return {
    nodes, edges, topics,
    activeTopicId, activeNode, messages,
    masteredCount, totalCount, availableCount,
    setActiveNode, masterNode, addMessage, setActiveTopic,
    isDark, toggleTheme,
  }
})

