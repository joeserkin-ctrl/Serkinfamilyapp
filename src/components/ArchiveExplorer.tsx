import { useMemo, useState } from 'react'
import type { Member, MemoryEntry } from '../types/family'

type ArchiveView = 'storyboard' | 'mindmap' | 'slideshow'

interface ArchiveExplorerProps {
  entries: MemoryEntry[]
  members: Member[]
  isAdmin: boolean
  onUpdateMemory: (memoryId: string, patch: Pick<MemoryEntry, 'prompt' | 'content'>) => void
  onDeleteMemory: (memoryId: string) => void
}

function monthKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  })
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('default', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface AdminBarProps {
  entry: MemoryEntry
  isAdmin: boolean
  onEdit: (entry: MemoryEntry) => void
  onDelete: (memoryId: string) => void
}

function AdminBar({ entry, isAdmin, onEdit, onDelete }: AdminBarProps) {
  if (!isAdmin) {
    return null
  }

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={() => onEdit(entry)}
        className="rounded-full border border-stone-900/15 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={() => onDelete(entry.id)}
        className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-700"
      >
        Delete
      </button>
    </div>
  )
}

interface StoryCardProps {
  entry: MemoryEntry
  members: Member[]
  isAdmin: boolean
  onEdit: (entry: MemoryEntry) => void
  onDelete: (memoryId: string) => void
}

function StoryCard({ entry, members, isAdmin, onEdit, onDelete }: StoryCardProps) {
  const author = members.find((m) => m.id === entry.authorId)
  const participants = members.filter((m) => entry.participants.includes(m.id))
  const imageAttachment = entry.attachments?.find((a) => a.kind === 'image')
  const audioAttachment = entry.attachments?.find((a) => a.kind === 'audio')
  const videoAttachment = entry.attachments?.find((a) => a.kind === 'video')

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      {imageAttachment && (
        <img
          src={imageAttachment.url}
          alt={imageAttachment.name}
          className="h-48 w-full object-cover"
        />
      )}
      {videoAttachment && (
        <video
          src={videoAttachment.url}
          controls
          className="h-48 w-full bg-black object-cover"
        />
      )}
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {author?.avatar ?? '👤'} {author?.name ?? 'Unknown'}
          </span>
          <span>{formatShortDate(entry.createdAt)}</span>
        </div>
        {entry.prompt && (
          <p className="line-clamp-1 text-xs italic text-slate-400">{entry.prompt}</p>
        )}
        <p className="text-sm leading-snug text-slate-700">{entry.content}</p>
        {audioAttachment && <audio src={audioAttachment.url} controls className="mt-1 w-full" />}
        {participants.length > 1 && (
          <p className="text-xs text-slate-400">
            {participants.map((m) => `${m.avatar} ${m.name}`).join(' · ')}
          </p>
        )}
        <AdminBar entry={entry} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  )
}

