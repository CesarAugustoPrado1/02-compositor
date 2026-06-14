import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cepmhyrfolkdipqpvznz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_zJ62U5pl3rk8P71jGSzWhA_OywV_0iv';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);