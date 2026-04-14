import {
  startTransition,
  useDeferredValue,
  useMemo,
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
  Screen,
} from '../types/family'
import { VoiceComposer } from './VoiceComposer'
import { MediaRecorderCapture } from './MediaRecorderCapture'
import { Storyboard } from './Storyboard'

const screens: Array<{ id: Screen; label: string }> = [
  { id: 'home', label: 'Dashboard' },
  { id: 'mood', label: 'Mood Check' },
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

const attachmentTypeCopy: Record<AttachmentKind, { label: string; helper: string }> = {
  image: {
    label: 'Upload photo',
    helper: 'JPG, PNG, HEIC and camera capture on mobile.',
  },
  audio: {
    label: 'Upload voice note',
    helper: 'M4A, MP3, WAV or direct mic capture on supported phones.',
  },
  video: {
    label: 'Upload video snippet',
    helper: 'Keep clips short for quick family recap playback.',
  },
}

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

  const [memoryForm, setMemoryForm] = useState<NewMemoryInput>({
    authorId: state.currentMemberId,
    participants: [state.currentMemberId],
    type: 'text',
    prompt: promptLibrary[0],
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
  const currentPrompt = useMemo(() => {
    if (promptLibrary.length === 0) {
      return 'Capture one meaningful moment from today.'
    }
    const seed = `${currentMember.id}-${todayKey}`
      .split('')
      .reduce((sum, char) => sum + char.charCodeAt(0), 0)
    return promptLibrary[(seed + promptOffset) % promptLibrary.length]
  }, [currentMember.id, todayKey, promptOffset])
  const todaysEngagementPoints =
    (currentMemberMood ? DAILY_TASK_POINTS.mood : 0) +
    (todayActivityCount > 0 ? DAILY_TASK_POINTS.activity : 0) +
    Math.min(todayPromptResponseCount, DAILY_PROMPT_LIMIT) * DAILY_TASK_POINTS.prompt

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

  const visibleMemories = useMemo(
    () => deferredMemories.filter((entry) => entry.authorId === currentMember.id),
    [deferredMemories, currentMember.id],
  )

  function navigate(screen: Screen) {
    startTransition(() => actions.setScreen(screen))
  }

  function selectProfile(memberId: string) {
    actions.setCurrentMember(memberId)
    actions.setScreen('mood')
    setPromptOffset(0)
    setLoreMode('prompt')
    setMemoryForm((current) => ({
      ...current,
      authorId: memberId,
      participants: [memberId],
      prompt: promptLibrary[0] ?? 'Capture one meaningful moment from today.',
      content: '',
      attachments: [],
    }))
    setProfileLockedIn(true)
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

  if (!profileLockedIn) {
    return (
      <main className="min-h-screen bg-transparent px-4 py-5 text-stone-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-8 py-6 sm:py-10">
          <section className="overflow-hidden rounded-[2rem] border border-stone-900/10 bg-[linear-gradient(135deg,rgba(255,252,245,0.96),rgba(248,241,228,0.92))] p-6 shadow-[0_24px_80px_rgba(120,113,108,0.16)] sm:p-10">
            <p className="text-xs uppercase tracking-[0.28em] text-stone-600">Family Pulse</p>
            <h1 className="mt-4 max-w-3xl font-serif text-4xl tracking-tight text-stone-950 sm:text-6xl">
              Choose your profile
            </h1>
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
                      onClick={() => actions.logMood(currentMember.id, option.id)}
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
                        onClick={() => setMemoryForm((current) => ({ ...current, type }))}
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
                  <label className="text-sm font-semibold text-stone-800">Media uploads</label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="cursor-pointer rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm font-semibold text-stone-800 transition hover:border-stone-900/25">
                      <span>{attachmentTypeCopy.image.label}</span>
                      <p className="mt-1 text-xs font-medium text-stone-500">{attachmentTypeCopy.image.helper}</p>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          void handleAttachmentUpload(event, 'image')
                        }}
                      />
                    </label>

                    <label className="cursor-pointer rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm font-semibold text-stone-800 transition hover:border-stone-900/25">
                      <span>{attachmentTypeCopy.audio.label}</span>
                      <p className="mt-1 text-xs font-medium text-stone-500">{attachmentTypeCopy.audio.helper}</p>
                      <input
                        type="file"
                        accept="audio/*"
                        capture="user"
                        className="hidden"
                        onChange={(event) => {
                          void handleAttachmentUpload(event, 'audio')
                        }}
                      />
                    </label>

                    <label className="cursor-pointer rounded-3xl border border-stone-900/10 bg-stone-50 px-4 py-4 text-sm font-semibold text-stone-800 transition hover:border-stone-900/25">
                      <span>{attachmentTypeCopy.video.label}</span>
                      <p className="mt-1 text-xs font-medium text-stone-500">{attachmentTypeCopy.video.helper}</p>
                      <input
                        type="file"
                        accept="video/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          void handleAttachmentUpload(event, 'video')
                        }}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
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
                  </div>

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
            </article>

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
              <Storyboard />
            </section>
          )}
      </div>
    </main>
  )
}