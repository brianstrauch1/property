import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let supabase: ReturnType<typeof createClient<Database>> | null = null

export function supabaseBrowser() {
  if (!supabase) {
    supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return supabase
}