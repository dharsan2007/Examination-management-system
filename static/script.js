/* ============================================================
   VET IAS — Examination Management System
   script.js — Full Script with Python Backend Integration
   ============================================================ */

// ============================================================
// BACKEND API URL
// ============================================================
const API = "http://localhost:5000/api";

// ============================================================
// STATE
// ============================================================
let data = {
  halls: [], batches: [], staff: [], reports: [],
  discontinued: [], adminAccounts: [], customSubjects: [],
  config: { title: 'End Semester Examination', subject: '', date: '', session: 'FN', sessionStart: '09:00', sessionEnd: '12:00' }
};

let currentStaffId    = null;
let currentStudentReg = null;
let currentSessionId  = null;   // DB session id — set when admin creates/selects a session

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Guard: only run on main app page (index.html)
  if (!document.getElementById('loginSection')) return;
  loadData();
  populateSubjectDropdowns();
  updateUI();
  drawBackground();

  ['adminUser','adminPass','staffUser','staffPass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  });

  // Check if already logged in (page reload)
  try {
    const res  = await fetch(`${API}/me`, { credentials: 'include' });
    if (res.ok) {
      const user = await res.json();
      if (user.logged_in) {
        if (user.role === 'admin') showAdminDashboard(user.full_name);
        else showStaffDashboardByUser(user);
      }
    }
  } catch (e) {
    // Backend not running — app still works with localStorage
    console.warn('Backend offline — running in local mode.');
  }

  // Load DB stats into dashboard
  loadDBStats();
});

function loadData() {
  const saved = localStorage.getItem('vet_ias_data_v3');
  if (saved) {
    try { data = JSON.parse(saved); }
    catch (e) { console.error('Parse error', e); data = getDefaultData(); }
  } else {
    data.config.date = new Date().toISOString().split('T')[0];
  }
  data.staff          = (data.staff      || []).filter(s => !(s.user && s.user.toLowerCase().includes('dharshan')));
  data.reports        = (data.reports    || []).filter(r => r.reg && r.reason && r.timestamp && r.timestamp !== 'undefined');
  data.adminAccounts  = data.adminAccounts  || [];
  data.customSubjects = data.customSubjects || [];

  setValue('examTitle',    data.config.title);
  setValue('examDate',     data.config.date);
  setValue('examSession',  data.config.session);
  setValue('sessionStart', data.config.sessionStart || '09:00');
  setValue('sessionEnd',   data.config.sessionEnd   || '12:00');
}

function getDefaultData() {
  return {
    halls: [], batches: [], staff: [], reports: [],
    discontinued: [], adminAccounts: [], customSubjects: [],
    config: { title: 'End Semester Examination', subject: '', date: new Date().toISOString().split('T')[0], session: 'FN', sessionStart: '09:00', sessionEnd: '12:00' }
  };
}

// ============================================================
// UTILITIES
// ============================================================
function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  if (['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) el.value = value;
  else el.textContent = value;
}
function getValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}
function saveData() {
  data.config.title        = getValue('examTitle')    || data.config.title;
  data.config.date         = getValue('examDate')     || data.config.date;
  data.config.session      = getValue('examSession')  || data.config.session;
  data.config.sessionStart = getValue('sessionStart') || data.config.sessionStart || '09:00';
  data.config.sessionEnd   = getValue('sessionEnd')   || data.config.sessionEnd   || '12:00';
  localStorage.setItem('vet_ias_data_v3', JSON.stringify(data));
  updateUI();
}

/** Auto-set default start/end times when session type changes */
function autoSetSessionTimes() {
  const s = getValue('examSession');
  const startEl = document.getElementById('sessionStart');
  const endEl   = document.getElementById('sessionEnd');
  if (!startEl || !endEl) return;
  if (s === 'FN') { startEl.value = '09:00'; endEl.value = '12:00'; }
  else             { startEl.value = '14:00'; endEl.value = '17:00'; }
  saveData();
}
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#2563eb' };
  toast.style.borderLeftColor = colors[type] || colors.info;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('out'); setTimeout(() => toast.remove(), 300); }, 2600);
}
function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }

// Toggle show/hide password for login fields
function togglePassword(inputId, btn) {
  var input = document.getElementById(inputId);
  if (!input) return;
  var isHidden = (input.type === 'password');
  input.type = isHidden ? 'text' : 'password';
  // Update icon on the button
  var icon = btn ? btn.querySelector('i') : null;
  if (icon) {
    icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  }
}

