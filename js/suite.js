// js/suite.js

// 🔥 PERBAIKAN 1: Mengambil ID Angka dari Global Variable, bukan UUID dari Session
async function getUserId() {
    return window.dbUser ? window.dbUser.id : null;
}

// ==========================================
// 1. STUSPACE (NOTION-LIKE WORKSPACE)
// ==========================================
let workspaceData = { pages: [] };
let activePageId = null;

window.loadWorkspaceData = async function() {
    const userId = await getUserId();
    if(!userId) return;
    
    const { data, error } = await window.supabaseClient.from('workspace_pages').select('*').eq('user_id', userId).order('created_at', { ascending: true });
    if(!error && data) workspaceData.pages = data;
    
    renderWorkspaceSidebar();
    if(activePageId && workspaceData.pages.find(p => p.id === activePageId)) openPage(activePageId);
    else if(workspaceData.pages.length > 0) openPage(workspaceData.pages[0].id);
    else document.getElementById('workspace-content').innerHTML = '<div class="flex flex-col items-center justify-center h-full text-secondary opacity-50"><i data-lucide="layout" class="size-16 mb-4"></i><p>Pilih atau buat halaman untuk memulai.</p></div>';
}

window.saveWorkspacePage = async function(pageId) {
    const userId = await getUserId();
    const page = workspaceData.pages.find(p => p.id === pageId);
    if(!page || !userId) return;
    
    const payload = {
        id: page.id, user_id: userId, title: page.title, type: page.type,
        content: page.content || '', tasks: page.tasks || null, columns: page.columns || null, rows: page.rows || null
    };
    await window.supabaseClient.from('workspace_pages').upsert([payload]);
}

