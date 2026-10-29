/* =========================================================
   Mofiebet — demo app logic
   ========================================================= */
const STORE = 'mofiebet_v1';
const IDENT = 'mofiebet_identity';
const ADMIN_PW = 'score2024';
const CURRENCY = '$';

const money = n => CURRENCY + Number(n || 0).toLocaleString('en-US', {maximumFractionDigits: 2});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const newRef = () => 'MFB-' + Math.floor(1000 + Math.random() * 9000);
const fmtTime = ts => new Date(ts).toLocaleString('en-US', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});

/* ---------------- seed data ---------------- */
function seedState() {
  return {
    view: 'home',
    filter: 'all',
    search: '',
    wallets: {},
    adverts: [
      {id:'ad1', tag:'PROMO', title:'Weekend Mega Jackpot', body:'Book any 3 slips this weekend and get a free VIP ticket. Use code SCORE3 at checkout.', cta:'Book now', active:true},
      {id:'ad2', tag:'NOTICE', title:'Automatic refunds', body:'If a ticket you booked fails to land, 100% of your stake is credited back to your refund wallet — no questions asked.', cta:'', active:true},
      {id:'ad3', tag:'NEW', title:'Analyst replies in under 30 mins', body:'Every booked ticket gets a personal reply from our analysts before kickoff.', cta:'', active:true}
    ],
    tickets: [
      {id:'t1', title:'Premier League Banker', league:'England · Premier League', odds:2.45, price:20, kickoff:'Sat 20:00', cap:50, sold:12, status:'open',
        selections:[
          {match:'Arsenal vs Chelsea', pick:'Arsenal to win', odds:1.75},
          {match:'Liverpool vs Everton', pick:'Over 2.5 goals', odds:1.40}
        ]},
      {id:'t2', title:'La Liga Double', league:'Spain · La Liga', odds:3.12, price:15, kickoff:'Sun 21:00', cap:40, sold:23, status:'open',
        selections:[
          {match:'Real Madrid vs Sevilla', pick:'Real Madrid -1.5', odds:1.80},
          {match:'Barcelona vs Valencia', pick:'Both teams to score', odds:1.73}
        ]},
      {id:'t3', title:'Serie A Value Treble', league:'Italy · Serie A', odds:4.60, price:25, kickoff:'Sun 18:00', cap:30, sold:9, status:'open',
        selections:[
          {match:'Inter vs Roma', pick:'Inter to win', odds:1.65},
          {match:'Juventus vs Napoli', pick:'Under 2.5 goals', odds:1.60},
          {match:'Milan vs Lazio', pick:'Milan to win', odds:1.74}
        ]},
      {id:'t4', title:'Champions League Special', league:'Europe · UCL', odds:5.85, price:30, kickoff:'Tue 20:00', cap:25, sold:18, status:'open',
        selections:[
          {match:'Man City vs Bayern', pick:'Man City to win', odds:1.90},
          {match:'PSG vs Dortmund', pick:'Over 3.5 goals', odds:2.10},
          {match:'Atletico vs Porto', pick:'Draw', odds:1.46}
        ]},
      {id:'t5', title:'Weekend Accumulator', league:'Mixed · Multi-league', odds:2.98, price:12, kickoff:'Sat 16:00', cap:60, sold:41, status:'open',
        selections:[
          {match:'Bayern vs Leipzig', pick:'Bayern to win', odds:1.55},
          {match:'Ajax vs PSV', pick:'Both teams to score', odds:1.62},
          {match:'Benfica vs Sporting', pick:'Benfica double chance', odds:1.18}
        ]}
    ],
    bookings: []
  };
}

/* ---------------- persistence ---------------- */
let state;
let isAdmin = false;

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
}
function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(STORE)); } catch (e) {}
  state = (raw && Array.isArray(raw.tickets)) ? raw : seedState();
  state.wallets = state.wallets || {};
  state.bookings = state.bookings || [];
  state.adverts = state.adverts || [];
  state.view = state.view || 'home';
  state.filter = state.filter || 'all';
  state.search = state.search || '';
  state.identity = localStorage.getItem(IDENT) || '';
}