// Search all halls for a roll number in admin attendance edit
function renderAdminSeatsFiltered(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    // If query is cleared, go back to hall-select view
    renderAdminSeats();
    return;
  }
  const grid = document.getElementById('adminSeatGrid');
  if (!grid) return;
  grid.innerHTML = '';
  let matchCount = 0;
  data.halls.forEach(hall => {
    const seats = (hall.seats || []).filter(s => s && s.reg && s.reg.toLowerCase().includes(q));
    if (seats.length === 0) return;
    const hallHeader = document.createElement('div');
    hallHeader.style.cssText = 'font-size:12px;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:.5px;padding:8px 0 4px;';
    hallHeader.textContent = `Hall ${hall.name}`;
    grid.appendChild(hallHeader);
    const seatWrap = document.createElement('div');
    seatWrap.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;`;
    grid.appendChild(seatWrap);
    seats.forEach(seat => {
      const isDC = data.discontinued.includes(seat.reg);
      const status = hall.attendance[seat.reg] || null;
      const seatEl = document.createElement('div');
      seatEl.className = `seat ${isDC ? 'status-dc' : ({p:'status-p',a:'status-a',l:'status-l',od:'status-od'}[status] || '')}`;
      seatEl.textContent = seat.reg;
      if (!isDC) seatEl.onclick = () => {
        const st = ['p','a','l','od',null], cur = hall.attendance[seat.reg] || null;
        hall.attendance[seat.reg] = st[(st.indexOf(cur)+1) % st.length];
        saveData(); renderAdminSeatsFiltered(query); updateUI();
      };
      seatWrap.appendChild(seatEl);
      matchCount++;
    });
  });
  if (matchCount === 0) {
    grid.innerHTML = '<p class="info-text">No seats found matching that roll number.</p>';
  }
}

// Highlight matching seats in staff bench by roll number
function filterStaffBench(query) {
  var q = (query || '').trim().toLowerCase();
  var bench = document.getElementById('staffBenchArea');
  if (!bench) return;
  bench.querySelectorAll('.seat').forEach(function(seatEl) {
    var reg = seatEl.textContent.trim().toLowerCase();
    if (!q) {
      seatEl.style.opacity = '';
      seatEl.style.outline = '';
      seatEl.style.transform = '';
    } else if (reg.includes(q)) {
      seatEl.style.opacity = '1';
      seatEl.style.outline = '2.5px solid #059669';
      seatEl.style.transform = 'scale(1.1)';
    } else {
      seatEl.style.opacity = '0.22';
      seatEl.style.outline = '';
      seatEl.style.transform = '';
    }
  });
}

// Print Online Attendance — opens a formatted popup window
function printOnlineAttendance() {
  if (!data.halls || data.halls.length === 0) {
    showToast('No halls found. Generate allocation first.', 'error'); return;
  }
  var cfg   = data.config || {};
  var title = cfg.title  || 'End Semester Examination';
  var rawDate = cfg.date ? new Date(cfg.date) : null;
  var dateStr = rawDate ? rawDate.toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'}) : '';
  var sessStr = (cfg.session === 'AN') ? 'Afternoon Session (AN)' : 'Forenoon Session (FN)';

  var grandP=0, grandA=0, grandL=0, grandOD=0, grandTotal=0;
  var hallsHtml = '';

  data.halls.forEach(function(hall) {
    var att    = hall.attendance || {};
    var seated = (hall.seats || []).filter(function(s){return s && s.reg;});
    var p=0, a=0, l=0, od=0;
    Object.values(att).forEach(function(v){ if(v==='p')p++; else if(v==='a')a++; else if(v==='l')l++; else if(v==='od')od++; });
    var total = seated.length;
    grandP+=p; grandA+=a; grandL+=l; grandOD+=od; grandTotal+=total;

    var rowsHtml = '';
    seated.forEach(function(seat, i) {
      var status = att[seat.reg] || null;
      var isDC   = (data.discontinued || []).indexOf(seat.reg) !== -1;
      var label  = isDC ? 'DC' : (status==='p'?'Present':status==='a'?'Absent':status==='l'?'Late':status==='od'?'On Duty':'—');
      var bg     = isDC?'#f1f5f9':(status==='p'?'#d1fae5':status==='a'?'#fee2e2':status==='l'?'#fef3c7':status==='od'?'#e0f2fe':'#f8fafc');
      var col    = isDC?'#94a3b8':(status==='p'?'#065f46':status==='a'?'#991b1b':status==='l'?'#92400e':status==='od'?'#075985':'#64748b');
      rowsHtml += '<tr><td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;">'+(i+1)+'</td>'
        +'<td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-weight:700;font-size:12px;color:#1e293b;">'+seat.reg+'</td>'
        +'<td style="padding:5px 10px;border-bottom:1px solid #e2e8f0;text-align:center;"><span style="padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:'+bg+';color:'+col+';">'+label+'</span></td></tr>';
    });

    hallsHtml += '<div style="margin-bottom:28px;break-inside:avoid;">'
      +'<div style="background:#065f46;color:white;padding:8px 14px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center;">'
      +'<strong style="font-size:14px;letter-spacing:1px;">Hall '+hall.name+'</strong>'
      +'<span style="font-size:11px;opacity:.85;">Present: <b>'+p+'</b> &nbsp; Absent: <b>'+a+'</b> &nbsp; Late: <b>'+l+'</b> &nbsp; OD: <b>'+od+'</b> &nbsp; Total: <b>'+total+'</b></span></div>'
      +'<table style="width:100%;border-collapse:collapse;font-family:sans-serif;">'
      +'<thead><tr style="background:#f1f5f9;">'
      +'<th style="padding:6px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#64748b;width:40px;">#</th>'
      +'<th style="padding:6px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;">Roll No.</th>'
      +'<th style="padding:6px 10px;text-align:center;font-size:10px;text-transform:uppercase;color:#64748b;width:100px;">Status</th>'
      +'</tr></thead><tbody>'+(rowsHtml||'<tr><td colspan="3" style="padding:14px;text-align:center;color:#94a3b8;">No students allocated.</td></tr>')+'</tbody></table></div>';
  });

  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    +'<title>Online Attendance — VET IAS</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0;}'
    +'body{font-family:"Segoe UI",sans-serif;background:#f8fafc;color:#1e293b;padding:24px;}'
    +'.hdr{display:flex;align-items:center;gap:16px;border-bottom:3px solid #065f46;padding-bottom:16px;margin-bottom:22px;}'
    +'.hdr img{width:56px;height:56px;object-fit:contain;border-radius:8px;}'
    +'.hdr h1{font-size:20px;font-weight:900;color:#065f46;letter-spacing:1.5px;}'
    +'.hdr p{font-size:12px;color:#64748b;margin-top:3px;}'
    +'.summary{display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap;}'
    +'.sc{flex:1;min-width:80px;background:white;border-radius:10px;padding:12px;box-shadow:0 2px 8px rgba(0,0,0,.07);text-align:center;}'
    +'.sc b{font-size:22px;display:block;}.sc span{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;}'
    +'.p b{color:#065f46;}.a b{color:#991b1b;}.l b{color:#92400e;}.o b{color:#075985;}.t b{color:#1e293b;}'
    +'@media print{body{padding:10mm;background:white;}.no-print{display:none!important;}@page{size:A4;margin:12mm;}}'
    +'</style></head><body>'
    +'<div class="hdr">'
    +'<img src="/static/vetias.jpeg" onerror="this.style.display=\'none\'">'
    +'<div><h1>VET IAS — Online Attendance</h1>'
    +'<p>'+title+' &nbsp;·&nbsp; '+dateStr+' &nbsp;·&nbsp; '+sessStr+'</p>'
    +'<p style="font-size:11px;color:#94a3b8;margin-top:2px;">Printed: '+new Date().toLocaleString('en-IN')+'</p></div>'
    +'<button class="no-print" onclick="window.print()" style="margin-left:auto;padding:10px 20px;background:#065f46;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print</button>'
    +'</div>'
    +'<div class="summary">'
    +'<div class="sc p"><b>'+grandP+'</b><span>Present</span></div>'
    +'<div class="sc a"><b>'+grandA+'</b><span>Absent</span></div>'
    +'<div class="sc l"><b>'+grandL+'</b><span>Late</span></div>'
    +'<div class="sc o"><b>'+grandOD+'</b><span>On Duty</span></div>'
    +'<div class="sc t"><b>'+grandTotal+'</b><span>Total</span></div>'
    +'</div>'+hallsHtml+'</body></html>';

  var win = window.open('', '_blank', 'width=900,height=720');
  if (!win) { showToast('Popup blocked — please allow popups for this site.', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

/** POST to API */
async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res;
}

/** GET from API */
async function apiGet(path) {
  const res = await fetch(`${API}${path}`, { credentials: 'include' });
  return res;
}

/**
 * Fetch student names for a prefix+range from the database.
 * Returns array of { roll_no, name, department }
 * Falls back to generating placeholder names if backend is offline.
 */
async function fetchStudentsFromDB(prefix, start, end) {
  try {
    const res  = await apiGet(`/students/batch?prefix=${prefix}&start=${start}&end=${end}`);
    if (res.ok) {
      const data = await res.json();
      return data.students; // [{roll_no, name, department, year}]
    }
  } catch (e) {
    console.warn('DB offline — using placeholder names');
  }
  return null; // null = use placeholder names
}

/**
 * Fetch all prefixes from DB for the batch dropdown.
 */
async function fetchPrefixesFromDB() {
  try {
    const res = await apiGet('/students/prefixes');
    if (res.ok) return await res.json();
  } catch (e) {}
  return null;
}

// Load DB stats into stat cards
async function loadDBStats() {
  try {
    const res = await apiGet('/stats');
    if (!res.ok) return;
    const stats = await res.json();

    const elHalls    = document.getElementById('statHalls');
    const elCap      = document.getElementById('statCap');
    const elStu      = document.getElementById('statStu');
    const elMal      = document.getElementById('statMal');

    if (elHalls && stats.halls    >= 0) elHalls.textContent = stats.halls;
    if (elCap   && stats.capacity >= 0) elCap.textContent   = stats.capacity;
    if (elStu   && stats.allocated >= 0) elStu.textContent  = stats.allocated;
    if (elMal   && stats.incidents >= 0) elMal.textContent  = stats.incidents;
  } catch (e) {}
}

// ============================================================
// SUBJECT MANAGEMENT
// ============================================================
const DEFAULT_SUBJECTS = [
  'Maths','Physics','Chemistry','English','Tamil',
  'C Programming','Data Structures','DBMS','OS','Networks',
  'AI','ML','Web Tech','Java','Python',
  'Digital Electronics','Circuits','Signals'
];
function getAllSubjects() { return [...DEFAULT_SUBJECTS, ...(data.customSubjects || [])]; }

function populateSubjectDropdowns(selectedValue) {
  const subjects = getAllSubjects();
  ['batchSubject','editBatchSubject'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = selectedValue !== undefined ? selectedValue : sel.value;
    sel.innerHTML = '<option value="">— Subject —</option>';
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if (s === current) opt.selected = true;
      sel.appendChild(opt);
    });
  });
}

function openAddSubjectModal() {
  document.getElementById('newSubjectInput').value = '';
  renderCustomSubjectsList();
  document.getElementById('addSubjectModal').style.display = 'flex';
  setTimeout(() => document.getElementById('newSubjectInput').focus(), 100);
}
function closeAddSubjectModal(e) {
  if (e && e.target !== document.getElementById('addSubjectModal')) return;
  document.getElementById('addSubjectModal').style.display = 'none';
}
function confirmAddSubject() {
  const name = document.getElementById('newSubjectInput').value.trim();
  if (!name) { showToast('Please enter a subject name.', 'error'); return; }
  if (getAllSubjects().some(s => s.toLowerCase() === name.toLowerCase())) {
    showToast('Subject already exists.', 'warning'); return;
  }
  if (!data.customSubjects) data.customSubjects = [];
  data.customSubjects.push(name);
  saveData(); populateSubjectDropdowns(name);
  const sel = document.getElementById('batchSubject');
  if (sel) sel.value = name;
  document.getElementById('newSubjectInput').value = '';
  renderCustomSubjectsList();
  showToast(`Subject "${name}" added!`, 'success');
}
function deleteCustomSubject(name) {
  if (!confirm(`Delete subject "${name}"?`)) return;
  data.customSubjects = (data.customSubjects || []).filter(s => s !== name);
  saveData(); populateSubjectDropdowns(); renderCustomSubjectsList();
  showToast(`Subject "${name}" deleted.`, 'success');
}
function renderCustomSubjectsList() {
  const container = document.getElementById('customSubjectsList');
  if (!container) return;
  const custom = data.customSubjects || [];
  if (custom.length === 0) {
    container.innerHTML = '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:8px 0;">No custom subjects added yet.</p>';
    return;
  }
  container.innerHTML = `
    <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Your Custom Subjects</p>
    ${custom.map(s => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#f8fafc;border-radius:8px;margin-bottom:6px;border:1px solid #e2e8f0;">
        <span style="font-size:13px;font-weight:600;color:#1e293b;"><i class="fa-solid fa-book" style="color:#2563eb;margin-right:6px;font-size:11px;"></i>${s}</span>
        <button onclick="deleteCustomSubject('${s.replace(/'/g,"\\'")}') " class="btn-icon btn-red" style="width:26px;height:26px;font-size:11px;" title="Delete">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `).join('')}
  `;
}

// ============================================================
// CANVAS BACKGROUND
// ============================================================
function drawBackground() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, W * 0.7, H);
  grad.addColorStop(0, '#050e1f'); grad.addColorStop(0.5, '#071428'); grad.addColorStop(1, '#040c1a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(W*0.08, H*0.12, 0, W*0.08, H*0.12, W*0.42);
  g1.addColorStop(0, 'rgba(5,150,105,0.14)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(W*0.92, H*0.88, 0, W*0.92, H*0.88, W*0.5);
  g2.addColorStop(0, 'rgba(29,78,216,0.15)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  const g3 = ctx.createRadialGradient(W*0.5, H*0.45, 0, W*0.5, H*0.45, W*0.28);
  g3.addColorStop(0, 'rgba(245,158,11,0.05)'); g3.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g3; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(148,163,184,0.07)';
  const sp = 36;
  for (let x = sp; x < W; x += sp) for (let y = sp; y < H; y += sp) {
    ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(16,185,129,0.06)'; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const o = i * 80;
    ctx.beginPath(); ctx.moveTo(W - o, 0); ctx.lineTo(W, o); ctx.stroke();
  }
}
window.addEventListener('resize', drawBackground);

// ============================================================
// LOGIN  ← Now uses Python backend + falls back to local
// ============================================================
function showLogin(role) {
  document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('btn-' + role).classList.add('active');
  ['admin','staff'].forEach(r => document.getElementById('input-' + r).style.display = 'none');
  document.getElementById('input-' + role).style.display = 'flex';
}

function handleLogin() {
  const activeRole = document.querySelector('.role-btn.active');
  const role = activeRole.id.split('-')[1];
  if (role === 'admin') loginAdmin();
  else if (role === 'staff') loginStaff();
}

async function loginAdmin() {
  const username = getValue('adminUser');
  const password = document.getElementById('adminPass').value;
  if (!username || !password) { showToast('Enter username and password.', 'error'); return; }

  // ── Try Python backend first ──
  try {
    const res  = await apiPost('/login', { username, password });
    const json = await res.json();
    if (res.ok) {
      showAdminDashboard(json.full_name || username);
      showToast(`Welcome, ${json.full_name || username}! Logged in via database.`, 'success');
      return;
    } else {
      // Wrong credentials from DB
      showToast(json.error || 'Invalid credentials.', 'error'); return;
    }
  } catch (e) {
    // Backend offline — fall back to local check
    console.warn('Backend offline — using local login');
  }

  // ── Fallback: local login ──
  const isDefault = (username === 'admin' && password === 'admin123');
  const isExtra   = (data.adminAccounts || []).some(a => a.user === username && a.pass === password);
  if (isDefault || isExtra) {
    showAdminDashboard(username);
    showToast(`Welcome, ${username}! (local mode)`, 'success');
  } else {
    showToast('Invalid credentials.', 'error');
  }
}

async function loginStaff() {
  const username = getValue('staffUser');
  const password = document.getElementById('staffPass').value;
  if (!username || !password) { showToast('Enter username and password.', 'error'); return; }

  // ── Try Python backend first ──
  try {
    const res  = await apiPost('/login', { username, password });
    const json = await res.json();
    if (res.ok) {
      // Find local hall assignment for this staff
      const localStaff = data.staff.find(s => s.user === username);
      if (localStaff && localStaff.assignedHallId) {
        currentStaffId = localStaff.id;
        showStaffDashboard(localStaff);
        showToast(`Welcome, ${json.full_name || username}!`, 'success');
      } else {
        showToast('Login OK, but no hall assigned yet. Ask admin.', 'warning');
      }
      return;
    } else {
      showToast(json.error || 'Invalid credentials.', 'error'); return;
    }
  } catch (e) {
    console.warn('Backend offline — using local login');
  }

  // ── Fallback: local login ──
  const member = data.staff.find(s => s.user === username && s.pass === password);
  if (!member) { showToast('Invalid credentials.', 'error'); return; }
  if (!member.assignedHallId) { showToast('No hall assigned to this staff member.', 'error'); return; }
  currentStaffId = member.id;
  showStaffDashboard(member);
  showToast(`Welcome, ${member.user}!`, 'success');
}

async function showAdminDashboard(name) {
  document.getElementById('loginSection').style.display    = 'none';
  document.getElementById('adminDashboard').style.display  = 'block';
  await loadHallsFromDB();
  // ── Auto-load the most recent exam session id ──
  try {
    const res = await apiGet('/sessions');
    if (res.ok) {
      const sessions = await res.json();
      if (sessions && sessions.length > 0) {
        currentSessionId = sessions[0].id;  // sessions ordered DESC by date
      }
    }
  } catch (e) {}

  await loadStaffFromDB();
  await loadAdminAccountsFromDB();
  await loadDBStats();   // load after sessions are known so allocated/incidents are correct
  updateUI();
}

function showStaffDashboard(member) {
  document.getElementById('loginSection').style.display   = 'none';
  document.getElementById('staffDashboard').style.display = 'block';
  loadStaffView(member.assignedHallId);
}

function showStaffDashboardByUser(user) {
  // Called on page reload when session still active
  const localStaff = data.staff.find(s => s.user === user.username);
  if (localStaff && localStaff.assignedHallId) {
    currentStaffId = localStaff.id;
    showStaffDashboard(localStaff);
  } else if (user.role === 'admin') {
    showAdminDashboard(user.full_name);
  }
}

async function logout() {
  currentStaffId = null; currentStudentReg = null;
  // Call backend logout
  try { await apiPost('/logout', {}); } catch(e) {}
  document.getElementById('adminDashboard').style.display  = 'none';
  document.getElementById('staffDashboard').style.display  = 'none';
  document.getElementById('loginSection').style.display    = 'flex';
  ['adminUser','adminPass','staffUser','staffPass'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

// ============================================================
// REFRESH
// ============================================================
function refreshAdmin() {
  loadData(); updateUI(); loadDBStats();
  const btn = document.getElementById('adminRefreshBtn');
  if (btn) btn.classList.add('spinning');
  setTimeout(() => { if (btn) btn.classList.remove('spinning'); }, 600);
  showToast('Dashboard refreshed.', 'success');
}

function refreshStaff() {
  if (!currentStaffId) return;
  loadData();
  const member = data.staff.find(s => s.id === currentStaffId);
  if (!member) { showToast('Session expired.', 'error'); logout(); return; }
  if (member.assignedHallId) loadStaffView(member.assignedHallId);
  const btn = document.getElementById('staffRefreshBtn');
  if (btn) btn.classList.add('spinning');
  setTimeout(() => { if (btn) btn.classList.remove('spinning'); }, 600);
  showToast('Staff portal refreshed.', 'success');
}

// ============================================================
// ADMIN ACCOUNTS  ← Now backed by MySQL database
// ============================================================
async function loadAdminAccountsFromDB() {
  try {
    const res = await apiGet('/admins');
    if (!res.ok) return;
    data.dbAdmins = await res.json();
    updateAdminAccountsList();
  } catch(e) { console.warn('Could not load admin accounts from DB:', e); }
}

async function addAdminAccount() {
  const username = getValue('newAdminUser');
  const password = document.getElementById('newAdminPass').value;
  if (!username || !password) { showToast('Please enter a username and password.', 'error'); return; }
  if (username === 'admin') { showToast('"admin" is the default account.', 'warning'); return; }
  try {
    const res    = await apiPost('/admins/add', { username, password });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to add admin.', 'error'); return; }
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
    showToast(`Admin "${username}" created and saved to database.`, 'success');
    await loadAdminAccountsFromDB();
  } catch(e) {
    // Fallback to localStorage
    if (!data.adminAccounts) data.adminAccounts = [];
    if (data.adminAccounts.find(a => a.user === username)) { showToast('Username already exists.', 'warning'); return; }
    data.adminAccounts.push({ id: generateId(), user: username, pass: password });
    saveData(); updateAdminAccountsList();
    document.getElementById('newAdminUser').value = '';
    document.getElementById('newAdminPass').value = '';
    showToast(`Admin "${username}" created (local mode — DB offline).`, 'warning');
  }
}

async function deleteAdminAccount(id) {
  if (!confirm('Delete this admin account?')) return;
  // Try DB delete first (id is a number for DB accounts)
  if (typeof id === 'number') {
    try {
      const res    = await fetch(`${API}/admins/${id}`, { method: 'DELETE', credentials: 'include' });
      const result = await res.json();
      if (!res.ok) { showToast(result.error || 'Failed to delete admin.', 'error'); return; }
      showToast('Admin account deleted from database.', 'success');
      await loadAdminAccountsFromDB();
      return;
    } catch(e) { showToast('Network error.', 'error'); return; }
  }
  // Fallback: local delete (string id)
  data.adminAccounts = data.adminAccounts.filter(a => a.id !== id);
  saveData(); updateAdminAccountsList();
  showToast('Admin account deleted.', 'success');
}

function updateAdminAccountsList() {
  const container = document.getElementById('adminAccountsContainer');
  if (!container) return;
  container.innerHTML = '';

  // Use DB accounts if available
  const dbAdmins = data.dbAdmins || [];
  if (dbAdmins.length > 0) {
    dbAdmins.forEach(admin => {
      const isDefault = admin.username === 'admin';
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
          <i class="fa-solid ${isDefault ? 'fa-crown' : 'fa-user-shield'}" style="color:${isDefault ? '#f59e0b' : '#2563eb'};font-size:15px;flex-shrink:0;"></i>
          <div style="min-width:0;">
            <strong>${admin.username}</strong>
            <span style="display:inline-block;font-family:monospace;font-size:10px;color:#94a3b8;background:#f1f5f9;padding:1px 7px;border-radius:10px;margin-left:7px;">ID: ${admin.id}</span>
            ${isDefault ? '<span style="font-size:11px;color:#94a3b8;margin-left:5px;">Default</span>' : ''}
          </div>
        </div>
        ${isDefault
          ? '<span style="font-size:11px;font-weight:700;color:#10b981;background:#d1fae5;padding:3px 10px;border-radius:20px;flex-shrink:0;">Active</span>'
          : `<button onclick="deleteAdminAccount(${admin.id})" class="btn-icon btn-red" title="Delete"><i class="fa-solid fa-trash"></i></button>`
        }
      `;
      container.appendChild(item);
    });
    return;
  }

  // Fallback to localStorage display
  const defaultItem = document.createElement('div');
  defaultItem.className = 'list-item';
  defaultItem.innerHTML = `
    <div>
      <strong><i class="fa-solid fa-crown" style="color:#f59e0b;margin-right:6px;"></i>admin</strong>
      <span style="font-size:12px;color:#94a3b8;margin-left:8px;">Default Admin Account</span>
    </div>
    <span style="font-size:11px;font-weight:700;color:#10b981;background:#d1fae5;padding:3px 10px;border-radius:20px;">Active</span>
  `;
  container.appendChild(defaultItem);
  (data.adminAccounts || []).forEach(acc => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div><strong><i class="fa-solid fa-user-shield" style="color:#2563eb;margin-right:6px;"></i>${acc.user}</strong></div>
      <button onclick="deleteAdminAccount('${acc.id}')" class="btn-icon btn-red" title="Delete">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

// ============================================================
// HALL MANAGEMENT
// ============================================================
async function addHall() {
  const name = getValue('newHallName');
  const rows = parseInt(getValue('newHallRows')) || 0;
  const cols = parseInt(getValue('newHallCols')) || 0;
  if (!name || rows < 1 || cols < 2) { showToast('Please fill all fields correctly.', 'error'); return; }
  try {
    const res    = await apiPost('/halls/add', { name, rows, cols, capacity: rows * cols });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to add hall.', 'error'); return; }
    document.getElementById('newHallName').value = '';
    document.getElementById('newHallRows').value = '';
    document.getElementById('newHallCols').value = '';
    showToast(`Hall "${name}" added.`, 'success');
    await loadHallsFromDB(); updateUI();
  } catch (e) { showToast('Network error — is Flask running?', 'error'); }
}
async function deleteHall(hallId) {
  if (!confirm('Delete this hall and all its data?')) return;
  try {
    const res    = await fetch(`${API}/halls/${hallId}`, { method: 'DELETE', credentials: 'include' });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to delete hall.', 'error'); return; }
    showToast('Hall deleted.', 'success');
    await loadHallsFromDB(); updateUI();
  } catch (e) { showToast('Network error.', 'error'); }
}
async function editHallName(hallId) {
  const hall = data.halls.find(h => String(h.id) === String(hallId));
  if (!hall) return;
  const newName = prompt('Enter new hall name:', hall.name);
  if (!newName || !newName.trim()) return;
  try {
    const res = await fetch(`${API}/halls/${hallId}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), rows: hall.rows, cols: hall.cols })
    });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to update hall.', 'error'); return; }
    hall.name = newName.trim();
    saveData(); updateUI();
    showToast('Hall name updated.', 'success');
  } catch (e) {
    // Fallback: update locally if DB offline
    hall.name = newName.trim();
    saveData(); updateUI();
    showToast('Hall name updated locally (DB offline).', 'warning');
  }
}

// ============================================================
// STAFF MANAGEMENT
// ============================================================
async function addStaff() {
  const username    = getValue('newStaffName');
  const password    = getValue('newStaffPass');
  const fullName    = getValue('newStaffFullName')    || username;
  const designation = getValue('newStaffDesignation') || '';
  if (!username || !password) { showToast('Please fill both username and password.', 'error'); return; }
  try {
    const res    = await apiPost('/staff/add', { username, password, name: fullName, designation });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to add staff.', 'error'); return; }
    ['newStaffName','newStaffPass','newStaffFullName','newStaffDesignation'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    showToast(`Staff "${fullName || username}" added successfully.`, 'success');
    await loadStaffFromDB();
    updateUI();
  } catch (e) {
    console.error('addStaff error:', e);
    showToast('Network error — is Flask running?', 'error');
  }
}

function openEditStaffModal(staffId) {
  const staff = data.staff.find(s => s.id === staffId);
  if (!staff) return;
  document.getElementById('editStaffId').value       = staffId;
  document.getElementById('editStaffUsername').value = staff.user;
  document.getElementById('editStaffPassword').value = '';
  const sel = document.getElementById('editStaffHall');
  sel.innerHTML = '<option value="">— No Hall —</option>';
  data.halls.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h.id; opt.textContent = `${h.name} (${h.rows}×${h.cols})`;
    if (String(h.id) === String(staff.assignedHallId)) opt.selected = true;
    sel.appendChild(opt);
  });
  document.getElementById('editStaffModal').style.display = 'flex';
}
function closeEditStaffModal(e) {
  if (!e || e.target === document.getElementById('editStaffModal'))
    document.getElementById('editStaffModal').style.display = 'none';
}
async function saveEditStaff() {
  const staffId  = parseInt(document.getElementById('editStaffId').value);
  const password = document.getElementById('editStaffPassword').value.trim();
  const hallId   = document.getElementById('editStaffHall').value;
  const staff    = data.staff.find(s => s.id === staffId);
  if (!staff) return;
  try {
    if (password) {
      const res = await fetch(`${API}/staff/${staffId}/password`, { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) });
      if (!res.ok) { const r=await res.json(); showToast(r.error||'Password update failed.','error'); return; }
    }
    const hr = await fetch(`${API}/staff/${staffId}/hall`, { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({hall_id:hallId?parseInt(hallId):null}) });
    if (!hr.ok) { const r=await hr.json(); showToast(r.error||'Hall assign failed.','error'); return; }
    staff.assignedHallId = hallId ? parseInt(hallId) : null;
    const hall = data.halls.find(h => String(h.id) === String(hallId));
    staff.hall_name = hall ? hall.name : null;
    saveData(); updateUI();
    document.getElementById('editStaffModal').style.display = 'none';
    showToast(`Staff "${staff.user}" updated.`, 'success');
  } catch(e) { showToast('Network error.', 'error'); }
}

async function deleteStaff(staffId) {
  if (!confirm('Delete this staff member and their login account?')) return;
  try {
    const res = await fetch(`${API}/staff/${staffId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to delete staff.', 'error'); return; }
    showToast('Staff member deleted.', 'success');
    await loadStaffFromDB();
    updateUI();
  } catch (e) {
    console.error('deleteStaff error:', e);
    showToast('Network error — is Flask running?', 'error');
  }
}

async function loadStaffFromDB() {
  try {
    const res = await apiGet('/staff');
    if (!res.ok) return;
    const dbStaff = await res.json();
    data.staff = dbStaff.map(s => ({
      id:            s.id,
      user:          s.username || s.name,
      assignedHallId: s.hall_id  || null,
      hall_name:     s.hall_name || null
    }));
    saveData();
  } catch (e) { console.error('loadStaffFromDB error:', e); }
}

async function loadHallsFromDB() {
  try {
    const res = await apiGet('/halls');
    if (!res.ok) return;
    const dbHalls = await res.json();
    // Merge DB hall IDs into local halls (keeps seat data, updates IDs)
    data.halls = dbHalls.map(h => {
      const existing = data.halls.find(lh => lh.name === h.name);
      return {
        ...(existing || {}),
        id:   h.id,          // use real DB integer ID
        name: h.name,
        rows: h.rows,
        cols: h.cols,
        capacity: h.capacity,
        seats: existing ? existing.seats : Array(h.rows * h.cols).fill(null),
        attendance: existing ? existing.attendance : {}
      };
    });
    saveData();
  } catch (e) { console.error('loadHallsFromDB error:', e); }
}

let _assigningStaffId = null;
function assignHallToStaff(staffId) {
  if (data.halls.length === 0) { showToast('No halls available. Add halls first.', 'error'); return; }
  _assigningStaffId = staffId;
  const staff = data.staff.find(s => s.id === staffId);
  const labelEl = document.getElementById('modalStaffName');
  if (labelEl && staff) labelEl.innerHTML = `<i class="fa-solid fa-user-tie"></i> <strong>${staff.user}</strong>`;
  const select = document.getElementById('modalHallSelect');
  select.innerHTML = '<option value="">— Choose a Hall —</option>';
  data.halls.forEach(hall => {
    const opt = document.createElement('option');
    opt.value = hall.id;
    opt.textContent = `${hall.name} (${hall.rows}×${hall.cols})`;
    if (staff && staff.assignedHallId == hall.id) opt.selected = true;
    select.appendChild(opt);
  });
  document.getElementById('hallAssignModal').style.display = 'flex';
}
function closeHallAssignModal(e) {
  if (e && e.target !== document.getElementById('hallAssignModal')) return;
  document.getElementById('hallAssignModal').style.display = 'none';
  _assigningStaffId = null;
}
async function confirmHallAssign() {
  const hallId = document.getElementById('modalHallSelect').value;
  if (!hallId) { showToast('Please select a hall.', 'error'); return; }
  const staff = data.staff.find(s => s.id === _assigningStaffId);
  const hall  = data.halls.find(h => String(h.id) === String(hallId));
  if (!staff) return;
  try {
    const res = await fetch(`/api/staff/${_assigningStaffId}/hall`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hall_id: parseInt(hallId) })
    });
    const result = await res.json();
    if (!res.ok) { showToast(result.error || 'Failed to assign hall.', 'error'); return; }
    staff.assignedHallId = parseInt(hallId);
    staff.hall_name = hall ? hall.name : null;
    saveData(); updateUI();
    showToast(`Hall assigned to ${staff.user}.`, 'success');
  } catch (e) { showToast('Network error.', 'error'); }
  document.getElementById('hallAssignModal').style.display = 'none';
  _assigningStaffId = null;
}

