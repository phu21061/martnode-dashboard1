/* ── FIREBASE ─────────────────────────────────────── */
const FC = {
  apiKey: "AIzaSyBqQAhZefoX7XX6NRjH3wSGXzPNM0dpN6c",
  authDomain: "j-b2103.firebaseapp.com",
  databaseURL: "https://j-b2103-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "j-b2103",
  storageBucket: "j-b2103.firebasestorage.app",
  messagingSenderId: "304185809232",
  appId: "1:304185809232:web:2363f4630e90fbb05a3455"
};
firebase.initializeApp(FC);
const db = firebase.database(), auth = firebase.auth();

/* ── GHI LỊCH SỬ HỆ THỐNG → Firebase LichSuHeThong ───── */
let _currentUser = 'unknown';
let isAdmin = false;
let _userRole = 'user'; // 'admin' | 'user' | 'device'

function luuLichSu(loaiHanhDong, giaTriChiTiet) {
  const thoiGian = new Date().toLocaleString('vi-VN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  db.ref('LichSuHeThong').push({
    thoi_gian: thoiGian,
    nguoi_dung: _currentUser,
    hanh_dong: loaiHanhDong,
    chi_tiet: giaTriChiTiet
  }).catch(err => console.warn('luuLichSu error:', err));
}

/* ── AUTH ─────────────────────────────────────────── */
let showPwd = false;
function togglePwd() {
  showPwd = !showPwd;
  document.getElementById('pass').type = showPwd ? 'text' : 'password';
  document.getElementById('eye-btn').style.color = showPwd ? 'var(--accent)' : 'var(--t2)';
}
function doLogin() {
  const e = document.getElementById('email').value, p = document.getElementById('pass').value;
  const err = document.getElementById('lerr');
  if (!e || !p) { err.textContent = 'Vui lòng nhập đầy đủ'; return }
  err.textContent = '';
  auth.signInWithEmailAndPassword(e, p).then(u => {
    _currentUser = u.user.email || u.user.uid;
    const uid = u.user.uid;

    // Đọc role từ Firebase: users/{uid}/role
    db.ref('users/' + uid + '/role').once('value').then(snap => {
      _userRole = snap.val() || 'user';
      isAdmin = (_userRole === 'admin');

      // Phân quyền UI
      document.getElementById('admin-panel').style.display = isAdmin ? 'block' : 'none';

      // User: ẩn nút lưu cài đặt vì không có quyền write Config
      const btnSave = document.getElementById('btn-save');
      if (btnSave) btnSave.style.display = isAdmin ? '' : 'none';

      // User: khóa thanh kéo nhóm Cài Đặt
      if (!isAdmin) {
        const measureTog = document.getElementById('measure-tog');
        if (measureTog) measureTog.disabled = true;

        const slAct = document.getElementById('sl-act');
        const slStil = document.getElementById('sl-stil');
        const slNop = document.getElementById('sl-nop');
        const luxThr = document.getElementById('lux-thr-sl');
        
        if(slAct) slAct.disabled = true;
        if(slStil) slStil.disabled = true;
        if(slNop) slNop.disabled = true;
        if(luxThr) luxThr.disabled = true;
      }

      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('modal-user-email').textContent = _currentUser + ' (' + _userRole + ')';
      addActivityLog('Đăng nhập', '', _currentUser + ' [' + _userRole + ']', 'var(--accent)');
      luuLichSu('DANG_NHAP', _currentUser);
      startApp();
    }).catch(roleErr => {
      console.warn('Không đọc được role:', roleErr);
      // Mặc định là user nếu không đọc được
      _userRole = 'user';
      isAdmin = false;
      document.getElementById('admin-panel').style.display = 'none';
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('modal-user-email').textContent = _currentUser + ' (user)';
      addActivityLog('Đăng nhập', '', _currentUser + ' [user]', 'var(--accent)');
      luuLichSu('DANG_NHAP', _currentUser);
      startApp();
    });
  }).catch(() => { err.textContent = 'Sai tài khoản hoặc mật khẩu' });
}

// ── LOGOUT MODAL TỪ HTML (Được xử lý thêm)
function showLogoutModal() {
  document.getElementById('logout-modal').classList.add('show');
}
function hideLogoutModal() {
  document.getElementById('logout-modal').classList.remove('show');
}
function doLogout() {
  auth.signOut().then(() => {
    window.location.reload();
  });
}