/* ---------------- helpers ---------------- */
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2800);
}
function go(view) {
  state.view = view;
  save();
  render();
  window.scrollTo({top: 0, behavior: 'smooth'});
}
function setFilter(f) { state.filter = f; save(); render(); }
function walletOf(email) { return state.wallets[(email || '').toLowerCase()] || 0; }

function statusBadge(s) {
  const map = {
    open:['Open','green'], won:['Won','gold'], lost:['Failed','red'], void:['Void','grey'],
    pending:['Pending','blue'], confirmed:['Confirmed','blue'], refunded:['Refunded','purple']
  };
  const [label, cls] = map[s] || [s, 'grey'];
  return `<span class="badge ${cls}">${label}</span>`;
}

/* =========================================================
   RENDER
   ========================================================= */
function render() {
  // nav
  const navItems = [['home','Home'], ['tickets','Tickets'], ['bookings','My Bookings'], ['admin','Admin']];
  document.getElementById('nav').innerHTML = navItems.map(([k, l]) =>
    `<button class="${state.view === k ? 'active' : ''}" onclick="go('${k}')">${l}</button>`
  ).join('');

  // wallet
  document.getElementById('wallet').innerHTML =
    `Refund wallet<b>${money(walletOf(state.identity))}</b>`;

  // view
  const app = document.getElementById('app');
  if (state.view === 'home') app.innerHTML = viewHome();
  else if (state.view === 'tickets') app.innerHTML = viewTickets();
  else if (state.view === 'bookings') app.innerHTML = viewBookings();
  else app.innerHTML = viewAdmin();
}

/* ---------------- HOME ---------------- */
function viewHome() {
  const adverts = state.adverts.filter(a => a.active);
  const featured = state.tickets.filter(t => t.status === 'open').slice(0, 3);
  const lead = adverts[0];

  return `
  <section class="hero">
    <div class="hero-copy">
      <span class="pill">🎯 Trusted betting ticket booking</span>
      <h2>Book winning tickets.<br><span>Refunded</span> when they fail.</h2>
      <p>Mofiebet lets you reserve premium betting slips, get direct replies from our analysts before kickoff, and receive an automatic 100% refund the moment a booked ticket fails to land.</p>
      <div class="hero-actions">
        <button class="btn primary" onclick="go('tickets')">Browse tickets</button>
        <button class="btn ghost" onclick="go('bookings')">My bookings</button>
      </div>
      <div class="stats">
        <div><b>${state.tickets.length}</b><small>Live tickets</small></div>
        <div><b>${state.bookings.length}</b><small>Bookings made</small></div>
        <div><b>100%</b><small>Refund guarantee</small></div>
      </div>
    </div>
    <div class="hero-card">
      <div class="tag">${esc(lead ? lead.tag : 'FEATURED')}</div>
      <h3>${esc(lead ? lead.title : 'Weekend Mega Jackpot')}</h3>
      <p>${esc(lead ? lead.body : 'Book any 3 slips this weekend and get a free VIP ticket.')}</p>
      <div class="mini-rows">
        <div class="mini-row"><span>Fastest analyst reply</span><b>&lt; 30 min</b></div>
        <div class="mini-row"><span>Refund on failed ticket</span><b>Automatic</b></div>
        <div class="mini-row"><span>Booking confirmation</span><b>Instant</b></div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div><h3>Adverts & notices</h3><p>Promotions and updates from Mofiebet</p></div>
    </div>
    <div class="adverts">
      ${adverts.map(a => `
        <article class="advert">
          <div class="tag">${esc(a.tag)}</div>
          <h4>${esc(a.title)}</h4>
          <p>${esc(a.body)}</p>
          ${a.cta ? `<span class="cta">${esc(a.cta)} →</span>` : ''}
        </article>`).join('') || '<p class="muted">No adverts right now.</p>'}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div><h3>How it works</h3><p>Four steps from booking to payout or refund</p></div>
    </div>
    <div class="steps">
      <div class="step"><div class="num">1</div><h4>Book a ticket</h4><p>Pick a slip, choose how many shares you want, and confirm your booking instantly.</p></div>
      <div class="step"><div class="num">2</div><h4>Get a reply</h4><p>Our analysts reply to every booking with confirmation and any last-minute notes.</p></div>
      <div class="step"><div class="num">3</div><h4>Ticket settles</h4><p>We mark the ticket as won or failed right after the final whistle.</p></div>
      <div class="step"><div class="num">4</div><h4>Automatic refund</h4><p>If the ticket fails, 100% of your stake is credited back to your refund wallet.</p></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div><h3>Featured tickets</h3><p>Open now — book before kickoff</p></div>
      <button class="btn sm ghost" onclick="go('tickets')">View all</button>
    </div>
    <div class="grid">${featured.map(ticketCard).join('') || '<p class="muted">No open tickets.</p>'}</div>
  </section>`;
}