// ============================================================
// DISCONTINUED STUDENTS
// ============================================================
function markDiscontinued() {
  const reg = getValue('dcRegInput').toUpperCase();
  if (!reg) { showToast('Enter a register number.', 'error'); return; }
  if (data.discontinued.includes(reg)) { showToast('Already discontinued.', 'warning'); return; }
  data.discontinued.push(reg); saveData(); updateUI();
  document.getElementById('dcRegInput').value = '';
  showToast(`${reg} marked discontinued.`, 'success');
}
function removeDiscontinued(reg) {
  data.discontinued = data.discontinued.filter(d => d !== reg);
  saveData(); updateUI(); showToast('Removed from discontinued list.', 'success');
}

// ============================================================
// BATCH MANAGEMENT  ← Now fetches real student names from DB
// ============================================================
async function autoFillPrefix() {
  const year = getValue('batchYear');
  const dept = getValue('batchDept');
  if (!year || !dept) return;
  const yearMap = { 'I':'25','II':'24','III':'23','IV':'22' };
  const deptMap = {
    'CSE':'CSE','ECE':'ECE','EEE':'EEE','MECH':'MECH','CIVIL':'CIVIL',
    'IT':'IT','AIDS':'AID','AIML':'AIML','MCE':'MCE','BCA':'BCA','MCA':'MCA','MBA':'MBA'
  };
  const prefix = (yearMap[year] || '') + (deptMap[dept] || dept.toUpperCase());
  document.getElementById('batchPrefix').value = prefix;

  // ── Auto-fill start/end from database ──
  try {
    const res = await apiGet('/students/prefixes');
    if (res.ok) {
      const prefixes = await res.json();
      // Find matching prefix (e.g. 24AID)
      const match = prefixes.find(p => p.prefix === prefix);
      if (match) {
        // Extract the numeric part from roll numbers like 24AID001 → 1
        const startNum = parseInt(match.first_roll.replace(prefix, '')) || 1;
        const endNum   = parseInt(match.last_roll.replace(prefix, ''))  || match.total;
        document.getElementById('batchStart').value = startNum;
        document.getElementById('batchEnd').value   = endNum;
        showToast(`Found ${match.total} students in database for "${prefix}" (${startNum}–${endNum})`, 'success');
      } else {
        // Prefix not in DB — clear start/end so user enters manually
        document.getElementById('batchStart').value = '';
        document.getElementById('batchEnd').value   = '';
      }
    }
  } catch (e) {
    // Backend offline — user fills manually
  }
}

