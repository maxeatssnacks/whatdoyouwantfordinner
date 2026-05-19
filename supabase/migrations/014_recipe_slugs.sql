-- Add slug column to recipes.
-- Slug is generated automatically at INSERT time via a BEFORE INSERT trigger.
-- Slug is frozen: edits to the recipe title do NOT update the slug.
-- Collision strategy: base slug first, then -2, -3, etc.

-- ── Step 0: Extension ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ── Step 1: Slugifier function ────────────────────────────────────────────────
-- Converts a recipe title to a URL-safe slug. Does NOT handle uniqueness;
-- that lives in the trigger below.
--
-- Declared STABLE (not IMMUTABLE) because unaccent() is STABLE; a function
-- calling a STABLE function cannot itself be IMMUTABLE.
CREATE OR REPLACE FUNCTION generate_recipe_slug(input_title text)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  result text;
BEGIN
  result := lower(input_title);
  -- Convert accented chars (é→e, ñ→n, etc.) to ASCII before stripping
  -- non-alphanumeric. Without this, 'Pâté Brisée' becomes 'pt-brise'
  -- instead of the correct 'pate-brisee'.
  result := unaccent(result);
  -- Strip everything except a-z, 0-9, and spaces
  result := regexp_replace(result, '[^a-z0-9 ]', '', 'g');
  -- Collapse multiple spaces to one
  result := regexp_replace(result, ' +', ' ', 'g');
  -- Trim leading/trailing whitespace
  result := trim(result);
  -- Replace spaces with hyphens
  result := replace(result, ' ', '-');
  -- Collapse multiple hyphens (can arise if original had e.g. "  -  ")
  result := regexp_replace(result, '-+', '-', 'g');
  -- Cap slug length at 80 chars so very long titles don't produce unwieldy URLs.
  result := substring(result, 1, 80);
  -- Trim trailing hyphen if the 80-char substring cut on a hyphen boundary.
  result := regexp_replace(result, '-+$', '', 'g');
  -- Fallback for titles that strip to nothing (e.g. all special characters)
  IF result = '' OR result IS NULL THEN
    result := 'untitled-recipe';
  END IF;
  RETURN result;
END;
$$;

-- ── Step 2: Add the slug column (nullable for now) ────────────────────────────
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS slug text;

-- ── Step 3: Trigger function — generates a unique slug at insert time ─────────
CREATE OR REPLACE FUNCTION set_recipe_slug_on_insert()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
  suffix    integer := 2;
BEGIN
  base_slug := generate_recipe_slug(NEW.title);
  candidate := base_slug;

  -- Serialize concurrent inserts that would generate the same base slug.
  -- The advisory lock is keyed by hash of base_slug and released at
  -- transaction end. Unrelated base slugs proceed in parallel; only
  -- concurrent inserts of the same title block each other.
  PERFORM pg_advisory_xact_lock(hashtext(base_slug));

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM recipes WHERE slug = candidate
    );
    IF suffix > 1000 THEN
      RAISE EXCEPTION 'Slug generation exhausted suffix range for base %', base_slug;
    END IF;
    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

-- ── Step 4: Attach trigger ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS recipes_set_slug ON recipes;
CREATE TRIGGER recipes_set_slug
  BEFORE INSERT ON recipes
  FOR EACH ROW EXECUTE FUNCTION set_recipe_slug_on_insert();

-- ── Step 5: Backfill any existing rows that lack a slug ───────────────────────
-- This DO block applies the same collision logic as the trigger so it's safe
-- on a populated table. In production the table was truncated before this
-- migration ran, but the block is correct for any future dev/staging re-run.
DO $$
DECLARE
  rec       RECORD;
  base_slug text;
  candidate text;
  suffix    integer;
BEGIN
  FOR rec IN SELECT id, title FROM recipes WHERE slug IS NULL ORDER BY created_at LOOP
    base_slug := generate_recipe_slug(rec.title);
    candidate := base_slug;
    suffix    := 2;

    LOOP
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM recipes WHERE slug = candidate AND id <> rec.id
      );
      IF suffix > 1000 THEN
        RAISE EXCEPTION 'Slug generation exhausted suffix range for base % (backfill)', base_slug;
      END IF;
      candidate := base_slug || '-' || suffix;
      suffix    := suffix + 1;
    END LOOP;

    UPDATE recipes SET slug = candidate WHERE id = rec.id;
  END LOOP;
END;
$$;

-- ── Step 6: NOT NULL + UNIQUE constraint ──────────────────────────────────────
-- The UNIQUE constraint creates its own index internally; no separate
-- CREATE INDEX needed.
ALTER TABLE recipes ALTER COLUMN slug SET NOT NULL;
ALTER TABLE recipes ADD CONSTRAINT recipes_slug_unique UNIQUE (slug);