/* ── ADMIN CLEAR ALL ──────────────────────────────── */
let clearTypeToProcess = '';
function confirmClear(type) {
  if (!isAdmin) return;
  clearTypeToProcess = type;
  const desc = document.getElementById('clear-modal-desc');
  if (type === 'activity') {
    desc.innerHTML = 'Hành động này sẽ xóa <strong>Lịch sử Hoạt động, Lệnh và Đề xuất AI</strong> khỏi Firebase.<br><br>Không thể khôi phục!';
  } else {
    desc.innerHTML = 'Hành động này sẽ xóa <strong>Toàn bộ biểu đồ Điện năng</strong> khỏi Firebase.<br><br>Không thể khôi phục!';
  }
  document.getElementById('clear-modal').classList.add('show');
}
function hideClearModal() {
  document.getElementById('clear-modal').classList.remove('show');
}

document.getElementById('btn-confirm-clear').addEventListener('click', function() {
  if (!isAdmin) { toast('Không có quyền!', 'var(--red)'); return; }
  hideClearModal();
  
  if (clearTypeToProcess === 'activity') {
    db.ref('LichSuHeThong').remove();
    db.ref('AI_De_Xuat').remove().then(() => {
      toast('✅ Đã xóa Lịch sử hoạt động!', 'var(--green)');
      activityLogs = []; renderLog();
      addActivityLog('[ADMIN] Xóa lịch sử hoạt động', '', _currentUser, 'var(--red)');
    }).catch(err => toast('Lỗi xóa Firebase: ' + err.message, 'var(--red)'));
  } else if (clearTypeToProcess === 'energy') {
    Promise.all([
      db.ref('SmartNode_01/history_energy').remove(),
      db.ref('SmartNode_01/history_label').remove()
    ]).then(() => {
      toast('✅ Đã xóa Lịch sử điện năng!', 'var(--green)');
      if (typeof renderEnergyChart === 'function') renderEnergyChart([]);
      if (typeof renderMonthlyChart === 'function') renderMonthlyChart([]);
      addActivityLog('[ADMIN] Xóa Lịch sử điện năng', '', _currentUser, 'var(--red)');
    }).catch(err => toast('Lỗi xóa Firebase: ' + err.message, 'var(--red)'));
  }
});

/* ── NAV ──────────────────────────────────────────── */
let curPage = 0;
function goPage(n) {
  document.getElementById('p' + curPage).classList.remove('active');
  document.getElementById('tab' + curPage).classList.remove('active');
  curPage = n;
  document.getElementById('p' + n).classList.add('active');
  document.getElementById('tab' + n).classList.add('active');
  const vb = document.getElementById('voice-btn');
  if (vb) vb.classList.toggle('hide', n !== 0);
  if (navigator.vibrate) navigator.vibrate(7);
}

/* ── TOAST ────────────────────────────────────────── */
let tt;
function toast(msg, color) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.color = color || 'var(--t0)';
  t.classList.add('show'); clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ── LOG SYSTEM (chỉ activity) ────────────────────── */
let activityLogs = [];

function ts() {
  const d = new Date();
  return d.getHours().toString().padStart(2, '0') + ':' +
    d.getMinutes().toString().padStart(2, '0') + ':' +
    d.getSeconds().toString().padStart(2, '0');
}

function addActivityLog(text, detail, val, color) {
  const entry = { time: ts(), text, val: val || detail || '', color: color || 'var(--t1)' };
  activityLogs.unshift(entry);
  renderLog();
}

function renderLog() {
  const el = document.getElementById('log-display');
  if (!el) return;
  const logs = activityLogs;
  if (!logs.length) { el.innerHTML = '<div class="log-empty">Chưa có dữ liệu</div>'; return }
  el.innerHTML = logs.map((l, i) => {
    const rawColor = l.color || 'var(--accent)';
    let pillBg = 'rgba(132,79,193,0.1)';
    let pillColor = rawColor;
    if (rawColor.includes('--red') || rawColor === 'var(--red)') { pillBg='rgba(224,60,60,0.1)'; pillColor='#e03c3c'; }
    else if (rawColor.includes('--green') || rawColor === 'var(--green)') { pillBg='rgba(33,191,6,0.12)'; pillColor='#1aa300'; }
    else if (rawColor.includes('--amber') || rawColor === 'var(--amber)') { pillBg='rgba(180,130,0,0.1)'; pillColor='#9a7000'; }
    else if (rawColor.includes('--accent') || rawColor === 'var(--accent)') { pillBg='rgba(132,79,193,0.1)'; pillColor='#844FC1'; }
    else if (rawColor.includes('--t1') || rawColor === 'var(--t1)') { pillBg='rgba(108,114,147,0.1)'; pillColor='#6C7293'; }

    // Log AI: hiển thị 2 dòng — dòng trên là timestamp + badge, dòng dưới là nội dung đầy đủ
    if (l.isAI) {
      return `
<div class="log-item log-item-ai" style="animation-delay:${Math.min(i,8)*25}ms;flex-direction:column;align-items:flex-start;gap:6px">
  <div style="display:flex;align-items:center;gap:8px;width:100%">
    <div class="log-time">${l.time}</div>
    <div style="width:8px;height:8px;border-radius:50%;background:${pillColor};flex-shrink:0"></div>
    <div class="log-val" style="color:${pillColor};background:${pillBg};white-space:nowrap">${l.val}</div>
  </div>
  <div style="font-size:.82rem;color:#1a1a2e;font-weight:600;line-height:1.5;word-break:break-word;width:100%;padding-left:2px">${l.text}</div>
</div>`;
    }

    // Log thường: layout 1 hàng
    return `
<div class="log-item" style="animation-delay:${Math.min(i,8)*25}ms">
  <div class="log-time">${l.time}</div>
  <div class="log-dot" style="background:${pillColor};width:8px;height:8px;border-radius:50%;flex-shrink:0"></div>
  <div class="log-text">${l.text}</div>
  <div class="log-val" style="color:${pillColor};background:${pillBg}">${l.val}</div>
</div>`;
  }).join('');
}