window.renderWorkspaceSidebar = function() {
    const list = document.getElementById('workspace-page-list');
    if(!list) return;
    list.innerHTML = workspaceData.pages.map(page => `
        <div class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-100 text-sm group ${activePageId === page.id ? 'bg-gray-200 font-semibold text-foreground' : 'text-secondary'}" onclick="openPage(${page.id})">
            <div class="flex items-center gap-2 truncate"><i data-lucide="${page.type === 'kanban' ? 'trello' : (page.type === 'table' ? 'database' : 'file-text')}" class="size-4 shrink-0"></i><span class="truncate">${page.title}</span></div>
            <button onclick="event.stopPropagation(); deletePage(${page.id})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition shrink-0 tooltip" title="Hapus Halaman"><i data-lucide="trash-2" class="size-3.5"></i></button>
        </div>
    `).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.createNewPage = async function(type) {
    const userId = await getUserId();
    if(!userId) return;
    const title = prompt("Nama Halaman Baru:", "Halaman Tanpa Judul");
    if(!title) return;
    
    // 🔥 PERBAIKAN 2: Hapus id: Date.now() agar Supabase membuat ID otomatis
    const payload = { user_id: userId, title, type, content: '', tasks: {todo:[], progress:[], done:[]}, columns: ['Kolom 1', 'Kolom 2'], rows: [] };
    
    // Tarik data kembalian (termasuk ID baru) dari Supabase
    const { data, error } = await window.supabaseClient.from('workspace_pages').insert([payload]).select().single();
    
    if (!error && data) {
        workspaceData.pages.push(data);
        renderWorkspaceSidebar();
        openPage(data.id);
    } else {
        if (typeof window.showToast === 'function') window.showToast('Gagal membuat halaman', 'error');
    }
}

window.deletePage = async function(id) {
    if(confirm('Hapus halaman ini permanen?')) {
        await window.supabaseClient.from('workspace_pages').delete().eq('id', id);
        workspaceData.pages = workspaceData.pages.filter(p => p.id !== id);
        activePageId = workspaceData.pages.length > 0 ? workspaceData.pages[0].id : null;
        renderWorkspaceSidebar();
        if(activePageId) openPage(activePageId);
        else document.getElementById('workspace-content').innerHTML = '<div class="flex flex-col items-center justify-center h-full text-secondary opacity-50"><i data-lucide="layout" class="size-16 mb-4"></i><p>Pilih atau buat halaman untuk memulai.</p></div>';
    }
}

window.openPage = function(id) {
    activePageId = id;
    renderWorkspaceSidebar();
    const page = workspaceData.pages.find(p => p.id === id);
    if(!page) return;
    const contentArea = document.getElementById('workspace-content');
    
    let html = `<div class="mb-6 border-b border-border pb-4"><input type="text" value="${page.title}" onblur="updatePageTitle(${id}, this.value)" class="text-3xl font-bold w-full outline-none text-foreground placeholder-gray-300 bg-transparent" placeholder="Judul Halaman"><div class="flex gap-2 mt-2 text-xs text-secondary"><span class="bg-gray-100 px-2 py-0.5 rounded capitalize flex items-center gap-1"><i data-lucide="${page.type === 'kanban' ? 'trello' : (page.type === 'table' ? 'database' : 'file-text')}" class="size-3"></i> Mode ${page.type}</span></div></div>`;

    if(page.type === 'note') html += `<div id="editor-${id}" class="editor-content outline-none min-h-[400px]" contenteditable="true" onblur="updatePageContent(${id}, this.innerHTML)" placeholder="Ketik sesuatu, tekan '/' untuk perintah...">${page.content || ''}</div>`;
    else if (page.type === 'kanban') html += renderKanbanHTML(page);
    else if (page.type === 'table') html += renderTableHTML(page);

    contentArea.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.updatePageTitle = function(id, val) { const p = workspaceData.pages.find(p => p.id === id); if(p) { p.title = val || 'Tanpa Judul'; saveWorkspacePage(id); renderWorkspaceSidebar(); } }
window.updatePageContent = function(id, val) { const p = workspaceData.pages.find(p => p.id === id); if(p) { p.content = val; saveWorkspacePage(id); } }

// KANBAN LOGIC
function renderKanbanHTML(page) {
    if(!page.tasks) page.tasks = {todo:[], progress:[], done:[]};
    const renderTasks = (colKey, title, colorClass) => {
        let tasks = page.tasks[colKey] || [];
        tasks = tasks.map(t => { if(typeof t === 'string') return { id: 't_'+Date.now()+Math.floor(Math.random()*100), text: t }; return t; });
        page.tasks[colKey] = tasks;
        return `
            <div class="flex flex-col bg-gray-50/50 rounded-xl border border-gray-200 min-w-[280px] w-[280px] shrink-0 p-3 h-max" ondrop="dropKanban(event, ${page.id}, '${colKey}')" ondragover="allowDropKanban(event)">
                <div class="flex items-center justify-between mb-3 px-1"><span class="font-bold text-sm ${colorClass}">${title}</span><span class="text-xs text-secondary font-bold bg-gray-200 px-2 rounded-full">${tasks.length}</span></div>
                <div class="flex-1 space-y-2 min-h-[100px]" id="col-${page.id}-${colKey}">
                    ${tasks.map(t => `<div class="bg-white p-3 rounded-lg border border-border shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/50 group relative" draggable="true" ondragstart="dragKanban(event, ${page.id}, '${colKey}', '${t.id}')"><p class="text-sm font-medium text-foreground pr-5">${t.text}</p><button onclick="deleteKanbanTask(${page.id}, '${colKey}', '${t.id}')" class="absolute top-3 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><i data-lucide="x" class="size-3.5"></i></button></div>`).join('')}
                </div>
                <button onclick="addKanbanTask(${page.id}, '${colKey}')" class="mt-3 text-secondary text-sm hover:text-foreground hover:bg-gray-100 py-1.5 rounded-lg text-left px-2 w-full flex items-center gap-1 transition"><i data-lucide="plus" class="size-4"></i> Tambah Task</button>
            </div>
        `;
    };
    return `<div class="flex gap-5 overflow-x-auto flex-nowrap w-full pb-6 items-start">${renderTasks('todo', 'To Do', 'text-secondary')}${renderTasks('progress', 'In Progress', 'text-blue-600')}${renderTasks('done', 'Done', 'text-green-600')}</div>`;
}

window.addKanbanTask = function(pageId, colKey) { const t = prompt("Nama tugas:"); if(t) { const p = workspaceData.pages.find(p=>p.id===pageId); if(!p.tasks[colKey]) p.tasks[colKey]=[]; p.tasks[colKey].push({id:'t_'+Date.now(), text:t}); saveWorkspacePage(pageId); openPage(pageId); } }
window.deleteKanbanTask = function(pageId, colKey, taskId) { const p = workspaceData.pages.find(p=>p.id===pageId); p.tasks[colKey] = p.tasks[colKey].filter(t=>t.id!==taskId); saveWorkspacePage(pageId); openPage(pageId); }
let draggedTask = null;
window.dragKanban = function(ev, pageId, fromCol, taskId) { draggedTask = { pageId, fromCol, taskId }; }
window.allowDropKanban = function(ev) { ev.preventDefault(); }
window.dropKanban = function(ev, pageId, toCol) {
    ev.preventDefault();
    if(!draggedTask || draggedTask.pageId !== pageId || draggedTask.fromCol === toCol) return;
    const p = workspaceData.pages.find(p => p.id === pageId);
    const idx = p.tasks[draggedTask.fromCol].findIndex(t => t.id === draggedTask.taskId);
    if(idx > -1) { const [obj] = p.tasks[draggedTask.fromCol].splice(idx, 1); p.tasks[toCol].push(obj); saveWorkspacePage(pageId); openPage(pageId); }
    draggedTask = null;
}

// TABLE LOGIC
function renderTableHTML(page) {
    if(!page.columns) page.columns = ['Name', 'Tags']; if(!page.rows) page.rows = [];
    const headers = page.columns.map((c, i) => `<th class="px-4 py-2 text-left font-semibold text-secondary border-b border-border bg-gray-50 min-w-[150px]"><input type="text" value="${c}" onblur="updateTableColumn(${page.id}, ${i}, this.value)" class="bg-transparent outline-none w-full text-secondary font-semibold"></th>`).join('');
    const rows = page.rows.map(r => `<tr class="hover:bg-gray-50/50 group border-b border-border/50">${page.columns.map(c => `<td class="px-4 py-2 align-top"><div contenteditable="true" onblur="updateTableCell(${page.id}, '${r.id}', '${c}', this.innerText)" class="outline-none min-h-[24px] focus:bg-blue-50/30 p-1 -m-1 rounded">${r[c]||''}</div></td>`).join('')}<td class="w-10 text-center opacity-0 group-hover:opacity-100 transition align-middle"><button onclick="deleteTableRow(${page.id}, '${r.id}')" class="text-gray-400 hover:text-red-500"><i data-lucide="trash-2" class="size-4"></i></button></td></tr>`).join('');
    return `<div class="overflow-x-auto pb-6"><table class="w-full text-sm text-left border-collapse"><thead><tr>${headers}<th class="w-10 border-b border-border bg-gray-50"><button onclick="addTableColumn(${page.id})" class="p-1"><i data-lucide="plus" class="size-4"></i></button></th></tr></thead><tbody>${rows}</tbody></table><button onclick="addTableRow(${page.id})" class="mt-4 text-secondary text-sm flex items-center gap-1"><i data-lucide="plus" class="size-4"></i> Tambah Baris</button></div>`;
}

window.addTableRow = function(pId) { const p=workspaceData.pages.find(p=>p.id===pId); const r={id:'r_'+Date.now()}; p.columns.forEach(c=>r[c]=''); p.rows.push(r); saveWorkspacePage(pId); openPage(pId); }
window.deleteTableRow = function(pId, rId) { const p=workspaceData.pages.find(p=>p.id===pId); p.rows=p.rows.filter(r=>r.id!==rId); saveWorkspacePage(pId); openPage(pId); }
window.addTableColumn = function(pId) { const p=workspaceData.pages.find(p=>p.id===pId); const c='Kolom '+(p.columns.length+1); p.columns.push(c); p.rows.forEach(r=>r[c]=''); saveWorkspacePage(pId); openPage(pId); }
window.updateTableColumn = function(pId, idx, newVal) { if(!newVal.trim()) return; const p=workspaceData.pages.find(p=>p.id===pId); const old=p.columns[idx]; if(old===newVal) return; p.columns[idx]=newVal; p.rows.forEach(r=>{r[newVal]=r[old]; delete r[old];}); saveWorkspacePage(pId); }
window.updateTableCell = function(pId, rId, cName, val) { const p=workspaceData.pages.find(p=>p.id===pId); const r=p.rows.find(r=>r.id===rId); if(r) r[cName]=val; saveWorkspacePage(pId); }

// ==========================================
// 2. STUDRIVE (FILE MANAGER - GOOGLE DRIVE CLONE)
// ==========================================
let driveItems = [];
let currentFolderId = null;
let driveSearchQuery = '';

window.loadDriveData = async function() {
    const userId = await getUserId();
    if(!userId) return;
    const { data, error } = await window.supabaseClient.from('drive_items').select('*').eq('user_id', userId);
    if(!error && data) {
        driveItems = data.map(d => ({
            id: d.id, type: d.type, name: d.name, parent_id: d.parent_id,
            data: d.data, size: d.size, mime_type: d.mime_type, date: new Date(d.created_at).toLocaleDateString()
        }));
    }
    renderDrive();
}

window.searchDrive = function(q) { driveSearchQuery = q.toLowerCase().trim(); renderDrive(); }
window.clearDriveSearch = function() { document.getElementById('drive-search-input').value = ''; driveSearchQuery = ''; renderDrive(); }

window.renderDrive = function() {
    const grid = document.getElementById('drive-grid');
    const bc = document.getElementById('drive-breadcrumbs');
    if(!grid || !bc) return;
    
    let currentItems = [];
    if (driveSearchQuery) {
        currentItems = driveItems.filter(i => i.name.toLowerCase().includes(driveSearchQuery));
        bc.innerHTML = `<span class="font-medium text-blue-600">Hasil: "${driveSearchQuery}"</span><button onclick="clearDriveSearch()" class="ml-3 text-[10px] bg-gray-200 px-2 py-1 rounded-full">Batal</button>`;
    } else {
        let bcHtml = `<span class="hover:text-primary cursor-pointer font-medium" onclick="navigateToFolder(null)">My Drive</span>`;
        if (currentFolderId) {
            let path = [], curr = driveItems.find(i => i.id === currentFolderId);
            while(curr) { path.unshift(curr); curr = driveItems.find(i => i.id === curr.parent_id); }
            path.forEach(p => bcHtml += ` <i data-lucide="chevron-right" class="size-3 text-gray-400"></i> <span class="hover:text-primary cursor-pointer font-medium" onclick="navigateToFolder(${p.id})">${p.name}</span>`);
        }
        bc.innerHTML = bcHtml;
        currentItems = driveItems.filter(i => i.parent_id === currentFolderId);
    }
    
    if(currentItems.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-16 text-secondary"><i data-lucide="folder-open" class="size-10 mx-auto mb-2 opacity-50"></i><p>Kosong.</p></div>`;
    } else {
        currentItems.sort((a, b) => (a.type === 'folder' ? -1 : 1));
        grid.innerHTML = currentItems.map(item => {
            if (item.type === 'folder') {
                return `<div class="bg-white border border-border rounded-2xl p-4 hover:border-blue-400 hover:shadow-md cursor-pointer relative group" onclick="navigateToFolder(${item.id})"><button onclick="event.stopPropagation(); deleteDriveItem(${item.id})" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 z-10"><i data-lucide="trash-2" class="size-4"></i></button><div class="size-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-3"><i data-lucide="folder" class="size-6"></i></div><h4 class="font-bold text-sm truncate">${item.name}</h4></div>`;
            } else {
                let icon = 'file-text', color = 'text-gray-500 bg-gray-100 border-gray-200';
                if(item.mime_type?.includes('image')) { icon = 'image'; color = 'text-purple-600 bg-purple-50'; }
                else if(item.mime_type?.includes('pdf')) { icon = 'file-box'; color = 'text-rose-600 bg-rose-50'; }
                return `<div class="bg-white border border-border rounded-2xl p-4 hover:border-blue-400 hover:shadow-md cursor-pointer relative group flex flex-col h-full" onclick="downloadFile('${item.data}', '${item.name}')"><button onclick="event.stopPropagation(); deleteDriveItem(${item.id})" class="absolute top-2 right-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 z-10 bg-white rounded-full p-1"><i data-lucide="trash-2" class="size-4"></i></button><div class="h-24 ${color} border rounded-xl flex items-center justify-center mb-3 overflow-hidden relative">${item.mime_type?.includes('image') ? `<img src="${item.data}" class="w-full h-full object-cover">` : `<i data-lucide="${icon}" class="size-8"></i>`}</div><h4 class="font-bold text-sm mb-1 line-clamp-1">${item.name}</h4><p class="text-[10px] text-secondary mt-auto">${item.size}</p></div>`;
            }
        }).join('');
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

window.navigateToFolder = function(id) { clearDriveSearch(); currentFolderId = id; renderDrive(); }

window.deleteDriveItem = async function(id) {
    if(confirm('Hapus permanen?')) {
        let idsToDelete = [id];
        const collectChildren = (parentId) => {
            driveItems.filter(i => i.parent_id === parentId).forEach(c => { idsToDelete.push(c.id); if(c.type === 'folder') collectChildren(c.id); });
        }
        collectChildren(id);
        await window.supabaseClient.from('drive_items').delete().in('id', idsToDelete);
        window.loadDriveData();
    }
}

document.getElementById('form-new-folder')?.addEventListener('submit', async function(e) {
    e.preventDefault(); const name = document.getElementById('folder-name').value.trim(); if(!name) return;
    const userId = await getUserId();
    
    // 🔥 PERBAIKAN 3: Hapus id manual
    const payload = { user_id: userId, type: 'folder', name: name, parent_id: currentFolderId };
    
    await window.supabaseClient.from('drive_items').insert([payload]);
    window.closeModal('modal-new-folder'); this.reset(); window.loadDriveData();
});

// ==========================================
// FUNGSI BUAT FOLDER BARU
// ==========================================
document.getElementById('form-new-folder')?.addEventListener('submit', async function(e) {
    e.preventDefault(); 
    const name = document.getElementById('folder-name').value.trim(); 
    if(!name) return;
    
    const userId = await getUserId();
    const payload = { user_id: userId, type: 'folder', name: name, parent_id: currentFolderId };
    
    // 🔥 PERBAIKAN: Cek error dari Supabase!
    const { error } = await window.supabaseClient.from('drive_items').insert([payload]);
    
    if (error) {
        console.error("Supabase Error (Folder):", error);
        if (typeof window.showToast === 'function') window.showToast('Gagal membuat folder!', 'error');
    } else {
        window.closeModal('modal-new-folder'); 
        this.reset(); 
        window.loadDriveData();
        if (typeof window.showToast === 'function') window.showToast('Folder berhasil dibuat!', 'success');
    }
});

// ==========================================
// FUNGSI UPLOAD FILE BARU
// ==========================================
document.getElementById('form-upload-file')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const file = document.getElementById('drive-file-input').files[0];
    const customName = document.getElementById('drive-file-name').value.trim();
    
    if(!file || !customName) return;
    if(file.size > 5 * 1024 * 1024) { 
        if (typeof window.showToast === 'function') window.showToast('Gagal: Ukuran file maksimal 5MB.', 'error'); 
        return; 
    }

    const userId = await getUserId();
    window.closeModal('modal-upload-file'); 
    this.reset();
    
    // Tampilkan notifikasi loading (opsional)
    if (typeof window.showToast === 'function') window.showToast('Sedang mengunggah...', 'info');
    
    const reader = new FileReader();
    reader.onload = async function(evt) {
        const payload = { 
            user_id: userId, 
            type: 'file', 
            name: customName, 
            mime_type: file.type, 
            size: (file.size/1024).toFixed(1)+' KB', 
            data: evt.target.result, 
            parent_id: currentFolderId 
        };
        
        // 🔥 PERBAIKAN: Cek error dari Supabase!
        const { error } = await window.supabaseClient.from('drive_items').insert([payload]);
        
        if (error) {
            console.error("Supabase Error (Upload):", error);
            if (typeof window.showToast === 'function') window.showToast('Gagal mengunggah file!', 'error');
        } else {
            window.loadDriveData(); 
            if (typeof window.showToast === 'function') window.showToast('File berhasil diunggah!', 'success');
        }
    };
    reader.readAsDataURL(file);
});

window.downloadFile = function(dataUrl, filename) { const a = document.createElement('a'); a.href = dataUrl; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); }

// ==========================================
// 3. STUCAL (GOOGLE CALENDAR CLONE)
// ==========================================
let calCurrentDate = new Date();
let calViewMode = 'month'; 
let calEvents = [];
let tempSelectedEventId = null;

const calMonthsName = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const calDaysName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

window.loadCalendarData = async function() {
    const userId = await getUserId();
    if(!userId) return;
    const { data, error } = await window.supabaseClient.from('calendar_events').select('*').eq('user_id', userId);
    if(!error && data) {
        calEvents = data.map(d => ({
            id: d.id, title: d.title, date: d.event_date, start: d.start_time.substring(0, 5), end: d.end_time.substring(0, 5), color: d.color, desc: d.description, location: d.location
        }));
    }
    renderCalendar();
}

window.renderCalendar = function() {
    document.getElementById('calendar-title').textContent = `${calMonthsName[calCurrentDate.getMonth()]} ${calCurrentDate.getFullYear()}`;
    const selectMode = document.getElementById('cal-view-mode'); if(selectMode) selectMode.value = calViewMode;

    if(calViewMode === 'month') {
        document.getElementById('cal-month-view').classList.replace('hidden', 'flex');
        document.getElementById('cal-day-view').classList.replace('flex', 'hidden');
        renderMonthGrid();
    } else {
        document.getElementById('cal-month-view').classList.replace('flex', 'hidden');
        document.getElementById('cal-day-view').classList.replace('hidden', 'flex');
        renderDayGrid();
    }
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function renderMonthGrid() {
    const grid = document.getElementById('calendar-grid'); grid.innerHTML = '';
    const y = calCurrentDate.getFullYear(), m = calCurrentDate.getMonth();
    const firstDay = new Date(y, m, 1).getDay(), daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();

    for (let i = 0; i < firstDay; i++) grid.innerHTML += `<div class="bg-gray-50/20 border-b border-r border-border min-h-[100px]"></div>`;
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = today.getDate() === day && today.getMonth() === m && today.getFullYear() === y;
        
        let eventsHtml = calEvents.filter(ev => ev.date === dateKey).sort((a,b) => a.start.localeCompare(b.start)).map(ev => `
            <div onclick="event.stopPropagation(); calOpenDetail(${ev.id})" class="text-[10px] px-1.5 py-0.5 rounded truncate mb-0.5 cursor-pointer hover:opacity-80 text-white ${ev.color || 'bg-blue-500'}">${ev.start} ${ev.title}</div>
        `).join('');

        grid.innerHTML += `<div onclick="calSwitchToDay(${day})" class="bg-white border-b border-r border-border p-1 hover:bg-gray-50 cursor-pointer min-h-[100px] flex flex-col"><div class="text-center mb-1 mt-1"><span class="text-xs font-medium inline-flex items-center justify-center size-6 rounded-full ${isToday ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}">${day}</span></div><div class="flex-1 overflow-y-auto scrollbar-hide">${eventsHtml}</div></div>`;
    }
}

function renderDayGrid() {
    const dayLabel = document.getElementById('day-view-day'), dateLabel = document.getElementById('day-view-date'), timeLabels = document.getElementById('day-time-labels'), gridLines = document.getElementById('day-grid-lines');
    const y = calCurrentDate.getFullYear(), m = String(calCurrentDate.getMonth() + 1).padStart(2, '0'), d = String(calCurrentDate.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;
    
    dayLabel.textContent = calDaysName[calCurrentDate.getDay()].substring(0,3); dateLabel.textContent = calCurrentDate.getDate();

    let labelsHtml = `<div class="h-12 border-b border-transparent"></div>`; let gridHtml = `<div class="h-12 border-b border-border"></div>`;
    for(let i=1; i<=23; i++) {
        labelsHtml += `<div class="h-12 border-b border-transparent relative"><span class="absolute -top-2 right-2 text-[10px]">${i<12?i+' AM':(i===12?'12 PM':(i-12)+' PM')}</span></div>`;
        gridHtml += `<div class="h-12 border-b border-border hover:bg-gray-50/50 cursor-pointer group relative" data-hour="${i}"><span class="absolute left-2 top-1 text-xs text-blue-600 opacity-0 group-hover:opacity-100">+ Tambah</span></div>`;
    }
    timeLabels.innerHTML = labelsHtml;
    
    calEvents.filter(ev => ev.date === dateKey).forEach(ev => {
        let sMins = parseInt(ev.start.split(':')[0])*60 + parseInt(ev.start.split(':')[1]||0);
        let eMins = parseInt(ev.end.split(':')[0])*60 + parseInt(ev.end.split(':')[1]||0);
        let topPx = (sMins / 60) * 48; let heightPx = Math.max(((eMins - sMins) / 60) * 48, 20);
        gridHtml += `<div onclick="event.stopPropagation(); calOpenDetail(${ev.id})" class="absolute left-1 right-3 rounded-md p-1.5 shadow-sm text-white text-xs cursor-pointer overflow-hidden ${ev.color || 'bg-blue-500'}" style="top: ${topPx}px; height: ${heightPx}px; z-index: 20;"><p class="font-bold leading-tight">${ev.title}</p><p class="text-[9px] opacity-90">${ev.start} - ${ev.end}</p></div>`;
    });
    gridLines.innerHTML = gridHtml;
}

window.calChangeView = function(mode) { calViewMode = mode; renderCalendar(); }
window.calSwitchToDay = function(day) { calCurrentDate.setDate(day); calViewMode = 'day'; renderCalendar(); }
window.calChange = function(step) { calViewMode === 'month' ? calCurrentDate.setMonth(calCurrentDate.getMonth() + step) : calCurrentDate.setDate(calCurrentDate.getDate() + step); renderCalendar(); }
window.calGoToday = function() { calCurrentDate = new Date(); renderCalendar(); }
window.calGridClick = function(e) { const slot = e.target.closest('[data-hour]'); openGCalModal(slot ? parseInt(slot.getAttribute('data-hour')) : 10); }

window.openGCalModal = function(hr = 10) {
    document.getElementById('form-gcal-event').reset(); document.getElementById('ev-id').value = '';
    const y = calCurrentDate.getFullYear(), m = String(calCurrentDate.getMonth() + 1).padStart(2, '0'), d = String(calCurrentDate.getDate()).padStart(2, '0');
    document.getElementById('ev-date').value = `${y}-${m}-${d}`;
    document.getElementById('ev-time-start').value = `${String(hr).padStart(2,'0')}:00`;
    document.getElementById('ev-time-end').value = `${String(hr+1).padStart(2,'0')}:00`;
    openModal('modal-gcal-event');
}

// ==========================================
// FUNGSI SIMPAN AGENDA KALENDER BARU
// ==========================================
document.getElementById('form-gcal-event')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const userId = await getUserId();
    
    // Siapkan data yang mau dikirim (Tanpa ID manual)
    const payload = {
        user_id: userId, 
        title: document.getElementById('ev-title').value,
        event_date: document.getElementById('ev-date').value, 
        start_time: document.getElementById('ev-time-start').value,
        end_time: document.getElementById('ev-time-end').value, 
        location: document.getElementById('ev-location').value,
        description: document.getElementById('ev-desc').value, 
        color: document.getElementById('ev-color').value
    };
    
    // 🔥 PERBAIKAN: Tangkap error dari Supabase
    const { error } = await window.supabaseClient.from('calendar_events').insert([payload]);
    
    if (error) {
        console.error("Supabase Error (Calendar):", error);
        if (typeof window.showToast === 'function') window.showToast('Gagal menyimpan agenda!', 'error');
    } else {
        closeModal('modal-gcal-event'); 
        window.loadCalendarData(); 
        if (typeof window.showToast === 'function') window.showToast('Agenda berhasil ditambahkan!', 'success');
    }
});

window.calOpenDetail = function(id) {
    const ev = calEvents.find(e => e.id === id); if(!ev) return;
    tempSelectedEventId = id;
    const dObj = new Date(ev.date);
    document.getElementById('detail-title').textContent = ev.title;
    document.getElementById('detail-time').textContent = `${calDaysName[dObj.getDay()]}, ${dObj.getDate()} ${calMonthsName[dObj.getMonth()]} • ${ev.start} - ${ev.end}`;
    document.getElementById('detail-desc').textContent = ev.location ? `📌 ${ev.location}\n\n${ev.desc||''}` : (ev.desc||'');
    document.getElementById('detail-desc-box').className = (ev.desc||ev.location) ? 'flex gap-3 text-sm text-foreground' : 'hidden';
    document.getElementById('detail-color-dot').className = `size-4 rounded mt-1.5 shrink-0 ${ev.color}`;
    openModal('modal-gcal-detail');
}

window.calDeleteEvent = async function() {
    if(!tempSelectedEventId) return;
    await window.supabaseClient.from('calendar_events').delete().eq('id', tempSelectedEventId);
    closeModal('modal-gcal-detail'); window.loadCalendarData(); window.showToast('Event deleted', 'success');
}