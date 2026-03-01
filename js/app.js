// js/app.js
import { supabaseClient } from './supabase.js';

// ==========================================
// STATE LOKAL & KONSTANTA
// ==========================================
// Menggunakan window agar bisa diakses oleh file JS lain (Global)
window.dbUser = null;
let myCharts = {}; 
// Cache untuk notifikasi latar belakang (Auto-Check)
let localCache = { tasks: [], financeBalance: 0, _reminded: {}, _warnedBalance: false };

// --- SESSION & NETWORK WATCHDOG -------------------------------------------------
// Supabase can silently convert your session to a "zombie" state if the refresh
// attempt fails (e.g. ERR_INTERNET_DISCONNECTED).  We register a couple of
// global listeners to detect token refresh failures and offline/online changes.
// When a session is no longer valid we force the user back to the login page.

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESH_FAILED' || event === 'SIGNED_OUT') {
        console.warn('Auth state change:', event);
        window.showToast('Sesi habis, silakan login ulang.', 'error');
        supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    }
});

window.addEventListener('offline', () => {
    window.showToast('Koneksi internet terputus! Fitur offline mungkin tidak tersedia.', 'error');
});

window.addEventListener('online', async () => {
    // setelah koneksi kembali, pastikan sesi masih hidup
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session) {
            window.showToast('Sesi tidak valid, akan kembali ke login.', 'error');
            supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        } else {
            window.showToast('Koneksi kembali. Sesi telah disinkronkan.', 'success');
        }
    } catch {
        // ignore
    }
});

// helper untuk menangani error Supabase umum
function handleSupabaseError(err) {
    if (!err) return;
    if (err.status === 401 || (err.message && /session|token/i.test(err.message))) {
        console.warn('Supabase unauthorized, logging out');
        supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    }
}


// ==========================================
// FUNGSI UI GLOBAL
// ==========================================
window.openModal = function(id) {
  const el = document.getElementById(id);
  if (el) {
      el.classList.remove('hidden');
      el.classList.add('flex');
  }
  // Jika modal IP tracker dibuka, bersihkan form dan aspek agar tidak ada bentrok
  if (id === 'modal-iptracker') {
      const f = document.getElementById('form-iptracker');
      if (f) f.reset();
      const box = document.getElementById('wadah-aspek-ipk');
      if (box) box.innerHTML = '';
      const label = document.getElementById('label-total-bobot');
      if (label) label.textContent = 'Total Bobot: 0%';
  }
}

window.closeModal = function(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById(id).classList.remove('flex');
}

window.showToast = function(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toast-icon');
  const messageEl = document.getElementById('toast-message');
  
  if(type === 'success') {
    icon.className = 'size-8 rounded-lg flex items-center justify-center bg-success-light text-success-dark shrink-0';
    icon.innerHTML = `<i data-lucide="check-circle" class="size-4"></i>`;
  } else {
    icon.className = 'size-8 rounded-lg flex items-center justify-center bg-error-light text-error-dark shrink-0';
    icon.innerHTML = `<i data-lucide="x-circle" class="size-4"></i>`;
  }
  
  messageEl.textContent = message;
  toast.classList.remove('translate-x-full');
  lucide.createIcons();
  setTimeout(() => toast.classList.add('translate-x-full'), 4000);
}

// Fitur Buka-Tutup Sidebar (Khusus Layar Mobile)
window.toggleSidebar = function() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('-translate-x-full');
  overlay.classList.toggle('hidden');
}

// Fitur Notifikasi Pop-Up Asli Browser/HP
function notify(title, body) {
  window.showToast(title + ": " + body, 'success');
  try {
      if ("Notification" in window && Notification.permission === 'granted') {
          new Notification(title, { body });
      }
  } catch (e) {}
}

/* =======================================
   FUNGSI KHUSUS: SINKRONISASI IPK (MODE X-RAY)
======================================= */
window.syncGlobalIPK = async function() {
    const box = document.getElementById('stat-ipk');
    if (!box) return;

    try {
        box.textContent = "Cek User...";
        if (!dbUser || !dbUser.id) { box.textContent = "No User"; return; }

        box.textContent = "Tarik Matkul...";
        const { data: courses, error: errC } = await supabaseClient.from('ip_courses').select('*').eq('user_id', dbUser.id);
        
        if (errC) { box.textContent = "Err DB 1"; return; }
        if (!courses || courses.length === 0) { box.textContent = "MK Kosong"; return; }

        box.textContent = `Ada ${courses.length} MK...`;
        
        const courseIds = courses.map(c => c.id);
        const { data: assessments, error: errA } = await supabaseClient.from('ip_assessments').select('*').in('course_id', courseIds);

        if (errA) { box.textContent = "Err DB 2"; return; }

        box.textContent = "Menghitung...";
        let totalSKS = 0;
        let totalMutu = 0;

        courses.forEach(c => {
            let fScore = 0;
            let cAsm = (assessments || []).filter(a => a.course_id === c.id);
            cAsm.forEach(a => { fScore += (Number(a.score) * (Number(a.weight) / 100)); });

            let ip = 0.00;
            if (fScore >= 86) ip = 4.00;
            else if (fScore >= 81) ip = 3.50;
            else if (fScore >= 71) ip = 3.00;
            else if (fScore >= 66) ip = 2.50;
            else if (fScore >= 61) ip = 2.00;
            else if (fScore >= 56) ip = 1.50;
            else if (fScore >= 51) ip = 1.00;

            totalSKS += Number(c.sks);
            totalMutu += (Number(c.sks) * ip);
        });

        const finalIpk = totalSKS > 0 ? (totalMutu / totalSKS).toFixed(2) : '0.00';
        
        // Tampilkan hasil akhirnya!
        box.textContent = finalIpk;
        
    } catch (err) {
        box.textContent = "CRASH!";
    }
};

/* =======================================
   FUNGSI GLOBAL: RINGKASAN ANALITIK (DASHBOARD)
======================================= */
window.loadDashboardStats = async function() {
    // 🔥 Pengecekan Angka 1 DIHAPUS. Hanya cek jika belum login.
    if (!dbUser || !dbUser.id) return;
    
    try {
        const myId = dbUser.id;

        const points = dbUser.points || 0;
        const level = Math.floor(points / 50) + 1;
        if (document.getElementById('stat-points')) document.getElementById('stat-points').textContent = points.toLocaleString('id-ID');
        if (document.getElementById('stat-level')) document.getElementById('stat-level').textContent = `Level ${level}`;
        if (document.getElementById('stat-pomodoro')) document.getElementById('stat-pomodoro').textContent = dbUser.pomodoro_done || 0;
        if (document.getElementById('profile-uid')) document.getElementById('profile-uid').textContent = String(myId);

        try {
            const { data: rankData } = await supabaseClient.from('users').select('id').order('points', { ascending: false });
            if (rankData) {
                const myRankIndex = rankData.findIndex(u => String(u.id) === String(myId));
                if (document.getElementById('stat-rank')) document.getElementById('stat-rank').textContent = myRankIndex !== -1 ? `#${myRankIndex + 1}` : '#--';
            }
        } catch(e) {}

        const getCount = async (table) => {
            try {
                const { count } = await supabaseClient.from(table).select('*', { count: 'exact', head: true }).eq('user_id', myId);
                return count || 0;
            } catch(e) { return 0; }
        };

        if(document.getElementById('stat-predictions')) document.getElementById('stat-predictions').textContent = await getCount('prediction_collections');
        if(document.getElementById('stat-thesis')) document.getElementById('stat-thesis').textContent = await getCount('thesis_projects');
        if(document.getElementById('stat-drive')) document.getElementById('stat-drive').textContent = await getCount('drive_items');
        if(document.getElementById('stat-workspace')) document.getElementById('stat-workspace').textContent = await getCount('workspace_pages');
        if(document.getElementById('stat-calendar')) document.getElementById('stat-calendar').textContent = await getCount('calendar_events');
        
        try {
            const { count: cDone } = await supabaseClient.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', myId).eq('status', 'completed');
            const { count: cPend } = await supabaseClient.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', myId).neq('status', 'completed');
            if(document.getElementById('stat-tasks-done')) document.getElementById('stat-tasks-done').textContent = cDone || 0;
            if(document.getElementById('stat-tasks-pending')) document.getElementById('stat-tasks-pending').textContent = cPend || 0;
        } catch(e) {}

        // 🔥 PANGGIL MESIN IPK DI LATAR BELAKANG!
        // 🔥 PANGGIL MESIN DI LATAR BELAKANG SECARA GLOBAL!
        if (typeof window.loadIpTracker === 'function') window.loadIpTracker();
        if (typeof window.loadFinance === 'function') window.loadFinance();
        
        // Panggil pengecekan onboarding setelah user berhasil divalidasi
        if (typeof window.checkOnboardingStatus === 'function') window.checkOnboardingStatus();
        if (typeof loadTasks === 'function') loadTasks();
        
        setTimeout(() => {
            const balanceEl = document.getElementById('fin-balance');
            if (balanceEl && document.getElementById('stat-balance')) {
                document.getElementById('stat-balance').textContent = balanceEl.textContent;
            }
        }, 800);

        // 🔥 PANGGIL FUNGSI PROFIL & HEATMAP
        if (typeof loadProfileData === 'function') loadProfileData();
        if (typeof renderProfileHeatmap === 'function') renderProfileHeatmap();
        
        if (typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.error("Dashboard error:", err);
    }
}; // <--- FUNGSI DASHBOARD DITUTUP DENGAN BENAR DI SINI


/* =======================================
   FUNGSI KHUSUS: HEATMAP PRODUKTIVITAS
======================================= */
window.renderProfileHeatmap = async function() {
    const heatmapContainer = document.getElementById('profile-heatmap');
    
    // 🔥 Pengecekan Angka 1 DIHAPUS. Hanya cek jika belum login.
    if (!heatmapContainer || !dbUser || !dbUser.id) return;
    
    try {
        // 1. Tarik riwayat penyelesaian Habit (Kebiasaan Harian) dari Supabase
        const { data: logs, error } = await supabaseClient
            .from('habit_logs')
            .select('log_date')
            .eq('user_id', dbUser.id);
            
        if (error) throw error;
            
        // 2. Hitung frekuensi aktivitas per tanggal
        const activityMap = {};
        if (logs) {
            logs.forEach(log => {
                const dateKey = log.log_date; // Format YYYY-MM-DD
                activityMap[dateKey] = (activityMap[dateKey] || 0) + 1;
            });
        }
        
        // 3. Mesin Waktu: Mundur 84 Hari (12 Minggu / ~3 Bulan)
        const today = new Date();
        const daysArray = [];
        
        for (let i = 83; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0]; // Format standard database
            
            daysArray.push({
                dateObj: d,
                dateString: dateStr,
                count: activityMap[dateStr] || 0
            });
        }
        
        // 4. Rakit Grid HTML (7 baris ke bawah berkat grid-rows-7)
        let html = `<div class="grid grid-rows-7 grid-flow-col gap-1.5">`;
        
        daysArray.forEach(day => {
            // Tentukan kepekatan warna hijau
            let colorClass = 'bg-gray-100 hover:bg-gray-200'; // Kosong (Abu-abu)
            if (day.count === 1) colorClass = 'bg-emerald-200 hover:bg-emerald-300';
            else if (day.count === 2) colorClass = 'bg-emerald-400 hover:bg-emerald-500';
            else if (day.count === 3) colorClass = 'bg-emerald-600 hover:bg-emerald-700';
            else if (day.count >= 4) colorClass = 'bg-emerald-800 hover:bg-emerald-900';
            
            // Format Tanggal untuk Tooltip (Saat di-hover)
            const displayDate = day.dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
            const tooltipTxt = day.count === 0 ? `Belum ada aktivitas pada ${displayDate}` : `${day.count} Target selesai pada ${displayDate}`;
            
            html += `<div class="size-3.5 sm:size-4 rounded-[3px] ${colorClass} cursor-pointer transition-colors tooltip" title="${tooltipTxt}"></div>`;
        });
        
        html += `</div>`;
        
        // Render ke layar!
        heatmapContainer.innerHTML = html;
        if(typeof lucide !== 'undefined') lucide.createIcons();
        
    } catch (err) {
        console.error("Gagal merender Heatmap:", err);
        heatmapContainer.innerHTML = '<p class="text-xs text-red-500 p-4 bg-red-50 rounded-lg text-center font-bold">Gagal memuat jejak aktivitas.</p>';
    }
};
/* =======================================
   FUNGSI GLOBAL: MUAT DATA PROFIL LENGKAP
======================================= */
window.loadProfileData = async function() {
    if (!dbUser || !dbUser.id) return;
    
    try {
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('id', dbUser.id)
            .single();

        // 🔥 KUNCI PERBAIKAN: Jika Supabase telat/gagal, pakai data 'dbUser' sebagai cadangan!
        const finalData = (!error && userData) ? userData : dbUser;

        // Tembak ke Identitas Header (Gunakan fallback agar tak nyangkut "Memuat...")
        const fullName = finalData.full_name || finalData.username || 'Mahasiswa'; 
        if(document.getElementById('profile-name')) document.getElementById('profile-name').textContent = fullName;
        if(document.getElementById('profile-username')) document.getElementById('profile-username').textContent = finalData.username || 'user';
        if(document.getElementById('profile-role')) document.getElementById('profile-role').textContent = finalData.role_title || 'Learner';
        if(document.getElementById('profile-location')) document.getElementById('profile-location').textContent = finalData.location || 'Indonesia';
        
        // Update Avatar
        if(document.getElementById('profile-avatar')) {
            document.getElementById('profile-avatar').src = finalData.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=0D8ABC&color=fff&size=128`;
        }

        // Tembak Tautan
        if(document.getElementById('profile-github') && finalData.github_url) document.getElementById('profile-github').href = finalData.github_url;
        if(document.getElementById('profile-portfolio') && finalData.portfolio_url) document.getElementById('profile-portfolio').href = finalData.portfolio_url;

        // Tembak Etalase Akademik
        if(document.getElementById('profile-university')) document.getElementById('profile-university').textContent = finalData.university || 'Universitas';
        if(document.getElementById('profile-major')) document.getElementById('profile-major').textContent = finalData.major || 'Program Studi';
        
        // Render Tags Organisasi
        if(document.getElementById('profile-org-tags') && finalData.organization_tags) {
            const tags = finalData.organization_tags.split(',').map(t => t.trim()).filter(t => t);
            if (tags.length > 0) {
                let tagsHtml = '';
                const colors = ['blue', 'orange', 'emerald', 'purple'];
                tags.forEach((tag, idx) => {
                    const col = colors[idx % colors.length];
                    tagsHtml += `<span class="px-3 py-1 bg-${col}-50 text-${col}-600 text-[10px] font-bold uppercase tracking-wide rounded-md border border-${col}-100">${tag}</span>`;
                });
                document.getElementById('profile-org-tags').innerHTML = tagsHtml;
            }
        }

        // Tembak Papan Visi
        const targetIpk = finalData.target_ipk || 4.00;
        if(document.getElementById('profile-target-ipk')) document.getElementById('profile-target-ipk').textContent = Number(targetIpk).toFixed(2);
        if(document.getElementById('profile-target-grad')) document.getElementById('profile-target-grad').textContent = finalData.target_graduation || '-';
        if(document.getElementById('profile-target-study')) document.getElementById('profile-target-study').textContent = finalData.weekly_study_target || 0;

        // Sinkronisasi IPK dari Dasbor ke Progress Bar Profil
        setTimeout(() => {
            const ipkDashboardBox = document.getElementById('stat-ipk');
            const ipkProfilCurrent = document.getElementById('profile-ipk-current');
            const ipkBar = document.getElementById('profile-ipk-bar');
            
            if (ipkDashboardBox && ipkProfilCurrent && ipkBar) {
                const currentIpkValue = Number(ipkDashboardBox.textContent) || 0;
                ipkProfilCurrent.textContent = currentIpkValue.toFixed(2);
                let percentage = (currentIpkValue / targetIpk) * 100;
                if (percentage > 100) percentage = 100;
                ipkBar.style.width = `${percentage}%`;
            }
        }, 1000); 

        if(typeof lucide !== 'undefined') lucide.createIcons();

    } catch (err) {
        console.error("Gagal muat profil:", err);
    }
};

// ==========================================
// FUNGSI MANAJEMEN NOTIFIKASI LONCENG
// ==========================================
function checkNotifications(tasksData, balanceAmt) {
  let notifs = [];
  const now = new Date();
  const threeDays = new Date(); threeDays.setDate(now.getDate() + 3);

  if(tasksData) {
    tasksData.forEach(t => {
      if(t.status !== 'completed' && t.due_date) {
        const due = new Date(t.due_date);
        if(due < now) notifs.push({ icon: 'alert-circle', color: 'text-error', text: `Tugas "${t.title}" telah lewat tenggat!` });
        else if(due <= threeDays) notifs.push({ icon: 'clock', color: 'text-warning-dark', text: `Tugas "${t.title}" mendekati deadline.` });
      }
    });
  }

  if(balanceAmt < 50000 && balanceAmt > 0) {
    notifs.push({ icon: 'wallet', color: 'text-error', text: `Saldo keuangan menipis (Sisa Rp ${balanceAmt.toLocaleString('id-ID')}).` });
  }

  if(dbUser && dbUser.points > 0) {
    const level = Math.floor((dbUser.points || 0) / 50) + 1;
    notifs.push({ icon: 'award', color: 'text-primary', text: `Anda di Level ${level} dengan ${dbUser.points} Poin. Pertahankan produktivitasmu!` });
  }

  const badge = document.getElementById('notif-badge');
  const list = document.getElementById('notif-list');
  if(!badge || !list) return;

  if(notifs.length > 0) {
    badge.classList.remove('hidden');
    list.innerHTML = '';
    notifs.forEach(n => {
      list.innerHTML += `<div class="flex items-start gap-3 p-3 hover:bg-gray-50 border-b border-border last:border-0"><i data-lucide="${n.icon}" class="size-4 ${n.color} mt-0.5 shrink-0"></i><p class="text-xs text-foreground leading-relaxed">${n.text}</p></div>`;
    });
    lucide.createIcons();
  } else {
    badge.classList.add('hidden');
    list.innerHTML = `<p class="text-xs text-secondary p-4 text-center">Belum ada notifikasi baru.</p>`;
  }
}

// ==========================================
// FUNGSI RENDER INFO PROFIL KE UI
// ==========================================
function applyUserInfoToUI() {
  if (!dbUser) return;
  const avatarUrl = dbUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(dbUser.username)}&background=165DFF&color=fff`;

  if(document.getElementById('user-email-display')) document.getElementById('user-email-display').textContent = dbUser.email;
  if(document.getElementById('sidebar-name')) document.getElementById('sidebar-name').textContent = dbUser.username;
  if(document.getElementById('sidebar-avatar')) document.getElementById('sidebar-avatar').src = avatarUrl;
  
  if(document.getElementById('topbar-name')) document.getElementById('topbar-name').textContent = dbUser.username;
  if(document.getElementById('topbar-avatar')) document.getElementById('topbar-avatar').src = avatarUrl;
  if(document.getElementById('welcome-text')) document.getElementById('welcome-text').textContent = `Halo ${dbUser.username}, pantau terus perkembangan belajarmu hari ini.`;

  if(document.getElementById('profile-name')) document.getElementById('profile-name').textContent = dbUser.username;
  if(document.getElementById('profile-email')) document.getElementById('profile-email').textContent = dbUser.email;
  if(document.getElementById('profile-avatar-large')) document.getElementById('profile-avatar-large').src = avatarUrl;
  
  if(document.getElementById('profile-bio')) document.getElementById('profile-bio').textContent = dbUser.bio ? `"${dbUser.bio}"` : '-';
  if(document.getElementById('profile-school')) document.getElementById('profile-school').textContent = dbUser.school || '-';
  if(document.getElementById('profile-major')) document.getElementById('profile-major').textContent = dbUser.major || '-';
  if(document.getElementById('profile-semester')) document.getElementById('profile-semester').textContent = dbUser.semester ? `Semester ${dbUser.semester}` : '-';
  if(document.getElementById('profile-learning-style')) document.getElementById('profile-learning-style').textContent = dbUser.learning_style || 'Visual';
}


document.addEventListener('DOMContentLoaded', async () => {

  // Request Permission untuk Notifikasi Pop-up HP/PC
  if ("Notification" in window && Notification.permission !== 'granted') {
    Notification.requestPermission().catch(() => {});
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Auto-close sidebar jika layar mobile (di bawah 1024px)
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebar-overlay').classList.add('hidden');

      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      if(btn.id !== 'topbar-avatar') btn.classList.add('active');
      
      const target = btn.getAttribute('data-target');
      if(target === 'profile') document.getElementById('page-title').textContent = 'Profil & Analitik';
      else if(target === 'apps') document.getElementById('page-title').textContent = 'Semua Aplikasi';
      else if(btn.querySelector('span') || btn.querySelector('h4')) {
        const titleEl = btn.querySelector('h4') || btn.querySelector('span');
        document.getElementById('page-title').textContent = titleEl.textContent;
      }
      
      document.querySelectorAll('.content-section').forEach(sec => sec.classList.add('hidden'));
      const targetSection = document.getElementById(`section-${target}`);
      if(targetSection) targetSection.classList.remove('hidden');

      if(dbUser) {
        if (target === 'dashboard' || target === 'profile' || target === 'apps') loadDashboardStats();
        if (target === 'todo' || target === 'tasks') loadTasks();
        if (target === 'finance') loadFinance();
        if (target === 'roadmap') loadRoadmap();
        if (target === 'iptracker') loadIpTracker();
        if (target === 'habits') loadHabitsPage();
        if (target === 'leaderboard') renderLeaderboard();
        
        // --- TRIGGER LOAD DATA DARI SUPABASE SAAT MENU DIKLIK ---
        if (target === 'workspace' && typeof loadWorkspaceData === 'function') loadWorkspaceData();
        if (target === 'drive' && typeof loadDriveData === 'function') loadDriveData();
        if (target === 'calendar' && typeof loadCalendarData === 'function') loadCalendarData();
        if (target === 'thesis' && typeof loadThesisData === 'function') loadThesisData();
        if (target === 'prediction' && typeof loadPredictionData === 'function') loadPredictionData();
        
        // --- TAMBAHAN UNTUK MEMICU DATA STUDY ROOM ---
        if (target === 'studyroom' && typeof switchStudyTab === 'function') {
            switchStudyTab('friends'); // Langsung pancing tab teman agar data langsung ditarik!
        }
      }
    });
  });

  const doLogout = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
  };
  document.getElementById('btn-logout')?.addEventListener('click', doLogout);
  document.getElementById('btn-logout-profile')?.addEventListener('click', doLogout);

  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session) {
      window.location.href = 'login.html';
      return;
    }
    
    // 🔥 BARIS INI SANGAT PENTING DAN TIDAK BOLEH HILANG
    const { data: userData, error: userError } = await supabaseClient.from('users').select('*').eq('email', session.user.email).single();
    
    // ERROR HANDLING YANG BARU DAN ELEGAN
    if (userError || !userData) { 
        if (typeof window.showToast === 'function') {
            window.showToast("Koneksi terputus atau profil tidak ditemukan. Cek internet Anda.", "error");
        } else {
            console.warn("Profil tidak ditemukan karena offline.");
        }
        return; 
    }
    
    dbUser = userData; 

    if (dbUser.is_onboarded === false || dbUser.is_onboarded === null) {
        if(document.getElementById('ob-username')) document.getElementById('ob-username').value = dbUser.username || '';
        window.openModal('modal-onboarding');
    } else {
        applyUserInfoToUI();
        loadDashboardStats();
    }
  } catch (err) { 
      console.error("Gagal inisialisasi sesi:", err); 
  }

  /* =======================================
     AUTO CHECK NOTIFICATION (LATAR BELAKANG)
  ======================================= */
  setInterval(() => {
    if (!dbUser) return;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    
    // Cek Tugas
    localCache.tasks.forEach(t => {
      if (t.status === 'completed' || !t.due_date) return;
      const taskTime = new Date(t.due_date);
      const diff = taskTime - now;
      if (diff > 0 && diff <= dayMs) {
        if (!localCache._reminded[t.id]) {
          notify('Pengingat Tugas', `"${t.title}" akan jatuh tempo dalam 24 Jam.`);
          localCache._reminded[t.id] = true;
        }
      }
    });

    // Cek Saldo
    if (localCache.financeBalance <= 20000 && localCache.financeBalance > 0) {
      if (!localCache._warnedBalance) {
        notify('Perhatian Saldo', `Saldo tersisa Rp ${localCache.financeBalance.toLocaleString('id-ID')}`);
        localCache._warnedBalance = true;
      }
    } else {
      localCache._warnedBalance = false;
    }
  }, 30000); // Mengecek setiap 30 detik

  /* =======================================
     ONBOARDING (FORM USER BARU)
  ======================================= */
  document.getElementById('form-onboarding')?.addEventListener('submit', async(e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = "Menyiapkan Dashboard...";

    const obUser = document.getElementById('ob-username')?.value.trim();
    const obSchool = document.getElementById('ob-school')?.value.trim();
    const obMajor = document.getElementById('ob-major')?.value.trim();
    const obSem = parseInt(document.getElementById('ob-semester')?.value) || 1;

    const { error } = await supabaseClient.from('users').update({
        username: obUser, school: obSchool, major: obMajor, semester: obSem, is_onboarded: true
    }).eq('id', dbUser.id);

    if(!error) {
        dbUser.username = obUser;
        dbUser.school = obSchool;
        dbUser.major = obMajor;
        dbUser.semester = obSem;
        dbUser.is_onboarded = true;

        window.closeModal('modal-onboarding');
        window.showToast("Selamat datang di Dashboard!", "success");
        
        applyUserInfoToUI();
        loadDashboardStats();
    } else {
        window.showToast("Gagal Setup Profil: " + error.message, "error");
        btn.disabled = false; btn.textContent = "Mulai Gunakan Aplikasi";
    }
  });

  /* =======================================
     LEADERBOARD (LIGHT THEME - ME+ STYLE)
  ======================================= */
  let leaderboardSortMode = 'points'; 

  window.toggleLeaderboardSort = function(mode) {
      leaderboardSortMode = mode;
      const btnPoints = document.getElementById('btn-sort-points');
      const btnStreak = document.getElementById('btn-sort-streak');
      
      const activeClass = 'px-5 py-2 rounded-lg bg-white text-orange-600 shadow-sm font-bold text-sm flex items-center gap-2 transition cursor-pointer';
      const inactiveClass = 'px-5 py-2 rounded-lg text-secondary hover:bg-gray-200 hover:text-foreground font-bold text-sm flex items-center gap-2 transition cursor-pointer';

      if(mode === 'points') {
          btnPoints.className = activeClass;
          btnStreak.className = inactiveClass;
      } else {
          btnStreak.className = activeClass;
          btnPoints.className = inactiveClass;
      }
      renderLeaderboard();
  }

  async function renderLeaderboard() {
      const grid = document.getElementById('leaderboard-grid');
      if (!grid) return;
      grid.innerHTML = `<p class="text-secondary col-span-full text-center py-10">Memuat data Leaderboard...</p>`;

      const orderBy = leaderboardSortMode === 'points' ? 'points' : 'pomodoro_done'; 

      const { data, error } = await supabaseClient.from('users')
        .select('username, points, pomodoro_done, avatar_url')
        .order(orderBy, { ascending: false })
        .limit(50);

      if (error) { grid.innerHTML = `<p class="text-red-500 col-span-full text-center py-10">❌ Gagal memuat data.</p>`; return; }

      grid.innerHTML = '';
      if (data.length === 0) { grid.innerHTML = `<p class="text-secondary col-span-full text-center py-10">Belum ada data.</p>`; return; }

      data.forEach((r, i) => {
        const rank = i + 1;
        const level = Math.floor((r.points || 0) / 50) + 1;
        
        // Avatar default menyesuaikan tema terang
        const avatarUrl = r.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(r.username)}&background=F4F6F8&color=165DFF`;
        const score = leaderboardSortMode === 'points' ? (r.points || 0).toLocaleString('id-ID') : (r.pomodoro_done || 0); 
        const scoreIcon = leaderboardSortMode === 'points' ? 'zap' : 'flame';

        let rankBadge = `<span class="font-bold text-secondary text-lg w-8 text-center">${rank}</span>`;
        let cardStyle = "bg-gray-50 border border-border";
        
        // Pewarnaan Card Juara 1, 2, 3 Light Theme
        if(rank === 1) {
            rankBadge = `<div class="size-8 flex items-center justify-center bg-yellow-100 rounded-full"><i data-lucide="crown" class="size-5 text-yellow-600"></i></div>`;
            cardStyle = "bg-yellow-50/50 border border-yellow-200 shadow-sm";
        } else if(rank === 2) {
            rankBadge = `<div class="size-8 flex items-center justify-center bg-gray-200 rounded-full"><i data-lucide="medal" class="size-5 text-gray-500"></i></div>`;
            cardStyle = "bg-gray-50 border border-gray-300 shadow-sm";
        } else if(rank === 3) {
            rankBadge = `<div class="size-8 flex items-center justify-center bg-orange-100 rounded-full"><i data-lucide="medal" class="size-5 text-orange-500"></i></div>`;
            cardStyle = "bg-orange-50/50 border border-orange-200 shadow-sm";
        }

        grid.innerHTML += `
          <div class="${cardStyle} rounded-2xl p-4 flex items-center justify-between transition hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
              <div class="flex items-center gap-3 md:gap-4">
                  ${rankBadge}
                  <img src="${avatarUrl}" class="size-10 md:size-12 rounded-full object-cover ring-2 ring-white shadow-sm">
                  <div>
                      <h4 class="font-bold text-foreground text-sm md:text-base">${r.username}</h4>
                      <p class="text-xs text-secondary mt-0.5">Level ${level}</p>
                  </div>
              </div>
              <div class="flex items-center gap-2 text-orange-600 font-bold bg-orange-100 px-3 py-1.5 rounded-lg border border-orange-200">
                  <i data-lucide="${scoreIcon}" class="size-4 md:size-5 fill-current"></i>
                  <span class="text-sm md:text-base">${score}</span>
              </div>
          </div>
        `;
      });
      if(typeof lucide !== 'undefined') lucide.createIcons();
  }

  /* =======================================
     RENDER CHARTS (CHART.JS)
  ======================================= */
  function renderAnalyticsCharts(taskStats, ipkData, habitStats) {
    const ctxTask = document.getElementById('taskChart');
    if(ctxTask) {
      if(myCharts.task) myCharts.task.destroy();
      myCharts.task = new Chart(ctxTask, {
        type: 'doughnut',
        data: {
          labels: ['Selesai', 'Pending', 'Lewat Tenggat'],
          datasets: [{ data: [taskStats.done, taskStats.pending, taskStats.urgent], backgroundColor: ['#30B22D', '#165DFF', '#ED6B60'], borderWidth: 0, hoverOffset: 4 }]
        },
        options: { cutout: '75%', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: {family: "'Lexend Deca', sans-serif"} } } } }
      });
    }

    const ctxIpk = document.getElementById('ipkChart');
    if(ctxIpk) {
      if(myCharts.ipk) myCharts.ipk.destroy();
      const labels = ipkData.map(d => `Sem ${d.semester}`);
      const dataPoints = ipkData.map(d => d.ips);
      myCharts.ipk = new Chart(ctxIpk, {
        type: 'line',
        data: {
          labels: labels.length ? labels : ['Sem 1'],
          datasets: [{ label: 'IPS', data: dataPoints.length ? dataPoints : [0], borderColor: '#30B22D', backgroundColor: '#30B22D20', borderWidth: 2, tension: 0.4, fill: true, pointBackgroundColor: '#30B22D' }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { min: 0, max: 4, ticks: { stepSize: 1, font: {family: "'Lexend Deca', sans-serif"} } }, x: { ticks: { font: {family: "'Lexend Deca', sans-serif"} } } }, plugins: { legend: { display: false } } }
      });
    }

    const ctxPom = document.getElementById('pomodoroChart');
    if(ctxPom) {
      if(myCharts.pom) myCharts.pom.destroy();
      myCharts.pom = new Chart(ctxPom, {
        type: 'bar',
        data: {
          labels: ['Pagi', 'Siang/Sore', 'Malam'],
          datasets: [{ label: 'Target Habit', data: [habitStats.morning, habitStats.afternoon, habitStats.evening], backgroundColor: '#165DFF', borderRadius: 4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
      });
    }
  }

  /* =======================================
   SISTEM EDIT PROFIL (DENGAN UPLOAD FOTO)
======================================= */

// 1. Fungsi Preview Foto saat file dipilih dari Laptop/HP
window.previewEditAvatar = function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('edit-avatar-preview').src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

// 2. Fungsi Membuka Modal & Menarik Data Saat Ini
document.getElementById('btn-edit-profile')?.addEventListener('click', async () => {
    if (!dbUser || !dbUser.id) return;
    
    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.remove('hidden');

    const { data: userData } = await supabaseClient.from('users').select('*').eq('id', dbUser.id).single();
    if (!userData) return;

    // Reset input file agar siap menerima file baru
    const avatarInput = document.getElementById('edit-avatar');
    if (avatarInput) avatarInput.value = '';

    // Set preview foto saat ini
    const currentName = userData.full_name || userData.username || 'User';
    document.getElementById('edit-avatar-preview').src = userData.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentName)}&background=0D8ABC&color=fff&size=128`;

    document.getElementById('edit-full-name').value = userData.full_name || '';
    document.getElementById('edit-username').value = userData.username || '';
    document.getElementById('edit-role').value = userData.role_title || '';
    document.getElementById('edit-location').value = userData.location || '';
    document.getElementById('edit-university').value = userData.university || '';
    document.getElementById('edit-major').value = userData.major || '';
    document.getElementById('edit-orgs').value = userData.organization_tags || '';
    document.getElementById('edit-target-ipk').value = userData.target_ipk || 4.00;
    document.getElementById('edit-target-grad').value = userData.target_graduation || '';
    document.getElementById('edit-target-study').value = userData.weekly_study_target || 20;
    document.getElementById('edit-github').value = userData.github_url || '';
    document.getElementById('edit-portfolio').value = userData.portfolio_url || '';
});

