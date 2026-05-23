// 头像渐变配色列表，所有用头像色的地方统一从这里取，避免配色漂移
export const avatarGrads = [
  'linear-gradient(135deg,#e8c87a,#d4974a)',
  'linear-gradient(135deg,#5BA3D9,#2E7FBB)',
  'linear-gradient(135deg,#9FE1CB,#1D9E75)',
  'linear-gradient(135deg,#F0997B,#D85A30)',
  'linear-gradient(135deg,#AFA9EC,#534AB7)',
] as const

export const defaultAvatarGrad = avatarGrads[0]