/* ---------------- TICKETS ---------------- */
function ticketCard(t) {
  return `
  <article class="ticket">
    <div class="ticket-top">
      <span class="league">${esc(t.league)}</span>
      ${statusBadge(t.status)}
    </div>
    <h4>${esc(t.title)}</h4>
    <ul class="selections">
      ${t.selections.map(s => `
        <li>
          <span>${esc(s.match)}</span>
          <em>${esc(s.pick)}</em>
          <b>${Number(s.odds).toFixed(2)}</b>
        </li>`).join('')}
    </ul>
    <div class="ticket-meta">
      <div><small>Total odds</small><b>${Number(t.odds).toFixed(2)}</b></div>
      <div><small>Price / slip</small><b>${money(t.price)}</b></div>
      <div><small>Kickoff</small><b>${esc(t.kickoff)}</b></div>
    </div>
    <div class="ticket-foot">
      <span class="sold">${t.sold || 0}/${t.cap || 50} slips booked</span>
      ${t.status === 'open'
        ? `<button class="btn primary sm" onclick="openBooking('${t.id}')">Book ticket</button>`
        : `<span class="closed">Booking closed</span>`}
    </div>
  </article>`;
}

function viewTickets() {
  const f = state.filter || 'all';
  const list = state.tickets.filter(t =>
    f === 'all' ? true : f === 'open' ? t.status === 'open' : t.status !== 'open'
  );
  return `
  <div class="page-head">
    <div>
      <h2>Betting tickets</h2>
      <p class="muted">Reserve a slip, receive an analyst reply, and get refunded automatically if it fails.</p>
    </div>
    <div class="filters">
      ${['all','open','settled'].map(x =>
        `<button class="chip ${f === x ? 'on' : ''}" onclick="setFilter('${x}')">${x[0].toUpperCase() + x.slice(1)}</button>`
      ).join('')}
    </div>
  </div>
  <div class="grid">${list.map(ticketCard).join('') || '<div class="empty"><b>No tickets here</b>Try another filter.</div>'}</div>`;
}

/* ---------------- BOOKING MODAL ---------------- */
function openBooking(id) {
  const t = state.tickets.find(x => x.id === id);
  if (!t || t.status !== 'open') return toast('This ticket is closed.');

  document.getElementById('modal-root').innerHTML = `
  <div class="backdrop" onclick="if(event.target===this)closeModal()">
    <div class="modal">
      <button class="x" onclick="closeModal()">✕</button>
      <h3>Book this ticket</h3>
      <p class="muted" style="font-size:13px">${esc(t.title)} · ${Number(t.odds).toFixed(2)} total odds · ${esc(t.kickoff)}</p>
      <form id="book-form">
        <label>Full name<input id="f-name" required placeholder="e.g. Alex Morgan"></label>
        <div class="row">
          <label>Email<input id="f-email" type="email" required placeholder="you@email.com" value="${esc(state.identity || '')}"></label>
          <label>Phone<input id="f-phone" required placeholder="+1 555 0100"></label>
        </div>
        <label>Number of slips<input id="f-qty" type="number" min="1" max="10" value="1" required></label>
        <div class="total"><span>Total to pay</span><b id="f-total">${money(t.price)}</b></div>
        <button class="btn primary" type="submit">Confirm booking</button>
      </form>
    </div>
  </div>`;

  const qtyEl = document.getElementById('f-qty');
  qtyEl.addEventListener('input', () => {
    const q = Math.max(1, Math.min(10, Number(qtyEl.value) || 1));
    document.getElementById('f-total').textContent = money(t.price * q);
  });

  document.getElementById('book-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = document.getElementById('f-name').value.trim();
    const email = document.getElementById('f-email').value.trim();
    const phone = document.getElementById('f-phone').value.trim();
    const qty = Math.max(1, Math.min(10, Number(qtyEl.value) || 1));
    if (!name || !email || !phone) return toast('Please fill in every field.');

    const ref = newRef();
    const booking = {
      id: uid(),
      ref,
      ticketId: t.id,
      ticketTitle: t.title,
      league: t.league,
      odds: t.odds,
      name, email, phone, qty,
      amount: t.price * qty,
      status: 'pending',
      createdAt: Date.now(),
      refund: null,
      replies: [{
        from: 'system',
        text: `Booking ${ref} received. ${qty} slip${qty > 1 ? 's' : ''} reserved on "${t.title}". Our analysts will confirm shortly.`,
        at: Date.now()
      }]
    };

    state.bookings.unshift(booking);
    t.sold = (t.sold || 0) + qty;
    state.identity = email;
    try { localStorage.setItem(IDENT, email); } catch (e) {}

    save();
    closeModal();
    go('bookings');
    toast('Booking ' + ref + ' confirmed!');
  });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* ---------------- MY BOOKINGS ---------------- */
