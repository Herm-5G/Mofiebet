/* =========================================================
   Mofiebet — v22 (Manual Premium Payment Verification)
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyBDBOcsjAHjc5s-ZFWC94fWiqUw8g6dqQs",
  authDomain: "mofiebet.firebaseapp.com",
  projectId: "mofiebet",
  storageBucket: "mofiebet.firebasestorage.app",
  messagingSenderId: "296746166600",
  appId: "1:296746166600:web:53f1a2a76a032da196ab7d",
  measurementId: "G-M9VJ3XG62Q"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const FieldValue = firebase.firestore.FieldValue;

const CURRENCY   = 'UGX ';
const PREMIUM_MS = 24 * 60 * 60 * 1000;
const SITES      = ['Betpawa', '1xBet', 'ForteBet', 'Bet365', 'Betway', 'SportyBet'];
const OTHERS     = 'Others';
const OTHERS_SENTINEL = '__others__';

const PREMIUM_PHONE     = '+256 748 368 400';
const PREMIUM_PHONE_RAW = '+256748368400';
const PREMIUM_PAYEE     = 'Juliet Awor';
const SUPPORT_PHONE     = 'mofiebet@gmail.com';

let state = {
  view: 'site',
  activeSite: 'Betpawa',
  authMode: 'login',
  theme: 'dark',
  session: null,
  userUid: null,
  userData: null,
  isAdmin: false,
  adminData: null,
  tickets: [],
  premiumPicks: {},
  bookings: [],
  usersList: [],
  adminsList: [],
  auditLog: [],
  upcomingEvents: [],
  search: '',
  newTicketTier: 'free'
};

let isAdminVerified = false;
let _expiryTimer = null;
let _userUnsub   = null;
let _eventTimer  = null;

/* ---------- helpers ---------- */
const money = n => CURRENCY + Number(n || 0).toLocaleString('en-UG', { maximumFractionDigits: 0 });
const esc   = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const newRef = () => 'MFB-' + Math.floor(1000 + Math.random() * 9000);
const fmtTime = ts => new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
const remainingSlots = t => Math.max(0, (t.cap || 50) - (t.sold || 0));
const isTicketAvailable = t => t.status === 'open' && remainingSlots(t) > 0;

const isMasterAdmin = () => state.isAdmin === true && state.adminData && state.adminData.master === true;
const isAdminUser   = () => state.isAdmin === true;

function expiryMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}
const isPremiumUser   = () => isAdminUser() || expiryMs(state.userData && state.userData.premiumExpiry) > Date.now();
const userIsPremium   = u => expiryMs(u && u.premiumExpiry) > Date.now();
const isPremiumTicket = t => t.tier === 'premium';
const canAccessTicket = t => !isPremiumTicket(t) || isPremiumUser();
const premiumLeftMs   = u => Math.max(0, expiryMs(u && u.premiumExpiry) - Date.now());
function premiumLeftLabel(u) {
  const ms = premiumLeftMs(u);
  if (ms <= 0) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m left`;
}
const isAdminId = uid => state.adminsList.some(a => a.id === uid);

/* ---------- Event & Date Helpers ---------- */
function formatEventDay(d) {
  if (!d) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatEventTime(d) {
  if (!d) return '';
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* Custom Confirm Modal to replace native window.confirm() */
function showConfirm(title, message, confirmText, onConfirm) {
  document.getElementById('modal-root').innerHTML = `
    <div class="backdrop" onclick="if(event.target===this)closeModal()">
      <div class="modal confirm-modal">
        <div class="confirm-icon">⚠</div>
        <h3>${esc(title)}</h3>
        <p class="muted">${esc(message)}</p>
        <div class="confirm-actions">
          <button class="btn" onclick="closeModal()">Cancel</button>
          <button class="btn danger" id="custom-confirm-btn">${esc(confirmText)}</button>
        </div>
      </div>
    </div>`;
  document.getElementById('custom-confirm-btn').onclick = () => {
    closeModal();
    onConfirm();
  };
}

/* Custom Dropdown for Date/Time */
function renderCustomSelect(prefix, name, options, selectedVal) {
  return `
    <div class="dt-custom-select">
      <button type="button" class="dt-btn" onclick="toggleDtMenu('${prefix}-${name}')">
        <span id="${prefix}-${name}-label">${selectedVal.label}</span>
      </button>
      <div class="dt-menu" id="${prefix}-${name}-menu">
        ${options.map(o => `<div class="dt-item ${o.val == selectedVal.val ? 'active' : ''}" onclick="pickDtSelect('${prefix}-${name}', '${o.val}', '${o.label}')">${o.label}</div>`).join('')}
      </div>
      <input type="hidden" id="${prefix}-${name}" value="${selectedVal.val}">
    </div>
  `;
}

function toggleDtMenu(id) {
  document.querySelectorAll('.dt-menu').forEach(m => { if(m.id !== id+'-menu') m.classList.remove('show'); });
  const menu = document.getElementById(id+'-menu');
  if (menu) menu.classList.toggle('show');
  setTimeout(() => document.addEventListener('click', closeDtMenus), 10);
}

function pickDtSelect(id, val, label) {
  document.getElementById(id).value = val;
  document.getElementById(id+'-label').textContent = label;
  document.getElementById(id+'-menu').classList.remove('show');
}

function closeDtMenus(e) {
  if (!e.target.closest('.dt-custom-select')) {
    document.querySelectorAll('.dt-menu').forEach(m => m.classList.remove('show'));
    document.removeEventListener('click', closeDtMenus);
  }
}

function getDateFromSelectors(prefix) {
  const day    = Number(document.getElementById(`${prefix}-day`).value);
  const month  = Number(document.getElementById(`${prefix}-month`).value);
  const year   = Number(document.getElementById(`${prefix}-year`).value);
  const hour   = Number(document.getElementById(`${prefix}-hour`).value);
  const minute = Number(document.getElementById(`${prefix}-minute`).value);

  const d = new Date(year, month, day, hour, minute);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return d;
}

function renderDateTimePicker(prefix, dateObj) {
  const d = dateObj || new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const daysOpts = Array.from({length: 31}, (_, i) => ({ val: i+1, label: String(i+1).padStart(2, '0') }));
  const monthsOpts = months.map((m, i) => ({ val: i, label: m }));
  const currentYear = new Date().getFullYear();
  const yearsOpts = Array.from({length: 4}, (_, i) => ({ val: currentYear+i, label: currentYear+i }));
  const hoursOpts = Array.from({length: 24}, (_, i) => ({ val: i, label: String(i).padStart(2, '0') }));
  const minsOpts = Array.from({length: 60}, (_, i) => ({ val: i, label: String(i).padStart(2, '0') }));

  return `
    <div class="custom-datetime">
      <div class="dt-group">
        ${renderCustomSelect(prefix, 'day', daysOpts, { val: d.getDate(), label: String(d.getDate()).padStart(2, '0') })}
        ${renderCustomSelect(prefix, 'month', monthsOpts, { val: d.getMonth(), label: months[d.getMonth()] })}
        ${renderCustomSelect(prefix, 'year', yearsOpts, { val: d.getFullYear(), label: d.getFullYear() })}
      </div>
      <div class="dt-divider">at</div>
      <div class="dt-group">
        ${renderCustomSelect(prefix, 'hour', hoursOpts, { val: d.getHours(), label: String(d.getHours()).padStart(2, '0') })}
        <span class="dt-colon">:</span>
        ${renderCustomSelect(prefix, 'minute', minsOpts, { val: d.getMinutes(), label: String(d.getMinutes()).padStart(2, '0') })}
      </div>
    </div>
  `;
}

/* ---------- toast / theme / nav ---------- */
function toast(msg, type = 'success') {
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span class="toast-icon">${icons[type] || '✓'}</span><span>${esc(msg)}</span>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3400);
}
function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; render(); }
function setAuthMode(m) { state.authMode = m; render(); }
function toggleMenu() {
  document.getElementById('side-menu').classList.toggle('open');
  document.getElementById('menu-backdrop').classList.toggle('open');
}
function selectSite(site) {
  state.activeSite = site; state.view = 'site'; render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function go(view) {
  if (view === 'admin' && !isAdminUser()) return toast('Access denied.', 'error');
  state.view = view;
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('menu-backdrop').classList.remove('open');
  if (view === 'profile') await fetchBookings();
  if (view === 'admin') {
    await Promise.all([fetchUsers(), fetchAdmins(), fetchAuditLog(), fetchUpcomingEvents()]);
  }
  render();
}
function statusBadge(s) {
  const map = {
    open:['Open','accent'], won:['Won','accent'], lost:['Failed','mono'],
    pending:['Pending','outline'], confirmed:['Confirmed','mono'], refunded:['Refunded','mono']
  };
  const [label, cls] = map[s] || [s, 'outline'];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ---------- audit log ---------- */
async function logAdminAction(action, target, meta = {}) {
  try {
    await db.collection('auditLog').add({
      actorUid: state.userUid,
      actorEmail: state.session,
      action, target, meta,
      at: FieldValue.serverTimestamp()
    });
  } catch (e) { console.warn('audit log failed:', e.message); }
}
async function fetchAuditLog() {
  if (!isAdminUser()) return;
  try {
    const snap = await db.collection('auditLog').orderBy('at','desc').limit(20).get();
    state.auditLog = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('audit fetch:', e.message); }
}

function clearAuditLog() {
  if (!isAdminUser()) return toast('Access denied.', 'error');
  showConfirm('Clear Activity Logs', 'Are you sure you want to permanently delete ALL admin activity logs? This action cannot be undone.', 'Yes, Clear All', async () => {
    try {
      const snap = await db.collection('auditLog').get();
      if (snap.empty) {
        state.auditLog = [];
        render();
        return toast('No logs to clear.', 'info');
      }
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      state.auditLog = [];
      toast('Activity logs cleared.');
      render();
    } catch (e) {
      console.error(e);
      toast('Failed to clear logs.', 'error');
    }
  });
}

/* =========================================================
   Data fetch
   ========================================================= */
async function resolveAdminRole(uid) {
  try {
    const snap = await db.collection('admins').doc(uid).get();
    state.isAdmin   = snap.exists;
    state.adminData = snap.exists ? snap.data() : null;
  } catch (e) {
    state.isAdmin = false; state.adminData = null;
  }
}

async function fetchTickets() {
  try {
    const snap = await db.collection('tickets').get();
    state.tickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.premiumPicks = {};

    if (isPremiumUser()) {
      try {
        const ps = await db.collection('premiumPicks').get();
        ps.docs.forEach(d => { state.premiumPicks[d.id] = d.data().selections || []; });
        state.tickets.forEach(t => {
          if (isPremiumTicket(t)) t.selections = state.premiumPicks[t.id] || [];
        });
      } catch (e) { console.warn('picks denied:', e.message); }
    }
  } catch (error) {
    state.tickets = [];
  }
}

async function fetchBookings() {
  if (!state.userUid) return;
  try {
    const snap = isAdminUser()
      ? await db.collection('bookings').get()
      : await db.collection('bookings').where('userId','==',state.userUid).get();
    state.bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => b.createdAt - a.createdAt);
  } catch (e) { console.warn('bookings:', e.message); }
}

async function fetchUsers() {
  if (!isAdminUser()) return;
  try {
    const snap = await db.collection('users').get();
    state.usersList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('users:', e.message); }
}

async function fetchAdmins() {
  if (!isAdminUser()) return;
  try {
    const snap = await db.collection('admins').get();
    state.adminsList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn('admins:', e.message); }
}

async function fetchUpcomingEvents() {
  try {
    const snap = await db.collection('upcomingEvents').get();
    const now = Date.now();
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    state.upcomingEvents = all
      .filter(e => expiryMs(e.eventTime) > now)
      .sort((a, b) => expiryMs(a.eventTime) - expiryMs(b.eventTime));

    all
      .filter(e => expiryMs(e.eventTime) > 0 && expiryMs(e.eventTime) <= now)
      .forEach(e => db.collection('upcomingEvents').doc(e.id).delete().catch(() => {}));
  } catch (err) {
    console.warn('upcomingEvents:', err.message);
    state.upcomingEvents = [];
  }
}

/* =========================================================
   Render engine
   ========================================================= */
function render() {
  document.documentElement.dataset.theme = state.theme;
  const navSites = document.getElementById('nav-sites');
  const headEl   = document.getElementById('head-right');
  const appEl    = document.getElementById('app');

  if (!state.session) {
    navSites.innerHTML = '';
    headEl.innerHTML = `<button class="theme-btn" onclick="toggleTheme()">${state.theme === 'dark' ? '☀' : '☾'}</button>`;
    appEl.innerHTML = viewAuth();
    return;
  }

  const hasOthersTickets = state.tickets.some(t => !SITES.includes(t.site));
  const showOthers = hasOthersTickets || isAdminUser() || state.activeSite === OTHERS;
  const allTabs = showOthers ? [...SITES, OTHERS] : SITES;

  navSites.innerHTML = allTabs.map(s =>
    `<button class="${state.view === 'site' && state.activeSite === s ? 'active' : ''}" onclick="selectSite('${s}')">${s}</button>`
  ).join('');

  const initial = state.userData && state.userData.name ? state.userData.name.charAt(0).toUpperCase() : 'U';
  headEl.innerHTML = `
    <button class="theme-btn" onclick="toggleTheme()">${state.theme === 'dark' ? '☀' : '☾'}</button>
    <button class="gmail-avatar" onclick="toggleMenu()" title="Account">${initial}</button>`;

  document.getElementById('sm-avatar').textContent = initial;
  document.getElementById('sm-name').textContent  = state.userData && state.userData.name ? state.userData.name : 'User';
  document.getElementById('sm-email').textContent = state.userData && state.userData.email ? state.userData.email : '';
  document.getElementById('sm-admin-link').style.display = isAdminUser() ? 'flex' : 'none';

  const tierEl = document.getElementById('sm-tier');
  if (tierEl) {
    if (isMasterAdmin()) {
      tierEl.textContent = '🛡 Master Admin';
      tierEl.className = 'sm-tier premium';
    } else if (isAdminUser()) {
      tierEl.textContent = '🛡 Administrator';
      tierEl.className = 'sm-tier premium';
    } else if (isPremiumUser()) {
      tierEl.textContent = `★ Premium · ${premiumLeftLabel(state.userData) || 'Active'}`;
      tierEl.className = 'sm-tier premium';
    } else {
      tierEl.textContent = 'Free Account';
      tierEl.className = 'sm-tier';
    }
  }

  if (state.view === 'site')         appEl.innerHTML = viewSiteTickets();
  else if (state.view === 'profile') { appEl.innerHTML = viewProfile(); renderBookingsList(); }
  else if (state.view === 'admin')   appEl.innerHTML = viewAdmin();

  scheduleExpiryRefresh();
  scheduleEventCleanup();
}

/* =========================================================
   Auth
   ========================================================= */
function viewAuth() {
  const mode = state.authMode || 'login';
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-head">
        <div class="logo lg">M</div>
        <h1 class="logo-text">Mofiebet</h1>
        <p class="muted" style="margin-top:8px">Private betting network</p>
      </div>
      <div class="tabs">
        <button class="${mode === 'login' ? 'on' : ''}" onclick="setAuthMode('login')">Log in</button>
        <button class="${mode === 'signup' ? 'on' : ''}" onclick="setAuthMode('signup')">Create account</button>
      </div>
      ${mode === 'login' ? loginForm() : signupForm()}
    </div>
  </div>`;
}

