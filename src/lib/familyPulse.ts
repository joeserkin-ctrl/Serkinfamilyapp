import type {
  Activity,
  ActivityLog,
  AppState,
  FamilyMoodSnapshot,
  Member,
  MemberStats,
  MoodEntry,
  MoodOption,
  WeeklyHero,
  WeeklySummary,
} from '../types/family'

const POINTS = {
  mood: 10,
  memory: 20,
  activity: 15,
} as const

const HERO_TITLES = {
  memories: 'Story Spark',
  moods: 'Mood Anchor',
  activities: 'Adventure Captain',
} as const

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function generateId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

export function localDayKey(dateValue: string | Date) {
  const date = new Date(dateValue)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function daysAgo(days: number, hour = 9) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function inLastSevenDays(createdAt: string) {
  const now = new Date()
  const candidate = new Date(createdAt)
  const diff = now.getTime() - candidate.getTime()
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000
}

function getMoodOptionMap(moodOptions: MoodOption[]) {
  return new Map(moodOptions.map((option) => [option.id, option]))
}

export function getTodayMoodMap(moodEntries: MoodEntry[]) {
  const today = localDayKey(new Date())
  return moodEntries.reduce<Record<string, MoodEntry>>((accumulator, entry) => {
    if (localDayKey(entry.createdAt) !== today) {
      return accumulator
    }

    const current = accumulator[entry.memberId]
    if (!current || new Date(entry.createdAt) > new Date(current.createdAt)) {
      accumulator[entry.memberId] = entry
    }

    return accumulator
  }, {})
}

export function aggregateFamilyMood(
  members: Member[],
  moodEntries: MoodEntry[],
  moodOptions: MoodOption[],
): FamilyMoodSnapshot {
  const todayMoodMap = getTodayMoodMap(moodEntries)
  const moodMap = getMoodOptionMap(moodOptions)
  const todaysMoods = members
    .map((member) => todayMoodMap[member.id])
    .filter(Boolean)
    .map((entry) => moodMap.get(entry!.moodId))
    .filter(Boolean)

  if (todaysMoods.length === 0) {
    return {
      id: 'waiting',
      label: 'Waiting for check-ins',
      description: 'No one has logged a mood yet, so Family Pulse is ready for the first check-in.',
      averageEnergy: 0,
      memberCount: members.length,
      loggedCount: 0,
    }
  }

  const energies = todaysMoods.map((mood) => mood!.energy)
  const averageEnergy = energies.reduce((sum, value) => sum + value, 0) / energies.length
  const spread = Math.max(...energies) - Math.min(...energies)

  if (spread >= 2 && todaysMoods.length >= 2) {
    return {
      id: 'mixed',
      label: 'Mixed / chaotic',
      description: 'Energy is spread across the family, so a short grounding activity will work best.',
      averageEnergy,
      memberCount: members.length,
      loggedCount: todaysMoods.length,
    }
  }

  if (averageEnergy <= 1.75) {
    return {
      id: 'cozy',
      label: 'Low energy / cozy',
      description: 'The family feels ready for something soft, close, and easy to start.',
      averageEnergy,
      memberCount: members.length,
      loggedCount: todaysMoods.length,
    }
  }

  if (averageEnergy >= 3.35) {
    return {
      id: 'playful',
      label: 'High energy / playful',
      description: 'Momentum is high today, so movement and playful collaboration are a good fit.',
      averageEnergy,
      memberCount: members.length,
      loggedCount: todaysMoods.length,
    }
  }

  return {
    id: 'steady',
    label: 'Steady / connected',
    description: 'The family is balanced enough for a shared activity or a reflective memory prompt.',
    averageEnergy,
    memberCount: members.length,
    loggedCount: todaysMoods.length,
  }
}

export function suggestActivities(
  activities: Activity[],
  snapshot: FamilyMoodSnapshot,
  activityLogs: ActivityLog[],
  currentMember?: Member,
): Activity[] {
  const today = localDayKey(new Date())
  const completedToday = new Set(
    activityLogs
      .filter((entry) => localDayKey(entry.createdAt) === today)
      .map((entry) => entry.activityId),
  )

  const desiredEnergy =
    snapshot.id === 'cozy'
      ? ['low', 'balanced']
      : snapshot.id === 'mixed'
        ? ['mixed', 'balanced']
        : snapshot.id === 'playful'
          ? ['high', 'balanced']
          : ['balanced', 'mixed', 'low']

  const memberInterests = new Set(currentMember?.interests ?? [])
  const memberId = currentMember?.id

  return activities
    .filter((activity) => desiredEnergy.includes(activity.energy))
    .map((activity) => {
      let score = 0
      if (completedToday.has(activity.id)) score -= 10
      if (memberId && activity.targetMemberIds?.includes(memberId)) score += 3
      const interestOverlap = activity.interestTags?.filter((tag) => memberInterests.has(tag)).length ?? 0
      score += interestOverlap * 2
      score -= activity.durationMinutes * 0.01
      return { activity, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ activity }) => activity)
}

function getActionDayKeys(values: string[]) {
  return new Set(values.map((value) => localDayKey(value)))
}

function getStreakFromDayKeys(dayKeys: Set<string>) {
  let streak = 0
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date()
    date.setDate(date.getDate() - offset)
    const dayKey = localDayKey(date)
    if (!dayKeys.has(dayKey)) {
      break
    }
    streak += 1
  }
  return streak
}