function viewBookings() {
  const identity = state.identity || '';
  return `
  <div class="page-head">
    <div>
      <h2>My bookings</h2>
      <p class="muted">Track your slips, read replies from our team, and check your refunds.</p>
    </div>
    <div class="wallet" style="padding:12px 16px">
      Refund wallet<b>${money(walletOf(identity))}</b>
    </div>
  </div>

  <div class="panel" style="padding:14px">
    <label style="margin:0">Search by email or booking reference
      <input id="search-input" value="${esc(state.search)}" placeholder="you@email.com or MFB-1234"
             oninput="state.search=this.value;renderBookingsList()">
    </label>
  </div>

  <div id="bookings-list"></div>`;
}

function renderBookingsList() {
  const el = document.getElementById('bookings-list');
  if (!el) return;

  const q = (state.search || '').trim().toLowerCase();
  let list = state.bookings;
  if (q) {
    list = list.filter(b =>
      b.email.toLowerCase().includes(q) ||
      b.ref.toLowerCase().includes(q) ||
      (b.name || '').toLowerCase().includes(q)
    );
  } else if (state.identity) {
    list = list.filter(b => b.email.toLowerCase() === state.identity.toLowerCase());
  }

  if (!list.length) {
    el.innerHTML = `<div class="empty">
      <b>No bookings found</b>
      ${state.identity
        ? 'Book a ticket and it will appear here with replies and refund status.'
        : 'Enter the email you booked with, or book your first ticket to get started.'}
    </div>`;
    return;
  }

  el.innerHTML = list.map(b => `
    <article class="booking">
      <div class="booking-head">
        <div>
          <h4>${esc(b.ticketTitle)}</h4>
          <span class="ref">${esc(b.ref)} · ${esc(b.league || '')}</span>
        </div>
        ${statusBadge(b.status)}
      </div>

      <div class="booking-meta">
        <div><small>Name</small><b>${esc(b.name)}</b></div>
        <div><small>Email</small><b>${esc(b.email)}</b></div>
        <div><small>Slips</small><b>${b.qty}</b></div>
        <div><small>Paid</small><b>${money(b.amount)}</b></div>
        <div><small>Odds</small><b>${Number(b.odds).toFixed(2)}</b></div>
        <div><small>Booked</small><b>${fmtTime(b.createdAt)}</b></div>
      </div>

      ${b.refund ? `
        <div class="refund-box">
          <span>💸</span>
          <div>Refund of <b>${money(b.refund.amount)}</b> credited to your wallet on ${fmtTime(b.refund.at)} — status: <b>${esc(b.refund.status)}</b></div>
        </div>` : ''}

      <div class="thread">
        ${b.replies.map(r => `
          <div class="reply ${r.from}">
            <span class="who">${r.from === 'admin' ? 'Mofiebet' : r.from === 'system' ? 'System' : 'You'}</span>
            <p>${esc(r.text)}</p>
            <small>${fmtTime(r.at)}</small>
          </div>`).join('')}
      </div>

      <div class="msg-row">
        <input id="msg-${b.id}" placeholder="Send a message to support…">
        <button class="btn sm" onclick="userMessage('${b.id}')">Send</button>
      </div>
    </article>`).join('');
}