export function ArchiveExplorer({
  entries,
  members,
  isAdmin,
  onUpdateMemory,
  onDeleteMemory,
}: ArchiveExplorerProps) {
  const [view, setView] = useState<ArchiveView>('storyboard')
  const [filterMemberId, setFilterMemberId] = useState<string>('all')
  const [editingEntry, setEditingEntry] = useState<MemoryEntry | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [editContent, setEditContent] = useState('')
  const [slideIndex, setSlideIndex] = useState(0)

  const filtered = useMemo(() => {
    if (filterMemberId === 'all') {
      return entries
    }

    return entries.filter(
      (entry) => entry.authorId === filterMemberId || entry.participants.includes(filterMemberId),
    )
  }, [entries, filterMemberId])

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const map = new Map<string, MemoryEntry[]>()
    for (const entry of sorted) {
      const key = monthKey(entry.createdAt)
      if (!map.has(key)) {
        map.set(key, [])
      }
      map.get(key)!.push(entry)
    }
    return map
  }, [filtered])

  const slideshowImages = useMemo(
    () =>
      filtered.flatMap((entry) =>
        (entry.attachments ?? [])
          .filter((attachment) => attachment.kind === 'image')
          .map((attachment) => ({ entry, attachment })),
      ),
    [filtered],
  )

  const currentSlide = slideshowImages.length > 0 ? slideshowImages[slideIndex % slideshowImages.length] : null

  const humanMembers = members.filter((member) => member.role !== 'pet')

  function beginEdit(entry: MemoryEntry) {
    setEditingEntry(entry)
    setEditPrompt(entry.prompt)
    setEditContent(entry.content)
  }

  function saveEdit() {
    if (!editingEntry) {
      return
    }

    onUpdateMemory(editingEntry.id, {
      prompt: editPrompt.trim() || 'Quick capture',
      content: editContent.trim() || editingEntry.content,
    })
    setEditingEntry(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {([
          { id: 'storyboard', label: 'Storyboard' },
          { id: 'mindmap', label: 'Mindmap' },
          { id: 'slideshow', label: 'Slideshow' },
        ] as const).map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setView(option.id)}
            className={view === option.id
              ? 'rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50'
              : 'rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-medium text-stone-700'}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterMemberId('all')}
          className={filterMemberId === 'all'
            ? 'shrink-0 rounded-full bg-stone-950 px-3 py-1.5 text-sm font-medium text-stone-50'
            : 'shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200'}
        >
          Everyone
        </button>
        {humanMembers.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => setFilterMemberId(member.id)}
            className={filterMemberId === member.id
              ? 'shrink-0 rounded-full bg-stone-950 px-3 py-1.5 text-sm font-medium text-stone-50'
              : 'shrink-0 rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200'}
          >
            {member.avatar} {member.name}
          </button>
        ))}
      </div>

      {view === 'storyboard' && (
        <div className="space-y-6">
          {grouped.size === 0 && (
            <p className="py-12 text-center text-sm text-slate-400">No memories yet.</p>
          )}
          {[...grouped.entries()].map(([key, monthEntries]) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {monthLabel(key)}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {monthEntries.map((entry) => (
                  <StoryCard
                    key={entry.id}
                    entry={entry}
                    members={members}
                    isAdmin={isAdmin}
                    onEdit={beginEdit}
                    onDelete={onDeleteMemory}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === 'mindmap' && (
        <div className="space-y-6 rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur">
          <div className="mx-auto flex w-fit items-center rounded-full border border-stone-900/15 bg-stone-950 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-stone-50">
            Serkin Archive
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {humanMembers
              .filter((member) => filterMemberId === 'all' || filterMemberId === member.id)
              .map((member) => {
                const memberEntries = filtered.filter(
                  (entry) => entry.authorId === member.id || entry.participants.includes(member.id),
                )

                return (
                  <section key={member.id} className="rounded-[1.75rem] border border-stone-900/10 bg-stone-50/90 p-5">
                    <p className="text-lg font-semibold text-stone-950">{member.avatar} {member.name}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      {memberEntries.length > 0 ? memberEntries.map((entry) => (
                        <div key={entry.id} className="min-w-[10rem] rounded-3xl border border-stone-900/10 bg-white px-4 py-3">
                          <p className="text-xs uppercase tracking-[0.18em] text-stone-400">{formatShortDate(entry.createdAt)}</p>
                          <p className="mt-2 text-sm font-semibold text-stone-900">{entry.prompt}</p>
                          <p className="mt-1 line-clamp-3 text-sm text-stone-600">{entry.content}</p>
                          <AdminBar entry={entry} isAdmin={isAdmin} onEdit={beginEdit} onDelete={onDeleteMemory} />
                        </div>
                      )) : (
                        <p className="text-sm text-stone-500">No linked memories yet.</p>
                      )}
                    </div>
                  </section>
                )
              })}
          </div>
        </div>
      )}

      {view === 'slideshow' && (
        <div className="space-y-4 rounded-[2rem] border border-stone-900/10 bg-white/80 p-6 backdrop-blur">
          {!currentSlide && <p className="py-10 text-center text-sm text-stone-500">No uploaded images yet.</p>}
          {currentSlide && (
            <>
              <div className="overflow-hidden rounded-[1.75rem] bg-stone-950">
                <img
                  src={currentSlide.attachment.url}
                  alt={currentSlide.attachment.name}
                  className="h-[22rem] w-full object-cover sm:h-[30rem]"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{currentSlide.entry.prompt}</p>
                  <p className="mt-1 text-sm text-stone-600">{currentSlide.entry.content}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-stone-400">{formatShortDate(currentSlide.entry.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSlideIndex((current) => (current - 1 + slideshowImages.length) % slideshowImages.length)}
                    className="rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setSlideIndex((current) => (current + 1) % slideshowImages.length)}
                    className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-stone-50"
                  >
                    Next
                  </button>
                </div>
              </div>
              <AdminBar
                entry={currentSlide.entry}
                isAdmin={isAdmin}
                onEdit={beginEdit}
                onDelete={onDeleteMemory}
              />
            </>
          )}
        </div>
      )}

      {isAdmin && editingEntry && (
        <div className="rounded-[2rem] border border-stone-900/10 bg-white/90 p-6 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-stone-500">Edit archive post</p>
            <button
              type="button"
              onClick={() => setEditingEntry(null)}
              className="rounded-full border border-stone-900/10 bg-stone-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-700"
            >
              Close
            </button>
          </div>
          <div className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-semibold text-stone-800">Prompt</label>
              <input
                value={editPrompt}
                onChange={(event) => setEditPrompt(event.target.value)}
                className="mt-3 w-full rounded-[1.25rem] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-stone-800">Content</label>
              <textarea
                value={editContent}
                onChange={(event) => setEditContent(event.target.value)}
                rows={5}
                className="mt-3 w-full rounded-[1.5rem] border border-stone-900/10 bg-stone-50 px-4 py-4 text-base text-stone-900 outline-none transition focus:border-stone-900/25"
              />
            </div>
            <button
              type="button"
              onClick={saveEdit}
              className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-stone-50"
            >
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}