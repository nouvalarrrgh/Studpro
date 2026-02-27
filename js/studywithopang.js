// js/studywithopang.js

// ==============================================================
// 1. STATE & NAVIGASI UI STUDY SUITE
// ==============================================================
let rawDocumentText = ""; 
let flashcardsAI = [];
let currentCardIndex = 0;
let isFlipped = false;
let quizQuestions = [];

// Logika Ganti Tab
document.querySelectorAll('.study-tab').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
        // Reset warna semua tab
        document.querySelectorAll('.study-tab').forEach(btn => {
            // Hapus warna oren dan kembalikan ke warna abu teks-secondary
            btn.classList.remove('bg-[#F97316]', 'text-white', 'shadow-md');
            btn.classList.add('text-secondary', 'hover:bg-gray-200');
        });
        
        // Tab yang diklik jadi oranye
        // Hapus hover abu dan tambahkan warna aktif oranye
        tabBtn.classList.remove('text-secondary', 'hover:bg-gray-200');
        tabBtn.classList.add('bg-[#F97316]', 'text-white', 'shadow-md');

        // Sembunyikan semua konten, tampilkan yang dipilih
        const targetId = tabBtn.getAttribute('data-tab');
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
            if(content.id !== 'tab-note' && content.id !== 'tab-mindmap' && content.id !== 'tab-flashcards') {
                content.classList.remove('flex'); 
            }
        });
        
        const activeContent = document.getElementById(targetId);
        activeContent.classList.remove('hidden');
        if(targetId === 'tab-note' || targetId === 'tab-mindmap' || targetId === 'tab-flashcards') {
            activeContent.classList.add('flex'); 
        }

        // PERBAIKAN MIND MAP: Mematikan batasan layar agar bisa membesar & di-scroll
        if(targetId === 'tab-mindmap') {
            const svg = document.querySelector('#mindmap-container svg');
            if(svg) svg.style.maxWidth = 'none'; 
        }
    });
});

// Fitur Toolbar Sederhana untuk Note Editable
window.formatDoc = function(cmd) { document.execCommand(cmd, false, null); }


// ==============================================================
// 2. KONEKSI AI GEMINI (MENDUKUNG MULTIMODAL / GAMBAR & PDF)
// ==============================================================
// 🔥 KUNCI API TELAH DIHAPUS DARI SINI DEMI KEAMANAN

// 🔥 FUNGSI PENARIK AI YANG SUDAH DILENGKAPI DETEKTIF ERROR
async function fetchGeminiResponse(promptText, inlineData = null) {
    let parts = [{ text: promptText }];
    
    // Jika ada file (PDF/Gambar), tambahkan ke payload sebagai "Mata" AI
    if (inlineData) {
        parts.push({
            inline_data: {
                mime_type: inlineData.mimeType,
                data: inlineData.base64
            }
        });
    }

    try {
        const { data, error } = await window.supabaseClient.functions.invoke('hyper-endpoint', {
            body: { parts: parts } 
        });

        // 1. Cek error dari sisi jaringan Supabase
        if (error) throw new Error('API AI menolak koneksi via Proxy: ' + error.message);

        // 2. 🔥 DETEKTIF: Cek apakah Google Gemini membalas dengan pesan Error
        if (data && data.error) {
            console.error("❌ ERROR DARI GOOGLE GEMINI:", data.error);
            throw new Error(`Ditolak Google: ${data.error.message}`);
        }

        // 3. Cek apakah jawaban AI diblokir oleh Filter Keamanan (Pornografi/Kekerasan/dll)
        if (data && data.candidates && data.candidates[0] && data.candidates[0].finishReason === 'SAFETY') {
             throw new Error('Jawaban AI ditahan oleh Filter Keamanan Google.');
        }

        // 4. Pastikan format akhir benar
        if (!data || !data.candidates || !data.candidates[0].content) {
            console.error("❓ RAW DATA MISTERIUS DARI SERVER:", data);
            throw new Error('Format balasan AI tidak valid. Buka Console (F12) untuk melihat data asli.');
        }
        
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('AI Error Terdeteksi:', error);
        throw error; // Lempar ke fungsi pemanggil agar UI menampilkan pesan merah
    }
}

