/* ═══════════════════════════════════════════════════════════════════════════
 * FLEXI Student Interface
 * - Reads activity data from Firebase (pushed by teacher)
 * - Renders drag-and-drop / arrow-based sequencing activity
 * - Submits results back to Firebase (teacher monitors + triggers robot)
 * - Responds to teacher control commands (reset, tryAgain, skip, repeat)
 *
 * Firebase paths (under /robots/{robotId}/flexi/):
 *   pushed        – activity data from teacher
 *   command       – control commands from teacher
 *   languageLevel – level set by teacher
 *   result        – result this page writes after student checks answer
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
let currentActivity  = null;
let currentItems     = [];      // items in display order; each: {...item, origIdx}
let selectedIndex    = null;    // tap-to-move selection
let languageLevel    = 'sentence';
let currentRobotId   = null;
let dragSrcIndex     = null;
let feedbackIsCorrect = false;
let lastCommandTs    = 0;

const STUCK_PHRASE = "Uh-oh, I'm stuck. Let's try that again!";

// ── Initialization ─────────────────────────────────────────────────────────
function initStudent() {
  currentRobotId = Number(new URLSearchParams(window.location.search).get('robot') || 0);

  // Listen for activity pushed by teacher
  firebase.database()
    .ref(`/robots/${currentRobotId}/flexi/pushed`)
    .on('value', snapshot => {
      const data = snapshot.val();
      if (data && data.items && data.items.length > 0) {
        startActivity(data);
      }
    });

  // Listen for teacher commands
  firebase.database()
    .ref(`/robots/${currentRobotId}/flexi/command`)
    .on('value', snapshot => {
      const data = snapshot.val();
      if (!data || data.timestamp <= lastCommandTs) return;
      lastCommandTs = data.timestamp;
      handleCommand(data.type);
    });

  // Listen for language level changes
  firebase.database()
    .ref(`/robots/${currentRobotId}/flexi/languageLevel`)
    .on('value', snapshot => {
      const level = snapshot.val();
      if (level) {
        languageLevel = level;
        document.getElementById('levelBadge').textContent =
          level.charAt(0).toUpperCase() + level.slice(1);
        if (currentActivity) {
          renderScaffold();
          renderItems();
        }
      }
    });
}

// ── Start / Reset Activity ─────────────────────────────────────────────────
function startActivity(data) {
  currentActivity = data;
  languageLevel   = data.languageLevel || 'sentence';
  selectedIndex   = null;

  currentItems = data.items.map((item, i) => ({ ...item, origIdx: i }));
  shuffle(currentItems);

  document.getElementById('waitingScreen').style.display  = 'none';
  document.getElementById('activityScreen').style.display = 'block';
  document.getElementById('activityTitle').textContent       = data.title;
  document.getElementById('activityInstruction').textContent = data.instruction;
  document.getElementById('levelBadge').textContent =
    languageLevel.charAt(0).toUpperCase() + languageLevel.slice(1);

  renderScaffold();
  renderItems();
  hideFeedback();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ── Teacher Commands ───────────────────────────────────────────────────────
function handleCommand(type) {
  if (!currentActivity) return;
  if (type === 'reset' || type === 'tryAgain') {
    currentItems = currentActivity.items.map((item, i) => ({ ...item, origIdx: i }));
    shuffle(currentItems);
    selectedIndex = null;
    hideFeedback();
    renderItems();
    if (type === 'tryAgain') speakText(STUCK_PHRASE);
  } else if (type === 'repeat') {
    speakText(currentActivity.instruction);
  }
  // 'skip' is handled by the teacher pushing a new activity via 'pushed'
}

// ── Visual Scaffold ────────────────────────────────────────────────────────
function renderScaffold() {
  const container = document.getElementById('scaffoldSlots');
  container.innerHTML = currentActivity.items.map((item, i) => {
    const len = getLevelText(item).length;
    const px  = Math.max(28, Math.min(220, len * 10));
    return `
      <div class="scaffold-slot">
        <div class="scaffold-num">${i + 1}</div>
        <div class="scaffold-line" style="width:${px}px;"></div>
      </div>`;
  }).join('');
}

// ── Language Level ─────────────────────────────────────────────────────────
function getLevelText(item) {
  const words = item.text.split(' ');
  if (languageLevel === 'word')   return words.slice(0, 2).join(' ');
  if (languageLevel === 'phrase') return words.slice(0, Math.ceil(words.length / 2)).join(' ');
  return item.text;
}

// ── Item Rendering ─────────────────────────────────────────────────────────
function renderItems() {
  const section = document.getElementById('itemsSection');
  section.innerHTML = '';

  currentItems.forEach((item, i) => {
    const displayText = getLevelText(item);
    const safeText    = displayText.replace(/'/g, '&#39;').replace(/"/g, '&quot;');

    const div = document.createElement('div');
    div.className   = 'word-item';
    div.dataset.idx = i;
    if (i === selectedIndex) div.classList.add('selected');

    div.innerHTML = `
      <span class="drag-handle">&#8285;</span>
      <span class="item-num">${i + 1}.</span>
      ${item.image ? `<img class="item-img" src="${item.image}" alt="${safeText}">` : ''}
      <button class="item-text-btn" onclick="speakText('${safeText}')">${displayText}</button>
      <button class="speak-btn" onclick="speakText('${safeText}')" title="Listen">&#128266;</button>
      <div class="arrow-btns">
        <button class="arrow-btn" onclick="moveItem(${i},${i - 1})" ${i === 0 ? 'disabled' : ''}>&#9650;</button>
        <button class="arrow-btn" onclick="moveItem(${i},${i + 1})" ${i === currentItems.length - 1 ? 'disabled' : ''}>&#9660;</button>
      </div>`;

    // HTML5 drag & drop (desktop / Android)
    div.setAttribute('draggable', 'true');
    div.addEventListener('dragstart',  onDragStart);
    div.addEventListener('dragover',   onDragOver);
    div.addEventListener('dragleave',  onDragLeave);
    div.addEventListener('drop',       onDrop);
    div.addEventListener('dragend',    onDragEnd);

    // Tap-to-select (iOS / touch fallback)
    div.addEventListener('click', e => {
      if (e.target.closest('.item-text-btn, .speak-btn, .arrow-btn')) return;
      onItemTap(i);
    });

    section.appendChild(div);
  });
}

// ── Tap-to-Move ────────────────────────────────────────────────────────────
function onItemTap(i) {
  if (selectedIndex === null) {
    selectedIndex = i;
  } else if (selectedIndex === i) {
    selectedIndex = null;
  } else {
    [currentItems[selectedIndex], currentItems[i]] = [currentItems[i], currentItems[selectedIndex]];
    selectedIndex = null;
  }
  renderItems();
}

// ── Arrow Move ─────────────────────────────────────────────────────────────
function moveItem(from, to) {
  if (to < 0 || to >= currentItems.length) return;
  const [item] = currentItems.splice(from, 1);
  currentItems.splice(to, 0, item);
  selectedIndex = null;
  renderItems();
}

// ── Drag & Drop ────────────────────────────────────────────────────────────
function onDragStart(e) {
  dragSrcIndex = Number(e.currentTarget.dataset.idx);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragSrcIndex));
}
function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  const targetIdx = Number(e.currentTarget.dataset.idx);
  e.currentTarget.classList.remove('drag-over');
  if (dragSrcIndex !== null && dragSrcIndex !== targetIdx) {
    const [item] = currentItems.splice(dragSrcIndex, 1);
    currentItems.splice(targetIdx, 0, item);
    selectedIndex = null;
    renderItems();
  }
}
function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  dragSrcIndex = null;
  document.querySelectorAll('.word-item').forEach(el => el.classList.remove('drag-over'));
}

// ── Answer Checking ────────────────────────────────────────────────────────
function checkAnswer() {
  if (!currentActivity) return;
  const isCorrect = currentItems.every((item, i) => item.origIdx === i);

  // Write result to Firebase so teacher sees it and triggers robot
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/result`)
      .set({ isCorrect, timestamp: Date.now() });
  } catch (e) { console.warn('Result write failed:', e); }

  if (isCorrect) {
    showCorrect();
  } else {
    showStuck();
  }
}

function showCorrect() {
  feedbackIsCorrect = true;
  document.querySelectorAll('.word-item').forEach(el => {
    el.classList.remove('state-incorrect');
    el.classList.add('state-correct');
  });
  showFeedback(
    'overlay-correct', '🎉',
    'Amazing! You got it right!',
    currentActivity.successPhrase || '',
    'Continue →', 'btn-continue'
  );
  speakText(currentActivity.successPhrase || 'Wonderful! You did it!');
}

function showStuck() {
  feedbackIsCorrect = false;
  document.querySelectorAll('.word-item').forEach(el => {
    el.classList.remove('state-correct');
    el.classList.add('state-incorrect');
    setTimeout(() => el.classList.remove('state-incorrect'), 400);
  });
  showFeedback(
    'overlay-stuck', '🤔',
    "Hmm, I'm stuck…",
    "Let's try that again!",
    '💪 Try Again', 'btn-tryagain'
  );
  speakText(STUCK_PHRASE);
}

function showFeedback(overlayClass, emoji, title, sub, btnLabel, btnClass) {
  const overlay = document.getElementById('feedbackOverlay');
  overlay.className = `feedback-overlay show ${overlayClass}`;
  document.getElementById('fbEmoji').textContent = emoji;
  document.getElementById('fbTitle').textContent = title;
  document.getElementById('fbSub').textContent   = sub;
  const btn = document.getElementById('fbBtn');
  btn.textContent = btnLabel;
  btn.className   = `fb-btn ${btnClass}`;
}

function hideFeedback() {
  document.getElementById('feedbackOverlay').className = 'feedback-overlay';
}

function onFeedbackBtn() {
  hideFeedback();
  if (!feedbackIsCorrect) {
    currentItems = currentActivity.items.map((item, i) => ({ ...item, origIdx: i }));
    shuffle(currentItems);
    selectedIndex = null;
    renderItems();
    try {
      firebase.database()
        .ref(`/robots/${currentRobotId}/flexi/studentStatus`)
        .set({ status: 'answering', timestamp: Date.now() });
    } catch (e) {}
  }
}

// ── Vocabulary Audio (Web Speech API — works offline / behind firewalls) ───
function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.lang   = 'en-US';
  utt.rate   = 0.88;
  utt.pitch  = 1.0;
  window.speechSynthesis.speak(utt);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Config !== 'undefined' && typeof Database !== 'undefined') {
    try {
      new Database(new Config().config, initStudent);
    } catch (e) {
      console.error('Firebase required for student screen:', e);
    }
  }
});