function loginForm() {
  return `<form onsubmit="doLogin(event)">
    <label>Email address<input id="li-email" type="email" required placeholder="you@email.com"></label>
    <label>Password<input id="li-pass" type="password" required placeholder="Your password"></label>
    <button class="btn primary wide" type="submit">Continue</button>
  </form>`;
}

function signupForm() {
  return `<form onsubmit="doSignup(event)">
    <label>Full name<input id="su-name" required placeholder="Alex Morgan"></label>
    <div class="row">
      <label>Email<input id="su-email" type="email" required placeholder="you@email.com"></label>
      <label>Phone<input id="su-phone" required placeholder="+256 700 000000"></label>
    </div>
    <label>Password<input id="su-pass" type="password" required minlength="6" placeholder="At least 6 characters"></label>
    <label>Confirm password<input id="su-pass2" type="password" required minlength="6" placeholder="Repeat password"></label>
    <button class="btn primary wide" type="submit">Create account</button>
  </form>`;
}

function doLogin(e) {
  e.preventDefault();
  auth.signInWithEmailAndPassword(
    document.getElementById('li-email').value.trim(),
    document.getElementById('li-pass').value
  ).then(() => toast('Logged in!'))
   .catch(error => toast(error.message.replace('Firebase: ', ''), 'error'));
}

function doSignup(e) {
  e.preventDefault();
  const name  = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const pass  = document.getElementById('su-pass').value;
  const pass2 = document.getElementById('su-pass2').value;
  if (pass !== pass2) return toast('Passwords do not match.', 'error');

  auth.createUserWithEmailAndPassword(email, pass)
    .then(cred => db.collection('users').doc(cred.user.uid).set({
      name, email, phone,
      isApproved: false,
      premiumRequested: false,
      createdAt: Date.now()
    }))
    .then(() => toast('Account created successfully!'))
    .catch(error => toast(error.message.replace('Firebase: ', ''), 'error'));
}

function logout() {
  auth.signOut().then(() => {
    if (_userUnsub) { _userUnsub(); _userUnsub = null; }
    clearTimeout(_expiryTimer);
    clearTimeout(_eventTimer);
    state.session = null; state.userUid = null; state.userData = null;
    state.isAdmin = false; state.adminData = null;
    state.adminsList = []; state.premiumPicks = {}; state.auditLog = [];
    state.upcomingEvents = [];
    isAdminVerified = false;
    toggleMenu();
    toast('Signed out.');
  });
}

/* =========================================================
   Premium & Tickets
   ========================================================= */

/* Modal: two-step payment verification flow. */
function openPremiumModal() {
  if (isPremiumUser()) return;
  const requested = !!(state.userData && state.userData.premiumRequested);
  const oldTxId   = (state.userData && state.userData.premiumTxId)   || '';
  const oldPhone  = (state.userData && state.userData.premiumPayPhone) || '';

  document.getElementById('modal-root').innerHTML = `
  <div class="backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal premium-flow-modal">
      <button class="x" onclick="closeModal()">✕</button>
      
      <div class="premium-flow-head">
        <div class="premium-hero">★</div>
        <h3>Premium Access <span class="badge premium sm-badge">24h</span></h3>
        <p class="muted">Unlock premium picks instantly.</p>
      </div>

      ${requested ? `
        <div class="pending-state">
          <div class="request-note">
            <span class="spinner">⏳</span> Verifying payment...
          </div>
          <div class="receipt-box">
            <div class="receipt-row"><span>Tx ID</span><b>${esc(oldTxId)}</b></div>
            <div class="receipt-row"><span>Phone</span><b>${esc(oldPhone)}</b></div>
          </div>
          <p class="muted" style="font-size:11px; text-align:center; margin-top:12px;">
            Admin will activate your account shortly.
          </p>
        </div>
      ` : `
        <div class="flow-step">
          <div class="flow-step-header">
            <span class="flow-num">1</span> Send Payment
          </div>
          <div class="pay-info-box">
            <div class="pi-phone" onclick="copyText('${PREMIUM_PHONE_RAW}', this)" title="Click to copy">
              ${PREMIUM_PHONE} <span class="copy-icon">📋</span>
            </div>
            <p class="pi-payee">Names: <b>${PREMIUM_PAYEE}</b></p>
          </div>
        </div>

        <div class="flow-step">
          <div class="flow-step-header">
            <span class="flow-num">2</span> Enter Details
          </div>
          <form id="premium-verify-form" onsubmit="requestPremium(event)">
            <label>Transaction ID
              <input id="pm-txid" required placeholder="e.g. MP250713..." autocomplete="off">
            </label>
            <label>Phone used to pay
              <input id="pm-phone" required placeholder="+256 7XX XXX XXX" autocomplete="off">
            </label>
            <button class="btn premium-btn wide" type="submit" id="pm-request-btn" disabled style="padding: 10px; font-size: 13px;">
              Request Access
            </button>
          </form>
        </div>
      `}

      <div class="premium-flow-footer">
        Support: <b>${SUPPORT_PHONE}</b>
      </div>
    </div>
  </div>`;

  if (!requested) {
    const txEl = document.getElementById('pm-txid');
    const phEl = document.getElementById('pm-phone');
    const btn  = document.getElementById('pm-request-btn');
    const sync = () => { btn.disabled = !(txEl.value.trim() && phEl.value.trim()); };
    txEl.addEventListener('input', sync);
    phEl.addEventListener('input', sync);
  }
}

/* Helper to copy text */
function copyText(text, element) {
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = element.innerHTML;
    element.innerHTML = `Copied! <span class="copy-icon">✓</span>`;
    element.classList.add('copied');
    setTimeout(() => {
      element.innerHTML = originalHTML;
      element.classList.remove('copied');
    }, 2000);
  }).catch(() => toast('Failed to copy', 'error'));
}

