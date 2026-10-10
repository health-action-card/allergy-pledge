'use strict';

/* =========================================================
   알레르기 예방 행동수칙 웹앱 (Vanilla JS)
   ========================================================= */

/* ---------- 설정 ---------- */
// ★ Apps Script 웹 앱 배포 후 받은 URL(…/exec)을 여기에 붙여 넣으세요.
const GAS_URL = 'https://script.google.com/macros/s/여기에_배포_ID를_붙여넣기/exec';

const STORAGE_KEY = 'allergy-card-v1';
const MAX_CUSTOM = 3;       // 카테고리당 '나만의 수칙' 최대 개수 (모달이 한 화면에 들어오도록 제한)
const CERT_RATIO = 1.5;     // 카드 가로:세로 비율

/* ---------- 기본 제공 수칙 데이터 (여기만 고치면 문구 변경 가능) ---------- */
const CATEGORIES = [
  {
    id: 'home',
    label: '집에서',
    emoji: '🏠',
    rules: [
      '내 이불 정리와 방바닥 먼지 청소하기',
      '창문 열고 10분 환기하기',
      '비누, 샴푸 성분 확인하기',
      '책상과 책장 구석 물티슈로 닦기',
      '하루 15분 규칙적으로 운동하기',
    ],
  },
  {
    id: 'school',
    label: '학교에서',
    emoji: '🏫',
    rules: [
      '친구의 알레르기 유발 음식 억지로 권하지 않기',
      '알레르기 증상 있는 친구 놀리지 않기',
      '알레르기로 힘든 친구 다정하게 돕기',
      '내 알레르기 상태와 비상약 위치 미리 알리기',
      '응급상황 시 큰 소리로 선생님 부르고 119 신고 외치기',
    ],
  },
  {
    id: 'outdoor',
    label: '외부활동 시',
    emoji: '🌳',
    rules: [
      '꽃가루/먼지 심한 날 마스크 쓰기',
      '외출 후 비누로 꼼꼼하게 손 씻기',
      '풀밭에 함부로 눕지 않고 얇은 긴 옷 입기',
      '필요시 에피네프린 자가 주사기 챙기기',
      '가려울 때 비비지 말고 어른께 말씀드려 병원 가기',
    ],
  },
];

/* =========================================================
   한글 조사 자동 변환
   받침 있음 → 은/이/을/과/으로,  받침 없음 → 는/가/를/와/로
   ========================================================= */
function lastCharInfo(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return { batchim: false, rieul: false };
  const code = ch.charCodeAt(0);

  if (code >= 0xAC00 && code <= 0xD7A3) {            // 한글 음절
    const jong = (code - 0xAC00) % 28;
    return { batchim: jong !== 0, rieul: jong === 8 };
  }
  if (/[0-9]/.test(ch)) {                            // 숫자: 영·일·삼·육·칠·팔은 받침 있음
    return { batchim: '013678'.includes(ch), rieul: ch === '1' || ch === '6' || ch === '7' || ch === '8' };
  }
  return { batchim: false, rieul: false };           // 그 밖의 글자는 받침 없음으로 처리
}

/** josa('하늘', '은/는') → '은' / josa('민수', '이/가') → '가' */
function josa(word, pair) {
  const [withB, withoutB] = pair.split('/');
  const info = lastCharInfo(word);
  if (pair === '으로/로' && info.rieul) return withoutB;   // ㄹ 받침은 '로'
  return info.batchim ? withB : withoutB;
}

/* ---------- 카드용: 성을 뺀 이름 + 부르는 말 ----------
   · 3글자 이상이면 성을 뺍니다. (김효현 → 효현, 남궁민수 → 민수)
   · 1~2글자는 성을 뺄 수 없으므로 입력한 그대로 씁니다. (하늘 → 하늘)
   · 받침이 있으면 '이'를 붙여 부르는 말로 만듭니다. (효현 → 효현이, 민수 → 민수) */
const DOUBLE_SURNAMES = ['남궁', '황보', '제갈', '선우', '독고', '사공', '서문', '동방', '어금', '망절'];

function givenName(fullName) {
  const n = String(fullName).replace(/\s+/g, '');
  if (n.length >= 4 && DOUBLE_SURNAMES.includes(n.slice(0, 2))) return n.slice(2);
  if (n.length >= 3) return n.slice(1);
  return n;
}

/** 효현 → '효현이', 민수 → '민수' */
function callName(fullName) {
  const g = givenName(fullName);
  return lastCharInfo(g).batchim ? `${g}이` : g;
}

/** callJosa('김효현', '는') → '효현이는' / callJosa('김효현', '의') → '효현이의' */
function callJosa(fullName, particle) {
  return `${callName(fullName)}${particle}`;
}

