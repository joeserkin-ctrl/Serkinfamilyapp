import {
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import { promptLibrary } from '../data/mockData'
import { formatTimestamp } from '../lib/familyPulse'
import { useFamilyPulse } from '../state/familyPulseContext'
import type {
  AccessType,
  AttachmentKind,
  MemoryAttachment,
  MemoryType,
  NewMemberInput,
  NewMemoryInput,
  Role,
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

const roleLabels: Record<Role, string> = {
  adult: 'Adult',
  child: 'Child',
  pet: 'Pet / proxy',
}

const accessLabels: Record<AccessType, string> = {
  personal: 'Personal device',
  'shared-hub': 'Shared hub',
  proxy: 'Proxy only',
}

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

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
    familyMood,
    suggestedActivities,
    todayMoodMap,
    memberStatsById,
    currentWeekSummary,
    actions,
  } = useFamilyPulse()

  const currentMember =
    state.members.find((member) => member.id === state.currentMemberId) ?? state.members[0]
  const deferredMemories = useDeferredValue(state.memoryEntries)

  const [memoryForm, setMemoryForm] = useState<NewMemoryInput>({
    authorId: state.currentMemberId,
    participants: [state.currentMemberId],
    type: 'text',
    prompt: promptLibrary[0],
    content: '',
    attachments: [],
  })

  const [uploadNotice, setUploadNotice] = useState('')

  const [memberForm, setMemberForm] = useState<NewMemberInput>({
    name: '',
    avatar: '🙂',
    role: 'child',
    accessType: 'shared-hub',
    proxyOwnerId: '',
  })

  const leaderboard = useMemo(
    () =>
      [...state.members].sort(
        (left, right) => memberStatsById[right.id].points - memberStatsById[left.id].points,
      ),
    [memberStatsById, state.members],
  )

  const hubMode = state.uiMode === 'hub'

  function navigate(screen: Screen) {
    startTransition(() => actions.setScreen(screen))
  }

  function submitMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedContent = memoryForm.content.trim()
    const hasAttachments = (memoryForm.attachments?.length ?? 0) > 0

    if (!trimmedContent && !hasAttachments) {
      return
    }

    actions.addMemory({
      ...memoryForm,
      authorId: state.currentMemberId,
      content: trimmedContent || 'Shared a media moment.',
      participants:
        memoryForm.participants.length > 0 ? memoryForm.participants : [state.currentMemberId],
      attachments: hasAttachments ? memoryForm.attachments : undefined,
    })

    setMemoryForm((current) => ({
      ...current,
      authorId: state.currentMemberId,
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

  function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!memberForm.name.trim()) {
      return
    }

    actions.addMember({
      ...memberForm,
      name: memberForm.name.trim(),
      proxyOwnerId: memberForm.accessType === 'proxy' ? memberForm.proxyOwnerId : undefined,
    })

    setMemberForm({
      name: '',
      avatar: '🙂',
      role: 'child',
      accessType: 'shared-hub',
      proxyOwnerId: '',
    })
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
                Family Lore and mood-based rhythms in one shared home app.
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-stone-700 sm:text-lg">
                The daily loop is live: each member checks in, the family mood updates,
                activities are suggested, and memories feed into a shared weekly recap.
              </p>
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
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {scoreLine('Mood state', familyMood.label)}
              {scoreLine('Participation streak', `${currentWeekSummary.participationStreak} days`)}
              {scoreLine('Weekly hero', state.members.find((member) => member.id === currentWeekSummary.hero.memberId)?.name ?? 'Pending')}
              {scoreLine('Today logged', `${familyMood.loggedCount}/${familyMood.memberCount}`)}
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
              <button
                type="button"
                onClick={() => actions.setMode(hubMode ? 'personal' : 'hub')}
                className={hubMode
                  ? 'rounded-2xl bg-orange-300 px-5 py-3 text-base font-semibold text-stone-950'
                  : 'rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-semibold text-stone-800'}
              >
                {hubMode ? 'Shared hub mode on' : 'Switch to shared hub mode'}
              </button>
              <div className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm text-stone-600">
                Current member: <span className="font-semibold text-stone-900">{currentMember.avatar} {currentMember.name}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {state.members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => actions.setCurrentMember(member.id)}
                className={state.currentMemberId === member.id
                  ? hubMode
                    ? 'rounded-3xl border border-stone-950 bg-stone-950 px-5 py-4 text-left text-base font-semibold text-stone-50'
                    : 'rounded-full border border-stone-950 bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                  : hubMode
                    ? 'rounded-3xl border border-stone-900/10 bg-white px-5 py-4 text-left text-base font-medium text-stone-800'
                    : 'rounded-full border border-stone-900/10 bg-white px-4 py-2 text-sm font-medium text-stone-800'}
              >
                <span>{member.avatar} {member.name}</span>
                <span className="ml-2 text-xs uppercase tracking-[0.2em] text-inherit/70">
                  {member.accessType === 'proxy' ? 'proxy' : member.role}
                </span>
              </button>
            ))}
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
                <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">{familyMood.label}</h2>
                <p className="mt-3 max-w-2xl text-base leading-7 text-stone-700">{familyMood.description}</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  {state.members.map((member) => {
                    const moodEntry = todayMoodMap[member.id]
                    const mood = state.moodOptions.find((option) => option.id === moodEntry?.moodId)
                    return (
                      <div key={member.id} className="rounded-3xl bg-stone-50/90 p-4">
                        <p className="text-sm font-semibold text-stone-900">{member.avatar} {member.name}</p>
                        <p className="mt-2 text-sm text-stone-600">
                          {mood ? `${mood.emoji} ${mood.label}` : 'Waiting for check-in'}
                        </p>
                      </div>
                    )
                  })}
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
                <h3 className="mt-3 text-3xl font-semibold text-stone-950">
                  {state.members.find((member) => member.id === currentWeekSummary.hero.memberId)?.name}
                </h3>
                <p className="mt-2 text-sm font-medium uppercase tracking-[0.24em] text-orange-600">
                  {currentWeekSummary.hero.title}
                </p>
                <p className="mt-4 text-base leading-7 text-stone-700">{currentWeekSummary.hero.reason}</p>
              </article>
            </div>
          </section>
        )}

        {state.activeScreen === 'mood' && (
          <section className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Mood check-in</p>
                <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Fast daily check-ins for every member</h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-stone-600">
                Shared hub mode makes each option larger and easier to tap for younger family members.
              </p>
            </div>

            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              {state.members.map((member) => {
                const selectedMood = state.moodOptions.find(
                  (option) => option.id === todayMoodMap[member.id]?.moodId,
                )

                return (
                  <article key={member.id} className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-2xl font-semibold text-stone-950">{member.avatar} {member.name}</h3>
                        <p className="mt-1 text-sm text-stone-600">{roleLabels[member.role]} · {accessLabels[member.accessType]}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => actions.setCurrentMember(member.id)}
                        className="rounded-full border border-stone-900/15 bg-white px-4 py-2 text-sm font-semibold text-stone-800"
                      >
                        Focus member
                      </button>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {state.moodOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => actions.logMood(member.id, option.id)}
                          className={selectedMood?.id === option.id
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
                      {selectedMood
                        ? `Logged today as ${selectedMood.label}.`
                        : 'No mood logged yet today.'}
                    </p>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {state.activeScreen === 'activities' && (
          <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Activity engine</p>
              <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Rule-based suggestions for the current family mood</h2>
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
                      <p className="self-center text-sm text-stone-600">
                        Completion adds positive points and contributes to the weekly hero.
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[2rem] border border-stone-900/10 bg-stone-950 p-6 text-stone-50 shadow-[0_24px_80px_rgba(28,25,23,0.2)] sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Matching logic</p>
              <h3 className="mt-3 text-3xl font-semibold">How the MVP suggests activities</h3>
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
                  <label className="text-sm font-semibold text-stone-800">Prompt</label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {promptLibrary.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setMemoryForm((current) => ({ ...current, prompt }))}
                        className={memoryForm.prompt === prompt
                          ? 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                          : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

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
                    {state.members.map((member) => {
                      const selected = memoryForm.participants.includes(member.id)
                      return (
                        <button
                          key={member.id}
                          type="button"
                          onClick={() =>
                            setMemoryForm((current) => ({
                              ...current,
                              participants: selected
                                ? current.participants.filter((participantId) => participantId !== member.id)
                                : [...current.participants, member.id],
                            }))
                          }
                          className={selected
                            ? 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                            : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                        >
                          {member.avatar} {member.name}
                        </button>
                      )
                    })}
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
                  className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-stone-50"
                >
                  Add to Family Lore
                </button>
              </form>
            </article>

            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Shared timeline</p>
              <div className="mt-6 space-y-4">
                {deferredMemories.map((entry) => {
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
                      <p className="mt-4 text-sm text-stone-500">Participants: {participants || 'None selected'}</p>
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
              <p className="mt-5 text-base leading-8 text-stone-300">{currentWeekSummary.story}</p>
              <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/6 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-orange-200">Weekly hero</p>
                <h3 className="mt-3 text-3xl font-semibold">
                  {state.members.find((member) => member.id === currentWeekSummary.hero.memberId)?.name}
                </h3>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.24em] text-orange-300">
                  {currentWeekSummary.hero.title}
                </p>
                <p className="mt-4 text-sm leading-7 text-stone-300">{currentWeekSummary.hero.reason}</p>
              </div>
            </article>

            <div className="space-y-6">
              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Leaderboard</p>
                <div className="mt-6 space-y-3">
                  {leaderboard.map((member, index) => {
                    const stats = memberStatsById[member.id]
                    return (
                      <div key={member.id} className="flex items-center justify-between rounded-3xl border border-stone-900/10 bg-stone-50/90 px-4 py-4">
                        <div>
                          <p className="text-base font-semibold text-stone-900">
                            {index + 1}. {member.avatar} {member.name}
                          </p>
                          <p className="mt-1 text-sm text-stone-500">
                            {stats.moodLogs} moods · {stats.memoryEntries} memories · {stats.activitiesCompleted} activities
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-semibold text-stone-950">{stats.points}</p>
                          <p className="text-xs uppercase tracking-[0.24em] text-stone-500">positive points</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>

              <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
                <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Badges</p>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {state.members.map((member) => {
                    const badges = memberStatsById[member.id].badges
                    return (
                      <div key={member.id} className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                        <p className="text-base font-semibold text-stone-900">{member.avatar} {member.name}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {badges.length > 0 ? (
                            badges.map((badge) => (
                              <span key={badge.id} className="rounded-full bg-orange-300 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-950">
                                {badge.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-stone-500">No badges yet. Keep the streak going.</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            </div>
          </section>
        )}

        {state.activeScreen === 'members' && (
          <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Family unit</p>
              <h2 className="mt-3 font-serif text-4xl tracking-tight text-stone-950">Members and access modes</h2>
              <div className="mt-6 grid gap-4">
                {state.members.map((member) => {
                  const proxyOwner = state.members.find((candidate) => candidate.id === member.proxyOwnerId)
                  return (
                    <article key={member.id} className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-2xl font-semibold text-stone-950">{member.avatar} {member.name}</p>
                          <p className="mt-1 text-sm text-stone-600">{roleLabels[member.role]} · {accessLabels[member.accessType]}</p>
                        </div>
                        <div className="rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-700">
                          {member.accessType === 'proxy' && proxyOwner
                            ? `Proxy input by ${proxyOwner.name}`
                            : member.accessType === 'shared-hub'
                              ? 'Uses family hub'
                              : 'Uses personal device'}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </article>

            <article className="rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur sm:p-8">
              <p className="text-xs uppercase tracking-[0.3em] text-stone-500">Add member</p>
              <form className="mt-6 space-y-5" onSubmit={submitMember}>
                <div>
                  <label className="text-sm font-semibold text-stone-800">Name</label>
                  <input
                    value={memberForm.name}
                    onChange={(event) => setMemberForm((current) => ({ ...current, name: event.target.value }))}
                    className="mt-3 w-full rounded-full border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
                    placeholder="Add a person or proxy member"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-stone-800">Avatar</label>
                  <input
                    value={memberForm.avatar}
                    onChange={(event) => setMemberForm((current) => ({ ...current, avatar: event.target.value || '🙂' }))}
                    className="mt-3 w-full rounded-full border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
                    placeholder="Emoji avatar"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-stone-800">Role</label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['adult', 'child', 'pet'] as Role[]).map((role) => (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setMemberForm((current) => ({ ...current, role }))}
                        className={memberForm.role === role
                          ? 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
                          : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                      >
                        {roleLabels[role]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-sm font-semibold text-stone-800">Access type</label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['personal', 'shared-hub', 'proxy'] as AccessType[]).map((accessType) => (
                      <button
                        key={accessType}
                        type="button"
                        onClick={() => setMemberForm((current) => ({ ...current, accessType }))}
                        className={memberForm.accessType === accessType
                          ? 'rounded-full bg-orange-300 px-4 py-2 text-sm font-semibold text-stone-950'
                          : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
                      >
                        {accessLabels[accessType]}
                      </button>
                    ))}
                  </div>
                </div>

                {memberForm.accessType === 'proxy' && (
                  <div>
                    <label className="text-sm font-semibold text-stone-800">Proxy owner</label>
                    <select
                      value={memberForm.proxyOwnerId}
                      onChange={(event) =>
                        setMemberForm((current) => ({ ...current, proxyOwnerId: event.target.value }))
                      }
                      className="mt-3 w-full rounded-full border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
                    >
                      <option value="">Select who logs for this member</option>
                      {state.members.filter((member) => member.accessType !== 'proxy').map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  className="rounded-full bg-stone-950 px-6 py-3 text-sm font-semibold text-stone-50"
                >
                  Add member to family
                </button>
              </form>
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