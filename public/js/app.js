import { getSupabase } from './supabase.js';

let sb;                 // client supabase
let session = null;     // sessione auth
let profile = null;     // { id, team_name, is_admin }

const $ = (sel, root = document) => root.querySelector(sel);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => (s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
const initials = (name) => name.trim().split(/\s+/).slice(0,2).map(w => w[0]).join('').toUpperCase() || '?';

// ============================================================
// BOOT
// ============================================================
(async function boot() {
  sb = await getSupabase();
  const { data } = await sb.auth.getSession();
  session = data.session;

  sb.auth.onAuthStateChange((_e, s) => {
    session = s;
    if (!s) { profile = null; renderAuth(); }
  });

  if (session) { await loadProfile(); renderApp(); }
  else renderAuth();
})();

async function loadProfile() {
  const { data } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  profile = data;
}

// ============================================================
// AUTH SCREEN
// ============================================================
function renderAuth() {
  document.body.innerHTML = '';
  const wrap = el(`
    <div class="auth-wrap">
      <div class="auth-card">
        <img class="logo" src="/logo.svg" alt="Serie A Teen">
        <h1>Serie A Teen</h1>
        <p class="auth-sub">Area riservata dei Presidenti</p>
        <div class="tabs-auth">
          <button data-m="login" class="active">Accedi</button>
          <button data-m="signup">Registrati</button>
        </div>
        <div id="auth-form"></div>
        <div class="msg" id="auth-msg"></div>
      </div>
    </div>`);
  document.body.appendChild(wrap);

  let mode = 'login';
  const formHost = $('#auth-form', wrap);
  const msg = $('#auth-msg', wrap);
  const drawForm = () => {
    formHost.innerHTML = `
      <label>Nome società</label>
      <input id="f-team" placeholder="Es. Sporting Buba" autocomplete="organization">
      <label>Password</label>
      <input id="f-pass" type="password" placeholder="••••••••" autocomplete="${mode==='login'?'current-password':'new-password'}">
      <button class="btn btn-primary" id="f-go">${mode==='login'?'Accedi':'Crea società'}</button>`;
    $('#f-go', formHost).onclick = submit;
  };

  wrap.querySelectorAll('.tabs-auth button').forEach(b => b.onclick = () => {
    mode = b.dataset.m;
    wrap.querySelectorAll('.tabs-auth button').forEach(x => x.classList.toggle('active', x === b));
    msg.className = 'msg'; drawForm();
  });

  async function submit() {
    const team = $('#f-team').value.trim();
    const pass = $('#f-pass').value;
    msg.className = 'msg';
    if (!team || !pass) { showMsg('Inserisci nome società e password.', 'err'); return; }

    // Il nome società diventa un'email tecnica interna: nessuna mail reale richiesta.
    const email = teamToEmail(team);
    const go = $('#f-go'); go.disabled = true; go.textContent = 'Attendi…';

    try {
      if (mode === 'signup') {
        const { error } = await sb.auth.signUp({
          email, password: pass, options: { data: { team_name: team } }
        });
        if (error) throw error;
        // registrazione => login automatico (nessuna conferma email)
        const { error: e2 } = await sb.auth.signInWithPassword({ email, password: pass });
        if (e2) throw e2;
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      }
      session = (await sb.auth.getSession()).data.session;
      await loadProfile();
      renderApp();
    } catch (err) {
      go.disabled = false; go.textContent = mode==='login'?'Accedi':'Crea società';
      showMsg(friendlyAuthError(err, mode), 'err');
    }
  }
  function showMsg(t, k) { msg.textContent = t; msg.className = 'msg ' + k; }
  drawForm();
}

// Il nome società viene normalizzato in un identificatore email interno.
// Serve solo a Supabase Auth; l'utente non lo vede mai.
function teamToEmail(team) {
  const slug = team.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'.').replace(/^\.|\.$/g,'');
  return `${slug}@serieateen.local`;
}
function friendlyAuthError(err, mode) {
  const m = (err.message || '').toLowerCase();
  if (m.includes('already registered')) return 'Questa società esiste già. Prova ad accedere.';
  if (m.includes('invalid login')) return 'Nome società o password errati.';
  if (m.includes('password')) return 'La password deve avere almeno 6 caratteri.';
  return err.message || 'Qualcosa è andato storto.';
}

