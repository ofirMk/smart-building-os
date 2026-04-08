/**
 * Single import surface for Supabase-generated types (Diamond V1.0).
 * Regenerate: `npx supabase gen types typescript --linked > types/supabase.ts`
 *
 * Use in **lib/** modules for row shapes: `Tables<"projects">`, inserts: `TablesInsert<"...">`.
 * Runtime clients stay loosely typed until the schema and generated file are fully aligned.
 */
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "@/types/supabase"
