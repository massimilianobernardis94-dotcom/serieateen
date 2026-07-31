// Config Supabase. I valori vengono iniettati da /api/config a runtime,
// così non finiscono hardcoded nel repo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _client = null;

export async function getSupabase() {
  if (_client) return _client;
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Config non disponibile');
  const { supabaseUrl, supabaseAnonKey } = await res.json();
  _client = createClient(supabaseUrl, supabaseAnonKey);
  return _client;
}
