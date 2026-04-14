import {
  startTransition,
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { promptLibrary } from '../data/mockData'
import { formatTimestamp, localDayKey } from '../lib/familyPulse'
import { useFamilyPulse } from '../state/familyPulseContext'
import type {
  AttachmentKind,
  MemoryAttachment,
  MemoryType,
  NewMemoryInput,
  PromptAudience,
  Screen,
} from '../types/family'
import { VoiceComposer } from './VoiceComposer'
import { ArchiveExplorer } from './ArchiveExplorer'
import { MediaRecorderCapture } from './MediaRecorderCapture'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'mood', label: 'Mood Check' },
  { id: 'home', label: 'Dashboard' },
  { id: 'activities', label: 'Activities' },
  { id: 'lore', label: 'Family Lore' },
  { id: 'recap', label: 'Weekly Recap' },
  { id: 'members', label: 'Members' },
  { id: 'storyboard', label: 'Storyboard' },
]

const memoryTypeLabels: Record<MemoryType, string> = {
  text: 'Text',
  voice: 'Voice',
  photo: 'Photo',
  video: 'Video',
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const DAILY_PROMPT_LIMIT = 3
const DAILY_TASK_POINTS = {
  mood: 10,
  activity: 15,
  prompt: 20,
} as const

const entryTypeByAttachmentKind: Record<AttachmentKind, MemoryType> = {
  image: 'photo',
  audio: 'voice',
  video: 'video',
}

function readBlobAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Unable to read media file'))
    reader.readAsDataURL(file)
  })
}

function scoreLine(label: string, value: string | number) {
  return (
    <div className="rounded-3xl border border-stone-900/10 bg-stone-50/90 p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-stone-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-stone-950">{value}</p>
    </div>
  )
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase()
}

const familyTimeline = [
  { date: 'November 2007', title: 'The adventure begins', description: 'Joe and Yonit meet.' },
  { date: 'December 21, 2008', title: 'Wedding day', description: 'Joe and Yonit get married.' },
  { date: 'July 10, 2010', title: 'Move to Israel', description: 'A new chapter begins in Israel.' },
  { date: 'May 3, 2012', title: 'Amichai arrives', description: 'The family grows with its first child.' },
  { date: 'February 11, 2014', title: 'Tal arrives', description: 'More movement, more energy, more joy.' },
  { date: 'February 2, 2017', title: 'Lila arrives', description: 'A creative and fearless new spark joins the story.' },
  { date: 'October 19, 2020', title: 'Leo arrives', description: 'Laughter and little-kid chaos level up the house.' },
] as const

const crestPanels = [
  { icon: '✡', title: 'Jewish + Israel', copy: 'Heritage, faith, and home.' },
  { icon: '🧭', title: 'Poland · Belarus · America', copy: 'Roots carried across generations.' },
  { icon: '✈️', title: 'Travel + Adventure', copy: 'A family built through movement and discovery.' },
  { icon: '💻', title: 'Technology + Togetherness', copy: 'Curiosity, connection, and building together.' },
] as const

function getAgeFromBirthdayLabel(birthdayLabel?: string) {
  if (!birthdayLabel) {
    return null
  }

  const parsed = new Date(birthdayLabel)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  const now = new Date()
  let age = now.getFullYear() - parsed.getFullYear()
  const monthDiff = now.getMonth() - parsed.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsed.getDate())) {
    age -= 1
  }

  return age
}