/* =========================================================
   상태 / 저장
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);

function emptyState() {
  const byCat = () => Object.fromEntries(CATEGORIES.map(c => [c.id, []]));
  return { name: '', selected: byCat(), custom: byCat(), done: false, doneDate: '' };
}

function loadState() {
  const base = emptyState();
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw) return base;
    if (typeof raw.name === 'string') base.name = raw.name.slice(0, 10);
    CATEGORIES.forEach(c => {
      const pick = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string').slice(0, 20) : []);
      base.custom[c.id] = pick(raw.custom && raw.custom[c.id]).slice(0, MAX_CUSTOM);
      const valid = [...c.rules, ...base.custom[c.id]];
      base.selected[c.id] = pick(raw.selected && raw.selected[c.id]).filter(s => valid.includes(s));
    });
    base.done = !!raw.done;
    base.doneDate = typeof raw.doneDate === 'string' ? raw.doneDate : '';
  } catch (e) { /* 저장소를 못 쓰는 환경이면 새로 시작 */ }
  return base;
}

const state = loadState();

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}

/* ---------- 헬퍼 ---------- */
const allRules = cat => [...cat.rules, ...state.custom[cat.id]];
const chosen = cat => allRules(cat).filter(r => state.selected[cat.id].includes(r));
const totalChosen = () => CATEGORIES.reduce((n, c) => n + chosen(c).length, 0);
const pad2 = n => String(n).padStart(2, '0');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function todayKorean() {
  const d = new Date();
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* =========================================================
   화면 전환 (SPA)
   ========================================================= */
function showScreen(name) {
  $('#screen-main').classList.toggle('active', name === 'main');
  $('#screen-card').classList.toggle('active', name === 'card');
  if (name === 'card') requestAnimationFrame(layoutCertificate);
}

/* =========================================================
   1. 메인 화면
   ========================================================= */
function buildCategoryButtons() {
  const wrap = $('#cats');
  CATEGORIES.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cat';
    btn.dataset.id = c.id;

    const badge = document.createElement('span');
    badge.className = 'cat-badge';
    badge.setAttribute('aria-hidden', 'true');

    const emoji = document.createElement('span');
    emoji.className = 'cat-emoji';
    emoji.textContent = c.emoji;

    const label = document.createElement('span');
    label.className = 'cat-label';
    label.textContent = c.label;

    const count = document.createElement('span');
    count.className = 'cat-count';

    btn.append(badge, emoji, label, count);
    btn.addEventListener('click', () => openModal(c.id));
    wrap.append(btn);
  });
}

function renderMain() {
  const name = state.name.trim();
  $('#subtitle').textContent = name
    ? `${name}${josa(name, '은/는')} 어떤 수칙을 지킬까요?`
    : '이름을 쓰고, 지키고 싶은 수칙을 골라 보세요';

  CATEGORIES.forEach(c => {
    const btn = $(`.cat[data-id="${c.id}"]`);
    const n = chosen(c).length;
    $('.cat-count', btn).textContent = n ? `${n}개 골랐어요` : '눌러서 수칙 고르기';
    btn.classList.toggle('has', n > 0);
  });
}

/* =========================================================
   2. 카테고리 모달
   ========================================================= */
let activeCat = null;
const modal = $('#modal');

function openModal(catId) {
  activeCat = CATEGORIES.find(c => c.id === catId);
  $('#dialog').dataset.cat = catId;
  $('#modal-emoji').textContent = activeCat.emoji;
  $('#modal-title').textContent = `${activeCat.label} 지킬 수칙`;
  $('#add-input').value = '';
  renderModalList();
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  activeCat = null;
  document.activeElement && document.activeElement.blur();
  renderMain();
}

function renderModalList() {
  const cat = activeCat;
  const list = $('#rule-list');
  list.textContent = '';

  allRules(cat).forEach((text, i) => {
    const isCustom = i >= cat.rules.length;
    const li = document.createElement('li');
    li.className = 'rule-row';

    const label = document.createElement('label');
    label.className = 'rule';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = state.selected[cat.id].includes(text);
    label.classList.toggle('on', input.checked);
    input.addEventListener('change', () => {
      toggleRule(cat.id, text, input.checked);
      label.classList.toggle('on', input.checked);
      $('#modal-count').textContent = `${chosen(cat).length}개 선택`;
    });

    const box = document.createElement('span');
    box.className = 'box';
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = text;           // textContent 사용 → 학생이 입력한 글자가 코드로 실행되지 않음

    label.append(input, box, txt);
    li.append(label);

    if (isCustom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.textContent = '×';
      del.setAttribute('aria-label', `"${text}" 수칙 지우기`);
      del.addEventListener('click', () => removeCustom(cat.id, text));
      li.append(del);
    }
    list.append(li);
  });

  $('#modal-count').textContent = `${chosen(cat).length}개 선택`;

  const full = state.custom[cat.id].length >= MAX_CUSTOM;
  const addInput = $('#add-input');
  addInput.disabled = full;
  $('#add-btn').disabled = full;
  addInput.placeholder = full
    ? `나만의 수칙은 ${MAX_CUSTOM}개까지 추가할 수 있어요`
    : '나만의 수칙 추가하기';
}