// ============================================================
// APP SHELL
// ============================================================
const TABS = ['Regolamento', 'Votazioni', 'Proposte'];
let activeTab = 'Regolamento';

function renderApp() {
  document.body.innerHTML = '';
  const shell = el(`
    <div>
      <header class="topbar">
        <div class="brand"><img src="/logo.svg" alt=""><span>Serie A Teen</span></div>
        <div class="spacer"></div>
        <div class="profile">
          <div class="avatar" id="avatar">${esc(initials(profile.team_name))}</div>
          <div class="menu" id="menu">
            <div class="who">${esc(profile.team_name)}</div>
            <div class="role">${profile.is_admin ? 'Amministratore di Lega' : 'Presidente'}</div>
            <button class="link-btn" id="rename">Cambia nome società</button>
            <hr>
            <button class="btn btn-ghost" id="logout">Esci</button>
          </div>
        </div>
      </header>
      <nav class="nav" id="nav"></nav>
      <main class="container" id="view"></main>
      <div class="overlay" id="overlay"></div>
    </div>`);
  document.body.appendChild(shell);

  const nav = $('#nav');
  TABS.forEach(t => {
    const b = el(`<button>${t}</button>`);
    b.classList.toggle('active', t === activeTab);
    b.onclick = () => { activeTab = t; renderApp(); };
    nav.appendChild(b);
  });

  // profile menu
  const menu = $('#menu');
  $('#avatar').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('open'); };
  document.addEventListener('click', () => menu.classList.remove('open'), { once: true });
  menu.onclick = (e) => e.stopPropagation();
  $('#logout').onclick = async () => { await sb.auth.signOut(); };
  $('#rename').onclick = openRename;

  const view = $('#view');
  if (activeTab === 'Regolamento') renderRegolamento(view);
  if (activeTab === 'Votazioni')   renderVotazioni(view);
  if (activeTab === 'Proposte')    renderProposte(view);
}

// ---------- overlay helper ----------
function openModal(node) {
  const ov = $('#overlay');
  ov.innerHTML = ''; ov.appendChild(node); ov.classList.add('open');
  ov.onclick = (e) => { if (e.target === ov) closeModal(); };
}
function closeModal() { const ov = $('#overlay'); ov.classList.remove('open'); ov.innerHTML = ''; }

// ============================================================
// TAB: REGOLAMENTO
// ============================================================
async function renderRegolamento(view) {
  view.innerHTML = `<div class="loading">Carico il regolamento…</div>`;
  try {
    const res = await fetch('/regolamento.html');
    const raw = await res.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const body = doc.body;

    // Il titolo principale sta sopra, a tutta larghezza
    const h1 = body.querySelector('h1');
    const title = h1 ? h1.textContent.trim() : 'Regolamento';
    if (h1) h1.remove();

    // Assegna un id a ogni capitolo (h2) e costruisci l'indice laterale
    const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const toc = [];
    body.querySelectorAll('h2').forEach(h => {
      const id = slug(h.textContent);
      h.id = id;
      toc.push({ id, text: h.textContent.trim() });
    });
    const tocHtml = toc.map(t => `<li><a href="#${t.id}" data-id="${t.id}">${esc(t.text)}</a></li>`).join('');

    view.innerHTML = `
      <h1 class="reg-title">${esc(title)}</h1>
      <div class="reg-layout">
        <aside class="reg-toc">
          <h4>Indice</h4>
          <ol>${tocHtml}</ol>
        </aside>
        <article class="reg reg-content">${body.innerHTML}</article>
      </div>`;

    // Click sull'indice → scorre al capitolo corrispondente
    const links = [...view.querySelectorAll('.reg-toc a')];
    links.forEach(a => a.onclick = (e) => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + a.dataset.id);
    });

    // Evidenzia nell'indice il capitolo attualmente visibile
    const spy = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) links.forEach(l => l.classList.toggle('active', l.dataset.id === en.target.id));
      });
    }, { rootMargin: '-74px 0px -70% 0px', threshold: 0 });
    view.querySelectorAll('.reg-content h2').forEach(h => spy.observe(h));
  } catch {
    view.innerHTML = `<div class="empty">Regolamento non disponibile al momento.</div>`;
  }
}

