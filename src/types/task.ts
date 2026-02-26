import type { OrgMember } from "./organization"
import type { User } from "./user"
import type { Client, ClientStore } from "./client"

// Task Types
export type TaskType = "onboarding" | "campaign" | "request" | "general" | "meeting" | "deadline"
export type TaskStatus = "pending" | "in_progress" | "blocked" | "review" | "completed" | "cancelled"
export type TaskPriority = "low" | "medium" | "high" | "urgent"
export type TaskSourceType = "manual" | "auto_onboarding" | "auto_meeting" | "auto_campaign" | "auto_feedback" | "auto_report" | "auto_contract"

export interface Task {
  id: string
  title: string
  description?: string
  type: TaskType
  status: TaskStatus
  priority: TaskPriority
  assignee_id?: string
  created_by: string
  client_id?: string
  store_id?: string
  campaign_batch_id?: string
  source_type?: TaskSourceType
  source_id?: string
  due_date?: string
  started_at?: string
  completed_at?: string
  position: number
  metadata: Record<string, unknown>
  tags: string[]
  created_at: string
  updated_at: string
  // Joined data
  assignee?: OrgMember
  creator?: User
  client?: Client
  store?: ClientStore
  comments_count?: number
  checklists?: TaskChecklist[]
}

export interface TaskFormData {
  title: string
  description?: string
  type: TaskType
  priority: TaskPriority
  assignee_id?: string
  client_id?: string
  store_id?: string
  due_date?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  content: string
  mentions: string[]
  attachments: { url: string; name: string; type: string }[]
  created_at: string
  updated_at: string
  // Joined data
  author?: User
}

export interface TaskHistory {
  id: string
  task_id: string
  actor_id: string
  action: "created" | "updated" | "status_changed" | "assigned" | "commented"
  old_value?: Record<string, unknown>
  new_value?: Record<string, unknown>
  created_at: string
  // Joined data
  actor?: User
}

export interface TaskChecklist {
  id: string
  task_id: string
  title: string
  is_completed: boolean
  completed_by?: string
  completed_at?: string
  position: number
  created_at: string
}
