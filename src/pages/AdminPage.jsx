import { useContext, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import DOMPurify from 'dompurify'
import { CheckCircle, Utensils, XCircle } from 'lucide-react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { Button } from '../components/ui/Button'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { Modal } from '../components/ui/Modal'
import { capitalize, formatDate, stripHtml } from '../lib/utils'
import { AuthContext } from '../context/AuthContext'
import { usePendingRecipes, usePendingEditRecipes } from '../hooks/useRecipes'
import { supabase } from '../lib/supabase'

const DIFF_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'cuisine_type', label: 'Cuisine' },
  { key: 'meal_tags', label: 'Meal Tags' },
  { key: 'difficulty', label: 'Difficulty' },
  { key: 'prep_time_minutes', label: 'Prep Time (min)' },
  { key: 'cook_time_minutes', label: 'Cook Time (min)' },
  { key: 'servings', label: 'Servings' },
  { key: 'calories', label: 'Calories' },
  { key: 'protein_g', label: 'Protein (g)' },
  { key: 'carbs_g', label: 'Carbs (g)' },
  { key: 'fat_g', label: 'Fat (g)' },
  { key: 'instructions', label: 'Instructions' },
  { key: 'image_url', label: 'Image URL' },
  { key: 'source_url', label: 'Source URL' },
  { key: 'dietary_tags', label: 'Dietary Tags' },
]

function renderContent(content) {
  if (!content) return ''
  if (/<[a-z][\s\S]*>/i.test(content)) return content
  return content
    .split('\n')
    .filter((p) => p.trim())
    .map((p) => `<p>${p}</p>`)
    .join('')
}

function valuesEqual(a, b) {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return String(a) === String(b)
}

function fieldDisplayDiff(key, value) {
  if (value == null || value === '') return <span className="text-text-secondary/40 italic">—</span>
  if ((key === 'dietary_tags' || key === 'meal_tags') && Array.isArray(value)) {
    if (value.length === 0) return <span className="text-text-secondary/40 italic">none</span>
    return value.join(', ')
  }
  if (key === 'instructions') {
    return (
      <span className="whitespace-pre-line text-xs leading-relaxed line-clamp-8">
        {stripHtml(String(value))}
      </span>
    )
  }
  if (key === 'description') {
    return (
      <span className="whitespace-pre-line text-xs leading-relaxed line-clamp-6">
        {stripHtml(String(value))}
      </span>
    )
  }
  return String(value)
}

function IngredientLine({ ing }) {
  if (!ing || typeof ing !== 'object') {
    return <span className="text-sm font-body text-text-primary">{String(ing)}</span>
  }
  const macro =
    ing.calories != null || ing.protein != null || ing.carbs != null || ing.fat != null ? (
      <span className="block text-xs text-text-secondary mt-0.5">
        {ing.calories != null && <span>{ing.calories} cal</span>}
        {ing.protein != null && (
          <span>
            {ing.calories != null ? ' · ' : ''}
            {ing.protein}g P
          </span>
        )}
        {ing.carbs != null && <span> · {ing.carbs}g C</span>}
        {ing.fat != null && <span> · {ing.fat}g F</span>}
      </span>
    ) : null
  return (
    <span className="text-sm font-body text-text-primary">
      <span className="font-semibold">
        {ing.amount} {ing.unit} {ing.name}
      </span>
      {macro}
    </span>
  )
}

