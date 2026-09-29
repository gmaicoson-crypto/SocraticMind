export const defaultUserAvatar = '/avatars/study/boy-read.webp'
export const defaultAiAvatar = '/avatars/AI/study/AI-male-1.webp'
export const defaultNormalAiAvatar = '/avatars/AI/normal/AI_normal.webp'

export const userAvatarPresets = [
  'girl-journal',
  'boy-sketch',
  'girl-poetry',
  'boy-write',
  'girl-botany',
  'boy-insects',
  'boy-read',
  'boy-calligraphy',
  'boy-astronomy',
  'girl-globe',
  'boy-geometry',
  'girl-read',
  'boy-math',
  'girl-handwriting',
  'boy-atlas',
  'girl-music',
  'girl-butterfly',
  'girl-write',
  'girl-flashcards',
  'boy-dictionary',
].map((name) => `/avatars/study/${name}.webp`)

export const studyAiAvatarPresets = [
  'AI-female-1',
  'AI-female-2',
  'AI-female-3',
  'AI-male-1',
  'AI-male-2',
  'AI-male-3',
].map((name) => `/avatars/AI/study/${name}.webp`)

export const normalAiAvatarPresets = [
  'AI_normal',
  'AI_normal_2',
  'AI_normal_3',
  'AI_normal_4',
  'AI_normal_5',
  'AI_normal_6',
].map((name) => `/avatars/AI/normal/${name}.webp`)

export const aiAvatarPresets = studyAiAvatarPresets

export function aiAvatarPresetsForMode(mode: 'socratic' | 'normal'): string[] {
  return mode === 'normal' ? normalAiAvatarPresets : studyAiAvatarPresets
}

export function randomAiAvatar(mode: 'socratic' | 'normal' = 'socratic'): string {
  const options = aiAvatarPresetsForMode(mode)
  return options[Math.floor(Math.random() * options.length)]
}

export function normalizeAiAvatarUrl(url: string): string {
  return url.replace(
    /^\/avatars\/AI\/(AI_normal(?:_[2-6])?|AI-(?:male|female)-[1-3])\.webp$/,
    (_, name: string) =>
      `/avatars/AI/${name.startsWith('AI_normal') ? 'normal' : 'study'}/${name}.webp`,
  )
}
