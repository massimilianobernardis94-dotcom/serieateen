// Espone solo le chiavi PUBBLICHE di Supabase (URL + anon key).
// La anon key è pensata per stare nel client: la sicurezza vera
// è garantita dalle Row Level Security policy nel database.
export default function handler(req, res) {
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
}
