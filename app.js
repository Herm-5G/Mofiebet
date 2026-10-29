/* =========================================================
   Mofiebet — v12 (Premium Tickets & Tiered Accounts)
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
const db = firebase.firestore();

const MASTER_ADMIN = 'hermanedaru@gmail.com';
const CURRENCY = '$';
const SITES = ['Betpawa', '1xBet', 'ForteBet', 'Bet365', 'Betway', 'SportyBet'];

let state = {
  view: 'site',
  activeSite: 'Betpawa',
  authMode: 'login',
  theme: 'dark',
  session: null,
  userUid: null,
  userData: null,
  tickets: [],
  bookings: [],
  usersList: [],
  search: '',
  newTicketTier: 'free',
  settings: { adminSecret: '' }
};

let isAdminVerified = false;

const money = n => CURRENCY + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const newRef = () => 'MFB-' + Math.floor(1000 + Math.random() * 9000);
const fmtTime = ts => new Date(ts).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
const remainingSlots = t => Math.max(0, (t.cap || 50) - (t.sold || 0));
const isTicketAvailable = t => t.status === 'open' && remainingSlots(t) > 0;

/* ---------------- Premium Helpers ---------------- */
const isMasterAdmin   = () => state.session === MASTER_ADMIN;
const isPremiumUser   = () => isMasterAdmin() || !!state.userData?.isPremium;
const isPremiumTicket = t => t.tier === 'premium';
const canAccessTicket = t => !isPremiumTicket(t) || isPremiumUser();

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
  const menu = document.getElementById('side-menu');
  const backdrop = document.getElementById('menu-backdrop');
  menu.classList.toggle('open');
  backdrop.classList.toggle('open');
}