function clearLog() {
  activityLogs = [];
  renderLog(); toast('Đã xóa log hoạt động');
}

/* ── LAMP VISUAL ──────────────────────────────────── */
function updateLamp(pct, label) {
  const dispLabel = label === 2 ? lastLabel : label;

  document.getElementById('lamp-pct').innerHTML =
    pct + '<span style="font-size:1.3rem;color:var(--t1)">%</span>';
  document.getElementById('lamp-sub').textContent =
    pct === 0 ? 'Đèn đang tắt' : `Đang sáng ${pct}%`;

  const glow = document.getElementById('lamp-glow');
  const svg = document.getElementById('lamp-svg');
  const intensity = pct / 100;
  if (pct > 5) {
    glow.style.background = `radial-gradient(circle,rgba(255,214,10,${intensity * .45}) 0%,transparent 68%)`;
    svg.style.filter = `drop-shadow(0 0 ${pct * .25}px rgba(255,214,10,${intensity * .75}))`;
  } else {
    glow.style.background = 'transparent';
    svg.style.filter = 'none';
  }

  if (isAutoMode) highlightAutoDetailItem(dispLabel);

  lastLabel = dispLabel;
  lastPct = pct;
}

/* ── CONTROL ──────────────────────────────────────── */
let lastLabel = -1, lastLabelRaw = -1, logEthr = 0;
let lastPct = 0;
let isAutoMode = false;
window.currentEnvLux = 0;

function setAuto(on) {
  // Đã tháo block isAdmin để ai cũng có quyền điều khiển thủ công
  db.ref('Control/dieu_khien').set(!on);
  refreshModeUI(on);
  addActivityLog(on ? 'Bật tự động' : 'Tắt tự động', '', '', 'var(--accent)');
  luuLichSu(on ? 'CHE_DO_TU_DONG' : 'CHE_DO_THU_CONG', (on ? 'bat' : 'tat') + ' (lux:' + (window.currentEnvLux || 0) + ')');
  toast(on ? 'Chế độ tự động' : 'Chế độ thủ công');
}

function refreshModeUI(isAuto) {
  isAutoMode = isAuto;
  const b = document.getElementById('mbadge');
  b.className = 'mbadge ' + (isAuto ? 'auto' : 'manual');
  b.innerHTML = isAuto
    ? '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M3.5 5.5l1.5 1.5 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg> TỰ ĐỘNG'
    : '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 3v2.5l1.5 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg> THỦ CÔNG';
  const mc = document.getElementById('manual-card');
  mc.style.opacity = isAuto ? '.65' : '1';
  mc.style.pointerEvents = isAuto ? 'none' : 'auto';

  const ad = document.getElementById('auto-detail');
  if (ad) ad.classList.toggle('show', isAuto);

  if (isAuto) {
    highlightAutoDetailItem(lastLabel);
  } else {
    ['adi-move', 'adi-still', 'adi-empty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active-item');
    });
  }
}

function updateSliderBg(el) {
  if (!el) return;
  const min = +(el.min || 0), max = +(el.max || 100), val = +el.value;
  const pct = (val - min) / (max - min) * 100;
  el.style.backgroundSize = pct + '% 100%';
}

function qset(v) {
  // Đã tháo block isAdmin để ai cũng có quyền điều khiển slider
  const el = document.getElementById('bslider');
  el.value = v; updateSliderBg(el);
  document.getElementById('bval').textContent = v;
  updateLamp(+v, lastLabel);
  db.ref('Control/do_sang').set(v);
  luuLichSu('CHINH_DO_SANG_THU_CONG', v + '% (lux:' + (window.currentEnvLux || 0) + ')');
  addActivityLog('Chỉnh độ sáng thủ công', '', v + '%', 'var(--t1)');
}
let bd;
function onBI(v) {
  document.getElementById('bval').textContent = v;
  updateLamp(+v, lastLabel);
  clearTimeout(bd);
  bd = setTimeout(() => {
    db.ref('Control/do_sang').set(+v);
    luuLichSu('CHINH_DO_SANG_SLIDER', v + '% (lux:' + (window.currentEnvLux || 0) + ')');
  }, 80);
}

