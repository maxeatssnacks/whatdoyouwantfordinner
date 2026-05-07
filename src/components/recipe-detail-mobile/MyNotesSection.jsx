import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useRecipeNote, useUpsertRecipeNote } from '../../hooks/useRecipes'

export function MyNotesSection({ recipeId }) {
  const { data: existingNote, isLoading } = useRecipeNote(recipeId)
  const upsertNote = useUpsertRecipeNote()
  const [text, setText] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Hydrate local state once the existing note loads
  useEffect(() => {
    if (!isLoading && existingNote !== undefined && text === null) {
      setText(existingNote)
    }
  }, [existingNote, isLoading, text])

  const handleBlur = async () => {
    if (text === null) return
    setSaving(true)
    try {
      await upsertNote.mutateAsync({ recipeId, notes: text })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('[MyNotesSection] save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="px-4 py-4 border-t border-border/60">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-display text-[18px] font-bold text-text-primary -tracking-[0.2px]">
          My notes
        </h2>
        <span className="inline-flex items-center gap-1 text-[11px] font-body text-text-secondary">
          <Lock size={11} strokeWidth={2} />
          Private
        </span>
      </div>
      <textarea
        value={text ?? ''}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Substitutions, tweaks, ratings…"
        rows={4}
        className="w-full px-3 py-2.5 rounded-md bg-surface border-[1.5px] border-border
          font-body text-[14px] text-text-primary placeholder:text-tertiary
          focus:outline-none focus:border-primary focus:shadow-ring-input
          resize-none transition-all duration-fast"
      />
      <div className="flex justify-end mt-1.5 h-4 text-[11px] font-body">
        {saving && <span className="text-text-secondary">Saving…</span>}
        {!saving && saved && <span className="text-success">Saved</span>}
      </div>
    </section>
  )
}