function userMessage(id) {
  const input = document.getElementById('msg-' + id);
  const text = input.value.trim();
  if (!text) return toast('Type a message first.');
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  b.replies.push({from: 'user', text, at: Date.now()});
  save();
  renderBookingsList();
  toast('Message sent to support.');
}

/* ---------------- ADMIN ---------------- */
function viewAdmin() {
  if (!isAdmin) {
    return `
    <div class="login">
      <div class="logo">🔐</div>
      <h2>Admin access</h2>
      <p class="muted" style="font-size:13px;margin-top:8px">Manage adverts, publish tickets, reply to bookings and issue refunds.</p>
      <form onsubmit="adminLogin(event)">
        <label>Password<input id="admin-pw" type="password" placeholder="Enter admin password" required></label>
        <button class="btn primary" style="width:100%;padding:12px" type="submit">Enter dashboard</button>
      </form>
      <p class="hint">Demo password: <b>score2024</b></p>
    </div>`;
  }

  return `
  <div class="page-head">
    <div><h2>Admin dashboard</h2><p class="muted">Adverts · tickets · bookings · refunds</p></div>
    <button class="btn danger sm" onclick="isAdmin=false;render()">Log out</button>
  </div>

  <!-- ADVERTS -->
  <section class="panel">
    <h3>📣 Adverts</h3>
    <p class="sub">These appear on the home page for every visitor.</p>
    <div class="admin-list">
      ${state.adverts.map(a => `
        <div class="admin-item">
          <div class="info">
            <strong>${esc(a.title)} ${a.active ? '' : '<span class="badge grey">hidden</span>'}</strong>
            <span>${esc(a.tag)} — ${esc(a.body)}</span>
          </div>
          <div class="acts">
            <button class="btn sm" onclick="toggleAdvert('${a.id}')">${a.active ? 'Hide' : 'Show'}</button>
            <button class="btn sm danger" onclick="deleteAdvert('${a.id}')">Delete</button>
          </div>
        </div>`).join('') || '<p class="muted">No adverts yet.</p>'}
    </div>
    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px">
      <div class="row">
        <label>Tag<input id="na-tag" placeholder="PROMO / NOTICE / NEW" value="PROMO"></label>
        <label>Headline<input id="na-title" placeholder="Weekend Mega Jackpot"></label>
      </div>
      <label>Body<textarea id="na-body" placeholder="Write the advert copy…"></textarea></label>
      <button class="btn primary sm" onclick="addAdvert()">Publish advert</button>
    </div>
  </section>

<!-- TICKETS -->
  <section class="panel">
    <h3>🎫 Tickets</h3>
    <p class="sub">Settle a ticket as <b>Failed</b> and every booking is refunded automatically.</p>
    <div class="admin-list">
      ${state.tickets.map(t => `
        <div class="admin-item">
          <div class="info">
            <strong>${esc(t.title)} ${statusBadge(t.status)}</strong>
            <span>${esc(t.league)} · ${Number(t.odds).toFixed(2)} odds · ${money(t.price)} · ${t.sold || 0}/${t.cap || 50} booked</span>
          </div>
          <div class="acts">
            <button class="btn sm" onclick="settleTicket('${t.id}','won')">Mark Won</button>
            <button class="btn sm danger" onclick="settleTicket('${t.id}','lost')">Mark Failed</button>
            <button class="btn sm ghost" onclick="settleTicket('${t.id}','void')">Void</button>
            <button class="btn sm ghost" onclick="deleteTicket('${t.id}')">Delete</button>
          </div>
        </div>`).join('') || '<p class="muted">No tickets yet.</p>'}
    </div>

    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:16px">
      <div class="row">
        <label>Title<input id="nt-title" placeholder="Premier League Banker"></label>
        <label>League<input id="nt-league" placeholder="England · Premier League"></label>
      </div>
      <div class="row">
        <label>Kickoff<input id="nt-kickoff" placeholder="Sat 20:00"></label>
        <label>Price per slip<input id="nt-price" type="number" min="1" value="20"></label>
      </div>
      <label>Selections — one per line: <code>Match | Pick | Odds</code>
        <textarea id="nt-selections" placeholder="Arsenal vs Chelsea | Arsenal to win | 1.75
Liverpool vs Everton | Over 2.5 goals | 1.40"></textarea>
      </label>
      <button class="btn primary sm" onclick="addTicket()">Publish ticket</button>
    </div>
  </section>

  <!-- BOOKINGS -->
  <section class="panel">
    <h3>💬 Bookings & replies</h3>
    <p class="sub">${state.bookings.length} booking(s). Reply to users or issue a manual refund.</p>
    <div class="admin-list">
      ${state.bookings.map(b => `
        <div class="admin-item" style="align-items:flex-start;flex-direction:column">
          <div style="display:flex;justify-content:space-between;gap:12px;width:100%;flex-wrap:wrap">
            <div class="info">
              <strong>${esc(b.ref)} · ${esc(b.name)} ${statusBadge(b.status)}</strong>
              <span>${esc(b.ticketTitle)} · ${esc(b.email)} · ${b.qty} slip(s) · ${money(b.amount)}</span>
            </div>
            <div class="acts">
              ${b.status === 'pending' ? `<button class="btn sm" onclick="confirmBooking('${b.id}')">Confirm</button>` : ''}
              ${b.refund ? '' : `<button class="btn sm danger" onclick="refundBooking('${b.id}')">Refund</button>`}
            </div>
          </div>
          <div class="thread" style="width:100%">
            ${b.replies.slice(-3).map(r => `
              <div class="reply ${r.from}">
                <span class="who">${r.from === 'admin' ? 'You (admin)' : r.from === 'system' ? 'System' : 'User'}</span>
                <p>${esc(r.text)}</p>
              </div>`).join('')}
          </div>
          <div class="msg-row" style="width:100%">
            <input id="reply-${b.id}" placeholder="Write a reply to ${esc(b.name)}…">
            <button class="btn sm primary" onclick="adminReply('${b.id}')">Reply</button>
          </div>
        </div>`).join('') || '<p class="muted">No bookings yet.</p>'}
    </div>
  </section>

  <!-- REFUND LOG -->
  <section class="panel">
    <h3>💸 Refund log</h3>
    <p class="sub">Every refund issued on this platform.</p>
    <div class="admin-list">
      ${state.bookings.filter(b => b.refund).map(b => `
        <div class="admin-item">
          <div class="info">
            <strong>${money(b.refund.amount)} → ${esc(b.email)}</strong>
            <span>${esc(b.ref)} · ${esc(b.ticketTitle)} · ${fmtTime(b.refund.at)} · ${esc(b.refund.status)}</span>
          </div>
        </div>`).join('') || '<p class="muted">No refunds issued yet.</p>'}
    </div>
  </section>`;
}