// 3. Fungsi Menutup Modal
window.closeEditProfileModal = function() {
    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.add('hidden');
}

// 4. Fungsi Menyimpan Data ke Database (Teks & Gambar)
const formEditProfile = document.getElementById('form-edit-profile');
formEditProfile?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dbUser || !dbUser.id) return;

    // Ubah tombol jadi "Menyimpan..."
    const btnSubmit = formEditProfile.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = 'Menyimpan... <i data-lucide="loader" class="size-4 animate-spin"></i>';
    btnSubmit.disabled = true;

    try {
        let newAvatarUrl = null;
        const avatarInput = document.getElementById('edit-avatar');

        // 🔥 PROSES UPLOAD FOTO KE SUPABASE (Jika user memilih file foto baru)
        if (avatarInput && avatarInput.files.length > 0) {
            const file = avatarInput.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar_${dbUser.id}_${Date.now()}.${fileExt}`; // Nama file unik

            // Upload ke Bucket 'avatars'
            const { error: uploadError } = await supabaseClient.storage
                .from('avatars')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw new Error("Gagal mengunggah foto. Pastikan Bucket 'avatars' sudah public: " + uploadError.message);

            // Ambil URL Publik permanen dari foto yang baru diunggah
            const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
            newAvatarUrl = publicUrlData.publicUrl;
        }

        // Kumpulkan data teks yang baru diketik
        const updatedData = {
            full_name: document.getElementById('edit-full-name').value,
            username: document.getElementById('edit-username').value.trim(),
            role_title: document.getElementById('edit-role').value,
            location: document.getElementById('edit-location').value,
            university: document.getElementById('edit-university').value,
            major: document.getElementById('edit-major').value,
            organization_tags: document.getElementById('edit-orgs').value,
            target_ipk: parseFloat(document.getElementById('edit-target-ipk').value) || 4.00,
            target_graduation: document.getElementById('edit-target-grad').value,
            weekly_study_target: parseInt(document.getElementById('edit-target-study').value) || 20,
            github_url: document.getElementById('edit-github').value,
            portfolio_url: document.getElementById('edit-portfolio').value
        };

        // Jika ada foto baru yang sukses diunggah, tambahkan URL-nya ke database tabel `users`
        if (newAvatarUrl) {
            updatedData.avatar_url = newAvatarUrl;
            dbUser.avatar_url = newAvatarUrl; // Update cache lokal
        }

        // Simpan semua ke tabel users di Supabase
        const { error } = await supabaseClient.from('users').update(updatedData).eq('id', dbUser.id);
        if (error) throw error;

        window.showToast('Profil berhasil diperbarui!', 'success');
        closeEditProfileModal();
        
        // Refresh tampilan profil secara otomatis
        if (typeof loadProfileData === 'function') loadProfileData();
        
        // Refresh avatar bulat kecil di sidebar/topbar (jika fungsinya tersedia)
        if (typeof applyUserInfoToUI === 'function') applyUserInfoToUI();
        
    } catch (err) {
        console.error('Gagal update profil:', err);
        window.showToast(err.message || 'Gagal menyimpan profil!', 'error');
    } finally {
        // Kembalikan kondisi tombol seperti semula
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
});


  /* =======================================
     FITUR 2: MANAJEMEN TUGAS
  ======================================= */
  const formTask = document.getElementById('form-task');
  formTask?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const title = document.getElementById('task-title').value;
      const deadlineVal = document.getElementById('task-deadline').value;
      const { error } = await supabaseClient.from('tasks').insert([{ user_id: dbUser.id, title: title, due_date: deadlineVal ? new Date(deadlineVal).toISOString() : null, status: 'pending' }]);
      if (error) throw error;
      window.closeModal('modal-task'); formTask.reset(); window.showToast('Tugas ditambahkan!'); loadTasks(); loadDashboardStats();
    } catch (err) { window.showToast(err.message, "error"); }
  });

  async function loadTasks() {
    const { data: tasks } = await supabaseClient.from('tasks').select('*').eq('user_id', dbUser.id).order('due_date', { ascending: true });
    const tbody = document.getElementById('tasks-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    if (tasks && tasks.length > 0) {
      tasks.forEach(t => {
        const isDone = t.status === 'completed';
        const dateStr = t.due_date ? new Date(t.due_date).toLocaleDateString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '-';
        tbody.innerHTML += `<tr class="hover:bg-muted/50"><td class="px-4 py-3"><input type="checkbox" class="size-4 accent-primary rounded cursor-pointer" ${isDone?'checked':''} onchange="toggleTask(${t.id}, this.checked)"></td><td class="px-4 py-3"><span class="font-medium ${isDone?'line-through text-secondary':''}">${t.title}</span></td><td class="px-4 py-3"><span class="text-xs text-secondary">${dateStr}</span></td><td class="px-4 py-3 text-right"><button onclick="deleteTask(${t.id})" class="p-1.5 text-error hover:bg-error-light rounded-md cursor-pointer"><i data-lucide="trash-2" class="size-4"></i></button></td></tr>`;
      });
      lucide.createIcons();
    } else { tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-secondary text-xs">Belum ada tugas terjadwal.</td></tr>`; }
  }

  window.toggleTask = async (id, isChecked) => {
    try {
      const status = isChecked ? 'completed' : 'pending';
      await supabaseClient.from('tasks').update({ status }).eq('id', id);
      if(isChecked) {
        dbUser.points += 5; dbUser.tasks_completed += 1;
        await supabaseClient.from('users').update({ points: dbUser.points, tasks_completed: dbUser.tasks_completed }).eq('id', dbUser.id);
        window.showToast('+5 Poin! Tugas diselesaikan.', 'success');
      }
      loadTasks(); loadDashboardStats();
    } catch(err) { window.showToast(err.message, "error"); }
  }
  
  window.deleteTask = async (id) => {
    if(!confirm('Hapus tugas?')) return;
    try { await supabaseClient.from('tasks').delete().eq('id', id); window.showToast('Dihapus'); loadTasks(); loadDashboardStats(); } 
    catch (err) { window.showToast(err.message, "error"); }
  }


  /* =======================================
     FITUR 3: KEUANGAN MAHASISWA
  ======================================= */
  const formFinance = document.getElementById('form-finance');
  formFinance?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const type = document.getElementById('finance-type').value;
      const amount = parseFloat(document.getElementById('finance-amount').value) || 0;
      const note = document.getElementById('finance-note').value || '';
      const { error } = await supabaseClient.from('finance_transactions').insert([{ user_id: dbUser.id, type: type, amount: amount, note: note }]);
      if (error) throw error;
      window.closeModal('modal-finance'); formFinance.reset(); window.showToast('Transaksi berhasil dicatat!');
      loadFinance(); loadDashboardStats();
    } catch (err) { window.showToast(err.message, "error"); }
  });

  // 🔥 PERBAIKAN: Jadikan Global (window.) dan Hapus Tombol Bunuh Diri!
window.loadFinance = async function() {
    const { data: txs } = await supabaseClient.from('finance_transactions').select('*').eq('user_id', dbUser.id).order('created_at', { ascending: false });
    let inc = 0, exp = 0;
    
    // 1. Hitung Saldo di Latar Belakang (Tanpa peduli tabelnya dibuka atau tidak)
    if (txs && txs.length > 0) {
      txs.forEach(t => {
        const isInc = t.type === 'income';
        if(isInc) inc += parseFloat(t.amount); else exp += parseFloat(t.amount);
      });
    }
    const finalBalance = inc - exp;

    // 2. Update Angka di Dashboard SECARA LANGSUNG
    if(document.getElementById('stat-balance')) {
        document.getElementById('stat-balance').textContent = `Rp ${finalBalance.toLocaleString('id-ID')}`;
    }

    // 3. Render Tabel (Hanya jika halamannya sedang dibuka)
    const tbody = document.getElementById('finance-table-body');
    if(tbody) {
        tbody.innerHTML = ''; 
        if (txs && txs.length > 0) {
            txs.forEach(t => {
                const isInc = t.type === 'income';
                const dateStr = new Date(t.created_at).toLocaleDateString('id-ID');
                tbody.innerHTML += `<tr class="hover:bg-muted/50"><td class="px-4 py-3 text-xs text-secondary">${dateStr}</td><td class="px-4 py-3 font-medium">${t.note}</td><td class="px-4 py-3 font-semibold ${isInc?'text-success':'text-error'}">${isInc?'+':'-'} Rp ${parseFloat(t.amount).toLocaleString('id-ID')}</td><td class="px-4 py-3 text-right"><button onclick="deleteFin(${t.id})" class="p-1.5 text-error hover:bg-error-light rounded-md cursor-pointer"><i data-lucide="trash-2" class="size-4"></i></button></td></tr>`;
            });
            if(typeof lucide !== 'undefined') lucide.createIcons();
        } else { 
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-secondary text-xs">Belum ada riwayat transaksi.</td></tr>`; 
        }
        
        // Update teks di halaman keuangan
        if(document.getElementById('fin-income')) document.getElementById('fin-income').textContent = `Rp ${inc.toLocaleString('id-ID')}`;
        if(document.getElementById('fin-expense')) document.getElementById('fin-expense').textContent = `Rp ${exp.toLocaleString('id-ID')}`;
        if(document.getElementById('fin-balance')) document.getElementById('fin-balance').textContent = `Rp ${finalBalance.toLocaleString('id-ID')}`;
    }
  }
  window.deleteFin = async (id) => {
    if(confirm('Hapus riwayat?')) { await supabaseClient.from('finance_transactions').delete().eq('id', id); loadFinance(); loadDashboardStats(); }
  }

  /* =======================================
     SUB-FITUR: RAB (Rencana Anggaran Biaya) EXCEL
  ======================================= */
  let currentRabMonth = new Date().toISOString().slice(0, 7); // Format: YYYY-MM
  let rabData = [];

  window.openModalRAB = async function() {
      document.getElementById('rab-month-selector').value = currentRabMonth;
      await window.loadRABData();
      
      // Deteksi fungsi modal (berjaga-jaga jika beda penulisan)
      if (typeof openModal === 'function') openModal('modal-rab');
      else if (typeof window.openModal === 'function') window.openModal('modal-rab');
      else {
          document.getElementById('modal-rab').classList.remove('hidden');
          document.getElementById('modal-rab').classList.add('flex');
      }
  }

  window.changeRabMonth = async function(val) {
      if(!val) return;
      currentRabMonth = val;
      await window.loadRABData();
  }

  window.loadRABData = async function() {
      if(!dbUser) return;
      const tbody = document.getElementById('rab-table-body');
      tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-secondary"><i class="animate-spin inline-block" data-lucide="loader-2"></i> Memuat data RAB...</td></tr>';
      if(typeof lucide !== 'undefined') lucide.createIcons();

      // Menarik data berdasarkan bulan yang dipilih
      const { data, error } = await supabaseClient
          .from('finance_rab')
          .select('*')
          .eq('user_id', String(dbUser.id))
          .eq('month_year', currentRabMonth)
          .order('created_at', { ascending: true });
      
      if(error) {
          window.showToast("Gagal memuat RAB", "error");
          rabData = [];
      } else {
          rabData = data || [];
          // Jika kosong, berikan 1 baris default
          if(rabData.length === 0) {
              rabData.push({ id: Date.now(), item_name: '', estimated_cost: 0 });
          }
      }
      window.renderRABTable();
  }

  window.renderRABTable = function() {
      const tbody = document.getElementById('rab-table-body');
      let total = 0;
      let html = '';

      rabData.forEach((row, index) => {
          total += Number(row.estimated_cost) || 0;
          html += `
              <tr class="group hover:bg-gray-50 transition-colors">
                  <td class="px-2 py-1 text-center text-xs font-bold text-gray-400 bg-gray-50 border-r border-border">${index + 1}</td>
                  <td class="p-0 border-r border-border">
                      <input type="text" value="${row.item_name}" oninput="updateRABRow(${row.id}, 'item_name', this.value)" class="w-full h-full px-4 py-3 bg-transparent outline-none focus:bg-blue-50/30 transition text-sm font-medium" placeholder="Contoh: Kosan / Makan">
                  </td>
                  <td class="p-0 border-r border-border">
                      <input type="number" value="${row.estimated_cost || ''}" oninput="updateRABRow(${row.id}, 'estimated_cost', this.value)" class="w-full h-full px-4 py-3 bg-transparent outline-none focus:bg-blue-50/30 transition text-sm font-semibold text-emerald-700" placeholder="0">
                  </td>
                  <td class="p-0 text-center align-middle">
                      <button onclick="deleteRABRow(${row.id})" class="p-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition cursor-pointer"><i data-lucide="x-circle" class="size-4"></i></button>
                  </td>
              </tr>
          `;
      });

      tbody.innerHTML = html;
      document.getElementById('rab-total-display').textContent = `Rp ${total.toLocaleString('id-ID')}`;
      if(typeof lucide !== 'undefined') lucide.createIcons();
  }

  window.updateRABRow = function(id, field, value) {
      const row = rabData.find(r => r.id === id);
      if(row) {
          row[field] = field === 'estimated_cost' ? (Number(value) || 0) : value;
          // Kalkulasi ulang total secara realtime
          let total = rabData.reduce((sum, r) => sum + (Number(r.estimated_cost) || 0), 0);
          document.getElementById('rab-total-display').textContent = `Rp ${total.toLocaleString('id-ID')}`;
      }
  }

  window.addRABRow = function() {
      // Membuat ID sementara berbasis waktu
      rabData.push({ id: Date.now() + Math.floor(Math.random() * 100), item_name: '', estimated_cost: 0 });
      window.renderRABTable();
  }

  window.deleteRABRow = function(id) {
      rabData = rabData.filter(r => r.id !== id);
      window.renderRABTable();
  }

  // REVISI FUNGSI SAVE: LEBIH AMAN & ANTI BENTROK ID
  window.saveRABData = async function() {
      if (!dbUser) {
          window.showToast("Sesi tidak valid, silakan login ulang.", "error");
          return;
      }

      const btn = document.getElementById('btn-save-rab');
      if(btn) {
          btn.disabled = true; 
          btn.innerHTML = '<i class="animate-spin" data-lucide="loader-2" class="size-4"></i> Menyimpan...';
          if(typeof lucide !== 'undefined') lucide.createIcons();
      }
      
      try {
          // 1. Bersihkan seluruh data bulan ini (Clean sync)
          await supabaseClient
              .from('finance_rab')
              .delete()
              .eq('user_id', String(dbUser.id))
              .eq('month_year', currentRabMonth);
          
          // 2. Filter baris yang kosong
          const validData = rabData.filter(r => r.item_name.trim() !== '' || Number(r.estimated_cost) > 0);
          
          if(validData.length > 0) {
              // 3. Siapkan payload yang aman (Generate ulang ID agar terhindar dari Primary Key Collision)
              const payload = validData.map((r, index) => ({
                  id: Date.now() + index, // Pastikan setiap baris punya ID unik saat masuk database
                  user_id: String(dbUser.id),
                  month_year: currentRabMonth,
                  item_name: r.item_name || 'Item Tanpa Nama',
                  estimated_cost: Number(r.estimated_cost) || 0
              }));
              
              // 4. Insert data baru
              const { error } = await supabaseClient.from('finance_rab').insert(payload);
              if(error) throw error; 
          }
          
          window.showToast("RAB Bulan ini berhasil disimpan!", "success");
          
          // Tutup modal
          if (typeof closeModal === 'function') closeModal('modal-rab');
          else if (typeof window.closeModal === 'function') window.closeModal('modal-rab');
          else {
              document.getElementById('modal-rab').classList.add('hidden');
              document.getElementById('modal-rab').classList.remove('flex');
          }
          
      } catch (err) {
          window.showToast("Gagal menyimpan RAB: " + err.message, "error");
          console.error("Supabase Error Details:", err);
      } finally {
          // Kembalikan kondisi tombol
          if(btn) {
              btn.disabled = false; 
              btn.innerHTML = '<i data-lucide="save" class="size-4"></i> Simpan RAB';
              if(typeof lucide !== 'undefined') lucide.createIcons();
          }
      }
  }

  /* =======================================
     FITUR 4: ROADMAP PERKULIAHAN
  ======================================= */
  const formRoadmap = document.getElementById('form-roadmap');
  formRoadmap?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabaseClient.from('roadmap').insert([{
        user_id: dbUser.id, semester: parseInt(document.getElementById('rm-semester').value)||0, sks: parseInt(document.getElementById('rm-sks').value)||0,
        target: document.getElementById('rm-target').value, status: document.getElementById('rm-status').value
      }]);
      if (error) throw error;
      window.closeModal('modal-roadmap'); formRoadmap.reset(); window.showToast('Roadmap ditambahkan!'); loadRoadmap();
    } catch (err) { window.showToast(err.message, "error"); }
  });
  async function loadRoadmap() {
    const { data } = await supabaseClient.from('roadmap').select('*').eq('user_id', dbUser.id).order('semester', { ascending: true });
    const container = document.getElementById('roadmap-container');
    if(!container) return;
    container.innerHTML = '';
    if (data && data.length > 0) {
      data.forEach(r => {
        let stClass = r.status === 'selesai' ? 'bg-success text-white' : (r.status === 'berjalan' ? 'bg-warning text-warning-dark' : 'bg-gray-100 text-secondary');
        container.innerHTML += `<div class="border border-border rounded-xl p-4 bg-white shadow-sm flex flex-col relative"><button onclick="deleteRoadmap(${r.id})" class="absolute top-3 right-3 text-secondary hover:text-error cursor-pointer"><i data-lucide="trash" class="size-4"></i></button><span class="text-[10px] font-bold uppercase tracking-wider text-secondary mb-1">Semester ${r.semester} • ${r.sks} SKS</span><h3 class="font-bold text-base mb-3 flex-1 pr-6">${r.target}</h3><select onchange="updateRoadmapStatus(${r.id}, this.value)" class="${stClass} rounded-lg px-2 py-1 text-xs font-semibold outline-none cursor-pointer appearance-none border-none text-center"><option value="rencana" ${r.status==='rencana'?'selected':''} class="text-foreground bg-white">Rencana</option><option value="berjalan" ${r.status==='berjalan'?'selected':''} class="text-foreground bg-white">Berjalan</option><option value="selesai" ${r.status==='selesai'?'selected':''} class="text-foreground bg-white">Selesai</option></select></div>`;
      });
      lucide.createIcons();
    } else { container.innerHTML = `<div class="col-span-full text-center py-6 text-secondary text-xs">Belum ada roadmap.</div>`; }
  }
  window.updateRoadmapStatus = async (id, status) => { await supabaseClient.from('roadmap').update({ status }).eq('id', id); window.showToast('Status diperbarui'); loadRoadmap(); }
  window.deleteRoadmap = async (id) => { if(confirm('Hapus?')) { await supabaseClient.from('roadmap').delete().eq('id', id); loadRoadmap(); } }