function requestPremium(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!state.userUid) return;

  const txId  = (document.getElementById('pm-txid')?.value  || '').trim();
  const phone = (document.getElementById('pm-phone')?.value || '').trim();
  if (txId.length  < 4)  return toast('Enter a valid transaction ID.',       'error');
  if (phone.length < 7)  return toast('Enter the phone number used to pay.', 'error');

  const payload = {
    premiumRequested:   true,
    premiumTxId:        txId,
    premiumPayPhone:    phone,
    premiumRequestedAt: Date.now()
  };

  db.collection('users').doc(state.userUid).set(payload, { merge: true })
    .then(() => {
      Object.assign(state.userData, payload);
      closeModal();
      toast('Premium request sent. Admin will verify your payment.');
      render();
    })
    .catch(err => { console.error(err); toast('Could not send request.', 'error'); });
}

function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ---------- upcoming events banner (public) ---------- */
function viewUpcomingBanner() {
  if (!state.upcomingEvents.length) return '';
  const admin = isAdminUser();

  return `
  <div class="upcoming-banner">
    <div class="upcoming-label">
      <span class="up-dot"></span> Upcoming
    </div>
    <div class="upcoming-scroll">
      ${state.upcomingEvents.map(e => {
        const d = new Date(expiryMs(e.eventTime));
        const day = formatEventDay(d);
        const time = formatEventTime(d);
        const click = admin ? `onclick="openEventModal('${e.id}')"` : '';
        return `
          <div class="upcoming-chip ${admin ? 'admin-chip' : ''}" ${click} title="${admin ? 'Click to edit' : ''}">
            <span class="uc-match">${esc(e.match)}</span>
            <span class="uc-meta"><b>${esc(day)}</b> · ${time} · ${esc(e.site)}</span>
            ${admin ? `<button class="uc-del" onclick="event.stopPropagation(); deleteUpcomingEvent('${e.id}')" title="Delete event">✕</button>` : ''}
          </div>`;
      }).join('')}
    </div>
  </div>`;
}

function viewSiteTickets() {
  let list = state.activeSite === OTHERS
    ? state.tickets.filter(t => !SITES.includes(t.site))
    : state.tickets.filter(t => t.site === state.activeSite);

  list = [...list].sort((a, b) => (isPremiumTicket(a) ? 1 : 0) - (isPremiumTicket(b) ? 1 : 0));

  const heading = state.activeSite === OTHERS ? 'Other Sites' : esc(state.activeSite);
  const subtitle = state.activeSite === OTHERS
    ? 'Custom-site selections posted by Mofiebet.'
    : 'Selections posted by Mofiebet.';

  return `
  <div class="page-head" style="margin-top:10px;">
    <div>
      <h2>${heading} Tickets</h2>
      <p class="muted">${subtitle}</p>
    </div>
  </div>
  ${viewUpcomingBanner()}
  ${!isPremiumUser() ? `<div class="premium-banner" onclick="openPremiumModal()"><span class="pb-star">★</span><div><strong>Go Premium — 24h Access</strong><p>Unlock premium picks across every betting site for a day.</p></div><span class="pb-arrow">→</span></div>` : ''}
  <div class="grid">
    ${list.length > 0
      ? list.map(ticketCard).join('')
      : `<div class="empty" style="grid-column: 1 / -1;">
           <b>No tickets available.</b>
           <p>Check back later for new selections.</p>
         </div>`}
  </div>`;
}

function ticketCard(t) {
  const avail    = isTicketAvailable(t);
  const premium  = isPremiumTicket(t);
  const unlocked = canAccessTicket(t);
  const count    = t.selectionCount || (t.selections ? t.selections.length : 1);

  let selectionsHtml;
  if (!premium) {
    selectionsHtml = (t.selections || []).map(s =>
      `<li><span>${esc(s.match)}</span><em>${esc(s.pick)}</em><b>${Number(s.odds).toFixed(2)}</b></li>`
    ).join('');
  } else if (unlocked && t.selections && t.selections.length) {
    selectionsHtml = t.selections.map(s =>
      `<li><span>${esc(s.match)}</span><em>${esc(s.pick)}</em><b>${Number(s.odds).toFixed(2)}</b></li>`
    ).join('');
  } else {
    selectionsHtml = Array.from({ length: Math.max(1, count) }).map(() => `
      <li class="locked-pick" onclick="openPremiumModal()">
        <span>🔒 Premium pick</span>
        <em>Unlock to view</em>
        <b>—</b>
      </li>`).join('');
  }

  return `
  <article class="ticket ${premium ? 'premium-ticket' : ''}">
    <div class="ticket-top">
      <span class="league">${esc(t.site)}</span>
      <div class="ticket-badges">
        ${premium ? `<span class="badge premium">★ Premium</span>` : ''}
        ${statusBadge(t.status)}
      </div>
    </div>
    <h4>${esc(t.title)}</h4>
    <ul class="selections">${selectionsHtml}</ul>
    <div class="ticket-meta">
      <div><small>Total odds</small><b>${Number(t.odds).toFixed(2)}</b></div>
      <div><small>Price</small><b>${money(t.price)}</b></div>
      <div><small>Kickoff</small><b>${esc(t.kickoff)}</b></div>
    </div>
    <div class="ticket-foot">
      <span class="sold">${t.sold || 0}/${t.cap || 50} booked</span>
      <div style="display:flex; gap:6px; align-items:center;">
        ${isAdminUser() ? `<button class="btn danger sm" onclick="deleteTicket('${t.id}')" title="Delete Ticket">Delete</button>` : ''}
        ${!avail
          ? `<span class="closed">Sold out</span>`
          : !unlocked
            ? `<button class="btn premium-btn sm" onclick="openPremiumModal()">🔒 Unlock</button>`
            : `<button class="btn primary sm" onclick="openBooking('${t.id}')">Book</button>`}
      </div>
    </div>
  </article>`;
}

async function deleteTicket(id) {
  if (!isAdminUser()) return;
  showConfirm('Delete Ticket', 'Are you sure you want to permanently delete this ticket?', 'Delete', async () => {
    try {
      await db.collection('tickets').doc(id).delete();
      try { await db.collection('premiumPicks').doc(id).delete(); } catch(e) {}
      await logAdminAction('deleteTicket', id);
      toast('Ticket deleted successfully.');
      await fetchTickets();
      render();
    } catch (err) {
      console.error(err);
      toast('Error deleting ticket.', 'error');
    }
  });
}

/* =========================================================
   Booking
   ========================================================= */
