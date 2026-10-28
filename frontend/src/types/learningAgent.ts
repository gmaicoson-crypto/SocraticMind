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
export type OutcomeType = 'concept' | 'procedure' | 'analysis' | 'expression' | 'creation' | 'mixed'
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
  source_ids?: string[]
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
  sources?: import('./webSearch').FileSource[]
  evidence_warnings?: string[]
  evidence_unavailable?: boolean
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

export interface AssessmentRubricCriterion {
  criterion_id?: string
  criterion: string
  observable_standards: string[]
  max_score?: number
  scoring_rules?: { score: number; description: string }[]
}

export interface AssessmentCriterionScore {
  criterion_id: string
  score: number
  rationale: string
}

export interface AssessmentScoreItem {
  source_ids?: string[]
  question_id: string
  score: number
  max_score?: number
  question?: string
  answer?: string
  reference_answer?: string
  rationale: string
  mastery_analysis?: string
  suggestions?: string[]
  rubric?: AssessmentRubricCriterion[]
  criterion_scores?: AssessmentCriterionScore[]
}

export interface AssessmentRemediationStep {
  title: string
  action: string
  checkpoint: string
}

export interface AssessmentResult {
  sources?: import('./webSearch').FileSource[]
  evidence_unavailable?: boolean
  review_count?: number
  node_id: number
  node_label: string
  scores: AssessmentScoreItem[]
  total_score: number
  max_score?: number
  scoring_version?: number
  /** Legacy results only. */
  evaluation_confidence?: number
  critical_misconception?: boolean
  evidence: string
  weaknesses: string[]
  remediation_route?: AssessmentRemediationStep[]
  passed: boolean
  professional_review_required: boolean
  threshold: {
    minimum_score: number
    minimum_confidence?: number
    requires_no_critical_misconception?: boolean
  }
  next_actions: string[]
}

export interface AgentRunError {
  code: string
  retryable: boolean
}

export interface AssessmentHistoryItem {
  id: number
  run_id: string
  assessed_at: string
  total_score: number | null
  max_score: number
  passed: boolean
}

export interface AssessmentHistoryPage {
  items: AssessmentHistoryItem[]
  page: number
  page_size: number
  total: number
  total_pages: number
}

export interface AgentRun {
  run_id: string
  type: AgentRunType
  status: AgentRunStatus
  version: number
  processing?: boolean
  stage?: string | null
  session_id?: string | null
  step: AgentStep | null
  preview: PlanPreview | null
  result: Record<string, unknown> | AssessmentResult | null
  error: AgentRunError | null
}

export interface OnboardingInput {
  request_id?: string
  materials?: import('./knowledge').MaterialRef[]
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
  regenerate?: boolean
  request_id?: string
  version?: number
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
  reviews?: ReviewTask[]
  date: string
  effective_timezone: string
  replan_suggested: boolean
  today: TodayPlanItem[]
  overdue: TodayPlanItem[]
  upcoming: TodayPlanItem[]
}

export interface ReviewTask {
  id: number
  version: number
  topic_id: number
  topic_title: string
  node_id: number
  node_label: string
  due_date: string
  attempt_count: number
  prompt: string
}

export interface ReviewDetail {
  sources?: import('./webSearch').FileSource[]
  evidence_unavailable?: boolean
  id: number
  version: number
  status: 'pending' | 'resolved'
  due_date: string
  attempt_count: number
  node_label: string
  previous_answer: string
  feedback: string
  step: AgentStep
}

export interface ReviewResult {
  review_id: number
  version: number
  passed: boolean
  score: number
  evaluation_confidence: number
  critical_misconception: boolean
  rationale: string
  next_due_date: string | null
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
