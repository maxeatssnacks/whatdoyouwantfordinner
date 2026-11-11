-- 021: admin and publishing locked on the server (security round from the
-- audit of 2026-11-10: findings 1, 2, 6 and 15).
--
-- Written against the live database as read on 2026-11-10, not migrations
-- 001–020, which no longer describe it (finding 16): recipes are owned by
-- created_by (not user_id), and the live policies are listed in
-- PROJECT_NOTES.md (v2 decisions, Security).
--
-- Additive and safe to run twice: functions are created or replaced,
-- triggers are dropped if they exist and created again, and ALTER FUNCTION
-- and COMMENT set the same values again. No data changes, no policy changes.

begin;

-- ── a. is_admin can't be set by the client (finding 1) ──────────────────────
-- Already run in the SQL editor on 2026-11-10; here exactly as it was run, so
-- the repo matches the database. Signed-in people (and anon) can't insert an
-- admin profile or change is_admin; the SQL editor and the service role can.

create or replace function public.protect_profile_admin() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then new.is_admin := false;
    elsif new.is_admin is distinct from old.is_admin then new.is_admin := old.is_admin;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists protect_profile_admin on public.profiles;
create trigger protect_profile_admin before insert or update on public.profiles for each row execute function public.protect_profile_admin();

-- ── b. Publishing only through review (finding 2) ───────────────────────────
-- For signed-in people who aren't admins (profiles.is_admin, which (a) makes
-- safe to trust), whatever the client sends:
--   1. Nothing becomes published: no insert as published, no update to
--      published from another status. A published recipe may stay published.
--   2. Only a published recipe can get a proposed edit: 'pending_edit' only
--      from 'published' (the app before this round) or kept on a row that
--      already has it. A rejected proposed edit goes back to published, so a
--      row that never was published must not reach 'pending_edit'.
--   3. While a recipe is published (or has the old 'pending_edit' status) and
--      stays so, its live fields can't change. Only the proposed-edit path
--      may run: pending_edit_data, admin_note (the author dismissing it),
--      updated_at and the status between those two. "Live fields" is every
--      other column, read from the row itself, so columns the repo's
--      migrations don't know about are covered too. Generated columns are
--      left out (they aren't computed yet in a BEFORE trigger).
-- Leaving the library is still allowed, as today: hide (status 'hidden'), or
-- an older published quick meal edited into a 'draft'. Admins, the service
-- role (admin-recipe-action) and the SQL editor aren't checked. Deletes don't
-- fire it. The app never sends a refused write for an ordinary account, so
-- the errors are plain sentences (SQLSTATE 42501, which PostgREST returns as
-- 403).

create or replace function public.guard_recipe_review() returns trigger language plpgsql set search_path = public as $$
declare
  free_cols text[] := array['status', 'pending_edit_data', 'admin_note', 'updated_at'];
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_admin is true) then
    return new;
  end if;

  if new.status = 'published' and not (tg_op = 'UPDATE' and old.status = 'published') then
    raise exception 'Only an admin can publish a recipe.' using errcode = '42501';
  end if;

  if new.status = 'pending_edit' and not (tg_op = 'UPDATE' and old.status in ('published', 'pending_edit')) then
    raise exception 'Only a published recipe can have a proposed edit.' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and old.status in ('published', 'pending_edit')
     and new.status in ('published', 'pending_edit') then
    select free_cols || coalesce(array_agg(attname::text), '{}')
      into free_cols
      from pg_attribute
      where attrelid = 'public.recipes'::regclass
        and attnum > 0 and not attisdropped and attgenerated <> '';
    if (to_jsonb(new) - free_cols) is distinct from (to_jsonb(old) - free_cols) then
      raise exception 'A published recipe can only be changed through a proposed edit.' using errcode = '42501';
    end if;
  end if;

  return new;
end; $$;
drop trigger if exists recipes_guard_review on public.recipes;
create trigger recipes_guard_review before insert or update on public.recipes for each row execute function public.guard_recipe_review();

-- ── c. Proposed edits keep the recipe readable (finding 6) ──────────────────
-- No policy change. From this round a proposed edit leaves the recipe
-- 'published' and is marked by pending_edit_data alone, so the live recipe
-- is read exactly as before by everyone who could read it (the read policy,
-- All Recipes, the landing page, Plan my week, other households' weeks).
-- Rows already in 'pending_edit' stay as they are (no data change); the
-- admin page lists both kinds and admin-recipe-action handles both.

comment on column public.recipes.pending_edit_data is
  'A proposed edit waiting for review: the recipe form''s fields. The recipe stays published (since 021); older rows may still have status pending_edit. Applied or cleared by admin-recipe-action.';

-- ── d. The slug trigger sees every slug (finding 15) ────────────────────────
-- SECURITY DEFINER so its "is this slug taken?" query isn't limited to the
-- rows the person may read. The body isn't touched (the live one may differ
-- from 014). The path is fixed; extensions is in it because Supabase keeps
-- extensions such as unaccent (which generate_recipe_slug calls) there.

alter function public.set_recipe_slug_on_insert() security definer set search_path = public, extensions;

commit;
