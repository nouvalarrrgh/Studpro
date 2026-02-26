// js/career.js (Kini berfungsi sebagai Modul Bimbingan Skripsi)

let thesisProjects = [];
let currentThesisId = null;

window.AI_API_KEY = 'AIzaSyDcJkjRruBLf4B8ld04yAB7_zhKbRNsJ-Q';  

async function getUserId() {
    return window.dbUser ? window.dbUser.id : null;
}

window.loadThesisData = async function() {
    const userId = await getUserId();
    if(!userId) return;
    const { data, error } = await window.supabaseClient.from('thesis_projects').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if(!error && data) {
        thesisProjects = data;
    }
    renderThesisGrid();
}

function renderThesisGrid() {
    const container = document.getElementById('thesis-grid');
    if(!container) return;

    if(thesisProjects.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center py-16">
                <div class="size-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4"><i data-lucide="book-open" class="size-8 text-indigo-500"></i></div>
                <h3 class="text-xl font-bold text-foreground mb-2">Belum ada proyek</h3>
                <p class="text-secondary text-sm max-w-md mx-auto mb-6">Mulai perjalanan Anda dengan membuat proyek skripsi baru. AI kami siap membantu menyusun strukturnya.</p>
                <button onclick="openModal('modal-new-thesis')" class="px-6 py-2.5 bg-[#111827] text-white font-bold rounded-lg hover:bg-gray-800 transition cursor-pointer shadow-sm">Buat Proyek Pertama</button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                ${thesisProjects.map(proj => `
                    <div class="border border-border rounded-xl p-5 hover:border-indigo-400 hover:shadow-lg transition cursor-pointer bg-gray-50/50 flex flex-col h-full" onclick="viewThesisDetail(${proj.id})">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="size-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center shrink-0"><i data-lucide="file-text" class="size-5"></i></div>
                            <span class="text-[10px] font-bold uppercase bg-white border border-border px-2 py-0.5 rounded text-secondary">Skripsi</span>
                        </div>
                        <h4 class="font-bold text-base text-foreground mb-2 line-clamp-2">${proj.title}</h4>
                        <p class="text-xs text-secondary line-clamp-2 mb-4 flex-1"><b>Masalah:</b> ${proj.problem}</p>
                        <div class="mt-auto pt-3 border-t border-border flex items-center justify-between text-indigo-600 text-xs font-bold">
                            <span>Lihat Struktur</span> <i data-lucide="arrow-right" class="size-4"></i>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// PROSES SUBMIT & REQUEST AI GEMINI
document.getElementById('form-new-thesis')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-thesis');
    
    const title = document.getElementById('th-title').value.trim();
    const problem = document.getElementById('th-problem').value.trim();
    const objective = document.getElementById('th-objective').value.trim();
    const methodology = document.getElementById('th-methodology').value.trim();
    const userId = await getUserId();

    if(!userId) return;

    btn.disabled = true;
    btn.innerHTML = '<i class="animate-spin" data-lucide="loader-2"></i> Menganalisis...';
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // 🔥 PROMPT YANG DIPERBARUI: Memisahkan "Points" (terlihat di layar) dan "Insight" (di dalam tombol ?)
    const prompt = `Bertindaklah sebagai Dosen Pembimbing Skripsi Ahli. Saya memiliki rencana penelitian skripsi:
    - Judul: ${title}
    - Rumusan Masalah: ${problem}
    - Tujuan: ${objective}
    - Metodologi: ${methodology}

    TUGAS: Buatkan struktur skripsi baku.
    KEMBALIKAN HANYA FORMAT JSON MURNI TANPA TEKS APAPUN! STRUKTUR WAJIB SEPERTI INI:
    {
        "gap": "Penjelasan Gap Penelitian (kebaruan & pentingnya penelitian ini).",
        "consistency": "Analisis Pemeriksaan Konsistensi (benang merah apakah judul, masalah, tujuan, dan metode sudah selaras).",
        "structure": [
            {
                "chapter": "BAB I: Pendahuluan",
                "sections": [
                    { 
                        "title": "Latar Belakang Masalah", 
                        "points": ["Apa itu fenomena A", "Mengapa fenomena B penting untuk diteliti", "Hubungan variabel C dan D pada objek penelitian"], 
                        "insight": "Dosen ingin melihat apakah kamu benar-benar paham akar masalahnya sebelum meneliti.", 
                        "query": "kata kunci jurnal latar belakang" 
                    },
                    { "title": "Rumusan Masalah", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Tujuan Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Manfaat Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Sistematika Penulisan", "points": ["..."], "insight": "...", "query": "..." }
                ]
            },
            {
                "chapter": "BAB II: Tinjauan Pustaka / Landasan Teori",
                "sections": [
                    { "title": "Kajian Teori / Teori Dasar", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Penelitian Terdahulu", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Kerangka Berpikir", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Hipotesis", "points": ["Jelaskan jika kuantitatif, atau jelaskan bahwa ini dikosongkan jika kualitatif"], "insight": "...", "query": "..." }
                ]
            },
            {
                "chapter": "BAB III: Metode Penelitian",
                "sections": [
                    { "title": "Jenis/Pendekatan Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Tempat dan Waktu Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Populasi dan Sampel / Subjek Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Teknik Pengumpulan Data", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Instrumen Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Teknik Analisis Data", "points": ["..."], "insight": "...", "query": "..." }
                ]
            },
            {
                "chapter": "BAB IV: Hasil Penelitian dan Pembahasan",
                "sections": [
                    { "title": "Gambaran Umum Objek Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Penyajian Data/Hasil Penelitian", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Pembahasan / Analisis Data", "points": ["..."], "insight": "...", "query": "..." }
                ]
            },
            {
                "chapter": "BAB V: Penutup",
                "sections": [
                    { "title": "Kesimpulan", "points": ["..."], "insight": "...", "query": "..." },
                    { "title": "Saran / Implikasi", "points": ["..."], "insight": "...", "query": "..." }
                ]
            },
            {
                "chapter": "Bagian Akhir",
                "sections": [
                    { "title": "Lampiran", "points": ["Instrumen kuesioner atau pedoman wawancara", "Data mentah dan hasil olah data", "Surat izin penelitian"], "insight": "Penting sebagai bukti otentik bahwa penelitian benar-benar dilakukan.", "query": "contoh lampiran skripsi" }
                ]
            }
        ]
    }`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${window.AI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        if (!response.ok) throw new Error('API AI Error');
        const data = await response.json();
        const rawJson = data.candidates[0].content.parts[0].text;
        
        const cleanBracketFirst = rawJson.indexOf('{');
        const cleanBracketLast = rawJson.lastIndexOf('}');
        const cleanJson = rawJson.substring(cleanBracketFirst, cleanBracketLast + 1);
        const aiResult = JSON.parse(cleanJson);

        const payload = {
            user_id: userId,
            title: title,
            problem: problem,
            objective: objective,
            methodology: methodology,
            research_gap: aiResult.gap,
            consistency_check: aiResult.consistency,
            structure: aiResult.structure
        };

        const { error } = await window.supabaseClient.from('thesis_projects').insert([payload]);
        if (error) throw error;

        window.closeModal('modal-new-thesis');
        this.reset(); 
        window.loadThesisData(); 
        if (typeof window.showToast === 'function') window.showToast("Struktur Skripsi berhasil dibuat!", "success");

    } catch(err) {
        console.error(err);
        alert("Gagal menganalisis AI: Cek Console untuk detail.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Buat Struktur (AI)';
    }
});

window.toggleThesisInsight = function(insightId) {
    const el = document.getElementById(insightId);
    if(el) {
        el.classList.toggle('hidden');
    }
}

// MENAMPILKAN DETAIL SKRIPSI (ACTDEMIC STYLE)
window.viewThesisDetail = function(id) {
    const proj = thesisProjects.find(p => p.id === id);
    if(!proj) return;
    
    currentThesisId = id;
    
    const listView = document.getElementById('thesis-list-view');
    const detailView = document.getElementById('thesis-detail-view');
    const titleEl = document.getElementById('detail-thesis-title');
    const contentContainer = document.getElementById('thesis-content-container');

    if (listView) listView.classList.add('hidden');
    if (detailView) {
        detailView.classList.remove('hidden');
        detailView.classList.add('flex');
    }
    if (titleEl) titleEl.textContent = proj.title;

    let contentHtml = `
        <div class="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 mb-4">
            <h3 class="font-bold text-indigo-900 text-lg mb-2 flex items-center gap-2"><i data-lucide="lightbulb" class="size-5"></i> Gap Penelitian</h3>
            <p class="text-indigo-800 text-sm leading-relaxed">${proj.research_gap}</p>
        </div>
    `;

    if (proj.consistency_check) {
        contentHtml += `
        <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-8">
            <h3 class="font-bold text-emerald-900 text-lg mb-2 flex items-center gap-2"><i data-lucide="check-circle" class="size-5"></i> Pemeriksaan Konsistensi</h3>
            <p class="text-emerald-800 text-sm leading-relaxed">${proj.consistency_check}</p>
        </div>
        `;
    }

    contentHtml += `<div class="space-y-6 mt-8">`;

    if (proj.structure && Array.isArray(proj.structure)) {
        proj.structure.forEach((chap, cIdx) => {
            contentHtml += `
                <div class="bg-white border border-border rounded-xl shadow-sm overflow-hidden mb-6">
                    <div class="bg-gray-50 px-5 py-4 border-b border-border"><h4 class="font-bold text-lg text-foreground">${chap.chapter}</h4></div>
                    <div class="divide-y divide-border">
            `;
            if (chap.sections && Array.isArray(chap.sections)) {
                chap.sections.forEach((sec, sIdx) => {
                    const insightId = `insight-${cIdx}-${sIdx}`;
                    
                    // 🔥 MENYUSUN POIN-POIN PENJELASAN (Agar tampil seperti di Actdemic)
                    let pointsHtml = '';
                    if (sec.points && Array.isArray(sec.points)) {
                        pointsHtml = `<ul class="list-disc list-outside ml-4 mb-4 text-sm text-secondary space-y-2">` +
                            sec.points.map(pt => `<li>${pt}</li>`).join('') +
                        `</ul>`;
                    } else if (sec.explanation) {
                        // Fallback jika memuat data lama
                        pointsHtml = `<p class="text-sm text-secondary leading-relaxed mb-4">${sec.explanation}</p>`;
                    }
                    
                    const insightData = sec.insight || "Insight belum tersedia untuk proyek lama ini.";

                    contentHtml += `
                            <div class="p-5 hover:bg-gray-50/30 transition">
                                <div class="flex items-center justify-between mb-3">
                                    <h5 class="font-bold text-[15px] text-foreground">${sec.title}</h5>
                                    
                                    <button onclick="toggleThesisInsight('${insightId}')" class="bg-amber-100 text-amber-600 hover:bg-amber-200 p-1.5 rounded-full transition flex shrink-0 shadow-sm" title="Lihat Maksud & Tujuan">
                                        <i data-lucide="help-circle" class="size-4"></i>
                                    </button>
                                </div>
                                
                                ${pointsHtml}
                                
                                <div class="bg-blue-50/30 p-3 rounded-lg border border-blue-100 flex items-start gap-3 mb-2 w-max max-w-full">
                                    <i data-lucide="search" class="size-4 text-blue-500 mt-0.5 shrink-0"></i>
                                    <div>
                                        <p class="text-[10px] font-bold text-blue-800 uppercase tracking-wide">Pencarian Referensi:</p>
                                        <a href="https://scholar.google.com/scholar?q=${encodeURIComponent(sec.query)}" target="_blank" class="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium line-clamp-1">${sec.query} &rarr;</a>
                                    </div>
                                </div>

                                <div id="${insightId}" class="hidden mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg relative overflow-hidden shadow-inner">
                                    <div class="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                    <p class="text-xs font-bold text-amber-800 mb-1 uppercase tracking-wider flex items-center gap-1"><i data-lucide="info" class="size-3"></i> Insight Dosen:</p>
                                    <p class="text-sm text-amber-900 leading-relaxed">${insightData}</p>
                                </div>
                            </div>
                    `;
                });
            }
            contentHtml += `</div></div>`;
        });
    }

    contentHtml += `</div>`;
    
    if (contentContainer) {
        contentContainer.innerHTML = contentHtml;
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.closeThesisDetail = function() {
    currentThesisId = null;
    document.getElementById('thesis-detail-view')?.classList.add('hidden');
    document.getElementById('thesis-detail-view')?.classList.remove('flex');
    document.getElementById('thesis-list-view')?.classList.remove('hidden');
}

// MEMUNCULKAN MODAL KONFIRMASI HAPUS
window.deleteCurrentThesis = function() {
    if(!currentThesisId) return;
    // Buka modal custom buatan kita
    if (typeof window.openModal === 'function') {
        window.openModal('modal-delete-thesis');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// EKSEKUSI PENGHAPUSAN KE SUPABASE (Setelah tombol merah ditekan)
window.executeDeleteThesis = async function() {
    if(!currentThesisId) return;
    
    const btn = document.getElementById('btn-confirm-delete-thesis');
    const originalText = btn.innerHTML;
    
    try {
        // Ubah tombol jadi loading
        btn.disabled = true;
        btn.innerHTML = '<i class="animate-spin size-4" data-lucide="loader-2"></i> Menghapus...';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        // Hapus dari database
        const { error } = await window.supabaseClient.from('thesis_projects').delete().eq('id', currentThesisId);
        if (error) throw error;

        // Tutup modal, tutup detail, dan muat ulang daftar
        if (typeof window.closeModal === 'function') window.closeModal('modal-delete-thesis');
        closeThesisDetail();
        window.loadThesisData();
        
        if (typeof window.showToast === 'function') window.showToast('Proyek Skripsi berhasil dihapus', 'success');
        
    } catch (error) {
        console.error("Gagal menghapus:", error);
        alert("Gagal menghapus proyek: Cek Console.");
    } finally {
        // Kembalikan tombol seperti semula
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}