/* =======================================
   FUNGSI BANTUAN: KONVERSI NILAI KE IP
======================================= */
window.calculateGradeAndIP = function(finalScore) {
    if (finalScore >= 86) return { grade: 'A', ip: 4.00 };
    if (finalScore >= 81) return { grade: 'AB', ip: 3.50 };
    if (finalScore >= 71) return { grade: 'B', ip: 3.00 };
    if (finalScore >= 66) return { grade: 'BC', ip: 2.50 };
    if (finalScore >= 61) return { grade: 'C', ip: 2.00 };
    if (finalScore >= 56) return { grade: 'CD', ip: 1.50 };
    if (finalScore >= 51) return { grade: 'D', ip: 1.00 };
    return { grade: 'E', ip: 0.00 };
};
  /* =======================================
   FITUR 5: FUNGSI UTAMA IP TRACKER (Bisa Jalan Latar Belakang)
======================================= */
window.loadIpTracker = async function() {
    const { data: semesters } = await supabaseClient.from('ip_semesters').select('*').eq('user_id', dbUser.id).order('semester_number', { ascending: true });
    const { data: courses } = await supabaseClient.from('ip_courses').select('*').eq('user_id', dbUser.id);
    const container = document.getElementById('iptracker-container');
    
    // 🔥 PERBAIKAN KRUSIAL: Kita hapus "Tombol Bunuh Diri" (if(!container) return;)
    // Ganti menjadi: bersihkan layar hanya jika layarnya sedang dibuka
    if (container) container.innerHTML = '';
    
    if(!semesters || semesters.length === 0) {
      if (container) container.innerHTML = `<div class="text-center py-6 text-secondary text-xs">Belum ada mata kuliah.</div>`;
      if(document.getElementById('ipk-display')) document.getElementById('ipk-display').textContent = '0.00';
      if(document.getElementById('stat-ipk')) document.getElementById('stat-ipk').textContent = '0.00';
      return;
    }

    const resAsm = await supabaseClient.from('ip_assessments').select('*').in('course_id', courses.map(c => c.id));
    const assessments = resAsm.data || [];
    let overallSKS = 0; let overallMutu = 0;

    semesters.forEach(sm => {
      const smCourses = courses.filter(c => c.semester_id === sm.id);
      if(smCourses.length === 0) return;
      let semSKS = 0; let semMutu = 0; let coursesHtml = '';
      
      smCourses.forEach(c => {
        let fScore = 0; let aspList = '';
        assessments.filter(a => a.course_id === c.id).forEach(a => {
           fScore += (a.score * (a.weight / 100));
           aspList += `<span class="inline-block bg-white text-[10px] text-secondary border border-border px-1.5 py-0.5 rounded mr-1 mb-1">${a.name}: ${a.score} (${a.weight}%)</span>`;
        });
        const res = calculateGradeAndIP(fScore);
        semSKS += c.sks; semMutu += (c.sks * res.ip);
        overallSKS += c.sks; overallMutu += (c.sks * res.ip);
        
        coursesHtml += `<div class="border-b border-border last:border-0 p-3 hover:bg-muted/30"><div class="flex items-center justify-between"><div><p class="font-medium text-foreground">${c.course_name}</p><p class="text-xs text-secondary mt-0.5">${c.sks} SKS | NA: ${fScore.toFixed(1)}</p><div class="mt-1.5">${aspList}</div></div><div class="flex items-center gap-4"><div class="text-right"><p class="font-bold text-lg text-primary">${res.grade}</p><p class="text-[10px] text-secondary font-semibold">IP: ${res.ip.toFixed(2)}</p></div><button onclick="deleteCourse(${c.id})" class="text-secondary hover:text-error cursor-pointer"><i data-lucide="trash" class="size-4"></i></button></div></div></div>`;
      });
      
      // Render HTML matkul hanya jika tab IP Tracker sedang dibuka
      if (container) {
          container.innerHTML += `<div class="bg-white border border-border rounded-xl shadow-sm mb-4"><div class="bg-gray-50 px-4 py-3 border-b border-border flex items-center justify-between rounded-t-xl"><h4 class="font-bold text-sm text-foreground">Semester ${sm.semester_number}</h4><div class="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-bold">IPS: ${semSKS>0?(semMutu/semSKS).toFixed(2):'0.00'}</div></div>${coursesHtml}</div>`;
      }
    });

    // Kalkulasi IPK Akhir
    const ipk = overallSKS > 0 ? (overallMutu / overallSKS).toFixed(2) : '0.00';
    
    // Render ke HTML yang ada
    if(document.getElementById('ipk-display')) document.getElementById('ipk-display').textContent = ipk;
    if(document.getElementById('sks-display')) document.getElementById('sks-display').textContent = overallSKS;
    
    // TEMBAK LANGSUNG KE DASBOR
    if(document.getElementById('stat-ipk')) document.getElementById('stat-ipk').textContent = ipk;
    
    if(typeof lucide !== 'undefined') lucide.createIcons();

    // =======================================
// FUNGSI MENGHAPUS MATA KULIAH (IP TRACKER)
// =======================================
window.deleteCourse = async function(courseId) {
    if(confirm('Yakin ingin menghapus mata kuliah ini? Semua aspek nilai di dalamnya juga akan terhapus secara permanen.')) {
        try {
            // 1. Hapus nilai/aspek penilaian yang terikat dengan matkul ini lebih dulu (Mencegah error Foreign Key)
            await supabaseClient.from('ip_assessments').delete().eq('course_id', courseId);
            
            // 2. Hapus mata kuliahnya
            const { error } = await supabaseClient.from('ip_courses').delete().eq('id', courseId);
            
            if (error) throw error;
            
            // 3. Tampilkan notifikasi
            if (typeof window.showToast === 'function') {
                window.showToast('Mata kuliah berhasil dihapus!', 'success');
            }
            
            // 4. Refresh tampilan IP Tracker & Dashboard secara otomatis
            if (typeof window.loadIpTracker === 'function') window.loadIpTracker();
            if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
            
        } catch (err) {
            console.error("Gagal menghapus mata kuliah:", err);
            if (typeof window.showToast === 'function') {
                window.showToast('Gagal menghapus matkul: ' + err.message, 'error');
            } else {
                alert('Gagal menghapus mata kuliah.');
            }
        }
    }
}
}

  /* =======================================
     FITUR 5½: IP TRACKER SUBMIT + DUPLICATE FIX
  ======================================= */

  // Pastikan hanya ada satu listener untuk form-iptracker. listener ini melakukan
  // semua pekerjaan: validasi input, menyimpan kursus/semester, dan menutup
  // modal. kita juga membersihkan container terlebih dahulu untuk menghindari
  // "race" antara reset form dan pembacaan data dari Supabase.
  const formIpTracker = document.getElementById('form-iptracker');
  formIpTracker?.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!dbUser || !dbUser.id) return;

      // bersihkan UI dan form agar tidak ada sisa data saat proses berlangsung
      const container = document.getElementById('iptracker-container');
      if (container) container.innerHTML = '';

      try {
          const semesterNum = parseInt(document.getElementById('ip-semester').value) || 0;
          const sks = parseFloat(document.getElementById('ip-sks').value) || 0;
          const courseName = document.getElementById('ip-course').value.trim();
          if (!semesterNum || !sks || !courseName) throw new Error('Lengkapi semua kolom');

          // cari atau buat semester yang sesuai
          let semesterId;
          const { data: semData, error: semErr } = await supabaseClient.from('ip_semesters')
              .select('*').eq('user_id', dbUser.id).eq('semester_number', semesterNum).single();
          if (semErr && semErr.code !== 'PGRST116') throw semErr; // 404 ignored
          if (semData) {
              semesterId = semData.id;
          } else {
              const { data: newSem, error: newErr } = await supabaseClient.from('ip_semesters')
                  .insert([{ user_id: dbUser.id, semester_number: semesterNum }]).select().single();
              if (newErr) throw newErr;
              semesterId = newSem.id;
          }

          // simpan kursus baru
          const { data: newCourse, error: courseErr } = await supabaseClient.from('ip_courses')
              .insert([{ user_id: dbUser.id, semester_id: semesterId, course_name: courseName, sks }])
              .select().single();
          if (courseErr) throw courseErr;
          const courseId = newCourse.id;

          // ambil aspek-aspek yang mungkin ditambahkan secara dinamis
          const aspects = [];
          document.querySelectorAll('#wadah-aspek-ipk .aspect-row').forEach(r => {
              const nameEl = r.querySelector('.aspect-name');
              const weightEl = r.querySelector('.aspect-weight');
              const scoreEl = r.querySelector('.aspect-score');
              if (nameEl && weightEl && scoreEl) {
                  const name = nameEl.value.trim();
                  const weight = parseFloat(weightEl.value) || 0;
                  const score = parseFloat(scoreEl.value) || 0;
                  if (name && weight > 0) aspects.push({ name, weight, score });
              }
          });
          // masukkan aspek-aspek jika ada
          if (aspects.length) {
              for (const a of aspects) {
                  await supabaseClient.from('ip_assessments').insert([{ course_id: courseId, name: a.name, weight: a.weight, score: a.score }]);
              }
          }

          window.showToast('Mata kuliah berhasil ditambahkan!', 'success');
          closeModal('modal-iptracker');
          formIpTracker.reset();
          if (container) container.innerHTML = '';
          if (typeof window.loadIpTracker === 'function') window.loadIpTracker();
          if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
      } catch (err) {
          console.error('IP tracker submit error', err);
          window.showToast(err.message || 'Terjadi kesalahan', 'error');
      }
  });

  // dyn. row helper: tambah / hapus aspek beserta perhitungan total bobot
  document.getElementById('btn-tambah-aspek')?.addEventListener('click', () => {
      const box = document.getElementById('wadah-aspek-ipk');
      if (!box) return;
      const row = document.createElement('div');
      row.className = 'flex gap-2 aspect-row';
      row.innerHTML = `
          <input type="text" class="aspect-name w-full px-2 py-1 text-sm border rounded" placeholder="Nama aspek" required>
          <input type="number" class="aspect-weight w-20 px-2 py-1 text-sm border rounded" placeholder="Bobot (%)" required min="0" max="100">
          <input type="number" class="aspect-score w-20 px-2 py-1 text-sm border rounded" placeholder="Nilai" required min="0" max="100">
          <button type="button" class="btn-remove-aspect px-2 text-red-500 font-bold">×</button>
      `;
      box.appendChild(row);
      row.querySelector('.btn-remove-aspect').addEventListener('click', () => { row.remove(); updateAspectTotal(); });
      updateAspectTotal();
  });

  // reset form dan aspek setiap kali modal iptracker dibuka/ditutup
  document.getElementById('btn-tutup-iptracker')?.addEventListener('click', () => {
      if (formIpTracker) formIpTracker.reset();
      const box = document.getElementById('wadah-aspek-ipk');
      if (box) box.innerHTML = '';
      const label = document.getElementById('label-total-bobot');
      if (label) label.textContent = 'Total Bobot: 0%';
  });

  document.getElementById('wadah-aspek-ipk')?.addEventListener('input', updateAspectTotal);
  function updateAspectTotal() {
      const box = document.getElementById('wadah-aspek-ipk');
      if (!box) return;
      let total = 0;
      box.querySelectorAll('.aspect-weight').forEach(el => { total += parseFloat(el.value) || 0; });
      const label = document.getElementById('label-total-bobot');
      if (label) label.textContent = `Total Bobot: ${total}%`;
  }

  /* =======================================
     FITUR 6: HABIT TRACKER (ME+ STYLE FULL DYNAMIC)
  ======================================= */
  let currentHabitFilter = 'all';
  let selectedHabitDate = new Date().toISOString().split('T')[0];
  let habitDisplayMonth = new Date(); // Menyimpan state bulan yang sedang dibuka

  const HABIT_PACKAGES = [
    { name: "Produktivitas Penuh", icon: "🚀", description: "Habit Produktivitas Seharian.", area: "general", habits: [{ title: "Hidrasi Pagi", icon: "💧", time_of_day: 'morning' },{ title: "Mindset Reset", icon: "🧘", time_of_day: 'morning' },{ title: "Deep Work", icon: "🐸", time_of_day: 'morning' }, { title: "Istirahat", icon: "🍽️", time_of_day: 'afternoon' },{ title: "Digital Sunset", icon: "📵", time_of_day: 'evening' }] },
    { name: "Fokus Mendalam", icon: "🎯", description: "Paket anti-distraksi.", area: "study", habits: [{ title: "Single-Tasking", icon: "⚙️", time_of_day: 'morning' },{ title: "Cek Inbox Terjadwal", icon: "📧", time_of_day: 'morning' },{ title: "Bebas Ponsel", icon: "🚫", time_of_day: 'morning' }] },
    { name: "Kesejahteraan", icon: "💖", description: "Kelola stres dan pikiran.", area: "health", habits: [{ title: "Jurnal Syukur", icon: "🙏", time_of_day: 'morning' },{ title: "Batasi Berita", icon: "📰", time_of_day: 'afternoon' },{ title: "Me Time", icon: "☕", time_of_day: 'evening' }] },
    { name: "Pertumbuhan", icon: "💰", description: "Stabilitas jangka panjang.", area: "finance", habits: [{ title: "Literasi Finansial", icon: "📖", time_of_day: 'afternoon' }, { title: "Menabung Rutin", icon: "💳", time_of_day: 'morning' }, { title: "Review Mingguan", icon: "📅", time_of_day: 'evening' }] }
  ];

  // FUNGSI GANTI BULAN
  window.changeHabitMonth = function(step) {
      habitDisplayMonth.setMonth(habitDisplayMonth.getMonth() + step);
      renderHabitCalendar();
  }

  // 1. RENDER NAVIGATOR KALENDER (PER BULAN)
  window.renderHabitCalendar = function() {
      const nav = document.getElementById('habit-date-navigator');
      const title = document.getElementById('habit-month-title');
      if (!nav) return;
      
      const year = habitDisplayMonth.getFullYear();
      const month = habitDisplayMonth.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      
      const dayNames = ["MNG", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
      const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
      
      // Update Judul Bulan di UI
      if (title) {
          title.textContent = `${monthNames[month]} ${year}`;
      }
      
      let html = '';
      for (let d = 1; d <= daysInMonth; d++) {
          const dateObj = new Date(year, month, d);
          const dayStr = dayNames[dateObj.getDay()];
          const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          
          const isSelected = dateKey === selectedHabitDate;
          const baseClass = isSelected ? "bg-primary text-white shadow-md transform scale-110" : "hover:bg-gray-100 text-foreground bg-gray-50 border border-transparent hover:border-gray-200";
          const textClass = isSelected ? "text-white opacity-90" : "text-secondary";
          
          html += `
              <div id="hcal-${dateKey}" onclick="selectHabitDate('${dateKey}')" class="flex flex-col items-center justify-center p-2 rounded-xl min-w-[55px] cursor-pointer transition-all snap-center ${baseClass}">
                  <span class="text-[10px] font-bold ${textClass}">${dayStr}</span>
                  <span class="text-lg font-black">${d}</span>
              </div>
          `;
      }
      nav.innerHTML = html;

      // Auto-scroll logic: scroll ke tanggal terpilih jika di bulan yang sama,
      // Jika beda bulan, scroll ke tanggal 1
      setTimeout(() => {
          let scrollTo = selectedHabitDate;
          if(selectedHabitDate.split('-')[1] != String(month+1).padStart(2,'0')) {
               scrollTo = `${year}-${String(month+1).padStart(2,'0')}-01`;
          }
          const selectedEl = document.getElementById(`hcal-${scrollTo}`);
          if(selectedEl) {
              selectedEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
      }, 100);

      if(typeof lucide !== 'undefined') lucide.createIcons();
  }

  // 2. KLIK TANGGAL
  window.selectHabitDate = function(dateKey) {
      selectedHabitDate = dateKey;
      renderHabitCalendar(); 
      loadHabits(); 
  }

  // 3. RENDER REKOMENDASI PAKET
  window.renderHabitRecommendations = function() {
      const box = document.getElementById('habit-recommendations'); 
      if (!box) return;
      box.innerHTML = ''; 
      HABIT_PACKAGES.forEach((p, index) => { 
          const card = document.createElement('div');
          card.className = 'flex-shrink-0 w-64 p-4 rounded-xl cursor-pointer hover:shadow-md transition border border-border bg-white snap-center';
          const habitListHtml = p.habits.map(h => `<li class="text-[10px] text-secondary">${h.icon} ${h.title}</li>`).join('');
          card.innerHTML = `
              <div class="text-2xl mb-1">${p.icon}</div>
              <div class="font-bold text-sm text-foreground">${p.name}</div>
              <div class="text-[10px] text-secondary mt-1 mb-2">${p.description}</div>
              <ul class="list-disc list-inside mt-2 space-y-1 pl-1 max-h-16 overflow-y-auto mb-3">${habitListHtml}</ul>
              <button data-idx="${index}" class="btn-add-package w-full text-xs bg-primary/10 text-primary font-bold hover:bg-primary hover:text-white transition px-2 py-1.5 rounded-lg cursor-pointer">Tambah (${p.habits.length})</button>
          `;
          box.appendChild(card);
      });
      document.querySelectorAll('.btn-add-package').forEach(btn => {
          btn.addEventListener('click', async (e) => {
              const index = parseInt(e.target.dataset.idx);
              const packageData = HABIT_PACKAGES[index];
              if (!confirm(`Tambahkan paket habit "${packageData.name}"?`)) return;
              e.target.disabled = true; e.target.textContent = 'Menambahkan...';
              for (const habit of packageData.habits) {
                  await supabaseClient.from('habits').insert([{ user_id: dbUser.id, title: habit.title, icon: habit.icon, time_of_day: habit.time_of_day, area: packageData.area }]);
              }
              e.target.disabled = false; e.target.textContent = 'Tambah (' + packageData.habits.length + ')';
              window.showToast("Paket Habit ditambahkan!");
              loadHabits(); loadDashboardStats();
          });
      });
  }

  // 4. SUBMIT FORM CUSTOM HABIT (ME+ STYLE)
  const formHabit = document.getElementById('form-habit');
  if (formHabit) {
      formHabit.onsubmit = async (e) => {
          e.preventDefault();
          const title = document.getElementById('hb-title').value.trim();
          const area = document.getElementById('hb-area').value;
          let timeOfDay = document.getElementById('hb-time').value;
          if (timeOfDay === 'anytime') timeOfDay = 'general'; 
          
          const payload = { user_id: dbUser.id, title: title, area: area, time_of_day: timeOfDay };
          const btnSubmit = formHabit.querySelector('button[type="submit"]');
          const originalText = btnSubmit.innerHTML;
          btnSubmit.innerHTML = 'Menyimpan...'; btnSubmit.disabled = true;

          const { error } = await supabaseClient.from('habits').insert([payload]);
          btnSubmit.innerHTML = originalText; btnSubmit.disabled = false;

          if (!error) { 
              window.closeModal('modal-habit'); formHabit.reset();
              document.getElementById('hb-freq-specific')?.classList.add('hidden');
              document.getElementById('hb-goal-wrapper')?.classList.add('hidden');
              document.getElementById('hb-custom-days')?.classList.add('hidden');
              window.showToast('Habit "' + title + '" berhasil dibuat!', 'success'); 
              loadHabits(); loadDashboardStats(); 
          } else { window.showToast('Gagal Simpan: ' + error.message, 'error'); }
      };
  }

  // 5. MASTER FUNGSI LOAD HALAMAN (Diakses Saat Navigasi Sidebar Diklik)
  window.loadHabitsPage = function() {
      renderHabitCalendar();
      renderHabitRecommendations();
      loadHabits();
  }

  // 6. RENDER LIST HABIT & CEKLIS
  window.loadHabits = async function() {
      const { data: habits, error } = await supabaseClient.from('habits').select('*').eq('user_id', dbUser.id);
      if (error) return;

      const morningContainer = document.getElementById('habits-morning-container');
      const todayContainer = document.getElementById('habits-today-container');
      if (!morningContainer || !todayContainer) return;
      
      morningContainer.innerHTML = ''; todayContainer.innerHTML = '';

      // Ambil log checklist berdasarkan tanggal yang diklik di kalender
      const { data: logs } = await supabaseClient.from('habit_logs').select('*').in('habit_id', (habits||[]).map(h=>h.id)).eq('log_date', selectedHabitDate);

      if(habits.length === 0) {
           todayContainer.innerHTML = `
           <div class="text-center p-6 border-2 border-dashed border-orange-200 rounded-2xl text-secondary bg-white/50">
                <i data-lucide="activity" class="size-8 mx-auto mb-2 text-orange-300"></i>
                <p>Belum ada rutinitas terdaftar.<br>Yuk bangun kebiasaan baikmu hari ini!</p>
           </div>`;
           if (typeof lucide !== 'undefined') lucide.createIcons(); return;
      }

      habits.forEach(habit => {
          // Periksa apakah habit ini sudah di-check di TANGGAL yang sedang dipilih
          const isDone = (logs||[]).some(l => l.habit_id === habit.id);
          
          const iconHTML = isDone 
              ? `<div class="size-12 rounded-full bg-success text-white shadow-md shadow-success/30 flex items-center justify-center transition-transform hover:scale-105 shrink-0"><i data-lucide="check" class="size-6"></i></div>` 
              : `<div class="size-12 rounded-full bg-orange-100 text-orange-600 border border-orange-200 flex items-center justify-center text-xl transition-transform hover:scale-105 shrink-0">🔥</div>`;

          const cardHTML = `
              <div class="flex items-center justify-between p-4 bg-white rounded-2xl border ${isDone ? 'border-success bg-success-light/20' : 'border-border hover:border-orange-300'} shadow-sm hover:shadow-md transition-all group cursor-pointer" onclick="toggleHabit(${habit.id}, ${isDone})">
                  <div class="flex items-center gap-4 min-w-0">
                      ${iconHTML}
                      <div class="min-w-0 truncate">
                          <h4 class="font-bold text-foreground text-base truncate ${isDone ? 'line-through text-secondary' : ''}">${habit.title}</h4>
                          <p class="text-[10px] font-bold text-secondary uppercase tracking-wider mt-1 bg-gray-100 px-2 py-0.5 rounded inline-block">${habit.area} • ${habit.time_of_day}</p>
                      </div>
                  </div>
                  <button onclick="event.stopPropagation(); deleteHabit(${habit.id})" class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-2 bg-white rounded-full shadow-sm shrink-0 tooltip" title="Hapus Habit"><i data-lucide="trash-2" class="size-4"></i></button>
              </div>
          `;

          if (habit.time_of_day === 'morning') morningContainer.innerHTML += cardHTML;
          else todayContainer.innerHTML += cardHTML;
      });

      if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // 7. TOGGLE CEKLIS HABIT (Sinkron Database dengan Tanggal Spesifik)
  window.toggleHabit = async function(hId, currentlyDone) {
      if(currentlyDone) { 
          // Hapus ceklis
          await supabaseClient.from('habit_logs').delete()
              .eq('habit_id', hId)
              .eq('log_date', selectedHabitDate); 
      } else { 
          // 🔥 PERBAIKAN KRUSIAL: Tambahkan user_id: dbUser.id agar tercatat sebagai milikmu!
          const { error } = await supabaseClient.from('habit_logs').insert([{ 
              user_id: dbUser.id,   // <--- INI YANG HILANG SEBELUMNYA
              habit_id: hId, 
              log_date: selectedHabitDate, 
              completed: true 
          }]); 
          
          if (!error && typeof window.showToast === 'function') {
              window.showToast("Kerja bagus! Habit diselesaikan.", "success");
          } else if (error) {
              console.error("Gagal mencatat habit:", error);
          }
      }
      
      // Render ulang list habit-nya
      loadHabits(); 
      
      // Render ulang Heatmap Profil secara langsung!
      if (typeof window.renderProfileHeatmap === 'function') window.renderProfileHeatmap();
  }
  
  window.deleteHabit = async function(id) {
      if(confirm('Hapus rutinitas ini secara permanen?')) {
          await supabaseClient.from('habits').delete().eq('id', id);
          loadHabits();
          window.showToast('Rutinitas dihapus', 'success');
      }
  }

  /* =======================================
     FITUR 7: POMODORO TIMER & MUSIC (LOFI UI)
  ======================================= */
  let timerInterval; 
  let timeLeft = 25 * 60; 
  let isRunning = false;
  let isMusicPlaying = false;
  
  const btnStart = document.getElementById('btn-timer-start');
  const iconStart = document.getElementById('timer-icon-start');
  const textStart = document.getElementById('timer-text-start');
  const audioEl = document.getElementById('pomodoro-audio');

  function updateDisplay() { 
      if(document.getElementById('timer-display')) {
          document.getElementById('timer-display').textContent = `${Math.floor(timeLeft/60).toString().padStart(2,'0')}:${(timeLeft%60).toString().padStart(2,'0')}`; 
      }
  }

  btnStart?.addEventListener('click', () => {
    if (isRunning) { 
        clearInterval(timerInterval); 
        textStart.textContent = 'Resume'; 
        iconStart.setAttribute('data-lucide', 'play');
        lucide.createIcons();
    } 
    else { 
        textStart.textContent = 'Pause'; 
        iconStart.setAttribute('data-lucide', 'pause');
        lucide.createIcons();
        timerInterval = setInterval(async () => { 
            timeLeft--; 
            updateDisplay(); 
            if (timeLeft <= 0) {
                clearInterval(timerInterval); 
                isRunning = false; 
                textStart.textContent = 'Start'; 
                iconStart.setAttribute('data-lucide', 'play');
                lucide.createIcons();
                timeLeft = 25 * 60; 
                updateDisplay();
                
                // Tambah Poin
                dbUser.points += 10; dbUser.pomodoro_done += 1;
                await supabaseClient.from('users').update({ points: dbUser.points, pomodoro_done: dbUser.pomodoro_done }).eq('id', dbUser.id);
                notify('Sesi Selesai!', 'Kerja bagus! +10 Poin didapatkan.'); 
                loadDashboardStats();
            }
        }, 1000); 
    }
    isRunning = !isRunning;
  });

  document.getElementById('btn-timer-reset')?.addEventListener('click', () => { 
      clearInterval(timerInterval); 
      isRunning = false; 
      timeLeft = 25 * 60; 
      if(textStart) textStart.textContent = 'Start'; 
      if(iconStart) { iconStart.setAttribute('data-lucide', 'play'); lucide.createIcons(); }
      updateDisplay(); 
  });

  // Fungsi Toggle Musik BGM Lofi
  window.togglePomodoroMusic = function() {
      const icon = document.getElementById('music-icon');
      const text = document.getElementById('music-text');
      
      if(isMusicPlaying) {
          audioEl.pause();
          isMusicPlaying = false;
          icon.setAttribute('data-lucide', 'volume-x');
          text.textContent = 'BGM Off';
      } else {
          audioEl.volume = 0.4; // Volume disetel ke 40% agar enak didengar
          audioEl.play().catch(e => console.log("Audio diblokir browser:", e));
          isMusicPlaying = true;
          icon.setAttribute('data-lucide', 'music');
          text.textContent = 'BGM On';
      }
      lucide.createIcons();
  }
});

/* =======================================
   FITUR 8: SOCIAL & VIRTUAL STUDY ROOM (ULTIMATE)
======================================= */
let currentStudyGroupId = null;
let chatSubscription = null;

// 1. SWITCH TAB (TEMAN vs GRUP)
window.switchStudyTab = function(tab) {
    const tabFriends = document.getElementById('study-tab-friends');
    const tabGroups = document.getElementById('study-tab-groups');
    const btnFriends = document.getElementById('tab-btn-friends');
    const btnGroups = document.getElementById('tab-btn-groups');

    if (tab === 'friends') {
        tabFriends.classList.remove('hidden');
        tabGroups.classList.add('hidden');
        tabGroups.classList.remove('flex');
        
        btnFriends.className = 'flex-1 sm:flex-none px-6 py-2 rounded-lg bg-white shadow-sm font-bold text-sm text-indigo-600 transition';
        btnGroups.className = 'flex-1 sm:flex-none px-6 py-2 rounded-lg text-secondary hover:text-foreground font-bold text-sm transition';
        
        window.loadFriendRequests();
        window.loadFriendsList();
    } else {
        tabFriends.classList.add('hidden');
        tabGroups.classList.remove('hidden');
        tabGroups.classList.add('flex');
        
        btnGroups.className = 'flex-1 sm:flex-none px-6 py-2 rounded-lg bg-white shadow-sm font-bold text-sm text-indigo-600 transition';
        btnFriends.className = 'flex-1 sm:flex-none px-6 py-2 rounded-lg text-secondary hover:text-foreground font-bold text-sm transition';
        
        window.loadStudyGroups();
    }
}

// 2. MENCARI USER (TEMAN)
window.searchUsers = async function() {
    const query = document.getElementById('search-friend-input').value.trim();
    if (!query) return;

    const resultBox = document.getElementById('search-friend-result');
    resultBox.innerHTML = '<p class="text-xs text-secondary text-center py-2"><i class="animate-spin inline-block" data-lucide="loader-2"></i> Mencari...</p>';
    if(typeof lucide !== 'undefined') lucide.createIcons();

    try {
    // 1. Hapus pengecekan isNumber. Kita HANYA butuh pengecekan UUID yang valid.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);
    let dbQuery = supabaseClient.from('users').select('id, username, avatar_url, points');

    if (isUUID) {
        // Jika yang diketik user adalah format UUID, cari berdasarkan ID ATAU Username
        dbQuery = dbQuery.or(`username.ilike.%${query}%,id.eq.${query}`);
    } else {
        // Jika yang diketik teks biasa atau angka biasa, FOKUS cari di Username saja! (Mencegah Error 400)
        dbQuery = dbQuery.ilike('username', `%${query}%`);
    }

        const { data, error } = await dbQuery.neq('id', dbUser.id).limit(5);
        if (error) throw error; 

        if (!data || data.length === 0) {
            resultBox.innerHTML = '<p class="text-xs text-red-500 text-center py-2">User tidak ditemukan.</p>';
            return;
        }

        resultBox.innerHTML = data.map(u => `
            <div class="flex items-center justify-between p-3 bg-gray-50 border border-border rounded-xl hover:bg-indigo-50/50 transition">
                <div class="flex items-center gap-3 cursor-pointer hover:opacity-80" onclick="previewUserProfile('${u.id}', '${u.username}', ${u.points || 0}, '${u.avatar_url || ''}')">
                    <img src="${u.avatar_url || `https://ui-avatars.com/api/?name=${u.username}&background=E0E7FF&color=4F46E5`}" class="size-8 rounded-full object-cover">
                    <div>
                        <p class="font-bold text-sm text-foreground leading-tight">${u.username}</p>
                        <p class="text-[10px] text-secondary">Lihat Profil</p>
                    </div>
                </div>
                <button onclick="sendFriendRequest('${u.id}')" class="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition tooltip" title="Tambah Teman"><i data-lucide="user-plus" class="size-4"></i></button>
            </div>
        `).join('');
        
    } catch (err) {
        console.error("Search Users Error:", err);
        resultBox.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Gagal memuat. Cek koneksi / format.</p>';
    } finally {
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// 3. PREVIEW PROFIL USER LAIN
window.previewUserProfile = function(uid, username, points, avatar) {
    const level = Math.floor((points || 0) / 50) + 1;
    document.getElementById('preview-name').textContent = username;
    document.getElementById('preview-uid').textContent = "UID: " + uid;
    document.getElementById('preview-xp').textContent = points || 0;
    document.getElementById('preview-level').textContent = level;
    document.getElementById('preview-avatar').src = avatar || `https://ui-avatars.com/api/?name=${username}&background=E0E7FF&color=4F46E5`;
    
    const btn = document.getElementById('btn-action-follow');
    btn.onclick = () => { sendFriendRequest(uid); };
    
    openModal('modal-user-preview');
}

// 4. KIRIM PERMINTAAN PERTEMANAN
window.sendFriendRequest = async function(receiverId) {
    if (String(receiverId) === String(dbUser.id)) {
        window.showToast("Tidak bisa mengirim ke akun sendiri!", "error");
        return;
    }

    const payload = { requester_id: String(dbUser.id), receiver_id: String(receiverId), status: 'pending' };
    const { data, error } = await supabaseClient.from('friendships').insert([payload]).select();
    
    if (error) {
        if(error.code === '23505') window.showToast("Permintaan sudah dikirim/berteman!", "warning");
        else window.showToast("Gagal mengirim permintaan.", "error");
    } else {
        window.showToast("Permintaan pertemanan dikirim!", "success");
        closeModal('modal-user-preview');
    }
}

// 5. MUAT PERMINTAAN PERTEMANAN 
window.loadFriendRequests = async function() {
    const reqList = document.getElementById('friend-requests-list');
    document.getElementById('req-count').textContent = '...';

    try {
        const { data: allReqs, error } = await supabaseClient.from('friendships').select('*').eq('status', 'pending');
        if (error) throw error;

        const myIdStr = String(dbUser.id);
        const data = allReqs.filter(r => String(r.receiver_id) === myIdStr);
        document.getElementById('req-count').textContent = data ? data.length : 0;

        if (!data || data.length === 0) {
            reqList.innerHTML = '<p class="text-xs text-secondary text-center py-4">Tidak ada permintaan baru.</p>';
            return;
        }

        let html = '';
        for(let req of data) {
            let finalUser = null;
            const { data: userTxt } = await supabaseClient.from('users').select('username, avatar_url').eq('id', req.requester_id).single();
            finalUser = userTxt;

            if(!finalUser && !isNaN(Number(req.requester_id))) {
                const { data: userNum } = await supabaseClient.from('users').select('username, avatar_url').eq('id', Number(req.requester_id)).single();
                finalUser = userNum;
            }

            if(finalUser) {
                html += `
                <div class="flex items-center justify-between p-3 border border-border rounded-xl mb-2 bg-white hover:bg-gray-50 transition shadow-sm">
                    <div class="flex items-center gap-3">
                        <img src="${finalUser.avatar_url || `https://ui-avatars.com/api/?name=${finalUser.username}&background=E0E7FF&color=4F46E5`}" class="size-8 rounded-full object-cover">
                        <p class="font-bold text-sm text-foreground">${finalUser.username}</p>
                    </div>
                    <div class="flex gap-1.5 shrink-0">
                        <button onclick="respondFriendRequest(${req.id}, 'accepted')" class="p-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg transition tooltip" title="Terima"><i data-lucide="check" class="size-4"></i></button>
                        <button onclick="respondFriendRequest(${req.id}, 'rejected')" class="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition tooltip" title="Tolak"><i data-lucide="x" class="size-4"></i></button>
                    </div>
                </div>`;
            }
        }
        reqList.innerHTML = html !== '' ? html : '<p class="text-xs text-secondary text-center py-4">Tidak ada permintaan valid.</p>';
        if(typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        reqList.innerHTML = '<p class="text-xs text-red-500 text-center py-4">Gagal memuat permintaan.</p>';
    }
}

// 6. TERIMA / TOLAK TEMAN
window.respondFriendRequest = async function(reqId, actionStatus) {
    try {
        if (actionStatus === 'rejected') {
            const { error } = await supabaseClient.from('friendships').delete().eq('id', reqId);
            if (error) throw error;
            window.showToast("Permintaan ditolak dan dihapus.", "success");
        } else {
            const { error } = await supabaseClient.from('friendships').update({ status: 'accepted' }).eq('id', reqId);
            if (error) throw error;
            window.showToast("Permintaan diterima! Kalian kini berteman.", "success");
        }
        await window.loadFriendRequests();
        await window.loadFriendsList();
    } catch (err) {
        console.error("Error memproses request:", err);
        window.showToast("Gagal memproses. Cek koneksi.", "error");
    }
}

// 7. MUAT DAFTAR TEMAN (DENGAN TOMBOL HAPUS)
window.loadFriendsList = async function() {
    const list = document.getElementById('friends-list');
    const myId = String(dbUser.id);
    
    try {
        const { data, error } = await supabaseClient.from('friendships')
            .select('*').eq('status', 'accepted')
            .or(`requester_id.eq.${myId},receiver_id.eq.${myId}`);

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p class="text-sm text-secondary col-span-full py-10 text-center">Belum ada teman. Ayo cari teman belajar!</p>';
            return;
        }

        let html = '';
        for(let f of data) {
            const friendId = f.requester_id === myId ? f.receiver_id : f.requester_id;
            const friendIdParsed = isNaN(Number(friendId)) ? friendId : Number(friendId);

            const { data: u } = await supabaseClient.from('users').select('id, username, avatar_url, points').eq('id', friendIdParsed).single();
            if(u) {
                // Perhatikan: Card sekarang punya tombol Hapus (user-minus) di sisi kanan
                html += `
                <div class="flex items-center justify-between p-3 border border-border rounded-xl hover:shadow-md transition bg-gray-50/50 hover:border-indigo-300 group">
                    <div class="flex items-center gap-3 cursor-pointer flex-1" onclick="previewUserProfile('${u.id}', '${u.username}', ${u.points || 0}, '${u.avatar_url || ''}')">
                        <img src="${u.avatar_url || `https://ui-avatars.com/api/?name=${u.username}&background=E0E7FF&color=4F46E5`}" class="size-10 rounded-full ring-2 ring-white object-cover">
                        <div>
                            <h4 class="font-bold text-sm text-foreground leading-tight">${u.username}</h4>
                            <p class="text-[10px] text-indigo-600 font-bold mt-0.5">Level ${Math.floor((u.points||0)/50)+1}</p>
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); removeFriend(${f.id}, '${u.username}')" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 tooltip shrink-0" title="Hapus Teman">
                        <i data-lucide="user-minus" class="size-5"></i>
                    </button>
                </div>`;
            }
        }
        list.innerHTML = html !== '' ? html : '<p class="text-sm text-secondary col-span-full py-10 text-center">Gagal merender teman.</p>';
        if(typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
        list.innerHTML = '<p class="text-sm text-red-500 col-span-full py-10 text-center">Gagal memuat daftar teman.</p>';
    }
}

// 7.5. FUNGSI HAPUS TEMAN
window.removeFriend = async function(friendshipId, friendName) {
    // Memunculkan pop-up konfirmasi bawaan browser
    if (confirm(`Yakin ingin menghapus ${friendName} dari daftar teman?`)) {
        try {
            // Hapus data pertemanan dari database berdasarkan ID pertemanannya
            const { error } = await supabaseClient.from('friendships').delete().eq('id', friendshipId);
            if (error) throw error;
            
            window.showToast(`${friendName} berhasil dihapus dari pertemanan.`, "success");
            
            // Render ulang daftar teman agar nama yang dihapus langsung hilang
            window.loadFriendsList(); 
        } catch (err) {
            console.error("Gagal menghapus teman:", err);
            window.showToast("Gagal menghapus teman. Coba lagi.", "error");
        }
    }
}

// 8. BUKA MODAL BUAT GRUP (MUAT CHECKBOX DAFTAR TEMAN)
window.openCreateGroupModal = async function() {
    const friendsBox = document.getElementById('cg-friends-list');
    friendsBox.innerHTML = '<p class="text-xs text-secondary text-center py-2"><i class="animate-spin inline-block" data-lucide="loader-2"></i> Memuat teman...</p>';
    if(typeof lucide !== 'undefined') lucide.createIcons();
    openModal('modal-create-group');

    const myId = String(dbUser.id);
    const { data, error } = await supabaseClient.from('friendships').select('*').eq('status', 'accepted').or(`requester_id.eq.${myId},receiver_id.eq.${myId}`);

    if (error || !data || data.length === 0) {
        friendsBox.innerHTML = '<p class="text-xs text-secondary text-center py-2">Belum ada teman untuk diundang.</p>';
        return;
    }

    let html = '';
    for(let f of data) {
        const friendId = f.requester_id === myId ? f.receiver_id : f.requester_id;
        const friendIdParsed = isNaN(Number(friendId)) ? friendId : Number(friendId);
        const { data: u } = await supabaseClient.from('users').select('id, username').eq('id', friendIdParsed).single();
        if(u) {
            html += `
            <label class="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer border border-transparent hover:border-border transition">
                <input type="checkbox" name="group_members_check" value="${u.id}" class="size-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer">
                <span class="text-sm font-medium text-foreground">${u.username}</span>
            </label>`;
        }
    }
    friendsBox.innerHTML = html !== '' ? html : '<p class="text-xs text-secondary text-center py-2">Gagal memuat data teman.</p>';
}

// 9. SUBMIT BUAT GRUP & INVITE TEMAN
document.getElementById('form-create-group')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Membentuk Grup...";

    try {
        const name = document.getElementById('cg-name').value;
        const desc = document.getElementById('cg-desc').value;
        const myId = String(dbUser.id);

        const { data: groupData, error: groupErr } = await supabaseClient.from('study_groups')
            .insert([{ name, description: desc, created_by: myId }]).select().single();

        if (groupErr) throw groupErr;

        // Siapkan array member (Kita sebagai Admin)
        const membersToInsert = [{ group_id: groupData.id, user_id: myId, role: 'admin' }];
        
        // Ambil semua teman yang di-ceklis
        const checkboxes = document.querySelectorAll('input[name="group_members_check"]:checked');
        checkboxes.forEach(cb => {
            membersToInsert.push({ group_id: groupData.id, user_id: cb.value, role: 'member' });
        });

        // Insert semua member sekaligus
        const { error: memberErr } = await supabaseClient.from('group_members').insert(membersToInsert);
        if (memberErr) throw memberErr;

        window.closeModal('modal-create-group');
        this.reset();
        window.showToast("Grup berhasil dibentuk!", "success");
        window.loadStudyGroups();

    } catch (err) {
        console.error(err);
        window.showToast("Gagal membentuk grup.", "error");
    } finally {
        btn.disabled = false; btn.textContent = "Bentuk Sekarang";
    }
});

// 10. MUAT DAFTAR GRUP
window.loadStudyGroups = async function() {
    const grid = document.getElementById('groups-grid');
    const myId = String(dbUser.id);

    const { data: memberships } = await supabaseClient.from('group_members').select('group_id').eq('user_id', myId);
    if (!memberships || memberships.length === 0) {
        grid.innerHTML = '<p class="text-sm text-secondary col-span-full py-10 text-center">Kamu belum bergabung di grup manapun.</p>';
        return;
    }

    const groupIds = memberships.map(m => m.group_id);
    const { data: groups } = await supabaseClient.from('study_groups').select('*').in('id', groupIds);

    grid.innerHTML = groups.map(g => `
        <div class="bg-white border border-border rounded-xl p-5 hover:border-indigo-400 hover:shadow-lg transition cursor-pointer flex flex-col h-full" onclick="openGroupRoom(${g.id}, '${g.name}')">
            <div class="size-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0 mb-3"><i data-lucide="users" class="size-5"></i></div>
            <h4 class="font-bold text-foreground text-lg mb-1">${g.name}</h4>
            <p class="text-xs text-secondary mb-4 line-clamp-2">${g.description || 'Tidak ada deskripsi.'}</p>
            <div class="mt-auto pt-3 border-t border-border flex justify-between items-center text-indigo-600 text-xs font-bold">
                Masuk Ruangan <i data-lucide="log-in" class="size-4"></i>
            </div>
        </div>
    `).join('');
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

// 11. BUKA VIRTUAL ROOM (CHAT & KANBAN)
window.openGroupRoom = function(groupId, groupName) {
    currentStudyGroupId = groupId;
    document.getElementById('groups-list-view').classList.add('hidden');
    document.getElementById('group-room-view').classList.remove('hidden');
    document.getElementById('group-room-view').classList.add('flex');
    document.getElementById('room-title').textContent = groupName;
    
    window.loadGroupChat();
    window.subscribeToChat();
    window.loadGroupTasks(); // Load data Kanban!
}

window.closeGroupRoom = function() {
    currentStudyGroupId = null;
    document.getElementById('group-room-view').classList.add('hidden');
    document.getElementById('group-room-view').classList.remove('flex');
    document.getElementById('groups-list-view').classList.remove('hidden');
    if(chatSubscription) { supabaseClient.removeChannel(chatSubscription); }
}

// 12. REALTIME CHAT LOGIC (BUG FIXED - OPTIMISTIC UPDATE)
window.loadGroupChat = async function() {
    const box = document.getElementById('group-chat-box');
    const { data } = await supabaseClient.from('group_messages').select('*').eq('group_id', currentStudyGroupId).order('created_at', { ascending: true });
    
    box.innerHTML = '';
    if(data) {
        data.forEach(msg => appendMessage(msg));
        box.scrollTop = box.scrollHeight;
    }
}

function appendMessage(msg) {
    const box = document.getElementById('group-chat-box');
    const isMe = msg.sender_id === String(dbUser.id);
    const align = isMe ? 'justify-end' : 'justify-start';
    const bg = isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-100 text-foreground rounded-bl-none';
    const nameStr = isMe ? '' : `<p class="text-[9px] font-bold text-secondary mb-1 ml-1">${msg.sender_name}</p>`;
    
    // Cek duplikasi agar Optimistic Update tidak memunculkan pesan ganda saat Realtime masuk
    if (msg.id && document.getElementById(`msg-${msg.id}`)) return; 
    const msgIdAttr = msg.id ? `id="msg-${msg.id}"` : '';

    box.innerHTML += `
        <div class="flex ${align} w-full" ${msgIdAttr}>
            <div class="max-w-[80%]">
                ${nameStr}
                <div class="${bg} p-3 rounded-2xl shadow-sm text-sm">
                    ${msg.message}
                </div>
            </div>
        </div>
    `;
    box.scrollTop = box.scrollHeight;
}

document.getElementById('form-group-chat')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const input = document.getElementById('group-chat-input');
    const txt = input.value.trim();
    if(!txt || !currentStudyGroupId) return;

    input.value = '';
    
    // Optimistic Update: Munculkan langsung di layar sebelum nunggu server!
    const tempMsg = { sender_id: String(dbUser.id), sender_name: dbUser.username, message: txt };
    appendMessage(tempMsg);

    // Kirim ke database di latar belakang
    await supabaseClient.from('group_messages').insert([{ 
        group_id: currentStudyGroupId, 
        sender_id: String(dbUser.id), 
        sender_name: dbUser.username, 
        message: txt 
    }]);
});

window.subscribeToChat = function() {
    if(chatSubscription) supabaseClient.removeChannel(chatSubscription);
    chatSubscription = supabaseClient.channel('custom-all-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${currentStudyGroupId}` }, 
      (payload) => {
          // Hanya render pesan dari ORANG LAIN, karena pesan kita sudah di-render secara Optimistic
          if (payload.new.sender_id !== String(dbUser.id)) {
              appendMessage(payload.new);
          }
      }).subscribe();
}

// 13. KANBAN TUGAS GRUP (DRAG & DROP + KLIK STATUS)
window.loadGroupTasks = async function() {
    if(!currentStudyGroupId) return;
    const { data, error } = await supabaseClient.from('group_tasks').select('*').eq('group_id', currentStudyGroupId);
    
    document.getElementById('gcol-todo').innerHTML = '';
    document.getElementById('gcol-progress').innerHTML = '';
    document.getElementById('gcol-done').innerHTML = '';

    if (data && data.length > 0) {
        data.forEach(task => {
            const col = document.getElementById(`gcol-${task.status}`);
            if(col) {
                const isMe = task.assignee_id === String(dbUser.id);
                const badgeColor = isMe ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600';
                
                col.innerHTML += `
                    <div class="bg-white p-3 rounded-xl border border-border shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-300 group relative transition flex flex-col" draggable="true" ondragstart="dragGroupTask(event, ${task.id})" id="gtask-${task.id}">
                        <button onclick="deleteGroupTask(${task.id})" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition z-10 bg-white rounded-full"><i data-lucide="trash-2" class="size-4"></i></button>
                        
                        <p class="text-sm font-bold text-foreground pr-5 mb-2">${task.title}</p>
                        <span class="text-[10px] font-bold px-2 py-1 rounded-md ${badgeColor} flex w-max items-center gap-1 mb-3"><i data-lucide="user" class="size-3"></i> ${task.assignee_name || 'Unassigned'}</span>
                        
                        <div class="mt-auto pt-2 border-t border-gray-100">
                            <select onchange="moveTaskStatusManual(${task.id}, this.value)" class="w-full bg-gray-50 border border-gray-200 text-secondary text-[10px] font-bold rounded p-1 outline-none cursor-pointer hover:border-indigo-300 transition">
                                <option value="todo" ${task.status === 'todo' ? 'selected' : ''}>📍 To Do</option>
                                <option value="progress" ${task.status === 'progress' ? 'selected' : ''}>⏳ In Progress</option>
                                <option value="done" ${task.status === 'done' ? 'selected' : ''}>✅ Done</option>
                            </select>
                        </div>
                    </div>
                `;
            }
        });
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// FUNGSI BARU: Pindah Status via Dropdown Klik
window.moveTaskStatusManual = async function(taskId, newStatus) {
    try {
        // Update database
        await supabaseClient.from('group_tasks').update({ status: newStatus }).eq('id', taskId);
        // Refresh UI seketika
        window.loadGroupTasks();
    } catch (err) {
        console.error("Gagal memindah tugas:", err);
    }
}

// 14. UNDANG TEMAN SUSULAN KE GRUP
window.openInviteGroupModal = async function() {
    const listDiv = document.getElementById('invite-friends-list');
    listDiv.innerHTML = '<p class="text-xs text-secondary text-center py-2"><i class="animate-spin inline-block" data-lucide="loader-2"></i> Memuat teman...</p>';
    if(typeof lucide !== 'undefined') lucide.createIcons();
    openModal('modal-invite-group');

    try {
        const myId = String(dbUser.id);
        
        // 1. Ambil daftar semua teman
        const { data: friends } = await supabaseClient.from('friendships').select('*').eq('status', 'accepted').or(`requester_id.eq.${myId},receiver_id.eq.${myId}`);
        // 2. Ambil daftar yang SUDAH ada di grup ini
        const { data: existingMembers } = await supabaseClient.from('group_members').select('user_id').eq('group_id', currentStudyGroupId);
        const existingIds = existingMembers ? existingMembers.map(m => String(m.user_id)) : [];

        if (!friends || friends.length === 0) {
            listDiv.innerHTML = '<p class="text-xs text-secondary text-center py-2">Belum ada teman.</p>';
            return;
        }

        let html = '';
        for(let f of friends) {
            const friendId = String(f.requester_id) === myId ? String(f.receiver_id) : String(f.requester_id);
            const friendIdParsed = isNaN(Number(friendId)) ? friendId : Number(friendId);
            
            // Jangan tampilkan jika sudah di dalam grup
            if(!existingIds.includes(friendId) && !existingIds.includes(String(friendIdParsed))) {
                const { data: u } = await supabaseClient.from('users').select('id, username').eq('id', friendIdParsed).single();
                if(u) {
                    html += `
                    <label class="flex items-center gap-3 p-2 hover:bg-white rounded-lg cursor-pointer border border-transparent transition">
                        <input type="checkbox" name="invite_members_check" value="${u.id}" class="size-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer">
                        <span class="text-sm font-medium text-foreground">${u.username}</span>
                    </label>`;
                }
            }
        }
        listDiv.innerHTML = html !== '' ? html : '<p class="text-xs text-secondary text-center py-2">Semua temanmu sudah ada di grup ini.</p>';
    } catch (err) {
        listDiv.innerHTML = '<p class="text-xs text-red-500 text-center py-2">Gagal memuat data.</p>';
    }
}

document.getElementById('form-invite-group')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = "Mengundang...";

    try {
        const checkboxes = document.querySelectorAll('input[name="invite_members_check"]:checked');
        if(checkboxes.length === 0) { window.showToast("Pilih minimal 1 teman.", "warning"); return; }

        const membersToInsert = [];
        checkboxes.forEach(cb => { membersToInsert.push({ group_id: currentStudyGroupId, user_id: cb.value, role: 'member' }); });

        const { error } = await supabaseClient.from('group_members').insert(membersToInsert);
        if (error) throw error;

        window.closeModal('modal-invite-group');
        window.showToast("Teman berhasil diundang ke grup!", "success");
    } catch (err) {
        console.error(err);
        window.showToast("Gagal mengundang teman.", "error");
    } finally {
        btn.disabled = false; btn.textContent = "Tambahkan ke Grup";
    }
});

/* =======================================
   SISTEM EDIT PROFIL
======================================= */

// 1. Fungsi Membuka Modal & Menarik Data Saat Ini
document.getElementById('btn-edit-profile')?.addEventListener('click', async () => {
    if (!dbUser || !dbUser.id) return;
    
    // Tampilkan Modal
    const modal = document.getElementById('modal-edit-profile');
    if (modal) modal.classList.remove('hidden');

    // Tarik data terbaru dari Supabase
    const { data: userData } = await supabaseClient.from('users').select('*').eq('id', dbUser.id).single();
    if (!userData) return;

    // Masukkan data ke dalam kolom-kolom input
    document.getElementById('edit-full-name').value = userData.full_name || '';
    document.getElementById('edit-role').value = userData.role_title || '';
    document.getElementById('edit-location').value = userData.location || '';
    document.getElementById('edit-university').value = userData.university || '';
    document.getElementById('edit-major').value = userData.major || '';
    document.getElementById('edit-orgs').value = userData.organization_tags || '';
    document.getElementById('edit-target-ipk').value = userData.target_ipk || 4.00;
    document.getElementById('edit-target-grad').value = userData.target_graduation || '';
    document.getElementById('edit-target-study').value = userData.weekly_study_target || 20;
    document.getElementById('edit-github').value = userData.github_url || '';
    document.getElementById('edit-portfolio').value = userData.portfolio_url || '';
});

// duplicate listener removed – only the first handler (defined earlier) is kept


/* =======================================
   SISTEM ONBOARDING (WELCOME SCREEN)
======================================= */

// 1. Fungsi Pengecek: Apakah user ini baru pertama kali login?
window.checkOnboardingStatus = async function() {
    if (!dbUser || !dbUser.id) return;

    // 🔥 KUNCI INGATAN: Kalau barusan sudah klik simpan, JANGAN dimunculkan lagi!
    if (sessionStorage.getItem('sudah_onboarding') === 'true') {
        const obModal = document.getElementById('modal-onboarding');
        if (obModal) obModal.classList.add('hidden');
        return; 
    }
    
    try {
        const { data: userData } = await supabaseClient
            .from('users')
            .select('*') 
            .eq('id', dbUser.id)
            .single();

        // Cek apakah kolom full_name kosong di database
        if (!userData || !userData.full_name) {
            const obModal = document.getElementById('modal-onboarding');
            if (obModal) {
                obModal.classList.remove('hidden');
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        } else {
            if (typeof loadProfileData === 'function') loadProfileData();
        }
    } catch (err) {
        console.error("Gagal mengecek status onboarding:", err);
    }
};

// 2. Fungsi Eksekusi: Menyimpan data saat tombol "Mulai Petualangan" diklik
const formOnboarding = document.getElementById('form-onboarding');
formOnboarding?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dbUser || !dbUser.id) return;

    const btnSubmit = formOnboarding.querySelector('button[type="submit"]');
    const originalText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = 'Memproses... <i data-lucide="loader" class="size-4 animate-spin"></i>';
    btnSubmit.disabled = true;

    const obData = {
        full_name: document.getElementById('ob-name')?.value || '',
        role_title: document.getElementById('ob-role')?.value || '',
        location: document.getElementById('ob-location')?.value || '',
        university: document.getElementById('ob-univ')?.value || '',
        major: document.getElementById('ob-major')?.value || '',
        target_ipk: parseFloat(document.getElementById('ob-ipk')?.value) || 4.00,
        target_graduation: document.getElementById('ob-grad')?.value || ''
    };

    try {
        // 🔥 1. SEMBUNYIKAN FORM SECARA PAKSA & BERI KUNCI INGATAN
        document.getElementById('modal-onboarding').classList.add('hidden');
        sessionStorage.setItem('sudah_onboarding', 'true');

        // 2. Coba simpan ke Supabase
        const { error } = await supabaseClient.from('users').update(obData).eq('id', dbUser.id);
        
        if (error) {
            console.warn("Peringatan: Data belum masuk ke Supabase karena kolom belum dibuat. Form tetap ditutup.");
        } else {
            if (typeof window.showToast === 'function') {
                window.showToast('Selamat datang! Ruang kerjamu sudah siap.', 'success');
            }
        }

        // 3. Segarkan Dashboard (Kali ini aman, tidak akan memicu form muncul lagi!)
        if (typeof loadProfileData === 'function') loadProfileData();
        if (typeof loadDashboardStats === 'function') loadDashboardStats();
        
    } catch (err) {
        console.error("Gagal saat proses onboarding:", err);
    } finally {
        btnSubmit.innerHTML = originalText;
        btnSubmit.disabled = false;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
});

/* =======================================
   PEMICU PAKSA TAB & REFRESH DATA OTOMATIS
======================================= */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            
            // Pemicu Tab Profil
            if (target === 'profile') {
                if (typeof window.loadProfileData === 'function') window.loadProfileData();
                if (typeof window.renderProfileHeatmap === 'function') window.renderProfileHeatmap();
            }
            
            // 🔥 PEMICU BARU: Tab Skripsi / Career (Ganti 'career' sesuai atribut data-target di HTML-mu)
            if (target === 'career' || target === 'thesis') {
                if (typeof window.loadThesisData === 'function') window.loadThesisData();
            }

            // Pemicu Tab Workspace
            if (target === 'workspace') {
                if (typeof window.loadWorkspacePages === 'function') window.loadWorkspacePages();
            }
        });
    });

    // Panggil sekali saat web pertama kali direfresh agar langsung termuat
    // Panggil sekali saat web pertama kali direfresh agar langsung termuat
    setTimeout(async () => {
        try {
            // 🔥 Menggunakan AWAIT agar sistem benar-benar menunggu proses download data selesai
            if (typeof window.loadThesisData === 'function') await window.loadThesisData();
            
            // Memancing data Keuangan & IPK
            if (typeof window.loadFinanceData === 'function') await window.loadFinanceData(); 
            if (typeof window.loadIpData === 'function') await window.loadIpData();
            if (typeof window.loadGpaData === 'function') await window.loadGpaData(); 

            // SETELAH SEMUA DATA SELESAI DIDOWNLOAD, BARU RENDER DASHBOARD
            if (typeof window.updateDashboardStats === 'function') window.updateDashboardStats();
            if (typeof window.renderDashboard === 'function') window.renderDashboard();
            
        } catch (error) {
            console.error("Gagal memancing data awal:", error);
        }
    }, 1500); // Jeda 1.5 detik menunggu proses login selesai
});

