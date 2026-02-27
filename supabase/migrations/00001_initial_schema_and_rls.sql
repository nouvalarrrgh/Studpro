-- ==============================================================================
-- DOKUMENTASI SKEMA & ROW LEVEL SECURITY (RLS) - STUDENT PRODUCTIVITY APP
-- ==============================================================================

-- 1. AKTIFKAN RLS UNTUK SEMUA TABEL INTI
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

-- Catatan Pengecualian: 
-- Tabel workspace_pages sengaja dinonaktifkan RLS-nya secara sementara 
-- untuk mengatasi isu penghapusan dari frontend (Client-Side).
ALTER TABLE public.workspace_pages DISABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. KEBIJAKAN KEAMANAN (POLICIES)
-- ==============================================================================

-- A. TABEL USERS (Pengguna hanya bisa melihat & mengubah datanya sendiri)
CREATE POLICY "Users can only access their own profile" 
ON public.users FOR ALL 
USING (auth_id = auth.uid()) 
WITH CHECK (auth_id = auth.uid());

-- B. TABEL TASKS (Tugas dikunci rapat untuk pemiliknya saja)
CREATE POLICY "Tasks strictly isolated to owner" 
ON public.tasks FOR ALL 
USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- C. TABEL KEUANGAN (Saldo & Transaksi privat)
CREATE POLICY "Finance records isolated to owner" 
ON public.finance_transactions FOR ALL 
USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- D. TABEL HABITS (Kebiasaan privat)
CREATE POLICY "Habits isolated to owner" 
ON public.habits FOR ALL 
USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()))
WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));