function selectSite(site) {
  state.activeSite = site;
  state.view = 'site';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function go(view) {
  if (view === 'admin' && state.session !== MASTER_ADMIN) return toast('Access denied.', 'error');
  state.view = view;
  document.getElementById('side-menu').classList.remove('open');
  document.getElementById('menu-backdrop').classList.remove('open');

  if (view === 'profile') await fetchBookings();
  if (view === 'admin') await fetchUsers();
  render();
}

function statusBadge(s) {
  const map = { open:['Open','accent'], won:['Won','accent'], lost:['Failed','mono'], pending:['Pending','outline'], confirmed:['Confirmed','mono'], refunded:['Refunded','mono'] };
  const [label, cls] = map[s] || [s, 'outline'];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ---------------- Firebase Data ---------------- */
async function initSettings() {
  // SECURITY: Only fetch settings if the logged-in user is the Master Admin
  if (state.session === MASTER_ADMIN) {
    try {
      const doc = await db.collection("settings").doc("config").get();
      if (doc.exists) {
        state.settings = doc.data();
      } else {
        await db.collection("settings").doc("config").set({ adminSecret: 'linxe' });
        state.settings = { adminSecret: 'linxe' };
      }
    } catch (e) {
      console.warn("Settings fetch blocked by Firestore Rules.", e.message);
    }
  }
}

async function seedTicketsIfEmpty() {
  if (state.session !== MASTER_ADMIN) return;

  try {
    const snap = await db.collection("tickets").get();
    if (snap.empty) {
      const initialTickets = [
        { site: 'Betpawa', title:'Premier League Banker', league:'England · Premier League', tier:'free', odds:2.45, price:20, kickoff:'Sat 20:00', cap:50, sold:12, status:'open', selections:[{ match:'Arsenal vs Chelsea', pick:'Arsenal to win', odds:1.75 }]},
        { site: '1xBet', title:'La Liga Double', league:'Spain · La Liga', tier:'free', odds:3.12, price:15, kickoff:'Sun 21:00', cap:40, sold:23, status:'open', selections:[{ match:'Real Madrid vs Sevilla', pick:'Real Madrid -1.5', odds:1.80 }]},
        { site: 'ForteBet', title:'Serie A Value Treble', league:'Italy · Serie A', tier:'premium', odds:4.60, price:25, kickoff:'Sun 18:00', cap:30, sold:9, status:'open', selections:[{ match:'Inter vs Roma', pick:'Inter to win', odds:1.65 }]}
      ];
      for (const t of initialTickets) await db.collection("tickets").add(t);
    }
  } catch (e) {
    console.warn("Seeding skipped:", e.message);
  }
}

async function fetchTickets() {
  try {
    const snap = await db.collection("tickets").get();
    state.tickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn("Tickets fetch blocked by rules (User is likely unapproved).");
    state.tickets = [];
  }
}

async function fetchBookings() {
  if (!state.userUid) return;
  try {
    let snap;
    if (state.session === MASTER_ADMIN) snap = await db.collection("bookings").get();
    else snap = await db.collection("bookings").where("userId", "==", state.userUid).get();
    state.bookings = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.warn("Bookings fetch error:", error.message);
  }
}

async function fetchUsers() {
  if (state.session !== MASTER_ADMIN) return;
  try {
    const snap = await db.collection("users").get();
    state.usersList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.warn("Users fetch error:", error.message);
  }
}

/* ---------------- Render Engine ---------------- */
function render() {
  document.documentElement.dataset.theme = state.theme;
  const navSites = document.getElementById('nav-sites');
  const headEl = document.getElementById('head-right');
  const appEl = document.getElementById('app');

  if (!state.session) {
    navSites.innerHTML = '';
    headEl.innerHTML = `<button class="theme-btn" onclick="toggleTheme()">${state.theme === 'dark' ? '☀' : '☾'}</button>`;
    appEl.innerHTML = viewAuth();
    return;
  }

  navSites.innerHTML = SITES.map(site =>
    `<button class="${state.view === 'site' && state.activeSite === site ? 'active' : ''}" onclick="selectSite('${site}')">${site}</button>`
  ).join('');

  const initial = state.userData?.name ? state.userData.name.charAt(0).toUpperCase() : 'U';
  headEl.innerHTML = `
    <button class="theme-btn" onclick="toggleTheme()">${state.theme === 'dark' ? '☀' : '☾'}</button>
    <button class="gmail-avatar" onclick="toggleMenu()" title="Account">
      ${initial}
    </button>`;

  document.getElementById('sm-avatar').textContent = initial;
  document.getElementById('sm-name').textContent = state.userData?.name || 'User';
  document.getElementById('sm-email').textContent = state.userData?.email || '';
  document.getElementById('sm-admin-link').style.display = state.session === MASTER_ADMIN ? 'flex' : 'none';

  const tierEl = document.getElementById('sm-tier');
  if (tierEl) {
    const premium = isPremiumUser();
    tierEl.textContent = premium ? '★ Premium Member' : 'Free Account';
    tierEl.className = 'sm-tier' + (premium ? ' premium' : '');
  }

  if (state.view === 'site') appEl.innerHTML = viewSiteTickets();
  else if (state.view === 'profile') { appEl.innerHTML = viewProfile(); renderBookingsList(); }
  else if (state.view === 'admin') appEl.innerHTML = viewAdmin();
}

/* ---------------- Auth Views ---------------- */
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
      <p class="privacy-note" style="text-align:center; margin-top:15px; font-size:11px; color:var(--muted);">🔒 Secure network. Access subject to admin approval.</p>
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
      <label>Phone<input id="su-phone" required placeholder="+1 555 0100"></label>
    </div>
    <label>Password<input id="su-pass" type="password" required minlength="6" placeholder="At least 6 characters"></label>
    <label>Confirm password<input id="su-pass2" type="password" required minlength="6" placeholder="Repeat password"></label>
    <button class="btn primary wide" type="submit">Create account</button>
  </form>`;
}

function doLogin(e) {
  e.preventDefault();
  auth.signInWithEmailAndPassword(document.getElementById('li-email').value.trim(), document.getElementById('li-pass').value)
    .then(() => toast('Logged in!'))
    .catch(error => toast(error.message.replace('Firebase: ', ''), 'error'));
}

function doSignup(e) {
  e.preventDefault();
  const name = document.getElementById('su-name').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const phone = document.getElementById('su-phone').value.trim();
  const pass = document.getElementById('su-pass').value;
  const pass2 = document.getElementById('su-pass2').value;

  if (pass !== pass2) return toast('Passwords do not match.', 'error');

  auth.createUserWithEmailAndPassword(email, pass)
    .then((cred) => {
      return db.collection("users").doc(cred.user.uid).set({
        name, email, phone,
        isApproved: false,
        isPremium: false,
        premiumRequested: false,
        createdAt: Date.now()
      });
    })
    .then(() => toast('Account created successfully!'))
    .catch(error => toast(error.message.replace('Firebase: ', ''), 'error'));
}

function logout() {
  auth.signOut().then(() => {
    state.session = null; state.userUid = null; state.userData = null; isAdminVerified = false; toggleMenu(); toast('Signed out.');
  });
}

/* ---------------- Site Views ---------------- */
function premiumBanner() {
  return `
  <div class="premium-banner" onclick="openPremiumModal()">
    <span class="pb-star">★</span>
    <div>
      <strong>Go Premium</strong>
      <p>Unlock premium picks across every betting site.</p>
    </div>
    <span class="pb-arrow">→</span>
  </div>`;
}

function viewSiteTickets() {
  const isApproved = state.userData?.isApproved || isMasterAdmin();

  let list = state.tickets.filter(t => t.site === state.activeSite);
  if (!isApproved) list = [];
  // Free tickets first, premium teasers after
  list = [...list].sort((a, b) => (isPremiumTicket(a) ? 1 : 0) - (isPremiumTicket(b) ? 1 : 0));

  return `
  <div class="page-head" style="margin-top:10px;">
    <div>
      <h2>${esc(state.activeSite)} Tickets</h2>
      <p class="muted">Premium selections posted by Mofiebet.</p>
    </div>
  </div>
  ${isApproved && !isPremiumUser() ? premiumBanner() : ''}
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
  const avail = isTicketAvailable(t);
  const premium = isPremiumTicket(t);
  const unlocked = canAccessTicket(t);

  const selectionsHtml = unlocked
    ? t.selections.map(s => `<li><span>${esc(s.match)}</span><em>${esc(s.pick)}</em><b>${Number(s.odds).toFixed(2)}</b></li>`).join('')
    : t.selections.map(() => `
        <li class="locked-pick" onclick="openPremiumModal()">
          <span>🔒 Premium pick</span>
          <em>Unlock to view</em>
          <b>—</b>
        </li>`).join('');

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
      ${!avail
        ? `<span class="closed">Sold out</span>`
        : !unlocked
          ? `<button class="btn premium-btn sm" onclick="openPremiumModal()">🔒 Unlock</button>`
          : `<button class="btn primary sm" onclick="openBooking('${t.id}')">Book</button>`}
    </div>
  </article>`;
}

/* ---------------- Premium Access ---------------- */
function openPremiumModal() {
  if (isPremiumUser()) return;
  const pending = !!state.userData?.premiumRequested;

  document.getElementById('modal-root').innerHTML = `
  <div class="backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <button class="x" onclick="closeModal()">✕</button>
      <div class="premium-hero">★</div>
      <h3>Premium Access</h3>
      <p class="muted" style="margin-top:6px">Some tickets contain premium picks. Activate premium to reveal and book them.</p>
      <ul class="premium-perks">
        <li>✓ Unlock every premium ticket instantly</li>
        <li>✓ Premium picks visible on all betting sites</li>
        <li>✓ Priority booking on limited slips</li>
      </ul>
      ${pending
        ? `<div class="request-note">⏳ Request pending — admin will activate after payment.</div>`
        : `<button class="btn premium-btn wide" onclick="requestPremium()">Request Premium Access</button>`}
      <p class="muted" style="font-size:11.5px; margin-top:12px; text-align:center;">Payments via WhatsApp: <b>+256790311166</b> · <b>+256748368400</b></p>
    </div>
  </div>`;
}

function requestPremium() {
  if (!state.userUid) return;
  db.collection('users').doc(state.userUid).set({ premiumRequested: true }, { merge: true })
    .then(() => {
      state.userData.premiumRequested = true;
      closeModal();
      toast('Premium request sent to admin.');
      render();
    })
    .catch(() => toast('Could not send request.', 'error'));
}

/* ---------------- Booking Logic ---------------- */
function openBooking(id) {
  const t = state.tickets.find(x => x.id === id);
  if (!t || t.status !== 'open') return;
  if (!canAccessTicket(t)) return openPremiumModal();
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
    document.getElementById('f-total').textContent = money(t.price * Math.max(1, Math.min(maxQty, Number(qtyEl.value) || 1)));
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

    db.collection("bookings").add(bookingData)
      .then(() => db.collection("tickets").doc(t.id).update({ sold: firebase.firestore.FieldValue.increment(qty) }))
      .then(() => {
        closeModal(); go('profile'); toast('Booking confirmed!'); fetchTickets();
      })
      .catch(() => toast('Error booking ticket', 'error'));
  });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ---------------- Profile & Bookings ---------------- */
function viewProfile() {
  const premium = isPremiumUser();
  const pending = !premium && !!state.userData?.premiumRequested;

  return `
  <div class="page-head">
    <div><h2>My Profile</h2><p class="muted">${esc(state.userData.email)}</p></div>
  </div>

  <div class="panel">
    <div class="membership-row">
      <div>
        <strong>${premium ? '★ Premium Member' : 'Free Account'}</strong>
        <p class="muted">${premium ? 'You have full access to all premium tickets and picks.' : 'Upgrade to unlock premium picks across every site.'}</p>
      </div>
      ${premium
        ? `<span class="badge premium">Active</span>`
        : pending
          ? `<span class="badge">Request pending</span>`
          : `<button class="btn premium-btn sm" onclick="openPremiumModal()">Upgrade</button>`}
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
  const name = document.getElementById('pf-name').value.trim();
  const phone = document.getElementById('pf-phone').value.trim();

  db.collection("users").doc(state.userUid).set({ name, phone }, { merge: true })
    .then(() => {
      state.userData.name = name;
      state.userData.phone = phone;
      render();
      toast('Profile updated.');
    })
    .catch((err) => {
      console.error(err);
      toast('Failed to update profile', 'error');
    });
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
  if (q) list = list.filter(b => b.ref.toLowerCase().includes(q) || (b.ticketTitle || '').toLowerCase().includes(q));

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
      ${b.refund ? `<div class="refund-box"><span>💸</span><div>Refund of <b>${money(b.refund.amount)}</b> credited</div></div>` : ''}
      <div class="thread">
        ${b.replies.map(r => `<div class="reply ${r.from}"><span class="who">${r.from === 'admin' ? 'Mofiebet' : r.from === 'system' ? 'System' : 'You'}</span><p>${esc(r.text)}</p></div>`).join('')}
      </div>
    </article>`).join('');
}

/* ---------------- MASTER ADMIN ---------------- */
function viewAdmin() {
  if (!isAdminVerified) {
    return `<div class="login"><div class="logo lg">🔐</div><h2>Admin Verification</h2>
      <p class="muted" style="margin-bottom:15px">Enter your secret identity word.</p>
      <form onsubmit="verifyAdminSecret(event)">
        <label>Secret Word<input id="admin-secret" type="password" required placeholder="Enter secret word"></label>
        <button class="btn primary wide" type="submit">Unlock Admin</button>
      </form>
    </div>`;
  }

  return `
  <div class="page-head">
    <div><h2>Admin Dashboard</h2></div>
    <button class="btn danger sm" onclick="lockAdmin()">Lock Admin</button>
  </div>

  <div class="panel">
    <h3>⚙️ Security Settings</h3>
    <form onsubmit="updateSecret(event)" style="display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap;">
      <label style="flex:1; margin:0;">Change Secret Word
        <input id="new-secret" required value="${esc(state.settings.adminSecret)}">
      </label>
      <button class="btn primary sm" type="submit" style="height:42px;">Update</button>
    </form>
  </div>

  <div class="panel">
    <h3>👥 Users, Approvals & Premium</h3>
    <div class="admin-list">
      ${state.usersList.map(u => `
        <div class="admin-item">
          <div class="info">
            <strong>${esc(u.name)} ${u.id === state.userUid ? '(You)' : ''}</strong>
            <span>${esc(u.email)} · ${u.isApproved ? '✅ Approved' : '⏳ Pending'} · ${u.isPremium ? '★ Premium' : 'Free tier'}</span>
            ${u.premiumRequested && !u.isPremium ? '<span class="req-flag">★ Premium requested</span>' : ''}
          </div>
          <div class="admin-actions">
            ${u.id !== state.userUid ? `
              <button class="btn sm ${u.isApproved ? 'danger' : 'primary'}" onclick="toggleUserApproval('${u.id}', ${u.isApproved})">
                ${u.isApproved ? 'Revoke' : 'Approve'}
              </button>
              <button class="btn sm premium-btn" onclick="toggleUserPremium('${u.id}', ${!!u.isPremium})">
                ${u.isPremium ? 'Remove Premium' : 'Make Premium'}
              </button>` : '<span class="badge premium">Master</span>'}
          </div>
        </div>`).join('') || '<p class="muted">No users found.</p>'}
    </div>
  </div>

  <div class="panel">
    <h3>🎫 Post New Ticket</h3>
    <form onsubmit="publishTicket(event)">
      <div class="row">
        <label>Betting Site
          <div class="select-wrapper">
            <select id="nt-site">
              ${SITES.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </div>
        </label>
        <label>League<input id="nt-league" placeholder="Premier League" required></label>
      </div>
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
          <input id="nt-price" type="number" placeholder="Price ($)" required>
        </div>
      </label>
      <label>Selections (Match | Pick | Odds)
        <textarea id="nt-selections" placeholder="Arsenal vs Chelsea | Arsenal win | 1.75" required></textarea>
      </label>
      <button class="btn primary wide" type="submit" style="margin-top:10px;">Post Ticket</button>
    </form>
  </div>`;
}

function verifyAdminSecret(e) {
  e.preventDefault();
  if (state.session !== MASTER_ADMIN) return toast('Access Denied', 'error');

  if (document.getElementById('admin-secret').value === state.settings.adminSecret) {
    isAdminVerified = true;
    render();
    toast('Admin Unlocked.');
  } else {
    toast('Incorrect secret word.', 'error');
  }
}

function lockAdmin() { isAdminVerified = false; go('site'); }

function updateSecret(e) {
  e.preventDefault();
  const newSecret = document.getElementById('new-secret').value.trim();
  if (newSecret.length < 3) return toast('Secret must be at least 3 characters.', 'error');
  db.collection("settings").doc("config").update({ adminSecret: newSecret })
    .then(() => { state.settings.adminSecret = newSecret; toast('Secret word updated!'); })
    .catch(() => toast('Error updating secret.', 'error'));
}

function toggleUserApproval(userId, currentStatus) {
  db.collection("users").doc(userId).update({ isApproved: !currentStatus })
    .then(() => { toast('User status updated.'); fetchUsers().then(() => render()); })
    .catch(() => toast('Error updating user.', 'error'));
}

function toggleUserPremium(userId, currentStatus) {
  db.collection("users").doc(userId).update({ isPremium: !currentStatus, premiumRequested: false })
    .then(() => {
      toast(currentStatus ? 'Premium removed.' : 'Premium activated!');
      fetchUsers().then(() => render());
    })
    .catch(() => toast('Error updating user.', 'error'));
}

function setNewTicketTier(tier) {
  state.newTicketTier = tier;
  const free = document.getElementById('tier-free');
  const prem = document.getElementById('tier-premium');
  if (free) free.classList.toggle('on', tier === 'free');
  if (prem) prem.classList.toggle('on', tier === 'premium');
}

function publishTicket(e) {
  e.preventDefault();
  const selections = document.getElementById('nt-selections').value.split('\n').map(line => {
    const [match, pick, oddsStr] = line.split('|');
    return { match: match.trim(), pick: pick ? pick.trim() : '', odds: parseFloat(oddsStr) || 1 };
  });

  const newTicket = {
    site: document.getElementById('nt-site').value,
    league: document.getElementById('nt-league').value,
    title: document.getElementById('nt-title').value,
    tier: state.newTicketTier === 'premium' ? 'premium' : 'free',
    odds: parseFloat(document.getElementById('nt-odds').value),
    price: parseFloat(document.getElementById('nt-price').value),
    selections, status: 'open', cap: 50, sold: 0, kickoff: 'Today'
  };

  db.collection("tickets").add(newTicket)
    .then(() => {
      state.newTicketTier = 'free';
      toast('Ticket published!');
      fetchTickets().then(() => selectSite(newTicket.site));
    })
    .catch(() => toast('Error publishing ticket.', 'error'));
}

/* ---------------- INITIALIZATION ---------------- */
render();

auth.onAuthStateChanged((user) => {
  if (user) {
    state.session = user.email;
    state.userUid = user.uid;

    db.collection("users").doc(user.uid).get().then((docSnap) => {
      if (docSnap.exists) {
        state.userData = docSnap.data();
      } else {
        const isMaster = user.email === MASTER_ADMIN;
        const adminData = {
          name: 'Herman Edaru', email: user.email, phone: '',
          isApproved: isMaster, isPremium: isMaster, premiumRequested: false
        };
        db.collection("users").doc(user.uid).set(adminData);
        state.userData = adminData;
      }
      return initSettings();
    }).then(() => seedTicketsIfEmpty())
      .then(() => fetchTickets())
      .then(() => fetchBookings())
      .then(() => render());
  } else {
    state.session = null; state.userUid = null; state.userData = null; state.view = 'site'; state.authMode = 'login';
    isAdminVerified = false; render();
  }
});