function autoFillEditPrefix() {
  const year = document.getElementById('editBatchYear').value;
  const dept = document.getElementById('editBatchDept').value;
  if (!year || !dept) return;
  const yearMap = { 'I':'25','II':'24','III':'23','IV':'22' };
  const deptMap = {
    'CSE':'CSE','ECE':'ECE','EEE':'EEE','MECH':'MECH','CIVIL':'CIVIL',
    'IT':'IT','AIDS':'AID','AIML':'AIML','MCE':'MCE','BCA':'BCA','MCA':'MCA','MBA':'MBA'
  };
  document.getElementById('editBatchPrefix').value = (yearMap[year] || '') + (deptMap[dept] || dept.toUpperCase());
}

async function addBatch() {
  const year    = getValue('batchYear');
  const dept    = getValue('batchDept');
  const subject = getValue('batchSubject');
  const prefix  = getValue('batchPrefix').toUpperCase().trim();
  const start   = parseInt(getValue('batchStart')) || 0;
  const end     = parseInt(getValue('batchEnd'))   || 0;

  if (!year || !dept || !prefix || start < 1 || end < start) {
    showToast('Please fill Year, Dept, Prefix, Start and End correctly.', 'error'); return;
  }
  if (data.batches.find(b => b.prefix.toUpperCase() === prefix)) {
    showToast(`Batch "${prefix}" already exists.`, 'error'); return;
  }

  showToast('Fetching student names from database...', 'info');

  // ── Fetch real student names from Python backend ──
  const dbStudents = await fetchStudentsFromDB(prefix, start, end);

  const batch = { id: generateId(), year, dept, subject: subject || '', prefix, start, end, students: [] };
  const digits = String(end).length;

  if (dbStudents && dbStudents.length > 0) {
    // Use real names from database
    dbStudents.forEach(stu => {
      batch.students.push({
        reg:      stu.roll_no,
        name:     stu.name,          // ← Real name from DB!
        enrolled: true
      });
    });
    showToast(`Batch "${prefix}" added — ${batch.students.length} students with real names from database!`, 'success');
  } else {
    // Fallback: generate placeholder names (DB offline or prefix not found)
    for (let i = start; i <= end; i++) {
      const padded = String(i).padStart(digits, '0');
      batch.students.push({ reg: `${prefix}${padded}`, name: `Student ${padded}`, enrolled: true });
    }
    showToast(`Batch "${prefix}" added — ${batch.students.length} students. (Names from DB not found — using placeholders)`, 'warning');
  }

  data.batches.push(batch); saveData(); updateUI();
  ['batchYear','batchDept','batchSubject','batchPrefix','batchStart','batchEnd'].forEach(id => {
    document.getElementById(id).value = '';
  });
}

function removeBatch(batchId) {
  if (!confirm('Delete this batch?')) return;
  data.batches = data.batches.filter(b => b.id !== batchId);
  saveData(); updateUI(); showToast('Batch deleted.', 'success');
}

function editBatch(batchId) {
  const batch = data.batches.find(b => b.id === batchId);
  if (!batch) return;
  document.getElementById('editBatchId').value     = batchId;
  document.getElementById('editBatchPrefix').value = batch.prefix;
  document.getElementById('editBatchStart').value  = batch.start;
  document.getElementById('editBatchEnd').value    = batch.end;
  document.getElementById('editBatchYear').value   = batch.year || '';
  document.getElementById('editBatchDept').value   = batch.dept || '';
  populateSubjectDropdowns(batch.subject || '');
  document.getElementById('editBatchSubject').value = batch.subject || '';
  document.getElementById('editBatchModal').style.display = 'flex';
}

async function saveEditBatch() {
  const batchId    = document.getElementById('editBatchId').value;
  const batch      = data.batches.find(b => b.id === batchId);
  if (!batch) return;
  const newYear    = document.getElementById('editBatchYear').value;
  const newDept    = document.getElementById('editBatchDept').value;
  const newSubject = document.getElementById('editBatchSubject').value;
  const newPrefix  = document.getElementById('editBatchPrefix').value.toUpperCase().trim();
  const newStart   = parseInt(document.getElementById('editBatchStart').value) || 0;
  const newEnd     = parseInt(document.getElementById('editBatchEnd').value)   || 0;

  if (!newPrefix || newStart < 1 || newEnd < newStart) { showToast('Check prefix, start and end.', 'error'); return; }
  if (data.batches.find(b => b.id !== batchId && b.prefix.toUpperCase() === newPrefix)) {
    showToast(`Prefix "${newPrefix}" already in use.`, 'error'); return;
  }

  showToast('Updating student names from database...', 'info');
  const dbStudents = await fetchStudentsFromDB(newPrefix, newStart, newEnd);

  batch.year = newYear; batch.dept = newDept; batch.subject = newSubject;
  batch.prefix = newPrefix; batch.start = newStart; batch.end = newEnd;
  batch.students = [];
  const digits = String(newEnd).length;

  if (dbStudents && dbStudents.length > 0) {
    dbStudents.forEach(stu => {
      batch.students.push({ reg: stu.roll_no, name: stu.name, enrolled: true });
    });
    showToast(`Batch "${newPrefix}" updated with real names — ${batch.students.length} students.`, 'success');
  } else {
    for (let i = newStart; i <= newEnd; i++) {
      const padded = String(i).padStart(digits, '0');
      batch.students.push({ reg: `${newPrefix}${padded}`, name: `Student ${padded}`, enrolled: true });
    }
    showToast(`Batch "${newPrefix}" updated — ${batch.students.length} students (placeholder names).`, 'warning');
  }

  saveData(); updateUI();
  document.getElementById('editBatchModal').style.display = 'none';
}

function closeEditBatchModal(e) {
  if (e && e.target !== document.getElementById('editBatchModal')) return;
  document.getElementById('editBatchModal').style.display = 'none';
}

// ============================================================
// ALLOCATION
// ============================================================
async function generateAllocation() {
  if (data.halls.length === 0 || data.batches.length === 0) {
    showToast('Add halls and batches first.', 'error'); return;
  }
  const allStudents = [];
  data.batches.forEach(batch => {
    batch.students.forEach(student => {
      if (student.enrolled && !data.discontinued.includes(student.reg))
        allStudents.push(student.reg);
    });
  });
  if (allStudents.length === 0) { showToast('No eligible students.', 'error'); return; }

  // Shuffle
  for (let i = allStudents.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allStudents[i], allStudents[j]] = [allStudents[j], allStudents[i]];
  }

  let idx = 0;
  data.halls.forEach(hall => {
    hall.seats = Array(hall.rows * hall.cols).fill(null);
    for (let i = 0; i < hall.seats.length && idx < allStudents.length; i++) {
      hall.seats[i] = { reg: allStudents[idx++], status: null };
    }
    hall.attendance = {}; hall.malpractice = [];
  });
  saveData(); updateUI();
  showToast(`Allocation generated for ${allStudents.length} students. Saving to database...`, 'success');

  // ── Persist to DB: create session then allocate ──
  try {
    const cfg = data.config;
    // 1. Create (or re-use) a DB session
    const sessRes  = await apiPost('/sessions/create', {
      exam_date:     cfg.date    || new Date().toISOString().split('T')[0],
      session:       cfg.session || 'FN',
      session_start: (cfg.sessionStart || '09:00') + ':00',
      session_end:   (cfg.sessionEnd   || '12:00') + ':00',
      subject:       cfg.subject || ''
    });
    const sessJson = await sessRes.json();
    if (!sessRes.ok) { showToast('DB session create failed: ' + sessJson.error, 'warning'); return; }
    currentSessionId = sessJson.id;

    // 2. Build hall_assignments — map each hall's reg numbers to batch prefix+range
    const hall_assignments = data.halls.map(hall => {
      const seatedRegs  = (hall.seats || []).filter(s => s && s.reg).map(s => s.reg);
      // Group by batch prefix
      const prefixGroups = {};
      seatedRegs.forEach(reg => {
        const batch = data.batches.find(b => reg.startsWith(b.prefix));
        if (batch) {
          if (!prefixGroups[batch.prefix]) prefixGroups[batch.prefix] = [];
          prefixGroups[batch.prefix].push(reg);
        }
      });
      return Object.entries(prefixGroups).map(([prefix, regs]) => {
        const nums = regs.map(r => parseInt(r.replace(prefix,''))).filter(n => !isNaN(n));
        return { hall_id: hall.id, prefix, start: Math.min(...nums), end: Math.max(...nums) };
      });
    }).flat();

    // 3. Send allocation to DB
    const allocRes  = await apiPost('/allocate', { session_id: currentSessionId, hall_assignments });
    const allocJson = await allocRes.json();
    if (allocRes.ok) {
      localStorage.setItem('vet_ias_session_id', currentSessionId);
      showToast(`✅ Allocation saved to database! Session ID: ${currentSessionId}`, 'success');
    } else {
      showToast('Allocation saved locally only. DB error: ' + allocJson.error, 'warning');
    }
  } catch (e) {
    showToast('Allocation saved locally (DB offline).', 'warning');
  }
}