export function getFamilyParticipationStreak(state: Pick<AppState, 'moodEntries' | 'memoryEntries' | 'activityLogs'>) {
  const allDays = getActionDayKeys([
    ...state.moodEntries.map((entry) => entry.createdAt),
    ...state.memoryEntries.map((entry) => entry.createdAt),
    ...state.activityLogs.map((entry) => entry.createdAt),
  ])

  return getStreakFromDayKeys(allDays)
}

export function getMemberStats(memberId: string, state: AppState): MemberStats {
  const moodLogs = state.moodEntries.filter((entry) => entry.memberId === memberId)
  const memoryEntries = state.memoryEntries.filter((entry) => entry.authorId === memberId)
  const activityEntries = state.activityLogs.filter((entry) => entry.memberId === memberId)
  const streak = getStreakFromDayKeys(
    getActionDayKeys([
      ...moodLogs.map((entry) => entry.createdAt),
      ...memoryEntries.map((entry) => entry.createdAt),
      ...activityEntries.map((entry) => entry.createdAt),
    ]),
  )

  const points =
    moodLogs.length * POINTS.mood +
    memoryEntries.length * POINTS.memory +
    activityEntries.length * POINTS.activity

  const badges = state.badgeDefinitions.filter((badge) => {
    const value =
      badge.metric === 'moods'
        ? moodLogs.length
        : badge.metric === 'memories'
          ? memoryEntries.length
          : activityEntries.length
    return value >= badge.threshold
  })

  return {
    points,
    moodLogs: moodLogs.length,
    memoryEntries: memoryEntries.length,
    activitiesCompleted: activityEntries.length,
    streak,
    badges,
  }
}

export function getWeeklyHero(state: AppState): WeeklyHero {
  const weeklyMoodLogs = state.moodEntries.filter((entry) => inLastSevenDays(entry.createdAt))
  const weeklyMemories = state.memoryEntries.filter((entry) => inLastSevenDays(entry.createdAt))
  const weeklyActivities = state.activityLogs.filter((entry) => inLastSevenDays(entry.createdAt))

  const heroCandidates = state.members.map((member) => {
    const moods = weeklyMoodLogs.filter((entry) => entry.memberId === member.id).length
    const memories = weeklyMemories.filter((entry) => entry.authorId === member.id).length
    const activities = weeklyActivities.filter((entry) => entry.memberId === member.id).length
    const score = moods * 2 + memories * 3 + activities * 2
    const bestMetric =
      memories >= moods && memories >= activities
        ? 'memories'
        : moods >= activities
          ? 'moods'
          : 'activities'

    return {
      memberId: member.id,
      title: HERO_TITLES[bestMetric],
      reason:
        bestMetric === 'memories'
          ? `Added ${memories} memory entries this week.`
          : bestMetric === 'moods'
            ? `Logged moods consistently ${moods} times this week.`
            : `Completed ${activities} family activities this week.`,
      score,
    }
  })

  return heroCandidates.sort((left, right) => right.score - left.score)[0]
}

function getWeekLabel() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - 6)
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export function buildWeeklySummary(state: AppState): WeeklySummary {
  const weeklyHero = getWeeklyHero(state)
  const recentMemories = state.memoryEntries.filter((entry) => inLastSevenDays(entry.createdAt)).slice(0, 3)
  const memoryAuthors = recentMemories
    .map((entry) => state.members.find((member) => member.id === entry.authorId)?.name)
    .filter(Boolean)
    .join(', ')

  const activityCount = state.activityLogs.filter((entry) => inLastSevenDays(entry.createdAt)).length
  const moodSnapshot = aggregateFamilyMood(state.members, state.moodEntries, state.moodOptions)
  const story = recentMemories.length
    ? `${state.family.name} spent the week in a ${moodSnapshot.label.toLowerCase()} rhythm. ${memoryAuthors || 'The family'} captured ${recentMemories.length} memories, and the group completed ${activityCount} shared activity${activityCount === 1 ? '' : 'ies'} while keeping the family streak alive.`
    : `${state.family.name} is building its Family Lore. This week focused on ${moodSnapshot.label.toLowerCase()} energy, with room to add fresh memories and short activities.`

  return {
    id: generateId('weekly-summary'),
    weekLabel: getWeekLabel(),
    story,
    hero: weeklyHero,
    participationStreak: getFamilyParticipationStreak(state),
    createdAt: new Date().toISOString(),
  }
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

export function upsertDailyMoodEntry(moodEntries: MoodEntry[], nextEntry: MoodEntry) {
  const today = localDayKey(nextEntry.createdAt)
  return [
    ...moodEntries.filter(
      (entry) => !(entry.memberId === nextEntry.memberId && localDayKey(entry.createdAt) === today),
    ),
    nextEntry,
  ]
}