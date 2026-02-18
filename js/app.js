// js/app.js
import { supabaseClient } from './supabase.js';

// ==========================================
// STATE LOKAL & KONSTANTA
// ==========================================
let dbUser = null; 
let myCharts = {}; 
// Cache untuk notifikasi latar belakang (Auto-Check)
let localCache = { tasks: [], financeBalance: 0, _reminded: {}, _warnedBalance: false };

// State untuk StudyWithOpang
let flashcards = [];
let currentQuiz = [];
let uploadedContent = '';

// ==========================================
// FUNGSI UI GLOBAL
// ==========================================
window.openModal = function(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById(id).classList.add('flex');
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

  // =======================================
  // FITUR PENCARIAN APLIKASI (LIVE SEARCH)
  // =======================================
  const appSearchInput = document.querySelector('#section-apps input[type="text"]');
  if (appSearchInput) {
    appSearchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase();
      // Ambil semua container kategori (div mb-8 yang bukan header/pencarian)
      const categories = document.querySelectorAll('#section-apps > div.mb-8:not(:first-child)');
      
      categories.forEach(category => {
        let hasVisibleApp = false;
        // Cari semua tombol aplikasi di dalam kategori tersebut
        const apps = category.querySelectorAll('button.nav-btn');
        
        apps.forEach(app => {
          const titleText = app.querySelector('h4')?.textContent.toLowerCase() || '';
          const descText = app.querySelector('p')?.textContent.toLowerCase() || '';
          
          // Jika cocok dengan pencarian
          if (titleText.includes(keyword) || descText.includes(keyword)) {
            app.style.display = ''; // Munculkan (kembali ke default class CSS nya)
            hasVisibleApp = true;
          } else {
            app.style.display = 'none'; // Sembunyikan
          }
        });
        
        // Sembunyikan seluruh kategori ("Akademik", dll) jika semua aplikasinya disembunyikan
        category.style.display = hasVisibleApp ? '' : 'none';
      });
    });
  }

  // =======================================
  // NAVIGASI MENU UTAMA
  // =======================================
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Auto-close sidebar jika layar mobile (di bawah 1024px)
      if(window.innerWidth < 1024 && !document.getElementById('sidebar').classList.contains('-translate-x-full')) {
        window.toggleSidebar();
      }

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
        if (target === 'tasks') loadTasks();
        if (target === 'finance') loadFinance();
        if (target === 'roadmap') loadRoadmap();
        if (target === 'iptracker') loadIpTracker();
        if (target === 'habits') loadHabitsPage();
        if (target === 'leaderboard') renderLeaderboard();
        if (target === 'studywithopang') loadFlashcards();
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
    const { data: userData, error: userError } = await supabaseClient.from('users').select('*').eq('email', session.user.email).single();
    if (userError || !userData) { alert("Profil tidak ditemukan."); return; }
    
    dbUser = userData; 

    if (dbUser.is_onboarded === false || dbUser.is_onboarded === null) {
        document.getElementById('ob-username').value = dbUser.username || '';
        window.openModal('modal-onboarding');
    } else {
        applyUserInfoToUI();
        loadDashboardStats();
    }
  } catch (err) { console.error(err); }

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

    const obUser = document.getElementById('ob-username').value.trim();
    const obSchool = document.getElementById('ob-school').value.trim();
    const obMajor = document.getElementById('ob-major').value.trim();
    const obSem = parseInt(document.getElementById('ob-semester').value) || 1;

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
     LEADERBOARD (PAPAN PERINGKAT)
  ======================================= */
  async function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    list.innerHTML = `<p class="text-gray-500 text-center text-xs">Memuat data Leaderboard...</p>`;

    const { data, error } = await supabaseClient.from('users')
      .select('username, points, tasks_completed, pomodoro_done')
      .order('points', { ascending: false })
      .limit(10);

    if (error) { list.innerHTML = `<p class="text-red-500 text-center text-xs">❌ Gagal memuat.</p>`; return; }

    list.innerHTML = '';
    if (data.length === 0) { list.innerHTML = `<p class="text-gray-500 text-center text-xs">Belum ada data poin.</p>`; return; }

    data.forEach((r, i) => {
      const rank = i + 1;
      const rankColor = rank === 1 ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : (rank === 2 ? 'bg-gray-100 text-gray-700 border-gray-300' : (rank === 3 ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-gray-50 text-foreground border-border'));
      list.innerHTML += `
        <div class="p-3 rounded-xl border ${rankColor} flex justify-between items-center mb-2 shadow-sm">
            <div class="flex items-center gap-3"><span class="text-lg font-black w-6 text-center">${rank}</span><span class="font-bold text-sm">${r.username}</span></div>
            <div class="text-right"><div class="font-black text-lg">${r.points || 0} <span class="text-[10px] font-medium uppercase">Poin</span></div><div class="text-[10px] opacity-80">Tugas: ${r.tasks_completed || 0} | Pomo: ${r.pomodoro_done || 0}</div></div>
        </div>
      `;
    });
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
     FITUR 1 & PROFIL: FETCH ALL DATA
  ======================================= */
  async function loadDashboardStats() {
    const [resUser, resTasks, resFin, resHabits, resSem, resCourses, resAssessments] = await Promise.all([
      supabaseClient.from('users').select('*').eq('id', dbUser.id).single(),
      supabaseClient.from('tasks').select('*').eq('user_id', dbUser.id),
      supabaseClient.from('finance_transactions').select('type,amount').eq('user_id', dbUser.id),
      supabaseClient.from('habits').select('*').eq('user_id', dbUser.id),
      supabaseClient.from('ip_semesters').select('*').eq('user_id', dbUser.id).order('semester_number', { ascending: true }),
      supabaseClient.from('ip_courses').select('*').eq('user_id', dbUser.id),
      supabaseClient.from('ip_assessments').select('*') 
    ]);

    if (resUser.data) {
      dbUser = resUser.data; 
      applyUserInfoToUI(); // Re-render nama/foto terbaru
      if(document.getElementById('stat-points')) document.getElementById('stat-points').textContent = dbUser.points || 0;
      if(document.getElementById('stat-tasks-done')) document.getElementById('stat-tasks-done').textContent = dbUser.tasks_completed || 0;
      if(document.getElementById('stat-pomodoro')) document.getElementById('stat-pomodoro').textContent = dbUser.pomodoro_done || 0;
      
      if(document.getElementById('profile-stat-goals')) document.getElementById('profile-stat-goals').textContent = dbUser.points || 0;
      if(document.getElementById('profile-stat-tasks')) document.getElementById('profile-stat-tasks').textContent = dbUser.tasks_completed || 0;
      if(document.getElementById('profile-stat-pomodoro')) document.getElementById('profile-stat-pomodoro').textContent = dbUser.pomodoro_done || 0;
      
      const level = Math.floor((dbUser.points || 0) / 50) + 1;
      if(document.getElementById('profile-level')) document.getElementById('profile-level').textContent = level;
      if(document.getElementById('profile-stat-hours')) document.getElementById('profile-stat-hours').textContent = ((dbUser.pomodoro_done || 0) * 25 / 60).toFixed(1);
    }

    let tDone = 0, tPend = 0, tUrg = 0;
    const now = new Date();
    if (resTasks.data) {
      localCache.tasks = resTasks.data; // Simpan untuk auto check interval
      resTasks.data.forEach(t => {
        if(t.status === 'completed') tDone++;
        else {
          if(t.due_date && new Date(t.due_date) < now) tUrg++; 
          else tPend++;
        }
      });
    }
    if(document.getElementById('stat-tasks-pending')) document.getElementById('stat-tasks-pending').textContent = tPend + tUrg;

    let balance = 0;
    if (resFin.data) {
      resFin.data.forEach(t => { if(t.type === 'income') balance += parseFloat(t.amount); else balance -= parseFloat(t.amount); });
    }
    localCache.financeBalance = balance; // Simpan untuk auto check interval
    if(document.getElementById('stat-balance')) document.getElementById('stat-balance').textContent = `Rp ${balance.toLocaleString('id-ID')}`;

    let hMor = 0, hAft = 0, hEve = 0;
    if (resHabits.data) {
      if(document.getElementById('stat-habits')) document.getElementById('stat-habits').textContent = resHabits.data.length;
      resHabits.data.forEach(h => {
        if(h.time_of_day === 'morning') hMor++;
        if(h.time_of_day === 'afternoon') hAft++;
        if(h.time_of_day === 'evening') hEve++;
      });
    }

    let chartIpkData = [];
    if(resSem.data && resCourses.data && resAssessments.data) {
       resSem.data.forEach(sm => {
         let semSKS = 0; let semMutu = 0;
         const smCourses = resCourses.data.filter(c => c.semester_id === sm.id);
         smCourses.forEach(c => {
           const cAsm = resAssessments.data.filter(a => a.course_id === c.id);
           let fScore = 0;
           cAsm.forEach(a => fScore += (a.score * (a.weight / 100)));
           
           let ip = 0;
           if(fScore >= 86) ip = 4; else if(fScore >= 81) ip = 3.5; else if(fScore >= 71) ip = 3; else if(fScore >= 66) ip = 2.5; else if(fScore >= 61) ip = 2; else if(fScore >= 56) ip = 1.5; else if(fScore >= 51) ip = 1;
           
           semSKS += c.sks; semMutu += (c.sks * ip);
         });
         const ips = semSKS > 0 ? Number((semMutu / semSKS).toFixed(2)) : 0;
         chartIpkData.push({ semester: sm.semester_number, ips: ips });
       });
    }

    renderAnalyticsCharts({ done: tDone, pending: tPend, urgent: tUrg }, chartIpkData, { morning: hMor, afternoon: hAft, evening: hEve });
    checkNotifications(resTasks.data, balance);
  }

  /* =======================================
     EDIT PROFIL & UPLOAD STORAGE
  ======================================= */
  window.openEditProfile = function() {
    document.getElementById('edit-username').value = dbUser.username || '';
    document.getElementById('edit-bio').value = dbUser.bio || '';
    document.getElementById('edit-school').value = dbUser.school || '';
    document.getElementById('edit-major').value = dbUser.major || '';
    document.getElementById('edit-semester').value = dbUser.semester || 1;
    document.getElementById('edit-learning').value = dbUser.learning_style || 'Visual';
    window.openModal('modal-edit-profile');
  }
  
  document.getElementById('form-edit-profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSave = e.target.querySelector('button[type="submit"]');
    if (btnSave) { btnSave.disabled = true; btnSave.textContent = "Menyimpan..."; }

    try {
      let currentAvatarUrl = dbUser.avatar_url;
      const fileInput = document.getElementById('edit-avatar');

      // Unggah gambar ke Supabase Storage (Bucket 'avatars')
      if(fileInput && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          const fileExt = file.name.split('.').pop();
          const fileName = `${dbUser.id}_${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabaseClient.storage.from('avatars').upload(fileName, file);
          if(uploadError) throw uploadError;

          const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
          currentAvatarUrl = publicUrlData.publicUrl;
      }

      const updates = {
        username: document.getElementById('edit-username').value.trim(),
        bio: document.getElementById('edit-bio').value.trim(),
        school: document.getElementById('edit-school').value.trim(),
        major: document.getElementById('edit-major').value.trim(),
        semester: parseInt(document.getElementById('edit-semester').value) || 1,
        learning_style: document.getElementById('edit-learning').value,
        avatar_url: currentAvatarUrl
      };

      const { error: dbError } = await supabaseClient.from('users').update(updates).eq('id', dbUser.id);
      if(dbError) throw dbError;

      window.closeModal('modal-edit-profile');
      window.showToast("Profil berhasil diperbarui!", "success");
      loadDashboardStats(); 
    } catch(err) {
      window.showToast("Gagal update profil: " + err.message, "error");
    } finally {
      if (btnSave) { btnSave.disabled = false; btnSave.textContent = "Simpan Perubahan"; }
    }
  });

  document.getElementById('form-change-password')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwNew = document.getElementById('pw-new').value;
    const pwConfirm = document.getElementById('pw-confirm').value;

    if(pwNew !== pwConfirm) { window.showToast("Konfirmasi sandi tidak cocok!", "error"); return; }
    if(pwNew.length < 6) { window.showToast("Sandi minimal 6 karakter!", "error"); return; }

    const btnSubmit = document.getElementById('btn-submit-password');
    btnSubmit.disabled = true; btnSubmit.textContent = "Memproses...";

    try {
      const { error } = await supabaseClient.auth.updateUser({ password: pwNew });
      if(error) throw error;
      window.closeModal('modal-change-password');
      document.getElementById('form-change-password').reset();
      window.showToast("Kata sandi berhasil diubah!", "success");
    } catch (err) {
      window.showToast(err.message, "error");
    } finally {
      btnSubmit.disabled = false; btnSubmit.textContent = "Ubah Password";
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

  async function loadFinance() {
    const { data: txs } = await supabaseClient.from('finance_transactions').select('*').eq('user_id', dbUser.id).order('created_at', { ascending: false });
    const tbody = document.getElementById('finance-table-body');
    if(!tbody) return;
    tbody.innerHTML = ''; let inc = 0, exp = 0;
    if (txs && txs.length > 0) {
      txs.forEach(t => {
        const isInc = t.type === 'income';
        if(isInc) inc += parseFloat(t.amount); else exp += parseFloat(t.amount);
        const dateStr = new Date(t.created_at).toLocaleDateString('id-ID');
        tbody.innerHTML += `<tr class="hover:bg-muted/50"><td class="px-4 py-3 text-xs text-secondary">${dateStr}</td><td class="px-4 py-3 font-medium">${t.note}</td><td class="px-4 py-3 font-semibold ${isInc?'text-success':'text-error'}">${isInc?'+':'-'} Rp ${parseFloat(t.amount).toLocaleString('id-ID')}</td><td class="px-4 py-3 text-right"><button onclick="deleteFin(${t.id})" class="p-1.5 text-error hover:bg-error-light rounded-md cursor-pointer"><i data-lucide="trash-2" class="size-4"></i></button></td></tr>`;
      });
      lucide.createIcons();
    } else { tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-secondary text-xs">Belum ada riwayat transaksi.</td></tr>`; }
    if(document.getElementById('fin-income')) document.getElementById('fin-income').textContent = `Rp ${inc.toLocaleString('id-ID')}`;
    if(document.getElementById('fin-expense')) document.getElementById('fin-expense').textContent = `Rp ${exp.toLocaleString('id-ID')}`;
    if(document.getElementById('fin-balance')) document.getElementById('fin-balance').textContent = `Rp ${(inc - exp).toLocaleString('id-ID')}`;
  }
  window.deleteFin = async (id) => {
    if(confirm('Hapus riwayat?')) { await supabaseClient.from('finance_transactions').delete().eq('id', id); loadFinance(); loadDashboardStats(); }
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
     FITUR 5: IP TRACKER (DINAMIS ASPEK 100%)
  ======================================= */
  let ipAspects = [{ id: Date.now(), name: 'Tugas', score: 0, weight: 0 }];
  window.renderIpAspects = function() {
    const container = document.getElementById('aspects-container');
    const display = document.getElementById('total-weight-display');
    if(!container || !display) return;
    container.innerHTML = ''; let totalW = 0;
    ipAspects.forEach(asp => {
      totalW += Number(asp.weight);
      container.innerHTML += `<div class="flex gap-2 items-center bg-gray-50 p-1.5 rounded-lg border border-border"><input type="text" class="aspect-name flex-1 px-2 py-1.5 text-xs border border-border rounded outline-none" data-id="${asp.id}" value="${asp.name}" placeholder="Cth: UTS" required><input type="number" class="aspect-score w-16 px-2 py-1.5 text-xs border border-border rounded outline-none text-center" data-id="${asp.id}" value="${asp.score}" min="0" max="100" placeholder="Nilai" required><input type="number" class="aspect-weight w-16 px-2 py-1.5 text-xs border border-border rounded outline-none text-center" data-id="${asp.id}" value="${asp.weight}" min="0" max="100" placeholder="Bobot" required><button type="button" class="aspect-del text-secondary hover:text-error px-1 cursor-pointer" data-id="${asp.id}"><i data-lucide="x" class="size-4"></i></button></div>`;
    });
    display.textContent = `Total Bobot: ${totalW}%`;
    display.className = `mt-2 text-xs font-bold text-right ${totalW === 100 ? 'text-success-dark' : 'text-error-dark'}`;
    lucide.createIcons();
    document.querySelectorAll('.aspect-name').forEach(el => el.addEventListener('input', e => { ipAspects.find(a => a.id == e.target.dataset.id).name = e.target.value; }));
    document.querySelectorAll('.aspect-score').forEach(el => el.addEventListener('input', e => { ipAspects.find(a => a.id == e.target.dataset.id).score = Number(e.target.value); }));
    document.querySelectorAll('.aspect-weight').forEach(el => el.addEventListener('input', e => { ipAspects.find(a => a.id == e.target.dataset.id).weight = Number(e.target.value); window.renderIpAspects(); }));
    document.querySelectorAll('.aspect-del').forEach(el => el.addEventListener('click', e => { if(ipAspects.length <= 1) return; ipAspects = ipAspects.filter(a => a.id != e.currentTarget.dataset.id); window.renderIpAspects(); }));
  }
  document.getElementById('btn-add-aspect')?.addEventListener('click', () => { ipAspects.push({ id: Date.now(), name: '', score: 0, weight: 0 }); window.renderIpAspects(); });
  window.renderIpAspects();

  function calculateGradeAndIP(finalScore) {
    if (finalScore >= 86) return { grade: 'A', ip: 4.00 };
    if (finalScore >= 81) return { grade: 'AB', ip: 3.50 };
    if (finalScore >= 71) return { grade: 'B', ip: 3.00 };
    if (finalScore >= 66) return { grade: 'BC', ip: 2.50 };
    if (finalScore >= 61) return { grade: 'C', ip: 2.00 };
    if (finalScore >= 56) return { grade: 'CD', ip: 1.50 };
    if (finalScore >= 51) return { grade: 'D', ip: 1.00 };
    return { grade: 'E', ip: 0.00 };
  }

  const formIp = document.getElementById('form-iptracker');
  formIp?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(ipAspects.reduce((sum, a) => sum + Number(a.weight), 0) !== 100) { window.showToast("Gagal: Total bobot harus 100%!", "error"); return; }
    try {
      const semNum = parseInt(document.getElementById('ip-semester').value) || 1;
      let semId;
      let { data: cekSem } = await supabaseClient.from('ip_semesters').select('id').eq('user_id', dbUser.id).eq('semester_number', semNum).single();
      if(cekSem) semId = cekSem.id; 
      else { const { data: nSem } = await supabaseClient.from('ip_semesters').insert([{ user_id: dbUser.id, semester_number: semNum }]).select().single(); semId = nSem.id; }
      
      const { data: nCourse } = await supabaseClient.from('ip_courses').insert([{ user_id: dbUser.id, semester_id: semId, course_name: document.getElementById('ip-course').value, sks: parseInt(document.getElementById('ip-sks').value) }]).select().single();
      await supabaseClient.from('ip_assessments').insert(ipAspects.map(a => ({ course_id: nCourse.id, name: a.name, score: a.score, weight: a.weight })));
      
      window.closeModal('modal-iptracker'); formIp.reset(); ipAspects = [{ id: Date.now(), name: 'Tugas', score: 0, weight: 0 }]; window.renderIpAspects();
      window.showToast('Nilai disimpan!', 'success'); loadIpTracker(); loadDashboardStats();
    } catch (err) { window.showToast(err.message, "error"); }
  });

  async function loadIpTracker() {
    const { data: semesters } = await supabaseClient.from('ip_semesters').select('*').eq('user_id', dbUser.id).order('semester_number', { ascending: true });
    const { data: courses } = await supabaseClient.from('ip_courses').select('*').eq('user_id', dbUser.id);
    const container = document.getElementById('iptracker-container');
    if(!container) return;
    container.innerHTML = '';
    
    if(!semesters || semesters.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-secondary text-xs">Belum ada mata kuliah.</div>`;
      if(document.getElementById('ipk-display')) document.getElementById('ipk-display').textContent = '0.00';
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
      container.innerHTML += `<div class="bg-white border border-border rounded-xl shadow-sm mb-4"><div class="bg-gray-50 px-4 py-3 border-b border-border flex items-center justify-between rounded-t-xl"><h4 class="font-bold text-sm text-foreground">Semester ${sm.semester_number}</h4><div class="bg-primary/10 text-primary px-2 py-1 rounded-md text-xs font-bold">IPS: ${semSKS>0?(semMutu/semSKS).toFixed(2):'0.00'}</div></div>${coursesHtml}</div>`;
    });

    const ipk = overallSKS > 0 ? (overallMutu / overallSKS).toFixed(2) : '0.00';
    if(document.getElementById('ipk-display')) document.getElementById('ipk-display').textContent = ipk;
    if(document.getElementById('sks-display')) document.getElementById('sks-display').textContent = overallSKS;
    lucide.createIcons();
  }
  window.deleteCourse = async (id) => { if(confirm('Hapus matkul?')) { await supabaseClient.from('ip_courses').delete().eq('id', id); loadIpTracker(); loadDashboardStats(); } }

  /* =======================================
     FITUR 6: HABIT TRACKER & PAKET
  ======================================= */
  const HABIT_PACKAGES = [
    { name: "Produktivitas Penuh", icon: "🚀", description: "Habit Produktivitas Seharian.", area: "general", habits: [{ title: "Hidrasi Pagi", icon: "💧", time_of_day: 'morning' },{ title: "Mindset Reset", icon: "🧘", time_of_day: 'morning' },{ title: "Deep Work", icon: "🐸", time_of_day: 'morning' }, { title: "Istirahat", icon: "🍽️", time_of_day: 'afternoon' },{ title: "Digital Sunset", icon: "📵", time_of_day: 'evening' }] },
    { name: "Fokus Mendalam", icon: "🎯", description: "Paket anti-distraksi.", area: "study", habits: [{ title: "Single-Tasking", icon: "⚙️", time_of_day: 'morning' },{ title: "Cek Inbox Terjadwal", icon: "📧", time_of_day: 'morning' },{ title: "Bebas Ponsel", icon: "🚫", time_of_day: 'morning' }] },
    { name: "Kesejahteraan", icon: "💖", description: "Kelola stres dan pikiran.", area: "health", habits: [{ title: "Jurnal Syukur", icon: "🙏", time_of_day: 'morning' },{ title: "Batasi Berita", icon: "📰", time_of_day: 'afternoon' },{ title: "Me Time", icon: "☕", time_of_day: 'evening' }] },
    { name: "Pertumbuhan", icon: "💰", description: "Stabilitas jangka panjang.", area: "finance", habits: [{ title: "Literasi Finansial", icon: "📖", time_of_day: 'afternoon' }, { title: "Menabung Rutin", icon: "💳", time_of_day: 'morning' }, { title: "Review Mingguan", icon: "📅", time_of_day: 'evening' }] }
  ];
  let currentHabitFilter = 'all';

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

  // Filter Habit
  document.querySelectorAll('.habit-filter-time').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.habit-filter-time').forEach(b => {
        b.classList.remove('bg-primary', 'text-white', 'border-primary');
        b.classList.add('border-border');
      });
      e.target.classList.add('bg-primary', 'text-white', 'border-primary');
      currentHabitFilter = e.target.dataset.time;
      loadHabits();
    });
  });

  const formHabit = document.getElementById('form-habit');
  formHabit?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await supabaseClient.from('habits').insert([{ user_id: dbUser.id, title: document.getElementById('hb-title').value, area: document.getElementById('hb-area').value, time_of_day: document.getElementById('hb-time').value, icon: '📌' }]);
    if (!error) { window.closeModal('modal-habit'); formHabit.reset(); window.showToast('Habit ditambahkan!'); loadHabits(); loadDashboardStats(); }
  });

  function loadHabitsPage() {
    window.renderHabitRecommendations();
    loadHabits();
  }

  async function loadHabits() {
    const { data: habits } = await supabaseClient.from('habits').select('*').eq('user_id', dbUser.id);
    const container = document.getElementById('habits-today-container');
    if(!container) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const { data: logs } = await supabaseClient.from('habit_logs').select('*').in('habit_id', (habits||[]).map(h=>h.id)).eq('log_date', todayStr);
    container.innerHTML = '';

    const filteredHabits = (habits||[]).filter(h => currentHabitFilter === 'all' || h.time_of_day === currentHabitFilter);

    if (filteredHabits.length > 0) {
      filteredHabits.forEach(h => {
        const isDone = (logs||[]).some(l => l.habit_id === h.id);
        container.innerHTML += `<div class="flex items-center justify-between p-3 rounded-lg border border-border ${isDone?'bg-success/10':'bg-gray-50 hover:bg-muted'} transition-all"><div class="flex items-center gap-3"><input type="checkbox" onchange="toggleHabit(${h.id}, this.checked)" ${isDone?'checked':''} class="size-5 accent-success cursor-pointer rounded"><div><p class="font-semibold text-sm ${isDone?'text-secondary line-through':''}">${h.title}</p><p class="text-[11px] text-secondary capitalize">${h.area} • ${h.time_of_day}</p></div></div><button onclick="deleteHabit(${h.id})" class="text-secondary hover:text-error p-1.5 cursor-pointer"><i data-lucide="trash-2" class="size-4"></i></button></div>`;
      });
      lucide.createIcons();
    } else { container.innerHTML = `<div class="text-center py-4 text-secondary text-xs">Belum ada habit untuk filter ini.</div>`; }
  }

  window.toggleHabit = async (hId, chk) => {
    const today = new Date().toISOString().split('T')[0];
    if(chk) { 
      await supabaseClient.from('habit_logs').insert([{ habit_id: hId, log_date: today, completed: true }]); 
      window.showToast("Kerja bagus! Habit diselesaikan.");
    }
    else { await supabaseClient.from('habit_logs').delete().eq('habit_id', hId).eq('log_date', today); }
    loadHabits();
  }
  window.deleteHabit = async (id) => { if(confirm('Hapus?')) { await supabaseClient.from('habits').delete().eq('id', id); loadHabits(); loadDashboardStats(); } }

  /* =======================================
     FITUR 7: POMODORO TIMER
  ======================================= */
  let timerInterval; let timeLeft = 25 * 60; let isRunning = false;
  const btnStart = document.getElementById('btn-timer-start');
  function updateDisplay() { if(document.getElementById('timer-display')) document.getElementById('timer-display').textContent = `${Math.floor(timeLeft/60).toString().padStart(2,'0')}:${(timeLeft%60).toString().padStart(2,'0')}`; }
  btnStart?.addEventListener('click', () => {
    if (isRunning) { clearInterval(timerInterval); btnStart.textContent = 'Lanjutkan'; } 
    else { btnStart.textContent = 'Jeda'; timerInterval = setInterval(async () => { 
      timeLeft--; updateDisplay(); 
      if (timeLeft <= 0) {
        clearInterval(timerInterval); isRunning = false; btnStart.textContent = 'Mulai'; timeLeft = 25 * 60; updateDisplay();
        dbUser.points += 10; dbUser.pomodoro_done += 1;
        await supabaseClient.from('users').update({ points: dbUser.points, pomodoro_done: dbUser.pomodoro_done }).eq('id', dbUser.id);
        window.showToast('Sesi Selesai! (+10 Poin)', 'success'); loadDashboardStats();
      }
    }, 1000); }
    isRunning = !isRunning;
  });
  document.getElementById('btn-timer-reset')?.addEventListener('click', () => { clearInterval(timerInterval); isRunning = false; timeLeft = 25 * 60; if(btnStart) btnStart.textContent = 'Mulai'; updateDisplay(); });

  /* =======================================
     FITUR 8: STUDYWITHOPANG
  ======================================= */
  
  // Load flashcards dari localStorage
  function loadFlashcards() {
    const saved = localStorage.getItem('flashcards_' + (dbUser?.id || 'guest'));
    if (saved) flashcards = JSON.parse(saved);
    renderFlashcards();
  }

  // Save flashcards ke localStorage
  function saveFlashcards() {
    localStorage.setItem('flashcards_' + (dbUser?.id || 'guest'), JSON.stringify(flashcards));
  }

  // Render flashcards
  function renderFlashcards() {
    const container = document.getElementById('flashcard-container');
    if (!container) return;
    
    if (flashcards.length === 0) {
      container.innerHTML = '<p class="text-xs text-secondary text-center py-4">Belum ada flashcard. Tambah sekarang!</p>';
      return;
    }
    
    container.innerHTML = flashcards.map((fc, idx) => `
      <div class="bg-gray-50 border border-border rounded-lg p-3 hover:border-pink-300 transition cursor-pointer" onclick="flipFlashcard(${idx})">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <p class="text-xs font-semibold text-foreground mb-1" id="fc-front-${idx}">${fc.question}</p>
            <p class="text-xs text-secondary hidden" id="fc-back-${idx}">${fc.answer}</p>
          </div>
          <button onclick="event.stopPropagation(); deleteFlashcard(${idx})" class="text-error hover:bg-error-light p-1 rounded cursor-pointer">
            <i data-lucide="trash-2" class="size-3"></i>
          </button>
        </div>
        <div class="mt-2 text-[10px] text-secondary">
          Next review: ${new Date(fc.nextReview).toLocaleDateString('id-ID')}
        </div>
      </div>
    `).join('');
    lucide.createIcons();
  }

  // Flip flashcard (show answer)
  window.flipFlashcard = function(idx) {
    const front = document.getElementById(`fc-front-${idx}`);
    const back = document.getElementById(`fc-back-${idx}`);
    if (front && back) {
      front.classList.toggle('hidden');
      back.classList.toggle('hidden');
      
      // Update spaced repetition with exponential growth
      const fc = flashcards[idx];
      fc.reviewCount = (fc.reviewCount || 0) + 1;
      const daysToAdd = Math.min(Math.pow(2, fc.reviewCount - 1), 30); // Exponential: 1, 2, 4, 8, 16, 30 days
      fc.nextReview = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString();
      saveFlashcards();
    }
  }

  // Delete flashcard
  window.deleteFlashcard = function(idx) {
    if (confirm('Hapus flashcard ini?')) {
      flashcards.splice(idx, 1);
      saveFlashcards();
      renderFlashcards();
      window.showToast('Flashcard dihapus', 'success');
    }
  }

  // Form submit for flashcard
  document.getElementById('form-flashcard')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = document.getElementById('fc-question').value;
    const answer = document.getElementById('fc-answer').value;
    
    flashcards.push({
      question,
      answer,
      nextReview: new Date().toISOString(),
      reviewCount: 0,
      createdAt: new Date().toISOString()
    });
    
    saveFlashcards();
    renderFlashcards();
    window.closeModal('modal-flashcard');
    window.showToast('Flashcard ditambahkan!', 'success');
    e.target.reset();
  });

  // Process document summary
  window.processSummary = function() {
    const fileInput = document.getElementById('upload-document');
    const file = fileInput?.files[0];
    
    if (!file) {
      window.showToast('Pilih file terlebih dahulu!', 'error');
      return;
    }
    
    window.showToast('Memproses dokumen...', 'success');
    
    // Simulate AI processing
    const reader = new FileReader();
    reader.onload = function(e) {
      uploadedContent = e.target.result;
      
      // Generate mock summary
      setTimeout(() => {
        const summaryResult = document.getElementById('summary-result');
        const summaryContent = document.getElementById('summary-content');
        
        if (summaryResult && summaryContent) {
          const mockSummary = [
            '📌 <b>Poin Penting 1:</b> Materi ini membahas konsep fundamental yang perlu dipahami dengan baik.',
            '📌 <b>Poin Penting 2:</b> Terdapat beberapa teori kunci yang saling berhubungan.',
            '📌 <b>Poin Penting 3:</b> Aplikasi praktis dapat diterapkan dalam berbagai konteks.',
            '💡 <b>Kesimpulan:</b> Memahami konsep dasar sangat penting untuk pengembangan lebih lanjut.'
          ];
          
          summaryContent.innerHTML = mockSummary.join('<br><br>');
          summaryResult.classList.remove('hidden');
          window.showToast('Ringkasan berhasil dibuat!', 'success');
        }
      }, 2000);
    };
    
    reader.readAsText(file);
  }

  // AI Tutor Chat
  window.sendChat = function() {
    const input = document.getElementById('chat-input');
    const messagesContainer = document.getElementById('chat-messages');
    
    if (!input || !messagesContainer) return;
    
    const userMessage = input.value.trim();
    if (!userMessage) return;
    
    // Clear initial message
    if (messagesContainer.querySelector('.text-center')) {
      messagesContainer.innerHTML = '';
    }
    
    // Add user message
    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = 'mb-3 flex justify-end';
    userMsgDiv.innerHTML = `<div class="bg-blue-600 text-white px-3 py-2 rounded-lg max-w-[80%] text-xs">${userMessage}</div>`;
    messagesContainer.appendChild(userMsgDiv);
    
    input.value = '';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Simulate AI response
    setTimeout(() => {
      const aiResponses = [
        'Pertanyaan yang bagus! Berdasarkan materi yang ada, saya dapat menjelaskan bahwa konsep ini memiliki beberapa komponen penting yang perlu dipahami...',
        'Mari kita bahas secara detail. Pertama, kita perlu memahami konsep dasar. Kedua, kita lihat bagaimana penerapannya dalam konteks nyata...',
        'Saya akan membantu menjelaskan ini. Topik ini sangat menarik karena berkaitan dengan berbagai aspek pembelajaran...',
        'Terima kasih sudah bertanya! Untuk memahami ini dengan baik, saya sarankan untuk fokus pada poin-poin kunci berikut...'
      ];
      
      const randomResponse = aiResponses[Math.floor(Math.random() * aiResponses.length)];
      
      const aiMsgDiv = document.createElement('div');
      aiMsgDiv.className = 'mb-3 flex justify-start';
      aiMsgDiv.innerHTML = `<div class="bg-gray-100 text-foreground px-3 py-2 rounded-lg max-w-[80%] text-xs">${randomResponse}</div>`;
      messagesContainer.appendChild(aiMsgDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 1000);
  }

  // Add Enter key listener for chat input
  document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      window.sendChat();
    }
  });

  // Generate Quiz
  window.generateQuiz = function() {
    const quizContainer = document.getElementById('quiz-container');
    if (!quizContainer) return;
    
    window.showToast('Membuat quiz...', 'success');
    
    // Mock quiz questions
    const mockQuestions = [
      {
        question: 'Apa konsep utama yang dibahas dalam materi ini?',
        options: ['Konsep A', 'Konsep B', 'Konsep C', 'Konsep D'],
        correct: 0
      },
      {
        question: 'Bagaimana cara menerapkan teori dalam praktik?',
        options: ['Metode 1', 'Metode 2', 'Metode 3', 'Metode 4'],
        correct: 1
      },
      {
        question: 'Apa kesimpulan dari materi pembelajaran?',
        options: ['Kesimpulan A', 'Kesimpulan B', 'Kesimpulan C', 'Kesimpulan D'],
        correct: 2
      }
    ];
    
    currentQuiz = mockQuestions;
    
    setTimeout(() => {
      quizContainer.innerHTML = mockQuestions.map((q, qIdx) => `
        <div class="bg-gray-50 border border-border rounded-lg p-3">
          <p class="text-xs font-semibold mb-2">${qIdx + 1}. ${q.question}</p>
          <div class="space-y-1">
            ${q.options.map((opt, optIdx) => `
              <label class="flex items-center text-xs cursor-pointer hover:bg-white p-2 rounded transition">
                <input type="radio" name="quiz-q${qIdx}" value="${optIdx}" class="mr-2">
                ${opt}
              </label>
            `).join('')}
          </div>
        </div>
      `).join('');
      
      quizContainer.innerHTML += `
        <button onclick="submitQuiz()" class="w-full py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition cursor-pointer mt-2">
          Submit Quiz
        </button>
      `;
      
      window.showToast('Quiz berhasil dibuat!', 'success');
    }, 1500);
  }

  // Submit Quiz
  window.submitQuiz = function() {
    let score = 0;
    
    currentQuiz.forEach((q, idx) => {
      const selected = document.querySelector(`input[name="quiz-q${idx}"]:checked`);
      if (selected && parseInt(selected.value, 10) === q.correct) {
        score++;
      }
    });
    
    const resultDiv = document.getElementById('quiz-result');
    const scoreDiv = document.getElementById('quiz-score');
    
    if (resultDiv && scoreDiv) {
      scoreDiv.textContent = `${score}/${currentQuiz.length}`;
      resultDiv.classList.remove('hidden');
      
      const percentage = (score / currentQuiz.length) * 100;
      if (percentage >= 70) {
        window.showToast('Luar biasa! Skor kamu tinggi!', 'success');
      } else {
        window.showToast('Tetap semangat! Coba lagi untuk meningkatkan pemahamanmu.', 'success');
      }
    }
  }

  // Initialize StudyWithOpang when section is loaded
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      if (this.getAttribute('data-target') === 'studywithopang') {
        loadFlashcards();
      }
    });
  });



});