function saveAllocation() { saveData(); showToast('Configuration saved.', 'success'); }

function printType(type) {
  localStorage.setItem('vet_print_mode', type);
  window.open('output.html', '_blank');
}

// ============================================================
// ADMIN ATTENDANCE
// ============================================================
function adminMarkAll(status) {
  const rawId = getValue('adminHallSelect');
  const hall  = data.halls.find(h => String(h.id) === String(rawId));
  if (!hall) { showToast('Select a hall first.', 'error'); return; }
  hall.seats.forEach(seat => { if (seat && !data.discontinued.includes(seat.reg)) hall.attendance[seat.reg] = status; });
  saveData(); renderAdminSeats(); updateUI();
  showToast('All students marked Present.', 'success');
}

function renderAdminSeats() {
  const rawId  = getValue('adminHallSelect');
  const hall   = data.halls.find(h => String(h.id) === String(rawId));
  const grid   = document.getElementById('adminSeatGrid');
  grid.innerHTML = '';
  if (!hall) { grid.innerHTML = '<p class="info-text">Select a hall to view seats.</p>'; return; }

  const att=hall.attendance||{}, _p=Object.values(att).filter(v=>v==='p').length, _a=Object.values(att).filter(v=>v==='a').length, _l=Object.values(att).filter(v=>v==='l').length, _od=Object.values(att).filter(v=>v==='od').length;
  const sb=document.createElement('div'); sb.style.cssText='display:flex;gap:8px;flex-wrap:wrap;padding-bottom:14px;';
  sb.innerHTML=`<span style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;background:#d1fae5;color:#065f46;"><i class="fa-solid fa-check"></i> Present: ${_p}</span><span style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;background:#fee2e2;color:#991b1b;"><i class="fa-solid fa-xmark"></i> Absent: ${_a}</span><span style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;background:#fef3c7;color:#92400e;"><i class="fa-solid fa-clock"></i> Late: ${_l}</span><span style="padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;background:#e0f2fe;color:#075985;"><i class="fa-solid fa-file-lines"></i> OD: ${_od}</span>`;
  grid.appendChild(sb);
  const seatWrap=document.createElement('div'); seatWrap.style.cssText=`display:grid;grid-template-columns:repeat(${hall.cols}, 1fr);gap:8px;`; grid.appendChild(seatWrap);

  hall.seats.forEach(seat => {
    const seatEl = document.createElement('div');
    if (!seat) { seatEl.className='seat empty'; seatEl.textContent='Empty'; seatWrap.appendChild(seatEl); return; }
    const isDC=data.discontinued.includes(seat.reg), status=hall.attendance[seat.reg]||null;
    seatEl.className=`seat ${isDC?'status-dc':({p:'status-p',a:'status-a',l:'status-l',od:'status-od'}[status]||'')}`;
    seatEl.textContent=seat.reg;
    if (!isDC) seatEl.onclick=()=>{ const st=['p','a','l','od',null],cur=hall.attendance[seat.reg]||null; hall.attendance[seat.reg]=st[(st.indexOf(cur)+1)%st.length]; saveData();renderAdminSeats();updateUI(); };
    seatWrap.appendChild(seatEl);
  });
}

// ============================================================
// STAFF VIEW
// ============================================================
function loadStaffView(hallId) {
  const hall = data.halls.find(h => parseInt(h.id) === parseInt(hallId));
  if (!hall) return;
  document.getElementById('staffHallName').textContent =
    `${hall.name} (${hall.seats.filter(s => s && !data.discontinued.includes(s.reg)).length} students)`;
  renderStaffSeats(hall);
  loadMalpracticeForm(hall);
}

let _dragging = false, _dragStatus = null;

function renderStaffSeats(hall) {
  const bench = document.getElementById('staffBenchArea');
  bench.innerHTML = '';
  bench.style.display = 'grid';
  bench.style.gridTemplateColumns = `repeat(${hall.cols}, 1fr)`;
  bench.style.gap = '8px'; bench.style.padding = '16px';
  bench.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  const statuses = [null,'p','a','l','od'];

  function applyDragStatus(seat, seatEl) {
    if (data.discontinued.includes(seat.reg)) return;
    hall.attendance[seat.reg] = _dragStatus;
    const cls = {p:'status-p',a:'status-a',l:'status-l',od:'status-od'}[_dragStatus] || '';
    seatEl.className = `seat ${cls}`;
    _updateStaffStats(hall);
  }

  hall.seats.forEach(seat => {
    const seatEl = document.createElement('div');
    if (!seat) { seatEl.className = 'seat empty'; seatEl.textContent = 'Empty'; bench.appendChild(seatEl); return; }
    const isDC = data.discontinued.includes(seat.reg);
    const status = hall.attendance[seat.reg] || null;
    const sc = isDC ? 'status-dc' : ({p:'status-p',a:'status-a',l:'status-l',od:'status-od'}[status] || '');
    seatEl.className = `seat ${sc}`;
    seatEl.textContent = seat.reg;

    if (!isDC) {
      seatEl.addEventListener('mousedown', e => {
        e.preventDefault(); _dragging = true;
        const cur = hall.attendance[seat.reg];
        _dragStatus = statuses[(statuses.indexOf(cur) + 1) % statuses.length];
        applyDragStatus(seat, seatEl);
      });
      seatEl.addEventListener('mouseenter', () => { if (_dragging) applyDragStatus(seat, seatEl); });
      seatEl.addEventListener('touchstart', e => {
        e.preventDefault(); _dragging = true;
        const cur = hall.attendance[seat.reg];
        _dragStatus = statuses[(statuses.indexOf(cur) + 1) % statuses.length];
        applyDragStatus(seat, seatEl);
      }, { passive: false });
      seatEl.addEventListener('touchmove', e => {
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        if (el && el.classList.contains('seat') && el !== seatEl) el.dispatchEvent(new Event('touchenter'));
      }, { passive: false });
      seatEl.addEventListener('touchenter', () => { if (_dragging) applyDragStatus(seat, seatEl); });
    }
    bench.appendChild(seatEl);
  });

  document.addEventListener('mouseup',  () => { if (_dragging) { _dragging = false; saveData(); updateUI(); } });
  document.addEventListener('touchend', () => { if (_dragging) { _dragging = false; saveData(); updateUI(); } });
}

function loadMalpracticeForm(hall) {
  const select = document.getElementById('mpStudent');
  select.innerHTML = '<option value="">— Select Student —</option>';
  hall.seats.forEach(seat => {
    if (seat && !data.discontinued.includes(seat.reg)) {
      const opt = document.createElement('option');
      opt.value = seat.reg; opt.textContent = seat.reg;
      select.appendChild(opt);
    }
  });
}

async function reportMalpractice() {
  const reg    = getValue('mpStudent');
  const reason = getValue('mpReason');
  if (!reg || !reason) { showToast('Select a student and describe the incident.', 'error'); return; }
  const now = new Date();
  const timestamp = now.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })
    + ' ' + now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:true });

  // ── Try to persist in DB ──
  try {
    const res  = await apiPost('/malpractice', { roll_no: reg, reason, session_id: currentSessionId || null });
    const json = await res.json();
    if (!res.ok) {
      showToast(json.error || 'Could not save to database.', 'warning');
    } else {
      showToast(`Malpractice report filed for ${reg} and saved to database.`, 'success');
    }
  } catch (e) {
    showToast(`Malpractice report filed for ${reg} (local — DB offline).`, 'warning');
  }

  // Always keep a local copy for offline resilience
  data.reports.push({ reg, reason, timestamp });
  saveData(); updateUI();
  document.getElementById('mpStudent').value = '';
  document.getElementById('mpReason').value  = '';
}

async function submitAttendance() {
  const staff = data.staff.find(s => s.id === currentStaffId);
  if (!staff || !staff.assignedHallId) { showToast('No hall assigned.', 'error'); return; }
  const hall = data.halls.find(h => parseInt(h.id) === parseInt(staff.assignedHallId));
  if (!hall) { showToast('Hall not found.', 'error'); return; }
  const att = hall.attendance || {};
  if (hall.seats.filter(s => s).length === 0) { showToast('No students allocated.', 'error'); return; }

  const p  = Object.values(att).filter(v => v === 'p').length;
  const a  = Object.values(att).filter(v => v === 'a').length;
  const l  = Object.values(att).filter(v => v === 'l').length;
  const od = Object.values(att).filter(v => v === 'od').length;
  saveData();

  // ── Persist to DB if session is active ──
  if (currentSessionId) {
    try {
      // Build attendance payload for all marked seats
      const statusMap = { p:'P', a:'A', l:'L', od:'OD' };
      const promises = [];
      for (const seat of hall.seats) {
        if (!seat) continue;
        const rawStatus = att[seat.reg] || null;
        const dbStatus  = rawStatus ? (statusMap[rawStatus] || 'A') : 'A';
        // Look up student_id by roll_no from the DB seating data
        if (seat.student_id) {
          promises.push(apiPost('/attendance/mark', {
            session_id: currentSessionId,
            student_id: seat.student_id,
            status:     dbStatus
          }));
        }
      }
      if (promises.length > 0) {
        await Promise.all(promises);
        showToast(`✅ Attendance submitted & saved to database — P:${p} A:${a} L:${l} OD:${od}`, 'success');
      } else {
        showToast(`✅ Attendance saved locally — P:${p} A:${a} L:${l} OD:${od} (no DB student IDs)`, 'success');
      }
    } catch (e) {
      showToast(`✅ Attendance saved locally — P:${p} A:${a} L:${l} OD:${od} (DB offline)`, 'success');
    }
  } else {
    showToast(`✅ Attendance submitted — P:${p} A:${a} L:${l} OD:${od}`, 'success');
  }
}

function openStaffEditAttendance() {
  const staff = data.staff.find(s => s.id === currentStaffId);
  if (!staff || !staff.assignedHallId) { showToast('No hall assigned.', 'error'); return; }
  document.getElementById('staffAttSearch').value = '';
  renderStaffEditSeats('');
  document.getElementById('staffEditAttModal').style.display = 'flex';
}

function closeStaffEditAttModal(e) {
  if (!e || e.target === document.getElementById('staffEditAttModal'))
    document.getElementById('staffEditAttModal').style.display = 'none';
}

function renderStaffEditSeats(query) {
  const q     = (query || '').trim().toLowerCase();
  const staff = data.staff.find(s => s.id === currentStaffId);
  if (!staff || !staff.assignedHallId) return;
  const hall  = data.halls.find(h => parseInt(h.id) === parseInt(staff.assignedHallId));
  const grid  = document.getElementById('staffEditSeatGrid');
  if (!hall || !grid) return;
  grid.innerHTML = '';

  const seatWrap = document.createElement('div');
  seatWrap.style.cssText = `display:grid;grid-template-columns:repeat(${hall.cols}, 1fr);gap:8px;`;
  grid.appendChild(seatWrap);

  let visible = 0;
  hall.seats.forEach(seat => {
    if (!seat) return;
    if (q && !seat.reg.toLowerCase().includes(q)) return;
    const isDC = data.discontinued.includes(seat.reg);
    const status = hall.attendance[seat.reg] || null;
    const seatEl = document.createElement('div');
    seatEl.className = `seat ${isDC ? 'status-dc' : ({p:'status-p',a:'status-a',l:'status-l',od:'status-od'}[status] || '')}`;
    seatEl.textContent = seat.reg;
    if (!isDC) seatEl.onclick = () => {
      const st = [null,'p','a','l','od'], cur = hall.attendance[seat.reg] || null;
      hall.attendance[seat.reg] = st[(st.indexOf(cur)+1) % st.length];
      renderStaffEditSeats(query);
    };
    seatWrap.appendChild(seatEl);
    visible++;
  });
  if (visible === 0) {
    grid.innerHTML = '<p class="info-text">No seats found.</p>';
  }
}

