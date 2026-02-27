// js/prediction.js

let predictionCollections = [];
let isJawabanShown = false;

// 🔥 KUNCI API TELAH DIHAPUS DARI SINI DEMI KEAMANAN

async function getUserId() {
    return window.dbUser ? window.dbUser.id : null;
}

window.loadPredictionData = async function() {
    const userId = await getUserId();
    if(!userId) return;
    const { data, error } = await window.supabaseClient.from('prediction_collections').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if(!error && data) { predictionCollections = data; }
    renderPredictionGrid();
}

function renderPredictionGrid() {
    const grid = document.getElementById('prediction-grid');
    
    const countText = document.getElementById('pred-count-text');
    if (countText) {
        countText.textContent = predictionCollections.length;
    }
    
    if (!grid) return;
    
    if(predictionCollections.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-12"><div class="size-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 border border-border"><i data-lucide="folder-search" class="size-8 text-gray-400"></i></div><p class="text-secondary">Belum ada prediksi ujian.<br>Klik <b>"+ Buat Prediksi"</b> untuk mulai menganalisis.</p></div>`;
        return;
    }

    grid.innerHTML = predictionCollections.map((col, idx) => `
        <div class="bg-white border border-border rounded-xl p-5 hover:shadow-lg hover:border-rose-300 transition cursor-pointer group flex flex-col h-full relative" onclick="openPredictionDetail(${idx})">
            <button onclick="event.stopPropagation(); deletePrediction(${col.id})" class="absolute top-3 right-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i data-lucide="trash-2" class="size-4"></i></button>
            <div class="flex items-start justify-between mb-3">
                <div class="size-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center shrink-0"><i data-lucide="target" class="size-5"></i></div>
                <span class="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full uppercase">${col.exam_type}</span>
            </div>
            <h3 class="font-bold text-foreground mb-1 line-clamp-2">${col.title}</h3>
            <p class="text-xs text-secondary mb-4 flex items-center gap-1"><i data-lucide="book-open" class="size-3"></i> ${col.subject}</p>
            <div class="mt-auto pt-3 border-t border-border flex justify-between items-center"><span class="text-xs font-bold text-primary">${col.questions.length} Soal AI</span><i data-lucide="arrow-right" class="size-4 text-gray-300 group-hover:text-primary transition-colors"></i></div>
        </div>
    `).join('');
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

document.getElementById('form-prediction')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-pred');
    const title = document.getElementById('pred-title').value;
    const subject = document.getElementById('pred-subject').value;
    const type = document.getElementById('pred-type').value;
    const file = document.getElementById('pred-file').files[0];
    const userId = await getUserId();
    
    if(!file || !userId) return;

    btn.disabled = true; btn.textContent = "AI Sedang Menganalisis...";
    
    try {
        let inlineData = null;
        if(file.type.startsWith('image/')) {
            const base64 = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.readAsDataURL(file); });
            inlineData = { mimeType: file.type, base64 };
        }

        const prompt = `Bertindaklah sebagai Dosen Ahli untuk mata kuliah/pelajaran ${subject}. Analisis dokumen/gambar soal ujian lama ini. Berdasarkan pola, tingkat kesulitan (${type}), dan materi yang ada, buatlah 5 prediksi soal ujian (Pilihan Ganda) yang paling mungkin keluar di ujian berikutnya. 
        KEMBALIKAN HANYA FORMAT JSON ARRAY MURNI TANPA TEKS LAIN! JANGAN ADA KATA PENGANTAR "Baik, ini...". HARUS DIMULAI DENGAN '[' DAN DIAKHIRI DENGAN ']'.
        Contoh Format WAJIB: [{"q":"Soal", "options":["A","B","C","D"], "answer":"A", "explanation":"alasan"}]`;

        // Panggil fungsi proxy
        const responseText = await fetchPredictionAI(prompt, inlineData);
        
        const firstBracket = responseText.indexOf('[');
        const lastBracket = responseText.lastIndexOf(']');
        
        if (firstBracket === -1 || lastBracket === -1) {
            throw new Error("AI gagal memformat struktur JSON. Coba ulangi lagi.");
        }
        
        const cleanJson = responseText.substring(firstBracket, lastBracket + 1);
        const aiResultArray = JSON.parse(cleanJson);

        const payload = { user_id: userId, title, subject, exam_type: type, questions: aiResultArray };
        
        const { error } = await window.supabaseClient.from('prediction_collections').insert([payload]);
        if (error) throw error;

        window.closeModal('modal-prediction');
        this.reset(); window.loadPredictionData(); window.showToast('Prediksi Soal berhasil dibuat!', 'success');

    } catch(err) {
        console.error("Kesalahan Prediksi AI:", err);
        alert("Gagal menganalisis: " + err.message);
    } finally {
        btn.disabled = false; btn.textContent = "Lanjut Analisis";
    }
});