/* ── SETTINGS ─────────────────────────────────────── */
function setMeasure(on) {
  if (!isAdmin) { toast('Chỉ Admin mới có quyền thay đổi!', 'var(--red)'); return; }
  db.ref('Config/measure_mode').set(on);
  addActivityLog(on ? 'Bật chế độ đo ánh sáng' : 'Tắt chế độ đo', '', '', 'var(--amber)');
  toast(on ? '🔬 Đang đo ánh sáng' : '✅ Kết thúc đo', on ? 'var(--amber)' : '');
}

function saveConfig() {
  if (!isAdmin) { toast('Chỉ Admin mới có quyền lưu cài đặt!', 'var(--red)'); return; }
  const cfg = {
    bright_active: +document.getElementById('sl-act').value,
    bright_still: +document.getElementById('sl-stil').value,
    bright_no_person: +document.getElementById('sl-nop').value,
    lux_threshold: +document.getElementById('lux-thr-sl').value,
  };
  db.ref('Config').update(cfg).then(() => {
    const b = document.getElementById('btn-save');
    b.classList.add('ok'); b.textContent = '✓ Đã lưu';
    toast('Đã lưu cài đặt', 'var(--green)');
    addActivityLog('Lưu cài đặt', `active:${cfg.bright_active}% still:${cfg.bright_still}%`, '', 'var(--green)');
    luuLichSu('LUU_CAI_DAT', `active:${cfg.bright_active}% still:${cfg.bright_still}% noPerson:${cfg.bright_no_person}% lux:${cfg.lux_threshold}`);
    setTimeout(() => { b.classList.remove('ok'); b.textContent = 'Lưu cài đặt' }, 2500);
  });
}

/* ── LUX DISPLAY ──────────────────────────────────── */
function updateLuxDisplay(lux) {
  const valEl = document.getElementById('lux-big-val');
  const barEl = document.getElementById('lux-bar-fill');
  const statusEl = document.getElementById('lux-status');
  const iconWrap = document.getElementById('lux-icon-wrap');

  if (valEl) valEl.innerHTML = lux + ' <span>lux</span>';

  const pct = Math.min(100, (lux / 500) * 100);
  if (barEl) barEl.style.width = pct + '%';

  const thrEl = document.getElementById('lux-thr-sl');
  const threshold = thrEl ? +thrEl.value : 50;

  if (lux > threshold) {
    if (statusEl) { statusEl.className = 'lux-status day'; statusEl.textContent = '☀️ Sáng'; }
    if (iconWrap) iconWrap.classList.add('bright');
  } else {
    if (statusEl) { statusEl.className = 'lux-status night'; statusEl.textContent = '🌙 Tối'; }
    if (iconWrap) iconWrap.classList.remove('bright');
  }
}

/* ── RADAR LABEL DISPLAY ──────────────────────────── */
function updateRadarLabel(label) {
  const el = document.getElementById('radar-label-txt');
  if (!el) return;
  const names = ['Trống', 'Cố định', 'Nhiễu', 'Di chuyển'];
  const colors = ['var(--t2)', 'var(--amber)', 'var(--purple)', 'var(--green)'];
  el.textContent = names[label] || '?';
  el.style.color = colors[label] || 'var(--t1)';
}

/* ── AUTO DETAIL HIGHLIGHT ────────────────────────── */
function highlightAutoDetailItem(label) {
  ['adi-move', 'adi-still', 'adi-empty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active-item');
  });
  const map = { 3: 'adi-move', 1: 'adi-still', 0: 'adi-empty' };
  const activeId = map[label];
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el) el.classList.add('active-item');
  }
}