// --- A. BACA DOKUMEN/GAMBAR & OTOMATIS GENERATE NOTE ---
document.getElementById('upload-doc').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    window.showToast('Menerima file. Membangunkan Opang...', 'success');
    
    ['nav-note', 'nav-mindmap', 'nav-flashcards', 'nav-quiz'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    document.getElementById('nav-note').click(); 
    
    const editor = document.getElementById('ai-note-editor');
    editor.innerHTML = '<div class="text-center py-12"><p class="text-base text-secondary italic animate-pulse">Mata AI Opang sedang memindai file Anda...<br><span class="text-sm font-bold text-primary mt-2 block">(Memproses Gambar/PDF butuh waktu 10-20 detik)</span></p></div>';

    const fileType = file.type;
    const reader = new FileReader();
    
    reader.onload = async function(evt) {
        const result = evt.target.result;
        
        let prompt = `Anda adalah seorang Asisten Akademik Ahli yang bertugas mengekstrak dan merangkum materi perkuliahan menjadi catatan (*smart note*) yang sangat akurat. Abaikan teks sampah (nomor halaman, watermark).

STRUKTUR HTML YANG WAJIB DIIKUTI:
<h1>[Judul Utama Materi]</h1>
<p><i>[Ringkasan Eksekutif]</i></p>

<h2 style="color: #165DFF; margin-top: 20px;">🔑 Konsep Utama</h2>
<ul>
  <li><b>[Kata Kunci 1]:</b> [Penjelasan]</li>
</ul>

<h2 style="color: #165DFF; margin-top: 20px;">📝 Detail & Poin Penting</h2>
<p>[Jelaskan mekanisme, rumus, atau detail penting di sini]</p>

<h2 style="color: #165DFF; margin-top: 20px;">🎯 Kesimpulan</h2>
<p>[Kesimpulan materi]</p>

SYARAT TEKNIS MUTLAK:
1. KEMBALIKAN HANYA FORMAT HTML MURNI tanpa markdown.`;

        let inlineData = null;

        if (fileType === 'text/plain') {
            prompt += `\n\nTeks Materi:\n"""\n${result.substring(0, 15000)}\n"""`;
        } else {
            const base64String = result.split(',')[1];
            inlineData = {
                mimeType: fileType,
                base64: base64String
            };
            prompt += `\n\nSilakan gunakan Visi/Penglihatan AI Anda untuk membaca dokumen/gambar yang dilampirkan ini. Ekstrak semua teks pentingnya dan susun sesuai struktur HTML di atas. Jika ada diagram atau rumus dalam gambar, jelaskan.`;
        }

        try {
            const aiHtml = await fetchGeminiResponse(prompt, inlineData);
            let cleanHtml = aiHtml.replace(/```html/g, '').replace(/```/g, '').trim();
            editor.innerHTML = cleanHtml;
            window.showToast('Penglihatan AI berhasil! Catatan siap.', 'success');
        } catch (error) {
            editor.innerHTML = '<p class="text-error font-bold text-lg">Gagal memindai file.</p><p class="text-base text-secondary">Pastikan ukuran file ringan dan server Edge Functions aktif.</p>';
            window.showToast('Gagal memproses file ke AI.', 'error');
        }
    };

    if (fileType === 'text/plain') {
        reader.readAsText(file);
    } else {
        reader.readAsDataURL(file);
    }
});