function adminLogin(e) {
  e.preventDefault();
  const pw = document.getElementById('admin-pw').value;
  if (pw === ADMIN_PW) {
    isAdmin = true;
    render();
    toast('Welcome back, admin.');
  } else {
    toast('Wrong password — try score2024');
  }
}

/* --- admin: adverts --- */
function addAdvert() {
  const tag = document.getElementById('na-tag').value.trim() || 'NOTICE';
  const title = document.getElementById('na-title').value.trim();
  const body = document.getElementById('na-body').value.trim();
  if (!title || !body) return toast('Add a headline and body text.');
  state.adverts.unshift({id: uid(), tag, title, body, cta: '', active: true});
  save(); render(); toast('Advert published.');
}
function toggleAdvert(id) {
  const a = state.adverts.find(x => x.id === id);
  if (!a) return;
  a.active = !a.active;
  save(); render();
}
function deleteAdvert(id) {
  state.adverts = state.adverts.filter(x => x.id !== id);
  save(); render(); toast('Advert deleted.');
}

/* --- admin: tickets --- */
function addTicket() {
  const title = document.getElementById('nt-title').value.trim();
  const league = document.getElementById('nt-league').value.trim() || 'General';
  const kickoff = document.getElementById('nt-kickoff').value.trim() || 'TBC';
  const price = Number(document.getElementById('nt-price').value) || 10;
  const lines = document.getElementById('nt-selections').value
    .split('\n').map(l => l.trim()).filter(Boolean);

  const selections = lines.map(l => {
    const [match, pick, odds] = l.split('|').map(s => (s || '').trim());
    return {match: match || 'Match', pick: pick || 'Selection', odds: Number(odds) || 1};
  });

  if (!title) return toast('Give the ticket a title.');
  if (!selections.length) return toast('Add at least one selection.');

  const odds = Number(selections.reduce((a, s) => a * s.odds, 1).toFixed(2));
  state.tickets.unshift({
    id: uid(), title, league, kickoff, price, odds,
    cap: 50, sold: 0, status: 'open', selections
  });
  save(); render(); toast('Ticket published.');
}
function deleteTicket(id) {
  state.tickets = state.tickets.filter(t => t.id !== id);
  save(); render(); toast('Ticket deleted.');
}