function openBooking(id) {
  const t = state.tickets.find(x => x.id === id);
  if (!t || t.status !== 'open') return;

  if (isPremiumTicket(t) && !isPremiumUser()) {
    toast('Premium ticket — upgrade to book.', 'info');
    return openPremiumModal();
  }

  const maxQty = Math.min(10, remainingSlots(t));
  if (maxQty < 1) return toast('Sold out.', 'error');

  document.getElementById('modal-root').innerHTML = `
  <div class="backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <button class="x" onclick="closeModal()">✕</button>
      <h3>Book Ticket</h3>
      <p class="muted" style="margin-bottom:14px">${esc(t.title)} · ${esc(t.site)}${isPremiumTicket(t) ? ' · ★ Premium' : ''}</p>
      <form id="book-form">
        <label>Full name<input id="f-name" required value="${esc(state.userData.name)}"></label>
        <label>Phone<input id="f-phone" required value="${esc(state.userData.phone || '')}"></label>
        <label>Number of slips<input id="f-qty" type="number" min="1" max="${maxQty}" value="1" required></label>
        <div class="total"><span>Total to pay</span><b id="f-total">${money(t.price)}</b></div>
        <button class="btn primary" type="submit">Confirm booking</button>
      </form>
    </div>
  </div>`;

  const qtyEl = document.getElementById('f-qty');
  qtyEl.addEventListener('input', () => {
    document.getElementById('f-total').textContent =
      money(t.price * Math.max(1, Math.min(maxQty, Number(qtyEl.value) || 1)));
  });

  document.getElementById('book-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const qty = Math.max(1, Math.min(maxQty, Number(qtyEl.value) || 1));
    const ref = newRef();
    const bookingData = {
      ref, ticketId: t.id, ticketTitle: t.title, site: t.site, odds: t.odds,
      userId: state.userUid, name: document.getElementById('f-name').value.trim(),
      email: state.userData.email, phone: document.getElementById('f-phone').value.trim(), qty,
      amount: t.price * qty, status: 'pending', createdAt: Date.now(), refund: null,
      replies: [{ from: 'system', text: `Booking ${ref} received. Analysts will confirm shortly.`, at: Date.now() }]
    };

    db.collection('bookings').add(bookingData)
      .then(() => db.collection('tickets').doc(t.id).update({ sold: FieldValue.increment(qty) }))
      .then(() => { closeModal(); go('profile'); toast('Booking confirmed!'); fetchTickets(); })
      .catch((err) => { console.warn(err); toast('Error booking ticket', 'error'); });
  });
}

/* =========================================================
   Profile
   ========================================================= */
function viewProfile() {
  const premium = isPremiumUser();
  const admin   = isAdminUser();
  const pending = !premium && !!(state.userData && state.userData.premiumRequested);

  let title = 'Free Account';
  let desc  = 'Upgrade to unlock premium picks across every site.';
  let action = `<button class="btn premium-btn sm" onclick="openPremiumModal()">Upgrade</button>`;

  if (isMasterAdmin()) {
    title = '🛡 Master Administrator';
    desc  = 'You have full administrative privileges.';
    action = `<span class="badge premium">Master</span>`;
  } else if (admin) {
    title = '🛡 Administrator';
    desc  = 'You have administrative privileges.';
    action = `<span class="badge admin">Admin</span>`;
  } else if (premium) {
    title = '★ Premium Member';
    desc  = `Access expires in <b>${premiumLeftLabel(state.userData)}</b>.`;
    action = `<span class="badge premium">Active</span>`;
  } else if (pending) {
    action = `<span class="badge">Request pending</span>`;
  }

  return `
  <div class="page-head">
    <div><h2>My Profile</h2><p class="muted">${esc(state.userData.email)}</p></div>
  </div>

  <div class="panel">
    <div class="membership-row">
      <div>
        <strong>${title}</strong>
        <p class="muted">${desc}</p>
      </div>
      ${action}
    </div>
  </div>

  <div class="panel">
    <h3>Personal Details</h3>
    <form onsubmit="saveProfile(event)">
      <div class="row">
        <label>Full name<input id="pf-name" value="${esc(state.userData.name)}" required></label>
        <label>Phone<input id="pf-phone" value="${esc(state.userData.phone || '')}" required></label>
      </div>
      <button class="btn primary sm" type="submit">Save Changes</button>
    </form>
  </div>

  <div class="panel">
    <h3>My Bookings</h3>
    <div style="margin-bottom:16px;">
      <input id="search-input" placeholder="Search by reference or ticket name..." oninput="onSearchInput(this.value)">
    </div>
    <div id="bookings-list"></div>
  </div>`;
}

function saveProfile(e) {
  e.preventDefault();
  const name  = document.getElementById('pf-name').value.trim();
  const phone = document.getElementById('pf-phone').value.trim();
  db.collection('users').doc(state.userUid).set({ name, phone }, { merge: true })
    .then(() => { state.userData.name = name; state.userData.phone = phone; render(); toast('Profile updated.'); })
    .catch(() => toast('Failed to update profile', 'error'));
}

let _searchTimer = null;
function onSearchInput(v) {
  state.search = v;
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderBookingsList, 140);
}

function renderBookingsList() {
  const el = document.getElementById('bookings-list');
  if (!el) return;
  const q = (state.search || '').trim().toLowerCase();
  let list = state.bookings;
  if (q) list = list.filter(b =>
    (b.ref || '').toLowerCase().includes(q) || (b.ticketTitle || '').toLowerCase().includes(q));

  if (!list.length) {
    el.innerHTML = `<div class="empty"><b>No bookings found</b><p>Book a ticket and it will appear here.</p></div>`;
    return;
  }
  el.innerHTML = list.map(b => `
    <article class="booking">
      <div class="booking-head">
        <div><h4>${esc(b.ticketTitle)}</h4><span class="ref">${esc(b.ref)} · ${esc(b.site)}</span></div>
        ${statusBadge(b.status)}
      </div>
      <div class="booking-meta">
        <div><small>Slips</small><b>${b.qty}</b></div>
        <div><small>Paid</small><b>${money(b.amount)}</b></div>
        <div><small>Booked</small><b>${fmtTime(b.createdAt)}</b></div>
      </div>
      ${b.refund ? `<div class="refund-box"><span>💸</span><div>Refund of <b>${money(b.refund.amount)}</b></div></div>` : ''}
      <div class="thread">
        ${(b.replies || []).map(r => `<div class="reply ${r.from}"><span class="who">${r.from === 'admin' ? 'Mofiebet' : r.from === 'system' ? 'System' : 'You'}</span><p>${esc(r.text)}</p></div>`).join('')}
      </div>
    </article>`).join('');
}

/* =========================================================
   Admin dashboard
   ========================================================= */