// --- B. AI TUTOR (Disamping Note) ---
window.sendChat = async function() {
    const input = document.getElementById('chat-input');
    const box = document.getElementById('chat-messages');
    const msg = input.value.trim();
    
    if (!msg) return;
    
    if (box.querySelector('.text-center')) box.innerHTML = '';
    
    box.innerHTML += `<div class="mb-3 flex justify-end"><div class="bg-primary text-white px-3 py-2 rounded-xl rounded-br-sm max-w-[85%] text-sm shadow-sm">${msg}</div></div>`;
    input.value = '';
    box.scrollTop = box.scrollHeight;
    
    const typingId = 'typing-' + Date.now();
    box.innerHTML += `<div id="${typingId}" class="mb-3 flex justify-start"><div class="bg-white border border-border text-secondary px-3 py-2 rounded-xl rounded-bl-sm max-w-[85%] text-sm shadow-sm italic">Opang sedang mengetik...</div></div>`;
    box.scrollTop = box.scrollHeight;

    const currentNote = document.getElementById('ai-note-editor').innerText;
    const prompt = `Kamu adalah Opang, asisten belajar mahasiswa 24/7. Jawab dengan santai, suportif, dan sangat akurat. 
    Ini adalah catatan yang sedang dibaca mahasiswa:\n${currentNote.substring(0, 3000)}\n\nPertanyaan Mahasiswa: ${msg}`;

    try {
        const reply = await fetchGeminiResponse(prompt);
        document.getElementById(typingId).remove();
        const cleanReply = reply.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        box.innerHTML += `<div class="mb-3 flex justify-start"><div class="bg-white border border-border text-foreground px-3 py-2 rounded-xl rounded-bl-sm max-w-[85%] text-sm shadow-sm leading-relaxed">${cleanReply}</div></div>`;
        box.scrollTop = box.scrollHeight;
    } catch(err) {
        document.getElementById(typingId).remove();
        box.innerHTML += `<div class="mb-3 flex justify-start"><div class="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl rounded-bl-sm max-w-[85%] text-sm shadow-sm italic">Gagal menyambung ke server AI.</div></div>`;
    }
}
document.getElementById('chat-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.sendChat(); });


// --- C. AI MIND MAP (Mermaid.js Anti-Error) ---
window.generateMindMap = async function() {
    const btn = document.getElementById('btn-generate-mindmap');
    const container = document.getElementById('mindmap-container');
    const currentNote = document.getElementById('ai-note-editor').innerText;
    
    if(!currentNote || currentNote.length < 50) {
        window.showToast('Catatan kosong. Tidak bisa membuat Mind Map.', 'error'); return;
    }

    btn.disabled = true; btn.innerHTML = "Memproses...";
    container.innerHTML = '<div class="text-center text-primary animate-pulse"><p class="font-bold text-lg">Opang sedang memetakan hierarki konsep materi...</p></div>';

    // PROMPT SUPER KETAT UNTUK MERMAID
    const prompt = `Buatkan Mind Map berstruktur hierarki dari teks materi berikut menggunakan SINTAKS MERMAID.JS.
    SYARAT WAJIB MERMAID (HARUS DIPATUHI AGAR TIDAK ERROR):
    1. Selalu awali dengan: graph TD
    2. Format node WAJIB seperti ini: ID["Teks Label"]
    3. Hubungkan antar node dengan --> 
    4. JANGAN PERNAH menggunakan karakter tanda kutip (") atau kurung kurawal di dalam Teks Label.
    5. JANGAN ADA TEKS APAPUN selain kode mermaid murni.

    Contoh Output Benar:
    graph TD
    A["Sistem Pencernaan"] --> B["Mulut"]
    A --> C["Lambung"]
    B --> D["Gigi"]
    
    Materi:\n ${currentNote.substring(0, 5000)}`;

    try {
        const rawMermaid = await fetchGeminiResponse(prompt);
        let cleanCode = rawMermaid.replace(/```mermaid/g, '').replace(/```/g, '').trim();
        
        if (!cleanCode.startsWith('graph')) {
            cleanCode = 'graph TD\n' + cleanCode;
        }
        
        container.innerHTML = `<pre class="mermaid">${cleanCode}</pre>`;
        
        // TRY-CATCH KHUSUS MERMAID RENDER
        try {
            await mermaid.run({ querySelector: '.mermaid' });
            window.showToast('Mind Map Berhasil Dibuat!', 'success');
        } catch (mermaidError) {
            console.warn("Mermaid gagal menggambar struktur AI:", mermaidError);
            container.innerHTML = '<p class="text-error font-bold text-center text-lg">Struktur data dari AI kurang sempurna.</p><p class="text-secondary text-base text-center mt-2">Silakan klik tombol "Generate AI" sekali lagi.</p>';
        }

    } catch (error) {
        container.innerHTML = '<p class="text-error font-bold text-center text-lg">Koneksi ke AI terputus.</p>';
    } finally {
        btn.disabled = false; 
        btn.innerHTML = `<i data-lucide="refresh-cw" class="size-5 inline mr-1"></i> Generate AI`; 
        
        // PENGAMAN 2: Cegah crash icon saat Mind Map selesai
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}


// --- D. AI FLASHCARDS ---
function updateFlashcardUI() {
    const frontEl = document.getElementById('fc-display-q');
    const backEl = document.getElementById('fc-display-a');
    const counterEl = document.getElementById('fc-counter');
    const flipper = document.getElementById('flashcard-flipper');

    isFlipped = false;
    flipper.classList.remove('rotate-y-180');

    if(flashcardsAI.length === 0) {
        frontEl.innerHTML = 'Klik "Generate dari Note" di sudut atas.';
        backEl.innerHTML = '';
        counterEl.textContent = '0 / 0';
        return;
    }

    const card = flashcardsAI[currentCardIndex];
    frontEl.innerHTML = card.q || card.question;
    backEl.innerHTML = card.a || card.answer;
    counterEl.textContent = `${currentCardIndex + 1} / ${flashcardsAI.length}`;
}

window.flipCurrentCard = function() {
    if(flashcardsAI.length === 0) return;
    const flipper = document.getElementById('flashcard-flipper');
    isFlipped = !isFlipped;
    if(isFlipped) flipper.classList.add('rotate-y-180');
    else flipper.classList.remove('rotate-y-180');
}

window.prevCard = function() {
    if(flashcardsAI.length === 0) return;
    if(currentCardIndex > 0) { currentCardIndex--; updateFlashcardUI(); }
}

window.nextCard = function() {
    if(flashcardsAI.length === 0) return;
    if(currentCardIndex < flashcardsAI.length - 1) { currentCardIndex++; updateFlashcardUI(); }
}

window.deleteCurrentFlashcard = function() {
    if(flashcardsAI.length === 0) return;
    flashcardsAI.splice(currentCardIndex, 1);
    if(currentCardIndex >= flashcardsAI.length && currentCardIndex > 0) currentCardIndex--;
    updateFlashcardUI();
}

window.autoGenerateFlashcards = async function() {
    const currentNote = document.getElementById('ai-note-editor').innerText;
    if(!currentNote || currentNote.length < 50) { window.showToast('Note kosong!', 'error'); return; }

    const btn = document.getElementById('btn-ai-flashcard');
    btn.disabled = true; btn.textContent = "Menyusun Kartu...";

    const prompt = `Buatkan 10 pasang Pertanyaan dan Jawaban singkat (Flashcards) dari materi berikut untuk hafalan.
    KEMBALIKAN HANYA FORMAT JSON ARRAY MURNI TANPA TEKS LAIN. CONTOH:
    [{"q": "Apa fungsi Mitokondria?", "a": "Sebagai pusat pembangkit energi sel (respirasi sel)."}, {"q": "Apa itu Fotosintesis?", "a": "Proses tumbuhan..."}]
    
    Materi:\n ${currentNote.substring(0, 5000)}`;

    try {
        const rawJson = await fetchGeminiResponse(prompt);
        const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(cleanJson);
        
        flashcardsAI = result;
        currentCardIndex = 0;
        updateFlashcardUI();
        window.showToast(`${flashcardsAI.length} Flashcard berhasil dibuat!`, 'success');
    } catch(e) {
        window.showToast('Gagal memproses JSON dari AI.', 'error');
    } finally {
        btn.disabled = false; 
        btn.innerHTML = `<i data-lucide="sparkles" class="size-4 inline mr-1"></i> Generate dari Note`; 
        
        // PENGAMAN 3: Cegah crash icon saat Flashcard selesai
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

// --- F. INTEGRASI KE RUANG KERJA (SUPABASE POSTGRESQL) ---
window.exportNoteToWorkspace = async function() {
    const editor = document.getElementById('ai-note-editor');
    const content = editor.innerHTML;
    
    // 1. Cegah export jika masih kosong atau AI masih berpikir
    if (!content || content.includes('Mata AI Opang') || content.trim() === '') {
        if (typeof window.showToast === 'function') window.showToast('Note masih kosong. Tunggu AI selesai merangkum.', 'error');
        return;
    }

    // 2. Ekstrak Judul dari Tag H1
    let docTitle = 'Catatan AI: ' + new Date().toLocaleDateString('id-ID');
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const h1 = tempDiv.querySelector('h1');
    if(h1 && h1.innerText.trim() !== '') docTitle = h1.innerText.trim();

    // 3. Pengecekan Login menggunakan variabel GLOBAL window.dbUser
    if (!window.dbUser || !window.dbUser.id) {
        if (typeof window.showToast === 'function') window.showToast('Gagal export: Anda belum login.', 'error');
        return;
    }

    // 4. Rakit Data (HANYA KOLOM DATA, JANGAN MASUKKAN ID)
    const newPage = { 
        user_id: parseInt(window.dbUser.id), 
        title: docTitle, 
        type: 'note', 
        content: content, 
        tasks: {todo:[], progress:[], done:[]}, 
        columns: ['Kolom 1', 'Kolom 2'], 
        rows: [] 
    };
    
    try {
        // 5. Kirim data ke tabel workspace_pages di Supabase
        const { error } = await supabaseClient.from('workspace_pages').insert([newPage]);

        if (!error) {
            if (typeof window.showToast === 'function') window.showToast('Berhasil diexport ke Ruang Kerja!', 'success');
            
            // Refresh daftar workspace agar catatan langsung muncul di layar!
            if (typeof window.loadWorkspacePages === 'function') {
                await window.loadWorkspacePages();
            }
            
            // Pindah tab secara otomatis ke Ruang Kerja melalui navigasi utama
            const workspaceBtn = document.querySelector('.nav-btn[data-target="workspace"]');
            if(workspaceBtn) workspaceBtn.click();
            
        } else {
            console.error("Supabase Error saat Export:", error);
            if (typeof window.showToast === 'function') window.showToast('Gagal export: Cek Console (F12)', 'error');
        }
    } catch (err) {
        console.error("Crash Javascript saat Export:", err);
        if (typeof window.showToast === 'function') window.showToast('Terjadi kesalahan sistem.', 'error');
    }
};

// --- E. AI QUIZ ---
window.generateQuiz = async function() {
    const container = document.getElementById('quiz-container');
    const resultBox = document.getElementById('quiz-result');
    const btn = document.getElementById('btn-generate-quiz');
    const currentNote = document.getElementById('ai-note-editor').innerText;

    if(!currentNote || currentNote.length < 50) { window.showToast('Note kosong!', 'error'); return; }

    btn.disabled = true; btn.textContent = "Meracik Soal...";
    container.innerHTML = '<div class="text-center py-10"><p class="text-primary font-bold text-xl animate-bounce">Opang sedang meracik soal yang menantang...</p></div>';
    resultBox.classList.add('hidden');

    const prompt = `Buatkan MINIMAL 5 SOAL pilihan ganda (A, B, C, D) untuk menguji pemahaman materi ini.
    KEMBALIKAN HANYA FORMAT JSON ARRAY MURNI TANPA TEKS LAIN. (Opsi jawaban harus berupa Array String, correct berupa index 0-3).
    CONTOH WAJIB:
    [
      {"question": "Siapa penemu lampu?", "options": ["Tesla", "Edison", "Newton", "Einstein"], "correct": 1},
      {"question": "Pertanyaan 2?", "options": ["A", "B", "C", "D"], "correct": 0}
    ]
    Materi:\n ${currentNote.substring(0, 5000)}`;

    try {
        const rawJson = await fetchGeminiResponse(prompt);
        const cleanJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
        quizQuestions = JSON.parse(cleanJson);
        
        container.innerHTML = quizQuestions.map((q, qIdx) => `
            <div class="bg-white border border-border rounded-xl p-5 shadow-sm">
                <p class="font-bold text-base mb-4">${qIdx + 1}. ${q.question}</p>
                <div class="space-y-2">
                ${q.options.map((opt, optIdx) => `
                    <label class="flex items-center text-sm cursor-pointer bg-gray-50 hover:bg-gray-100 p-4 rounded-xl border border-border transition w-full group">
                        <input type="radio" name="quiz-q${qIdx}" value="${optIdx}" class="size-4 accent-primary mr-3 cursor-pointer">
                        <span class="group-hover:text-primary font-medium">${opt}</span>
                    </label>
                `).join('')}
                </div>
            </div>
        `).join('');

        container.innerHTML += `<button onclick="submitQuiz()" class="w-full mt-4 py-3 bg-primary text-white rounded-xl font-bold text-base hover:bg-primary-hover transition cursor-pointer shadow-lg">Submit Jawaban</button>`;
        window.showToast(`Kuis ${quizQuestions.length} soal siap!`, 'success');

    } catch(e) {
        container.innerHTML = '<p class="text-error text-center text-lg py-4">Gagal memformat Kuis. Silakan coba lagi.</p>';
    } finally {
        btn.disabled = false; btn.textContent = "Generate Kuis Ulang";
    }
}

window.submitQuiz = function() {
    let score = 0;
    quizQuestions.forEach((q, idx) => {
        const selected = document.querySelector(`input[name="quiz-q${idx}"]:checked`);
        if (selected && parseInt(selected.value, 10) === q.correct) score++;
    });
    
    document.getElementById('quiz-result').classList.remove('hidden');
    document.getElementById('quiz-score').textContent = `${score}/${quizQuestions.length}`;
    
    const percentage = score / quizQuestions.length;
    const feedback = document.getElementById('quiz-feedback');
    if (percentage === 1) feedback.textContent = "Sempurna! Pemahamanmu sangat kuat.";
    else if (percentage >= 0.7) feedback.textContent = "Luar biasa! Sedikit lagi sempurna.";
    else feedback.textContent = "Tetap semangat! Coba baca lagi Note dari AI di tab sebelah.";
    
    document.getElementById('quiz-result').scrollIntoView({ behavior: 'smooth' });
}