export function FamilyPulseShell() {
  const {
    state,
    suggestedActivities,
    todayMoodMap,
    memberStatsById,
    currentWeekSummary,
    actions,
  } = useFamilyPulse()

  const currentMember =
    state.members.find((member) => member.id === state.currentMemberId) ?? state.members[0]
  const deferredMemories = useDeferredValue(state.memoryEntries)
  const [profileLockedIn, setProfileLockedIn] = useState(false)
  const [promptOffset, setPromptOffset] = useState(0)
  const [loreMode, setLoreMode] = useState<'prompt' | 'quick'>('prompt')
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null)
  const audioUploadInputRef = useRef<HTMLInputElement | null>(null)
  const videoUploadInputRef = useRef<HTMLInputElement | null>(null)
  const [interestInput, setInterestInput] = useState((currentMember.interests ?? []).join(', '))
  const [tagInput, setTagInput] = useState((currentMember.tags ?? []).join(', '))

  const [memoryForm, setMemoryForm] = useState<NewMemoryInput>({
    authorId: state.currentMemberId,
    participants: [state.currentMemberId],
    type: 'text',
    prompt: promptLibrary[0]?.text ?? 'Capture one meaningful moment from today.',
    content: '',
    attachments: [],
  })

  const [uploadNotice, setUploadNotice] = useState('')

  const hubMode = state.uiMode === 'hub'
  const currentMemberStats = memberStatsById[currentMember.id]
  const currentMemberMood = state.moodOptions.find(
    (option) => option.id === todayMoodMap[currentMember.id]?.moodId,
  )
  const todayKey = localDayKey(new Date())
  const todayActivityCount = useMemo(
    () =>
      state.activityLogs.filter(
        (entry) => entry.memberId === currentMember.id && localDayKey(entry.createdAt) === todayKey,
      ).length,
    [state.activityLogs, currentMember.id, todayKey],
  )
  const todayPromptResponseCount = useMemo(
    () =>
      state.memoryEntries.filter(
        (entry) =>
          entry.authorId === currentMember.id &&
          localDayKey(entry.createdAt) === todayKey &&
          entry.prompt !== 'Quick capture',
      ).length,
    [state.memoryEntries, currentMember.id, todayKey],
  )
  const todayUploadCount = useMemo(
    () =>
      state.memoryEntries.filter(
        (entry) =>
          entry.authorId === currentMember.id &&
          localDayKey(entry.createdAt) === todayKey &&
          (entry.attachments?.length ?? 0) > 0,
      ).length,
    [state.memoryEntries, currentMember.id, todayKey],
  )
  const remainingPromptResponses = Math.max(0, DAILY_PROMPT_LIMIT - todayPromptResponseCount)
  const todaysEngagementPoints =
    (currentMemberMood ? DAILY_TASK_POINTS.mood : 0) +
    (todayActivityCount > 0 ? DAILY_TASK_POINTS.activity : 0) +
    Math.min(todayPromptResponseCount, DAILY_PROMPT_LIMIT) * DAILY_TASK_POINTS.prompt
  const isChildProfile = currentMember.role === 'child'
  const isArchiveAdmin = currentMember.id === 'member-yonit' || currentMember.id === 'member-joe'
  const currentMemberAge = getAgeFromBirthdayLabel(currentMember.birthdayLabel)
  const childAgeTier =
    isChildProfile && currentMemberAge !== null
      ? currentMemberAge <= 6
        ? 'little'
        : currentMemberAge <= 11
          ? 'kid'
          : 'teen'
      : null
  const audienceBucket: PromptAudience = currentMember.role === 'adult'
    ? 'adult'
    : childAgeTier ?? 'all'
  const memberPromptTags = useMemo(
    () => new Set([...(currentMember.interests ?? []), ...(currentMember.tags ?? [])].map(normalizeTag)),
    [currentMember.interests, currentMember.tags],
  )
  const currentPrompt = useMemo(() => {
    if (promptLibrary.length === 0) {
      return 'Capture one meaningful moment from today.'
    }

    const eligiblePrompts = promptLibrary.filter((prompt) => {
      const audiences = prompt.audiences ?? ['all']
      return audiences.includes('all') || audiences.includes(audienceBucket)
    })

    const rankedPrompts = eligiblePrompts
      .map((prompt, index) => ({
        prompt,
        index,
        score: (prompt.tags ?? []).filter((tag) => memberPromptTags.has(normalizeTag(tag))).length,
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index)

    const promptPool = rankedPrompts.length > 0 ? rankedPrompts.map((item) => item.prompt) : promptLibrary
    const seed = `${currentMember.id}-${todayKey}`
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)

    return promptPool[(seed + promptOffset) % promptPool.length]?.text ?? 'Capture one meaningful moment from today.'
  }, [audienceBucket, currentMember.id, memberPromptTags, promptOffset, todayKey])
  const level = Math.floor(currentMemberStats.points / 100) + 1
  const currentLevelFloor = (level - 1) * 100
  const nextLevelAt = level * 100
  const pointsIntoLevel = currentMemberStats.points - currentLevelFloor
  const pointsPerLevel = nextLevelAt - currentLevelFloor
  const levelProgress = Math.min(100, Math.round((pointsIntoLevel / pointsPerLevel) * 100))
  const nextBadgeTarget = useMemo(() => {
    const currentCounts = {
      moods: currentMemberStats.moodLogs,
      memories: currentMemberStats.memoryEntries,
      activities: currentMemberStats.activitiesCompleted,
    }

    const missing = state.badgeDefinitions
      .filter((badge) => !currentMemberStats.badges.some((owned) => owned.id === badge.id))
      .map((badge) => {
        const value = currentCounts[badge.metric]
        return {
          ...badge,
          remaining: Math.max(0, badge.threshold - value),
          progressLabel: `${value}/${badge.threshold}`,
        }
      })
      .sort((a, b) => a.remaining - b.remaining)

    return missing[0]
  }, [currentMemberStats, state.badgeDefinitions])
  const childTheme = childAgeTier === 'little'
    ? {
        progressLabel: 'Star path',
        levelLabel: 'Star Level',
        questBoardLabel: 'Adventure map',
        xpLabel: 'Sparkles today',
        pendingIcon: '🪄',
        completeIcon: '🌟',
        shellClass: 'border-pink-200 bg-pink-50/80',
        accentTextClass: 'text-pink-700',
        pillClass: 'bg-pink-200 text-pink-900',
        barClass: 'bg-pink-400',
        rewardTitle: 'Treasure chest',
      }
    : childAgeTier === 'teen'
      ? {
          progressLabel: 'Rank progress',
          levelLabel: 'Rank',
          questBoardLabel: 'Mission board',
          xpLabel: 'XP today',
          pendingIcon: '⚡',
          completeIcon: '✅',
          shellClass: 'border-sky-200 bg-sky-50/80',
          accentTextClass: 'text-sky-700',
          pillClass: 'bg-sky-200 text-sky-900',
          barClass: 'bg-sky-500',
          rewardTitle: 'Unlock track',
        }
      : {
          progressLabel: 'Level progress',
          levelLabel: 'Level',
          questBoardLabel: 'Quest board',
          xpLabel: 'Daily XP',
          pendingIcon: '🎯',
          completeIcon: '🏆',
          shellClass: 'border-amber-200 bg-amber-50/80',
          accentTextClass: 'text-amber-700',
          pillClass: 'bg-amber-200 text-amber-900',
          barClass: 'bg-amber-400',
          rewardTitle: 'Reward unlocks',
        }
  const rewardUnlocks = childAgeTier === 'little'
    ? [
        { level: 2, title: 'Sticker pop', description: 'Unlock a pretend sticker shower celebration.' },
        { level: 3, title: 'Dance break', description: 'Earn a mini dance-party reward with the family.' },
        { level: 5, title: 'Super helper cape', description: 'Unlock your next big-helper title at home.' },
      ]
    : childAgeTier === 'teen'
      ? [
          { level: 2, title: 'Streak status', description: 'Unlock a stronger profile rank and streak flex.' },
          { level: 4, title: 'Creator badge', description: 'Unlock a milestone badge for consistent entries.' },
          { level: 6, title: 'Captain tier', description: 'Reach captain tier with stronger momentum.' },
        ]
      : [
          { level: 2, title: 'Bonus badge', description: 'Unlock a new badge milestone.' },
          { level: 4, title: 'Challenge champ', description: 'Earn a bigger daily challenge title.' },
          { level: 6, title: 'Adventure captain', description: 'Hit a major progression milestone.' },
        ]
  const nextRewardUnlock = rewardUnlocks.find((reward) => reward.level > level) ?? rewardUnlocks[rewardUnlocks.length - 1]

  const dailyChecklist = [
    {
      id: 'mood',
      label: 'Log mood check-in',
      done: Boolean(currentMemberMood),
      progress: currentMemberMood ? 'Done' : 'Not yet',
      points: DAILY_TASK_POINTS.mood,
      screen: 'mood' as Screen,
    },
    {
      id: 'activity',
      label: 'Complete one activity',
      done: todayActivityCount > 0,
      progress: `${Math.min(todayActivityCount, 1)}/1`,
      points: DAILY_TASK_POINTS.activity,
      screen: 'activities' as Screen,
    },
    {
      id: 'prompt',
      label: `Respond to lore prompts (${DAILY_PROMPT_LIMIT}/day max)`,
      done: todayPromptResponseCount >= DAILY_PROMPT_LIMIT,
      progress: `${todayPromptResponseCount}/${DAILY_PROMPT_LIMIT}`,
      points: DAILY_TASK_POINTS.prompt,
      screen: 'lore' as Screen,
    },
    {
      id: 'upload',
      label: 'Upload or record at least one media memory',
      done: todayUploadCount > 0,
      progress: todayUploadCount > 0 ? 'Done' : 'Optional bonus',
      points: 0,
      screen: 'lore' as Screen,
    },
  ] as const
  const childQuestBoard = childAgeTier === 'little'
    ? [
        {
          id: 'quest-mood',
          title: 'Mood sticker',
          target: 'Pick the face that matches your day',
          done: Boolean(currentMemberMood),
          reward: '+10 sparkles',
          screen: 'mood' as Screen,
        },
        {
          id: 'quest-activity',
          title: 'Play quest',
          target: 'Do one fun activity today',
          done: todayActivityCount > 0,
          reward: '+15 sparkles',
          screen: 'activities' as Screen,
        },
        {
          id: 'quest-lore',
          title: 'Story star',
          target: 'Share up to 3 little stories or pictures',
          done: todayPromptResponseCount >= DAILY_PROMPT_LIMIT,
          reward: `+${DAILY_TASK_POINTS.prompt * DAILY_PROMPT_LIMIT} sparkles max`,
          screen: 'lore' as Screen,
        },
      ]
    : childAgeTier === 'teen'
      ? [
          {
            id: 'quest-mood',
            title: 'Check-in complete',
            target: 'Log your mood once today',
            done: Boolean(currentMemberMood),
            reward: '+10 XP',
            screen: 'mood' as Screen,
          },
          {
            id: 'quest-activity',
            title: 'Momentum',
            target: 'Finish one activity challenge',
            done: todayActivityCount > 0,
            reward: '+15 XP',
            screen: 'activities' as Screen,
          },
          {
            id: 'quest-lore',
            title: 'Creator streak',
            target: 'Respond to up to 3 lore prompts',
            done: todayPromptResponseCount >= DAILY_PROMPT_LIMIT,
            reward: `+${DAILY_TASK_POINTS.prompt * DAILY_PROMPT_LIMIT} XP max`,
            screen: 'lore' as Screen,
          },
        ]
      : [
          {
            id: 'quest-mood',
            title: 'Mood Hero',
            target: 'Log your mood once today',
            done: Boolean(currentMemberMood),
            reward: '+10 XP',
            screen: 'mood' as Screen,
          },
          {
            id: 'quest-activity',
            title: 'Action Star',
            target: 'Complete one activity',
            done: todayActivityCount > 0,
            reward: '+15 XP',
            screen: 'activities' as Screen,
          },
          {
            id: 'quest-lore',
            title: 'Story Builder',
            target: 'Answer up to 3 lore prompts',
            done: todayPromptResponseCount >= DAILY_PROMPT_LIMIT,
            reward: `+${DAILY_TASK_POINTS.prompt * DAILY_PROMPT_LIMIT} XP max`,
            screen: 'lore' as Screen,
          },
        ]

  const visibleMemories = useMemo(
    () => deferredMemories.filter((entry) => entry.authorId === currentMember.id),
    [deferredMemories, currentMember.id],
  )

  function navigate(screen: Screen) {
    startTransition(() => actions.setScreen(screen))
  }

  function selectProfile(memberId: string) {
    const selectedMember = state.members.find((member) => member.id === memberId)
    actions.setCurrentMember(memberId)
    actions.setScreen('mood')
    setPromptOffset(0)
    setLoreMode('prompt')
    setInterestInput((selectedMember?.interests ?? []).join(', '))
    setTagInput((selectedMember?.tags ?? []).join(', '))
    setMemoryForm((current) => ({
      ...current,
      authorId: memberId,
      participants: [memberId],
      prompt: promptLibrary[0]?.text ?? 'Capture one meaningful moment from today.',
      content: '',
      attachments: [],
    }))
    setProfileLockedIn(true)
  }

  function saveProfileKeywords() {
    const interests = interestInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const tags = tagInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    actions.updateMemberProfile(currentMember.id, { interests, tags })
    setUploadNotice('Profile interests and tags updated.')
  }

  function handleMoodSelection(moodId: string) {
    actions.logMood(currentMember.id, moodId)
    navigate('home')
  }

  function submitMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedContent = memoryForm.content.trim()
    const hasAttachments = (memoryForm.attachments?.length ?? 0) > 0

    if (loreMode === 'prompt' && remainingPromptResponses === 0) {
      setUploadNotice(`You have reached today's prompt limit (${DAILY_PROMPT_LIMIT}). You can still use Quick capture.`)
      return
    }

    if (!trimmedContent && !hasAttachments) {
      return
    }

    const selectedPrompt = loreMode === 'prompt' ? currentPrompt : 'Quick capture'

    actions.addMemory({
      ...memoryForm,
      authorId: state.currentMemberId,
      prompt: selectedPrompt,
      content: trimmedContent || (loreMode === 'prompt' ? 'Prompt response saved.' : 'Media moment saved.'),
      participants: [state.currentMemberId],
      attachments: hasAttachments ? memoryForm.attachments : undefined,
    })

    if (loreMode === 'prompt') {
      setPromptOffset((current) => current + 1)
    }

    setMemoryForm((current) => ({
      ...current,
      authorId: state.currentMemberId,
      prompt: selectedPrompt,
      content: '',
      attachments: [],
      participants: [state.currentMemberId],
    }))
    setUploadNotice('')
  }

  async function handleAttachmentUpload(
    event: ChangeEvent<HTMLInputElement>,
    kind: AttachmentKind,
  ) {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    const allowed = files.filter((file) => file.size <= MAX_UPLOAD_BYTES)
    const rejectedCount = files.length - allowed.length

    try {
      const uploads: MemoryAttachment[] = await Promise.all(
        allowed.map(async (file) => ({
          id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          kind,
          name: file.name,
          mimeType: file.type || `${kind}/*`,
          url: await readBlobAsDataUrl(file),
        })),
      )

      setMemoryForm((current) => ({
        ...current,
        type: entryTypeByAttachmentKind[kind],
        attachments: [...(current.attachments ?? []), ...uploads].slice(0, 8),
      }))

      if (rejectedCount > 0) {
        setUploadNotice(`${rejectedCount} file(s) were skipped because they are larger than 15 MB.`)
      } else {
        setUploadNotice('Media added. Ready to save this memory entry.')
      }
    } catch {
      setUploadNotice('One or more files could not be processed. Please try again.')
    }

    event.target.value = ''
  }

  async function handleRecordedCapture(payload: {
    blob: Blob
    kind: Extract<AttachmentKind, 'audio' | 'video'>
    mimeType: string
    suggestedName: string
  }) {
    const attachment: MemoryAttachment = {
      id: `${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind: payload.kind,
      name: payload.suggestedName,
      mimeType: payload.mimeType,
      url: await readBlobAsDataUrl(payload.blob),
    }

    setMemoryForm((current) => ({
      ...current,
      type: entryTypeByAttachmentKind[payload.kind],
      attachments: [...(current.attachments ?? []), attachment].slice(0, 8),
    }))
    setUploadNotice(
      payload.kind === 'audio'
        ? 'Voice note recorded and attached.'
        : 'Video snippet recorded and attached.',
    )
  }

  function removeAttachment(index: number) {
    setMemoryForm((current) => ({
      ...current,
      attachments: (current.attachments ?? []).filter((_, attachmentIndex) => attachmentIndex !== index),
    }))
  }

  function selectEntryType(type: MemoryType) {
    setMemoryForm((current) => ({ ...current, type }))

    if (type === 'photo') {
      imageUploadInputRef.current?.click()
      return
    }

    if (type === 'voice') {
      audioUploadInputRef.current?.click()
      return
    }

    if (type === 'video') {
      videoUploadInputRef.current?.click()
    }
  }

  if (!profileLockedIn) {
    return (
      <main className="min-h-screen bg-transparent px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl space-y-8 py-6 sm:py-10">
          <section className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-[radial-gradient(circle_at_top,rgba(255,247,220,0.94),rgba(245,237,224,0.9)_45%,rgba(238,232,225,0.96))] p-6 shadow-[0_24px_80px_rgba(120,113,108,0.16)] sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
              <div className="space-y-6">
                <p className="text-xs uppercase tracking-[0.28em] text-stone-600">Serkin Family Archive</p>
                <h1 className="max-w-4xl font-serif text-4xl tracking-tight text-stone-950 sm:text-6xl">
                  Welcome to the Serkin Family Lore Archive.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-stone-700 sm:text-lg">
                  A family crest for roots in Jewish history, Israel, Poland, Belarus, America, and a life shaped by travel, technology, togetherness, and family.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {crestPanels.map((panel) => (
                    <div key={panel.title} className="rounded-[1.5rem] border border-stone-900/10 bg-white/75 p-4 backdrop-blur">
                      <p className="text-2xl">{panel.icon}</p>
                      <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-stone-800">{panel.title}</p>
                      <p className="mt-2 text-sm leading-6 text-stone-600">{panel.copy}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-stone-900/10 bg-white/70 p-5 backdrop-blur">
                <div className="mx-auto grid h-[21rem] w-[min(22rem,100%)] grid-cols-2 overflow-hidden rounded-[2.5rem_2.5rem_3.5rem_3.5rem] border-[10px] border-stone-950/90 bg-stone-950 shadow-[0_18px_45px_rgba(41,37,36,0.22)]">
                  <div className="flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#f7e9b4,#f0c95f)] p-4 text-center">
                    <span className="text-4xl">✡</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-800">Jewish</span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#dbeafe,#8ec5ff)] p-4 text-center">
                    <span className="text-4xl">🕍</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-800">Israel</span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#fbe2e2,#f4a8a8)] p-4 text-center">
                    <span className="text-4xl">🧭</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-800">Poland · Belarus · America</span>
                  </div>
                  <div className="flex flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#dff6ea,#9fdeb9)] p-4 text-center">
                    <span className="text-4xl">🏠</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-800">Travel · Tech · Family</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Family timeline</p>
            <h2 className="mt-2 font-serif text-3xl tracking-tight text-stone-950">The story so far</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {familyTimeline.map((event) => (
                <article key={event.date + event.title} className="rounded-[1.5rem] border border-stone-900/10 bg-stone-50/90 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">{event.date}</p>
                  <h3 className="mt-2 text-xl font-semibold text-stone-950">{event.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{event.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => selectProfile(member.id)}
                className="rounded-[1.75rem] border border-stone-900/10 bg-white/85 p-5 text-left shadow-sm transition hover:border-stone-900/30 hover:shadow-md"
              >
                <p className="text-2xl font-semibold text-stone-950">{member.avatar} {member.name}</p>
              </button>
            ))}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-5 pb-24 text-stone-950 sm:px-6 sm:pb-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-[linear-gradient(135deg,rgba(255,252,245,0.96),rgba(248,241,228,0.92))] p-5 shadow-[0_24px_80px_rgba(120,113,108,0.16)] sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-stone-900/10 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-stone-600">
                  Family Pulse
                </span>
                <span className="rounded-full bg-stone-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-stone-50">
                  Code {state.family.code}
                </span>
              </div>
              <h1 className="mt-6 max-w-4xl font-serif text-4xl tracking-tight text-stone-950 sm:text-6xl">
                Welcome, {currentMember.name}
              </h1>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => navigate('mood')}
                  className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-stone-50 transition hover:bg-stone-800"
                >
                  Log today&apos;s mood
                </button>
                <button
                  type="button"
                  onClick={() => navigate('lore')}
                  className="rounded-full border border-stone-900/15 bg-white/80 px-6 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-900/30"
                >
                  Add a family memory
                </button>
                <button
                  type="button"
                  onClick={() => setProfileLockedIn(false)}
                  className="rounded-full border border-stone-900/15 bg-white/80 px-6 py-3 text-sm font-semibold text-stone-800 transition hover:border-stone-900/30"
                >
                  Switch profile
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {scoreLine('My mood', currentMemberMood?.label ?? 'Not logged yet')}
              {scoreLine('My streak', `${currentMemberStats.streak} days`)}
              {scoreLine('My points', currentMemberStats.points)}
              {scoreLine('My logs today', currentMemberMood ? '1/1' : '0/1')}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-4 backdrop-blur sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-wrap gap-2">
              {screens.map((screen) => (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => navigate(screen.id)}
                  className={state.activeScreen === screen.id
                    ? hubMode
                      ? 'rounded-2xl bg-stone-950 px-5 py-4 text-base font-semibold text-stone-50'
                      : 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                    : hubMode
                      ? 'rounded-2xl border border-stone-900/15 bg-stone-50 px-5 py-4 text-base font-medium text-stone-700'
                      : 'rounded-full border border-stone-900/15 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                >
                  {screen.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm text-stone-600">
                Current member: <span className="font-semibold text-stone-900">{currentMember.avatar} {currentMember.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setProfileLockedIn(false)}
                className="rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
              >
                Switch profile
              </button>
            </div>
          </div>
        </section>

        <section className="fixed inset-x-0 bottom-3 z-40 mx-auto w-[min(92vw,34rem)] rounded-[1.4rem] border border-stone-900/10 bg-white/95 p-2 shadow-[0_16px_45px_rgba(41,37,36,0.16)] backdrop-blur lg:hidden">
          <div className="grid grid-cols-3 gap-2">
            {screens.slice(0, 3).map((screen) => (
              <button
                key={screen.id}
                type="button"
                onClick={() => navigate(screen.id)}
                className={state.activeScreen === screen.id
                  ? 'rounded-xl bg-stone-950 px-2 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-50'
                  : 'rounded-xl bg-stone-100 px-2 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700'}
              >
                {screen.label}
              </button>
            ))}
          </div>
        </section>

        {state.activeScreen === 'home' && (
          <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Today&apos;s pulse</p>
                <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Your daily pulse</h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-stone-700">
                  Focused personal space for {currentMember.name}. Family-wide story browsing is available in Storyboard.
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-3xl bg-stone-50/90 p-4">
                    <p className="text-sm font-semibold text-stone-900">{currentMember.avatar} {currentMember.name}</p>
                    <p className="mt-2 text-sm text-stone-600">
                      {currentMemberMood ? `${currentMemberMood.emoji} ${currentMemberMood.label}` : 'Waiting for check-in'}
                    </p>
                  </div>
                  <div className="rounded-3xl bg-stone-50/90 p-4">
                    <p className="text-sm font-semibold text-stone-900">Weekly progress</p>
                    <p className="mt-2 text-sm text-stone-600">
                      {currentMemberStats.moodLogs} moods · {currentMemberStats.memoryEntries} memories · {currentMemberStats.activitiesCompleted} activities
                    </p>
                  </div>
                </div>
              </article>

              <article className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.2)]">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Suggested next</p>
                <div className="mt-5 space-y-4">
                  {suggestedActivities.map((activity) => (
                    <div key={activity.id} className="rounded-3xl border border-white/10 bg-white/6 p-5">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h3 className="text-xl font-semibold">{activity.title}</h3>
                          <p className="mt-2 text-sm leading-6 text-stone-300">{activity.description}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => actions.completeActivity(state.currentMemberId, activity.id)}
                          className="rounded-full bg-orange-300 px-5 py-3 text-sm font-semibold text-stone-950"
                        >
                          Mark done for {currentMember.name}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="space-y-6">
              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Quick actions</p>
                <div className="mt-5 grid gap-4">
                  <button
                    type="button"
                    onClick={() => navigate('mood')}
                    className="rounded-3xl border border-stone-900/10 bg-stone-50 px-5 py-4 text-left text-base font-semibold text-stone-900 transition hover:border-stone-900/25"
                  >
                    Log mood in under 10 seconds
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('lore')}
                    className="rounded-3xl border border-stone-900/10 bg-stone-50 px-5 py-4 text-left text-base font-semibold text-stone-900 transition hover:border-stone-900/25"
                  >
                    Capture a voice, text, or photo memory
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('members')}
                    className="rounded-3xl border border-stone-900/10 bg-stone-50 px-5 py-4 text-left text-base font-semibold text-stone-900 transition hover:border-stone-900/25"
                  >
                    Add a shared-device or proxy member
                  </button>
                </div>
              </article>

              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Weekly hero</p>
                <h3 className="mt-3 text-3xl font-semibold text-stone-950">{currentMember.name}</h3>
                <p className="mt-2 text-sm font-medium uppercase tracking-[0.24em] text-orange-600">
                  Personal snapshot
                </p>
                <p className="mt-4 text-base leading-7 text-stone-700">
                  You are on a {currentMemberStats.streak}-day participation streak with {currentMemberStats.points} points total.
                </p>
              </article>
            </div>
          </section>
        )}

        {state.activeScreen === 'mood' && (
          <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Mood check-in</p>
                <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Fast daily check-in</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-stone-600">
                Shared hub mode makes each option larger and easier to tap.
              </p>
            </div>

            <div className="mt-8">
              <article className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-2xl font-semibold text-stone-950">{currentMember.avatar} {currentMember.name}</h3>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {state.moodOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleMoodSelection(option.id)}
                      className={currentMemberMood?.id === option.id
                        ? hubMode
                          ? 'rounded-[1.5rem] border border-stone-950 bg-stone-950 px-4 py-5 text-left text-lg font-semibold text-stone-50'
                          : 'rounded-3xl border border-stone-950 bg-stone-950 px-4 py-4 text-left text-sm font-semibold text-stone-50'
                        : hubMode
                          ? 'rounded-[1.5rem] border border-stone-900/10 bg-white px-4 py-5 text-left text-lg font-medium text-stone-900'
                          : 'rounded-3xl border border-stone-900/10 bg-white px-4 py-4 text-left text-sm font-medium text-stone-900'}
                    >
                      <div className="text-3xl">{option.emoji}</div>
                      <div className="mt-2">{option.label}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.2em] text-inherit/70">{option.animal}</div>
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-sm text-stone-600">
                  {currentMemberMood
                    ? `Logged today as ${currentMemberMood.label}.`
                    : 'No mood logged yet today.'}
                </p>
              </article>
            </div>
          </section>
        )}

        {state.activeScreen === 'activities' && (
          <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Activity engine</p>
              <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Suggestions for your current mood and interests</h2>
              <div className="mt-6 space-y-4">
                {suggestedActivities.map((activity) => (
                  <article key={activity.id} className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl font-semibold text-stone-950">{activity.title}</h3>
                        <p className="mt-2 max-w-2xl text-base leading-7 text-stone-700">{activity.description}</p>
                      </div>
                      <div className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50">
                        {activity.durationMinutes} min
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {activity.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => actions.completeActivity(state.currentMemberId, activity.id)}
                        className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-stone-50"
                      >
                        Mark as done
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Suggestions</p>
              <h3 className="mt-3 text-3xl font-semibold">Why these activities</h3>
              <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-300">
                <li>Low energy / cozy favors gentle indoor prompts and calming connection.</li>
                <li>Mixed / chaotic favors grounding or balanced reset activities.</li>
                <li>High energy / playful favors movement, rhythm, and playful outdoor-ready options.</li>
                <li>Repeated activities are deprioritized if they were already completed today.</li>
              </ul>
            </article>
          </section>
        )}

        {state.activeScreen === 'lore' && (
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Capture memory</p>
              <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Family Lore entry</h2>

              <form className="mt-6 space-y-5" onSubmit={submitMemory}>
                <div>
                  <label className="text-sm font-semibold text-stone-800">Entry mode</label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setLoreMode('prompt')}
                      className={loreMode === 'prompt'
                        ? 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                        : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                    >
                      Prompt response
                    </button>
                    <button
                      type="button"
                      onClick={() => setLoreMode('quick')}
                      className={loreMode === 'quick'
                        ? 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                        : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                    >
                      Quick capture
                    </button>
                  </div>
                </div>

                {loreMode === 'prompt' && (
                  <div className="space-y-3 rounded-3xl border border-stone-900/10 bg-stone-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="text-sm font-semibold text-stone-800">
                        Today&apos;s prompt ({todayPromptResponseCount}/{DAILY_PROMPT_LIMIT})
                      </label>
                      <button
                        type="button"
                        onClick={() => setPromptOffset((current) => current + 1)}
                        className="rounded-full border border-stone-900/20 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700"
                        disabled={remainingPromptResponses === 0}
                      >
                        New prompt
                      </button>
                    </div>
                    <p className="text-base leading-7 text-stone-700">{currentPrompt}</p>
                    {remainingPromptResponses === 0 && (
                      <p className="text-sm font-medium text-orange-700">
                        Daily prompt limit reached. Switch to Quick capture to keep uploading media.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-sm font-semibold text-stone-800">Entry type</label>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(Object.keys(memoryTypeLabels) as MemoryType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => selectEntryType(type)}
                        className={memoryForm.type === type
                          ? 'rounded-full bg-orange-300 px-4 py-2 text-sm font-semibold text-stone-950'
                          : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                      >
                        {memoryTypeLabels[type]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-stone-800">Participants</label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50">
                      {currentMember.avatar} {currentMember.name}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-stone-800">Memory</label>
                  {(hubMode || memoryForm.type === 'voice') && (
                    <VoiceComposer
                      large={hubMode}
                      onTranscript={(transcript) =>
                        setMemoryForm((current) => ({
                          ...current,
                          content: current.content
                            ? `${current.content.trim()} ${transcript}`.trim()
                            : transcript,
                        }))
                      }
                    />
                  )}
                  <textarea
                    value={memoryForm.content}
                    onChange={(event) =>
                      setMemoryForm((current) => ({ ...current, content: event.target.value }))
                    }
                    rows={5}
                    placeholder="Capture the moment in one or two sentences."
                    className="w-full rounded-[1.5rem] border border-stone-900/10 bg-stone-50 px-4 py-4 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-stone-800">Media</label>
                  <p className="text-sm text-stone-600">
                    Choose Photo, Voice, or Video above to open your device picker. Tap the same type again to add more files.
                  </p>

                  <input
                    ref={imageUploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleAttachmentUpload(event, 'image')
                    }}
                  />
                  <input
                    ref={audioUploadInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleAttachmentUpload(event, 'audio')
                    }}
                  />
                  <input
                    ref={videoUploadInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      void handleAttachmentUpload(event, 'video')
                    }}
                  />

                  {memoryForm.type === 'voice' && (
                    <div className="rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4">
                      <p className="text-sm font-semibold text-stone-800">Record in app</p>
                      <p className="mt-1 text-xs font-medium text-stone-500">
                        Capture audio without leaving the app.
                      </p>
                      <div className="mt-3">
                        <MediaRecorderCapture
                          kind="audio"
                          large={hubMode}
                          onCapture={(payload) => void handleRecordedCapture(payload)}
                        />
                      </div>
                    </div>
                  )}

                  {memoryForm.type === 'video' && (
                    <div className="rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4">
                      <p className="text-sm font-semibold text-stone-800">Record short video</p>
                      <p className="mt-1 text-xs font-medium text-stone-500">
                        Best for quick family moments and weekly recap clips.
                      </p>
                      <div className="mt-3">
                        <MediaRecorderCapture
                          kind="video"
                          large={hubMode}
                          onCapture={(payload) => void handleRecordedCapture(payload)}
                        />
                      </div>
                    </div>
                  )}

                  {uploadNotice && (
                    <p className="rounded-2xl border border-stone-900/10 bg-stone-50 px-3 py-2 text-sm text-stone-600">
                      {uploadNotice}
                    </p>
                  )}

                  {(memoryForm.attachments?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      {(memoryForm.attachments ?? []).map((attachment, index) => (
                        <div key={attachment.id} className="flex items-center justify-between rounded-2xl border border-stone-900/10 bg-stone-50 px-3 py-2">
                          <p className="truncate pr-3 text-sm text-stone-700">
                            {attachment.kind.toUpperCase()} · {attachment.name}
                          </p>
                          <button
                            type="button"
                            onClick={() => removeAttachment(index)}
                            className="rounded-full border border-stone-900/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loreMode === 'prompt' && remainingPromptResponses === 0}
                  className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-stone-50"
                >
                  {loreMode === 'prompt' ? 'Save prompt response' : 'Save quick capture'}
                </button>
              </form>
            </article>

            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Shared timeline</p>
              <div className="mt-6 space-y-4">
                {visibleMemories.map((entry) => {
                  const author = state.members.find((member) => member.id === entry.authorId)
                  const participants = entry.participants
                    .map((participantId) => state.members.find((member) => member.id === participantId)?.name)
                    .filter(Boolean)
                    .join(', ')

                  return (
                    <article key={entry.id} className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-stone-900">
                            {author?.avatar} {author?.name} · {memoryTypeLabels[entry.type]}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.24em] text-stone-500">{entry.prompt}</p>
                        </div>
                        <p className="text-sm text-stone-500">{formatTimestamp(entry.createdAt)}</p>
                      </div>
                      <p className="mt-4 text-base leading-7 text-stone-700">{entry.content}</p>
                      {(entry.attachments?.length ?? 0) > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {(entry.attachments ?? []).map((attachment) => (
                            <div key={attachment.id} className="overflow-hidden rounded-2xl border border-stone-900/10 bg-white">
                              {attachment.kind === 'image' && (
                                <img src={attachment.url} alt={attachment.name} className="h-44 w-full object-cover" />
                              )}
                              {attachment.kind === 'audio' && (
                                <div className="p-3">
                                  <p className="mb-2 text-xs uppercase tracking-[0.18em] text-stone-500">Voice note</p>
                                  <audio controls src={attachment.url} className="w-full" />
                                </div>
                              )}
                              {attachment.kind === 'video' && (
                                <video controls src={attachment.url} className="h-44 w-full bg-stone-900 object-cover" />
                              )}
                              <p className="truncate border-t border-stone-900/10 px-3 py-2 text-xs text-stone-600">
                                {attachment.name}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="mt-4 text-sm text-stone-500">Participants: {participants || currentMember.name}</p>
                    </article>
                  )
                })}
              </div>
            </article>
          </section>
        )}

        {state.activeScreen === 'recap' && (
          <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <article className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Weekly recap</p>
              <h2 className="mt-3 text-4xl font-semibold">{currentWeekSummary.weekLabel}</h2>
              <p className="mt-5 text-base leading-8 text-stone-300">
                Personal recap for {currentMember.name}: {currentMemberStats.moodLogs} moods logged, {currentMemberStats.memoryEntries} memories added, and {currentMemberStats.activitiesCompleted} activities completed.
              </p>
              <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/6 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-orange-200">Personal streak</p>
                <h3 className="mt-3 text-3xl font-semibold">{currentMemberStats.streak} days</h3>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
                  Keep momentum
                </p>
                <p className="mt-4 text-sm leading-7 text-stone-300">Each mood, memory, and activity extends your consistency and positive score.</p>
              </div>
            </article>

            <div className="space-y-6">
              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Your scorecard</p>
                <div className="mt-6 space-y-3">
                  <div className="flex items-center justify-between rounded-3xl border border-stone-900/10 bg-stone-50/90 px-4 py-4">
                    <div>
                      <p className="text-base font-semibold text-stone-900">{currentMember.avatar} {currentMember.name}</p>
                      <p className="mt-1 text-sm text-stone-500">
                        {currentMemberStats.moodLogs} moods · {currentMemberStats.memoryEntries} memories · {currentMemberStats.activitiesCompleted} activities
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-semibold text-stone-950">{currentMemberStats.points}</p>
                      <p className="text-xs uppercase tracking-[0.24em] text-stone-500">positive points</p>
                    </div>
                  </div>
                </div>
              </article>

              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Badges</p>
                <div className="mt-6 grid gap-4 md:grid-cols-1">
                  <div className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                    <p className="text-base font-semibold text-stone-900">{currentMember.avatar} {currentMember.name}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {currentMemberStats.badges.length > 0 ? (
                        currentMemberStats.badges.map((badge) => (
                          <span key={badge.id} className="rounded-full bg-orange-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-950">
                            {badge.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-stone-500">No badges yet. Keep the streak going.</span>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>
        )}

        {state.activeScreen === 'members' && (
          <section className="grid gap-6">
            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">My profile</p>
              <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">{currentMember.avatar} {currentMember.name}</h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Profile</p>
                  <p className="mt-2 text-xl font-semibold text-stone-950">{currentMember.profileTitle ?? 'Family member'}</p>
                  <p className="mt-1 text-sm text-stone-600">{currentMember.name}</p>
                </div>
                <div className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                  <p className="text-sm uppercase tracking-[0.2em] text-stone-500">Birthday</p>
                  <p className="mt-2 text-xl font-semibold text-stone-950">{currentMember.birthdayLabel ?? 'Not set'}</p>
                  <p className="mt-1 text-sm text-stone-600">{currentMember.profileTitle ?? 'Family member'}</p>
                </div>
              </div>
              {currentMember.profileSummary && (
                <p className="mt-6 text-base leading-7 text-stone-700">{currentMember.profileSummary}</p>
              )}
              {(currentMember.interests?.length ?? 0) > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {(currentMember.interests ?? []).map((interest) => (
                    <span key={interest} className="rounded-full border border-stone-900/10 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">
                      {interest}
                    </span>
                  ))}
                </div>
              )}

              {(currentMember.tags?.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(currentMember.tags ?? []).map((tag) => (
                    <span key={tag} className="rounded-full bg-stone-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-50">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-semibold text-stone-800">Interests</label>
                  <input
                    value={interestInput}
                    onChange={(event) => setInterestInput(event.target.value)}
                    placeholder="soccer, travel, technology"
                    className="mt-3 w-full rounded-[1.25rem] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-stone-800">Tags</label>
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder="maker, funny, leader"
                    className="mt-3 w-full rounded-[1.25rem] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={saveProfileKeywords}
                className="mt-4 rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-stone-50"
              >
                Save interests and tags
              </button>

              {isChildProfile && (
                <div className={`mt-6 rounded-[1.75rem] border p-5 ${childTheme.shellClass}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${childTheme.accentTextClass}`}>{childTheme.progressLabel}</p>
                    <p className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${childTheme.pillClass}`}>
                      {childTheme.levelLabel} {level}
                    </p>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/70">
                    <div className={`h-full rounded-full ${childTheme.barClass}`} style={{ width: `${levelProgress}%` }} />
                  </div>
                  <p className={`mt-2 text-sm ${childTheme.accentTextClass}`}>
                    {pointsIntoLevel} / {pointsPerLevel} XP to {childTheme.levelLabel} {level + 1}
                  </p>
                </div>
              )}
            </article>

            {isChildProfile && (
              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.3em] text-stone-500">{childTheme.questBoardLabel}</p>
                  <p className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50">
                    {childTheme.xpLabel}: {todaysEngagementPoints}
                  </p>
                </div>
                <div className="mt-6 space-y-3">
                  {childQuestBoard.map((quest) => (
                    <button
                      key={quest.id}
                      type="button"
                      onClick={() => navigate(quest.screen)}
                      className="flex w-full items-center justify-between rounded-3xl border border-stone-900/10 bg-stone-50/90 px-4 py-4 text-left transition hover:border-stone-900/25"
                    >
                      <div>
                        <p className="text-base font-semibold text-stone-900">{quest.done ? childTheme.completeIcon : childTheme.pendingIcon} {quest.title}</p>
                        <p className="mt-1 text-sm text-stone-500">{quest.target}</p>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">{quest.reward}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-stone-500">{childTheme.rewardTitle}</p>
                  <div className="mt-3 space-y-3">
                    {rewardUnlocks.map((reward) => {
                      const unlocked = level >= reward.level
                      return (
                        <div key={reward.level} className="flex items-start justify-between gap-3 rounded-2xl bg-white px-3 py-3">
                          <div>
                            <p className="text-sm font-semibold text-stone-900">{unlocked ? '🔓' : '🔒'} {reward.title}</p>
                            <p className="mt-1 text-sm text-stone-500">{reward.description}</p>
                          </div>
                          <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Lv {reward.level}</p>
                        </div>
                      )
                    })}
                  </div>
                  {nextRewardUnlock && level < nextRewardUnlock.level && (
                    <p className="mt-3 text-sm font-medium text-stone-700">
                      Next unlock at {childTheme.levelLabel.toLowerCase()} {nextRewardUnlock.level}: {nextRewardUnlock.title}
                    </p>
                  )}
                </div>
                {nextBadgeTarget && (
                  <div className="mt-5 rounded-3xl border border-stone-900/10 bg-white px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Next badge</p>
                    <p className="mt-2 text-lg font-semibold text-stone-900">{nextBadgeTarget.name}</p>
                    <p className="mt-1 text-sm text-stone-600">{nextBadgeTarget.description}</p>
                    <p className="mt-2 text-sm font-medium text-stone-700">
                      Progress: {nextBadgeTarget.progressLabel} · {nextBadgeTarget.remaining} to go
                    </p>
                  </div>
                )}
              </article>
            )}

            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Daily checklist</p>
                <p className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50">
                  Today&apos;s points: {todaysEngagementPoints}
                </p>
              </div>
              <div className="mt-6 space-y-3">
                {dailyChecklist.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => navigate(item.screen)}
                    className="flex w-full items-center justify-between rounded-3xl border border-stone-900/10 bg-stone-50/90 px-4 py-4 text-left transition hover:border-stone-900/25"
                  >
                    <div>
                      <p className="text-base font-semibold text-stone-900">{item.done ? '✅' : '⬜'} {item.label}</p>
                      <p className="mt-1 text-sm text-stone-500">{item.progress}</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-600">
                      {item.points > 0 ? `+${item.points} pts` : 'Bonus'}
                    </p>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm text-stone-600">
                Complete daily inputs to build streaks and unlock badges faster.
              </p>
            </article>
          </section>
        )}

          {state.activeScreen === 'storyboard' && (
            <section className="space-y-8">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Family archive</p>
                <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">The Serkin Story</h2>
                <p className="mt-2 text-base text-stone-600">Browse every memory in your family timeline.</p>
              </div>
              <ArchiveExplorer
                entries={state.memoryEntries}
                members={state.members}
                isAdmin={isArchiveAdmin}
                onUpdateMemory={actions.updateMemory}
                onDeleteMemory={actions.deleteMemory}
              />
            </section>
          )}
      </div>
    </main>
  )
}