/* =======================================
   🔥 PEMICU PAKSA TAB PROFIL
======================================= */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (target === 'profile') {
                if (typeof window.loadProfileData === 'function') window.loadProfileData();
                if (typeof window.renderProfileHeatmap === 'function') window.renderProfileHeatmap();
            }
        });
    });
});

/* =======================================
   SISTEM HALAMAN PENGATURAN (FULLY FUNCTIONAL)
======================================= */
document.addEventListener('DOMContentLoaded', () => {

    // ... (di dalam DOMContentLoaded) ...

    // 1. JALANKAN TEMA SAAT PERTAMA DIBUKA
    const savedColor = localStorage.getItem('app_theme_color') || 'emerald';
    const savedDark = localStorage.getItem('app_dark_mode') === 'true';
    const savedLang = localStorage.getItem('app_language') || 'id';
    
    applyThemeColor(savedColor);
    applyDarkMode(savedDark);
    applyLanguage(savedLang);

    // 2. KLIK WARNA TEMA
    const colorBtns = document.querySelectorAll('.theme-color-btn');
    colorBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const color = e.target.dataset.color;
            localStorage.setItem('app_theme_color', color);
            applyThemeColor(color); // <-- Panggil Mesin Warna
            if(typeof window.showToast === 'function') window.showToast('Warna tema berhasil diubah!', 'success');
        });
    });

    // 3. KLIK MODE GELAP/TERANG
    document.getElementById('btn-theme-light')?.addEventListener('click', () => {
        localStorage.setItem('app_dark_mode', 'false');
        applyDarkMode(false); // <-- Panggil Mesin Gelap
    });

    document.getElementById('btn-theme-dark')?.addEventListener('click', () => {
        localStorage.setItem('app_dark_mode', 'true');
        applyDarkMode(true); // <-- Panggil Mesin Gelap
    });

    // 4. KLIK BAHASA
    const langRadios = document.querySelectorAll('input[name="lang"]');
    langRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const lang = e.target.value;
                localStorage.setItem('app_language', lang);
                applyLanguage(lang); // <-- Panggil Mesin Bahasa
                if(typeof window.showToast === 'function') window.showToast('Language updated!', 'success');
            }
        });
    });

    // 5. KLIK ATUR POSISI APP GATEWAY
    document.getElementById('btn-edit-layout')?.addEventListener('click', () => {
        enableAppGatewayDragDrop(); // <-- Aktifkan fitur seret (Drag & Drop)
        if(typeof window.showToast === 'function') {
            window.showToast('Mode Edit aktif! Pergi ke "Semua Aplikasi" lalu seret kotak aplikasinya untuk mengatur posisi.', 'success');
        }
    });

    // 5. FUNGSI FORM LAPORAN/FEEDBACK
    const formFeedback = document.getElementById('form-feedback');
    if (formFeedback) {
        formFeedback.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = formFeedback.querySelector('button');
            const originalText = btn.textContent;
            
            btn.innerHTML = 'Mengirim Laporan... <i data-lucide="loader" class="size-4 animate-spin inline-block ml-1"></i>';
            btn.disabled = true;
            if(typeof lucide !== 'undefined') lucide.createIcons();

            setTimeout(() => {
                if (typeof window.showToast === 'function') window.showToast('Laporan berhasil terkirim ke Tim Developer!', 'success');
                formFeedback.reset();
                btn.textContent = originalText;
                btn.disabled = false;
            }, 1200);
        });
    }
});

// 6. FUNGSI BUKA MODAL DOKUMEN LEGAL
window.openLegalModal = function(type) {
    const titleEl = document.getElementById('legal-title');
    const contentEl = document.getElementById('legal-content');
    
    if (type === 'about') {
        titleEl.innerHTML = `<i data-lucide="info" class="size-5 text-indigo-500"></i> Tentang Aplikasi`;
        contentEl.innerHTML = `
            <p><strong>Student Workspace v2.1.0</strong> adalah sebuah platform produktivitas all-in-one yang dirancang secara spesifik untuk membantu mahasiswa mengelola kehidupan akademik mereka.</p>
            <p>Dibangun dengan arsitektur modern (JavaScript & Supabase), aplikasi ini mengintegrasikan pelacakan nilai (IPK Tracker), manajemen keuangan, manajemen waktu (Pomodoro), serta fitur sosial kolaboratif (Study Room).</p>
            <p>Misi kami adalah mendigitalkan dan menyederhanakan kehidupan kampus agar kamu bisa lebih fokus meraih mimpimu.</p>
        `;
    } 
    else if (type === 'privacy') {
        titleEl.innerHTML = `<i data-lucide="shield-check" class="size-5 text-indigo-500"></i> Kebijakan Privasi`;
        contentEl.innerHTML = `
            <p><strong>1. Pengumpulan Data</strong><br>Kami hanya mengumpulkan data yang relevan dengan akunmu (Nama, Universitas, Jurusan, Nilai Akademik) yang diinputkan secara sukarela melalui formulir di dalam aplikasi.</p>
            <p><strong>2. Keamanan Data</strong><br>Seluruh data diamankan menggunakan Row Level Security (RLS) dari Supabase PostgreSQL, yang artinya data milikmu tidak dapat diakses atau dibaca oleh pengguna lain di dalam sistem ini.</p>
            <p><strong>3. Penggunaan Pihak Ketiga</strong><br>Kami tidak akan pernah menjual, menyewakan, atau mendistribusikan data akademik pribadimu kepada pihak ketiga manapun tanpa persetujuan eksplisit darimu.</p>
        `;
    } 
    else if (type === 'terms') {
        titleEl.innerHTML = `<i data-lucide="file-signature" class="size-5 text-indigo-500"></i> Syarat & Ketentuan`;
        contentEl.innerHTML = `
            <p><strong>1. Penggunaan Layanan</strong><br>Dengan menggunakan layanan ini, Anda setuju untuk menggunakan aplikasi ini untuk tujuan produktivitas akademik yang sah dan tidak menyalahgunakan celah keamanan apapun.</p>
            <p><strong>2. Kepemilikan Akun</strong><br>Anda bertanggung jawab penuh atas keamanan kata sandi Anda. Tim Developer tidak bertanggung jawab atas kerugian data akibat kelalaian pembagian kredensial masuk.</p>
            <p><strong>3. Ketersediaan Layanan</strong><br>Mengingat aplikasi ini masih berada di fase Beta, kami berhak melakukan pemeliharaan server secara berkala yang mungkin menyebabkan aplikasi tidak dapat diakses untuk sementara waktu.</p>
        `;
    }
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
    if(typeof window.openModal === 'function') window.openModal('modal-legal');
}

// --- A. MESIN WARNA AKSEN ---
window.applyThemeColor = function(colorName) {
    const colors = {
        'emerald': { main: '#10b981', rgb: '16, 185, 129' },
        'indigo':  { main: '#6366f1', rgb: '99, 102, 241' },
        'blue':    { main: '#3b82f6', rgb: '59, 130, 246' }, 
        'orange':  { main: '#f76703', rgb: '247, 103, 3' }, 
        'rose':    { main: '#f43f5e', rgb: '244, 63, 94' }
    };
    const theme = colors[colorName] || colors['emerald'];
    
    let styleTag = document.getElementById('dynamic-theme-color');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-theme-color';
        document.head.appendChild(styleTag);
    }
    
    styleTag.innerHTML = `
        :root {
            --theme-main: ${theme.main};
            --theme-rgb: ${theme.rgb}; 
            --theme-active-bg: rgba(${theme.rgb}, 0.1); 
        }

        .bg-primary, .bg-indigo-600, .bg-emerald-500, .bg-emerald-600 { background-color: var(--theme-main) !important; color: #fff !important; border-color: var(--theme-main) !important; }
        .text-primary, .text-indigo-600, .text-emerald-500, .text-emerald-600 { color: var(--theme-main) !important; }
        .bg-indigo-50, .bg-emerald-50 { background-color: var(--theme-active-bg) !important; color: var(--theme-main) !important; border-color: rgba(var(--theme-rgb), 0.2) !important; }
        .border-indigo-500, .border-emerald-500 { border-color: var(--theme-main) !important; }
        
        /* 🔥 GAYA KAPSUL AKTIF KHUSUS SIDEBAR (Terang & Gelap) 🔥 */
        #sidebar .nav-btn.active { 
            background-color: var(--theme-active-bg) !important; 
            color: var(--theme-main) !important; 
            font-weight: 800 !important; 
            border-radius: 9999px !important; /* Kapsul Lonjong */
            border: none !important; 
            box-shadow: none !important;
            margin-right: 8px !important; 
        }
        #sidebar .nav-btn.active i { color: var(--theme-main) !important; }
        #sidebar .nav-btn.active::before, #sidebar .nav-btn.active::after { display: none !important; }
    `;
};

// --- B. MESIN MODE GELAP (UPDATE: FIX KEPALA & KAKI POP-UP/MODAL) ---
window.applyDarkMode = function(isDark) {
    let styleTag = document.getElementById('dynamic-dark-mode');
    if (isDark) {
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-dark-mode';
            document.head.appendChild(styleTag);
        }
        document.body.classList.add('dark');
        
        styleTag.innerHTML = `
            /* 1. BACKGROUND UTAMA SOLID */
            body.dark, body.dark main, body.dark .bg-gray-50, body.dark .bg-gray-100 { 
                background-color: #0B0D14 !important; 
                color: #E2E8F0 !important; 
            }
            
            /* 2. SECTION WRAPPER & KARTU */
            body.dark .content-section > .bg-white,
            body.dark .content-section > div {
                background-color: #131620 !important; 
                border: 1px solid rgba(var(--theme-rgb), 0.15) !important; 
                border-radius: 1.5rem !important; 
                padding: 1.75rem !important; 
                margin-bottom: 1.75rem !important; 
                box-shadow: 0 10px 30px -5px rgba(0,0,0,0.4) !important;
            }
            
            body.dark .app-card, body.dark .border-border, body.dark .shadow-sm { 
                background-color: #1A1D29 !important; 
                border-color: rgba(var(--theme-rgb), 0.1) !important;
                color: #FFFFFF !important; 
            }
            body.dark .app-card { border-radius: 1.25rem !important; }

            /* 3. HEADER, FOOTER, & SIDEBAR (Tetap Tajam/Siku) */
            body.dark header, body.dark footer, body.dark aside#sidebar {
                background-color: #131620 !important;
                border-radius: 0 !important; 
                border: none !important;
                box-shadow: none !important;
            }
            body.dark header { border-bottom: 1px solid rgba(var(--theme-rgb), 0.1) !important; }
            body.dark footer { border-top: 1px solid rgba(var(--theme-rgb), 0.1) !important; }
            body.dark aside#sidebar { border-right: 1px solid rgba(var(--theme-rgb), 0.1) !important; }
            
            /* 4. MATIKAN GRADASI SILAU */
            body.dark .bg-gradient-to-r {
                background: #1A1D29 !important;
                background-image: none !important; 
                border: 1px solid rgba(var(--theme-rgb), 0.15) !important;
                border-radius: 1.25rem !important; 
            }
            
            /* 5. WARNA TEKS OTOMATIS */
            body.dark h1, body.dark h2, body.dark h3, body.dark h4, body.dark p.text-gray-800, body.dark p.text-gray-900, body.dark span.text-gray-800, body.dark span.text-gray-700, body.dark .text-foreground { color: #FFFFFF !important; }
            body.dark p.text-gray-500, body.dark span.text-gray-500, body.dark .text-secondary { color: #8B949E !important; }
            
            /* 6. INPUT & FORM */
            body.dark input, body.dark select, body.dark textarea { 
                background-color: #0B0D14 !important; 
                border: 1px solid rgba(var(--theme-rgb), 0.2) !important; 
                border-radius: 0.75rem !important;
                color: #FFFFFF !important; 
            }
            
            /* 7. EFEK HOVER UMUM */
            body.dark .hover\\:bg-gray-50:hover, body.dark .hover\\:bg-gray-100:hover, body.dark tr:hover { 
                background-color: rgba(var(--theme-rgb), 0.08) !important; 
            }
            
            /* 8. HANYA TARGETKAN TOMBOL YANG "TIDAK AKTIF" */
            body.dark #sidebar .nav-btn:not(.active) {
                background-color: transparent !important;
                box-shadow: none !important;
                border: none !important;
                color: #8B949E !important;
            }
            body.dark #sidebar .nav-btn:not(.active) i {
                color: #8B949E !important;
            }
            
            body.dark #sidebar .nav-btn:not(.active):hover {
                background-color: rgba(255,255,255,0.05) !important;
                color: #FFFFFF !important;
            }

            /* 9. PASTIKAN TOMBOL "AKTIF" MENYALA SESUAI TEMA DI MODE GELAP */
            body.dark #sidebar .nav-btn.active {
                background-color: var(--theme-active-bg) !important;
                color: var(--theme-main) !important;
            }
            body.dark #sidebar .nav-btn.active i {
                color: var(--theme-main) !important;
            }

            /* 🔥 10. SAPU BERSIH WARNA POP-UP / MODAL 🔥 */
            /* Targetkan kotak utama modal (Header & Footer) agar ikut gelap pekat */
            body.dark [id^="modal-"] > div.bg-white,
            body.dark .fixed > .bg-white {
                background-color: #1A1D29 !important;
                border: 1px solid rgba(var(--theme-rgb), 0.2) !important;
                color: #FFFFFF !important;
            }
            /* Ubah warna garis pemisah header & footer modal */
            body.dark [id^="modal-"] .border-b,
            body.dark [id^="modal-"] .border-t {
                border-color: rgba(var(--theme-rgb), 0.15) !important;
            }
            /* Ubah tombol 'Saya Mengerti' menjadi warna aksen tema yang menyala! */
            body.dark [id^="modal-"] button.bg-gray-800 {
                background-color: var(--theme-main) !important;
                color: #fff !important;
                border: none !important;
            }
            /* Perbaiki warna icon tombol silang (Close) saat di-hover */
            body.dark [id^="modal-"] button.text-gray-400:hover {
                color: #f87171 !important; /* Merah menyala agar mudah terlihat */
            }
        `;
    } else {
        document.body.classList.remove('dark');
        if (styleTag) styleTag.remove();
    }
};