function toggleRule(catId, text, on) {
  const arr = state.selected[catId];
  const idx = arr.indexOf(text);
  if (on && idx < 0) arr.push(text);
  if (!on && idx >= 0) arr.splice(idx, 1);
  saveState();
}

function addCustom() {
  const cat = activeCat;
  const input = $('#add-input');
  const text = input.value.trim().replace(/\s+/g, ' ');

  if (!text) { toast('추가할 수칙을 써 주세요'); input.focus(); return; }
  if (state.custom[cat.id].length >= MAX_CUSTOM) return;
  if (allRules(cat).includes(text)) { toast('이미 있는 수칙이에요'); input.focus(); return; }

  state.custom[cat.id].push(text);
  state.selected[cat.id].push(text);      // 추가한 수칙은 바로 선택됨
  saveState();
  input.value = '';
  renderModalList();
  if (!input.disabled) input.focus();
}

function removeCustom(catId, text) {
  state.custom[catId] = state.custom[catId].filter(t => t !== text);
  state.selected[catId] = state.selected[catId].filter(t => t !== text);
  saveState();
  renderModalList();
}

/* =========================================================
   3. 행동수칙 카드 (상장 스타일)
   ========================================================= */
function buildCertificate() {
  const name = state.name.trim();

  // 본문: "위 학생 ○○○은/는 … 약속합니다."
  const p = $('#cert-text');
  p.textContent = '';
  const nm = document.createElement('span');
  nm.className = 'cert-name';
  nm.textContent = callName(name);                 // 예: 김효현 → 효현이
  p.append(
    '위 학생 ',
    nm,
    '는 알레르기 예방 관리 수업을 마치고, 나와 친구와 가족의 건강을 지키기 위해 아래의 행동수칙을 꼭 실천할 것을 약속합니다.'
  );

  // 선택한 수칙 (고른 카테고리만 표시)
  const box = $('#cert-rules');
  box.textContent = '';
  const cols = CATEGORIES.map(c => ({ c, items: chosen(c) })).filter(x => x.items.length);
  box.style.setProperty('--n', cols.length);

  cols.forEach(({ c, items }) => {
    const col = document.createElement('div');
    col.className = 'cr-col';
    col.dataset.id = c.id;

    const head = document.createElement('div');
    head.className = 'cr-head';
    head.textContent = `${c.emoji} ${c.label}`;

    const ul = document.createElement('ul');
    ul.className = 'cr-list';
    items.forEach(t => {
      const li = document.createElement('li');
      const dot = document.createElement('i');
      dot.className = 'dot';
      li.append(dot, document.createTextNode(t));
      ul.append(li);
    });

    col.append(head, ul);
    box.append(col);
  });

  $('#cert-date').textContent = todayKorean();
  $('#cert-sign-name').textContent = name;

  // 오늘의 실천 체크 상태 복원 (날짜가 바뀌면 자동 해제)
  $('#done-check').checked = state.done && state.doneDate === todayISO();
  resetSendButton();
}

/** 카드 크기를 화면에 맞추고, 수칙이 많으면 글자 크기를 자동으로 줄여 한 화면에 담기 */
function layoutCertificate() {
  const stage = $('#cert-stage');
  const cert = $('#certificate');
  const aw = stage.clientWidth;
  const ah = stage.clientHeight;
  if (!aw || !ah) return;

  const w = Math.floor(Math.min(aw, ah * CERT_RATIO));
  const h = Math.floor(w / CERT_RATIO);
  cert.style.width = `${w}px`;
  cert.style.height = `${h}px`;
  cert.style.fontSize = `${w / 50}px`;

  const rules = $('#cert-rules');
  let s = 1.25;                                   // 수칙이 적으면 크게 시작
  rules.style.fontSize = `${s}em`;
  while (rules.scrollHeight > rules.clientHeight + 1 && s > 0.5) {
    s -= 0.03;
    rules.style.fontSize = `${s}em`;
  }
}