function saveStaffEditAttendance() {
  saveData(); updateUI();
  document.getElementById('staffEditAttModal').style.display = 'none';
  showToast('Attendance changes saved.', 'success');
}

// ============================================================
// UI UPDATES
// ============================================================
function updateUI() {
  updateStats(); updateHallsList(); updateStaffList();
  updateDiscontinuedList(); updateBatchesList();
  updateAdminHallSelect(); updateAttendanceReport();
  updateAdminAccountsList();
}

function updateStats() {
  const present = data.halls.reduce((s,h) => s + Object.values(h.attendance||{}).filter(v=>v==='p').length,  0);
  const absent  = data.halls.reduce((s,h) => s + Object.values(h.attendance||{}).filter(v=>v==='a').length,  0);
  const late    = data.halls.reduce((s,h) => s + Object.values(h.attendance||{}).filter(v=>v==='l').length,  0);
  const onDuty  = data.halls.reduce((s,h) => s + Object.values(h.attendance||{}).filter(v=>v==='od').length, 0);
  // Only update live monitor pills — stat cards come from loadDBStats
  setValue('monP',  present); setValue('monA', absent);
  setValue('monL',  late);    setValue('monOD', onDuty);
}

function updateHallsList() {
  const container = document.getElementById('hallsContainer');
  container.innerHTML = '';
  if (!data.halls.length) { container.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0;">No halls added yet.</p>'; return; }
  data.halls.forEach(hall => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <strong>${hall.name}</strong><br>
        <span style="font-size:12px;color:#94a3b8;">${hall.rows}×${hall.cols} · <span style="color:#059669;font-weight:700;">${hall.seats.filter(s=>s).length} occupied</span> / ${hall.rows*hall.cols} total</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button onclick="editHallName('${hall.id}')" class="btn-icon btn-primary" style="width:32px;height:32px;font-size:12px;" title="Edit Name"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteHall('${hall.id}')" class="btn-icon btn-red" style="width:32px;height:32px;font-size:12px;" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    container.appendChild(item);
  });
}

function updateStaffList() {
  const container = document.getElementById('staffListContainer');
  container.innerHTML = '';
  if (!data.staff.length) { container.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0;">No staff added yet.</p>'; return; }
  data.staff.forEach(staff => {
    const hallLabel = staff.hall_name || (staff.assignedHallId ? `Hall #${staff.assignedHallId}` : null);
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div>
        <strong>${staff.user}</strong><br>
        <span style="font-size:12px;color:${hallLabel?'#059669':'#f59e0b'};font-weight:600;">${hallLabel?'<i class=\'fa-solid fa-building\'></i> '+hallLabel:'<i class=\'fa-solid fa-circle-exclamation\'></i> No hall assigned'}</span>
      </div>
      <div style="display:flex;gap:6px;">
        <button onclick="openEditStaffModal(${staff.id})" class="btn-icon btn-primary" style="width:32px;height:32px;font-size:12px;" title="Edit"><i class="fa-solid fa-pen"></i></button>
        <button onclick="assignHallToStaff(${staff.id})" class="btn-icon" style="width:32px;height:32px;background:#e0f2fe;color:#0369a1;border:none;border-radius:8px;cursor:pointer;font-size:12px;" title="Assign Hall"><i class="fa-solid fa-link"></i></button>
        <button onclick="deleteStaff(${staff.id})" class="btn-icon btn-red" style="width:32px;height:32px;font-size:12px;" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    container.appendChild(item);
  });
}

function updateDiscontinuedList() {
  const container = document.getElementById('dcContainer');
  container.innerHTML = '';
  data.discontinued.forEach(reg => {
    const item = document.createElement('div');
    item.className = 'list-item warn';
    item.innerHTML = `
      <div><strong>${reg}</strong></div>
      <button onclick="removeDiscontinued('${reg}')" class="btn-icon btn-red" style="width:32px;height:32px;font-size:12px;">
        <i class="fa-solid fa-times"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

function getSubjectIcon(subject) {
  const icons = {
    'Maths':'fa-square-root-variable','Physics':'fa-atom','Chemistry':'fa-flask',
    'English':'fa-book-open','Tamil':'fa-language','C Programming':'fa-code',
    'Data Structures':'fa-diagram-project','DBMS':'fa-database','OS':'fa-server',
    'Networks':'fa-network-wired','AI':'fa-robot','ML':'fa-brain',
    'Web Tech':'fa-globe','Java':'fa-mug-hot','Python':'fa-snake',
    'Digital Electronics':'fa-microchip','Circuits':'fa-bolt','Signals':'fa-wave-square'
  };
  return icons[subject] || 'fa-book';
}

function updateBatchesList() {
  const container = document.getElementById('batchesContainer');
  container.innerHTML = '';
  if (data.batches.length === 0) {
    container.innerHTML = `<div class="batches-empty"><i class="fa-solid fa-users-slash"></i><p>No batches added yet.</p></div>`;
    return;
  }
  data.batches.forEach(batch => {
    const tag = document.createElement('div');
    tag.className = 'batch-tag';
    const yearLabel    = batch.year    ? `<span class="batch-year-pill">${batch.year} Yr</span>` : '';
    const deptLabel    = batch.dept    ? `<span class="batch-dept-pill">${batch.dept}</span>` : '';
    const subjectLabel = batch.subject ? `<span class="batch-subj-pill"><i class="fa-solid ${getSubjectIcon(batch.subject)}"></i> ${batch.subject}</span>` : '';
    const hasRealNames = batch.students && batch.students[0] &&
      batch.students[0].name !== `Student ${String(batch.start).padStart(String(batch.end).length,'0')}`;
    const namePreview = hasRealNames
      ? `<div style="font-size:9.5px;color:#3b82f6;margin-top:2px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${batch.students.slice(0,2).map(s=>s.name).join(', ')}...</div>`
      : '';
    tag.innerHTML = `
      <div class="batch-tag-pills">${yearLabel}${deptLabel}</div>
      ${subjectLabel ? `<div class="batch-tag-subject">${subjectLabel}</div>` : ''}
      <div class="batch-tag-prefix">${batch.prefix}</div>
      <div class="batch-tag-range">${batch.start} – ${batch.end}</div>
      <div class="batch-tag-count">${batch.students ? batch.students.length : (batch.end - batch.start + 1)} students</div>
      ${namePreview}
      <button class="batch-view-btn" onclick="viewStudentList('${batch.id}')" title="View Students">
        <i class="fa-solid fa-users"></i>
      </button>
      <button class="batch-edit-btn" onclick="editBatch('${batch.id}')" title="Edit"><i class="fa-solid fa-pen"></i></button>
      <button class="batch-close" onclick="removeBatch('${batch.id}')" title="Remove">✕</button>
    `;
    container.appendChild(tag);
  });
}

// ── VIEW STUDENTS MODAL ──────────────────────────────────────
function viewStudentList(batchId) {
  const batch = data.batches.find(b => b.id === batchId);
  if (!batch) return;

  // Build modal HTML
  const modal = document.createElement('div');
  modal.id = 'studentListModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:9999;
    background:rgba(5,14,31,0.82);backdrop-filter:blur(6px);
    display:flex;align-items:center;justify-content:center;padding:16px;
  `;

  const hasRealNames = batch.students && batch.students[0] &&
    batch.students[0].name !== `Student ${String(batch.start).padStart(String(batch.end).length,'0')}`;

  const rows = (batch.students || []).map((s, i) => `
    <tr style="${i % 2 === 0 ? 'background:#f8fafc;' : ''}">
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;font-weight:700;">${i + 1}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-family:'Courier New',monospace;font-weight:700;color:#1e3a5f;font-size:12.5px;">${s.reg}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;font-size:13px;">${s.name}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46;">Active</span>
      </td>
    </tr>
  `).join('');

  modal.innerHTML = `
    <div style="background:white;border-radius:20px;width:100%;max-width:600px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 32px 90px rgba(0,0,0,0.5);">
      
      <!-- Header -->
      <div style="padding:20px 24px 16px;border-bottom:1px solid #e5e7eb;background:#f8fafc;display:flex;align-items:center;gap:12px;">
        <div style="width:42px;height:42px;background:linear-gradient(135deg,#065f46,#059669);border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;flex-shrink:0;">
          <i class="fa-solid fa-users"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:17px;font-weight:900;color:#111827;">${batch.prefix} — Student List</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">
            ${batch.year ? batch.year + ' Year · ' : ''}${batch.dept || ''} · ${batch.students ? batch.students.length : 0} students
            ${hasRealNames ? ' · <span style="color:#059669;font-weight:700;">✓ Names from database</span>' : ' · <span style="color:#f59e0b;">Placeholder names</span>'}
          </div>
        </div>
        <button onclick="document.getElementById('studentListModal').remove()" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:#6b7280;flex-shrink:0;">✕</button>
      </div>

      <!-- Search bar -->
      <div style="padding:12px 24px;border-bottom:1px solid #e5e7eb;">
        <input id="studentSearchInput" type="text" placeholder="🔍  Search by name or roll number..."
          oninput="filterStudentList(this.value, '${batchId}')"
          style="width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;outline:none;font-family:inherit;color:#111827;"
        >
      </div>

      <!-- Table -->
      <div style="overflow-y:auto;flex:1;">
        <table id="studentListTable" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="position:sticky;top:0;z-index:1;">
              <th style="padding:10px 14px;background:#1e3a8a;color:white;text-align:left;font-size:11px;text-transform:uppercase;width:44px;">#</th>
              <th style="padding:10px 14px;background:#1e3a8a;color:white;text-align:left;font-size:11px;text-transform:uppercase;">Roll No</th>
              <th style="padding:10px 14px;background:#1e3a8a;color:white;text-align:left;font-size:11px;text-transform:uppercase;">Student Name</th>
              <th style="padding:10px 14px;background:#1e3a8a;color:white;text-align:center;font-size:11px;text-transform:uppercase;">Status</th>
            </tr>
          </thead>
          <tbody id="studentListBody">${rows}</tbody>
        </table>
      </div>

      <!-- Footer -->
      <div style="padding:12px 24px;border-top:1px solid #e5e7eb;background:#f8fafc;display:flex;justify-content:space-between;align-items:center;">
        <span id="studentListCount" style="font-size:12px;color:#6b7280;font-weight:600;">Showing ${batch.students ? batch.students.length : 0} students</span>
        <button onclick="document.getElementById('studentListModal').remove()" style="padding:9px 22px;background:#065f46;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Close</button>
      </div>
    </div>
  `;

  // Store batch students for filtering
  modal._batchId = batchId;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('studentSearchInput')?.focus(), 100);
}

function filterStudentList(query, batchId) {
  const batch = data.batches.find(b => b.id === batchId);
  if (!batch) return;
  const q = query.toLowerCase();
  const filtered = (batch.students || []).filter(s =>
    s.reg.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
  );
  const tbody = document.getElementById('studentListBody');
  const countEl = document.getElementById('studentListCount');
  if (!tbody) return;
  tbody.innerHTML = filtered.map((s, i) => `
    <tr style="${i % 2 === 0 ? 'background:#f8fafc;' : ''}">
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;font-weight:700;">${i + 1}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-family:'Courier New',monospace;font-weight:700;color:#1e3a5f;font-size:12.5px;">${s.reg}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111827;font-size:13px;">${s.name}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:#d1fae5;color:#065f46;">Active</span>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="text-align:center;padding:30px;color:#94a3b8;font-size:13px;">No students match "${query}"</td></tr>`;
  if (countEl) countEl.textContent = `Showing ${filtered.length} of ${batch.students.length} students`;
}

function updateAdminHallSelect() {
  const select = document.getElementById('adminHallSelect');
  const currentVal = select.value; // ← preserve current selection
  select.innerHTML = '<option value="">— Select Examination Hall —</option>';
  data.halls.forEach(hall => {
    const opt = document.createElement('option');
    opt.value = hall.id; opt.textContent = hall.name;
    select.appendChild(opt);
  });
  if (currentVal) select.value = currentVal; // ← restore after re-render
}

function deleteMalpracticeReport(idx) {
  const valid = (data.reports || []).filter(r => r.reg && r.reason && r.timestamp && r.timestamp !== 'undefined');
  const report = valid[idx];
  if (!report) return;
  if (!confirm(`Delete malpractice report for "${report.reg}"?`)) return;
  data.reports = data.reports.filter(r =>
    !(r.reg === report.reg && r.timestamp === report.timestamp && r.reason === report.reason)
  );
  saveData(); updateUI(); showToast('Report deleted.', 'success');
}

function updateAttendanceReport() {
  const container = document.getElementById('attendanceReport');
  container.innerHTML = '';

  let html = `
    <div class="report-section">
      <h4 class="report-section-title"><i class="fa-solid fa-chart-bar"></i> Hall-wise Attendance</h4>
      <table class="report-table">
        <thead><tr><th>Hall</th><th>Present</th><th>Absent</th><th>Late</th><th>On Duty</th></tr></thead>
        <tbody>
  `;
  if (data.halls.length === 0) {
    html += `<tr><td colspan="5" class="report-empty">No halls added yet.</td></tr>`;
  } else {
    data.halls.forEach((hall, idx) => {
      const att = hall.attendance || {};
      const p  = Object.values(att).filter(s=>s==='p').length;
      const a  = Object.values(att).filter(s=>s==='a').length;
      const l  = Object.values(att).filter(s=>s==='l').length;
      const od = Object.values(att).filter(s=>s==='od').length;
      html += `<tr>
        <td><strong>${hall.name}</strong></td>
        <td><span class="att-badge att-p">${p}</span></td>
        <td><span class="att-badge att-a">${a}</span></td>
        <td><span class="att-badge att-l">${l}</span></td>
        <td><span class="att-badge att-od">${od}</span></td>
      </tr>`;
    });
  }
  html += `</tbody></table></div>`;

  html += `<div class="report-section" style="margin-top:28px;">
    <h4 class="report-section-title"><i class="fa-solid fa-triangle-exclamation" style="color:#ef4444"></i> Malpractice Reports</h4>`;

  const valid = (data.reports || []).filter(r => r.reg && r.reason && r.timestamp && r.timestamp !== 'undefined');
  if (valid.length === 0) {
    html += `<div class="report-empty-state">
      <i class="fa-solid fa-shield-check"></i>
      <p>No malpractice incidents reported yet.</p>
      <span>Reports will appear here when filed by staff.</span>
    </div>`;
  } else {
    html += `<table class="report-table">
      <thead><tr><th>Student</th><th>Incident</th><th>Date &amp; Time</th><th style="width:50px;text-align:center;">Delete</th></tr></thead>
      <tbody>`;
    valid.forEach((report, idx) => {
      html += `<tr>
        <td><strong>${report.reg}</strong></td>
        <td>${report.reason}</td>
        <td><span class="report-timestamp">${report.timestamp}</span></td>
        <td style="text-align:center;">
          <button onclick="deleteMalpracticeReport(${idx})" class="btn-icon btn-red" style="width:30px;height:30px;font-size:12px;">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }
  html += `</div>`;
  container.innerHTML = html;
}

