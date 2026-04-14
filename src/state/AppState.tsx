import {
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from 'react'
import { createSeedState } from '../data/mockData'
import {
  aggregateFamilyMood,
  buildWeeklySummary,
  generateId,
  getMemberStats,
  getTodayMoodMap,
  suggestActivities,
  upsertDailyMoodEntry,
} from '../lib/familyPulse'
import { FamilyPulseContext, type FamilyPulseContextValue } from './familyPulseContext'
import type { AppState, NewMemberInput, NewMemoryInput, Screen, UiMode } from '../types/family'

const STORAGE_KEY = 'family-pulse-state-v2'

type Action =
  | { type: 'set-screen'; screen: Screen }
  | { type: 'set-mode'; mode: UiMode }
  | { type: 'set-current-member'; memberId: string }
  | { type: 'log-mood'; memberId: string; moodId: string }
  | { type: 'add-memory'; payload: NewMemoryInput }
  | { type: 'complete-activity'; memberId: string; activityId: string }
  | { type: 'add-member'; payload: NewMemberInput }

function withDerivedData(state: AppState): AppState {
  return {
    ...state,
    weeklySummaries: [buildWeeklySummary(state)],
  }
}

function getInitialState() {
  const fallback = withDerivedData(createSeedState())
  const saved = window.localStorage.getItem(STORAGE_KEY)

  if (!saved) {
    return fallback
  }

  try {
    const parsed = JSON.parse(saved) as AppState
    return withDerivedData(parsed)
  } catch {
    return fallback
  }
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'set-screen':
      return {
        ...state,
        activeScreen: action.screen,
      }
    case 'set-mode':
      return {
        ...state,
        uiMode: action.mode,
      }
    case 'set-current-member':
      return {
        ...state,
        currentMemberId: action.memberId,
      }
    case 'log-mood': {
      const nextMoodEntries = upsertDailyMoodEntry(state.moodEntries, {
        id: generateId('mood'),
        memberId: action.memberId,
        moodId: action.moodId,
        createdAt: new Date().toISOString(),
      })

      return withDerivedData({
        ...state,
        moodEntries: nextMoodEntries,
      })
    }
    case 'add-memory': {
      return withDerivedData({
        ...state,
        memoryEntries: [
          {
            id: generateId('memory'),
            ...action.payload,
            createdAt: new Date().toISOString(),
          },
          ...state.memoryEntries,
        ],
      })
    }
    case 'complete-activity': {
      return withDerivedData({
        ...state,
        activityLogs: [
          {
            id: generateId('activity-log'),
            activityId: action.activityId,
            memberId: action.memberId,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLogs,
        ],
      })
    }
    case 'add-member': {
      return withDerivedData({
        ...state,
        members: [
          ...state.members,
          {
            id: generateId('member'),
            ...action.payload,
          },
        ],
      })
    }
    default:
      return state
  }
}

export function FamilyPulseProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, undefined, getInitialState)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const familyMood = useMemo(
    () => aggregateFamilyMood(state.members, state.moodEntries, state.moodOptions),
    [state.members, state.moodEntries, state.moodOptions],
  )
  const currentMember = useMemo(
    () => state.members.find((m) => m.id === state.currentMemberId),
    [state.members, state.currentMemberId],
  )
  const suggestedActivities = useMemo(
    () => suggestActivities(state.activities, familyMood, state.activityLogs, currentMember),
    [state.activities, familyMood, state.activityLogs, currentMember],
  )
  const todayMoodMap = useMemo(() => getTodayMoodMap(state.moodEntries), [state.moodEntries])
  const memberStatsById = useMemo(
    () =>
      Object.fromEntries(
        state.members.map((member) => [member.id, getMemberStats(member.id, state)]),
      ),
    [state],
  )

  const value = useMemo<FamilyPulseContextValue>(
    () => ({
      state,
      familyMood,
      suggestedActivities,
      todayMoodMap,
      memberStatsById,
      currentWeekSummary: state.weeklySummaries[0],
      actions: {
        setScreen: (screen) => dispatch({ type: 'set-screen', screen }),
        setMode: (mode) => dispatch({ type: 'set-mode', mode }),
        setCurrentMember: (memberId) => dispatch({ type: 'set-current-member', memberId }),
        logMood: (memberId, moodId) => dispatch({ type: 'log-mood', memberId, moodId }),
        addMemory: (payload) => dispatch({ type: 'add-memory', payload }),
        completeActivity: (memberId, activityId) =>
          dispatch({ type: 'complete-activity', memberId, activityId }),
        addMember: (payload) => dispatch({ type: 'add-member', payload }),
      },
    }),
    [familyMood, memberStatsById, state, suggestedActivities, todayMoodMap],
  )

  return <FamilyPulseContext.Provider value={value}>{children}</FamilyPulseContext.Provider>
}