function viewAdmin() {
  if (!isAdminUser()) {
    return `<div class="empty"><b>Access denied</b></div>`;
  }
  if (!isAdminVerified) {
    return `<div class="auth-wrap"><div class="auth-card" style="text-align:center;">
      <div class="logo lg">🛡</div>
      <h2>Administrator Access</h2>
      <p class="muted" style="margin:10px 0 20px;">You're signed in as an administrator. Open the dashboard to manage tickets, users, and premium access.</p>
      <button class="btn primary wide" onclick="isAdminVerified=true; render();">Open Dashboard</button>
    </div></div>`;
  }

  return `
  <div class="page-head">
    <div><h2>Admin Dashboard ${isMasterAdmin() ? '· Master' : ''}</h2></div>
    <button class="btn danger sm" onclick="lockAdmin()">Lock</button>
  </div>

  <div class="panel">
    <h3>🛡 Administrators</h3>
    <p class="muted" style="font-size:12px; margin-bottom:12px;">All admins have full authority. You cannot remove the Master Admin.</p>
    <div class="admin-list">
      ${state.adminsList.map(a => `
        <div class="admin-item">
          <div class="info">
            <strong>${esc(a.email || a.id)} ${a.master ? '· Master' : ''}</strong>
            <span>${a.master ? 'Master Administrator' : 'Administrator'}</span>
          </div>
          <div class="admin-actions">
            ${a.master
              ? `<span class="badge premium">Master</span>`
              : `<button class="btn sm danger" onclick="removeAdmin('${a.id}')">Remove Admin</button>`}
          </div>
        </div>`).join('') || '<p class="muted">No admins besides you.</p>'}
    </div>
    <div class="add-admin-row">
      <input id="new-admin-email" placeholder="user@email.com">
      <button class="btn primary sm" onclick="addAdminByEmail()">Add Admin</button>
    </div>
  </div>

  <div class="panel">
    <h3>👥 Users · Premium Access</h3>
    <p class="muted" style="font-size:12px; margin-bottom:12px;">
      Users pay to <b>${PREMIUM_PHONE}</b> (${PREMIUM_PAYEE}) then submit their transaction ID &amp; phone.
      Verify against your MoMo records, then grant access.
    </p>
    <div class="admin-list">
      ${state.usersList.map(u => {
        const isSelf        = u.id === state.userUid;
        const isTargetAdmin = isAdminId(u.id);
        const targetMaster  = (state.adminsList.find(a => a.id === u.id) || {}).master === true;
        const prem          = userIsPremium(u);
        const left          = prem ? premiumLeftLabel(u) : '';

        let statusLabel = 'Free Account';
        if (prem) statusLabel = `★ Premium (${left})`;
        else if (u.premiumRequested) statusLabel = '⏳ Premium Requested';

        let actions = '';
        if (targetMaster) {
          actions = `<span class="badge premium">Master</span>`;
        } else {
          let premiumBtn;
          if (prem) {
            premiumBtn = `<button class="btn sm danger" onclick="revokePremium('${u.id}')">Remove Premium</button>`;
          } else if (u.premiumRequested) {
            premiumBtn = `<button class="btn sm primary" onclick="grantPremium('${u.id}')">Approve &amp; Grant Premium</button>`;
          } else {
            premiumBtn = `<button class="btn sm premium-btn" onclick="grantPremium('${u.id}')">Grant 24h Premium</button>`;
          }
          actions = `
            ${premiumBtn}
            ${isTargetAdmin
              ? `<button class="btn sm danger" onclick="removeAdmin('${u.id}')">Remove Admin</button>`
              : `<button class="btn sm" onclick="addAdmin('${u.id}')">Make Admin</button>`}`;
        }

        return `
        <div class="admin-item">
          <div class="info">
            <strong>${esc(u.name || 'Unnamed')}${isSelf ? ' (You)' : ''}</strong>
            <span>${esc(u.email)} · ${statusLabel}${isTargetAdmin ? ' · 🛡 Admin' : ''}</span>

            ${u.premiumRequested && !prem ? `
              <div class="premium-verify-info">
                <div class="pv-row"><span>Transaction ID</span><b>${esc(u.premiumTxId || '—')}</b></div>
                <div class="pv-row"><span>Phone used</span><b>${esc(u.premiumPayPhone || '—')}</b></div>
                ${u.premiumRequestedAt ? `<div class="pv-row"><span>Requested</span><b>${fmtTime(u.premiumRequestedAt)}</b></div>` : ''}
                <div class="pv-hint">Verify against MoMo records, then tap <b>Approve</b>.</div>
              </div>` : ''}
          </div>
          <div class="admin-actions">${actions}</div>
        </div>`;
      }).join('') || '<p class="muted">No users found.</p>'}
    </div>
  </div>

  <div class="panel">
    <h3>🎫 Post New Ticket</h3>
    <form onsubmit="publishTicket(event)">
      <div class="row">
        <label>Betting Site
          <div class="custom-dropdown" id="site-dropdown-wrapper">
            <button type="button" class="dropdown-btn" id="site-dropdown-btn" onclick="toggleSiteDropdown(event)">
              <span id="nt-site-label">${SITES[0]}</span>
              <span class="chevron">▼</span>
            </button>
            <div class="dropdown-menu" id="site-dropdown-menu">
              ${SITES.map(s => `<button type="button" class="dropdown-item ${s === SITES[0] ? 'active' : ''}" onclick="selectSiteOption('${s}', this)">${s}</button>`).join('')}
              <button type="button" class="dropdown-item" onclick="selectSiteOption('${OTHERS_SENTINEL}', this)">Others…</button>
            </div>
            <input type="hidden" id="nt-site" value="${SITES[0]}">
          </div>
        </label>
        <label>League<input id="nt-league" placeholder="Premier League" required></label>
      </div>
      <label id="nt-custom-site-wrap" style="display:none;">Custom Site Name
        <input id="nt-custom-site" placeholder="e.g. Mozzart Bet" type="text">
      </label>
      <label>Title<input id="nt-title" placeholder="Weekend Banker" required></label>

      <label>Access Level
        <div class="segmented">
          <button type="button" id="tier-free" class="seg ${state.newTicketTier !== 'premium' ? 'on' : ''}" onclick="setNewTicketTier('free')">Free</button>
          <button type="button" id="tier-premium" class="seg ${state.newTicketTier === 'premium' ? 'on' : ''}" onclick="setNewTicketTier('premium')">★ Premium</button>
        </div>
      </label>

      <label>Odds / Price
        <div class="row">
          <input id="nt-odds" type="number" step="0.01" placeholder="Total Odds" required>
          <input id="nt-price" type="number" placeholder="Price (UGX)" required>
        </div>
      </label>
      <label>Selections (Match | Pick | Odds)
        <textarea id="nt-selections" placeholder="Arsenal vs Chelsea | Arsenal win | 1.75" required></textarea>
      </label>
      <button class="btn primary wide" type="submit" style="margin-top:10px;">Post Ticket</button>
    </form>
  </div>

  <div class="panel">
    <h3>📅 Upcoming Events Banner</h3>
    <p class="muted" style="font-size:12px; margin-bottom:12px;">
      These appear as a compact alert bar on the ticket pages. Expired events auto-delete permanently.
    </p>

    <form onsubmit="publishUpcomingEvent(event)">
      <div class="row">
        <label>Match / Event<input id="ue-match" placeholder="Arsenal vs Chelsea" required></label>
        <label>Betting Site<input id="ue-site" placeholder="Betpawa" required value="${SITES[0]}"></label>
      </div>
      <label>Date &amp; Time</label>
      ${renderDateTimePicker('ue', new Date())}
      <button class="btn primary wide" type="submit" style="margin-top:6px;">Post Upcoming Event</button>
    </form>

<div class="admin-list" style="margin-top:14px;">
      ${state.upcomingEvents.length
        ? state.upcomingEvents.map(e => {
            const d = new Date(expiryMs(e.eventTime));
            const day = formatEventDay(d);
            const time = formatEventTime(d);
            return `
            <div class="admin-item">
              <div class="info">
                <strong>${esc(e.match)}</strong>
                <span>${esc(day)} · ${time} · ${esc(e.site)}</span>
              </div>
              <div class="admin-actions">
                <button class="btn sm" onclick="openEventModal('${e.id}')">Edit</button>
                <button class="btn sm danger" onclick="deleteUpcomingEvent('${e.id}')">Delete</button>
              </div>
            </div>`;
          }).join('')
        : '<p class="muted">No upcoming events posted.</p>'}
    </div>
  </div>

  <div class="panel">
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
      <h3 style="margin:0;">📜 Recent Admin Actions</h3>
      <button class="btn sm danger" onclick="clearAuditLog()" title="Wipe all admin activity logs (tickets are NOT affected)">Clear Logs</button>
    </div>
    ${state.auditLog.length
      ? `<div class="audit-list">${state.auditLog.map(a => `
          <div class="audit-item">
            <div class="ai-action">${esc(a.action)}</div>
            <div class="ai-meta">${esc(a.actorEmail || a.actorUid)} → ${esc(a.target || '—')} · ${a.at ? fmtTime(a.at.toMillis ? a.at.toMillis() : a.at) : ''}</div>
          </div>`).join('')}</div>`
      : `<p class="muted">No actions logged yet.</p>`}
  </div>`;
}

