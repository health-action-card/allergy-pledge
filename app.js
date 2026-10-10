/* =========================================================
   건강 행동수칙 실천 웹앱 - app.js
   ========================================================= */

/* ---------- 설정 ---------- */
// Apps Script 웹앱 배포 후 받은 URL(…/exec)을 아래에 붙여 넣으세요.
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwFG5oQ6XH_7SnioncyGDoF5C4cOAN1IAysar1Mjd6ErQwAQfP07Y7FELnTt4ClMJbhAw/exec';

/* ---------- 기본 제공 데이터 (여기만 고치면 수칙 변경 가능) ---------- */
const CATEGORIES = [
  {
    id: 'home', title: '집에서', icon: '🏠',
    color: '#2e8b57', bg: '#e3f5ea', shadow: '#1f6b41',
    rules: [
      '내 이불 정리와 방바닥 먼지 청소하기',
      '창문 열고 10분 환기하기',
      '비누, 샴푸 성분 확인하기',
      '책상과 책장 구석 물티슈로 닦기',
      '하루 15분 규칙적으로 운동하기'
    ]
  },
  {
    id: 'school', title: '학교에서', icon: '🏫',
    color: '#3d7fd0', bg: '#e4eefb', shadow: '#2a5ea0',
    rules: [
      '친구의 알레르기 유발 음식 억지로 권하지 않기',
      '알레르기 증상 있는 친구 놀리지 않기',
      '알레르기로 힘든 친구 다정하게 돕기',
      '내 알레르기 상태와 비상약 위치 미리 알리기',
      '응급상황 시 큰 소리로 선생님 부르고 119 신고 외치기'
    ]
  },
  {
    id: 'outdoor', title: '외부활동 시', icon: '🌳',
    color: '#e0822a', bg: '#fdeedc', shadow: '#b3631a',
    rules: [
      '꽃가루/먼지 심한 날 마스크 쓰기',
      '외출 후 비누로 꼼꼼하게 손 씻기',
      '풀밭에 함부로 눕지 않고 얇은 긴 옷 입기',
      '필요시 에피네프린 자가 주사기 챙기기',
      '가려울 때 비비지 말고 어른께 말씀드려 병원 가기'
    ]
  }
];

const MAX_CUSTOM_PER_CATEGORY = 3;
const STORAGE_KEY = 'allergyPledge.v1';
const PENDING_KEY = 'allergyPledge.pending';

/* ---------- 상태 ---------- */
// selection[catId] = { checked: [기본수칙 index...], custom: [{text, checked}] }
let state = { name: '', selection: {} };
let currentCat = null;

const $ = (id) => document.getElementById(id);

/* ---------- 한글 조사 처리 ---------- */
function lastChar(word) {
  const w = (word || '').trim();
  return w.charAt(w.length - 1);
}
// 받침 여부 (한글이 아니면 null)
function hasBatchim(word) {
  const code = lastChar(word).charCodeAt(0);
  if (code < 0xAC00 || code > 0xD7A3) return null;
  return (code - 0xAC00) % 28 !== 0;
}
function isRieul(word) {
  const code = lastChar(word).charCodeAt(0);
  return code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 === 8;
}
// josa('민준', '이/가') → '이',  josa('지아', '은/는') → '는'
function josa(word, pair) {
  const [withB, withoutB] = pair.split('/');
  const b = hasBatchim(word);
  if (b === null) return `${withB}(${withoutB})`;      // 한글 아님 → 이(가)
  if (pair === '으로/로') return (b && !isRieul(word)) ? withB : withoutB;
  return b ? withB : withoutB;
}
// withJosa('민준', '은/는') → '민준은'
function withJosa(word, pair) { return word + josa(word, pair); }

/* ---------- 저장/불러오기 ---------- */
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') state = { name: s.name || '', selection: s.selection || {} };
    }
  } catch (e) {}
  CATEGORIES.forEach(c => {
    const sel = state.selection[c.id] || {};
    state.selection[c.id] = {
      checked: Array.isArray(sel.checked) ? sel.checked : [],
      custom: Array.isArray(sel.custom) ? sel.custom : []
    };
  });
}