let _hallViewIdx = null;
function openHallViewModal(idx) {
  _hallViewIdx = idx;
  const hall = data.halls[idx];
  if (!hall) return;
  document.getElementById('hallViewTitle').textContent = hall.name + ' — Attendance Detail';
  const att = hall.attendance || {};
  // Build seat list grouped by status
  const students = hall.students || [];
  let rows = '';
  if (students.length === 0) {
    rows = '<p style="color:var(--tm);font-size:13px;padding:12px 0;">No students allocated to this hall.</p>';
  } else {
    rows = `<table class="report-table" style="font-size:12px;">
      <thead><tr><th>Reg No.</th><th>Status</th></tr></thead><tbody>`;
    students.forEach(s => {
      const reg = s.reg || s;
      const status = att[reg] || 'none';
      const badgeClass = status === 'p' ? 'att-p' : status === 'a' ? 'att-a' : status === 'l' ? 'att-l' : status === 'od' ? 'att-od' : '';
      const statusLabel = status === 'p' ? 'Present' : status === 'a' ? 'Absent' : status === 'l' ? 'Late' : status === 'od' ? 'On Duty' : 'Not Marked';
      rows += `<tr><td>${reg}</td><td><span class="att-badge ${badgeClass}" style="${!badgeClass ? 'background:var(--bg2);color:var(--tm)':''}">${statusLabel}</span></td></tr>`;
    });
    rows += `</tbody></table>`;
  }
  document.getElementById('hallViewContent').innerHTML = rows;
  document.getElementById('hallViewModal').style.display = 'flex';
}

function closeHallViewModal(e) {
  if (!e || e.target === document.getElementById('hallViewModal')) {
    document.getElementById('hallViewModal').style.display = 'none';
  }
}

function openEditFromView() {
  document.getElementById('hallViewModal').style.display = 'none';
  // Switch to Edit tab and pre-select the hall
  switchReportTab('edit');
  const hall = data.halls[_hallViewIdx];
  if (hall) {
    const sel = document.getElementById('adminHallSelect');
    if (sel) { sel.value = hall.id || hall.name; if (typeof renderAdminSeats === 'function') renderAdminSeats(); }
  }
  // Scroll to report panel
  const panel = document.querySelector('.panel.full-width');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   ██████  ██    ██ ████████ ██████  ██    ██ ████████
  ██    ██ ██    ██    ██    ██   ██ ██    ██    ██
  ██    ██ ██    ██    ██    ██████  ██    ██    ██
  ██    ██ ██    ██    ██    ██      ██    ██    ██
   ██████   ██████     ██    ██       ██████     ██

   VET IAS — OUTPUT PAGE (output.html)
   ─────────────────────────────────────────────────────
   All functions below only activate on output.html.
   The DOMContentLoaded guard ensures they do nothing
   when loaded on the main app page (index.html).
   ─────────────────────────────────────────────────────

   DATA STRUCTURE (written by script.js above):
   data.halls[]  → { id, name, rows, cols,
                     seats: [{reg,status}|null, ...],
                     attendance: { "REG": "p"|"a"|"l"|"od" } }
   data.batches[]→ { id, year, dept, prefix, start, end,
                     students: [{reg, name, enrolled}] }
   data.staff[]  → { id, user, pass, assignedHallId }
   data.config   → { title, date, session, subject }
============================================================ */
let appData          = null;
let mode             = 'notice';
let subjectOverrides = {};
let _regToBatch      = null;   // lazy-built lookup cache

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Guard: only run on output page (output.html)
  if (!document.getElementById('content') || !document.querySelector('.toolbar')) return;
  loadAppData();
  if (!appData) return;
  const saved = localStorage.getItem('vet_print_mode');
  if (saved && ['notice','door','staff'].includes(saved)) mode = saved;
  setMode(mode);
});

// ── Load & Validate Data ──────────────────────────────────────
function loadAppData() {
  try {
    const raw = localStorage.getItem('vet_ias_data_v3');
    if (!raw) {
      showEmpty('No examination data found.<br>Please set up halls and batches in the main system first.');
      return;
    }
    appData = JSON.parse(raw);

    if (!appData.halls || appData.halls.length === 0) {
      showEmpty('No halls found.<br>Add halls in the main system, then generate allocation.');
      appData = null;
      return;
    }

    // Check if allocation has been generated
    const hasAllocation = appData.halls.some(h =>
      (h.seats || []).some(s => s && s.reg)
    );
    if (!hasAllocation) {
      showEmpty(
        'Halls exist but <strong>no students are allocated</strong> yet.<br>' +
        'In the main system → Allocation tab → click <strong>Generate Allocation</strong>, then reopen this page.'
      );
      appData = null;
      return;
    }

  } catch(e) {
    showEmpty('Could not read examination data. Please return to the main system.');
  }
}

function showEmpty(msg) {
  document.getElementById('content').innerHTML = `
    <div class="empty-state">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <h2>No Data Available</h2>
      <p>${msg}</p>
    </div>`;
}

// ── Subject Bar ───────────────────────────────────────────────
function buildSubjectSelect() {
  const sel = document.getElementById('subjectHallSelect');
  sel.innerHTML = '<option value="all">All Halls</option>';
  appData.halls.forEach(h => {
    const o = document.createElement('option');
    o.value = h.id;
    o.textContent = h.name;
    sel.appendChild(o);
  });
}

function applySubject() {
  const key  = document.getElementById('subjectHallSelect').value;
  const subj = document.getElementById('subjectInput').value.trim();
  if (key === 'all') {
    appData.halls.forEach(h => { subjectOverrides[h.id] = subj; });
  } else {
    subjectOverrides[key] = subj;
  }
  render();
}

// ── Mode ──────────────────────────────────────────────────────
function setMode(m) {
  mode = m;
  ['notice','door','staff'].forEach(t => {
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.classList.toggle('active', t === m);
  });
  render();
}

function render() {
  if (!appData) return;
  if      (mode === 'notice') renderNoticeBoard();
  else if (mode === 'door')   renderDoorNotices();
  else if (mode === 'staff')  renderStaffSheets();
}

// ── Helpers ───────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-IN',
      { day:'2-digit', month:'long', year:'numeric' });
  } catch(e) { return d; }
}

function sessionLabel(s, cfg) {
  const config      = cfg || appData?.config || data.config || {};
  const startTime   = config.sessionStart || (s === 'AN' ? '14:00' : '09:00');
  const endTime     = config.sessionEnd   || (s === 'AN' ? '17:00' : '12:00');
  const fmt = t => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12  = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
  };
  const label = s === 'AN' ? 'Afternoon Session (AN)' : 'Forenoon Session (FN)';
  return `${label} (${fmt(startTime)} – ${fmt(endTime)})`;
}

function getSubject(hall) {
  return subjectOverrides[hall.id]
      || subjectOverrides['all']
      || appData.config?.subject
      || '';
}

// ── Build reg → batch lookup (cached) ─────────────────────────
function getRegToBatch() {
  if (_regToBatch) return _regToBatch;
  _regToBatch = {};
  (appData.batches || []).forEach(batch => {
    if (batch.students && batch.students.length > 0) {
      batch.students.forEach(stu => {
        _regToBatch[stu.reg] = { batch, name: stu.name || '' };
      });
    } else {
      // Reconstruct regs from prefix+start+end if students array missing.
      // Padding: derive from the first stored roll if possible, else from batch.end length.
      const digits = String(batch.end).length >= 2 ? String(batch.end).length : 2;
      for (let n = batch.start; n <= batch.end; n++) {
        const reg = `${batch.prefix}${String(n).padStart(digits,'0')}`;
        _regToBatch[reg] = { batch, name: '' };
      }
    }
  });
  return _regToBatch;
}

/**
 * ✅ FIXED: Get batch groups for a hall by reading hall.seats[]
 *
 * Returns: [{ className, rollRange, count, regs[], batch, batchId }]
 *
 * Fixes applied:
 * 1. Numeric sort (not lexicographic) so "24AID10" > "24AID9" correctly
 * 2. Roll range shows actual consecutive runs, not just first–last
 *    e.g. if Hall A has 24AID01–24AID30 (contiguous) → "24AID01 — 24AID30"
 *         if non-contiguous (e.g. 01,03,07) → "24AID01, 24AID03, 24AID07"
 */