// ============================================================
// TAB: VOTAZIONI
// ============================================================
let pollSub = 'open'; // 'open' | 'archived'

async function renderVotazioni(view) {
  view.innerHTML = `
    <div class="page-head">
      <h2>Votazioni</h2>
      ${profile.is_admin ? `<button class="btn btn-primary" style="width:auto" id="new-poll">+ Nuova votazione</button>` : ''}
    </div>
    <div class="subtabs">
      <button data-s="open" class="${pollSub==='open'?'active':''}">Aperte</button>
      <button data-s="archived" class="${pollSub==='archived'?'active':''}">Archiviate</button>
    </div>
    <div id="poll-list"><div class="loading">Carico…</div></div>`;

  view.querySelectorAll('.subtabs button').forEach(b => b.onclick = () => {
    pollSub = b.dataset.s; renderVotazioni(view);
  });
  if (profile.is_admin) $('#new-poll').onclick = openNewPoll;

  const list = $('#poll-list');
  const { data: polls, error } = await sb.from('polls')
    .select('*').eq('status', pollSub).order('created_at', { ascending: false });
  if (error) { list.innerHTML = `<div class="empty">Errore nel caricamento.</div>`; return; }
  if (!polls.length) {
    list.innerHTML = `<div class="empty">${pollSub==='open' ? 'Nessuna votazione aperta.' : 'Nessuna votazione archiviata.'}</div>`;
    return;
  }

  // opzioni + conteggi + voto personale, in blocco
  const ids = polls.map(p => p.id);
  const [{ data: results }, { data: myVotes }] = await Promise.all([
    sb.from('poll_results').select('*').in('poll_id', ids),
    sb.from('votes').select('poll_id, option_id').eq('voter_id', profile.id).in('poll_id', ids),
  ]);
  const myVoteByPoll = Object.fromEntries((myVotes||[]).map(v => [v.poll_id, v.option_id]));

  list.innerHTML = '';
  polls.forEach(p => list.appendChild(pollCard(p, results||[], myVoteByPoll[p.id], view)));
}

function pollCard(poll, results, myOptionId, view) {
  const opts = results.filter(r => r.poll_id === poll.id).sort((a,b) => a.position - b.position);
  const total = opts.reduce((s,o) => s + Number(o.vote_count), 0);
  const archived = poll.status === 'archived';

  const card = el(`
    <div class="card">
      <div class="card-head">
        <h3>${esc(poll.title)}</h3>
        <span class="badge ${archived?'badge-arch':'badge-open'}">${archived?'Archiviata':'Aperta'}</span>
      </div>
      ${poll.description ? `<div class="body-text" style="margin-bottom:6px">${esc(poll.description)}</div>` : ''}
      <div class="meta">${total} vot${total===1?'o':'i'} · ${fmtDate(poll.created_at)}</div>
      <div class="opts"></div>
      <div class="card-actions"></div>
    </div>`);

  const optsHost = $('.opts', card);
  opts.forEach(o => {
    const pct = total ? Math.round(Number(o.vote_count)/total*100) : 0;
    const chosen = o.option_id === myOptionId;
    const row = el(`
      <div class="option ${chosen?'chosen':''}">
        <span class="opt-label">${esc(o.label)}${chosen?'<span class="your-vote">il tuo voto</span>':''}</span>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <span class="count">${o.vote_count} · ${pct}%</span>
      </div>`);
    if (!archived) row.onclick = () => castVote(poll.id, o.option_id, myOptionId, view);
    optsHost.appendChild(row);
  });

  if (profile.is_admin) {
    const actions = $('.card-actions', card);
    if (!archived) {
      const arch = el(`<button class="btn btn-ghost btn-sm">Archivia</button>`);
      arch.onclick = async () => {
        if (!confirm('Archiviare questa votazione? Non sarà più possibile votare.')) return;
        await sb.from('polls').update({ status: 'archived', archived_at: new Date().toISOString() }).eq('id', poll.id);
        renderVotazioni(view);
      };
      actions.appendChild(arch);
    }
    const del = el(`<button class="btn btn-danger btn-sm">Elimina</button>`);
    del.onclick = async () => {
      if (!confirm('Eliminare definitivamente questa votazione?')) return;
      await sb.from('polls').delete().eq('id', poll.id);
      renderVotazioni(view);
    };
    actions.appendChild(del);
  }
  return card;
}

