// 根据用户的学习对话次数评定等级
const LEVEL_THRESHOLDS = [0, 1000, 3000, 7000, 15000, 30000, 60000, 120000]

export function computeLevel(chatCount: number): number {
  let lv = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (chatCount >= LEVEL_THRESHOLDS[i]) lv = i + 1
  }
  return lv
}