function getHallGroups(hall) {
  const lookup = getRegToBatch();
  const seated = (hall.seats || [])
    .filter(s => s && s.reg)
    .map(s => s.reg);

  if (seated.length === 0) return [];

  const order  = [];
  const groups = {};

  seated.forEach(reg => {
    const entry = lookup[reg];
    if (!entry) return;
    const bid = entry.batch.id;
    if (!groups[bid]) {
      groups[bid] = { batch: entry.batch, regs: [] };
      order.push(bid);
    }
    groups[bid].regs.push(reg);
  });

  return order.map(bid => {
    const { batch, regs } = groups[bid];
    const year      = batch.year || '';
    const dept      = batch.dept || '';
    const className = [year, dept].filter(Boolean).join(' ') || batch.prefix;

    const sorted    = sortRegsNumerically(regs);
    const rollRange = buildRollRange(sorted);

    return { className, rollRange, count: regs.length, regs: sorted, batch, batchId: bid };
  });
}

/** Sort register numbers numerically on their trailing digit suffix */
function sortRegsNumerically(regs) {
  return [...regs].sort((a, b) => {
    const mA = a.match(/^(.*?)(\d+)$/);
    const mB = b.match(/^(.*?)(\d+)$/);
    if (!mA || !mB) return a.localeCompare(b);
    if (mA[1] !== mB[1]) return mA[1].localeCompare(mB[1]);
    return parseInt(mA[2]) - parseInt(mB[2]);
  });
}

/**
 * Build a display string for a sorted list of register numbers.
 * - Contiguous run  → "24AID01 — 24AID30"
 * - Non-contiguous  → "24AID01 — 24AID15, 24AID31 — 24AID45" (runs joined)
 * - Single value    → "24AID01"
 */
function buildRollRange(sortedRegs) {
  if (sortedRegs.length === 0) return '';
  if (sortedRegs.length === 1) return esc(sortedRegs[0]);

  // All regs must share the same alpha-prefix to build numeric runs
  const matches = sortedRegs.map(r => r.match(/^(.*?)(\d+)$/));
  const prefix  = matches[0] ? matches[0][1] : null;
  const allSamePrefix = prefix !== null && matches.every(m => m && m[1] === prefix);

  if (!allSamePrefix) {
    // Mixed prefixes — just show first and last
    return `${esc(sortedRegs[0])} — ${esc(sortedRegs[sortedRegs.length - 1])}`;
  }

  const padLen  = matches[0][2].length;   // preserve original zero-padding width
  const nums    = matches.map(m => parseInt(m[2]));
  const pad     = n => String(n).padStart(padLen, '0');

  // Build consecutive runs
  const runs = [];
  let runStart = nums[0], runEnd = nums[0];
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === runEnd + 1) {
      runEnd = nums[i];
    } else {
      runs.push(runStart === runEnd
        ? esc(`${prefix}${pad(runStart)}`)
        : `${esc(`${prefix}${pad(runStart)}`)} — ${esc(`${prefix}${pad(runEnd)}`)}`);
      runStart = runEnd = nums[i];
    }
  }
  runs.push(runStart === runEnd
    ? esc(`${prefix}${pad(runStart)}`)
    : `${esc(`${prefix}${pad(runStart)}`)} — ${esc(`${prefix}${pad(runEnd)}`)}`);

  return runs.join(',&nbsp; ');
}

/** Shared college letterhead */
function makeHeader(cfg) {
  return `
    <div class="page-header">
      <div class="page-header-logo">
        <img src="/static/vetias.jpeg" alt="VET IAS" onerror="this.style.display='none'">
      </div>
      <div class="page-header-text">
        <div class="page-college-name">VET <span>IAS</span></div>
        <div class="page-college-sub">Institute of Arts and Science — Examination Division</div>
      </div>
      <div class="page-exam-meta">
        <strong>${esc(cfg.title || 'End Semester Examination')}</strong>
        ${cfg.date    ? `<span>${esc(fmtDate(cfg.date))}</span>`                    : ''}
        ${cfg.session ? `<span>${esc(sessionLabel(cfg.session, cfg))}</span>`       : ''}
      </div>
    </div>`;
}

// ── 1. NOTICE BOARD ───────────────────────────────────────────
// Exact paper format: Hall (merged) | Class | Rolls | Count | Total (merged)
function renderNoticeBoard() {
  const cfg   = appData.config || {};
  const halls = appData.halls  || [];
  let tbody      = '';
  let grandTotal = 0;

  halls.forEach(hall => {
    const groups    = getHallGroups(hall);
    const allocated = (hall.seats || []).filter(s => s && s.reg).length;

    if (groups.length === 0) {
      tbody += `<tr>
        <td class="td-hall" rowspan="1">${esc(hall.name)}</td>
        <td class="td-class" style="color:var(--tf)">—</td>
        <td class="td-rolls" style="color:var(--tf)">No students allocated</td>
        <td class="td-count">0</td>
        <td class="td-total" rowspan="1">0</td>
      </tr>`;
      return;
    }

    grandTotal += allocated;

    groups.forEach((g, i) => {
      if (i === 0) {
        tbody += `<tr>
          <td class="td-hall" rowspan="${groups.length}">${esc(hall.name)}</td>
          <td class="td-class">${esc(g.className)}</td>
          <td class="td-rolls">${g.rollRange}</td>
          <td class="td-count">${g.count}</td>
          <td class="td-total" rowspan="${groups.length}">${allocated}</td>
        </tr>`;
      } else {
        tbody += `<tr>
          <td class="td-class">${esc(g.className)}</td>
          <td class="td-rolls">${g.rollRange}</td>
          <td class="td-count">${g.count}</td>
        </tr>`;
      }
    });
  });

  document.getElementById('content').innerHTML = `
    <div class="out-page">
      ${makeHeader(cfg)}
      <div class="title-strip">📋 Hall Allocation — Notice Board</div>
      <div class="nb-wrap">
        <table class="nb-table">
          <thead>
            <tr>
              <th style="width:68px">Hall No.</th>
              <th style="text-align:left">Class</th>
              <th style="text-align:left">Register Numbers</th>
              <th style="width:64px">No. of<br>Students</th>
              <th style="width:64px">Total</th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
          <tfoot>
            <tr>
              <td class="tf-label" colspan="3">Grand Total</td>
              <td class="tf-num">${grandTotal}</td>
              <td class="tf-num">${grandTotal}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="nb-footer">
        <span>Printed: ${new Date().toLocaleString('en-IN')}</span>
        <span>Halls: ${halls.length} &nbsp;·&nbsp; Total Students: ${grandTotal}</span>
      </div>
    </div>`;
}

// ── 2. DOOR NOTICES ───────────────────────────────────────────
// One card per hall — paste on the exam hall door
function renderDoorNotices() {
  const cfg   = appData.config || {};
  const halls = appData.halls  || [];
  const title   = esc(cfg.title   || 'End Semester Examination');
  const date    = esc(fmtDate(cfg.date));
  const session = esc(sessionLabel(cfg.session, cfg));
  let html = '';

  halls.forEach(hall => {
    const groups    = getHallGroups(hall);
    const subj      = getSubject(hall);
    const allocated = (hall.seats || []).filter(s => s && s.reg).length;
    const capacity  = (hall.rows || 0) * (hall.cols || 0);
    const staffList = (appData.staff || [])
      .filter(s => s.assignedHallId === hall.id)
      .map(s => esc(s.user || s.name || ''))
      .filter(Boolean);

    const rows = groups.length === 0
      ? `<div style="padding:14px 0;color:var(--tm);font-size:13px">
           No students allocated to this hall yet.</div>`
      : groups.map(g => `
          <div class="door-row">
            <span class="door-row-class">${esc(g.className)}</span>
            <span class="door-row-rolls">${g.rollRange}</span>
            <span class="door-row-count">${g.count}</span>
          </div>`).join('');

    html += `
      <div class="out-page">
        <div class="door-hall-bar">
          <div class="door-hall-logo">
            <img src="vetias.jpeg" alt="" onerror="this.style.display='none'">
          </div>
          <div>
            <div class="door-hall-name">Hall — ${esc(hall.name)}</div>
            <div class="door-hall-sub">${title} &nbsp;|&nbsp; ${date} &nbsp;|&nbsp; ${session}</div>
            ${subj ? `<div class="door-hall-subj">
              <i class="fa-solid fa-book-open" style="margin-right:5px"></i>${esc(subj)}
            </div>` : ''}
          </div>
        </div>
        <div class="door-body">${rows}</div>
        <div class="door-footer-bar">
          <span>Capacity: ${capacity} &nbsp;·&nbsp; Allocated: <strong>${allocated}</strong></span>
          ${staffList.length > 0
            ? `<span>Invigilator(s): <strong>${staffList.join(', ')}</strong></span>`
            : ''}
        </div>
      </div>`;
  });

  document.getElementById('content').innerHTML = html ||
    '<div class="empty-state"><i class="fa-solid fa-building"></i><h2>No Halls</h2></div>';
}

// ── 3. STAFF ATTENDANCE SHEETS ────────────────────────────────
// One A4 page per hall — auto-scales to fit
function renderStaffSheets() {
  const cfg    = appData.config || {};
  const halls  = appData.halls  || [];
  const title  = esc(cfg.title   || 'End Semester Examination');
  const date   = esc(fmtDate(cfg.date));
  const session = esc(sessionLabel(cfg.session, cfg));
  const lookup = getRegToBatch();
  let html = '';

  halls.forEach(hall => {
    const capacity  = (hall.rows || 0) * (hall.cols || 0);
    const staffList = (appData.staff || [])
      .filter(s => s.assignedHallId === hall.id)
      .map(s => esc(s.user || s.name || ''))
      .filter(Boolean);
    const seated = (hall.seats || []).filter(s => s && s.reg);
    const total  = seated.length;
    // Pick compactness class based on student count
    const compactClass = total > 45 ? 'ss-tiny' : total > 28 ? 'ss-compact' : '';
    let rows = '', sno = 1;
    if (seated.length === 0) {
      rows = `<tr><td colspan="4" style="text-align:center;padding:22px;color:var(--tm)">
        No students allocated.</td></tr>`;
    } else {
      seated.forEach(seat => {
        const entry = lookup[seat.reg];
        const name  = entry ? esc(entry.name) : '';
        rows += `<tr>
          <td class="td-sno">${sno++}</td>
          <td class="td-roll">${esc(seat.reg)}</td>
          <td>${name}</td>
          <td class="td-att"><span class="att-box"></span></td>
        </tr>`;
      });
    }
    html += `
      <div class="out-page staff-page ${compactClass}">
        ${makeHeader(cfg)}
        <div class="title-strip">📝 Attendance Register — Hall ${esc(hall.name)}</div>
        <div class="staff-wrap">
          <div class="staff-info-row">
            <div>
              <div class="staff-hall-title">Hall ${esc(hall.name)}</div>
              <div class="staff-meta">
                ${title} &nbsp;|&nbsp; ${date} &nbsp;|&nbsp; ${session}
              </div>
              ${staffList.length > 0
                ? `<div class="staff-meta">Invigilator(s): ${staffList.map(n=>`<strong>${n}</strong>`).join(', ')}</div>`
                : ''}
            </div>
            <div class="staff-counts">
              <div>Total Students: <strong>${total}</strong></div>
              <div>Hall Capacity: <strong>${capacity}</strong></div>
            </div>
          </div>
          <table class="staff-table">
            <thead>
              <tr>
                <th style="width:36px">#</th>
                <th style="width:120px">Register No.</th>
                <th>Student Name</th>
                <th style="width:52px;text-align:center">Att.</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="text-align:right;font-family:var(--fd);font-size:10px;
                  text-transform:uppercase;letter-spacing:.5px;color:var(--n600)">Total Present</td>
                <td class="td-att"><span class="att-box" style="border-color:var(--brand-600)"></span></td>
              </tr>
            </tfoot>
          </table>
          <div class="staff-sign-row">
            <div class="staff-sign-box">Chief Invigilator Signature</div>
            <div class="staff-sign-box">Hall Invigilator Signature</div>
            <div class="staff-sign-box">Examiner Signature</div>
          </div>
        </div>
      </div>`;
  });

  document.getElementById('content').innerHTML = html ||
    '<div class="empty-state"><i class="fa-solid fa-building"></i><h2>No Halls</h2></div>';
}