function displayName() { return state.name.trim() || '친구'; }

function selectedCount(catId) {
  const s = state.selection[catId];
  return s.checked.length + s.custom.filter(c => c.checked).length;
}
function selectedRules(cat) {
  const s = state.selection[cat.id];
  const base = cat.rules.filter((_, i) => s.checked.includes(i));
  const custom = s.custom.filter(c => c.checked).map(c => c.text);
  return base.concat(custom);
}
function totalSelected() { return CATEGORIES.reduce((n, c) => n + selectedCount(c.id), 0); }

/* ---------- 토스트 ---------- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- 화면 전환 (SPA) ---------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
}

/* ---------- 메인 화면 ---------- */
function renderCategories() {
  const wrap = $('categories');
  wrap.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const n = selectedCount(cat.id);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat-card' + (n > 0 ? ' done' : '');
    btn.style.setProperty('--cat-color', cat.color);
    btn.style.setProperty('--cat-bg', cat.bg);
    btn.style.setProperty('--cat-shadow', cat.shadow);
    btn.innerHTML =
      `<span class="cat-icon">${cat.icon}</span>` +
      `<span class="cat-title">${cat.title}</span>` +
      `<span class="cat-count">${n > 0 ? n + '개 선택했어요' : '수칙 고르기'}</span>`;
    btn.addEventListener('click', () => openModal(cat.id));
    wrap.appendChild(btn);
  });
}

function updateGreeting() {
  const name = state.name.trim();
  $('greeting').textContent = name ? `${withJosa(name, '은/는')} 어떤 약속을 지킬까요?` : '';
}

/* ---------- 모달 ---------- */
function openModal(catId) {
  currentCat = CATEGORIES.find(c => c.id === catId);
  const modal = $('modal');
  const box = modal.querySelector('.modal');
  box.style.setProperty('--cat-color', currentCat.color);
  box.style.setProperty('--cat-bg', currentCat.bg);
  $('modalIcon').textContent = currentCat.icon;
  $('modalTitle').textContent = `${currentCat.title} 지킬 수칙`;
  $('modalHint').textContent = `${withJosa(displayName(), '이/가')} 실천할 수칙에 체크해 보세요!`;
  $('customInput').value = '';
  $('addMsg').textContent = '';
  modal.hidden = false;
  renderRuleList();
}

function closeModal() {
  $('modal').hidden = true;
  currentCat = null;
  saveState();
  renderCategories();
}

function renderRuleList() {
  const cat = currentCat;
  const sel = state.selection[cat.id];
  const list = $('ruleList');
  list.innerHTML = '';

  cat.rules.forEach((text, i) => {
    const li = makeRuleItem(text, sel.checked.includes(i), false);
    li.querySelector('input').addEventListener('change', (e) => {
      const set = new Set(sel.checked);
      e.target.checked ? set.add(i) : set.delete(i);
      sel.checked = Array.from(set).sort((a, b) => a - b);
      li.classList.toggle('checked', e.target.checked);
      saveState();
    });
    list.appendChild(li);
  });

  sel.custom.forEach((item, i) => {
    const li = makeRuleItem(item.text, item.checked, true);
    li.querySelector('input').addEventListener('change', (e) => {
      item.checked = e.target.checked;
      li.classList.toggle('checked', e.target.checked);
      saveState();
    });
    li.querySelector('.btn-del').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      sel.custom.splice(i, 1);
      saveState();
      renderRuleList();
    });
    list.appendChild(li);
  });

  fitRuleList();
}

function makeRuleItem(text, checked, isCustom) {
  const li = document.createElement('li');
  const label = document.createElement('label');
  label.className = 'rule-item' + (checked ? ' checked' : '');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  const span = document.createElement('span');
  span.textContent = text;           // textContent: 학생 입력을 안전하게 표시
  label.append(cb, span);
  if (isCustom) {
    const tag = document.createElement('em');
    tag.className = 'tag-custom';
    tag.textContent = '나만의';
    tag.style.fontStyle = 'normal';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-del';
    del.setAttribute('aria-label', '삭제');
    del.textContent = '✕';
    label.append(tag, del);
  }
  li.appendChild(label);
  return li;
}

