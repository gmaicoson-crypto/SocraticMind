// 今日目标管理工具

export interface DailyGoalConfig {
  chat_count: { enabled: boolean; target: number }
  mastered_nodes: { enabled: boolean; target: number }
  completed_topics: { enabled: boolean; target: number }
  study_minutes: { enabled: boolean; target: number }
}

export interface DailyProgress {
  date: string
  study_minutes: number  // 今日学习时长（分钟）
}

const STORAGE_KEY_GOAL = (userId: number) => `sm_daily_goal_${userId}`
const STORAGE_KEY_PROGRESS = (userId: number) => `sm_daily_progress_${userId}`

// 默认目标
export function getDefaultGoal(): DailyGoalConfig {
  return {
    chat_count:       { enabled: true,  target: 5  },
    mastered_nodes:   { enabled: true,  target: 2  },
    completed_topics: { enabled: false, target: 1  },
    study_minutes:    { enabled: true,  target: 30 },
  }
}

// 读取用户目标配置
export function loadGoalConfig(userId: number): DailyGoalConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GOAL(userId))
    if (raw) return { ...getDefaultGoal(), ...JSON.parse(raw) }
  } catch {}
  return getDefaultGoal()
}

// 保存用户目标配置
export function saveGoalConfig(userId: number, config: DailyGoalConfig) {
  localStorage.setItem(STORAGE_KEY_GOAL(userId), JSON.stringify(config))
}

// 读取今日进度（学习时长）
export function loadTodayProgress(userId: number): DailyProgress {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROGRESS(userId))
    if (raw) {
      const data: DailyProgress = JSON.parse(raw)
      // 如果是新的一天，重置进度
      if (data.date !== today) {
        return { date: today, study_minutes: 0 }
      }
      return data
    }
  } catch {}
  return { date: today, study_minutes: 0 }
}

// 保存今日进度
export function saveTodayProgress(userId: number, progress: DailyProgress) {
  localStorage.setItem(STORAGE_KEY_PROGRESS(userId), JSON.stringify(progress))
}

// 增加学习时长
export function addStudyMinutes(userId: number, minutes: number) {
  const progress = loadTodayProgress(userId)
  progress.study_minutes += minutes
  saveTodayProgress(userId, progress)
  return progress
}