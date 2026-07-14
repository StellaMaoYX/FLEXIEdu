/* ═══════════════════════════════════════════════════════════════════════════
 * FLEXI Student Interface — drag-from-bank-to-slot design
 * Upper area: numbered answer slots (horizontal)
 * Lower area: shuffled word-bank bubbles
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── State ──────────────────────────────────────────────────────────────────
let currentActivity  = null;
let slots            = [];   // array of N: null or item object
let bank             = [];   // unplaced items
let languageLevel    = 'sentence';
let currentRobotId   = null;
let feedbackIsCorrect = false;
let lastCommandTs    = 0;

// drag state
let dragSrc = null;  // { from: 'slot'|'bank', index: number }

const STUCK_PHRASE = "Uh-oh, I'm stuck. Let's try that again!";

// ── Initialization ─────────────────────────────────────────────────────────
function initStudent() {
  currentRobotId = Number(new URLSearchParams(window.location.search).get('robot') || 0);

  firebase.database()
    .ref(`/robots/${currentRobotId}/flexi/pushed`)
    .on('value', snapshot => {
      const data = snapshot.val();
      if (!data || !data.items) return;
      const rawItems = Array.isArray(data.items) ? data.items : Object.values(data.items);
      if (rawItems.length > 0) startActivity({ ...data, items: rawItems });
    });

  firebase.database()
    .ref(`/robots/${currentRobotId}/flexi/command`)
    .on('value', snapshot => {
      const data = snapshot.val();
      if (!data || data.timestamp <= lastCommandTs) return;
      lastCommandTs = data.timestamp;
      handleCommand(data.type);
    });

  firebase.database()
    .ref(`/robots/${currentRobotId}/flexi/languageLevel`)
    .on('value', snapshot => {
      const level = snapshot.val();
      if (level) {
        languageLevel = level;
        document.getElementById('levelBadge').textContent =
          level.charAt(0).toUpperCase() + level.slice(1);
        if (currentActivity) render();
      }
    });
}

// ── Start / Reset Activity ─────────────────────────────────────────────────
function startActivity(data) {
  currentActivity = data;
  languageLevel   = data.languageLevel || 'sentence';

  const items = data.items.map((item, i) => ({ ...item, origIdx: i }));
  slots = new Array(items.length).fill(null);
  bank  = shuffle([...items]);

  document.getElementById('waitingScreen').style.display  = 'none';
  document.getElementById('activityScreen').style.display = 'block';
  document.getElementById('activityTitle').textContent       = data.title;
  document.getElementById('activityInstruction').textContent = data.instruction;
  document.getElementById('levelBadge').textContent =
    languageLevel.charAt(0).toUpperCase() + languageLevel.slice(1);

  hideFeedback();
  render();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Teacher Commands ───────────────────────────────────────────────────────
function handleCommand(type) {
  if (!currentActivity) return;
  if (type === 'reset' || type === 'tryAgain') {
    const items = currentActivity.items.map((item, i) => ({ ...item, origIdx: i }));
    slots = new Array(items.length).fill(null);
    bank  = shuffle([...items]);
    hideFeedback();
    render();
    if (type === 'tryAgain') speakText(STUCK_PHRASE);
  } else if (type === 'repeat') {
    speakText(currentActivity.instruction);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render() {
  renderSlots();
  renderBank();
  updateCheckBtn();
}

function renderSlots() {
  const container = document.getElementById('answerSlots');
  container.innerHTML = '';

  slots.forEach((item, i) => {
    const slot = document.createElement('div');
    slot.className   = 'answer-slot' + (item ? ' filled' : '');
    slot.dataset.idx = i;

    const num = document.createElement('span');
    num.className   = 'slot-num';
    num.textContent = i + 1;
    slot.appendChild(num);

    if (item) {
      const content = document.createElement('div');
      content.className = 'slot-content';
      if (item.image) {
        const img = document.createElement('img');
        img.className = 'slot-img';
        img.src = item.image;
        img.alt = item.text;
        content.appendChild(img);
      }
      const text = document.createElement('div');
      text.className   = 'slot-text';
      text.textContent = item.text;
      content.appendChild(text);

      const speakBtn = document.createElement('button');
      speakBtn.className   = 'slot-speak';
      speakBtn.textContent = '🔊';
      speakBtn.title = 'Listen';
      speakBtn.onclick = e => { e.stopPropagation(); speakText(item.text); };
      content.appendChild(speakBtn);

      slot.appendChild(content);

      // Tap filled slot → return to bank
      slot.addEventListener('click', () => returnSlotToBank(i));

      // Drag from filled slot
      slot.setAttribute('draggable', 'true');
      slot.addEventListener('dragstart', e => {
        dragSrc = { from: 'slot', index: i };
        e.dataTransfer.effectAllowed = 'move';
        slot.style.opacity = '0.4';
      });
      slot.addEventListener('dragend', () => { slot.style.opacity = ''; });

    } else {
      const hint = document.createElement('span');
      hint.className   = 'slot-empty-hint';
      hint.textContent = '+';
      slot.appendChild(hint);
    }

    // Drop onto slot
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      dropOnSlot(i);
    });

    container.appendChild(slot);
  });

  // Drop on the zone itself (between slots)
  container.addEventListener('dragover', e => {
    e.preventDefault();
    container.classList.add('drag-over-zone');
  });
  container.addEventListener('dragleave', () => container.classList.remove('drag-over-zone'));
  container.addEventListener('drop', e => {
    e.preventDefault();
    container.classList.remove('drag-over-zone');
    // Drop on zone background → place in first empty slot
    const firstEmpty = slots.indexOf(null);
    if (firstEmpty !== -1) dropOnSlot(firstEmpty);
  });
}

function renderBank() {
  const container = document.getElementById('bankItems');
  container.innerHTML = '';

  if (bank.length === 0) {
    const hint = document.createElement('div');
    hint.className   = 'bank-empty-hint';
    hint.textContent = 'All placed!';
    container.appendChild(hint);
  }

  bank.forEach((item, i) => {
    const bubble = document.createElement('div');
    bubble.className   = 'bank-bubble';
    bubble.dataset.idx = i;

    if (item.image) {
      const img = document.createElement('img');
      img.className = 'bubble-img';
      img.src = item.image;
      img.alt = item.text;
      bubble.appendChild(img);
    }

    const text = document.createElement('span');
    text.textContent = item.text;
    bubble.appendChild(text);

    const speakBtn = document.createElement('button');
    speakBtn.className   = 'bubble-speak';
    speakBtn.textContent = '🔊';
    speakBtn.title = 'Listen';
    speakBtn.onclick = e => { e.stopPropagation(); speakText(item.text); };
    bubble.appendChild(speakBtn);

    // Tap bubble → auto-place in first empty slot
    bubble.addEventListener('click', e => {
      if (e.target.closest('.bubble-speak')) return;
      const firstEmpty = slots.indexOf(null);
      if (firstEmpty !== -1) {
        slots[firstEmpty] = bank.splice(i, 1)[0];
        render();
      }
    });

    // Drag from bank
    bubble.setAttribute('draggable', 'true');
    bubble.addEventListener('dragstart', e => {
      dragSrc = { from: 'bank', index: i };
      e.dataTransfer.effectAllowed = 'move';
      bubble.classList.add('dragging');
    });
    bubble.addEventListener('dragend', () => bubble.classList.remove('dragging'));

    container.appendChild(bubble);
  });

  // Drop on bank → return slot item to bank
  container.addEventListener('dragover', e => {
    e.preventDefault();
    container.classList.add('drag-over-zone');
  });
  container.addEventListener('dragleave', () => container.classList.remove('drag-over-zone'));
  container.addEventListener('drop', e => {
    e.preventDefault();
    container.classList.remove('drag-over-zone');
    if (dragSrc && dragSrc.from === 'slot') {
      const item = slots[dragSrc.index];
      if (item) {
        bank.push(item);
        slots[dragSrc.index] = null;
        dragSrc = null;
        render();
      }
    } else {
      dragSrc = null;
    }
  });
}

// ── Drag Drop Helpers ──────────────────────────────────────────────────────
function dropOnSlot(targetSlotIdx) {
  if (!dragSrc) return;

  if (dragSrc.from === 'bank') {
    const item = bank.splice(dragSrc.index, 1)[0];
    // If slot already has something, push it back to bank
    if (slots[targetSlotIdx]) bank.push(slots[targetSlotIdx]);
    slots[targetSlotIdx] = item;

  } else if (dragSrc.from === 'slot') {
    const srcIdx = dragSrc.index;
    if (srcIdx === targetSlotIdx) { dragSrc = null; return; }
    // Swap the two slots
    [slots[srcIdx], slots[targetSlotIdx]] = [slots[targetSlotIdx], slots[srcIdx]];
  }

  dragSrc = null;
  render();
}

function returnSlotToBank(i) {
  if (!slots[i]) return;
  bank.push(slots[i]);
  slots[i] = null;
  render();
}

function updateCheckBtn() {
  const btn = document.getElementById('checkBtn');
  const allFilled = slots.every(s => s !== null);
  btn.disabled = !allFilled;
}

// ── Answer Checking ────────────────────────────────────────────────────────
function checkAnswer() {
  if (!currentActivity) return;
  const isCorrect = slots.every((item, i) => item && item.origIdx === i);

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
  document.querySelectorAll('.answer-slot').forEach(el => {
    el.classList.remove('state-incorrect');
    el.classList.add('state-correct');
  });
  showFeedback('overlay-correct', '🎉', 'Amazing! You got it right!',
    currentActivity.successPhrase || '', null, null);
  speakText(currentActivity.successPhrase || 'Wonderful! You did it!');
}

function showStuck() {
  feedbackIsCorrect = false;
  document.querySelectorAll('.answer-slot').forEach(el => {
    el.classList.remove('state-correct');
    el.classList.add('state-incorrect');
    setTimeout(() => el.classList.remove('state-incorrect'), 400);
  });
  showFeedback('overlay-stuck', '🤔', "Hmm, I'm stuck…",
    "Let's try that again!", '💪 Try Again', 'btn-tryagain');
  speakText(STUCK_PHRASE);
}

function showFeedback(overlayClass, emoji, title, sub, btnLabel, btnClass) {
  const overlay = document.getElementById('feedbackOverlay');
  overlay.className = `feedback-overlay show ${overlayClass}`;
  document.getElementById('fbEmoji').textContent = emoji;
  document.getElementById('fbTitle').textContent = title;
  document.getElementById('fbSub').textContent   = sub;
  const btn  = document.getElementById('fbBtn');
  const wait = document.getElementById('fbWait');
  if (btnLabel) {
    btn.textContent   = btnLabel;
    btn.className     = `fb-btn ${btnClass}`;
    btn.style.display = '';
    if (wait) wait.style.display = 'none';
  } else {
    btn.style.display = 'none';
    if (wait) wait.style.display = 'block';
  }
}

function hideFeedback() {
  document.getElementById('feedbackOverlay').className = 'feedback-overlay';
}

function onFeedbackBtn() {
  hideFeedback();
  if (!feedbackIsCorrect) {
    const items = currentActivity.items.map((item, i) => ({ ...item, origIdx: i }));
    slots = new Array(items.length).fill(null);
    bank  = shuffle([...items]);
    render();
    try {
      firebase.database()
        .ref(`/robots/${currentRobotId}/flexi/studentStatus`)
        .set({ status: 'answering', timestamp: Date.now() });
    } catch (e) {}
  }
}

// ── Vocabulary Audio ───────────────────────────────────────────────────────
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
