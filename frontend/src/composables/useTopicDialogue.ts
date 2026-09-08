import type { Message } from '../types'

export function useTopicDialogue() {
  function parseChoices(text: string): {
    cleanText: string
    choices: { label: string; text: string }[] | null
  } {
    const match = text.match(/\[CHOICES\]([\s\S]*?)\[ECHOICES\]/)
    if (!match) return { cleanText: text, choices: null }
    const cleanText = text.replace(/\s*\[CHOICES\][\s\S]*?\[ECHOICES\]\s*/g, '').trim()
    const lines = match[1].trim().split('\n').filter(Boolean)
    const choices = lines
      .map((line) => {
        const parsed = line.match(/^([A-F])[.、]\s*(.+?)(?:\s*[—\-–:：]\s*(.+))?$/)
        if (!parsed) return null
        return { label: parsed[1], text: parsed[2] + (parsed[3] ? ` —— ${parsed[3]}` : '') }
      })
      .filter((choice): choice is { label: string; text: string } => choice !== null)
    return { cleanText, choices: choices.length >= 2 ? choices : null }
  }

  function inferSelectedChoices(messages: Message[]) {
    for (let index = 0; index < messages.length - 1; index++) {
      const message = messages[index]
      if (message.role !== 'ai' || !message.choices?.length || message.selected_choice) continue
      const nextMessage = messages[index + 1]
      const labelMatch =
        nextMessage?.role === 'user' ? nextMessage.text.match(/^([A-F])[.、]/) : null
      if (labelMatch && message.choices.some((choice) => choice.label === labelMatch[1])) {
        message.selected_choice = labelMatch[1]
      }
    }
  }

  return { parseChoices, inferSelectedChoices }
}