// 항목이 많아져도 스크롤이 생기지 않도록 글자 크기를 자동으로 줄임
function fitRuleList() {
  const list = $('ruleList');
  let size = Math.max(15, Math.min(26, window.innerHeight * 0.025));
  list.style.setProperty('--rule-font', size + 'px');
  while (list.scrollHeight > list.clientHeight + 1 && size > 11) {
    size -= 1;
    list.style.setProperty('--rule-font', size + 'px');
  }
}

function addCustomRule() {
  const input = $('customInput');
  const msg = $('addMsg');
  const text = input.value.replace(/\s+/g, ' ').trim();
  const sel = state.selection[currentCat.id];
  msg.textContent = '';

  if (!text) { msg.textContent = '추가할 수칙을 먼저 써 주세요.'; return; }
  if (sel.custom.length >= MAX_CUSTOM_PER_CATEGORY) {
    msg.textContent = `나만의 수칙은 ${MAX_CUSTOM_PER_CATEGORY}개까지 추가할 수 있어요.`; return;
  }
  const all = currentCat.rules.concat(sel.custom.map(c => c.text));
  if (all.includes(text)) { msg.textContent = '이미 있는 수칙이에요.'; return; }

  sel.custom.push({ text, checked: true });
  input.value = '';
  saveState();
  renderRuleList();
}

/* ---------- 카드 만들기 / 렌더링 ---------- */
function makeCard() {
  if (!state.name.trim()) {
    toast('먼저 내 이름을 써 주세요 ✏️');
    $('studentName').focus();
    return;
  }
  if (totalSelected() === 0) {
    toast('수칙을 한 개 이상 골라 주세요 🌿');
    return;
  }
  renderCard();
  showScreen('screen-card');
  requestAnimationFrame(() => { fitCertificate(); fitCertText(); });
}

function todayParts() {
  const d = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return {
    iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    text: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`,
    long: `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`
  };
}

function renderCard() {
  const name = state.name.trim();
  const t = todayParts();

  $('certPledge').innerHTML =
    `위 학생 <b></b>${josa(name, '은/는')} 알레르기로부터 나와 친구를 지키기 위해<br>` +
    `아래의 건강 행동수칙을 꼭 실천할 것을 약속합니다.`;
  $('certPledge').querySelector('b').textContent = name;
  $('certName').textContent = name;
  $('certDate').textContent = t.text;
  $('todayText').textContent = t.long;

  const cols = $('certColumns');
  cols.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const rules = selectedRules(cat);
    if (!rules.length) return;
    const g = document.createElement('div');
    g.className = 'cert-group';
    const h = document.createElement('h4');
    h.textContent = `${cat.icon} ${cat.title}`;
    h.style.background = cat.color;
    const ul = document.createElement('ul');
    rules.forEach(r => {
      const li = document.createElement('li');
      li.textContent = r;
      ul.appendChild(li);
    });
    g.append(h, ul);
    cols.appendChild(g);
  });

  const total = totalSelected();
  cols.style.setProperty('--cols', total > 6 ? 2 : 1);
  $('sendStatus').textContent = '';
  $('sendStatus').classList.remove('err');
}

// 카드를 4:3 비율로 무대(stage)에 맞게 크기 지정, 기준 단위 --u 설정
function fitCertificate() {
  const stage = document.querySelector('.card-stage');
  const cert = $('certificate');
  const sw = stage.clientWidth, sh = stage.clientHeight;
  if (!sw || !sh) return;
  let h = sh, w = h * 4 / 3;
  if (w > sw) { w = sw; h = w * 3 /4; }
  cert.style.width = Math.floor(w) + 'px';
  cert.style.height = Math.floor(h) + 'px';
  cert.style.setProperty('--u', (h / 100) + 'px');
}

// 수칙이 많아도 카드 안에서 넘치지 않도록 글자 크기 자동 조절
function fitCertText() {
  const cols = $('certColumns');
  let v = 3.6;
  const apply = () => cols.style.setProperty('--cert-font', `calc(var(--u) * ${v})`);
  apply();
  const overflow = () =>
    cols.scrollHeight > cols.clientHeight + 1 || cols.scrollWidth > cols.clientWidth + 1;
  while (overflow() && v > 1.5) {
    v = Math.round((v - 0.1) * 10) / 10;
    apply();
  }
}

/* ---------- 카드 저장 (html2canvas) ---------- */
async function saveCard() {
  const btn = $('btnSave');
  if (typeof html2canvas !== 'function') {
    toast('저장 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
    return;
  }
  btn.disabled = true;
  const oldText = btn.textContent;
  btn.textContent = '저장 중...';
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const cert = $('certificate');
    const scale = Math.max(2, 1800 / cert.offsetWidth);
    const canvas = await html2canvas(cert, {
      scale,
      backgroundColor: '#fffbea',
      useCORS: true,
      logging: false
    });
    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('이미지 변환 실패');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `행동수칙카드_${state.name.trim() || '친구'}_${todayParts().iso}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('카드가 태블릿에 저장되었어요! 🎉');
  } catch (err) {
    console.error(err);
    toast('저장에 실패했어요. 다시 시도해 주세요.');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

/* ---------- 선생님께 보내기 (Google Apps Script) ---------- */
function buildPayload() {
  const lines = [];
  CATEGORIES.forEach(cat => selectedRules(cat).forEach(r => lines.push(`[${cat.title}] ${r}`)));
  return {
    date: todayParts().iso,
    name: state.name.trim(),
    rules: lines,
    done: $('doneCheck').checked
  };
}

function setStatus(msg, isErr) {
  const el = $('sendStatus');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
}

async function postToSheet(payload) {
  // text/plain 으로 보내면 CORS 사전요청(preflight) 없이 Apps Script로 전달됨
  const res = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data || data.result !== 'success') throw new Error((data && data.message) || '전송 실패');
}

function getPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return []; }
}
function setPending(list) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(list)); } catch (e) {}
}
async function flushPending() {
  const list = getPending();
  if (!list.length || GAS_URL.includes('여기에_')) return;
  const rest = [];
  for (const p of list) {
    try { await postToSheet(p); } catch (e) { rest.push(p); }
  }
  setPending(rest);
}