/* =======================================
   MESIN BAHASA GLOBAL (i18n ENGINE 100%)
======================================= */
window.i18nKamus = {
    // 🇮🇩 INDONESIA (Default)
    'id': { 
        'nav_apps': 'Semua Aplikasi', 'nav_dash': 'Dashboard Analitik', 'nav_study': 'Study Room & Friends', 'nav_set': 'Pengaturan',
        'prof_edit': 'Edit Profil', 'prof_active': 'Mahasiswa Aktif', 
        'prof_aca': 'Etalase Akademik', 'prof_uni': 'Universitas', 'prof_major': 'Program Studi', 'prof_stat': 'Status', 'prof_org': 'Aktivitas & Organisasi', 'prof_nodata': 'Belum ada data',
        'prof_vision': 'Papan Visi', 'prof_tar_ipk': 'Target IPK Kelulusan', 'prof_est': 'Estimasi Kelulusan', 'prof_tar_study': 'Target Belajar Mingguan', 'prof_hr': 'Jam',
        'prof_track': 'Rekam Jejak Aktivitas', 'prof_track_desc': 'Konsistensimu menyelesaikan target harian dalam 3 bulan terakhir.', 'prof_chill': 'Santai', 'prof_fire': 'On Fire!', 'prof_load': 'Merakit Data...',
        'nav_profile': 'Lihat Profil',
        'header_greeting': 'Selamat datang kembali!', 'header_online': 'Online',
        'notif_title': 'Notifikasi', 'notif_read': 'Tandai Dibaca', 'notif_empty': 'Belum ada notifikasi.',
        
        'app_super_dash': 'Super Dashboard', 'app_super_desc': 'Akses seluruh alat produktivitasmu dalam satu tempat. Mulai dari manajemen tugas, catatan kuliah, hingga persiapan karir.',
        'app_cat_premium': 'Aplikasi Premium (AI Powered)', 'app_cat_daily': 'Produktivitas Harian', 'app_cat_admin': 'Administrasi & Lainnya',
        'app_studyopang': 'StudyWithOpang', 'app_studyopang_desc': 'Asisten belajar AI. Upload materi, otomatis jadi Rangkuman, Mind Map, dan Kuis.',
        'app_prediksi': 'Prediksi Soal', 'app_prediksi_desc': 'Analisis pola soal ujian tahun lalu untuk memprediksi soal yang akan keluar.',
        'app_skripsi': 'Bimbingan Skripsi', 'app_skripsi_desc': 'Asisten AI penyusun struktur bab skripsi dan gap penelitian.',
        'app_leader': 'Leaderboard', 'app_leader_desc': 'Top 50 Pelajar',
        'app_title': 'App Gateway', 'app_desc': 'Akses cepat ke semua alat produktivitasmu. Tarik dan lepas (drag & drop) kotak di bawah untuk mengatur posisi.',
        'app_1': 'Pomodoro Timer', 'app_1_desc': 'Timer lofi & fokus.', 'app_2': 'To-Do List', 'app_2_desc': 'Manajemen tugas.', 'app_3': 'Habit Tracker', 'app_3_desc': 'Pelacak rutinitas.', 'app_4': 'IP Tracker', 'app_4_desc': 'Hitung IPK', 
        'app_5': 'Keuangan', 'app_5_desc': 'Catat Arus Kas', 'app_6': 'Roadmap', 'app_6_desc': 'Target Semester', 'app_7': 'Ruang Kerja', 'app_7_desc': 'Catatan & Proyek (Notion Style).', 'app_8': 'Drive', 'app_8_desc': 'Penyimpanan file kuliah.', 'app_9': 'Kalender', 'app_9_desc': 'Jadwal & Reminder.',
        
        'ws_mypages': 'Halaman Saya', 'ws_tip': 'Tip: Klik + untuk buat halaman baru.', 'ws_empty': 'Pilih atau buat halaman untuk memulai.',
        
        'dr_title': 'Penyimpanan Drive', 'dr_search': 'Cari file/folder...', 'dr_new': 'Baru', 'dr_new_folder': 'Folder Baru', 'dr_up_file': 'Upload File', 'dr_up_folder': 'Upload Folder',
        
        'cal_today': 'Hari Ini', 'cal_month': 'Bulan', 'cal_day': 'Hari', 'cal_create': 'Buat',
        'cal_sun': 'MNG', 'cal_mon': 'SEN', 'cal_tue': 'SEL', 'cal_wed': 'RAB', 'cal_thu': 'KAM', 'cal_fri': 'JUM', 'cal_sat': 'SAB',
        
        'hb_desc': 'Bangun kebiasaan baik setiap harinya.', 'hb_new': 'Habit Baru', 'hb_daily': 'Rutinitas Harian', 'hb_all': 'Lihat Semua', 'hb_pop': 'Paket Rutinitas Populer',
        
        'td_desc': 'Manajemen tugas dan deadline-mu.', 'td_new': 'Tugas Baru', 'td_list': 'Daftar Tugas Prioritas', 'td_active': 'Aktif', 'td_add': '+ Tambah Tugas Baru',
        
        'rm_title': 'Peta Perjalanan Studi', 'rm_desc': 'Visualisasikan target semestermu.', 'rm_add': 'Tambah Target',
        
        'dash_title': 'Ringkasan Analitik', 'dash_desc': 'Statistik produktivitas dan pencapaian belajarmu di Student Workspace.',
        'stat_xp': 'TOTAL POIN / XP', 'stat_rank': 'GLOBAL RANK', 'stat_rank_sub': 'Dari Seluruh User', 'stat_pomo': 'FOKUS POMODORO', 'stat_pomo_sub': 'Sesi Terselesaikan', 'stat_pred': 'PREDIKSI UJIAN AI', 'stat_pred_sub': 'Koleksi Dibuat',
        'stat_skripsi': 'PROYEK SKRIPSI', 'stat_skripsi_sub': 'Dokumen Riset', 'stat_drive': 'DRIVE STORAGE', 'stat_drive_sub': 'File Terunggah', 'stat_workspace': 'RUANG KERJA', 'stat_work_sub': 'Catatan & Board', 'stat_cal': 'AGENDA KALENDER', 'stat_cal_sub': 'Event Tersimpan',
        'stat_done': 'TUGAS SELESAI', 'stat_done_sub': 'To-Do Terselesaikan', 'stat_pend': 'TUGAS PENDING', 'stat_pend_sub': 'Menunggu Eksekusi', 'stat_fin': 'SALDO KEUANGAN', 'stat_fin_sub': 'Sisa Anggaran Aktif', 'stat_ipk': 'IPK SAAT INI', 'stat_ipk_sub': 'Skala 4.00',
        
        'fin_title': 'Siakunt (Keuangan)', 'fin_rab': 'Rencana Anggaran', 'fin_new': 'Transaksi Baru', 'fin_in': 'Pemasukan', 'fin_out': 'Pengeluaran', 'fin_bal': 'Saldo',
        'fin_date': 'Tanggal', 'fin_desc': 'Keterangan', 'fin_amount': 'Jumlah', 'fin_action': 'Aksi',
        
        'ip_title': 'Kalkulator IPK', 'ip_add': 'Tambah Nilai', 'ip_cum': 'IP Kumulatif', 'ip_sks': 'Total SKS',
        
        'pomo_title': 'Fokus Belajar', 'pomo_desc': 'Selesaikan sesi (25 Menit) = +10 Poin!', 'pomo_start': 'Start', 'pomo_reset': 'Reset',
        
        'lb_title': 'Leaderboard', 'lb_desc': 'Top 50 pelajar terbaik', 'lb_xp': 'Total XP', 'lb_streak': 'Streak',
        
        'sr_desc': 'Cari teman, buat grup, dan kolaborasi tugas bersama.', 'sr_friends': 'Teman', 'sr_groups': 'Grup Belajar', 'sr_search': 'Cari Teman (Username / UID)', 'sr_search_ph': 'Masukkan ID/Nama...', 'sr_req': 'Permintaan Teman', 'sr_req_empty': 'Tidak ada permintaan baru.', 'sr_list': 'Daftar Teman', 'sr_list_empty': 'Belum ada teman. Ayo cari teman belajar!', 'sr_grp_new': 'Bentuk Grup Baru', 'sr_chat_ph': 'Ketik pesan...', 'sr_board': 'Papan Tugas', 'sr_invite': 'Undang Teman',
        
        'so_desc': 'Ruang belajar terpadu ditenagai oleh AI.', 'so_tab_doc': 'Dokumen', 'so_tab_note': 'Note & Tutor', 'so_tab_mm': 'Mind Map', 'so_tab_fc': 'Flashcards', 'so_tab_quiz': 'Kuis AI',
        'so_up_title': 'Upload Materi Kuliah', 'so_up_desc': 'Upload PDF/TXT/Foto materi. AI akan menyulapnya menjadi Catatan, Mind Map, Flashcards, dan Kuis.', 'so_btn_analisa': 'Mulai Analisis Dokumen', 'so_up_support': 'Mendukung: PDF, TXT, PNG, JPG.',
        
        'pr_title': 'Prediksi Soal Ujian', 'pr_desc': 'Analisis pola soal lama dengan Machine Learning.', 'pr_col_title': 'Koleksi Prediksi', 'pr_btn_new': 'Buat Prediksi', 'pr_empty': 'Belum ada prediksi ujian. Klik "+ Buat Prediksi" untuk mulai menganalisis.',
        'th_title': 'Proyek Anda', 'th_desc': 'Kelola dan atur struktur skripsi Anda', 'th_btn_new': 'Proyek Baru',
        
        'set_title': 'Pengaturan Sistem', 'set_desc': 'Sesuaikan tampilan, bahasa, dan preferensi aplikasimu di sini.', 'set_theme': 'Personalisasi & Tampilan', 'set_mode': 'Mode Tampilan', 'set_mode_desc': 'Pilih tema terang atau gelap.', 'set_light': 'Terang', 'set_dark': 'Gelap', 'set_color': 'Warna Aksen Utama', 'set_color_desc': 'Warna dominan untuk tombol.', 'set_lang': 'Bahasa Aplikasi', 'set_info': 'Informasi & Legal', 'set_about': 'Tentang Aplikasi', 'set_privacy': 'Kebijakan Privasi', 'set_terms': 'Syarat & Ketentuan',
        
        // Kunci Bantuan & Laporan Baru
        'help_title': 'Bantuan & Laporan',
        'help_category_label': 'Kategori Pesan',
        'help_cat_bug': 'Laporkan Bug / Error',
        'help_cat_feature': 'Saran Fitur Baru',
        'help_cat_other': 'Lainnya',
        'help_msg_label': 'Pesan Anda',
        'help_msg_placeholder': 'Jelaskan secara detail...',
        'help_btn_send': 'Kirim Laporan',
        'help_faq_title': 'FAQ (Pertanyaan Umum)',
        'faq_1_q': 'Data saya disimpan di mana?',
        'faq_1_a': 'Seluruh data Anda disimpan secara aman menggunakan sistem cloud database (Supabase) dengan enkripsi standar industri.',
        'faq_2_q': 'Apakah aplikasi ini gratis?',
        'faq_2_a': 'Ya, saat ini semua fitur dasar dapat digunakan secara gratis untuk membantu produktivitas belajar Anda.',
        'faq_3_q': 'Bagaimana cara menggunakan fitur AI?',
        'faq_3_a': 'Anda cukup memasukkan instruksi atau file ke dalam form yang tersedia, lalu sistem AI kami akan otomatis memproses dan memberikan hasilnya.',

        'about_p1': 'Student Workspace v2.1.0 adalah sebuah platform produktivitas all-in-one yang dirancang secara spesifik untuk membantu mahasiswa mengelola kehidupan akademik mereka.',
        'about_p2': 'Dibangun dengan arsitektur modern (JavaScript & Supabase), aplikasi ini mengintegrasikan pelacakan nilai (IPK Tracker), manajemen keuangan, manajemen waktu (Pomodoro), serta fitur sosial kolaboratif (Study Room).',
        'about_p3': 'Misi kami adalah mendigitalkan dan menyederhanakan kehidupan kampus agar kamu bisa lebih fokus meraih mimpimu.',
        'priv_t1': '1. Pengumpulan Data',
        'priv_d1': 'Kami hanya mengumpulkan data yang relevan dengan akunmu (Nama, Universitas, Jurusan, Nilai Akademik) yang diinputkan secara sukarela melalui formulir di dalam aplikasi.',
        'priv_t2': '2. Keamanan Data',
        'priv_d2': 'Seluruh data diamankan menggunakan Row Level Security (RLS) dari Supabase PostgreSQL, yang artinya data milikmu tidak dapat diakses atau dibaca oleh pengguna lain di dalam sistem ini.',
        'priv_t3': '3. Penggunaan Pihak Ketiga',
        'priv_d3': 'Kami tidak akan pernah menjual, menyewakan, atau mendistribusikan data akademik pribadimu kepada pihak ketiga manapun tanpa persetujuan eksplisit darimu.',
        'term_t1': '1. Penggunaan Layanan',
        'term_d1': 'Dengan menggunakan layanan ini, Anda setuju untuk menggunakan aplikasi ini untuk tujuan produktivitas akademik yang sah dan tidak menyalahgunakan celah keamanan apapun.',
        'term_t2': '2. Kepemilikan Akun',
        'term_d2': 'Anda bertanggung jawab penuh atas keamanan kata sandi Anda. Tim Developer tidak bertanggung jawab atas kerugian data akibat kelalaian pembagian kredensial masuk.',
        'term_t3': '3. Ketersediaan Layanan',
        'term_d3': 'Mengingat aplikasi ini masih berada di fase Beta, kami berhak melakukan pemeliharaan server secara berkala yang mungkin menyebabkan aplikasi tidak dapat diakses untuk sementara waktu.',

        'btn_back': 'Kembali', 'btn_understand': 'Saya Mengerti', 'btn_save': 'Simpan', 'btn_cancel': 'Batal', 'btn_close': 'Tutup', 'toast_lang': 'Bahasa berhasil diperbarui!',
        'm_th_title': 'Buat Proyek Skripsi Baru', 'm_th_sub': 'AI akan menyusun struktur penelitianmu.', 'm_th_l1': 'Judul Penelitian', 'm_th_p1': 'Cth: Pengaruh AI terhadap...', 'm_th_l2': 'Rumusan Masalah Utama', 'm_th_p2': 'Cth: Bagaimana tingkat akurasi...', 'm_th_l3': 'Tujuan Penelitian', 'm_th_p3': 'Cth: Untuk mengetahui efektivitas...', 'm_th_l4': 'Metodologi (Singkat)', 'm_th_p4': 'Cth: Kuantitatif Kuesioner', 'm_th_btn': 'Buat Struktur (AI)',
        'm_fd_title': 'Buat Folder Baru', 'm_fd_ph': 'Nama Folder', 'm_fd_btn': 'Buat Folder',
        'm_up_title': 'Upload File', 'm_up_l1': 'Pilih File dari Komputer', 'm_up_l2': 'Simpan Sebagai (Nama File)', 'm_up_p2': 'Contoh: Tugas_Akhir.pdf', 'm_up_btn': 'Upload ke Drive',
        'm_prg_title': 'Mengunggah...', 'm_prg_text': 'Menyiapkan file...',
        'm_cal_pt': 'Tambahkan judul', 'm_cal_tz': 'Zona Waktu • Tidak berulang', 'm_cal_pl': 'Tambahkan lokasi', 'm_cal_pd': 'Tambahkan deskripsi', 'm_cal_col': 'Warna event', 'm_cal_b1': '30 menit sebelum', 'm_cal_b2': '1 jam sebelum', 'm_cal_opt': 'Opsi lainnya', 'm_cal_save': 'Simpan',
        'm_pr_title': 'Buat Prediksi Soal Baru', 'm_pr_info': 'Upload soal-soal ujian sebelumnya dan AI akan menganalisis pola untuk membuat prediksi soal ujian berikutnya.', 'm_pr_l1': 'Judul Koleksi', 'm_pr_p1': 'Cth: Prediksi Kalkulus 2026', 'm_pr_l2': 'Mata Pelajaran/Kuliah', 'm_pr_p2': 'Cth: Matematika Lanjut', 'm_pr_l3': 'Jenis Ujian (Tingkat Kesulitan AI)', 'm_pr_o1': 'Latihan (Dasar / Mudah)', 'm_pr_o2': 'Kuis (Menengah)', 'm_pr_o3': 'UTS (Sulit)', 'm_pr_o4': 'UAS (Sangat Sulit)', 'm_pr_l4': 'Upload Soal Lama (Konteks AI)', 'm_pr_sup': '*Mendukung Foto (JPG/PNG), PDF, atau TXT.', 'm_pr_btn': 'Lanjut Analisis',
        'm_gt_title': 'Buat Tugas Grup', 'm_gt_l1': 'Nama Tugas / Pekerjaan', 'm_gt_p1': 'Cth: Buat PPT Bab 1', 'm_gt_l2': 'Delegasikan Kepada (Member)', 'm_gt_btn': 'Tambahkan Tugas',
        'm_inv_title': 'Undang Teman', 'm_inv_sub': 'Pilih teman untuk ditambahkan ke grup ini:', 'm_inv_btn': 'Tambahkan ke Grup',
        'm_rab_title': 'Tabel Rencana Anggaran (RAB)', 'm_rab_sub': 'Prediksi pengeluaran bulananmu di sini.', 'm_rab_add': 'Tambah Baris', 'm_rab_th1': 'Nama Kebutuhan / Item', 'm_rab_th2': 'Estimasi Biaya (Rp)', 'm_rab_tot': 'TOTAL ESTIMASI:', 'm_rab_btn': 'Simpan RAB',
        'm_usr_xp': 'Total XP', 'm_usr_lvl': 'Level', 'm_usr_add': 'Tambah Teman',
        'm_cg_title': 'Bentuk Grup', 'm_cg_l1': 'Nama Grup / Ruang Belajar', 'm_cg_p1': 'Cth: Pejuang Skripsi 2026', 'm_cg_l2': 'Deskripsi / Tujuan Grup', 'm_cg_p2': 'Cth: Tempat mabar dan belajar', 'm_cg_l3': 'Undang Teman ke Grup', 'm_cg_btn': 'Bentuk Sekarang',
        'm_hb_title': 'Buat Habit', 'm_hb_ph': 'Check-in Harian', 'm_hb_fq': 'Frekuensi', 'm_hb_f1': 'Harian', 'm_hb_f2': 'Mingguan', 'm_hb_f3': 'Pilih Hari (Kustom)', 'm_hb_f4': 'Interval', 'm_hb_gl': 'Target', 'm_hb_g1': 'Selesaikan semua', 'm_hb_g2': 'Kali per hari', 'm_hb_g3': 'Kali', 'm_hb_sd': 'Tanggal Mulai', 'm_hb_gd': 'Hari Target', 'm_hb_gd1': 'Selamanya', 'm_hb_gd2': '7 hari', 'm_hb_gd3': '21 hari', 'm_hb_gd4': '30 hari', 'm_hb_gd5': '100 hari', 'm_hb_gd6': 'Kustom', 'm_hb_gdp': 'Masukkan hari (cth: 14)', 'm_hb_sec': 'Kategori', 'm_hb_s1': 'Belajar', 'm_hb_s2': 'Kesehatan', 'm_hb_s3': 'Lainnya', 'm_hb_tm': 'Waktu', 'm_hb_t1': 'Kapan saja', 'm_hb_t2': 'Pagi', 'm_hb_t3': 'Siang', 'm_hb_t4': 'Malam', 'm_hb_rem': 'Pengingat', 'm_hb_chk': 'Pop-up log habit otomatis',
        'm_ob_t1': 'Selamat Datang! 👋', 'm_ob_s1': 'Mari siapkan ruang kerjamu sebelum memulai.', 'm_ob_h1': 'Siapa Kamu?', 'm_ob_l1': 'Nama Lengkap / Panggilan', 'm_ob_p1': 'Cth: Nouval', 'm_ob_l2': 'Spesialisasi / Gelar Masa Depan', 'm_ob_p2': 'Cth: Full-stack Developer', 'm_ob_l3': 'Domisili (Kota)', 'm_ob_p3': 'Cth: Semarang', 'm_ob_h2': 'Kampus & Visi', 'm_ob_l4': 'Nama Universitas', 'm_ob_p4': 'Cth: Universitas Negeri Semarang', 'm_ob_l5': 'Program Studi', 'm_ob_p5': 'Cth: Teknik Informatika', 'm_ob_l6': 'Target IPK', 'm_ob_l7': 'Tahun Lulus', 'm_ob_btn': 'Mulai Petualangan', 'm_ob_nt': '* Data ini bisa kamu ubah kapan saja nanti di menu Pengaturan Profil.',
        'm_ep_t1': 'Edit Informasi Profil', 'm_ep_h1': 'Identitas Diri', 'm_ep_pic': 'Foto Profil', 'm_ep_pic_n': 'Format JPG/PNG maks 2MB.', 'm_ep_l1': 'Username (Tanpa @)', 'm_ep_l2': 'Role / Spesialisasi', 'm_ep_h2': 'Informasi Akademik', 'm_ep_l3': 'Tag Organisasi (Pisahkan dengan koma)', 'm_ep_p3': 'Cth: HIMA Sinergi', 'm_ep_h3': 'Target & Jejak Digital', 'm_ep_l4': 'Bulan/Tahun Lulus', 'm_ep_p4': 'Cth: Agustus 2026', 'm_ep_l5': 'Target Jam/Minggu', 'm_ep_l6': 'URL GitHub', 'm_ep_l7': 'URL Portfolio', 'm_ep_sv': 'Simpan Perubahan',
        'm_tk_t1': 'Tambah Tugas', 'm_tk_l1': 'Nama Tugas', 'm_tk_l2': 'Deadline', 'm_tk_btn': 'Simpan Tugas',
        'm_fn_t1': 'Tambah Transaksi', 'm_fn_l1': 'Tipe', 'm_fn_o1': 'Pemasukan', 'm_fn_o2': 'Pengeluaran', 'm_fn_l2': 'Jumlah', 'm_fn_l3': 'Keterangan', 'm_fn_btn': 'Simpan Transaksi',
        'm_rm_t1': 'Tambah Target Roadmap', 'm_rm_l1': 'Semester', 'm_rm_l2': 'Target SKS', 'm_rm_l3': 'Pencapaian', 'm_rm_l4': 'Status', 'm_rm_o1': 'Rencana', 'm_rm_o2': 'Berjalan', 'm_rm_o3': 'Selesai', 'm_rm_btn': 'Simpan',
        'm_ip_t1': 'Kalkulasi Mata Kuliah', 'm_ip_l1': 'SKS Matkul', 'm_ip_l2': 'Nama Mata Kuliah', 'm_ip_l3': 'Aspek Penilaian (Total Wajib 100%)', 'm_ip_add': '+ Tambah Aspek', 'm_ip_tot': 'Total Bobot:', 'm_ip_btn': 'Simpan & Hitung',
        'm_pw_t1': 'Ganti Kata Sandi', 'm_pw_l1': 'Password Baru (Min. 6 Karakter)', 'm_pw_l2': 'Konfirmasi Password Baru', 'm_pw_btn': 'Ubah Password'
    },

    // 🇬🇧 ENGLISH
    'en': { 
        'nav_apps': 'All Apps', 'nav_dash': 'Analytics Dashboard', 'nav_study': 'Study Room', 'nav_set': 'Settings',
        'prof_edit': 'Edit Profile', 'prof_active': 'Active Student', 'prof_aca': 'Academic Showcase', 'prof_uni': 'University', 'prof_major': 'Major', 'prof_stat': 'Status', 'prof_org': 'Activities & Orgs', 'prof_nodata': 'No data available', 'prof_vision': 'Vision Board', 'prof_tar_ipk': 'Target GPA', 'prof_est': 'Graduation Estimate', 'prof_tar_study': 'Weekly Study Target', 'prof_hr': 'Hours', 'prof_track': 'Activity Track Record', 'prof_track_desc': 'Consistency in completing daily targets in the last 3 months.', 'prof_chill': 'Chill', 'prof_fire': 'On Fire!', 'prof_load': 'Assembling Data...',
        'nav_profile': 'View Profile', 'header_greeting': 'Welcome back!', 'header_online': 'Online', 'notif_title': 'Notifications', 'notif_read': 'Mark as Read', 'notif_empty': 'No notifications yet.',
        'app_super_dash': 'Super Dashboard', 'app_super_desc': 'Access all your productivity tools in one place. From task management to career prep.', 'app_cat_premium': 'Premium Apps (AI Powered)', 'app_cat_daily': 'Daily Productivity', 'app_cat_admin': 'Administration & Others',
        'app_studyopang': 'StudyWithOpang', 'app_studyopang_desc': 'AI Study Assistant. Upload materials, auto-generate Summaries, Mind Maps, and Quizzes.', 'app_prediksi': 'Exam Prediction', 'app_prediksi_desc': 'Analyze past exam patterns to predict upcoming questions.', 'app_skripsi': 'Thesis Guidance', 'app_skripsi_desc': 'AI assistant for thesis structure and research gap.', 'app_leader': 'Leaderboard', 'app_leader_desc': 'Top 50 Students',
        'app_title': 'App Gateway', 'app_desc': 'Quick access to all productivity tools. Drag and drop boxes below to arrange positions.',
        'app_1': 'Pomodoro Timer', 'app_1_desc': 'Lofi & focus timer.', 'app_2': 'To-Do List', 'app_2_desc': 'Task management.', 'app_3': 'Habit Tracker', 'app_3_desc': 'Routine tracker.', 'app_4': 'GPA Tracker', 'app_4_desc': 'Calculate GPA', 'app_5': 'Finance', 'app_5_desc': 'Record Cash Flow', 'app_6': 'Roadmap', 'app_6_desc': 'Semester Target', 'app_7': 'Workspace', 'app_7_desc': 'Notes & Projects.', 'app_8': 'Drive', 'app_8_desc': 'College file storage.', 'app_9': 'Calendar', 'app_9_desc': 'Schedule & Reminder.',
        'ws_mypages': 'My Pages', 'ws_tip': 'Tip: Click + to create a new page.', 'ws_empty': 'Select or create a page to start.',
        'dr_title': 'Drive Storage', 'dr_search': 'Search files/folders...', 'dr_new': 'New', 'dr_new_folder': 'New Folder', 'dr_up_file': 'Upload File', 'dr_up_folder': 'Upload Folder',
        'cal_today': 'Today', 'cal_month': 'Month', 'cal_day': 'Day', 'cal_create': 'Create', 'cal_sun': 'SUN', 'cal_mon': 'MON', 'cal_tue': 'TUE', 'cal_wed': 'WED', 'cal_thu': 'THU', 'cal_fri': 'FRI', 'cal_sat': 'SAT',
        'hb_desc': 'Build good habits every day.', 'hb_new': 'New Habit', 'hb_daily': 'Daily Routine', 'hb_all': 'View All', 'hb_pop': 'Popular Routine Packages',
        'td_desc': 'Manage your tasks and deadlines.', 'td_new': 'New Task', 'td_list': 'Priority Task List', 'td_active': 'Active', 'td_add': '+ Add New Task',
        'rm_title': 'Study Journey Map', 'rm_desc': 'Visualize your semester targets.', 'rm_add': 'Add Target',
        'dash_title': 'Analytics Summary', 'dash_desc': 'Productivity statistics and learning achievements.',
        'stat_xp': 'TOTAL POINTS / XP', 'stat_rank': 'GLOBAL RANK', 'stat_rank_sub': 'From All Users', 'stat_pomo': 'POMODORO FOCUS', 'stat_pomo_sub': 'Sessions Completed', 'stat_pred': 'AI EXAM PREP', 'stat_pred_sub': 'Collections Created', 'stat_skripsi': 'THESIS PROJECT', 'stat_skripsi_sub': 'Research Documents', 'stat_drive': 'DRIVE STORAGE', 'stat_drive_sub': 'Files Uploaded', 'stat_workspace': 'WORKSPACE', 'stat_work_sub': 'Notes & Boards', 'stat_cal': 'CALENDAR EVENTS', 'stat_cal_sub': 'Events Saved', 'stat_done': 'TASKS DONE', 'stat_done_sub': 'To-Dos Completed', 'stat_pend': 'TASKS PENDING', 'stat_pend_sub': 'Waiting for Execution', 'stat_fin': 'FINANCE BALANCE', 'stat_fin_sub': 'Active Budget Remaining', 'stat_ipk': 'CURRENT GPA', 'stat_ipk_sub': 'Scale 4.00',
        'fin_title': 'Finance', 'fin_rab': 'Budget Plan', 'fin_new': 'New Transaction', 'fin_in': 'Income', 'fin_out': 'Expense', 'fin_bal': 'Balance', 'fin_date': 'Date', 'fin_desc': 'Description', 'fin_amount': 'Amount', 'fin_action': 'Action',
        'ip_title': 'GPA Calculator', 'ip_add': 'Add Grade', 'ip_cum': 'Cumulative GPA', 'ip_sks': 'Total Credits',
        'pomo_title': 'Study Focus', 'pomo_desc': 'Complete a session (25 Mins) = +10 Points!', 'pomo_start': 'Start', 'pomo_reset': 'Reset',
        'lb_title': 'Leaderboard', 'lb_desc': 'Top 50 best students', 'lb_xp': 'Total XP', 'lb_streak': 'Streak',
        'sr_desc': 'Find friends, create groups, and collaborate.', 'sr_friends': 'Friends', 'sr_groups': 'Study Groups', 'sr_search': 'Search Friends (Username / UID)', 'sr_search_ph': 'Enter ID/Name...', 'sr_req': 'Friend Requests', 'sr_req_empty': 'No new requests.', 'sr_list': 'Friends List', 'sr_list_empty': 'No friends yet. Lets find study buddies!', 'sr_grp_new': 'Create New Group', 'sr_chat_ph': 'Type a message...', 'sr_board': 'Task Board', 'sr_invite': 'Invite Friend',
        'so_desc': 'Integrated study room powered by AI.', 'so_tab_doc': 'Documents', 'so_tab_note': 'Note & Tutor', 'so_tab_mm': 'Mind Map', 'so_tab_fc': 'Flashcards', 'so_tab_quiz': 'AI Quiz', 'so_up_title': 'Upload Study Materials', 'so_up_desc': 'Upload PDF/TXT/Photo. AI will transform it into Notes, Mind Maps, Flashcards, and Quizzes.', 'so_btn_analisa': 'Start Document Analysis', 'so_up_support': 'Supports: PDF, TXT, PNG, JPG.',
        'pr_title': 'Exam Question Prediction', 'pr_desc': 'Analyze past patterns with Machine Learning.', 'pr_col_title': 'Prediction Collection', 'pr_btn_new': 'Create Prediction', 'pr_empty': 'No predictions yet. Click "+ Create Prediction" to start analyzing.',
        'th_title': 'Your Projects', 'th_desc': 'Manage and organize your thesis structure', 'th_btn_new': 'New Project',
        
        'set_title': 'System Settings', 'set_desc': 'Customize your interface, language, and preferences here.', 'set_theme': 'Personalization & Display', 'set_mode': 'Display Mode', 'set_mode_desc': 'Choose light or dark theme.', 'set_light': 'Light', 'set_dark': 'Dark', 'set_color': 'Main Accent Color', 'set_color_desc': 'Dominant color for buttons.', 'set_lang': 'Application Language', 'set_info': 'Information & Legal', 'set_about': 'About App', 'set_privacy': 'Privacy Policy', 'set_terms': 'Terms of Service',
        
        'about_p1': 'Student Workspace v2.1.0 is an all-in-one productivity platform specifically designed to help students manage their academic lives.',
'about_p2': 'Built with modern architecture (JavaScript & Supabase), this app integrates grade tracking (GPA Tracker), financial management, time management (Pomodoro), and collaborative social features (Study Room).',
'about_p3': 'Our mission is to digitize and simplify campus life so you can focus more on achieving your dreams.',
'priv_t1': '1. Data Collection',
'priv_d1': 'We only collect data relevant to your account (Name, University, Major, Academic Grades) voluntarily entered through forms within the application.',
'priv_t2': '2. Data Security',
'priv_d2': 'All data is secured using Row Level Security (RLS) from Supabase PostgreSQL, meaning your data cannot be accessed or read by other users in this system.',
'priv_t3': '3. Third-Party Usage',
'priv_d3': 'We will never sell, rent, or distribute your personal academic data to any third party without your explicit consent.',
'term_t1': '1. Use of Service',
'term_d1': 'By using this service, you agree to use this application for legitimate academic productivity purposes and not to exploit any security vulnerabilities.',
'term_t2': '2. Account Ownership',
'term_d2': 'You are fully responsible for the security of your password. The Developer Team is not responsible for data loss due to negligence in sharing login credentials.',
'term_t3': '3. Service Availability',
'term_d3': 'Since this application is still in the Beta phase, we reserve the right to perform periodic server maintenance which may cause the application to be temporarily inaccessible.',
        
        // Help & Report
        'help_title': 'Help & Reports',
        'help_category_label': 'Message Category',
        'help_cat_bug': 'Report Bug / Error',
        'help_cat_feature': 'New Feature Suggestion',
        'help_cat_other': 'Others',
        'help_msg_label': 'Your Message',
        'help_msg_placeholder': 'Explain in detail...',
        'help_btn_send': 'Send Report',
        'help_faq_title': 'FAQ (Frequently Asked Questions)',
        'faq_1_q': 'Where is my data stored?',
        'faq_1_a': 'All your data is securely stored using a cloud database system (Supabase) with industry-standard encryption.',
        'faq_2_q': 'Is this app free?',
        'faq_2_a': 'Yes, currently all basic features can be used for free to boost your learning productivity.',
        'faq_3_q': 'How to use the AI features?',
        'faq_3_a': 'Simply enter your instructions or upload files into the provided form, and our AI system will automatically process and deliver the results.',

        'btn_back': 'Back', 'btn_understand': 'I Understand', 'btn_save': 'Save', 'btn_cancel': 'Cancel', 'btn_close': 'Close', 'toast_lang': 'Language updated successfully!',
        'm_th_title': 'Create New Thesis Project', 'm_th_sub': 'AI will structure your research.', 'm_th_l1': 'Research Title', 'm_th_p1': 'Ex: The Impact of AI on...', 'm_th_l2': 'Main Problem Statement', 'm_th_p2': 'Ex: What is the accuracy level...', 'm_th_l3': 'Research Objectives', 'm_th_p3': 'Ex: To determine the effectiveness...', 'm_th_l4': 'Methodology (Brief)', 'm_th_p4': 'Ex: Quantitative Questionnaire', 'm_th_btn': 'Generate Structure (AI)',
        'm_fd_title': 'Create New Folder', 'm_fd_ph': 'Folder Name', 'm_fd_btn': 'Create Folder',
        'm_up_title': 'Upload File', 'm_up_l1': 'Choose File from Computer', 'm_up_l2': 'Save As (File Name)', 'm_up_p2': 'Ex: Final_Project.pdf', 'm_up_btn': 'Upload to Drive',
        'm_prg_title': 'Uploading...', 'm_prg_text': 'Preparing file...',
        'm_cal_pt': 'Add title', 'm_cal_tz': 'Time zone • Does not repeat', 'm_cal_pl': 'Add location', 'm_cal_pd': 'Add description', 'm_cal_col': 'Event color', 'm_cal_b1': '30 minutes before', 'm_cal_b2': '1 hour before', 'm_cal_opt': 'More options', 'm_cal_save': 'Save',
        'm_pr_title': 'Create New Prediction', 'm_pr_info': 'Upload past exams and AI will analyze patterns to predict the next questions.', 'm_pr_l1': 'Collection Title', 'm_pr_p1': 'Ex: Calculus Prediction 2026', 'm_pr_l2': 'Subject/Course', 'm_pr_p2': 'Ex: Advanced Math', 'm_pr_l3': 'Exam Type (AI Difficulty)', 'm_pr_o1': 'Practice (Basic/Easy)', 'm_pr_o2': 'Quiz (Intermediate)', 'm_pr_o3': 'Midterm (Hard)', 'm_pr_o4': 'Finals (Very Hard)', 'm_pr_l4': 'Upload Past Exams (AI Context)', 'm_pr_sup': '*Supports Photo (JPG/PNG), PDF, or TXT.', 'm_pr_btn': 'Start Analysis',
        'm_gt_title': 'Create Group Task', 'm_gt_l1': 'Task / Job Name', 'm_gt_p1': 'Ex: Create PPT Chapter 1', 'm_gt_l2': 'Assign To (Member)', 'm_gt_btn': 'Add Task',
        'm_inv_title': 'Invite Friends', 'm_inv_sub': 'Select friends to add to this group:', 'm_inv_btn': 'Add to Group',
        'm_rab_title': 'Budget Plan Table', 'm_rab_sub': 'Predict your monthly expenses here.', 'm_rab_add': 'Add Row', 'm_rab_th1': 'Item / Need Name', 'm_rab_th2': 'Estimated Cost', 'm_rab_tot': 'TOTAL ESTIMATE:', 'm_rab_btn': 'Save Budget',
        'm_usr_xp': 'Total XP', 'm_usr_lvl': 'Level', 'm_usr_add': 'Add Friend',
        'm_cg_title': 'Create Group', 'm_cg_l1': 'Group / Room Name', 'm_cg_p1': 'Ex: Thesis Fighters 2026', 'm_cg_l2': 'Description / Goal', 'm_cg_p2': 'Ex: Place to study and chill', 'm_cg_l3': 'Invite Friends to Group', 'm_cg_btn': 'Create Now',
        'm_hb_title': 'Create Habit', 'm_hb_ph': 'Daily Check-in', 'm_hb_fq': 'Frequency', 'm_hb_f1': 'Daily', 'm_hb_f2': 'Weekly', 'm_hb_f3': 'Pick Days (Custom)', 'm_hb_f4': 'Interval', 'm_hb_gl': 'Goal', 'm_hb_g1': 'Achieve it all', 'm_hb_g2': 'Times per day', 'm_hb_g3': 'Times', 'm_hb_sd': 'Start Date', 'm_hb_gd': 'Goal Days', 'm_hb_gd1': 'Forever', 'm_hb_gd2': '7 days', 'm_hb_gd3': '21 days', 'm_hb_gd4': '30 days', 'm_hb_gd5': '100 days', 'm_hb_gd6': 'Custom', 'm_hb_gdp': 'Enter days (e.g. 14)', 'm_hb_sec': 'Section', 'm_hb_s1': 'Study', 'm_hb_s2': 'Health', 'm_hb_s3': 'Others', 'm_hb_tm': 'Time', 'm_hb_t1': 'Anytime', 'm_hb_t2': 'Morning', 'm_hb_t3': 'Afternoon', 'm_hb_t4': 'Evening', 'm_hb_rem': 'Reminder', 'm_hb_chk': 'Auto pop-up of habit log',
        'm_ob_t1': 'Welcome! 👋', 'm_ob_s1': 'Let\'s set up your workspace before starting.', 'm_ob_h1': 'Who Are You?', 'm_ob_l1': 'Full Name / Nickname', 'm_ob_p1': 'Ex: Nouval', 'm_ob_l2': 'Specialization / Future Title', 'm_ob_p2': 'Ex: Full-stack Developer', 'm_ob_l3': 'City of Residence', 'm_ob_p3': 'Ex: Jakarta', 'm_ob_h2': 'Campus & Vision', 'm_ob_l4': 'University Name', 'm_ob_p4': 'Ex: Harvard University', 'm_ob_l5': 'Major / Study Program', 'm_ob_p5': 'Ex: Computer Science', 'm_ob_l6': 'Target GPA', 'm_ob_l7': 'Graduation Year', 'm_ob_btn': 'Start Adventure', 'm_ob_nt': '* You can change this data anytime in the Profile Settings.',
        'm_ep_t1': 'Edit Profile Info', 'm_ep_h1': 'Personal Identity', 'm_ep_pic': 'Profile Photo', 'm_ep_pic_n': 'JPG/PNG max 2MB.', 'm_ep_l1': 'Username (Without @)', 'm_ep_l2': 'Role / Specialization', 'm_ep_h2': 'Academic Info', 'm_ep_l3': 'Org Tags (Comma separated)', 'm_ep_p3': 'Ex: Student Council', 'm_ep_h3': 'Target & Digital Footprint', 'm_ep_l4': 'Graduation Month/Year', 'm_ep_p4': 'Ex: August 2026', 'm_ep_l5': 'Target Hours/Week', 'm_ep_l6': 'GitHub URL', 'm_ep_l7': 'Portfolio URL', 'm_ep_sv': 'Save Changes',
        'm_tk_t1': 'Add Task', 'm_tk_l1': 'Task Name', 'm_tk_l2': 'Deadline', 'm_tk_btn': 'Save Task',
        'm_fn_t1': 'Add Transaction', 'm_fn_l1': 'Type', 'm_fn_o1': 'Income', 'm_fn_o2': 'Expense', 'm_fn_l2': 'Amount', 'm_fn_l3': 'Note', 'm_fn_btn': 'Save Transaction',
        'm_rm_t1': 'Add Roadmap Target', 'm_rm_l1': 'Semester', 'm_rm_l2': 'Target Credits', 'm_rm_l3': 'Achievement', 'm_rm_l4': 'Status', 'm_rm_o1': 'Planned', 'm_rm_o2': 'Ongoing', 'm_rm_o3': 'Done', 'm_rm_btn': 'Save',
        'm_ip_t1': 'Course Calculation', 'm_ip_l1': 'Course Credits', 'm_ip_l2': 'Course Name', 'm_ip_l3': 'Grading Aspects (Must be 100%)', 'm_ip_add': '+ Add Aspect', 'm_ip_tot': 'Total Weight:', 'm_ip_btn': 'Save & Calculate',
        'm_pw_t1': 'Change Password', 'm_pw_l1': 'New Password (Min 6 Chars)', 'm_pw_l2': 'Confirm New Password', 'm_pw_btn': 'Change Password'
    },

    // 🇸🇦 ARABIC
    'ar': { 
        'nav_apps': 'جميع التطبيقات', 'nav_dash': 'لوحة التحليل', 'nav_study': 'غرفة الدراسة', 'nav_set': 'إعدادات',
        'prof_edit': 'تعديل الملف الشخصي', 'prof_active': 'طالب نشط', 'prof_aca': 'العرض الأكاديمي', 'prof_uni': 'الجامعة', 'prof_major': 'التخصص', 'prof_stat': 'الحالة', 'prof_org': 'الأنشطة والمنظمات', 'prof_nodata': 'لا توجد بيانات', 'prof_vision': 'لوحة الرؤية', 'prof_tar_ipk': 'المعدل التراكمي المستهدف', 'prof_est': 'تاريخ التخرج المتوقع', 'prof_tar_study': 'هدف الدراسة الأسبوعي', 'prof_hr': 'ساعات', 'prof_track': 'سجل النشاط', 'prof_track_desc': 'الاستمرارية في تحقيق الأهداف في آخر 3 أشهر.', 'prof_chill': 'استرخاء', 'prof_fire': 'حماس!', 'prof_load': 'تجميع البيانات...',
        'nav_profile': 'عرض الملف', 'header_greeting': 'مرحباً بعودتك!', 'header_online': 'متصل', 'notif_title': 'إشعارات', 'notif_read': 'تحديد كمقروء', 'notif_empty': 'لا توجد إشعارات جديدة.',
        'app_super_dash': 'اللوحة الفائقة', 'app_super_desc': 'الوصول إلى جميع أدوات الإنتاجية في مكان واحد. من إدارة المهام إلى التحضير المهني.', 'app_cat_premium': 'تطبيقات مميزة (ذكاء اصطناعي)', 'app_cat_daily': 'الإنتاجية اليومية', 'app_cat_admin': 'الإدارة وأخرى',
        'app_studyopang': 'StudyWithOpang', 'app_studyopang_desc': 'مساعد الدراسة بالذكاء الاصطناعي. قم بتحميل المواد لتوليد ملخصات وخرائط ذهنية.', 'app_prediksi': 'توقع الامتحانات', 'app_prediksi_desc': 'تحليل أنماط الامتحانات السابقة لتوقع الأسئلة.', 'app_skripsi': 'توجيه الأطروحة', 'app_skripsi_desc': 'مساعد ذكاء اصطناعي لهيكلة الأطروحة والفجوة البحثية.', 'app_leader': 'لوحة الصدارة', 'app_leader_desc': 'أفضل 50 طالباً',
        'app_title': 'بوابة التطبيقات', 'app_desc': 'وصول سريع لأدوات الإنتاجية. اسحب وأفلت لترتيب المواقع.',
        'app_1': 'مؤقت بومودورو', 'app_1_desc': 'مؤقت التركيز.', 'app_2': 'قائمة المهام', 'app_2_desc': 'إدارة المهام.', 'app_3': 'متتبع العادات', 'app_3_desc': 'تتبع الروتين.', 'app_4': 'حاسبة المعدل', 'app_4_desc': 'حساب المعدل التراكمي', 'app_5': 'المالية', 'app_5_desc': 'سجل التدفق النقدي', 'app_6': 'خارطة الطريق', 'app_6_desc': 'أهداف الفصل', 'app_7': 'مساحة العمل', 'app_7_desc': 'ملاحظات ومشاريع.', 'app_8': 'درايف', 'app_8_desc': 'تخزين الملفات.', 'app_9': 'التقويم', 'app_9_desc': 'الجدول والتذكيرات.',
        'ws_mypages': 'صفحاتي', 'ws_tip': 'تلميح: انقر + لإنشاء صفحة.', 'ws_empty': 'حدد أو أنشئ صفحة للبدء.',
        'dr_title': 'تخزين درايف', 'dr_search': 'البحث عن ملفات...', 'dr_new': 'جديد', 'dr_new_folder': 'مجلد جديد', 'dr_up_file': 'رفع ملف', 'dr_up_folder': 'رفع مجلد',
        'cal_today': 'اليوم', 'cal_month': 'شهر', 'cal_day': 'يوم', 'cal_create': 'إنشاء', 'cal_sun': 'أحد', 'cal_mon': 'إثنين', 'cal_tue': 'ثلاثاء', 'cal_wed': 'أربعاء', 'cal_thu': 'خميس', 'cal_fri': 'جمعة', 'cal_sat': 'سبت',
        'hb_desc': 'ابنِ عادات جيدة كل يوم.', 'hb_new': 'عادة جديدة', 'hb_daily': 'الروتين اليومي', 'hb_all': 'عرض الكل', 'hb_pop': 'باقات روتين شائعة',
        'td_desc': 'إدارة مهامك والمواعيد النهائية.', 'td_new': 'مهمة جديدة', 'td_list': 'قائمة المهام ذات الأولوية', 'td_active': 'نشط', 'td_add': '+ إضافة مهمة',
        'rm_title': 'خريطة رحلة الدراسة', 'rm_desc': 'تصور أهداف الفصل الدراسي.', 'rm_add': 'إضافة هدف',
        'dash_title': 'ملخص التحليلات', 'dash_desc': 'إحصاءات الإنتاجية والإنجازات.',
        'stat_xp': 'إجمالي النقاط', 'stat_rank': 'الترتيب العالمي', 'stat_rank_sub': 'من جميع المستخدمين', 'stat_pomo': 'تركيز بومودورو', 'stat_pomo_sub': 'الجلسات المكتملة', 'stat_pred': 'تحضير الذكاء الاصطناعي', 'stat_pred_sub': 'المجموعات المنشأة', 'stat_skripsi': 'مشروع الأطروحة', 'stat_skripsi_sub': 'مستندات البحث', 'stat_drive': 'تخزين درايف', 'stat_drive_sub': 'الملفات المرفوعة', 'stat_workspace': 'مساحة العمل', 'stat_work_sub': 'الملاحظات واللوحات', 'stat_cal': 'أحداث التقويم', 'stat_cal_sub': 'الأحداث المحفوظة', 'stat_done': 'المهام المكتملة', 'stat_done_sub': 'تم الإنجاز', 'stat_pend': 'المهام المعلقة', 'stat_pend_sub': 'في الانتظار', 'stat_fin': 'الرصيد المالي', 'stat_fin_sub': 'الميزانية المتبقية', 'stat_ipk': 'المعدل الحالي', 'stat_ipk_sub': 'مقياس 4.00',
        'fin_title': 'المالية', 'fin_rab': 'خطة الميزانية', 'fin_new': 'معاملة جديدة', 'fin_in': 'الدخل', 'fin_out': 'المصروفات', 'fin_bal': 'الرصيد', 'fin_date': 'التاريخ', 'fin_desc': 'الوصف', 'fin_amount': 'المبلغ', 'fin_action': 'إجراء',
        'ip_title': 'حاسبة المعدل', 'ip_add': 'إضافة درجة', 'ip_cum': 'المعدل التراكمي', 'ip_sks': 'إجمالي الساعات',
        'pomo_title': 'تركيز الدراسة', 'pomo_desc': 'أكمل جلسة (25 دقيقة) = +10 نقاط!', 'pomo_start': 'ابدأ', 'pomo_reset': 'إعادة ضبط',
        'lb_title': 'لوحة الصدارة', 'lb_desc': 'أفضل 50 طالباً', 'lb_xp': 'إجمالي النقاط', 'lb_streak': 'الاستمرارية',
        'sr_desc': 'ابحث عن أصدقاء، أنشئ مجموعات وتعاون.', 'sr_friends': 'الأصدقاء', 'sr_groups': 'مجموعات الدراسة', 'sr_search': 'البحث عن أصدقاء (الاسم / UID)', 'sr_search_ph': 'أدخل المعرف/الاسم...', 'sr_req': 'طلبات الصداقة', 'sr_req_empty': 'لا توجد طلبات جديدة.', 'sr_list': 'قائمة الأصدقاء', 'sr_list_empty': 'لا يوجد أصدقاء بعد.', 'sr_grp_new': 'إنشاء مجموعة جديدة', 'sr_chat_ph': 'اكتب رسالة...', 'sr_board': 'لوحة المهام', 'sr_invite': 'دعوة صديق',
        'so_desc': 'غرفة دراسة متكاملة بالذكاء الاصطناعي.', 'so_tab_doc': 'المستندات', 'so_tab_note': 'ملاحظات ومعلم', 'so_tab_mm': 'خريطة ذهنية', 'so_tab_fc': 'بطاقات استذكار', 'so_tab_quiz': 'اختبار ذكي', 'so_up_title': 'رفع المواد الدراسية', 'so_up_desc': 'ارفع ملفات لتحويلها إلى ملاحظات، خرائط، وبطاقات.', 'so_btn_analisa': 'بدء التحليل', 'so_up_support': 'يدعم: PDF, TXT, PNG, JPG.',
        'pr_title': 'توقع أسئلة الامتحان', 'pr_desc': 'تحليل الأنماط السابقة.', 'pr_col_title': 'مجموعة التوقعات', 'pr_btn_new': 'إنشاء توقع', 'pr_empty': 'لا توجد توقعات. انقر "+ إنشاء" للبدء.',
        'th_title': 'مشاريعك', 'th_desc': 'إدارة هيكل الأطروحة', 'th_btn_new': 'مشروع جديد',
        
        'set_title': 'إعدادات النظام', 'set_desc': 'تخصيص الواجهة واللغة.', 'set_theme': 'التخصيص والعرض', 'set_mode': 'وضع العرض', 'set_mode_desc': 'اختر فاتح أو داكن.', 'set_light': 'فاتح', 'set_dark': 'داكن', 'set_color': 'اللون الرئيسي', 'set_color_desc': 'اللون السائد.', 'set_lang': 'لغة التطبيق', 'set_info': 'المعلومات والقانونية', 'set_about': 'عن التطبيق', 'set_privacy': 'سياسة الخصوصية', 'set_terms': 'الشروط والأحكام',
        
        'about_p1': 'Student Workspace v2.1.0 هي منصة إنتاجية متكاملة مصممة خصيصًا لمساعدة الطلاب في إدارة حياتهم الأكاديمية.',
'about_p2': 'تم بناء هذا التطبيق ببنية حديثة (JavaScript و Supabase)، ويدمج تتبع الدرجات (GPA Tracker)، والإدارة المالية، وإدارة الوقت (Pomodoro)، والميزات الاجتماعية التعاونية (Study Room).',
'about_p3': 'مهمتنا هي رقمنة وتبسيط الحياة الجامعية حتى تتمكن من التركيز أكثر على تحقيق أحلامك.',
'priv_t1': '1. جمع البيانات',
'priv_d1': 'نحن نجمع فقط البيانات المتعلقة بحسابك (الاسم، الجامعة، التخصص، الدرجات الأكاديمية) التي يتم إدخالها طواعية من خلال النماذج داخل التطبيق.',
'priv_t2': '2. أمن البيانات',
'priv_d2': 'يتم تأمين جميع البيانات باستخدام الأمان على مستوى الصف (RLS) من Supabase PostgreSQL، مما يعني أنه لا يمكن للمستخدمين الآخرين في هذا النظام الوصول إلى بياناتك أو قراءتها.',
'priv_t3': '3. استخدام الطرف الثالث',
'priv_d3': 'لن نقوم أبدًا ببيع أو تأجير أو توزيع بياناتك الأكاديمية الشخصية لأي طرف ثالث دون موافقتك الصريحة.',
'term_t1': '1. استخدام الخدمة',
'term_d1': 'باستخدام هذه الخدمة، فإنك توافق على استخدام هذا التطبيق لأغراض الإنتاجية الأكاديمية المشروعة وعدم استغلال أي ثغرات أمنية.',
'term_t2': '2. ملكية الحساب',
'term_d2': 'أنت مسؤول مسؤولية كاملة عن أمان كلمة المرور الخاصة بك. فريق المطورين غير مسؤول عن فقدان البيانات بسبب الإهمال في مشاركة بيانات اعتماد تسجيل الدخول.',
'term_t3': '3. توفر الخدمة',
'term_d3': 'نظرًا لأن هذا التطبيق لا يزال في المرحلة التجريبية (Beta)، فإننا نحتفظ بالحق في إجراء صيانة دورية للخادم والتي قد تتسبب في عدم إمكانية الوصول إلى التطبيق مؤقتًا.',
        
        // Help & Report
        'help_title': 'المساعدة والتقارير',
        'help_category_label': 'فئة الرسالة',
        'help_cat_bug': 'الإبلاغ عن خطأ / مشكلة',
        'help_cat_feature': 'اقتراح ميزة جديدة',
        'help_cat_other': 'أخرى',
        'help_msg_label': 'رسالتك',
        'help_msg_placeholder': 'اشرح بالتفصيل...',
        'help_btn_send': 'إرسال التقرير',
        'help_faq_title': 'الأسئلة الشائعة (FAQ)',
        'faq_1_q': 'أين يتم تخزين بياناتي؟',
        'faq_1_a': 'يتم تخزين جميع بياناتك بشكل آمن باستخدام نظام قاعدة بيانات سحابي (Supabase) بتشفير متوافق مع معايير الصناعة.',
        'faq_2_q': 'هل هذا التطبيق مجاني؟',
        'faq_2_a': 'نعم، حالياً يمكن استخدام جميع الميزات الأساسية مجاناً لزيادة إنتاجيتك في التعلم.',
        'faq_3_q': 'كيف أستخدم ميزات الذكاء الاصطناعي؟',
        'faq_3_a': 'ما عليك سوى إدخال التعليمات أو رفع الملفات في النموذج المقدم، وسيقوم نظام الذكاء الاصطناعي بمعالجتها تلقائياً وتقديم النتائج.',

        'btn_back': 'رجوع', 'btn_understand': 'أنا أفهم', 'btn_save': 'حفظ', 'btn_cancel': 'إلغاء', 'btn_close': 'إغلاق', 'toast_lang': 'تم تحديث اللغة بنجاح!',
        'm_th_title': 'إنشاء مشروع أطروحة جديد', 'm_th_sub': 'الذكاء الاصطناعي سينظم بحثك.', 'm_th_l1': 'عنوان البحث', 'm_th_p1': 'مثال: تأثير الذكاء الاصطناعي...', 'm_th_l2': 'بيان المشكلة الرئيسية', 'm_th_p2': 'مثال: ما هو مستوى الدقة...', 'm_th_l3': 'أهداف البحث', 'm_th_p3': 'مثال: لتحديد الفعالية...', 'm_th_l4': 'المنهجية (مختصر)', 'm_th_p4': 'مثال: استبيان كمي', 'm_th_btn': 'توليد الهيكل (الذكاء الاصطناعي)',
        'm_fd_title': 'إنشاء مجلد جديد', 'm_fd_ph': 'اسم المجلد', 'm_fd_btn': 'إنشاء المجلد',
        'm_up_title': 'رفع ملف', 'm_up_l1': 'اختر ملف من الكمبيوتر', 'm_up_l2': 'حفظ باسم', 'm_up_p2': 'مثال: Final_Project.pdf', 'm_up_btn': 'رفع إلى درايف',
        'm_prg_title': 'جاري الرفع...', 'm_prg_text': 'تجهيز الملف...',
        'm_cal_pt': 'إضافة عنوان', 'm_cal_tz': 'المنطقة الزمنية • لا يتكرر', 'm_cal_pl': 'إضافة موقع', 'm_cal_pd': 'إضافة وصف', 'm_cal_col': 'لون الحدث', 'm_cal_b1': 'قبل 30 دقيقة', 'm_cal_b2': 'قبل 1 ساعة', 'm_cal_opt': 'خيارات إضافية', 'm_cal_save': 'حفظ',
        'm_pr_title': 'إنشاء توقع جديد', 'm_pr_info': 'ارفع الامتحانات السابقة وسيقوم الذكاء الاصطناعي بالتنبؤ بالأسئلة.', 'm_pr_l1': 'عنوان المجموعة', 'm_pr_p1': 'مثال: توقع تفاضل 2026', 'm_pr_l2': 'المادة/الدورة', 'm_pr_p2': 'مثال: رياضيات متقدمة', 'm_pr_l3': 'نوع الامتحان (صعوبة الذكاء الاصطناعي)', 'm_pr_o1': 'تدريب (سهل)', 'm_pr_o2': 'اختبار (متوسط)', 'm_pr_o3': 'نصفي (صعب)', 'm_pr_o4': 'نهائي (صعب جداً)', 'm_pr_l4': 'رفع الامتحانات القديمة', 'm_pr_sup': '*يدعم الصور (JPG/PNG), PDF, أو TXT.', 'm_pr_btn': 'بدء التحليل',
        'm_gt_title': 'إنشاء مهمة مجموعة', 'm_gt_l1': 'اسم المهمة', 'm_gt_p1': 'مثال: إنشاء عرض الفصل 1', 'm_gt_l2': 'تعيين إلى', 'm_gt_btn': 'إضافة مهمة',
        'm_inv_title': 'دعوة الأصدقاء', 'm_inv_sub': 'اختر الأصدقاء لإضافتهم:', 'm_inv_btn': 'إضافة للمجموعة',
        'm_rab_title': 'خطة الميزانية', 'm_rab_sub': 'توقع نفقاتك الشهرية هنا.', 'm_rab_add': 'إضافة صف', 'm_rab_th1': 'اسم العنصر', 'm_rab_th2': 'التكلفة المقدرة', 'm_rab_tot': 'إجمالي التقدير:', 'm_rab_btn': 'حفظ الميزانية',
        'm_usr_xp': 'إجمالي النقاط', 'm_usr_lvl': 'المستوى', 'm_usr_add': 'إضافة صديق',
        'm_cg_title': 'إنشاء مجموعة', 'm_cg_l1': 'اسم المجموعة', 'm_cg_p1': 'مثال: أبطال الأطروحة 2026', 'm_cg_l2': 'الوصف / الهدف', 'm_cg_p2': 'مثال: مكان للدراسة', 'm_cg_l3': 'دعوة أصدقاء', 'm_cg_btn': 'إنشاء الآن',
        'm_hb_title': 'إنشاء عادة', 'm_hb_ph': 'تسجيل يومي', 'm_hb_fq': 'التكرار', 'm_hb_f1': 'يومي', 'm_hb_f2': 'أسبوعي', 'm_hb_f3': 'أيام مخصصة', 'm_hb_f4': 'فاصل', 'm_hb_gl': 'الهدف', 'm_hb_g1': 'إنجاز الكل', 'm_hb_g2': 'مرات يومياً', 'm_hb_g3': 'مرات', 'm_hb_sd': 'تاريخ البدء', 'm_hb_gd': 'أيام الهدف', 'm_hb_gd1': 'دائماً', 'm_hb_gd2': '7 أيام', 'm_hb_gd3': '21 يوم', 'm_hb_gd4': '30 يوم', 'm_hb_gd5': '100 يوم', 'm_hb_gd6': 'مخصص', 'm_hb_gdp': 'أدخل الأيام', 'm_hb_sec': 'القسم', 'm_hb_s1': 'دراسة', 'm_hb_s2': 'صحة', 'm_hb_s3': 'أخرى', 'm_hb_tm': 'الوقت', 'm_hb_t1': 'أي وقت', 'm_hb_t2': 'صباحاً', 'm_hb_t3': 'عصراً', 'm_hb_t4': 'مساءً', 'm_hb_rem': 'تذكير', 'm_hb_chk': 'منبثق تلقائي للسجل',
        'm_ob_t1': 'مرحباً! 👋', 'm_ob_s1': 'لنجهز مساحة عملك قبل البدء.', 'm_ob_h1': 'من أنت؟', 'm_ob_l1': 'الاسم الكامل', 'm_ob_p1': 'مثال: نوفل', 'm_ob_l2': 'التخصص / اللقب', 'm_ob_p2': 'مثال: مطور', 'm_ob_l3': 'المدينة', 'm_ob_p3': 'مثال: جاكرتا', 'm_ob_h2': 'الجامعة والرؤية', 'm_ob_l4': 'اسم الجامعة', 'm_ob_p4': 'مثال: جامعة هارفارد', 'm_ob_l5': 'التخصص الدراسي', 'm_ob_p5': 'مثال: علوم الحاسب', 'm_ob_l6': 'المعدل المستهدف', 'm_ob_l7': 'سنة التخرج', 'm_ob_btn': 'بدء المغامرة', 'm_ob_nt': '* يمكنك تغيير هذا لاحقاً في الإعدادات.',
        'm_ep_t1': 'تعديل الملف الشخصي', 'm_ep_h1': 'الهوية الشخصية', 'm_ep_pic': 'صورة الملف', 'm_ep_pic_n': 'الحد الأقصى 2MB.', 'm_ep_l1': 'اسم المستخدم', 'm_ep_l2': 'التخصص', 'm_ep_h2': 'معلومات أكاديمية', 'm_ep_l3': 'المنظمات (مفصولة بفاصلة)', 'm_ep_p3': 'مثال: مجلس الطلاب', 'm_ep_h3': 'الأهداف', 'm_ep_l4': 'شهر/سنة التخرج', 'm_ep_p4': 'مثال: أغسطس 2026', 'm_ep_l5': 'ساعات/أسبوع', 'm_ep_l6': 'رابط GitHub', 'm_ep_l7': 'رابط المشاريع', 'm_ep_sv': 'حفظ التغييرات',
        'm_tk_t1': 'إضافة مهمة', 'm_tk_l1': 'اسم المهمة', 'm_tk_l2': 'الموعد النهائي', 'm_tk_btn': 'حفظ المهمة',
        'm_fn_t1': 'إضافة معاملة', 'm_fn_l1': 'النوع', 'm_fn_o1': 'دخل', 'm_fn_o2': 'مصروف', 'm_fn_l2': 'المبلغ', 'm_fn_l3': 'ملاحظة', 'm_fn_btn': 'حفظ المعاملة',
        'm_rm_t1': 'إضافة هدف', 'm_rm_l1': 'الفصل الدراسي', 'm_rm_l2': 'الساعات المستهدفة', 'm_rm_l3': 'الإنجاز', 'm_rm_l4': 'الحالة', 'm_rm_o1': 'مخطط', 'm_rm_o2': 'جاري', 'm_rm_o3': 'منجز', 'm_rm_btn': 'حفظ',
        'm_ip_t1': 'حساب المادة', 'm_ip_l1': 'ساعات المادة', 'm_ip_l2': 'اسم المادة', 'm_ip_l3': 'جوانب التقييم (يجب أن يكون 100%)', 'm_ip_add': '+ إضافة جانب', 'm_ip_tot': 'إجمالي الوزن:', 'm_ip_btn': 'حفظ وحساب',
        'm_pw_t1': 'تغيير كلمة المرور', 'm_pw_l1': 'كلمة المرور الجديدة', 'm_pw_l2': 'تأكيد كلمة المرور', 'm_pw_btn': 'تغيير'
    },

    // 🇯🇵 JAPANESE
    'jp': { 
        'nav_apps': 'すべてのアプリ', 'nav_dash': '分析ダッシュボード', 'nav_study': '自習室と友達', 'nav_set': '設定',
        'prof_edit': 'プロファイル編集', 'prof_active': '現役学生', 'prof_aca': '学業成績', 'prof_uni': '大学', 'prof_major': '専攻', 'prof_stat': 'ステータス', 'prof_org': '活動・組織', 'prof_nodata': 'データなし', 'prof_vision': 'ビジョンボード', 'prof_tar_ipk': '目標GPA', 'prof_est': '卒業予定', 'prof_tar_study': '週間学習目標', 'prof_hr': '時間', 'prof_track': '活動記録', 'prof_track_desc': '過去3ヶ月の目標達成の継続性。', 'prof_chill': 'リラックス', 'prof_fire': '絶好調！', 'prof_load': 'データ読み込み中...',
        'nav_profile': 'プロファイル表示', 'header_greeting': 'おかえりなさい！', 'header_online': 'オンライン', 'notif_title': '通知', 'notif_read': '既読にする', 'notif_empty': '新しい通知はありません。',
        'app_super_dash': 'スーパーダッシュボード', 'app_super_desc': 'タスク管理から就活準備まで、生産性ツールを一箇所に集約。', 'app_cat_premium': 'プレミアムアプリ (AI搭載)', 'app_cat_daily': '日々の生産性', 'app_cat_admin': '管理・その他',
        'app_studyopang': 'StudyWithOpang', 'app_studyopang_desc': 'AI学習アシスタント。資料をアップロードして要約やクイズを自動生成。', 'app_prediksi': '試験予想', 'app_prediksi_desc': '過去の出題傾向を分析し、問題を予測します。', 'app_skripsi': '論文ガイダンス', 'app_skripsi_desc': '論文の構成と研究ギャップのためのAIアシスタント。', 'app_leader': 'リーダーボード', 'app_leader_desc': 'トップ50の学生',
        'app_title': 'アプリゲートウェイ', 'app_desc': 'すべてのツールへ素早くアクセス。ドラッグ＆ドロップで配置を変更できます。',
        'app_1': 'ポモドーロ', 'app_1_desc': '集中タイマー。', 'app_2': 'ToDoリスト', 'app_2_desc': 'タスク管理。', 'app_3': '習慣トラッカー', 'app_3_desc': '日課の記録。', 'app_4': 'GPAトラッカー', 'app_4_desc': '成績計算。', 'app_5': '家計簿', 'app_5_desc': 'キャッシュフロー。', 'app_6': 'ロードマップ', 'app_6_desc': '学期目標。', 'app_7': 'ワークスペース', 'app_7_desc': 'ノートとプロジェクト。', 'app_8': 'ドライブ', 'app_8_desc': 'ファイル保存。', 'app_9': 'カレンダー', 'app_9_desc': 'スケジュール。',
        'ws_mypages': 'マイページ', 'ws_tip': 'ヒント：+ をクリックして作成。', 'ws_empty': 'ページを選択または作成して開始。',
        'dr_title': 'ドライブストレージ', 'dr_search': 'ファイル/フォルダを検索...', 'dr_new': '新規', 'dr_new_folder': '新しいフォルダ', 'dr_up_file': 'ファイルアップロード', 'dr_up_folder': 'フォルダアップロード',
        'cal_today': '今日', 'cal_month': '月', 'cal_day': '日', 'cal_create': '作成', 'cal_sun': '日', 'cal_mon': '月', 'cal_tue': '火', 'cal_wed': '水', 'cal_thu': '木', 'cal_fri': '金', 'cal_sat': '土',
        'hb_desc': '毎日良い習慣を築きましょう。', 'hb_new': '新しい習慣', 'hb_daily': '毎日のルーティン', 'hb_all': 'すべて表示', 'hb_pop': '人気のルーティン',
        'td_desc': 'タスクと期限を管理します。', 'td_new': '新しいタスク', 'td_list': '優先タスク一覧', 'td_active': 'アクティブ', 'td_add': '+ タスクを追加',
        'rm_title': '学習ロードマップ', 'rm_desc': '学期の目標を視覚化します。', 'rm_add': '目標を追加',
        'dash_title': '分析サマリー', 'dash_desc': '生産性の統計と学習の成果。',
        'stat_xp': '合計ポイント / XP', 'stat_rank': 'グローバルランク', 'stat_rank_sub': '全ユーザー中', 'stat_pomo': 'ポモドーロ集中', 'stat_pomo_sub': '完了セッション', 'stat_pred': 'AI試験準備', 'stat_pred_sub': '作成したコレクション', 'stat_skripsi': '論文プロジェクト', 'stat_skripsi_sub': '研究ドキュメント', 'stat_drive': 'ストレージ', 'stat_drive_sub': 'アップロード済み', 'stat_workspace': 'ワークスペース', 'stat_work_sub': 'ノートとボード', 'stat_cal': 'カレンダー', 'stat_cal_sub': '保存したイベント', 'stat_done': '完了タスク', 'stat_done_sub': '達成済み', 'stat_pend': '保留中タスク', 'stat_pend_sub': '実行待ち', 'stat_fin': '家計簿残高', 'stat_fin_sub': '残り予算', 'stat_ipk': '現在のGPA', 'stat_ipk_sub': '4.00満点',
        'fin_title': '家計簿', 'fin_rab': '予算計画', 'fin_new': '新しい取引', 'fin_in': '収入', 'fin_out': '支出', 'fin_bal': '残高', 'fin_date': '日付', 'fin_desc': '説明', 'fin_amount': '金額', 'fin_action': 'アクション',
        'ip_title': 'GPA計算機', 'ip_add': '成績を追加', 'ip_cum': '累積GPA', 'ip_sks': '総単位数',
        'pomo_title': '集中学習', 'pomo_desc': 'セッション完了（25分）= +10 XP！', 'pomo_start': '開始', 'pomo_reset': 'リセット',
        'lb_title': 'リーダーボード', 'lb_desc': 'トップ50の学生', 'lb_xp': '合計XP', 'lb_streak': '継続',
        'sr_desc': '友達を見つけ、グループを作り、協力しよう。', 'sr_friends': '友達', 'sr_groups': '学習グループ', 'sr_search': '友達を検索（ユーザー名 / UID）', 'sr_search_ph': 'ID/名前を入力...', 'sr_req': '友達リクエスト', 'sr_req_empty': '新しいリクエストはありません。', 'sr_list': '友達リスト', 'sr_list_empty': 'まだ友達がいません。', 'sr_grp_new': '新しいグループを作成', 'sr_chat_ph': 'メッセージを入力...', 'sr_board': 'タスクボード', 'sr_invite': '友達を招待',
        'so_desc': 'AI搭載の統合学習ルーム。', 'so_tab_doc': 'ドキュメント', 'so_tab_note': 'ノート＆チューター', 'so_tab_mm': 'マインドマップ', 'so_tab_fc': 'フラッシュカード', 'so_tab_quiz': 'AIクイズ', 'so_up_title': '学習資料をアップロード', 'so_up_desc': 'PDF/TXT/写真をアップロードして資料を自動生成。', 'so_btn_analisa': '分析を開始', 'so_up_support': '対応：PDF、TXT、PNG、JPG。',
        'pr_title': '試験問題予測', 'pr_desc': '過去のパターンを分析します。', 'pr_col_title': '予測コレクション', 'pr_btn_new': '予測を作成', 'pr_empty': '予測がありません。「+ 予測を作成」をクリック。',
        'th_title': 'プロジェクト', 'th_desc': '論文の構成を管理', 'th_btn_new': '新規プロジェクト',
        
        'set_title': 'システム設定', 'set_desc': 'インターフェースと設定をカスタマイズ。', 'set_theme': '外観とテーマ', 'set_mode': '表示モード', 'set_mode_desc': 'ライト/ダークテーマを選択。', 'set_light': 'ライト', 'set_dark': 'ダーク', 'set_color': 'アクセントカラー', 'set_color_desc': 'ボタンのメインカラー。', 'set_lang': '言語設定', 'set_info': '情報と規約', 'set_about': 'アプリについて', 'set_privacy': 'プライバシーポリシー', 'set_terms': '利用規約',
        'about_p1': 'Student Workspace v2.1.0 は、学生が学業生活を管理できるように特別に設計されたオールインワンの生産性プラットフォームです。',
'about_p2': '最新のアーキテクチャ（JavaScript と Supabase）で構築されたこのアプリは、成績追跡（GPA Tracker）、財務管理、時間管理（Pomodoro）、および共同ソーシャル機能（Study Room）を統合しています。',
'about_p3': '私たちの使命は、キャンパスライフをデジタル化して簡素化し、あなたが夢の実現に集中できるようにすることです。',
'priv_t1': '1. データ収集',
'priv_d1': 'アプリ内のフォームを通じて自発的に入力された、アカウントに関連するデータ（名前、大学、専攻、学業成績）のみを収集します。',
'priv_t2': '2. データセキュリティ',
'priv_d2': 'すべてのデータは Supabase PostgreSQL の行レベルセキュリティ (RLS) を使用して保護されています。つまり、このシステムの他のユーザーがあなたのデータにアクセスしたり読み取ったりすることはできません。',
'priv_t3': '3. 第三者の使用',
'priv_d3': 'お客様の明示的な同意なしに、個人の学業データを第三者に販売、貸与、または配布することは決してありません。',
'term_t1': '1. サービスの利用',
'term_d1': 'このサービスを使用することにより、正当な学業生産性の目的でこのアプリを使用し、セキュリティの脆弱性を悪用しないことに同意するものとします。',
'term_t2': '2. アカウントの所有権',
'term_d2': 'パスワードのセキュリティについては、お客様が全責任を負うものとします。開発チームは、ログイン資格情報の共有の過失によるデータ損失について責任を負いません。',
'term_t3': '3. サービスの可用性',
'term_d3': 'このアプリはまだベータ版であるため、定期的なサーバーメンテナンスを実行する権利を留保します。これにより、アプリに一時的にアクセスできなくなる場合があります。',
        // Help & Report
        'help_title': 'ヘルプとレポート',
        'help_category_label': 'メッセージのカテゴリ',
        'help_cat_bug': 'バグ/エラーを報告',
        'help_cat_feature': '新機能の提案',
        'help_cat_other': 'その他',
        'help_msg_label': 'メッセージ',
        'help_msg_placeholder': '詳細を説明してください...',
        'help_btn_send': 'レポートを送信',
        'help_faq_title': 'よくある質問 (FAQ)',
        'faq_1_q': 'データはどこに保存されますか？',
        'faq_1_a': 'すべてのデータは、業界標準の暗号化を備えたクラウドデータベースシステム（Supabase）を使用して安全に保存されます。',
        'faq_2_q': 'このアプリは無料ですか？',
        'faq_2_a': 'はい、現在のところ基本的な機能はすべて無料でご利用いただけ、学習の生産性を高めることができます。',
        'faq_3_q': 'AI機能の使い方は？',
        'faq_3_a': '提供されたフォームに指示を入力するかファイルをアップロードするだけで、AIシステムが自動的に処理して結果を提供します。',

        'btn_back': '戻る', 'btn_understand': '理解しました', 'btn_save': '保存', 'btn_cancel': 'キャンセル', 'btn_close': '閉じる', 'toast_lang': '言語が更新されました！',
        'm_th_title': '新規論文プロジェクト作成', 'm_th_sub': 'AIが研究構成を支援します。', 'm_th_l1': '研究タイトル', 'm_th_p1': '例：AIの影響について...', 'm_th_l2': '主要な問題提起', 'm_th_p2': '例：精度レベルはどの程度か...', 'm_th_l3': '研究目的', 'm_th_p3': '例：有効性を判断するため...', 'm_th_l4': '研究手法（略式）', 'm_th_p4': '例：定量的アンケート', 'm_th_btn': '構成を生成 (AI)',
        'm_fd_title': '新しいフォルダを作成', 'm_fd_ph': 'フォルダ名', 'm_fd_btn': '作成',
        'm_up_title': 'ファイルアップロード', 'm_up_l1': 'PCからファイルを選択', 'm_up_l2': '名前を付けて保存', 'm_up_p2': '例: Final_Project.pdf', 'm_up_btn': 'ドライブへアップロード',
        'm_prg_title': 'アップロード中...', 'm_prg_text': 'ファイルを準備中...',
        'm_cal_pt': 'タイトルを追加', 'm_cal_tz': 'タイムゾーン • 繰り返さない', 'm_cal_pl': '場所を追加', 'm_cal_pd': '説明を追加', 'm_cal_col': 'イベントの色', 'm_cal_b1': '30分前', 'm_cal_b2': '1時間前', 'm_cal_opt': '詳細オプション', 'm_cal_save': '保存',
        'm_pr_title': '新規予測を作成', 'm_pr_info': '過去の試験をアップロードすると、AIがパターンを分析し問題を予測します。', 'm_pr_l1': 'コレクション名', 'm_pr_p1': '例：微積分予測2026', 'm_pr_l2': '科目/コース', 'm_pr_p2': '例：高等数学', 'm_pr_l3': '試験タイプ（AI難易度）', 'm_pr_o1': '練習（基本/簡単）', 'm_pr_o2': '小テスト（標準）', 'm_pr_o3': '中間（難しい）', 'm_pr_o4': '期末（非常に難しい）', 'm_pr_l4': '過去問アップロード（AIコンテキスト）', 'm_pr_sup': '*JPG/PNG、PDF、TXT対応。', 'm_pr_btn': '分析を開始',
        'm_gt_title': 'グループタスク作成', 'm_gt_l1': 'タスク名', 'm_gt_p1': '例：第1章のPPT作成', 'm_gt_l2': '担当者', 'm_gt_btn': 'タスクを追加',
        'm_inv_title': '友達を招待', 'm_inv_sub': 'グループに追加する友達を選択：', 'm_inv_btn': 'グループに追加',
        'm_rab_title': '予算計画表', 'm_rab_sub': '毎月の支出を予測します。', 'm_rab_add': '行を追加', 'm_rab_th1': '項目名', 'm_rab_th2': '予想コスト (Rp)', 'm_rab_tot': '予想合計：', 'm_rab_btn': '保存',
        'm_usr_xp': '合計XP', 'm_usr_lvl': 'レベル', 'm_usr_add': '友達を追加',
        'm_cg_title': 'グループ作成', 'm_cg_l1': 'グループ/ルーム名', 'm_cg_p1': '例：論文ファイターズ2026', 'm_cg_l2': '説明/目標', 'm_cg_p2': '例：勉強と雑談の場所', 'm_cg_l3': '友達を招待', 'm_cg_btn': '今すぐ作成',
        'm_hb_title': '習慣を作成', 'm_hb_ph': '毎日のチェックイン', 'm_hb_fq': '頻度', 'm_hb_f1': '毎日', 'm_hb_f2': '毎週', 'm_hb_f3': '曜日指定（カスタム）', 'm_hb_f4': '間隔', 'm_hb_gl': '目標', 'm_hb_g1': 'すべて達成', 'm_hb_g2': '1日あたりの回数', 'm_hb_g3': '回', 'm_hb_sd': '開始日', 'm_hb_gd': '目標日数', 'm_hb_gd1': '無期限', 'm_hb_gd2': '7日間', 'm_hb_gd3': '21日間', 'm_hb_gd4': '30日間', 'm_hb_gd5': '100日間', 'm_hb_gd6': 'カスタム', 'm_hb_gdp': '日数を入力（例: 14）', 'm_hb_sec': 'カテゴリ', 'm_hb_s1': '学習', 'm_hb_s2': '健康', 'm_hb_s3': 'その他', 'm_hb_tm': '時間帯', 'm_hb_t1': 'いつでも', 'm_hb_t2': '朝', 'm_hb_t3': '昼', 'm_hb_t4': '夜', 'm_hb_rem': 'リマインダー', 'm_hb_chk': 'ログの自動ポップアップ',
        'm_ob_t1': 'ようこそ！ 👋', 'm_ob_s1': '始める前にワークスペースを設定しましょう。', 'm_ob_h1': 'あなたは誰ですか？', 'm_ob_l1': '氏名/ニックネーム', 'm_ob_p1': '例：ノーバル', 'm_ob_l2': '専門/将来の肩書き', 'm_ob_p2': '例：フルスタック開発者', 'm_ob_l3': '居住都市', 'm_ob_p3': '例：東京', 'm_ob_h2': '大学とビジョン', 'm_ob_l4': '大学名', 'm_ob_p4': '例：東京大学', 'm_ob_l5': '専攻/プログラム', 'm_ob_p5': '例：情報工学', 'm_ob_l6': '目標GPA', 'm_ob_l7': '卒業予定年', 'm_ob_btn': '冒険を始める', 'm_ob_nt': '* このデータは後でプロファイル設定から変更できます。',
        'm_ep_t1': 'プロファイル編集', 'm_ep_h1': '個人情報', 'm_ep_pic': 'プロフィール写真', 'm_ep_pic_n': 'JPG/PNG 最大2MB。', 'm_ep_l1': 'ユーザー名 (@なし)', 'm_ep_l2': '役割/専門', 'm_ep_h2': '学業情報', 'm_ep_l3': '組織タグ (カンマ区切り)', 'm_ep_p3': '例：生徒会', 'm_ep_h3': '目標とデジタル記録', 'm_ep_l4': '卒業月/年', 'm_ep_p4': '例：2026年8月', 'm_ep_l5': '目標時間/週', 'm_ep_l6': 'GitHub URL', 'm_ep_l7': 'ポートフォリオ URL', 'm_ep_sv': '変更を保存',
        'm_tk_t1': 'タスク追加', 'm_tk_l1': 'タスク名', 'm_tk_l2': '期限', 'm_tk_btn': '保存',
        'm_fn_t1': '取引を追加', 'm_fn_l1': 'タイプ', 'm_fn_o1': '収入', 'm_fn_o2': '支出', 'm_fn_l2': '金額', 'm_fn_l3': 'メモ', 'm_fn_btn': '保存',
        'm_rm_t1': 'ロードマップ目標追加', 'm_rm_l1': '学期', 'm_rm_l2': '目標単位', 'm_rm_l3': '達成内容', 'm_rm_l4': 'ステータス', 'm_rm_o1': '計画中', 'm_rm_o2': '進行中', 'm_rm_o3': '完了', 'm_rm_btn': '保存',
        'm_ip_t1': '科目計算', 'm_ip_l1': '科目単位', 'm_ip_l2': '科目名', 'm_ip_l3': '評価項目（合計100%）', 'm_ip_add': '+ 項目追加', 'm_ip_tot': '合計比率：', 'm_ip_btn': '保存して計算',
        'm_pw_t1': 'パスワード変更', 'm_pw_l1': '新しいパスワード', 'm_pw_l2': 'パスワード確認', 'm_pw_btn': '変更する'
    },

    // 🇰🇷 KOREAN
    'kr': { 
        'nav_apps': '모든 앱', 'nav_dash': '분석 대시보드', 'nav_study': '스터디 룸', 'nav_set': '설정',
        'prof_edit': '프로필 편집', 'prof_active': '재학생', 'prof_aca': '학업 쇼케이스', 'prof_uni': '대학교', 'prof_major': '전공', 'prof_stat': '상태', 'prof_org': '활동 및 동아리', 'prof_nodata': '데이터 없음', 'prof_vision': '비전 보드', 'prof_tar_ipk': '목표 학점', 'prof_est': '졸업 예정일', 'prof_tar_study': '주간 목표 학습', 'prof_hr': '시간', 'prof_track': '활동 기록', 'prof_track_desc': '최근 3개월간 일일 목표 달성 일관성.', 'prof_chill': '여유', 'prof_fire': '열정!', 'prof_load': '데이터 불러오는 중...',
        'nav_profile': '프로필 보기', 'header_greeting': '다시 오신 것을 환영합니다!', 'header_online': '온라인', 'notif_title': '알림', 'notif_read': '읽음 표시', 'notif_empty': '알림이 없습니다.',
        'app_super_dash': '슈퍼 대시보드', 'app_super_desc': '모든 생산성 도구를 한 곳에서. 작업 관리부터 취업 준비까지.', 'app_cat_premium': '프리미엄 앱 (AI 기반)', 'app_cat_daily': '일일 생산성', 'app_cat_admin': '행정 및 기타',
        'app_studyopang': 'StudyWithOpang', 'app_studyopang_desc': 'AI 학습 어시스턴트. 자료를 업로드하면 요약, 마인드맵, 퀴즈 자동 생성.', 'app_prediksi': '시험 예측', 'app_prediksi_desc': '과거 시험 패턴을 분석하여 출제 문제 예측.', 'app_skripsi': '논문 가이드', 'app_skripsi_desc': '논문 구조 및 연구 공백을 위한 AI 어시스턴트.', 'app_leader': '리더보드', 'app_leader_desc': '상위 50명의 학생',
        'app_title': '앱 게이트웨이', 'app_desc': '모든 도구에 빠르게 액세스. 드래그 앤 드롭으로 재배치하세요.',
        'app_1': '뽀모도로 타이머', 'app_1_desc': '집중 타이머.', 'app_2': '할 일 목록', 'app_2_desc': '작업 관리.', 'app_3': '습관 트래커', 'app_3_desc': '루틴 트래커.', 'app_4': '학점 트래커', 'app_4_desc': '학점 계산.', 'app_5': '재정', 'app_5_desc': '현금 흐름 기록.', 'app_6': '로드맵', 'app_6_desc': '학기 목표.', 'app_7': '워크스페이스', 'app_7_desc': '노트 및 프로젝트.', 'app_8': '드라이브', 'app_8_desc': '파일 저장소.', 'app_9': '캘린더', 'app_9_desc': '일정 및 알림.',
        'ws_mypages': '내 페이지', 'ws_tip': '팁: + 를 클릭하여 생성.', 'ws_empty': '시작하려면 페이지를 선택하거나 생성하세요.',
        'dr_title': '드라이브 저장소', 'dr_search': '파일/폴더 검색...', 'dr_new': '새로 만들기', 'dr_new_folder': '새 폴더', 'dr_up_file': '파일 업로드', 'dr_up_folder': '폴더 업로드',
        'cal_today': '오늘', 'cal_month': '월', 'cal_day': '일', 'cal_create': '생성', 'cal_sun': '일', 'cal_mon': '월', 'cal_tue': '화', 'cal_wed': '수', 'cal_thu': '목', 'cal_fri': '금', 'cal_sat': '토',
        'hb_desc': '매일 좋은 습관을 기르세요.', 'hb_new': '새 습관', 'hb_daily': '일일 루틴', 'hb_all': '모두 보기', 'hb_pop': '인기 루틴 패키지',
        'td_desc': '작업과 마감일을 관리하세요.', 'td_new': '새 작업', 'td_list': '우선순위 작업 목록', 'td_active': '활성', 'td_add': '+ 새 작업 추가',
        'rm_title': '학습 여정 맵', 'rm_desc': '학기 목표를 시각화하세요.', 'rm_add': '목표 추가',
        'dash_title': '분석 요약', 'dash_desc': '생산성 통계 및 학습 성과.',
        'stat_xp': '총 포인트 / XP', 'stat_rank': '글로벌 순위', 'stat_rank_sub': '전체 사용자 중', 'stat_pomo': '뽀모도로 집중', 'stat_pomo_sub': '완료된 세션', 'stat_pred': 'AI 시험 준비', 'stat_pred_sub': '생성된 컬렉션', 'stat_skripsi': '논문 프로젝트', 'stat_skripsi_sub': '연구 문서', 'stat_drive': '저장소', 'stat_drive_sub': '업로드된 파일', 'stat_workspace': '워크스페이스', 'stat_work_sub': '노트 및 보드', 'stat_cal': '캘린더 일정', 'stat_cal_sub': '저장된 이벤트', 'stat_done': '완료된 작업', 'stat_done_sub': '완료된 할 일', 'stat_pend': '대기 중인 작업', 'stat_pend_sub': '실행 대기 중', 'stat_fin': '재정 잔액', 'stat_fin_sub': '남은 예산', 'stat_ipk': '현재 학점', 'stat_ipk_sub': '4.00 만점',
        'fin_title': '재정 관리', 'fin_rab': '예산 계획', 'fin_new': '새 거래', 'fin_in': '수입', 'fin_out': '지출', 'fin_bal': '잔액', 'fin_date': '날짜', 'fin_desc': '설명', 'fin_amount': '금액', 'fin_action': '작업',
        'ip_title': '학점 계산기', 'ip_add': '성적 추가', 'ip_cum': '누적 학점', 'ip_sks': '총 학점',
        'pomo_title': '학습 집중', 'pomo_desc': '세션 완료 (25분) = +10 XP!', 'pomo_start': '시작', 'pomo_reset': '초기화',
        'lb_title': '리더보드', 'lb_desc': '상위 50명의 학생', 'lb_xp': '총 XP', 'lb_streak': '연속 달성',
        'sr_desc': '친구를 찾고, 그룹을 만들고 협업하세요.', 'sr_friends': '친구', 'sr_groups': '스터디 그룹', 'sr_search': '친구 검색 (사용자명 / UID)', 'sr_search_ph': 'ID/이름 입력...', 'sr_req': '친구 요청', 'sr_req_empty': '새 요청이 없습니다.', 'sr_list': '친구 목록', 'sr_list_empty': '아직 친구가 없습니다.', 'sr_grp_new': '새 그룹 생성', 'sr_chat_ph': '메시지 입력...', 'sr_board': '작업 보드', 'sr_invite': '친구 초대',
        'so_desc': 'AI 기반 통합 스터디 룸.', 'so_tab_doc': '문서', 'so_tab_note': '노트 및 튜터', 'so_tab_mm': '마인드맵', 'so_tab_fc': '플래시카드', 'so_tab_quiz': 'AI 퀴즈', 'so_up_title': '학습 자료 업로드', 'so_up_desc': 'PDF/TXT/사진을 업로드하여 자료 생성.', 'so_btn_analisa': '분석 시작', 'so_up_support': '지원: PDF, TXT, PNG, JPG.',
        'pr_title': '시험 문제 예측', 'pr_desc': '과거 패턴 분석.', 'pr_col_title': '예측 컬렉션', 'pr_btn_new': '예측 생성', 'pr_empty': '예측이 없습니다. "+ 예측 생성"을 클릭하세요.',
        'th_title': '내 프로젝트', 'th_desc': '논문 구조 관리 및 구성', 'th_btn_new': '새 프로젝트',
        
        'set_title': '시스템 설정', 'set_desc': '인터페이스 및 언어 맞춤 설정.', 'set_theme': '개인화 및 디스플레이', 'set_mode': '디스플레이 모드', 'set_mode_desc': '테마 선택.', 'set_light': '라이트', 'set_dark': '다크', 'set_color': '포인트 색상', 'set_color_desc': '버튼의 주요 색상.', 'set_lang': '앱 언어', 'set_info': '정보 및 법률', 'set_about': '앱 정보', 'set_privacy': '개인정보 처리방침', 'set_terms': '이용 약관',
        'about_p1': 'Student Workspace v2.1.0은 학생들의 학업 생활 관리를 돕기 위해 특별히 설계된 올인원 생산성 플랫폼입니다.',
'about_p2': '최신 아키텍처(JavaScript 및 Supabase)로 구축된 이 앱은 성적 추적(GPA Tracker), 재무 관리, 시간 관리(Pomodoro) 및 협업 소셜 기능(Study Room)을 통합합니다.',
'about_p3': '우리의 사명은 캠퍼스 라이프를 디지털화하고 단순화하여 꿈을 이루는 데 더 집중할 수 있도록 하는 것입니다.',
'priv_t1': '1. 데이터 수집',
'priv_d1': '앱 내 양식을 통해 자발적으로 입력된 귀하의 계정과 관련된 데이터(이름, 대학교, 전공, 학업 성적)만 수집합니다.',
'priv_t2': '2. 데이터 보안',
'priv_d2': '모든 데이터는 Supabase PostgreSQL의 행 수준 보안(RLS)을 사용하여 안전하게 보호됩니다. 즉, 이 시스템의 다른 사용자가 귀하의 데이터에 액세스하거나 읽을 수 없습니다.',
'priv_t3': '3. 타사 사용',
'priv_d3': '귀하의 명시적인 동의 없이 개인 학업 데이터를 제3자에게 판매, 임대 또는 배포하지 않습니다.',
'term_t1': '1. 서비스 이용',
'term_d1': '이 서비스를 사용함으로써 귀하는 합법적인 학업 생산성 목적으로 이 앱을 사용하고 보안 취약점을 악용하지 않을 것에 동의합니다.',
'term_t2': '2. 계정 소유권',
'term_d2': '비밀번호 보안에 대한 전적인 책임은 귀하에게 있습니다. 개발팀은 로그인 자격 증명 공유 부주의로 인한 데이터 손실에 대해 책임을 지지 않습니다.',
'term_t3': '3. 서비스 가용성',
'term_d3': '이 애플리케이션은 아직 베타 단계이므로 정기적인 서버 유지 관리를 수행할 권리가 있으며, 이로 인해 일시적으로 애플리케이션에 액세스할 수 없을 수 있습니다.',
        // Help & Report
        'help_title': '도움말 및 지원',
        'help_category_label': '메시지 범주',
        'help_cat_bug': '버그 / 오류 보고',
        'help_cat_feature': '새로운 기능 제안',
        'help_cat_other': '기타',
        'help_msg_label': '메시지 내용',
        'help_msg_placeholder': '자세히 설명해주세요...',
        'help_btn_send': '보고서 보내기',
        'help_faq_title': '자주 묻는 질문 (FAQ)',
        'faq_1_q': '내 데이터는 어디에 저장되나요?',
        'faq_1_a': '모든 데이터는 업계 표준 암호화 기술이 적용된 클라우드 데이터베이스 시스템(Supabase)에 안전하게 저장됩니다.',
        'faq_2_q': '이 앱은 무료인가요?',
        'faq_2_a': '네, 현재 모든 기본 기능은 학습 생산성을 높이기 위해 무료로 제공됩니다.',
        'faq_3_q': 'AI 기능은 어떻게 사용하나요?',
        'faq_3_a': '제공된 양식에 지시사항을 입력하거나 파일을 업로드하기만 하면 AI 시스템이 자동으로 처리하여 결과를 제공합니다.',

        'btn_back': '뒤로', 'btn_understand': '이해했습니다', 'btn_save': '저장', 'btn_cancel': '취소', 'btn_close': '닫기', 'toast_lang': '언어가 업데이트되었습니다!',
        'm_th_title': '새 논문 프로젝트 생성', 'm_th_sub': 'AI가 연구 구조를 구성합니다.', 'm_th_l1': '연구 제목', 'm_th_p1': '예: AI가 미치는 영향...', 'm_th_l2': '주요 문제 진술', 'm_th_p2': '예: 정확도 수준은 어느 정도인가...', 'm_th_l3': '연구 목적', 'm_th_p3': '예: 효과를 확인하기 위해...', 'm_th_l4': '연구 방법 (요약)', 'm_th_p4': '예: 정량적 설문조사', 'm_th_btn': '구조 생성 (AI)',
        'm_fd_title': '새 폴더 생성', 'm_fd_ph': '폴더 이름', 'm_fd_btn': '폴더 생성',
        'm_up_title': '파일 업로드', 'm_up_l1': 'PC에서 파일 선택', 'm_up_l2': '다른 이름으로 저장', 'm_up_p2': '예: Final_Project.pdf', 'm_up_btn': '드라이브에 업로드',
        'm_prg_title': '업로드 중...', 'm_prg_text': '파일 준비 중...',
        'm_cal_pt': '제목 추가', 'm_cal_tz': '표준 시간대 • 반복 안 함', 'm_cal_pl': '위치 추가', 'm_cal_pd': '설명 추가', 'm_cal_col': '이벤트 색상', 'm_cal_b1': '30분 전', 'm_cal_b2': '1시간 전', 'm_cal_opt': '추가 옵션', 'm_cal_save': '저장',
        'm_pr_title': '새 예측 생성', 'm_pr_info': '과거 시험을 업로드하면 AI가 패턴을 분석하여 문제를 예측합니다.', 'm_pr_l1': '컬렉션 제목', 'm_pr_p1': '예: 미적분 예측 2026', 'm_pr_l2': '과목/코스', 'm_pr_p2': '예: 고급 수학', 'm_pr_l3': '시험 유형 (AI 난이도)', 'm_pr_o1': '연습 (기본/쉬움)', 'm_pr_o2': '퀴즈 (보통)', 'm_pr_o3': '중간고사 (어려움)', 'm_pr_o4': '기말고사 (매우 어려움)', 'm_pr_l4': '과거 시험 업로드 (AI 컨텍스트)', 'm_pr_sup': '*JPG/PNG, PDF, TXT 지원.', 'm_pr_btn': '분석 시작',
        'm_gt_title': '그룹 작업 생성', 'm_gt_l1': '작업 이름', 'm_gt_p1': '예: 챕터 1 PPT 생성', 'm_gt_l2': '담당자', 'm_gt_btn': '작업 추가',
        'm_inv_title': '친구 초대', 'm_inv_sub': '이 그룹에 추가할 친구 선택:', 'm_inv_btn': '그룹에 추가',
        'm_rab_title': '예산 계획표', 'm_rab_sub': '월별 지출을 예측하세요.', 'm_rab_add': '행 추가', 'm_rab_th1': '항목 이름', 'm_rab_th2': '예상 비용 (Rp)', 'm_rab_tot': '예상 총액:', 'm_rab_btn': '예산 저장',
        'm_usr_xp': '총 XP', 'm_usr_lvl': '레벨', 'm_usr_add': '친구 추가',
        'm_cg_title': '그룹 생성', 'm_cg_l1': '그룹/룸 이름', 'm_cg_p1': '예: 논문 파이터 2026', 'm_cg_l2': '설명 / 목표', 'm_cg_p2': '예: 공부하고 쉬는 곳', 'm_cg_l3': '친구 초대', 'm_cg_btn': '지금 생성',
        'm_hb_title': '습관 만들기', 'm_hb_ph': '일일 체크인', 'm_hb_fq': '빈도', 'm_hb_f1': '매일', 'm_hb_f2': '매주', 'm_hb_f3': '요일 선택 (사용자 지정)', 'm_hb_f4': '간격', 'm_hb_gl': '목표', 'm_hb_g1': '모두 달성', 'm_hb_g2': '하루 횟수', 'm_hb_g3': '회', 'm_hb_sd': '시작일', 'm_hb_gd': '목표 일수', 'm_hb_gd1': '영원히', 'm_hb_gd2': '7일', 'm_hb_gd3': '21일', 'm_hb_gd4': '30일', 'm_hb_gd5': '100일', 'm_hb_gd6': '사용자 지정', 'm_hb_gdp': '일수 입력 (예: 14)', 'm_hb_sec': '카테고리', 'm_hb_s1': '공부', 'm_hb_s2': '건강', 'm_hb_s3': '기타', 'm_hb_tm': '시간대', 'm_hb_t1': '언제나', 'm_hb_t2': '아침', 'm_hb_t3': '오후', 'm_hb_t4': '저녁', 'm_hb_rem': '알림', 'm_hb_chk': '자동 팝업 기록',
        'm_ob_t1': '환영합니다! 👋', 'm_ob_s1': '시작하기 전에 워크스페이스를 설정합시다.', 'm_ob_h1': '당신은 누구인가요?', 'm_ob_l1': '성명 / 닉네임', 'm_ob_p1': '예: 노발', 'm_ob_l2': '전문 분야 / 장래 직함', 'm_ob_p2': '예: 풀스택 개발자', 'm_ob_l3': '거주 도시', 'm_ob_p3': '예: 서울', 'm_ob_h2': '대학 및 비전', 'm_ob_l4': '대학교 이름', 'm_ob_p4': '예: 서울대학교', 'm_ob_l5': '전공 / 프로그램', 'm_ob_p5': '예: 컴퓨터 공학', 'm_ob_l6': '목표 학점', 'm_ob_l7': '졸업 연도', 'm_ob_btn': '모험 시작', 'm_ob_nt': '* 이 데이터는 나중에 설정에서 변경할 수 있습니다.',
        'm_ep_t1': '프로필 편집', 'm_ep_h1': '개인 정보', 'm_ep_pic': '프로필 사진', 'm_ep_pic_n': 'JPG/PNG 최대 2MB.', 'm_ep_l1': '사용자명 (@ 없이)', 'm_ep_l2': '역할 / 전문 분야', 'm_ep_h2': '학업 정보', 'm_ep_l3': '동아리 태그 (쉼표로 구분)', 'm_ep_p3': '예: 학생회', 'm_ep_h3': '목표 및 디지털 기록', 'm_ep_l4': '졸업 월/년', 'm_ep_p4': '예: 2026년 8월', 'm_ep_l5': '목표 시간/주', 'm_ep_l6': 'GitHub URL', 'm_ep_l7': '포트폴리오 URL', 'm_ep_sv': '변경 사항 저장',
        'm_tk_t1': '작업 추가', 'm_tk_l1': '작업 이름', 'm_tk_l2': '마감일', 'm_tk_btn': '저장',
        'm_fn_t1': '거래 추가', 'm_fn_l1': '유형', 'm_fn_o1': '수입', 'm_fn_o2': '지출', 'm_fn_l2': '금액', 'm_fn_l3': '메모', 'm_fn_btn': '저장',
        'm_rm_t1': '로드맵 목표 추가', 'm_rm_l1': '학기', 'm_rm_l2': '목표 학점', 'm_rm_l3': '달성 내용', 'm_rm_l4': '상태', 'm_rm_o1': '계획', 'm_rm_o2': '진행 중', 'm_rm_o3': '완료', 'm_rm_btn': '저장',
        'm_ip_t1': '과목 계산', 'm_ip_l1': '과목 학점', 'm_ip_l2': '과목명', 'm_ip_l3': '평가 항목 (합계 100%)', 'm_ip_add': '+ 항목 추가', 'm_ip_tot': '총 비중:', 'm_ip_btn': '저장 및 계산',
        'm_pw_t1': '비밀번호 변경', 'm_pw_l1': '새 비밀번호', 'm_pw_l2': '비밀번호 확인', 'm_pw_btn': '변경하기'
    },

    // 🇪🇸 SPANISH
    'es': { 
        'nav_apps': 'Todas las Apps', 'nav_dash': 'Panel Analítico', 'nav_study': 'Sala de Estudio', 'nav_set': 'Ajustes',
        'prof_edit': 'Editar Perfil', 'prof_active': 'Estudiante Activo', 'prof_aca': 'Exhibición Académica', 'prof_uni': 'Universidad', 'prof_major': 'Carrera', 'prof_stat': 'Estado', 'prof_org': 'Actividades y Orgs', 'prof_nodata': 'Sin datos', 'prof_vision': 'Tablero de Visión', 'prof_tar_ipk': 'GPA Objetivo', 'prof_est': 'Est. de Graduación', 'prof_tar_study': 'Meta de Estudio', 'prof_hr': 'Horas', 'prof_track': 'Historial de Actividad', 'prof_track_desc': 'Consistencia en completar metas diarias en los últimos 3 meses.', 'prof_chill': 'Relajado', 'prof_fire': '¡En Fuego!', 'prof_load': 'Cargando Datos...',
        'nav_profile': 'Ver Perfil', 'header_greeting': '¡Bienvenido de nuevo!', 'header_online': 'En línea', 'notif_title': 'Notificaciones', 'notif_read': 'Marcar como Leído', 'notif_empty': 'No hay notificaciones.',
        'app_super_dash': 'Súper Panel', 'app_super_desc': 'Accede a todas tus herramientas en un solo lugar. Desde tareas hasta preparación profesional.', 'app_cat_premium': 'Aplicaciones Premium (IA)', 'app_cat_daily': 'Productividad Diaria', 'app_cat_admin': 'Administración',
        'app_studyopang': 'StudyWithOpang', 'app_studyopang_desc': 'Asistente IA. Sube materiales para generar resúmenes, mapas y cuestionarios.', 'app_prediksi': 'Predicción de Examen', 'app_prediksi_desc': 'Analiza patrones para predecir preguntas.', 'app_skripsi': 'Tesis IA', 'app_skripsi_desc': 'Asistente para estructurar tu tesis.', 'app_leader': 'Clasificación', 'app_leader_desc': 'Top 50 Estudiantes',
        'app_title': 'Portal de Apps', 'app_desc': 'Acceso rápido. Arrastra y suelta las cajas para organizarlas.',
        'app_1': 'Pomodoro', 'app_1_desc': 'Enfoque y lofi.', 'app_2': 'Lista de Tareas', 'app_2_desc': 'Gestión de tareas.', 'app_3': 'Hábitos', 'app_3_desc': 'Rastreador de rutinas.', 'app_4': 'Calculadora GPA', 'app_4_desc': 'Calcula tu GPA.', 'app_5': 'Finanzas', 'app_5_desc': 'Flujo de caja.', 'app_6': 'Hoja de Ruta', 'app_6_desc': 'Meta semestral.', 'app_7': 'Espacio de Trabajo', 'app_7_desc': 'Notas y proyectos.', 'app_8': 'Drive', 'app_8_desc': 'Archivos.', 'app_9': 'Calendario', 'app_9_desc': 'Horario y recordatorios.',
        'ws_mypages': 'Mis Páginas', 'ws_tip': 'Tip: Haz clic en + para crear.', 'ws_empty': 'Selecciona o crea una página.',
        'dr_title': 'Almacenamiento Drive', 'dr_search': 'Buscar archivos...', 'dr_new': 'Nuevo', 'dr_new_folder': 'Nueva Carpeta', 'dr_up_file': 'Subir Archivo', 'dr_up_folder': 'Subir Carpeta',
        'cal_today': 'Hoy', 'cal_month': 'Mes', 'cal_day': 'Día', 'cal_create': 'Crear', 'cal_sun': 'DOM', 'cal_mon': 'LUN', 'cal_tue': 'MAR', 'cal_wed': 'MIE', 'cal_thu': 'JUE', 'cal_fri': 'VIE', 'cal_sat': 'SAB',
        'hb_desc': 'Construye buenos hábitos.', 'hb_new': 'Nuevo Hábito', 'hb_daily': 'Rutina Diaria', 'hb_all': 'Ver Todo', 'hb_pop': 'Paquetes de Rutinas',
        'td_desc': 'Gestiona tus plazos.', 'td_new': 'Nueva Tarea', 'td_list': 'Lista de Prioridades', 'td_active': 'Activo', 'td_add': '+ Añadir Tarea',
        'rm_title': 'Mapa de Viaje de Estudio', 'rm_desc': 'Visualiza tus metas.', 'rm_add': 'Añadir Meta',
        'dash_title': 'Resumen Analítico', 'dash_desc': 'Estadísticas de productividad y logros.',
        'stat_xp': 'PUNTOS TOTALES / XP', 'stat_rank': 'RANKING GLOBAL', 'stat_rank_sub': 'De Todos', 'stat_pomo': 'ENFOQUE POMODORO', 'stat_pomo_sub': 'Sesiones Completadas', 'stat_pred': 'PREP. IA', 'stat_pred_sub': 'Colecciones', 'stat_skripsi': 'PROYECTO TESIS', 'stat_skripsi_sub': 'Doc. Investigación', 'stat_drive': 'ALMACENAMIENTO', 'stat_drive_sub': 'Archivos', 'stat_workspace': 'ESPACIO TRABAJO', 'stat_work_sub': 'Notas', 'stat_cal': 'CALENDARIO', 'stat_cal_sub': 'Eventos Guardados', 'stat_done': 'TAREAS HECHAS', 'stat_done_sub': 'Completadas', 'stat_pend': 'TAREAS PENDIENTES', 'stat_pend_sub': 'En Espera', 'stat_fin': 'SALDO FINANCIERO', 'stat_fin_sub': 'Restante', 'stat_ipk': 'GPA ACTUAL', 'stat_ipk_sub': 'Escala 4.00',
        'fin_title': 'Finanzas', 'fin_rab': 'Plan de Presupuesto', 'fin_new': 'Nueva Transacción', 'fin_in': 'Ingresos', 'fin_out': 'Gastos', 'fin_bal': 'Saldo', 'fin_date': 'Fecha', 'fin_desc': 'Descripción', 'fin_amount': 'Monto', 'fin_action': 'Acción',
        'ip_title': 'Calculadora GPA', 'ip_add': 'Añadir Nota', 'ip_cum': 'GPA Acumulativo', 'ip_sks': 'Créditos Totales',
        'pomo_title': 'Enfoque de Estudio', 'pomo_desc': '¡Completa una sesión (25 Min) = +10 XP!', 'pomo_start': 'Iniciar', 'pomo_reset': 'Reiniciar',
        'lb_title': 'Clasificación', 'lb_desc': 'Los 50 mejores', 'lb_xp': 'XP Total', 'lb_streak': 'Racha',
        'sr_desc': 'Encuentra amigos y colabora.', 'sr_friends': 'Amigos', 'sr_groups': 'Grupos', 'sr_search': 'Buscar (Usuario / UID)', 'sr_search_ph': 'Ingresa ID/Nombre...', 'sr_req': 'Solicitudes', 'sr_req_empty': 'No hay solicitudes.', 'sr_list': 'Lista de Amigos', 'sr_list_empty': 'Sin amigos aún.', 'sr_grp_new': 'Crear Grupo', 'sr_chat_ph': 'Mensaje...', 'sr_board': 'Tablero de Tareas', 'sr_invite': 'Invitar Amigo',
        'so_desc': 'Sala de estudio con IA.', 'so_tab_doc': 'Documentos', 'so_tab_note': 'Notas', 'so_tab_mm': 'Mapa Mental', 'so_tab_fc': 'Flashcards', 'so_tab_quiz': 'Cuestionario IA', 'so_up_title': 'Subir Material', 'so_up_desc': 'Sube PDF/TXT/Foto para generar recursos con IA.', 'so_btn_analisa': 'Iniciar Análisis', 'so_up_support': 'Soporta: PDF, TXT, PNG, JPG.',
        'pr_title': 'Predicción de Examen', 'pr_desc': 'Analiza patrones pasados.', 'pr_col_title': 'Colección', 'pr_btn_new': 'Crear Predicción', 'pr_empty': 'No hay predicciones. Haz clic en "+ Crear".',
        'th_title': 'Tus Proyectos', 'th_desc': 'Gestiona tu estructura de tesis', 'th_btn_new': 'Nuevo Proyecto',
        
        'set_title': 'Ajustes del Sistema', 'set_desc': 'Personaliza tu interfaz y preferencias.', 'set_theme': 'Personalización', 'set_mode': 'Modo', 'set_mode_desc': 'Elige tema claro u oscuro.', 'set_light': 'Claro', 'set_dark': 'Oscuro', 'set_color': 'Color de Acento', 'set_color_desc': 'Color dominante.', 'set_lang': 'Idioma', 'set_info': 'Información Legal', 'set_about': 'Acerca de', 'set_privacy': 'Privacidad', 'set_terms': 'Términos',
        'about_p1': 'Student Workspace v2.1.0 es una plataforma de productividad todo en uno diseñada específicamente para ayudar a los estudiantes a gestionar su vida académica.',
'about_p2': 'Construida con arquitectura moderna (JavaScript y Supabase), esta aplicación integra el seguimiento de calificaciones (GPA Tracker), gestión financiera, gestión del tiempo (Pomodoro) y funciones sociales colaborativas (Study Room).',
'about_p3': 'Nuestra misión es digitalizar y simplificar la vida universitaria para que puedas concentrarte más en alcanzar tus sueños.',
'priv_t1': '1. Recopilación de Datos',
'priv_d1': 'Solo recopilamos datos relevantes para tu cuenta (Nombre, Universidad, Carrera, Calificaciones Académicas) ingresados voluntariamente a través de formularios en la aplicación.',
'priv_t2': '2. Seguridad de Datos',
'priv_d2': 'Todos los datos están protegidos mediante Seguridad a Nivel de Fila (RLS) de Supabase PostgreSQL, lo que significa que otros usuarios en este sistema no pueden acceder ni leer tus datos.',
'priv_t3': '3. Uso de Terceros',
'priv_d3': 'Nunca venderemos, alquilaremos ni distribuiremos tus datos académicos personales a ningún tercero sin tu consentimiento explícito.',
'term_t1': '1. Uso del Servicio',
'term_d1': 'Al utilizar este servicio, aceptas usar esta aplicación para fines legítimos de productividad académica y no explotar ninguna vulnerabilidad de seguridad.',
'term_t2': '2. Propiedad de la Cuenta',
'term_d2': 'Eres totalmente responsable de la seguridad de tu contraseña. El Equipo de Desarrolladores no se hace responsable de la pérdida de datos debido a negligencia al compartir credenciales de inicio de sesión.',
'term_t3': '3. Disponibilidad del Servicio',
'term_d3': 'Dado que esta aplicación aún se encuentra en fase Beta, nos reservamos el derecho de realizar un mantenimiento periódico del servidor que puede causar que la aplicación sea temporalmente inaccesible.',
        // Help & Report
        'help_title': 'Ayuda y Reportes',
        'help_category_label': 'Categoría del Mensaje',
        'help_cat_bug': 'Reportar Error / Bug',
        'help_cat_feature': 'Sugerir Nueva Función',
        'help_cat_other': 'Otros',
        'help_msg_label': 'Tu Mensaje',
        'help_msg_placeholder': 'Explica en detalle...',
        'help_btn_send': 'Enviar Reporte',
        'help_faq_title': 'Preguntas Frecuentes (FAQ)',
        'faq_1_q': '¿Dónde se almacenan mis datos?',
        'faq_1_a': 'Todos tus datos se almacenan de forma segura mediante un sistema de base de datos en la nube (Supabase) con cifrado estándar de la industria.',
        'faq_2_q': '¿Esta aplicación es gratis?',
        'faq_2_a': 'Sí, actualmente todas las funciones básicas se pueden usar de forma gratuita para aumentar tu productividad de aprendizaje.',
        'faq_3_q': '¿Cómo usar las funciones de IA?',
        'faq_3_a': 'Simplemente ingresa tus instrucciones o sube archivos en el formulario proporcionado, y nuestro sistema de IA los procesará automáticamente y entregará los resultados.',

        'btn_back': 'Atrás', 'btn_understand': 'Entendido', 'btn_save': 'Guardar', 'btn_cancel': 'Cancelar', 'btn_close': 'Cerrar', 'toast_lang': '¡Idioma actualizado!',
        'm_th_title': 'Crear Proyecto de Tesis', 'm_th_sub': 'La IA estructurará tu investigación.', 'm_th_l1': 'Título de Investigación', 'm_th_p1': 'Ej: Impacto de la IA en...', 'm_th_l2': 'Problema Principal', 'm_th_p2': 'Ej: Cuál es el nivel de...', 'm_th_l3': 'Objetivos', 'm_th_p3': 'Ej: Determinar la efectividad...', 'm_th_l4': 'Metodología', 'm_th_p4': 'Ej: Cuestionario', 'm_th_btn': 'Generar Estructura (IA)',
        'm_fd_title': 'Nueva Carpeta', 'm_fd_ph': 'Nombre', 'm_fd_btn': 'Crear',
        'm_up_title': 'Subir Archivo', 'm_up_l1': 'Elegir archivo', 'm_up_l2': 'Guardar como', 'm_up_p2': 'Ej: Final.pdf', 'm_up_btn': 'Subir a Drive',
        'm_prg_title': 'Subiendo...', 'm_prg_text': 'Preparando...',
        'm_cal_pt': 'Título', 'm_cal_tz': 'Zona horaria • No se repite', 'm_cal_pl': 'Ubicación', 'm_cal_pd': 'Descripción', 'm_cal_col': 'Color', 'm_cal_b1': '30 minutos antes', 'm_cal_b2': '1 hora antes', 'm_cal_opt': 'Más opciones', 'm_cal_save': 'Guardar',
        'm_pr_title': 'Crear Predicción', 'm_pr_info': 'Sube exámenes y la IA predecirá preguntas.', 'm_pr_l1': 'Título', 'm_pr_p1': 'Ej: Cálculo 2026', 'm_pr_l2': 'Materia', 'm_pr_p2': 'Ej: Matemáticas', 'm_pr_l3': 'Dificultad IA', 'm_pr_o1': 'Fácil', 'm_pr_o2': 'Intermedio', 'm_pr_o3': 'Difícil', 'm_pr_o4': 'Muy Difícil', 'm_pr_l4': 'Subir Exámenes Anteriores', 'm_pr_sup': '*Soporta JPG/PNG, PDF o TXT.', 'm_pr_btn': 'Analizar',
        'm_gt_title': 'Crear Tarea', 'm_gt_l1': 'Nombre', 'm_gt_p1': 'Ej: Hacer PPT', 'm_gt_l2': 'Asignar a', 'm_gt_btn': 'Añadir',
        'm_inv_title': 'Invitar Amigos', 'm_inv_sub': 'Selecciona amigos:', 'm_inv_btn': 'Añadir al Grupo',
        'm_rab_title': 'Plan de Presupuesto', 'm_rab_sub': 'Predice tus gastos aquí.', 'm_rab_add': 'Añadir Fila', 'm_rab_th1': 'Ítem', 'm_rab_th2': 'Costo', 'm_rab_tot': 'TOTAL:', 'm_rab_btn': 'Guardar',
        'm_usr_xp': 'XP Total', 'm_usr_lvl': 'Nivel', 'm_usr_add': 'Añadir Amigo',
        'm_cg_title': 'Crear Grupo', 'm_cg_l1': 'Nombre', 'm_cg_p1': 'Ej: Tesis 2026', 'm_cg_l2': 'Descripción', 'm_cg_p2': 'Ej: Grupo de estudio', 'm_cg_l3': 'Invitar', 'm_cg_btn': 'Crear Ahora',
        'm_hb_title': 'Crear Hábito', 'm_hb_ph': 'Check-in Diario', 'm_hb_fq': 'Frecuencia', 'm_hb_f1': 'Diario', 'm_hb_f2': 'Semanal', 'm_hb_f3': 'Elegir Días', 'm_hb_f4': 'Intervalo', 'm_hb_gl': 'Meta', 'm_hb_g1': 'Lograr todo', 'm_hb_g2': 'Veces al día', 'm_hb_g3': 'Veces', 'm_hb_sd': 'Fecha de Inicio', 'm_hb_gd': 'Días Meta', 'm_hb_gd1': 'Siempre', 'm_hb_gd2': '7 días', 'm_hb_gd3': '21 días', 'm_hb_gd4': '30 días', 'm_hb_gd5': '100 días', 'm_hb_gd6': 'Personalizado', 'm_hb_gdp': 'Ej: 14', 'm_hb_sec': 'Categoría', 'm_hb_s1': 'Estudio', 'm_hb_s2': 'Salud', 'm_hb_s3': 'Otros', 'm_hb_tm': 'Tiempo', 'm_hb_t1': 'Cualquier hora', 'm_hb_t2': 'Mañana', 'm_hb_t3': 'Tarde', 'm_hb_t4': 'Noche', 'm_hb_rem': 'Recordatorio', 'm_hb_chk': 'Pop-up automático',
        'm_ob_t1': '¡Bienvenido! 👋', 'm_ob_s1': 'Configuremos tu espacio.', 'm_ob_h1': '¿Quién eres?', 'm_ob_l1': 'Nombre', 'm_ob_p1': 'Ej: Nouval', 'm_ob_l2': 'Especialización', 'm_ob_p2': 'Ej: Desarrollador', 'm_ob_l3': 'Ciudad', 'm_ob_p3': 'Ej: Madrid', 'm_ob_h2': 'Universidad y Visión', 'm_ob_l4': 'Universidad', 'm_ob_p4': 'Ej: Univ. Complutense', 'm_ob_l5': 'Carrera', 'm_ob_p5': 'Ej: Informática', 'm_ob_l6': 'GPA Objetivo', 'm_ob_l7': 'Año de Graduación', 'm_ob_btn': 'Comenzar', 'm_ob_nt': '* Puedes cambiar esto luego.',
        'm_ep_t1': 'Editar Perfil', 'm_ep_h1': 'Identidad', 'm_ep_pic': 'Foto', 'm_ep_pic_n': 'Máx 2MB.', 'm_ep_l1': 'Usuario (Sin @)', 'm_ep_l2': 'Rol', 'm_ep_h2': 'Info Académica', 'm_ep_l3': 'Etiquetas (Comas)', 'm_ep_p3': 'Ej: Consejo', 'm_ep_h3': 'Objetivos', 'm_ep_l4': 'Graduación', 'm_ep_p4': 'Ej: Ago 2026', 'm_ep_l5': 'Horas/Semana', 'm_ep_l6': 'GitHub', 'm_ep_l7': 'Portafolio', 'm_ep_sv': 'Guardar',
        'm_tk_t1': 'Añadir Tarea', 'm_tk_l1': 'Nombre', 'm_tk_l2': 'Plazo', 'm_tk_btn': 'Guardar',
        'm_fn_t1': 'Añadir Transacción', 'm_fn_l1': 'Tipo', 'm_fn_o1': 'Ingreso', 'm_fn_o2': 'Gasto', 'm_fn_l2': 'Monto', 'm_fn_l3': 'Nota', 'm_fn_btn': 'Guardar',
        'm_rm_t1': 'Añadir Meta', 'm_rm_l1': 'Semestre', 'm_rm_l2': 'Créditos', 'm_rm_l3': 'Logro', 'm_rm_l4': 'Estado', 'm_rm_o1': 'Plan', 'm_rm_o2': 'En curso', 'm_rm_o3': 'Hecho', 'm_rm_btn': 'Guardar',
        'm_ip_t1': 'Cálculo de Materia', 'm_ip_l1': 'Créditos', 'm_ip_l2': 'Materia', 'm_ip_l3': 'Aspectos (100%)', 'm_ip_add': '+ Añadir', 'm_ip_tot': 'Peso Total:', 'm_ip_btn': 'Calcular',
        'm_pw_t1': 'Cambiar Contraseña', 'm_pw_l1': 'Nueva Contraseña', 'm_pw_l2': 'Confirmar', 'm_pw_btn': 'Cambiar'
    }
};