/* ── VOICE ────────────────────────────────────────── */
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Trình duyệt không hỗ trợ giọng nói', 'var(--red)'); return }
  const r = new SR(), btn = document.getElementById('voice-btn');
  r.lang = 'vi-VN'; r.interimResults = false;
  r.onstart = () => { btn.classList.add('listening'); toast('🎙 Đang nghe...') };
  r.onend = () => btn.classList.remove('listening');
  r.onresult = e => {
    const cmd = e.results[0][0].transcript.toLowerCase();
    toast('Nghe: "' + cmd + '"');
    addActivityLog('Lệnh giọng nói', cmd, '', 'var(--purple)');
    luuLichSu('LENH_GIONG_NOI', cmd);
    const tog = document.getElementById('auto-toggle');
    if (cmd.includes('thủ công')) {
      tog.checked = false; setAuto(false);
      toast('🔧 Chế độ thủ công', 'var(--t0)');
    } else if (cmd.includes('tự động')) {
      const wantOff = cmd.includes('tắt');
      const wantOn = cmd.includes('bật') || cmd.includes('mở');
      let on;
      if (wantOff) on = false;
      else if (wantOn) on = true;
      else on = !tog.checked;
      tog.checked = on; setAuto(on);
    } else if (cmd.includes('tắt đèn') || cmd.includes('tắt hệ thống')) {
      tog.checked = false; setAuto(false);
      db.ref('Control/do_sang').set(0);
    } else if (cmd.includes('bật đèn') || cmd.includes('mở đèn') || cmd.includes('sáng tối đa')) {
      tog.checked = false; setAuto(false);
      db.ref('Control/do_sang').set(100);
    } else if (cmd.includes('sáng') || cmd.includes('mức') || cmd.includes('độ')) {
      const m = cmd.match(/\d+/);
      if (m) {
        const v = Math.min(100, +m[0]);
        db.ref('Control/do_sang').set(v);
        if (tog.checked) { tog.checked = false; setAuto(false) }
      }
    }
  };
  r.onerror = ex => { btn.classList.remove('listening'); toast('Lỗi: ' + ex.error, 'var(--red)') };
  r.start();
}

/* ── ESP WATCHDOG TIMER ───────────────────────────── */
const ESP_TIMEOUT_MS = 15000; 
let espWatchdogTimer = null;
let espIsAlive = false;
let espDiedLogged = false;

function setEspAlive(uptimeStr) {
  const el = document.getElementById('esp-status');
  const lbl = document.getElementById('esp-lbl');
  if (!el) return;
  el.className = 'esp-status alive';
  lbl.textContent = uptimeStr ? 'ESP ↑' + uptimeStr : 'ESP ✓';
  if (!espIsAlive) {
    espIsAlive = true;
    espDiedLogged = false;
    addActivityLog('ESP kết nối lại', '', '✓', 'var(--green)');
    toast('✅ ESP đã kết nối', 'var(--green)');
  }
}

function setEspDead() {
  const el = document.getElementById('esp-status');
  const lbl = document.getElementById('esp-lbl');
  if (!el) return;
  el.className = 'esp-status dead';
  lbl.textContent = 'ESP ✗';
  if (espIsAlive || !espDiedLogged) {
    espIsAlive = false;
    espDiedLogged = true;
    addActivityLog('⚠ ESP mất kết nối', 'Không nhận heartbeat > 15s', '', 'var(--red)');
    toast('⚠️ ESP mất kết nối!', 'var(--red)');
  }
}

function resetEspWatchdog() {
  if (espWatchdogTimer) clearTimeout(espWatchdogTimer);
  espWatchdogTimer = setTimeout(() => {
    setEspDead();
  }, ESP_TIMEOUT_MS);
}