/* ---------- 태블릿에 카드 저장 (html2canvas) ---------- */
async function saveCard() {
  if (typeof html2canvas === 'undefined') {
    toast('저장 도구를 불러오지 못했어요. 인터넷에 연결한 뒤 다시 눌러 주세요');
    return;
  }
  const btn = $('#btn-save');
  btn.disabled = true;
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    const node = $('#certificate');
    const canvas = await html2canvas(node, {
      scale: Math.max(2, 2000 / node.offsetWidth),   // 가로 약 2000px 이상의 선명한 이미지
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    if (!blob) throw new Error('toBlob failed');

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `행동수칙카드_${state.name.trim() || '나'}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    toast('카드를 저장했어요! 내 파일 > 다운로드 폴더에서 볼 수 있어요', 4200);
  } catch (err) {
    console.error(err);
    toast('카드를 저장하지 못했어요. 한 번 더 눌러 주세요');
  } finally {
    btn.disabled = false;
  }
}

/* =========================================================
   4. 선생님께 보내기 (Google Apps Script)
   ========================================================= */
const sendBtn = $('#btn-send');

function resetSendButton() {
  sendBtn.disabled = false;
  sendBtn.classList.remove('sent');
  sendBtn.textContent = '선생님께 보내기';
}

async function sendToTeacher() {
  const name = state.name.trim();
  if (!name || totalChosen() === 0) { toast('이름과 수칙을 먼저 골라 주세요'); return; }
  if (GAS_URL.includes('여기에_배포_ID')) {
    toast('전송 주소가 아직 없어요. 선생님께 알려 주세요 (app.js의 GAS_URL)', 4000);
    return;
  }

  const done = $('#done-check').checked;
  const rules = {};
  CATEGORIES.forEach(c => { rules[c.label] = chosen(c); });

  const payload = { date: todayISO(), name, rules, done };

  sendBtn.disabled = true;
  sendBtn.textContent = '보내는 중…';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    // Apps Script는 응답에 CORS 헤더를 주지 않으므로 no-cors + text/plain 으로 보냅니다.
    // (요청은 정상 전달되며, 응답 내용은 읽을 수 없습니다. 네트워크 오류일 때만 catch로 이동)
    await fetch(GAS_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });

    sendBtn.classList.add('sent');
    sendBtn.textContent = '보냈어요! (다시 보내기)';
    toast(done
      ? `${name}${josa(name, '은/는')} 오늘도 해냈어요! 선생님께 보냈어요`
      : `${name}의 약속을 선생님께 보냈어요. 실천하면 체크하고 다시 보내 주세요`, 4200);
  } catch (err) {
    console.error(err);
    toast('보내지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요', 4200);
    resetSendButton();
  } finally {
    clearTimeout(timer);
    sendBtn.disabled = false;
  }
}

/* =========================================================
   이벤트 연결 / 초기화
   ========================================================= */
function init() {
  buildCategoryButtons();

  const nameInput = $('#name-input');
  nameInput.value = state.name;
  nameInput.addEventListener('input', () => {
    state.name = nameInput.value;
    saveState();
    renderMain();
  });
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) nameInput.blur();
  });

  // 모달
  $('#btn-done').addEventListener('click', closeModal);
  $('#add-btn').addEventListener('click', addCustom);
  $('#add-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addCustom(); }
  });
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  // 카드 만들기
  $('#btn-make').addEventListener('click', () => {
    if (!state.name.trim()) {
      const field = $('#name-field');
      field.classList.remove('shake');
      void field.offsetWidth;               // 애니메이션 재시작
      field.classList.add('shake');
      toast('먼저 이름을 써 주세요');
      nameInput.focus();
      return;
    }
    if (totalChosen() === 0) {
      toast('카테고리를 눌러 수칙을 하나 이상 골라 주세요');
      return;
    }
    buildCertificate();
    showScreen('card');
  });

  // 카드 화면
  $('#btn-back').addEventListener('click', () => showScreen('main'));
  $('#btn-save').addEventListener('click', saveCard);
  $('#btn-send').addEventListener('click', sendToTeacher);
  $('#done-check').addEventListener('change', e => {
    state.done = e.target.checked;
    state.doneDate = todayISO();
    saveState();
    if (sendBtn.classList.contains('sent')) resetSendButton();   // 바뀐 내용은 다시 보낼 수 있게
  });

  // 화면 크기 변경 / 폰트 로딩 후 카드 다시 맞추기
  window.addEventListener('resize', () => {
    if ($('#screen-card').classList.contains('active')) layoutCertificate();
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if ($('#screen-card').classList.contains('active')) layoutCertificate();
    });
  }

  renderMain();
}

init();

/* ---------- PWA: 서비스 워커 등록 ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW 등록 실패:', err));
  });
}