/* ENGINE EKSEKUTOR TRANSLASI */
window.applyLanguage = function(lang) {
    const texts = window.i18nKamus[lang] || window.i18nKamus['id'];
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (texts[key]) el.textContent = texts[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (texts[key]) el.setAttribute('placeholder', texts[key]);
    });
    
    // Auto-update HTML lang attribute (Bagus untuk SEO/Aksesibilitas)
    document.documentElement.lang = lang;
};

/* FUNGSI BANTUAN UNTUK JAVASCRIPT (SEPERTI TOAST/ALERT) */
window.getI18nText = function(key) {
    const lang = localStorage.getItem('app_language') || 'id';
    const texts = window.i18nKamus[lang] || window.i18nKamus['id'];
    return texts[key] || key;
};

window.applyLanguage = function(lang) {
    const texts = window.i18nKamus[lang] || window.i18nKamus['id'];
    
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (texts[key]) el.textContent = texts[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (texts[key]) el.setAttribute('placeholder', texts[key]);
    });
};

window.getI18nText = function(key) {
    const lang = localStorage.getItem('app_language') || 'id';
    const texts = window.i18nKamus[lang] || window.i18nKamus['id'];
    return texts[key] || key;
};

// ==========================================
// INISIALISASI & LISTENER PENGATURAN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Eksekusi Pertama Kali (Menarik dari LocalStorage)
    const savedColor = localStorage.getItem('app_theme_color') || 'emerald';
    const savedDark = localStorage.getItem('app_dark_mode') === 'true';
    const savedLang = localStorage.getItem('app_language') || 'id';
    
    applyThemeColor(savedColor);
    applyDarkMode(savedDark);
    setTimeout(() => applyLanguage(savedLang), 500); // Jeda agar HTML selesai dimuat

    // 2. Listener Tema Warna
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const color = e.target.dataset.color;
            localStorage.setItem('app_theme_color', color);
            applyThemeColor(color);
            
            // Perbarui UI lingkaran indikator
            document.querySelectorAll('.theme-color-btn').forEach(b => {
                b.className = `theme-color-btn size-6 rounded-full bg-${b.dataset.color}-500 hover:scale-110 cursor-pointer transition-all`;
            });
            e.target.classList.add('ring-2', 'ring-offset-2', `ring-${color}-500`);
            e.target.classList.remove('hover:scale-110');
        });
    });

    // 3. Listener Dark Mode
    document.getElementById('btn-theme-light')?.addEventListener('click', (e) => {
        localStorage.setItem('app_dark_mode', 'false');
        applyDarkMode(false);
        e.currentTarget.classList.add('bg-white', 'text-gray-800');
        e.currentTarget.classList.remove('text-gray-500', 'hover:text-gray-800');
        document.getElementById('btn-theme-dark').classList.remove('bg-gray-800', 'text-white');
        document.getElementById('btn-theme-dark').classList.add('text-gray-500');
    });

    document.getElementById('btn-theme-dark')?.addEventListener('click', (e) => {
        localStorage.setItem('app_dark_mode', 'true');
        applyDarkMode(true);
        e.currentTarget.classList.add('bg-gray-800', 'text-white');
        e.currentTarget.classList.remove('text-gray-500');
        document.getElementById('btn-theme-light').classList.remove('bg-white', 'text-gray-800');
        document.getElementById('btn-theme-light').classList.add('text-gray-500');
    });

    // 4. FIX UI: KLIK PILIHAN BAHASA
    const langRadios = document.querySelectorAll('input[name="lang"]');
    
    // Fungsi khusus untuk mewarnai label bahasa yang dipilih
    const updateLangUI = (selectedRadio) => {
        // Reset warna semua label bahasa ke bawaan (abu-abu)
        document.querySelectorAll('input[name="lang"]').forEach(r => {
            const label = r.parentElement;
            const span = r.nextElementSibling;
            label.style.borderColor = ''; // Hapus border
            label.style.backgroundColor = 'transparent'; // Hapus background
            span.style.color = ''; // Hapus warna teks
            label.classList.remove('border-indigo-500', 'bg-indigo-50'); // Bersihkan class lama
        });
        
        // Nyalakan label yang dipilih SESUAI TEMA AKSEN yang sedang aktif
        const activeLabel = selectedRadio.parentElement;
        const activeSpan = selectedRadio.nextElementSibling;
        activeLabel.style.borderColor = 'var(--theme-main)';
        activeLabel.style.backgroundColor = 'var(--theme-active-bg)';
        activeSpan.style.color = 'var(--theme-main)';
    };

    langRadios.forEach(radio => {
        // Set state awal saat web dibuka
        if(radio.value === savedLang) {
            radio.checked = true;
            setTimeout(() => updateLangUI(radio), 150); // Jeda sedikit agar CSS variable termuat
        }
        
        // Saat diklik
        radio.addEventListener('change', (e) => {
            if (e.target.checked) {
                const lang = e.target.value;
                localStorage.setItem('app_language', lang);
                applyLanguage(lang);
                updateLangUI(e.target); // Panggil fungsi perubah warna UI!
                if(typeof window.showToast === 'function') window.showToast('Bahasa diperbarui!', 'success');
            }
        });
    });

    // 5. Listener Drag & Drop Gateway
    document.getElementById('btn-edit-layout')?.addEventListener('click', () => {
        enableAppGatewayDragDrop();
        if(typeof window.showToast === 'function') window.showToast('Mode Edit aktif! Buka "Semua Aplikasi" dan seret kotaknya.', 'success');
    });
});