/* ── FIREBASE SYNC ────────────────────────────────── */
function startApp() {
  renderLog();

  db.ref('.info/connected').on('value', s => {
    const on = s.val() === true;
    document.getElementById('sdot').className = 'sdot ' + (on ? 'on' : 'off');
    document.getElementById('stxt').textContent = on ? 'Trực tuyến' : 'Mất kết nối';
  }, err => {
    console.warn('Firebase connection listener error:', err);
    document.getElementById('sdot').className = 'sdot warn';
    document.getElementById('stxt').textContent = 'Lỗi kết nối';
  });

  db.ref('SmartNode_01/telemetry').on('value', s => {
    const d = s.val(); if (!d) return;

    resetEspWatchdog();

    if (d.heartbeat) {
      const up = d.heartbeat.uptime_s || 0;
      const hh = Math.floor(up / 3600), mm = Math.floor((up % 3600) / 60), ss = up % 60;
      const upStr = (hh ? hh + 'h ' : '') + (mm ? mm + 'm ' : '') + (ss + 's');
      setEspAlive(upStr);
    } else {
      setEspAlive();
    }

    if (d.e) {
      // Chỉ log real-time (không còn addEnergyLog)
    }

    let lux = null;
    if (d.light) lux = d.light.env_lux ?? d.light.environment_lux ?? null;

    const lpct = (d.light && d.light.lamp_percent) || 0;
    if (lux !== null) {
      window.currentEnvLux = lux;
      updateLuxDisplay(lux);
      const lampPct2 = document.getElementById('lamp-pct2');
      if (lampPct2) lampPct2.textContent = lpct + '%';
      document.getElementById('lux-live').textContent = lux + ' lux';
    }

    let label = 0;
    if (d.ai) {
      if (d.ai.label !== undefined) label = Number(d.ai.label);
      else if (d.ai.label_name) {
        const nameMap = {
          'still': 1, 'stationary': 1,
          'noise': 2, 'interference': 2,
          'active': 3, 'move': 3, 'moving': 3
        };
        label = nameMap[d.ai.label_name] ?? 0;
      }
    }

    updateRadarLabel(label);
    updateLamp(lpct, label);

    if (label !== lastLabelRaw) {
      const names = ['Không có người', 'Đứng yên', 'Vật thể nhiễu', 'Di chuyển mạnh'];
      const colors = ['var(--t2)', 'var(--amber)', 'var(--purple)', 'var(--green)'];
      if (label !== 2) {
        addActivityLog('Trạng thái: ' + (names[label] || '?'), '', '', colors[label] || 'var(--t2)');
      }
      lastLabelRaw = label;
    }
  }, err => {
    console.warn('Telemetry listener error:', err);
    toast('⚠️ Lỗi đọc dữ liệu cảm biến', 'var(--red)');
  });

  db.ref('Control/dieu_khien').on('value', s => {
    const v = (s.val() === false);
    document.getElementById('auto-toggle').checked = v;
    refreshModeUI(v);
  });

  db.ref('Control/do_sang').on('value', s => {
    const v = s.val() || 0;
    const el = document.getElementById('bslider');
    el.value = v; updateSliderBg(el);
    document.getElementById('bval').textContent = v;
  });

  db.ref('Config').on('value', s => {
    const c = s.val(); if (!c) return;
    if (c.bright_active !== undefined) {
      const el = document.getElementById('sl-act'); el.value = c.bright_active; updateSliderBg(el); document.getElementById('v-act').textContent = c.bright_active + '%';
      const adi = document.getElementById('adi-move-val'); if (adi) adi.textContent = c.bright_active + '%';
    }
    if (c.bright_still !== undefined) {
      const el = document.getElementById('sl-stil'); el.value = c.bright_still; updateSliderBg(el); document.getElementById('v-stil').textContent = c.bright_still + '%';
      const adi = document.getElementById('adi-still-val'); if (adi) adi.textContent = c.bright_still + '%';
    }
    if (c.bright_no_person !== undefined) {
      const el = document.getElementById('sl-nop'); el.value = c.bright_no_person; updateSliderBg(el); document.getElementById('v-nop').textContent = c.bright_no_person + '%';
      const adi = document.getElementById('adi-empty-val'); if (adi) adi.textContent = c.bright_no_person + '%';
    }
    if (c.lux_threshold !== undefined) { const el = document.getElementById('lux-thr-sl'); el.value = c.lux_threshold; updateSliderBg(el); document.getElementById('lux-thr-v').textContent = c.lux_threshold }
    if (c.measure_mode !== undefined) document.getElementById('measure-tog').checked = c.measure_mode;
  });

  db.ref('AI_De_Xuat').limitToLast(1).once('value', snapshot => {
    let lastKey = null;
    snapshot.forEach(child => { lastKey = child.key; });

    db.ref('AI_De_Xuat').on('child_added', snap => {
      if (lastKey !== null && snap.key <= lastKey) return;
      const d = snap.val();
      if (!d) return;
      const mucDo = d.muc_do || 'Thông tin';
      const thongBao = d.thong_bao || '';
      let color = 'var(--accent)';
      if (mucDo === 'Khẩn cấp' || mucDo === 'Cảnh báo') color = 'var(--red)';
      else if (mucDo === 'Quan trọng') color = 'var(--amber)';
      else if (mucDo === 'Bình thường') color = 'var(--green)';

      // Hiển thị: isAI=true → renderLog sẽ dùng layout 2 dòng hiển thị đầy đủ
      const entry = { time: ts(), text: '🤖 ' + thongBao, val: mucDo, color, isAI: true };
      activityLogs.unshift(entry);
      renderLog();

      luuLichSu('DE_XUAT_AI', `[${mucDo}] ${thongBao}`);
      toast('🤖 Đề xuất AI: ' + mucDo, '#ffffff');
    });
  });
}

/* ── FIREBASE CHARTS ──────────────────────────────── */
let sheetChart = null;
let monthlyChart = null;

