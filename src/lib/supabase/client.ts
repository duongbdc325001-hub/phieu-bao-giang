import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let clientInstance: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (clientInstance) return clientInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Chưa cấu hình NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY!')
  }

  clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return clientInstance
}