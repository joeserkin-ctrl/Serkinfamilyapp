import { createContext, useContext } from 'react'
import { aggregateFamilyMood, getMemberStats, getTodayMoodMap, suggestActivities } from '../lib/familyPulse'
import type { AppState, Member, NewMemberInput, NewMemoryInput, Screen, UiMode } from '../types/family'

export interface FamilyPulseContextValue {
  state: AppState
  familyMood: ReturnType<typeof aggregateFamilyMood>
  suggestedActivities: ReturnType<typeof suggestActivities>
  todayMoodMap: ReturnType<typeof getTodayMoodMap>
  memberStatsById: Record<string, ReturnType<typeof getMemberStats>>
  currentWeekSummary: AppState['weeklySummaries'][number]
  actions: {
    setScreen: (screen: Screen) => void
    setMode: (mode: UiMode) => void
    setCurrentMember: (memberId: string) => void
    logMood: (memberId: string, moodId: string) => void
    addMemory: (payload: NewMemoryInput) => void
    completeActivity: (memberId: string, activityId: string) => void
    addMember: (payload: NewMemberInput) => void
    updateMemberProfile: (memberId: string, patch: Pick<Member, 'interests' | 'tags'>) => void
  }
}

export const FamilyPulseContext = createContext<FamilyPulseContextValue | null>(null)

export function useFamilyPulse() {
  const context = useContext(FamilyPulseContext)
  if (!context) {
    throw new Error('useFamilyPulse must be used within FamilyPulseProvider')
  }

  return context
}