async function castVote(pollId, optionId, currentOptionId, view) {
  if (optionId === currentOptionId) {
    await sb.from('votes').delete().eq('poll_id', pollId).eq('voter_id', profile.id); // ritira voto
  } else if (currentOptionId) {
    await sb.from('votes').update({ option_id: optionId }).eq('poll_id', pollId).eq('voter_id', profile.id);
  } else {
    await sb.from('votes').insert({ poll_id: pollId, option_id: optionId, voter_id: profile.id });
  }
  renderVotazioni(view);
}

function openNewPoll() {
  const modal = el(`
    <div class="modal">
      <h3>Nuova votazione</h3>
      <label>Titolo</label>
      <input id="p-title" placeholder="Es. Bonus difesa sì o no">
      <label>Descrizione (facoltativa)</label>
      <textarea id="p-desc" placeholder="Spiega la proposta al voto…" style="min-height:80px"></textarea>
      <label>Opzioni</label>
      <div id="p-opts">
        ${optRow('Opzione A')}${optRow('Opzione B')}
      </div>
      <button class="link-btn" id="add-opt">+ Aggiungi opzione</button>
      <div class="msg" id="p-msg"></div>
      <div class="row">
        <button class="btn btn-ghost" id="p-cancel">Annulla</button>
        <button class="btn btn-primary" id="p-save">Crea votazione</button>
      </div>
    </div>`);
  function optRow(ph='Opzione') {
    return `<div class="opt-row"><input class="p-opt" placeholder="${ph}"><button type="button" class="rm">×</button></div>`;
  }
  openModal(modal);
  const optsHost = $('#p-opts', modal);
  const bindRm = () => optsHost.querySelectorAll('.rm').forEach(b => b.onclick = () => {
    if (optsHost.querySelectorAll('.opt-row').length > 2) b.closest('.opt-row').remove();
  });
  bindRm();
  $('#add-opt', modal).onclick = () => { optsHost.appendChild(el(optRow())); bindRm(); };
  $('#p-cancel', modal).onclick = closeModal;
  $('#p-save', modal).onclick = async () => {
    const title = $('#p-title', modal).value.trim();
    const desc = $('#p-desc', modal).value.trim();
    const labels = [...modal.querySelectorAll('.p-opt')].map(i => i.value.trim()).filter(Boolean);
    const msg = $('#p-msg', modal);
    if (!title || labels.length < 2) { msg.className='msg err'; msg.textContent='Servono un titolo e almeno 2 opzioni.'; return; }
    const { data: poll, error } = await sb.from('polls')
      .insert({ title, description: desc || null, created_by: profile.id }).select().single();
    if (error) { msg.className='msg err'; msg.textContent=error.message; return; }
    await sb.from('poll_options').insert(labels.map((label, i) => ({ poll_id: poll.id, label, position: i })));
    closeModal(); pollSub = 'open'; renderApp();
  };
}

// ============================================================
// TAB: PROPOSTE
// ============================================================
async function renderProposte(view) {
  view.innerHTML = `
    <div class="page-head">
      <h2>Proposte</h2>
      <button class="btn btn-primary" style="width:auto" id="new-prop">+ Aggiungi proposta</button>
    </div>
    <div id="prop-list"><div class="loading">Carico…</div></div>`;
  $('#new-prop').onclick = () => openProposalForm(view);

  const list = $('#prop-list');
  const { data: props, error } = await sb.from('proposals')
    .select('*, profiles!proposals_author_id_fkey(team_name)')
    .order('created_at', { ascending: false });
  if (error) { list.innerHTML = `<div class="empty">Errore nel caricamento.</div>`; return; }
  if (!props.length) { list.innerHTML = `<div class="empty">Ancora nessuna proposta. Sii il primo a proporne una.</div>`; return; }

  list.innerHTML = '';
  props.forEach(p => list.appendChild(proposalCard(p, view)));
}