function lockAdmin() { isAdminVerified = false; go('site'); }

/* ---------- admin: premium / admins ---------- */
async function grantPremium(userId) {
  try {
    const u = state.usersList.find(x => x.id === userId) || {};
    const expiry = new Date(Date.now() + PREMIUM_MS);
    await db.collection('users').doc(userId).set({
      premiumExpiry:      expiry,
      premiumRequested:   false,
      premiumTxId:        FieldValue.delete(),
      premiumPayPhone:    FieldValue.delete(),
      premiumRequestedAt: FieldValue.delete()
    }, { merge: true });
    await logAdminAction('grantPremium24h', userId, {
      expiry: expiry.toISOString(),
      txId:   u.premiumTxId    || null,
      phone:  u.premiumPayPhone || null
    });
    toast('Premium activated for 24 hours.');
    await fetchUsers(); render();
  } catch (e) { toast('Error activating premium.', 'error'); }
}

async function revokePremium(userId) {
  try {
    await db.collection('users').doc(userId).update({
      premiumExpiry:      FieldValue.delete(),
      premiumRequested:   false,
      premiumTxId:        FieldValue.delete(),
      premiumPayPhone:    FieldValue.delete(),
      premiumRequestedAt: FieldValue.delete()
    });
    await logAdminAction('revokePremium', userId);
    toast('Premium revoked.');
    await fetchUsers(); render();
  } catch (e) { toast('Error revoking premium.', 'error'); }
}

async function addAdmin(userId) {
  if (!isAdminUser()) return toast('Access denied.', 'error');
  try {
    const u = state.usersList.find(x => x.id === userId) || {};
    await db.collection('admins').doc(userId).set({
      email: u.email || '',
      master: false,
      addedAt: Date.now()
    });
    await logAdminAction('addAdmin', userId, { email: u.email });
    toast('Administrator added.');
    await Promise.all([fetchAdmins(), fetchUsers()]); render();
  } catch (e) { toast('Error adding administrator.', 'error'); }
}

async function addAdminByEmail() {
  const email = (document.getElementById('new-admin-email')?.value || '').trim().toLowerCase();
  if (!email) return toast('Enter an email.', 'error');
  const u = state.usersList.find(x => (x.email || '').toLowerCase() === email);
  if (!u) return toast('No user found with that email.', 'error');
  if (isAdminId(u.id)) return toast('Already an admin.', 'info');
  addAdmin(u.id);
}

async function removeAdmin(userId) {
  if (!isAdminUser()) return toast('Access denied.', 'error');
  const target = state.adminsList.find(a => a.id === userId);
  if (target && target.master) return toast('Cannot remove the Master admin.', 'error');

  try {
    await db.collection('admins').doc(userId).delete();
    await logAdminAction('removeAdmin', userId);
    toast('Administrator removed.');
    await Promise.all([fetchAdmins(), fetchUsers()]); render();
  } catch (e) { toast('Error removing administrator.', 'error'); }
}

/* ---------- admin: upcoming events CRUD ---------- */
function openEventModal(id) {
  if (!isAdminUser()) return;
  const e = state.upcomingEvents.find(x => x.id === id);
  if (!e) return;

  const eventDate = new Date(expiryMs(e.eventTime));

  document.getElementById('modal-root').innerHTML = `
  <div class="backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <button class="x" onclick="closeModal()">✕</button>
      <h3>Edit Upcoming Event</h3>
      <p class="muted" style="margin-bottom:14px; font-size:12px;">Update match details or reschedule — changes appear instantly on every user's banner.</p>
      <form onsubmit="updateUpcomingEvent(event, '${id}')">
        <label>Match / Event<input id="ue-edit-match" required value="${esc(e.match)}"></label>
        <label>Betting Site<input id="ue-edit-site" required value="${esc(e.site)}"></label>
        <label>Date &amp; Time</label>
        ${renderDateTimePicker('ue-edit', eventDate)}
        <button class="btn primary wide" type="submit" style="margin-top:12px;">Save Changes</button>
      </form>
    </div>
  </div>`;
}

async function publishUpcomingEvent(e) {
  e.preventDefault();
  const match = document.getElementById('ue-match').value.trim();
  const site  = document.getElementById('ue-site').value.trim();
  if (!match || !site) return toast('Fill in all fields.', 'error');

  const eventTime = getDateFromSelectors('ue');
  if (!eventTime) return toast('Invalid date selected.', 'error');
  if (eventTime.getTime() <= Date.now()) return toast('Event must be in the future.', 'error');

  try {
    await db.collection('upcomingEvents').add({
      match, site,
      eventTime,
      createdBy: state.userUid,
      createdAt: Date.now()
    });
    await logAdminAction('publishEvent', match, { site, eventTime: eventTime.toISOString() });
    toast('Upcoming event posted!');
    await fetchUpcomingEvents();
    render();
  } catch (err) {
    console.error(err);
    toast('Failed to post event.', 'error');
  }
}

async function updateUpcomingEvent(e, id) {
  e.preventDefault();
  const match = document.getElementById('ue-edit-match').value.trim();
  const site  = document.getElementById('ue-edit-site').value.trim();
  if (!match || !site) return toast('Fill in all fields.', 'error');

  const eventTime = getDateFromSelectors('ue-edit');
  if (!eventTime) return toast('Invalid date selected.', 'error');

  try {
    await db.collection('upcomingEvents').doc(id).update({ match, site, eventTime });
    await logAdminAction('updateEvent', id, { match, site, eventTime: eventTime.toISOString() });
    closeModal();
    toast('Event updated.');
    await fetchUpcomingEvents();
    render();
  } catch (err) {
    console.error(err);
    toast('Failed to update event.', 'error');
  }
}

async function deleteUpcomingEvent(id) {
  if (!isAdminUser()) return;
  showConfirm('Delete Event', 'Delete this upcoming event permanently? It will be removed from the banner immediately.', 'Delete', async () => {
    try {
      await db.collection('upcomingEvents').doc(id).delete();
      await logAdminAction('deleteEvent', id);
      toast('Event deleted.');
      await fetchUpcomingEvents();
      render();
    } catch (err) {
      toast('Failed to delete event.', 'error');
    }
  });
}