function renderEnergyChart(data) {
  const canvas = document.getElementById('sheetChart');
  const loading = document.getElementById('sheet-loading');
  canvas.style.display = 'block';
  loading.style.display = 'none';

  if (!data.length) {
    canvas.style.display = 'none';
    loading.innerHTML = '<div class="sheet-error">Không có dữ liệu</div>';
    loading.style.display = 'flex';
    return;
  }

  const labels = data.map(d => d.label);
  const values = data.map(d => d.val);
  const fullLabels = data.map(d => d.fullLabel);

  const ctx = canvas.getContext('2d');

  if (sheetChart) {
    sheetChart.data.labels = labels;
    sheetChart.data.datasets[0].data = values;
    sheetChart.data.datasets[0].fullLabels = fullLabels;
    sheetChart.update('none');
    return;
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, 260);
  gradient.addColorStop(0, 'rgba(0,255,204,0.4)');
  gradient.addColorStop(0.55, 'rgba(0,255,204,0.08)');
  gradient.addColorStop(1, 'rgba(0,255,204,0)');

  sheetChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'E_Wh',
        data: values,
        fullLabels,
        borderColor: '#00ffcc',
        backgroundColor: gradient,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: data.length <= 60 ? 3 : 0,
        pointHoverRadius: 7,
        pointBackgroundColor: '#00ffcc',
        pointBorderColor: '#000',
        pointBorderWidth: 1.5,
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#00ffcc',
        pointHoverBorderWidth: 2.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: 'rgba(255,255,255,0.35)',
            font: { size: 9, family: 'JetBrains Mono' },
            maxRotation: 40,
            maxTicksLimit: 7,
            autoSkip: true
          }
        },
        y: {
          beginAtZero: false,
          grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
          ticks: {
            color: 'rgba(255,255,255,0.35)',
            font: { size: 9, family: 'JetBrains Mono' },
            maxTicksLimit: 6,
            callback: v => v.toFixed(4)
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'nearest',
          axis: 'x',
          intersect: false,
          backgroundColor: 'rgba(8,8,14,0.96)',
          borderColor: 'rgba(0,255,204,0.4)',
          borderWidth: 1,
          titleFont: { family: 'JetBrains Mono', size: 10 },
          bodyFont: { family: 'JetBrains Mono', size: 12, weight: '700' },
          titleColor: 'rgba(255,255,255,0.55)',
          bodyColor: '#00ffcc',
          padding: 12,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: function (items) {
              const ds = items[0]?.dataset;
              const idx = items[0]?.dataIndex;
              if (ds && ds.fullLabels && ds.fullLabels[idx]) {
                return '📅 ' + ds.fullLabels[idx];
              }
              return items[0]?.label || '';
            },
            label: ctx => '⚡ E_Wh: ' + ctx.parsed.y.toFixed(6)
          }
        }
      }
    }
  });
}

/* ── BIỂU ĐỒ CỘT THỐNG KÊ THEO THÁNG ───────────── */
function renderMonthlyChart(data) {
  const canvas = document.getElementById('monthlyChart');
  const loading = document.getElementById('monthly-loading');
  if (!canvas || !loading) return;

  canvas.style.display = 'block';
  loading.style.display = 'none';

  // Lấy giá trị E_Wh mới nhất (cuối cùng) của mỗi tháng
  // Vì E_Wh là tích lũy, giá trị cuối = điện năng tổng của tháng đó
  const monthlyMap = {};
  data.forEach(d => {
    // fullLabel format: "DD/MM/YYYY HH:MM:SS"
    const parts = d.fullLabel.split(' ')[0].split('/');
    if (parts.length >= 3) {
      const monthKey = parts[1] + '/' + parts[2]; // MM/YYYY
      // Luôn ghi đè → giữ lại giá trị cuối cùng (mới nhất)
      monthlyMap[monthKey] = d.val;
    }
  });

  const monthLabels = Object.keys(monthlyMap);
  const monthValues = Object.values(monthlyMap).map(v => +v.toFixed(4));

  if (!monthLabels.length) {
    canvas.style.display = 'none';
    loading.innerHTML = '<div class="sheet-error">Chưa có dữ liệu thống kê</div>';
    loading.style.display = 'flex';
    return;
  }

  const ctx = canvas.getContext('2d');

  if (monthlyChart) {
    monthlyChart.data.labels = monthLabels;
    monthlyChart.data.datasets[0].data = monthValues;
    monthlyChart.update('none');
    return;
  }

  // Gradient cho cột
  const barGradient = ctx.createLinearGradient(0, 0, 0, 260);
  barGradient.addColorStop(0, 'rgba(132,79,193,0.9)');
  barGradient.addColorStop(1, 'rgba(132,79,193,0.25)');

  monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Tổng Wh',
        data: monthValues,
        backgroundColor: barGradient,
        borderColor: 'rgba(132,79,193,0.8)',
        borderWidth: 1.5,
        borderRadius: 8,
        borderSkipped: false,
        hoverBackgroundColor: 'rgba(160,100,220,0.95)',
        barPercentage: 0.7,
        categoryPercentage: 0.7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          ticks: {
            color: 'rgba(255,255,255,0.5)',
            font: { size: 11, family: 'JetBrains Mono', weight: '500' }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
          ticks: {
            color: 'rgba(255,255,255,0.35)',
            font: { size: 9, family: 'JetBrains Mono' },
            maxTicksLimit: 6,
            callback: v => v.toFixed(2) + ' Wh'
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(8,8,14,0.96)',
          borderColor: 'rgba(132,79,193,0.5)',
          borderWidth: 1,
          titleFont: { family: 'JetBrains Mono', size: 11 },
          bodyFont: { family: 'JetBrains Mono', size: 13, weight: '700' },
          titleColor: 'rgba(255,255,255,0.55)',
          bodyColor: '#b06bff',
          padding: 12,
          cornerRadius: 12,
          displayColors: false,
          callbacks: {
            title: items => '📅 Tháng ' + items[0].label,
            label: ctx => '⚡ Điện năng: ' + ctx.parsed.y.toFixed(4) + ' Wh'
          }
        }
      }
    }
  });
}