/* --- admin: settle + refund --- */
function settleTicket(id, result) {
  const t = state.tickets.find(x => x.id === id);
  if (!t) return;
  t.status = result;

  const affected = state.bookings.filter(b => b.ticketId === id && b.status !== 'refunded');
  let refunded = 0;

  affected.forEach(b => {
    if (result === 'won') {
      b.status = 'won';
      b.replies.push({
        from: 'system',
        text: `🎉 Ticket won! Your slip ${b.ref} landed at ${Number(t.odds).toFixed(2)} odds. Winnings will be credited to your account.`,
        at: Date.now()
      });
    } else {
      // lost or void → full refund
      b.status = 'refunded';
      b.refund = {amount: b.amount, at: Date.now(), status: 'paid'};
      const key = b.email.toLowerCase();
      state.wallets[key] = (state.wallets[key] || 0) + b.amount;
      refunded += b.amount;
      b.replies.push({
        from: 'system',
        text: `This ticket failed to land. A full refund of ${money(b.amount)} has been credited to your refund wallet. Reference: RF-${b.ref}.`,
        at: Date.now()
      });
    }
  });

  save(); render();

  if (result === 'won') toast(`Ticket marked won — ${affected.length} booking(s) updated.`);
  else toast(`Ticket marked ${result} — ${money(refunded)} refunded to ${affected.length} booking(s).`);
}

function confirmBooking(id) {
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  b.status = 'confirmed';
  b.replies.push({
    from: 'system',
    text: `Your booking ${b.ref} is confirmed. Good luck — we'll update you the moment the ticket settles.`,
    at: Date.now()
  });
  save(); render(); toast('Booking confirmed.');
}

function refundBooking(id) {
  const b = state.bookings.find(x => x.id === id);
  if (!b || b.refund) return toast('Already refunded.');
  b.status = 'refunded';
  b.refund = {amount: b.amount, at: Date.now(), status: 'paid'};
  const key = b.email.toLowerCase();
  state.wallets[key] = (state.wallets[key] || 0) + b.amount;
  b.replies.push({
    from: 'system',
    text: `Refund of ${money(b.amount)} processed and credited to your refund wallet. Reference: RF-${b.ref}.`,
    at: Date.now()
  });
  save(); render(); toast('Refund issued.');
}

function adminReply(id) {
  const input = document.getElementById('reply-' + id);
  const text = input.value.trim();
  if (!text) return toast('Write a reply first.');
  const b = state.bookings.find(x => x.id === id);
  if (!b) return;
  b.replies.push({from: 'admin', text, at: Date.now()});
  save(); render(); toast('Reply sent to ' + b.email);
}

/* ---------------- boot ---------------- */
load();
render();
renderBookingsList();

// keep search box results alive after re-render of bookings view
const _origRender = render;
render = function () {
  _origRender();
  if (state.view === 'bookings') {
    renderBookingsList();
    const inp = document.getElementById('search-input');
    if (inp) { inp.value = state.search; }
  }
};