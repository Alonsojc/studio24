import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://trbhkegniatdhkebzncu.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYmhrZWduaWF0ZGhrZWJ6bmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODAyMDcsImV4cCI6MjA5MTc1NjIwN30.t4ghjdQG0WygF5cN6gL6sW_Tz8oMbG0_mf0z5KyvIA4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