/* ---------- admin: ticket publishing ---------- */
function setNewTicketTier(tier) {
  state.newTicketTier = tier;
  document.getElementById('tier-free')?.classList.toggle('on', tier === 'free');
  document.getElementById('tier-premium')?.classList.toggle('on', tier === 'premium');
}

async function publishTicket(e) {
  e.preventDefault();

  const siteValue = document.getElementById('nt-site').value;
  let site;
  if (siteValue === OTHERS_SENTINEL) {
    site = (document.getElementById('nt-custom-site')?.value || '').trim();
    if (!site) return toast('Please enter a site name.', 'error');
    if (SITES.includes(site)) return toast(`"${site}" is a main tab. Pick it from the list instead.`, 'error');
  } else {
    site = siteValue;
  }

  const selections = document.getElementById('nt-selections').value.split('\n').map(line => {
    const [match, pick, oddsStr] = line.split('|');
    return { match: (match || '').trim(), pick: pick ? pick.trim() : '', odds: parseFloat(oddsStr) || 1 };
  });

  const tier = state.newTicketTier === 'premium' ? 'premium' : 'free';
  const base = {
    site,
    league: document.getElementById('nt-league').value,
    title:  document.getElementById('nt-title').value,
    tier,
    odds:  parseFloat(document.getElementById('nt-odds').value),
    price: parseFloat(document.getElementById('nt-price').value),
    status:'open', cap:50, sold:0, kickoff:'Today',
    selectionCount: selections.length
  };

  try {
    const ref = db.collection('tickets').doc();
    if (tier === 'premium') {
      await ref.set(base);
      await db.collection('premiumPicks').doc(ref.id).set({ selections });
    } else {
      await ref.set({ ...base, selections });
    }
    await logAdminAction('publishTicket', ref.id, { site, tier, title: base.title });
    state.newTicketTier = 'free';
    toast('Ticket published!');
    await fetchTickets();
    selectSite(SITES.includes(site) ? site : OTHERS);
  } catch (err) { console.error(err); toast('Error publishing ticket.', 'error'); }
}

/* ---------- dropdown ---------- */
function toggleSiteDropdown(e) {
  e.preventDefault();
  const menu = document.getElementById('site-dropdown-menu');
  const btn  = document.getElementById('site-dropdown-btn');
  menu.classList.toggle('open');
  btn.classList.toggle('active');
  if (menu.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', closeDropdownOnOutsideClick), 10);
  }
}
function selectSiteOption(site, btnElement) {
  document.getElementById('nt-site').value = site;
  document.getElementById('nt-site-label').textContent = site === OTHERS_SENTINEL ? 'Others…' : site;
  document.querySelectorAll('#site-dropdown-menu .dropdown-item').forEach(el => el.classList.remove('active'));
  btnElement.classList.add('active');
  document.getElementById('site-dropdown-menu').classList.remove('open');
  document.getElementById('site-dropdown-btn').classList.remove('active');

  const wrap  = document.getElementById('nt-custom-site-wrap');
  const input = document.getElementById('nt-custom-site');
  if (site === OTHERS_SENTINEL) {
    if (wrap) wrap.style.display = 'block';
    if (input) setTimeout(() => input.focus(), 50);
  } else {
    if (wrap) wrap.style.display = 'none';
    if (input) input.value = '';
  }
}
function closeDropdownOnOutsideClick(e) {
  const wrapper = document.getElementById('site-dropdown-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    document.getElementById('site-dropdown-menu').classList.remove('open');
    document.getElementById('site-dropdown-btn').classList.remove('active');
    document.removeEventListener('click', closeDropdownOnOutsideClick);
  }
}

/* =========================================================
   Premium expiry + event cleanup + user doc watcher
   ========================================================= */
function scheduleExpiryRefresh() {
  clearTimeout(_expiryTimer);
  if (!state.session || isAdminUser()) return;
  const ms = expiryMs(state.userData && state.userData.premiumExpiry) - Date.now();
  if (ms > 0 && ms <= PREMIUM_MS + 60000) {
    _expiryTimer = setTimeout(refreshAfterExpiry, ms + 1000);
  }
}

function scheduleEventCleanup() {
  clearTimeout(_eventTimer);
  if (!state.upcomingEvents.length) return;

  const now = Date.now();
  const future = state.upcomingEvents
    .map(e => expiryMs(e.eventTime))
    .filter(t => t > now);
  if (!future.length) return;

  const next = Math.min(...future);
  const ms = next - now;
  if (ms > 0 && ms < 6 * 60 * 60 * 1000) {
    _eventTimer = setTimeout(async () => {
      await fetchUpcomingEvents();
      render();
    }, ms + 1500);
  }
}

async function refreshAfterExpiry() {
  try {
    await db.collection('users').doc(state.userUid).update({
      premiumExpiry: FieldValue.delete()
    });
    state.userData.premiumExpiry = null;
  } catch (_) { /* fine — already cleared or rule rejected */ }
  toast('Premium access expired.', 'info');
  await fetchTickets();
  render();
}

function watchUserDoc(uid) {
  if (_userUnsub) { _userUnsub(); _userUnsub = null; }
  _userUnsub = db.collection('users').doc(uid).onSnapshot(snap => {
    if (!snap.exists) return;
    const wasPrem = isPremiumUser();
    state.userData = snap.data();
    const nowPrem = isPremiumUser();
    if (wasPrem !== nowPrem) {
      fetchTickets().then(render);
    }
  }, err => console.warn('user watch:', err.message));
}

/* =========================================================
   Bootstrap
   ========================================================= */
render();

auth.onAuthStateChanged(async (user) => {
  if (user) {
    state.session = user.email;
    state.userUid = user.uid;

    try {
      const userRef = db.collection('users').doc(user.uid);
      const docSnap = await userRef.get();

      if (docSnap.exists) {
        state.userData = docSnap.data();
        if (state.userData.premiumExpiry && expiryMs(state.userData.premiumExpiry) < Date.now()) {
          userRef.update({ premiumExpiry: FieldValue.delete() })
            .then(() => { state.userData.premiumExpiry = null; })
            .catch(() => {});
        }
      } else {
        const fresh = {
          name: user.displayName || 'User',
          email: user.email, phone: '',
          isApproved: false,
          premiumRequested: false,
          createdAt: Date.now()
        };
        await userRef.set(fresh);
        state.userData = fresh;
      }

      await resolveAdminRole(user.uid);

      await fetchTickets();
      await fetchBookings();
      await fetchUpcomingEvents();
      watchUserDoc(user.uid);
      render();
    } catch (e) {
      console.error(e);
      toast('Failed to load account data.', 'error');
      render();
    }
  } else {
    if (_userUnsub) { _userUnsub(); _userUnsub = null; }
    clearTimeout(_expiryTimer);
    clearTimeout(_eventTimer);
    state.session = null; state.userUid = null; state.userData = null;
    state.isAdmin = false; state.adminData = null;
    state.adminsList = []; state.premiumPicks = {}; state.auditLog = [];
    state.upcomingEvents = [];
    state.view = 'site'; state.authMode = 'login';
    isAdminVerified = false;
    render();
  }
});