[1mdiff --git a/src/App.jsx b/src/App.jsx[m
[1mindex f935652..e18a90b 100644[m
[1m--- a/src/App.jsx[m
[1m+++ b/src/App.jsx[m
[36m@@ -40,7 +40,7 @@[m [mconst queryClient = new QueryClient({[m
       refetchOnWindowFocus: false,[m
       retry: 1,[m
       staleTime: 5 * 60 * 1000, // 5 minutes[m
[31m-      cacheTime: 30 * 60 * 1000, // 30 minutes - keep data in cache longer[m
[32m+[m[32m      gcTime: 30 * 60 * 1000, // 30 minutes - keep data in cache longer (v5 name for cacheTime)[m
     },[m
   },[m
 })[m
[1mdiff --git a/src/components/planner/WeeklyPlanner.jsx b/src/components/planner/WeeklyPlanner.jsx[m
[1mindex 101fa6a..e0a4291 100644[m
[1m--- a/src/components/planner/WeeklyPlanner.jsx[m
[1m+++ b/src/components/planner/WeeklyPlanner.jsx[m
[36m@@ -66,7 +66,7 @@[m [mexport function WeeklyPlanner({ onMacroDataChange }) {[m
   const { data: recentRecipeIds } = useRecentMealHistory(profile?.recent_meal_filter_weeks || 2)[m
 [m
   // Initialize selected members once household data loads[m
[31m-  useMemo(() => {[m
[32m+[m[32m  useEffect(() => {[m
     if (householdMembers && householdMembers.length > 0 && selectedMembers.length === 0) {[m
       setSelectedMembers(householdMembers.map(m => m.id))[m
     }[m
[1mdiff --git a/src/components/recipe-detail-mobile/TitleBlock.jsx b/src/components/recipe-detail-mobile/TitleBlock.jsx[m
[1mindex 0039e85..233176f 100644[m
[1m--- a/src/components/recipe-detail-mobile/TitleBlock.jsx[m
[1m+++ b/src/components/recipe-detail-mobile/TitleBlock.jsx[m
[36m@@ -1,6 +1,6 @@[m
 import { Clock, ExternalLink } from 'lucide-react'[m
 import { Badge } from '../ui/Badge'[m
[31m-import { capitalize } from '../../lib/utils'[m
[32m+[m[32mimport { capitalize, externalHref } from '../../lib/utils'[m
 [m
 export function TitleBlock({ recipe, servings, stepper }) {[m
   const tags = [[m
[36m@@ -55,7 +55,7 @@[m [mexport function TitleBlock({ recipe, servings, stepper }) {[m
 [m
       {recipe.source_url && ([m
         <a[m
[31m-          href={recipe.source_url}[m
[32m+[m[32m          href={externalHref(recipe.source_url)}[m
           target="_blank"[m
           rel="noreferrer noopener"[m
           className="inline-flex items-center gap-1 mt-3 text-[12px] font-body font-semibold text-primary"[m
[1mdiff --git a/src/components/recipes/RecipeCard.jsx b/src/components/recipes/RecipeCard.jsx[m
[1mindex d806389..bbc662b 100644[m
[1m--- a/src/components/recipes/RecipeCard.jsx[m
[1m+++ b/src/components/recipes/RecipeCard.jsx[m
[36m@@ -14,6 +14,7 @@[m [mexport function RecipeCard({ recipe, isFavorited = false, linkState = null }) {[m
   const handleToggleFavorite = (e) => {[m
     e.preventDefault()[m
     e.stopPropagation()[m
[32m+[m[32m    if (!user || toggleFavorite.isPending) return[m
     toggleFavorite.mutate({ recipeId: recipe.id, isFavorited })[m
   }[m
 [m
[1mdiff --git a/src/context/AuthContext.jsx b/src/context/AuthContext.jsx[m
[1mindex d8e607b..e66626e 100644[m
[1m--- a/src/context/AuthContext.jsx[m
[1m+++ b/src/context/AuthContext.jsx[m
[36m@@ -1,10 +1,12 @@[m
 import { createContext, useEffect, useState } from 'react'[m
[32m+[m[32mimport { useQueryClient } from '@tanstack/react-query'[m
 import { supabase } from '../lib/supabase'[m
 import { posthog } from '../lib/posthog'[m
 [m
 export const AuthContext = createContext({})[m
 [m
 export function AuthProvider({ children }) {[m
[32m+[m[32m  const queryClient = useQueryClient()[m
   const [user, setUser] = useState(null)[m
   const [session, setSession] = useState(null)[m
   const [loading, setLoading] = useState(true)[m
[36m@@ -74,6 +76,8 @@[m [mexport function AuthProvider({ children }) {[m
     const { error } = await supabase.auth.signOut()[m
     if (error) throw error[m
     posthog.reset()[m
[32m+[m[32m    // Drop all cached server state so the next account never sees this user's data[m
[32m+[m[32m    queryClient.clear()[m
   }[m
 [m
   const resetPasswordForEmail = async (email) => {[m
[1mdiff --git a/src/hooks/usePlanner.js b/src/hooks/usePlanner.js[m
[1mindex c57d500..5ca886f 100644[m
[1m--- a/src/hooks/usePlanner.js[m
[1m+++ b/src/hooks/usePlanner.js[m
[36m@@ -166,6 +166,14 @@[m [mexport function useUpdateMealPlanEntry() {[m
         .single()[m
 [m
       if (error) throw error[m
[32m+[m
[32m+[m[32m      // Keep leftover entries spawned from this cook event pointing at the same recipe[m
[32m+[m[32m      const { error: leftoverError } = await supabase[m
[32m+[m[32m        .from('meal_plan_entries')[m
[32m+[m[32m        .update({ recipe_id: recipeId })[m
[32m+[m[32m        .eq('original_entry_id', id)[m
[32m+[m[32m      if (leftoverError) throw leftoverError[m
[32m+[m
       return data[m
     },[m
     onSuccess: () => {[m
[36m@@ -289,6 +297,13 @@[m [mexport function useRemoveMealPlanEntry() {[m
 [m
   return useMutation({[m
     mutationFn: async (id) => {[m
[32m+[m[32m      // Delete any leftover entries owned by this cook event first, then the entry[m
[32m+[m[32m      const { error: leftoverError } = await supabase[m
[32m+[m[32m        .from('meal_plan_entries')[m
[32m+[m[32m        .delete()[m
[32m+[m[32m        .eq('original_entry_id', id)[m
[32m+[m[32m      if (leftoverError) throw leftoverError[m
[32m+[m
       const { error } = await supabase[m
         .from('meal_plan_entries')[m
         .delete()[m
[1mdiff --git a/src/hooks/useRecipes.js b/src/hooks/useRecipes.js[m
[1mindex 06e54cf..844a738 100644[m
[1m--- a/src/hooks/useRecipes.js[m
[1m+++ b/src/hooks/useRecipes.js[m
[36m@@ -302,6 +302,8 @@[m [mexport function useUpdateRecipe() {[m
     onSuccess: () => {[m
       queryClient.invalidateQueries({ queryKey: ['recipes'] })[m
       queryClient.invalidateQueries({ queryKey: ['recipe'] })[m
[32m+[m[32m      // Meal plan entries embed a full recipe copy — refresh those too[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })[m
     },[m
   })[m
 }[m
[36m@@ -330,6 +332,8 @@[m [mexport function useDeleteRecipe() {[m
     },[m
     onSuccess: () => {[m
       queryClient.invalidateQueries({ queryKey: ['recipes'] })[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['recipe'] })[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['mealPlan'] })[m
     },[m
   })[m
 }[m
[36m@@ -350,8 +354,9 @@[m [mexport function useDismissAdminNote() {[m
       if (error) throw error[m
       return data[m
     },[m
[31m-    onSuccess: (data) => {[m
[31m-      queryClient.invalidateQueries({ queryKey: ['recipe', data.id] })[m
[32m+[m[32m    onSuccess: () => {[m
[32m+[m[32m      // Detail pages key by slug, not UUID — invalidate the whole ['recipe'] prefix[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['recipe'] })[m
       queryClient.invalidateQueries({ queryKey: ['recipes'] })[m
     },[m
   })[m
[36m@@ -444,6 +449,8 @@[m [mexport function useToggleFavorite() {[m
     onSuccess: () => {[m
       queryClient.invalidateQueries({ queryKey: ['recipe_favorites', user?.id] })[m
       queryClient.invalidateQueries({ queryKey: ['recipeFavoriteCount'] })[m
[32m+[m[32m      // Favorites-only recipe lists depend on this table[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['recipes'] })[m
     },[m
   })[m
 }[m
[1mdiff --git a/src/lib/utils.js b/src/lib/utils.js[m
[1mindex 7d9aec7..748c1c5 100644[m
[1m--- a/src/lib/utils.js[m
[1m+++ b/src/lib/utils.js[m
[36m@@ -7,6 +7,13 @@[m [mexport function cn(...inputs) {[m
 [m
 export const stripHtml = (html) => html?.replace(/<[^>]*>/g, '') ?? ''[m
 [m
[32m+[m[32m/** Ensure an external link has a protocol so it doesn't resolve as an SPA route. */[m
[32m+[m[32mexport function externalHref(url) {[m
[32m+[m[32m  if (!url) return url[m
[32m+[m[32m  const trimmed = String(url).trim()[m
[32m+[m[32m  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`[m
[32m+[m[32m}[m
[32m+[m
 export function getGreeting() {[m
   const hour = new Date().getHours()[m
   if (hour < 12) return 'morning'[m
[1mdiff --git a/src/pages/AdminPage.jsx b/src/pages/AdminPage.jsx[m
[1mindex 5a182b1..7557a5f 100644[m
[1m--- a/src/pages/AdminPage.jsx[m
[1m+++ b/src/pages/AdminPage.jsx[m
[36m@@ -218,7 +218,7 @@[m [mfunction ModerationReviewModal({ recipe, queueKind, onClose }) {[m
       queryClient.invalidateQueries({ queryKey: ['adminPendingRecipes'] })[m
       queryClient.invalidateQueries({ queryKey: ['adminPendingEditRecipes'] })[m
       queryClient.invalidateQueries({ queryKey: ['recipes'] })[m
[31m-      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['recipe'] }) // detail pages key by slug[m
       resetAndClose()[m
     }[m
   }[m
[36m@@ -236,7 +236,7 @@[m [mfunction ModerationReviewModal({ recipe, queueKind, onClose }) {[m
       queryClient.invalidateQueries({ queryKey: ['adminPendingRecipes'] })[m
       queryClient.invalidateQueries({ queryKey: ['adminPendingEditRecipes'] })[m
       queryClient.invalidateQueries({ queryKey: ['recipes'] })[m
[31m-      queryClient.invalidateQueries({ queryKey: ['recipe', recipeId] })[m
[32m+[m[32m      queryClient.invalidateQueries({ queryKey: ['recipe'] }) // detail pages key by slug[m
       resetAndClose()[m
     }[m
   }[m
[1mdiff --git a/src/pages/CheckEmail.jsx b/src/pages/CheckEmail.jsx[m
[1mindex 36b88ff..03a8efe 100644[m
[1m--- a/src/pages/CheckEmail.jsx[m
[1m+++ b/src/pages/CheckEmail.jsx[m
[36m@@ -1,5 +1,5 @@[m
 import { useState } from 'react'[m
[31m-import { Link, useLocation, useNavigate } from 'react-router-dom'[m
[32m+[m[32mimport { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'[m
 import { useAuth } from '../hooks/useAuth'[m
 import { Button } from '../components/ui/Button'[m
 import { Card } from '../components/ui/Card'[m
[36m@@ -13,8 +13,8 @@[m [mexport function CheckEmail() {[m
   const email = state?.email[m
 [m
   if (!email) {[m
[31m-    navigate('/login', { replace: true })[m
[31m-    return null[m
[32m+[m[32m    // Declarative redirect — calling navigate() during render is a React error[m
[32m+[m[32m    return <Navigate to="/login" replace />[m
   }[m
 [m
   const handleWrongEmail = async () => {[m
[1mdiff --git a/src/pages/Landing.jsx b/src/pages/Landing.jsx[m
[1mindex f632f33..cef7b75 100644[m
[1m--- a/src/pages/Landing.jsx[m
[1m+++ b/src/pages/Landing.jsx[m
[36m@@ -112,7 +112,7 @@[m [mexport function Landing() {[m
     try {[m
       let query = supabase[m
         .from('recipes')[m
[31m-        .select('id, title, description, image_url, cuisine_type, meal_tags, difficulty, cook_time_minutes, calories, protein_g, carbs_g, fat_g')[m
[32m+[m[32m        .select('id, slug, title, description, image_url, cuisine_type, meal_tags, difficulty, cook_time_minutes, calories, protein_g, carbs_g, fat_g, servings')[m
         .eq('status', 'published')[m
         .neq('recipe_type', 'quick')[m
 [m
[1mdiff --git a/src/pages/RecipeDetailDesktop.jsx b/src/pages/RecipeDetailDesktop.jsx[m
[1mindex 1578f09..035d750 100644[m
[1m--- a/src/pages/RecipeDetailDesktop.jsx[m
[1m+++ b/src/pages/RecipeDetailDesktop.jsx[m
[36m@@ -1,4 +1,4 @@[m
[31m-import { useState, useEffect, useMemo, useCallback } from 'react'[m
[32m+[m[32mimport { useState, useEffect, useMemo, useRef, useCallback } from 'react'[m
 import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'[m
 import { useQueryClient } from '@tanstack/react-query'[m
 import DOMPurify from 'dompurify'[m
[36m@@ -35,6 +35,7 @@[m [mimport { useProfile } from '../hooks/useProfile'[m
 import { useMealSlots } from '../hooks/useMealSlots'[m
 import {[m
   capitalize,[m
[32m+[m[32m  externalHref,[m
   formatLocalDateString,[m
   formatSlotLabel,[m
   getDaysOfWeek,[m
[36m@@ -104,6 +105,10 @@[m [mexport function RecipeDetailDesktop() {[m
   const [showLeftoverRemovalConfirm, setShowLeftoverRemovalConfirm] = useState(false)[m
   const [leftoverRemovalData, setLeftoverRemovalData] = useState(null)[m
 [m
[32m+[m[32m  // Delayed post-action navigations, cancelled if the user leaves the page first[m
[32m+[m[32m  const navTimerRef = useRef(null)[m
[32m+[m[32m  useEffect(() => () => clearTimeout(navTimerRef.current), [])[m
[32m+[m
   const { data: recipe, isLoading } = useRecipe(id)[m
   const { data: favoriteIds } = useUserFavoriteIds()[m
   const { data: favoriteCount } = useRecipeFavoriteCount(recipe?.id)[m
[36m@@ -174,7 +179,7 @@[m [mexport function RecipeDetailDesktop() {[m
   // eslint-disable-next-line react-hooks/exhaustive-deps[m
   }, [pendingSlot?.mealType, recipe?.meal_tags, mealSlotNames])[m
 [m
[31m-  const isFavorited = favoriteIds?.has(id) ?? false[m
[32m+[m[32m  const isFavorited = favoriteIds?.has(recipe?.id) ?? false[m
   const isCreator = !!(user?.id && recipe?.created_by === user.id)[m
 [m
   const scaleFactor = useMemo(() => {[m
[36m@@ -236,7 +241,7 @@[m [mexport function RecipeDetailDesktop() {[m
     try {[m
       await deleteRecipe.mutateAsync({ id: recipe.id, status: 'published' })[m
       showToast('This recipe has been removed from your recipes but remains available in All Recipes.')[m
[31m-      setTimeout(() => navigate('/recipes'), 2500)[m
[32m+[m[32m      navTimerRef.current = setTimeout(() => navigate('/recipes'), 2500)[m
     } catch (error) {[m
       console.error('Error hiding recipe:', error)[m
     }[m
[36m@@ -252,8 +257,9 @@[m [mexport function RecipeDetailDesktop() {[m
   }[m
 [m
   const handleToggleFavorite = () => {[m
[31m-    if (!user) return[m
[31m-    toggleFavorite.mutate({ recipeId: id, isFavorited })[m
[32m+[m[32m    if (!user || !recipe?.id) return[m
[32m+[m[32m    // recipe.id is the UUID; the route param may be a slug[m
[32m+[m[32m    toggleFavorite.mutate({ recipeId: recipe.id, isFavorited })[m
   }[m
 [m
   const handleShare = async () => {[m
[36m@@ -268,10 +274,10 @@[m [mexport function RecipeDetailDesktop() {[m
   }[m
 [m
   const handleNoteBlur = async () => {[m
[31m-    if (noteText === null || !user) return[m
[32m+[m[32m    if (noteText === null || !user || !recipe?.id) return[m
     setNoteSaving(true)[m
     try {[m
[31m-      await upsertNote.mutateAsync({ recipeId: id, notes: noteText })[m
[32m+[m[32m      await upsertNote.mutateAsync({ recipeId: recipe.id, notes: noteText })[m
       setNoteSaved(true)[m
       setTimeout(() => setNoteSaved(false), 2500)[m
     } catch (error) {[m
[36m@@ -471,7 +477,7 @@[m [mexport function RecipeDetailDesktop() {[m
       })[m
 [m
       setAdded(true)[m
[31m-      setTimeout(() => navigate('/dashboard'), 1000)[m
[32m+[m[32m      navTimerRef.current = setTimeout(() => navigate('/dashboard'), 1000)[m
     } catch (error) {[m
       console.error('Error adding to plan:', error)[m
       alert(`Error: ${error.message}`)[m
[36m@@ -578,7 +584,7 @@[m [mexport function RecipeDetailDesktop() {[m
               </p>[m
             </div>[m
             <button[m
[31m-              onClick={() => dismissAdminNote.mutate(id)}[m
[32m+[m[32m              onClick={() => dismissAdminNote.mutate(recipe.id)}[m
               className={`flex-shrink-0 text-xs font-body font-semibold underline ${[m
                 recipe.status === 'published'[m
                   ? 'text-success hover:opacity-80'[m
[36m@@ -715,7 +721,7 @@[m [mexport function RecipeDetailDesktop() {[m
               {/* Source link */}[m
               {recipe.source_url && ([m
                 <a[m
[31m-                  href={recipe.source_url}[m
[32m+[m[32m                  href={externalHref(recipe.source_url)}[m
                   target="_blank"[m
                   rel="noopener noreferrer"[m
                   className="flex items-center gap-1.5 text-primary hover:underline font-semibold"[m
[1mdiff --git a/src/pages/RecipeDetailMobile.jsx b/src/pages/RecipeDetailMobile.jsx[m
[1mindex 3004a3c..cb5231d 100644[m
[1m--- a/src/pages/RecipeDetailMobile.jsx[m
[1m+++ b/src/pages/RecipeDetailMobile.jsx[m
[36m@@ -134,6 +134,10 @@[m [mexport function RecipeDetailMobile() {[m
     }[m
   }, [recipe, mealPlanEntry?.servings, displayServings])[m
 [m
[32m+[m[32m  // Delayed post-action navigations, cancelled if the user leaves the page first[m
[32m+[m[32m  const navTimerRef = useRef(null)[m
[32m+[m[32m  useEffect(() => () => clearTimeout(navTimerRef.current), [])[m
[32m+[m
   // ── IntersectionObserver: showTitle when hero scrolls past TopAppBar ──[m
   const heroRef = useRef(null)[m
   useEffect(() => {[m
[36m@@ -200,7 +204,7 @@[m [mexport function RecipeDetailMobile() {[m
     try {[m
       await deleteRecipe.mutateAsync({ id: recipe.id, status: 'published' })[m
       showToastMsg('Removed from your recipes.')[m
[31m-      setTimeout(() => navigate('/recipes'), 1500)[m
[32m+[m[32m      navTimerRef.current = setTimeout(() => navigate('/recipes'), 1500)[m
     } catch (err) {[m
       console.error('[RecipeDetailMobile] hide failed:', err)[m
     }[m
[36m@@ -216,8 +220,9 @@[m [mexport function RecipeDetailMobile() {[m
 [m
   // ── Favorite ──────────────────────────────────────────────────[m
   const handleToggleFavorite = () => {[m
[31m-    if (!user) return[m
[31m-    toggleFavorite.mutate({ recipeId: id, isFavorited })[m
[32m+[m[32m    if (!user || !recipe?.id) return[m
[32m+[m[32m    // recipe.id is the UUID; the route param may be a slug[m
[32m+[m[32m    toggleFavorite.mutate({ recipeId: recipe.id, isFavorited })[m
   }[m
 [m
   // ── Share ─────────────────────────────────────────────────────[m
[36m@@ -413,7 +418,7 @@[m [mexport function RecipeDetailMobile() {[m
         servings: entryServings,[m
       })[m
       setAdded(true)[m
[31m-      setTimeout(() => navigate('/dashboard'), 900)[m
[32m+[m[32m      navTimerRef.current = setTimeout(() => navigate('/dashboard'), 900)[m
     } catch (err) {[m
       console.error('[RecipeDetailMobile] add to plan failed:', err)[m
       showToastMsg(`Error: ${err.message}`, 'error')[m
[36m@@ -483,11 +488,14 @@[m [mexport function RecipeDetailMobile() {[m
         <div className="px-4 py-12 text-center">[m
           <Utensils size={48} className="text-primary/30 mx-auto mb-4" strokeWidth={1.5} />[m
           <p className="text-text-secondary font-body text-[15px] mb-5">Recipe not found.</p>[m
[31m-          <Link to="/recipes">[m
[31m-            <Button platform="mobile" variant="secondary">Browse recipes</Button>[m
[32m+[m[32m          {/* /recipes is a protected route — send logged-out visitors home instead */}[m
[32m+[m[32m          <Link to={user ? '/recipes' : '/'}>[m
[32m+[m[32m            <Button platform="mobile" variant="secondary">[m
[32m+[m[32m              {user ? 'Browse recipes' : 'Back to home'}[m
[32m+[m[32m            </Button>[m
           </Link>[m
         </div>[m
[31m-        <BottomNav />[m
[32m+[m[32m        {user && <BottomNav />}[m
       </div>[m
     )[m
   }[m
[36m@@ -548,7 +556,7 @@[m [mexport function RecipeDetailMobile() {[m
             <p className="text-text-secondary mt-0.5">Note from admin: {recipe.admin_note}</p>[m
           </div>[m
           <button[m
[31m-            onClick={() => dismissAdminNote.mutate(id)}[m
[32m+[m[32m            onClick={() => dismissAdminNote.mutate(recipe.id)}[m
             className="text-[12px] font-body font-semibold text-text-secondary underline"[m
           >[m
             Dismiss[m
[36m@@ -627,7 +635,7 @@[m [mexport function RecipeDetailMobile() {[m
       <InstructionsSection instructions={recipe.instructions} />[m
 [m
       {/* My Notes (logged-in) */}[m
[31m-      {user && <MyNotesSection recipeId={id} />}[m
[32m+[m[32m      {user && <MyNotesSection recipeId={recipe.id} />}[m
 [m
       {/* SignUpCard (logged-out) */}[m
       {!user && <SignUpCard />}[m
[36m@@ -642,7 +650,8 @@[m [mexport function RecipeDetailMobile() {[m
         />[m
       )}[m
 [m
[31m-      <BottomNav />[m
[32m+[m[32m      {/* Every BottomNav tab targets a protected route — hide it from logged-out visitors */}[m
[32m+[m[32m      {user && <BottomNav />}[m
 [m
       {/* Edit modal */}[m
       {isEditOpen && recipe?.recipe_type === 'quick' ? ([m