// 🔥 FUNGSI FETCH YANG SUDAH DIAMANKAN DENGAN EDGE FUNCTION
async function fetchPredictionAI(promptText, inlineData = null) {
    let parts = [{ text: promptText }];
    
    // Masukkan file gambar jika ada
    if (inlineData) {
        parts.push({ 
            inline_data: { mime_type: inlineData.mimeType, data: inlineData.base64 } 
        });
    }

    // Panggil proxy Edge Function kita yang sudah dimodifikasi
    const { data, error } = await window.supabaseClient.functions.invoke('hyper-endpoint', {
        body: { parts: parts } // Kirim "parts" agar bisa menangani file + teks
    });
    
    if (error) throw new Error('API AI menolak koneksi via Proxy: ' + error.message);
    if (!data || !data.candidates || !data.candidates[0].content) throw new Error('Format balasan AI tidak valid.');
    
    return data.candidates[0].content.parts[0].text;
}

window.openPredictionDetail = function(idx) {
    const col = predictionCollections[idx];
    document.getElementById('prediction-list-view').classList.add('hidden');
    document.getElementById('prediction-detail-view').classList.remove('hidden');
    
    document.getElementById('detail-title').textContent = col.title;
    document.getElementById('detail-subject').textContent = col.subject;
    document.getElementById('detail-badge').textContent = col.exam_type;

    const container = document.getElementById('predicted-questions-container');
    isJawabanShown = false;
    document.getElementById('btn-toggle-jawaban').textContent = "Tampilkan Kunci Jawaban";
    document.getElementById('btn-toggle-jawaban').classList.remove('bg-primary', 'text-white', 'border-primary');
    document.getElementById('btn-toggle-jawaban').classList.add('bg-transparent', 'text-secondary');

    container.innerHTML = col.questions.map((q, i) => `
        <div class="bg-white border border-border rounded-xl p-5 shadow-sm mb-4">
            <h4 class="font-bold text-base mb-3"><span class="text-rose-500 mr-2">${i+1}.</span> ${q.q}</h4>
            <div class="space-y-2 pl-6">
                ${q.options.map(opt => `<div class="p-3 rounded-lg border border-border bg-gray-50 text-sm option-box" data-correct="${opt === q.answer}">${opt}</div>`).join('')}
            </div>
            <div class="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg hidden pred-explanation">
                <p class="text-sm text-blue-900 font-medium"><i data-lucide="lightbulb" class="size-4 inline mr-1 -mt-0.5"></i> <b>Penjelasan:</b> ${q.explanation}</p>
            </div>
        </div>
    `).join('');
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.toggleJawabanPrediksi = function() {
    isJawabanShown = !isJawabanShown;
    const btn = document.getElementById('btn-toggle-jawaban');
    if(isJawabanShown) {
        btn.textContent = "Sembunyikan Jawaban"; btn.classList.add('bg-primary', 'text-white', 'border-primary');
        document.querySelectorAll('[data-correct="true"]').forEach(el => { el.classList.add('bg-success-light', 'border-success', 'ring-1', 'ring-success'); el.classList.remove('bg-gray-50'); });
        document.querySelectorAll('.pred-explanation').forEach(el => el.classList.remove('hidden'));
    } else {
        btn.textContent = "Tampilkan Kunci Jawaban"; btn.classList.remove('bg-primary', 'text-white', 'border-primary'); btn.classList.add('bg-transparent', 'text-secondary');
        document.querySelectorAll('[data-correct="true"]').forEach(el => { el.classList.remove('bg-success-light', 'border-success', 'ring-1', 'ring-success'); el.classList.add('bg-gray-50'); });
        document.querySelectorAll('.pred-explanation').forEach(el => el.classList.add('hidden'));
    }
}

window.backToPredictionList = function() {
    document.getElementById('prediction-list-view').classList.remove('hidden'); document.getElementById('prediction-detail-view').classList.add('hidden');
}

window.deletePrediction = async function(id) {
    if(confirm('Hapus koleksi prediksi ini?')) { await window.supabaseClient.from('prediction_collections').delete().eq('id', id); window.loadPredictionData(); }
}