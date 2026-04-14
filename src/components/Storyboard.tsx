import { useMemo, useState } from 'react'
import { useFamilyPulse } from '../state/familyPulseContext'
import type { Member, MemoryEntry } from '../types/family'

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

interface MemoryCardProps {
  entry: MemoryEntry
  members: Member[]
}

function MemoryCard({ entry, members }: MemoryCardProps) {
  const author = members.find((m) => m.id === entry.authorId)
  const participants = members.filter((m) => entry.participants.includes(m.id))
  const imageAttachment = entry.attachments?.find((a) => a.kind === 'image')
  const audioAttachment = entry.attachments?.find((a) => a.kind === 'audio')
  const videoAttachment = entry.attachments?.find((a) => a.kind === 'video')

  const formattedDate = new Date(entry.createdAt).toLocaleDateString('default', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      {imageAttachment && (
        <img
          src={imageAttachment.url}
          alt={imageAttachment.name}
          className="w-full h-48 object-cover"
        />
      )}
      {videoAttachment && (
        <video
          src={videoAttachment.url}
          controls
          className="w-full h-48 object-cover bg-black"
        />
      )}
      <div className="p-4 space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>
            {author?.avatar ?? '👤'} {author?.name ?? 'Unknown'}
          </span>
          <span>{formattedDate}</span>
        </div>
        {entry.prompt && (
          <p className="text-xs italic text-slate-400 line-clamp-1">{entry.prompt}</p>
        )}
        <p className="text-sm text-slate-700 leading-snug">{entry.content}</p>
        {audioAttachment && (
          <audio src={audioAttachment.url} controls className="w-full mt-1" />
        )}
        {participants.length > 1 && (
          <p className="text-xs text-slate-400">
            {participants.map((m) => `${m.avatar} ${m.name}`).join(' · ')}
          </p>
        )}
      </div>
    </div>
  )
}

export function Storyboard() {
  const { state } = useFamilyPulse()
  const [filterMemberId, setFilterMemberId] = useState<string>('all')

  const filtered = useMemo(() => {
    if (filterMemberId === 'all') return state.memoryEntries
    return state.memoryEntries.filter(
      (e) => e.authorId === filterMemberId || e.participants.includes(filterMemberId),
    )
  }, [state.memoryEntries, filterMemberId])

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    const map = new Map<string, MemoryEntry[]>()
    for (const entry of sorted) {
      const key = monthKey(entry.createdAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
    return map
  }, [filtered])

  const humanMembers = state.members.filter((m) => m.role !== 'pet')

  return (
    <div className="space-y-6">
      {/* Member filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterMemberId('all')}
          className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filterMemberId === 'all'
              ? 'bg-violet-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Everyone
        </button>
        {humanMembers.map((m) => (
          <button
            key={m.id}
            onClick={() => setFilterMemberId(m.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterMemberId === m.id
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {m.avatar} {m.name}
          </button>
        ))}
      </div>

      {/* Timeline groups */}
      {grouped.size === 0 && (
        <p className="text-center text-slate-400 py-12 text-sm">
          No memories yet — add one in Family Lore.
        </p>
      )}
      {[...grouped.entries()].map(([key, entries]) => (
        <section key={key}>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
            {monthLabel(key)}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {entries.map((entry) => (
              <MemoryCard key={entry.id} entry={entry} members={state.members} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
