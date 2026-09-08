export type AgentRunType = 'onboarding' | 'topic_plan' | 'assessment'
export type AgentRunStatus =
  | 'collecting'
  | 'diagnosing'
  | 'drafting'
  | 'awaiting_confirmation'
  | 'assessing'
  | 'completed'
  | 'failed'
  | 'cancelled'
export type OutcomeType =
  | 'concept'
  | 'procedure'
  | 'analysis'
  | 'expression'
  | 'creation'
  | 'mixed'
export type Familiarity = 'new' | 'beginner' | 'intermediate' | 'advanced'

export interface AgentStep {
  step_id: string
  prompt: string
  input_type: string
  choices: string[]
  current: number
  total: number
}

export interface DiagnosticResult {
  score: number
  level: string
  domain: string
  outcome_type: OutcomeType
  strengths: string[]
  weaknesses: string[]
  graph_guidance: string[]
}

export interface PlanPreviewNode {
  key: string
  label: string
  sub?: string
  parent_keys: string[]
  estimated_minutes: number
  x: number
  y: number
}

export interface PlanPreviewItem {
  node_key: string
  scheduled_date: string
  day_order: number
  estimated_minutes: number
  status: 'pending' | 'completed'
}

export interface PlanPreview {
  topic: string
  emoji: string
  goal: string
  domain: string
  outcome_type: OutcomeType
  diagnostic: DiagnosticResult | null
  nodes: PlanPreviewNode[]
  plan_items: PlanPreviewItem[]
  total_minutes: number
  daily_minutes: number
  start_date: string
  estimated_end_date: string
  target_date: string | null
  will_miss_target: boolean
  delay_days: number
  effective_timezone: string
  risk_notice: string | null
}

export interface AssessmentScoreItem {
  question_id: string
  score: number
  rationale: string
}

export interface AssessmentResult {
  node_id: number
  node_label: string
  scores: AssessmentScoreItem[]
  total_score: number
  evaluation_confidence: number
  critical_misconception: boolean
  evidence: string
  weaknesses: string[]
  passed: boolean
  professional_review_required: boolean
  threshold: {
    minimum_score: number
    minimum_confidence: number
    requires_no_critical_misconception: boolean
  }
  next_actions: string[]
}

export interface AgentRunError {
  code: string
  retryable: boolean
}

export interface AgentRun {
  run_id: string
  type: AgentRunType
  status: AgentRunStatus
  version: number
  step: AgentStep | null
  preview: PlanPreview | null
  result: Record<string, unknown> | AssessmentResult | null
  error: AgentRunError | null
}

export interface OnboardingInput {
  topic: string
  goal: string
  domain: string
  outcome_type: OutcomeType
  familiarity: Familiarity
  daily_minutes: number
  target_date?: string | null
  timezone: string
  use_diagnostic: boolean
  session_id?: string | null
}

export type TopicPlanInput = Omit<OnboardingInput, 'topic'>

export interface AgentRunUpdate {
  goal?: string
  daily_minutes?: number
  target_date?: string | null
  timezone?: string
}

export type MemoryKind = 'goal' | 'background' | 'preference' | 'strength' | 'weakness'
export type MemorySource = 'user' | 'diagnostic' | 'assessment'

export interface Memory {
  id: number
  topic_id: number | null
  kind: MemoryKind
  content: string
  source: MemorySource
  confidence: number | null
  created_at: string
  updated_at: string
}

export interface MemoryInput {
  topic_id?: number | null
  kind: MemoryKind
  content: string
}

export type MemoryUpdate = Partial<MemoryInput>

export interface StudyPlanItem {
  id: number
  node_id: number
  node_key: string
  node_label: string
  scheduled_date: string
  day_order: number
  estimated_minutes: number
  status: 'pending' | 'completed'
  completed_at: string | null
}

export interface StudyPlan {
  id: number
  topic_id: number
  goal: string
  domain: string
  outcome_type: OutcomeType
  daily_minutes: number
  timezone: string
  start_date: string
  target_date: string | null
  estimated_end_date: string
  status: 'active' | 'completed' | 'cancelled'
  version: number
  will_miss_target: boolean
  total_minutes: number
  completed_minutes: number
  items: StudyPlanItem[]
}

export interface TodayPlanItem {
  plan_id: number
  topic_id: number
  topic_title: string
  topic_emoji: string
  node_id: number
  node_key: string
  node_label: string
  scheduled_date: string
  estimated_minutes: number
  status: 'pending' | 'completed'
  item_ids: number[]
  day_order: number
}

export interface TodayPlan {
  date: string
  effective_timezone: string
  replan_suggested: boolean
  today: TodayPlanItem[]
  overdue: TodayPlanItem[]
  upcoming: TodayPlanItem[]
}

export interface MasteryResult {
  event_id: number
  node_id: number
  state: 'mastered' | 'available' | 'locked'
  refresh_required: boolean
}

export type StructuredMessageType =
  | 'chat'
  | 'agent_step'
  | 'agent_answer'
  | 'plan_preview'
  | 'assessment_result'
  | 'agent_result'
  | 'agent_status'