function IngredientsBlock({ title, list }) {
  const items = Array.isArray(list) ? list : []
  return (
    <div>
      <p className="text-xs font-body font-semibold text-text-secondary uppercase tracking-wide mb-2">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-text-secondary/60 italic">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((ing, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary mt-0.5 flex-shrink-0">✦</span>
              <IngredientLine ing={ing} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PendingEditDiffTable({ recipe, proposedEdits }) {
  const fieldsToShow = DIFF_FIELDS.filter(
    ({ key }) => recipe[key] != null || proposedEdits[key] != null
  )

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-display font-bold text-text-primary">Proposed changes</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <div className="grid grid-cols-[minmax(100px,120px)_1fr_1fr] gap-0 border-b border-border bg-background/50 text-xs font-semibold text-text-secondary uppercase tracking-wide">
          <div className="px-3 py-2 border-r border-border">Field</div>
          <div className="px-3 py-2 border-r border-border">Current</div>
          <div className="px-3 py-2">Proposed</div>
        </div>
        {fieldsToShow.map(({ key, label }) => {
          const liveVal = recipe[key]
          const proposedVal = proposedEdits[key]
          const changed = key in proposedEdits && !valuesEqual(liveVal, proposedVal)
          return (
            <div
              key={key}
              className={`grid grid-cols-[minmax(100px,120px)_1fr_1fr] gap-0 border-b border-border last:border-b-0 ${
                changed ? 'bg-amber-50/70' : ''
              }`}
            >
              <div className="px-3 py-2 border-r border-border text-xs font-semibold text-text-secondary self-start">
                {label}
                {changed && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />}
              </div>
              <div
                className={`px-3 py-2 border-r border-border text-sm ${
                  changed ? 'text-text-secondary/80 line-through decoration-1' : 'text-text-primary'
                }`}
              >
                {fieldDisplayDiff(key, liveVal)}
              </div>
              <div
                className={`px-3 py-2 text-sm ${
                  changed ? 'text-text-primary font-semibold' : 'text-text-secondary/50'
                }`}
              >
                {key in proposedEdits ? (
                  fieldDisplayDiff(key, proposedVal)
                ) : (
                  <span className="italic text-text-secondary/40">unchanged</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {(recipe.ingredients?.length > 0 || proposedEdits.ingredients?.length > 0) && (
        <div
          className={`grid md:grid-cols-2 gap-4 rounded-xl border p-4 ${
            'ingredients' in proposedEdits &&
            !valuesEqual(recipe.ingredients, proposedEdits.ingredients)
              ? 'border-amber-300 bg-amber-50/50'
              : 'border-border'
          }`}
        >
          <IngredientsBlock title="Current ingredients" list={recipe.ingredients} />
          <IngredientsBlock title="Proposed ingredients" list={proposedEdits.ingredients} />
        </div>
      )}
    </div>
  )
}

function ModerationReviewModal({ recipe, queueKind, onClose }) {
  const [rejectPanelOpen, setRejectPanelOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState('')
  const queryClient = useQueryClient()
  const { user } = useContext(AuthContext)

  const proposedEdits = recipe.pending_edit_data || {}
  const isPending = queueKind === 'pending'

  const resetAndClose = () => {
    setRejectPanelOpen(false)
    setRejectNote('')
    onClose()
  }

  const handleApprove = async (recipeId) => {
    console.log('admin action fired', { userId: user?.id, recipeId: recipe?.id })
    const { data, error } = await supabase.functions.invoke('admin-recipe-action', {
      body: { recipeId, action: 'approve', note: null },
    })
    if (error) {
      console.error('Approve error:', error)
    } else if (data?.error) {
      console.error('Approve error:', data.error)
    } else if (data?.success) {
      queryClient.invalidateQueries({ queryKey: ['adminPendingRecipes'] })
      queryClient.invalidateQueries({ queryKey: ['adminPendingEditRecipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
      resetAndClose()
    }
  }

  const handleReject = async (recipeId, note) => {
    console.log('admin action fired', { userId: user?.id, recipeId: recipe?.id })
    const { data, error } = await supabase.functions.invoke('admin-recipe-action', {
      body: { recipeId, action: 'reject', note },
    })
    if (error) {
      console.error('Reject error:', error)
    } else if (data?.error) {
      console.error('Reject error:', data.error)
    } else if (data?.success) {
      queryClient.invalidateQueries({ queryKey: ['adminPendingRecipes'] })
      queryClient.invalidateQueries({ queryKey: ['adminPendingEditRecipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })
      resetAndClose()
    }
  }

  const authorName = recipe.author?.display_name || recipe.author?.email || 'Unknown'

  return (
    <Modal
      open
      onClose={resetAndClose}
      title={isPending ? 'Review new recipe' : 'Review proposed edit'}
      width={1152}
    >
      <div className="space-y-6 pb-4">
        <div className="flex flex-wrap gap-3 text-sm font-body text-text-secondary">
          <span>
            <span className="text-text-primary font-semibold">Author:</span> {authorName}
          </span>
          {recipe.meal_tags?.length > 0 && (
            <span>
              <span className="text-text-primary font-semibold">Meal:</span>{' '}
              {recipe.meal_tags.map(capitalize).join(', ')}
            </span>
          )}
          {recipe.difficulty && (
            <span>
              <span className="text-text-primary font-semibold">Difficulty:</span>{' '}
              {capitalize(recipe.difficulty)}
            </span>
          )}
          {recipe.prep_time_minutes != null && (
            <span>
              <span className="text-text-primary font-semibold">Prep time:</span>{' '}
              {recipe.prep_time_minutes} min
            </span>
          )}
          {recipe.cook_time_minutes != null && (
            <span>
              <span className="text-text-primary font-semibold">Cook time:</span>{' '}
              {recipe.cook_time_minutes} min
            </span>
          )}
          {recipe.servings != null && (
            <span>
              <span className="text-text-primary font-semibold">Servings:</span> {recipe.servings}
            </span>
          )}
        </div>

        {recipe.image_url && (
          <img
            src={recipe.image_url}
            alt=""
            className="w-full max-h-72 rounded-xl object-cover border border-border"
          />
        )}

        <div>
          <h3 className="text-2xl font-display font-bold text-text-primary mb-2">{recipe.title}</h3>
          {recipe.description && (
            <div
              className="font-body text-text-primary leading-relaxed prose prose-sm max-w-none [&_p]:mb-2"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(renderContent(recipe.description)),
              }}
            />
          )}
        </div>

        {Array.isArray(recipe.dietary_tags) && recipe.dietary_tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.dietary_tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-body font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {!isPending && <PendingEditDiffTable recipe={recipe} proposedEdits={proposedEdits} />}

        {isPending && (
          <div className="grid md:grid-cols-2 gap-6">
            <IngredientsBlock title="Ingredients" list={recipe.ingredients} />
            {recipe.instructions && (
              <div>
                <p className="text-xs font-body font-semibold text-text-secondary uppercase tracking-wide mb-2">
                  Cooking instructions
                </p>
                <div
                  className="font-body text-sm text-text-primary leading-relaxed [&_p]:mb-3 [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-2 rounded-xl border border-border p-4 bg-background/40"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(renderContent(recipe.instructions)),
                  }}
                />
              </div>
            )}
          </div>
        )}

        {!isPending && proposedEdits.instructions && (
          <div>
            <p className="text-xs font-body font-semibold text-text-secondary uppercase tracking-wide mb-2">
              Proposed instructions (preview)
            </p>
            <div
              className="font-body text-sm text-text-primary leading-relaxed [&_p]:mb-3 [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-2 rounded-xl border border-border p-4 bg-background/40"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(renderContent(proposedEdits.instructions)),
              }}
            />
          </div>
        )}

        {!isPending && !proposedEdits.instructions && recipe.instructions && (
          <div>
            <p className="text-xs font-body font-semibold text-text-secondary uppercase tracking-wide mb-2">
              Current instructions
            </p>
            <div
              className="font-body text-sm text-text-primary leading-relaxed [&_p]:mb-3 [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-2 rounded-xl border border-border p-4 bg-background/40"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(renderContent(recipe.instructions)),
              }}
            />
          </div>
        )}

        <div className="sticky bottom-0 -mx-2 px-2 pt-4 border-t border-border bg-surface space-y-3">
          {!rejectPanelOpen ? (
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => handleApprove(recipe.id)}
                className="flex-1 min-w-[140px] bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle size={16} className="mr-2" />
                {isPending ? 'Approve' : 'Approve edit'}
              </Button>
              <Button
                type="button"
                onClick={() => setRejectPanelOpen(true)}
                variant="destructive"
                className="flex-1 min-w-[140px]"
              >
                <XCircle size={16} className="mr-2" />
                {isPending ? 'Reject' : 'Reject edit'}
              </Button>
            </div>
          ) : (
            <>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Tell the author why this was rejected (optional)"
                rows={3}
                className="w-full px-3 py-2 rounded-xl border-2 border-border bg-background text-text-primary font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary resize-none placeholder:text-text-secondary/50"
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={() => handleReject(recipe.id, rejectNote)}
                  variant="destructive"
                  className="flex-1 min-w-[140px]"
                >
                  <XCircle size={16} className="mr-2" />
                  Confirm Reject
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setRejectPanelOpen(false)
                    setRejectNote('')
                  }}
                  variant="secondary"
                  className="flex-1 min-w-[140px]"
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function AdminPage() {
  const [modalRecipe, setModalRecipe] = useState(null)
  const [modalKind, setModalKind] = useState(null)

  const { data: pendingRecipes, isLoading: loadingRecipes } = usePendingRecipes()
  const { data: pendingEditRecipes, isLoading: loadingEdits } = usePendingEditRecipes()

  const rows = useMemo(() => {
    const a = (pendingRecipes || []).map((recipe) => ({
      recipe,
      queueKind: 'pending',
      submittedAt: recipe.created_at,
    }))
    const b = (pendingEditRecipes || []).map((recipe) => ({
      recipe,
      queueKind: 'pending_edit',
      submittedAt: recipe.updated_at,
    }))
    return [...a, ...b].sort(
      (x, y) => new Date(x.submittedAt) - new Date(y.submittedAt)
    )
  }, [pendingRecipes, pendingEditRecipes])

  const loading = loadingRecipes || loadingEdits
  const total = rows.length

  const openReview = (recipe, queueKind) => {
    setModalRecipe(recipe)
    setModalKind(queueKind)
  }

  const closeModal = () => {
    setModalRecipe(null)
    setModalKind(null)
  }

  return (
    <PageWrapper
      title="Moderation Queue"
      subtitle="Review and approve recipes before they go live in All Recipes"
    >
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <CheckCircle size={56} className="text-green-400 mb-4" strokeWidth={1.5} />
          <p className="text-xl font-display font-bold text-text-primary mb-1">All clear</p>
          <p className="text-text-secondary font-body">Nothing waiting for review.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-border bg-surface shadow-sm">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background/40 text-sm text-text-secondary font-body">
            <Utensils size={18} className="text-primary flex-shrink-0" aria-hidden />
            <span>
              {total} recipe{total === 1 ? '' : 's'} awaiting review
            </span>
          </div>
          <table className="w-full min-w-[720px] text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-border bg-background/60">
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide">
                  Title
                </th>
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide">
                  Author
                </th>
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide">
                  Category
                </th>
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide">
                  Difficulty
                </th>
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide whitespace-nowrap">
                  Submitted
                </th>
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-body font-semibold text-text-secondary uppercase tracking-wide text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="font-body text-sm text-text-primary">
              {rows.map(({ recipe, queueKind, submittedAt }) => {
                const authorName =
                  recipe.author?.display_name || recipe.author?.email || 'Unknown'
                return (
                  <tr
                    key={`${queueKind}-${recipe.id}`}
                    className="border-b border-border last:border-b-0 hover:bg-background/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-semibold max-w-[220px]">
                      <span className="line-clamp-2">{recipe.title}</span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{authorName}</td>
                    <td className="px-4 py-3">
                      {recipe.meal_tags?.length > 0 ? recipe.meal_tags.map(capitalize).join(', ') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {recipe.difficulty ? capitalize(recipe.difficulty) : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary whitespace-nowrap">
                      {formatDate(submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {queueKind === 'pending' ? (
                        <span className="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300">
                          Pending Edit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        className="text-sm"
                        onClick={() => openReview(recipe, queueKind)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalRecipe && modalKind && (
        <ModerationReviewModal recipe={modalRecipe} queueKind={modalKind} onClose={closeModal} />
      )}
    </PageWrapper>
  )
}