async function sendToTeacher() {
  if (GAS_URL.includes('여기에_')) {
    setStatus('선생님 설정이 필요해요. (app.js의 GAS_URL 입력)', true);
    return;
  }
  const btn = $('btnSend');
  const payload = buildPayload();
  btn.disabled = true;
  setStatus('보내는 중...');
  try {
    await postToSheet(payload);
    setStatus('선생님께 잘 전달되었어요! ✅');
    toast('전송 완료 📮');
  } catch (err) {
    console.error(err);
    const list = getPending();
    list.push(payload);
    setPending(list);
    setStatus('지금은 보낼 수 없어요. 인터넷이 연결되면 자동으로 다시 보낼게요.', true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 이벤트 연결 / 초기화 ---------- */
function init() {
  loadState();

  const nameInput = $('studentName');
  nameInput.value = state.name;
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    updateGreeting();
    saveState();
  });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameInput.blur(); });

  $('btnMakeCard').addEventListener('click', makeCard);
  $('btnBack').addEventListener('click', () => { showScreen('screen-main'); renderCategories(); });
  $('btnSave').addEventListener('click', saveCard);
  $('btnSend').addEventListener('click', sendToTeacher);

  $('btnAddCustom').addEventListener('click', addCustomRule);
  $('customInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addCustomRule(); }
  });
  $('btnModalDone').addEventListener('click', closeModal);

  window.addEventListener('resize', () => {
    if (!$('modal').hidden) fitRuleList();
    if ($('screen-card').classList.contains('active')) { fitCertificate(); fitCertText(); }
    window.scrollTo(0, 0);
  });
  window.addEventListener('online', flushPending);
  // 어떤 경우에도 화면이 밀리지 않도록 보정
  document.addEventListener('scroll', () => window.scrollTo(0, 0), { passive: true });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  updateGreeting();
  renderCategories();
  flushPending();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

document.addEventListener('DOMContentLoaded', init);
