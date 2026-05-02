// 单一来源的头像渐变配色，避免不同弹窗 / 注册流程出现配色漂移
export const avatarGrads = [
  'linear-gradient(135deg,#e8c87a,#d4974a)',
  'linear-gradient(135deg,#5BA3D9,#2E7FBB)',
  'linear-gradient(135deg,#9FE1CB,#1D9E75)',
  'linear-gradient(135deg,#F0997B,#D85A30)',
  'linear-gradient(135deg,#AFA9EC,#534AB7)',
] as const

export const defaultAvatarGrad = avatarGrads[0]