function loadHistoryFromFirebase() {
  // Lịch sử hoạt động - dùng push key order (tự nhiên theo thời gian)
  // KHÔNG dùng orderByChild('thoi_gian') vì format "HH:MM:SS DD/MM/YYYY" sort sai
  db.ref('LichSuHeThong').on('value', snap => {
    let arr = [];
    snap.forEach(child => {
      let v = child.val();
      if(!v) return;
      let c = 'var(--t1)';
      if(v.hanh_dong==='DANG_NHAP') c = 'var(--accent)';
      else if(v.hanh_dong==='LUU_CAI_DAT') c = 'var(--green)';
      else if(v.hanh_dong==='LENH_GIONG_NOI') c = 'var(--purple)';
      else if(v.hanh_dong && (v.hanh_dong.includes('THU_CONG')||v.hanh_dong.includes('TU_DONG'))) c = 'var(--amber)';
      else if(v.hanh_dong && v.hanh_dong.includes('DO_SANG')) c = 'var(--t1)';
      else if(v.nguoi_dung==='🤖 AI System') c = 'var(--amber)';
      
      let timeDisplay = v.thoi_gian || '';

      if (v.hanh_dong === 'DE_XUAT_AI') {
        // chi_tiet = "[Quan trọng] Nội dung..." → tách badge và nội dung đầy đủ
        const chiTiet = v.chi_tiet || '';
        const m = chiTiet.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
        const badge = m ? m[1] : 'AI';
        const body  = m ? m[2].trim() : chiTiet;
        let aiColor = 'var(--accent)';
        if (badge === 'Cảnh báo' || badge === 'Khẩn cấp') aiColor = 'var(--red)';
        else if (badge === 'Quan trọng') aiColor = 'var(--amber)';
        arr.push({ time: timeDisplay, text: '🤖 ' + body, val: badge, color: aiColor, isAI: true });
      } else {
        const label = typeof v.hanh_dong === 'string' ? v.hanh_dong.replace(/_/g, ' ') : (v.hanh_dong || '');
        arr.push({ time: timeDisplay, text: label, val: v.chi_tiet || '', color: c });
      }
    });
    // Push key đã theo thứ tự thời gian, reverse để mới nhất lên đầu
    activityLogs = arr.reverse();
    renderLog();
  });

  const loading = document.getElementById('sheet-loading');
  if (loading) {
    loading.innerHTML = '<div class="spinner"></div> Đang tải dữ liệu...';
    loading.style.display = 'flex';
  }
  const monthlyLoading = document.getElementById('monthly-loading');
  if (monthlyLoading) {
    monthlyLoading.innerHTML = '<div class="spinner"></div> Đang tải thống kê...';
    monthlyLoading.style.display = 'flex';
  }
  
  db.ref('SmartNode_01/history_energy').orderByChild('time').on('value', snap => {
    let rawData = [];
    snap.forEach(child => {
      let v = child.val();
      if(!v || !v.time) return;
      
      let tparts = v.time.split(' ');
      let dparts = tparts[0].split('-');
      let timeOnly = tparts[1] || '';
      
      let shortLabel = dparts.length === 3 ? `${dparts[2]}/${dparts[1]} ${timeOnly.slice(0,5)}` : v.time;
      let fullLabel = dparts.length === 3 ? `${dparts[2]}/${dparts[1]}/${dparts[0]} ${timeOnly}` : v.time;
      
      rawData.push({ val: v.E_wh || 0, label: shortLabel, fullLabel: fullLabel });
    });
    
    if(typeof renderEnergyChart === 'function') renderEnergyChart(rawData);
    if(typeof renderMonthlyChart === 'function') renderMonthlyChart(rawData);
  });
}

if (typeof startApp === 'function') {
  const _origStartApp = startApp;
  startApp = function () {
    _origStartApp();
    setTimeout(loadHistoryFromFirebase, 500);
  };
} else {
  console.warn('startApp chưa được định nghĩa khi patch — loadHistoryFromFirebase sẽ không chạy tự động');
}