// dailyGoal 工具模块，提供可复用的纯函数。
export interface DailyGoalConfig {
  chat_count: { enabled: boolean; target: number }
  mastered_nodes: { enabled: boolean; target: number }
  completed_topics: { enabled: boolean; target: number }
  study_minutes: { enabled: boolean; target: number }
}

export interface DailyProgress {
  date: string
  study_minutes: number
}

const STORAGE_KEY_GOAL = (userId: number) => `sm_daily_goal_${userId}`
const STORAGE_KEY_PROGRESS = (userId: number) => `sm_daily_progress_${userId}`

export function getDefaultGoal(): DailyGoalConfig {
  return {
    chat_count:       { enabled: true,  target: 5  },
    mastered_nodes:   { enabled: true,  target: 2  },
    completed_topics: { enabled: false, target: 1  },
    study_minutes:    { enabled: true,  target: 30 },
  }
}

export function loadGoalConfig(userId: number): DailyGoalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOAL(userId))
    if (raw) return { ...getDefaultGoal(), ...JSON.parse(raw) }
  } catch (err) {
    console.warn('每日目标本地存储解析失败，使用默认值', err)
  }
  return getDefaultGoal()
}

export function saveGoalConfig(userId: number, config: DailyGoalConfig) {
  localStorage.setItem(STORAGE_KEY_GOAL(userId), JSON.stringify(config))
}

export function loadTodayProgress(userId: number): DailyProgress {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS(userId))
    if (raw) {
      const data: DailyProgress = JSON.parse(raw)
      if (data.date !== today) return { date: today, study_minutes: 0 }
      return data
    }
  } catch (err) {
    console.warn('每日目标本地存储解析失败，使用默认值', err)
  }
  return { date: today, study_minutes: 0 }
}

export function saveTodayProgress(userId: number, progress: DailyProgress) {
  localStorage.setItem(STORAGE_KEY_PROGRESS(userId), JSON.stringify(progress))
}

export function addStudyMinutes(userId: number, minutes: number) {
  const progress = loadTodayProgress(userId)
  progress.study_minutes += minutes
  saveTodayProgress(userId, progress)
  return progress
}