function proposalCard(p, view) {
  const author = p.profiles?.team_name || 'Società';
  const mine = p.author_id === profile.id;
  const canEdit = mine || profile.is_admin;
  const card = el(`
    <div class="card">
      <div class="card-head">
        <h3>${esc(p.title)}</h3>
      </div>
      <div class="meta">di <strong>${esc(author)}</strong> · ${fmtDate(p.created_at)}</div>
      <div class="body-text">${esc(p.body)}</div>
      <div class="card-actions"></div>
    </div>`);
  if (canEdit) {
    const actions = $('.card-actions', card);
    const edit = el(`<button class="btn btn-ghost btn-sm">Modifica</button>`);
    edit.onclick = () => openProposalForm(view, p);
    const del = el(`<button class="btn btn-danger btn-sm">Elimina</button>`);
    del.onclick = async () => {
      if (!confirm('Eliminare questa proposta?')) return;
      await sb.from('proposals').delete().eq('id', p.id);
      renderProposte(view);
    };
    actions.append(edit, del);
  }
  return card;
}

function openProposalForm(view, existing = null) {
  const modal = el(`
    <div class="modal">
      <h3>${existing ? 'Modifica proposta' : 'Nuova proposta'}</h3>
      <label>Titolo</label>
      <input id="pr-title" value="${existing ? esc(existing.title) : ''}" placeholder="Titolo della proposta">
      <label>Testo</label>
      <textarea id="pr-body" placeholder="Descrivi la tua proposta ai Presidenti…">${existing ? esc(existing.body) : ''}</textarea>
      <div class="msg" id="pr-msg"></div>
      <div class="row">
        <button class="btn btn-ghost" id="pr-cancel">Annulla</button>
        <button class="btn btn-primary" id="pr-save">${existing ? 'Salva modifiche' : 'Pubblica'}</button>
      </div>
    </div>`);
  openModal(modal);
  $('#pr-cancel', modal).onclick = closeModal;
  $('#pr-save', modal).onclick = async () => {
    const title = $('#pr-title', modal).value.trim();
    const body = $('#pr-body', modal).value.trim();
    const msg = $('#pr-msg', modal);
    if (!title || !body) { msg.className='msg err'; msg.textContent='Compila titolo e testo.'; return; }
    let error;
    if (existing) {
      ({ error } = await sb.from('proposals').update({ title, body, updated_at: new Date().toISOString() }).eq('id', existing.id));
    } else {
      ({ error } = await sb.from('proposals').insert({ title, body, author_id: profile.id }));
    }
    if (error) { msg.className='msg err'; msg.textContent=error.message; return; }
    closeModal(); renderProposte(view);
  };
}

// ============================================================
// RENAME SOCIETÀ
// ============================================================
function openRename() {
  const modal = el(`
    <div class="modal">
      <h3>Cambia nome società</h3>
      <label>Nuovo nome</label>
      <input id="rn-name" value="${esc(profile.team_name)}">
      <div class="msg" id="rn-msg"></div>
      <div class="row">
        <button class="btn btn-ghost" id="rn-cancel">Annulla</button>
        <button class="btn btn-primary" id="rn-save">Salva</button>
      </div>
    </div>`);
  openModal(modal);
  $('#rn-cancel', modal).onclick = closeModal;
  $('#rn-save', modal).onclick = async () => {
    const name = $('#rn-name', modal).value.trim();
    const msg = $('#rn-msg', modal);
    if (!name) { msg.className='msg err'; msg.textContent='Il nome non può essere vuoto.'; return; }
    const { error } = await sb.from('profiles').update({ team_name: name }).eq('id', profile.id);
    if (error) { msg.className='msg err'; msg.textContent=error.message; return; }
    profile.team_name = name; closeModal(); renderApp();
  };
}
