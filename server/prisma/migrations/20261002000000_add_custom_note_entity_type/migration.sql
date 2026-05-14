-- Adds CUSTOM to NoteEntityType so notes can link to free-text /
-- external references (e.g., a LeetCode URL the team doesn't track as
-- a Problem yet). Additive enum value — safe on prod data.

ALTER TYPE "NoteEntityType" ADD VALUE IF NOT EXISTS 'CUSTOM';
