export type Role = 'adult' | 'child' | 'pet'

export type AccessType = 'personal' | 'shared-hub' | 'proxy'

export type UiMode = 'personal' | 'hub'

export type Screen =
  | 'home'
  | 'mood'
  | 'activities'
  | 'lore'
  | 'recap'
  | 'members'
  | 'storyboard'

export type MoodStateId = 'waiting' | 'cozy' | 'mixed' | 'playful' | 'steady'

export type MemoryType = 'text' | 'voice' | 'photo' | 'video'

export type AttachmentKind = 'image' | 'audio' | 'video'

export type PromptAudience = 'all' | 'little' | 'kid' | 'teen' | 'adult'

export interface MemoryAttachment {
  id: string
  kind: AttachmentKind
  name: string
  mimeType: string
  url: string
}

export interface Family {
  id: string
  name: string
  code: string
  motto: string
  createdAt: string
}

export interface Member {
  id: string
  name: string
  avatar: string
  role: Role
  accessType: AccessType
  profileTitle?: string
  birthdayLabel?: string
  profileSummary?: string
  interests?: string[]
  tags?: string[]
  proxyOwnerId?: string
}

export interface PromptTemplate {
  id: string
  text: string
  tags?: string[]
  audiences?: PromptAudience[]
}

export interface MoodOption {
  id: string
  label: string
  emoji: string
  animal: string
  energy: number
  description: string
}

export interface MoodEntry {
  id: string
  memberId: string
  moodId: string
  createdAt: string
}

export interface Activity {
  id: string
  title: string
  description: string
  durationMinutes: number
  tags: string[]
  interestTags?: string[]
  targetMemberIds?: string[]
  energy: 'low' | 'mixed' | 'high' | 'balanced'
  setting: 'indoor' | 'outdoor' | 'either'
  groupSize: 'solo' | 'small' | 'family'
}

export interface ActivityLog {
  id: string
  activityId: string
  memberId: string
  createdAt: string
}

export interface MemoryEntry {
  id: string
  authorId: string
  participants: string[]
  type: MemoryType
  prompt: string
  content: string
  attachments?: MemoryAttachment[]
  createdAt: string
}

export interface BadgeDefinition {
  id: string
  name: string
  description: string
  metric: 'memories' | 'moods' | 'activities'
  threshold: number
}

export interface WeeklyHero {
  memberId: string
  title: string
  reason: string
  score: number
}

export interface WeeklySummary {
  id: string
  weekLabel: string
  story: string
  hero: WeeklyHero
  participationStreak: number
  createdAt: string
}

export interface FamilyMoodSnapshot {
  id: MoodStateId
  label: string
  description: string
  averageEnergy: number
  memberCount: number
  loggedCount: number
}

export interface MemberStats {
  points: number
  moodLogs: number
  memoryEntries: number
  activitiesCompleted: number
  streak: number
  badges: BadgeDefinition[]
}

export interface AppState {
  family: Family
  members: Member[]
  moodOptions: MoodOption[]
  badgeDefinitions: BadgeDefinition[]
  activities: Activity[]
  moodEntries: MoodEntry[]
  activityLogs: ActivityLog[]
  memoryEntries: MemoryEntry[]
  weeklySummaries: WeeklySummary[]
  currentMemberId: string
  activeScreen: Screen
  uiMode: UiMode
}

export interface NewMemberInput {
  name: string
  avatar: string
  role: Role
  accessType: AccessType
  profileTitle?: string
  birthdayLabel?: string
  profileSummary?: string
  interests?: string[]
  tags?: string[]
  proxyOwnerId?: string
}

export interface NewMemoryInput {
  authorId: string
  participants: string[]
  type: MemoryType
  prompt: string
  content: string
  attachments?: MemoryAttachment[]
}