/* =======================================
   FUNGSI PEMUAT DAFTAR RUANG KERJA
======================================= */
window.loadWorkspacePages = async function() {
    const listContainer = document.getElementById('workspace-pages-list');
    if (!listContainer || !window.dbUser || !window.dbUser.id) return;

    try {
        const { data, error } = await supabaseClient
            .from('workspace_pages')
            .select('*')
            .eq('user_id', window.dbUser.id) 
            .order('created_at', { ascending: false });

        if (error) throw error;
        listContainer.innerHTML = '';

        if (data && data.length > 0) {
            data.forEach(page => {
                const item = document.createElement('div');
                item.className = "flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl cursor-pointer group transition mb-1 border border-transparent hover:border-gray-200";
                
                const iconName = page.type === 'note' ? 'file-text' : 'layout';
                
                item.innerHTML = `
                    <div class="flex items-center gap-3 overflow-hidden flex-1" onclick="if(typeof openWorkspacePage === 'function') openWorkspacePage(${page.id})">
                        <div class="p-2 bg-primary/10 text-primary rounded-lg">
                            <i data-lucide="${iconName}" class="size-4"></i>
                        </div>
                        <span class="text-sm font-medium truncate">${page.title}</span>
                    </div>
                    
                    <button onclick="event.stopPropagation(); deleteWorkspacePage(${page.id})" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition opacity-0 group-hover:opacity-100 tooltip shrink-0" title="Hapus Permanen">
                        <i data-lucide="trash-2" class="size-4"></i>
                    </button>
                `;
                listContainer.appendChild(item);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } else {
            listContainer.innerHTML = '<p class="text-xs text-secondary text-center py-6 italic">Belum ada catatan di sini.</p>';
        }
    } catch (err) {
        console.error("Gagal memuat daftar workspace:", err);
    }
};

/* =======================================
   🔥 FUNGSI PENGHANCUR RUANG KERJA 🔥
======================================= */
window.deleteWorkspacePage = async function(pageId) {
    if (!confirm("⚠️ PERINGATAN! Yakin ingin menghapus halaman ini secara permanen?")) return;
    
    try {
        // 1. Tembak perintah DELETE ke Supabase
        const { error } = await supabaseClient.from('workspace_pages').delete().eq('id', pageId);
        if (error) throw error;

        // 2. Beri Notifikasi
        if (typeof window.showToast === 'function') window.showToast("Halaman berhasil dibakar!", "success");
        
        // 3. Render ulang list (Agar hantu tidak kembali)
        window.loadWorkspacePages();
        
        // 4. Update angka di Dashboard
        if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
        
        // 5. Tutup layar editor jika halaman yang dihapus sedang dibuka
        if (window.currentWorkspacePageId === pageId) {
            const editorArea = document.getElementById('workspace-editor-area');
            const emptyState = document.getElementById('workspace-empty-state');
            if (editorArea) editorArea.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            window.currentWorkspacePageId = null;
        }

    } catch (err) {
        console.error("Gagal menghapus:", err);
        if (typeof window.showToast === 'function') window.showToast("Gagal menghapus halaman dari server.", "error");
    }
};

// ==========================================
// KOTAK HITAM: GLOBAL ERROR LOGGER
// ==========================================
window.addEventListener('error', function(event) {
    console.error("CRITICAL UI ERROR:", event.error);
    if(typeof window.showToast === 'function') {
        window.showToast("Terjadi gangguan sistem UI. Coba muat ulang halaman.", "error");
    }
});

window.addEventListener('unhandledrejection', function(event) {
    console.error("CRITICAL NETWORK ERROR:", event.reason);
    // Jangan tampilkan toast untuk error jaringan kecil agar tidak mengganggu user
    if(event.reason && event.reason.message && event.reason.message.includes('Failed to fetch')) return;
    
    if(typeof window.showToast === 'function') {
        window.showToast("Gagal memproses data. Cek koneksi internet Anda.", "error");
    }
});

// ==========================================
// FUNGSI MANAJEMEN AKUN (ZONA BERBAHAYA)
// ==========================================

// 1. Hubungkan tombol Logout di Pengaturan ke fungsi Logout bawaan
document.addEventListener('DOMContentLoaded', () => {
    const btnSettingsLogout = document.getElementById('btn-settings-logout');
    if (btnSettingsLogout) {
        btnSettingsLogout.addEventListener('click', async () => {
            btnSettingsLogout.innerHTML = '<i class="animate-spin size-4" data-lucide="loader-2"></i> Keluar...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            await window.supabaseClient.auth.signOut();
            window.location.href = 'login.html';
        });
    }
});

// 2. Fungsi Eksekusi Hapus Akun Permanen
window.deleteMyAccount = async function() {
    // Peringatan Lapis 1
    const confirm1 = confirm("⚠️ PERINGATAN ZONA BERBAHAYA!\n\nApakah Anda yakin ingin menghapus akun ini? Seluruh data, tugas, keuangan, dan catatan Anda akan ikut terhapus dan TIDAK BISA dikembalikan.");
    if (!confirm1) return;

    // Peringatan Lapis 2 (Ketik Konfirmasi)
    const confirm2 = prompt("Untuk melanjutkan, ketik kata 'HAPUS' di bawah ini:");
    if (confirm2 !== 'HAPUS') {
        if(typeof window.showToast === 'function') window.showToast("Penghapusan akun dibatalkan.", "info");
        return;
    }

    try {
        if(typeof window.showToast === 'function') window.showToast("Sedang menghapus akun...", "warning");

        // Hapus data pengguna dari tabel publik 'users'
        // Catatan: Jika database memiliki aturan 'ON DELETE CASCADE', semua data terkait (tugas, dll) akan otomatis bersih.
        const { error: dbError } = await window.supabaseClient
            .from('users')
            .delete()
            .eq('id', window.dbUser.id);
            
        if (dbError) throw dbError;

        // Sign Out paksa untuk menghapus sesi dari Browser
        await window.supabaseClient.auth.signOut();
        
        alert("Akun Anda telah berhasil dihapus. Terima kasih telah menggunakan layanan kami.");
        window.location.href = 'login.html'; // Lempar kembali ke halaman login

    } catch (err) {
        console.error("Gagal menghapus akun:", err);
        if(typeof window.showToast === 'function') {
            window.showToast("Gagal menghapus akun: " + err.message, "error");
        } else {
            alert("Terjadi kesalahan saat menghapus akun.");
        }
    }
}

/* =======================================
   🔥 FUNGSI PENGHANCUR RUANG KERJA (REVISI INSTAN) 🔥
======================================= */
window.deleteWorkspacePage = async function(pageId) {
    if (!confirm("⚠️ PERINGATAN! Yakin ingin menghapus halaman ini secara permanen?")) return;
    
    // 1. (Optimistic Update) Lenyapkan dari layar sekarang juga! (Biar tidak ada jeda loading)
    const btnDelete = document.querySelector(`button[onclick*="deleteWorkspacePage(${pageId})"]`);
    if (btnDelete) {
        const cardItem = btnDelete.closest('.flex.items-center');
        if (cardItem) cardItem.classList.add('hidden');
    }

    try {
        // 2. Tembak perintah DELETE ke Supabase dan paksa kirim laporan (.select())
        const { data, error } = await window.supabaseClient
            .from('workspace_pages')
            .delete()
            .eq('id', pageId)
            .select(); // Penting: Untuk mengecek apakah RLS memblokirnya

        if (error) throw error;

        // 3. Jika data kosong, berarti RLS Supabase diam-diam memblokir penghapusan
        if (!data || data.length === 0) {
            console.warn("Halaman tidak terhapus di Database! Terhalang RLS.");
            if (typeof window.showToast === 'function') window.showToast("Gagal! Terhalang sistem keamanan (RLS) Database.", "warning");
            
            // Munculkan kembali hantunya karena gagal dibakar di server
            if (btnDelete) btnDelete.closest('.flex.items-center').classList.remove('hidden');
            return;
        }

        // 4. Beri Notifikasi Sukses
        if (typeof window.showToast === 'function') window.showToast("Halaman berhasil dibakar permanen!", "success");
        
        // 5. Update angka di Dashboard Analitik seketika
        if (typeof window.loadDashboardStats === 'function') window.loadDashboardStats();
        
        // 6. Tutup layar editor jika halaman yang dihapus sedang dibuka
        if (window.currentWorkspacePageId === pageId) {
            const editorArea = document.getElementById('workspace-editor-area');
            const emptyState = document.getElementById('workspace-empty-state');
            if (editorArea) editorArea.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            window.currentWorkspacePageId = null;
        }

    } catch (err) {
        console.error("Gagal menghapus:", err);
        if (typeof window.showToast === 'function') window.showToast("Gagal menghapus halaman dari server.", "error");
        // Segarkan ulang daftar jika terjadi error jaringan
        if (typeof window.loadWorkspacePages === 'function') window.loadWorkspacePages();
    }
};

document.addEventListener("DOMContentLoaded", () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    } else {
        setTimeout(() => { if (typeof lucide !== 'undefined') lucide.createIcons(); }, 1000);
    }
});

    // Set default tanggal hari ini
    document.addEventListener('DOMContentLoaded', () => {
        const dateInput = document.getElementById('hb-start-date');
        if (dateInput) {
            const tzoffset = (new Date()).getTimezoneOffset() * 60000;
            const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().split('T')[0];
            dateInput.value = localISOTime;
        }
    });

    // Menampilkan Gelembung Hari
    function toggleFreqDays(val) {
        const specificDiv = document.getElementById('hb-freq-specific');
        if(val === 'specific') {
            specificDiv.classList.remove('hidden');
            specificDiv.classList.add('flex');
        } else {
            specificDiv.classList.add('hidden');
            specificDiv.classList.remove('flex');
        }
    }

    // Menampilkan Input Target Kali/Hari
    function toggleGoalCount(val) {
        const wrap = document.getElementById('hb-goal-wrapper');
        if(val === 'times') {
            wrap.classList.remove('hidden');
            wrap.classList.add('flex');
            document.getElementById('hb-goal-count').focus();
        } else {
            wrap.classList.add('hidden');
            wrap.classList.remove('flex');
        }
    }

    // Menampilkan Input Hari Custom
    function toggleCustomDays(val) {
        const customInput = document.getElementById('hb-custom-days');
        if(val === 'custom') {
            customInput.classList.remove('hidden');
            customInput.focus();
        } else {
            customInput.classList.add('hidden');
        }
    }

    // Menambah Waktu Reminder
    function addReminderField() {
        const container = document.getElementById('hb-reminder-container');
        const newDiv = document.createElement('div');
        newDiv.className = 'flex items-center gap-2 reminder-item mt-1 animate-pulse';
        newDiv.innerHTML = `
            <input type="time" value="09:00" class="hb-reminder-input bg-gray-50 border border-border rounded-xl px-3 py-2 text-sm font-semibold outline-none focus:border-primary hover:bg-gray-100 transition">
            <button type="button" onclick="this.parentElement.remove()" class="flex items-center justify-center size-9 bg-red-50 border border-red-100 hover:bg-red-100 rounded-xl text-red-500 transition cursor-pointer"><i data-lucide="minus" class="size-4"></i></button>
        `;
        container.appendChild(newDiv);
        setTimeout(() => newDiv.classList.remove('animate-pulse'), 300);
        if(typeof lucide !== 'undefined') lucide.createIcons();
    }