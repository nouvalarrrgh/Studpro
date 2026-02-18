// js/supabase.js
const { createClient } = supabase;

// GANTI DENGAN KREDENSIAL PROYEK SUPABASE ANDA
const SUPABASE_URL = 'https://jhroizqbsijvjdvgkonf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impocm9penFic2lqdmpkdmdrb25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTM5OTIsImV4cCI6MjA4Njg2OTk5Mn0.6Oa1-jMMALKOfXV48BqIVX02HGVIzfemeDg03R016vY';

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);