/* ═══════════════════════════════════════════════════════════════════════════
 * FLEXI Teacher Interface
 * - Edits activity content and pushes it to Firebase
 * - Sends control commands (reset, tryAgain, skip, repeat) to student screen
 * - Monitors student results and triggers robot feedback
 *
 * Firebase paths (under /robots/{robotId}/flexi/):
 *   pushed   – activity data the teacher pushed
 *   command  – control commands the teacher sends
 *   result   – result the student submitted
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── Preset Activities ──────────────────────────────────────────────────────
const PRESETS = [
  {
    title: 'Life Cycle of a Butterfly',
    instruction: 'Put these steps in the correct order!',
    successPhrase: 'You got the butterfly life cycle right!',
    items: [
      { text: 'A butterfly lays eggs on a leaf.',        image: null },
      { text: 'The eggs hatch into tiny caterpillars.',  image: null },
      { text: 'The caterpillar forms a chrysalis.',      image: null },
      { text: 'A butterfly emerges from the chrysalis!', image: null },
    ],
  },
  {
    title: 'The Hungry Cat',
    instruction: 'Unscramble the sentence! Drag the words into the right order.',
    successPhrase: 'The cat sat on the mat!',
    items: [
      { text: 'The', image: null },
      { text: 'cat', image: null },
      { text: 'sat', image: null },
      { text: 'on',  image: null },
      { text: 'the', image: null },
      { text: 'mat', image: null },
    ],
  },
  {
    title: 'Desert Habitat',
    instruction: 'Order these habitat facts from smallest to biggest idea.',
    successPhrase: 'Fantastic! You know so much about desert habitats!',
    items: [
      { text: 'A cactus grows in the hot, dry desert.',             image: null },
      { text: 'Lizards and snakes live near the cactus.',           image: null },
      { text: 'Deserts get very little rain each year.',            image: null },
      { text: 'Deserts can be found on every continent on Earth.',  image: null },
    ],
  },
  {
    title: 'Ecosystem Food Chain',
    instruction: 'Put these living things in order from producer to top predator.',
    successPhrase: 'Amazing! You just built a food chain!',
    items: [
      { text: 'Grass gets energy from the sun.',           image: null },
      { text: 'A grasshopper eats the grass.',             image: null },
      { text: 'A frog catches and eats the grasshopper.',  image: null },
      { text: 'A hawk swoops down and eats the frog.',     image: null },
    ],
  },
];

// ── State ──────────────────────────────────────────────────────────────────
let currentRobotId  = null;
let robot           = null;
let robotConnected  = false;
let resources       = [];
let languageLevel   = 'sentence';
let lastResultTs    = 0;    // prevent duplicate result triggers

const STUCK_PHRASE = "Uh-oh, I'm stuck. Let's try that again!";

// ── Initialization ─────────────────────────────────────────────────────────
function initFlexi() {
  currentRobotId = Number(new URLSearchParams(window.location.search).get('robot') || 0);

  // Optional robot connection
  try {
    robot = new Robot(currentRobotId);
    Robot.initialize();
    robotConnected = true;
    setRobotStatus(true);
  } catch (e) {
    console.warn('Robot not connected (standalone):', e);
    setRobotStatus(false);
  }

  // Populate preset selector
  const sel = document.getElementById('presetSelect');
  PRESETS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = p.title;
    sel.appendChild(opt);
  });

  // Set student screen link
  const studentUrl = `${window.location.origin}/robotbackend/flexi-student.html?robot=${currentRobotId}`;
  const linkEl = document.getElementById('studentLink');
  linkEl.href        = studentUrl;
  linkEl.textContent = studentUrl;

  // Load first preset into editor
  loadPreset();

  // Listen for student results
  listenForResults();
}

function setRobotStatus(connected) {
  robotConnected = connected;
  document.getElementById('statusDot').className  = `status-dot ${connected ? 'dot-on' : 'dot-off'}`;
  document.getElementById('statusText').textContent = connected ? 'Robot connected' : 'Robot not connected (standalone)';
  document.getElementById('robotBadge').textContent = connected ? '🤖 Connected' : '⚠ No robot';
}

// ── Preset Loader ──────────────────────────────────────────────────────────
function loadPreset() {
  const idx    = Number(document.getElementById('presetSelect').value);
  const preset = PRESETS[idx];
  document.getElementById('edTitle').value       = preset.title;
  document.getElementById('edInstruction').value = preset.instruction;
  document.getElementById('edSuccess').value     = preset.successPhrase;
  renderEditorItems(preset.items);
}

// ── Editor Item Rendering ──────────────────────────────────────────────────
function renderEditorItems(items) {
  const container = document.getElementById('editorItems');
  container.innerHTML = '';
  items.forEach((item, i) => container.appendChild(buildRow(i, item.text, item.image || '')));
}

function buildRow(index, text, imgUrl) {
  const row = document.createElement('div');
  row.className = 'editor-item';
  row.dataset.idx = index;
  row.innerHTML = `
    <span class="item-order-num">${index + 1}</span>
    <div class="item-fields">
      <input class="item-text-input" type="text" placeholder="Word or sentence…" value="${esc(text)}">
      <input class="item-img-input"  type="url"  placeholder="Image URL (optional)" value="${esc(imgUrl)}">
    </div>
    <button class="item-remove" onclick="removeEditorItem(this)" title="Remove">&#10005;</button>`;
  return row;
}

function esc(s) {
  return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renumber() {
  document.querySelectorAll('.editor-item').forEach((row, i) => {
    row.dataset.idx = i;
    row.querySelector('.item-order-num').textContent = i + 1;
  });
}

function addEditorItem() {
  const container = document.getElementById('editorItems');
  const newIdx    = container.querySelectorAll('.editor-item').length;
  container.appendChild(buildRow(newIdx, '', ''));
}

function removeEditorItem(btn) {
  btn.closest('.editor-item').remove();
  renumber();
}

// ── Read Editor ────────────────────────────────────────────────────────────
function readActivity() {
  const rows  = document.querySelectorAll('#editorItems .editor-item');
  const items = Array.from(rows).map(row => ({
    text:  row.querySelector('.item-text-input').value.trim(),
    image: row.querySelector('.item-img-input').value.trim() || null,
  })).filter(item => item.text);

  return {
    title:         document.getElementById('edTitle').value.trim()       || 'Custom Activity',
    instruction:   document.getElementById('edInstruction').value.trim() || 'Put them in order!',
    successPhrase: document.getElementById('edSuccess').value.trim()     || 'Great job!',
    languageLevel,
    items,
    timestamp: Date.now(),
  };
}

// ── Push to Student Screen ─────────────────────────────────────────────────
function pushToStudent() {
  const activity = readActivity();
  if (activity.items.length === 0) {
    showPushStatus('Please add at least one item.', 'error');
    return;
  }

  if (robotConnected) {
    // Write to Firebase under /robots/{robotId}/flexi/pushed
    try {
      firebase.database()
        .ref(`/robots/${currentRobotId}/flexi/pushed`)
        .set(activity)
        .then(() => showPushStatus('✓ Pushed to student screen!', 'ok'))
        .catch(e => showPushStatus('Firebase error: ' + e.message, 'error'));
    } catch (e) {
      showPushStatus('Firebase unavailable — no robot connected.', 'error');
    }
  } else {
    showPushStatus('Not connected to Firebase. Connect a robot to push live.', 'error');
  }
}

function showPushStatus(msg, type) {
  const el = document.getElementById('pushStatus');
  el.textContent = msg;
  el.className   = `push-status ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'push-status'; }, 4000);
}

// ── Teacher Commands ───────────────────────────────────────────────────────
function sendCommand(type) {
  if (!robotConnected) return;
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/command`)
      .set({ type, timestamp: Date.now() });
  } catch (e) { console.warn('Command send failed:', e); }
}

// ── Language Level ─────────────────────────────────────────────────────────
function setLevel(level) {
  languageLevel = level;
  document.querySelectorAll('.level-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.level === level)
  );
  // Push updated level to student screen if connected
  if (robotConnected) {
    try {
      firebase.database()
        .ref(`/robots/${currentRobotId}/flexi/languageLevel`)
        .set(level);
    } catch (e) { /* standalone */ }
  }
}

// ── Student Result Listener ────────────────────────────────────────────────
function listenForResults() {
  if (!robotConnected) return;
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/result`)
      .on('value', snapshot => {
        const data = snapshot.val();
        if (!data || data.timestamp <= lastResultTs) return;
        lastResultTs = data.timestamp;
        handleStudentResult(data.isCorrect);
      });
  } catch (e) { console.warn('Result listener failed:', e); }
}

function handleStudentResult(isCorrect) {
  const activity = readActivity();

  if (isCorrect) {
    updateResultBox(true);
    // Robot: speak success phrase + celebratory neck nod
    robotSpeak(activity.successPhrase || 'Wonderful! You did it!');
    if (robotConnected && robot && Robot.currentMotorState) {
      try {
        robot.moveNeck(0, 15, 0, 0);
        setTimeout(() => {
          if (Robot.currentMotorState) robot.moveNeck(0, -15, 0, 0);
        }, 700);
      } catch (e) { /* motor not configured */ }
    }
  } else {
    updateResultBox(false);
    // Robot: say stuck phrase (robot physically freezes — no motor commands sent)
    robotSpeak(STUCK_PHRASE);
  }
}

function robotSpeak(text) {
  if (robotConnected) {
    try { Robot._requestRobotAction('speak', { text }); } catch (e) { /* standalone */ }
  }
}

function updateResultBox(isCorrect) {
  const box = document.getElementById('resultBox');
  const now = new Date().toLocaleTimeString();
  if (isCorrect) {
    box.className  = 'result-box correct';
    box.innerHTML  = `
      <div class="result-emoji">✅</div>
      <div class="result-label">Correct!</div>
      <div class="result-time">at ${now}</div>`;
  } else {
    box.className  = 'result-box incorrect';
    box.innerHTML  = `
      <div class="result-emoji">🤔</div>
      <div class="result-label">Not quite — let's try again</div>
      <div class="result-time">at ${now}</div>`;
  }
}

// ── Static Content ─────────────────────────────────────────────────────────
function handleUpload(e) {
  Array.from(e.target.files).forEach(file => {
    resources.push({ name: file.name, url: URL.createObjectURL(file) });
    renderResources();
  });
  e.target.value = '';
}

function addLink() {
  const input = document.getElementById('linkInput');
  const url   = input.value.trim();
  if (!url) return;
  resources.push({ name: url, url });
  input.value = '';
  renderResources();
}

function removeResource(i) {
  resources.splice(i, 1);
  renderResources();
}

function renderResources() {
  document.getElementById('resourceList').innerHTML =
    resources.map((r, i) => `
      <li class="resource-item">
        <a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>
        <button class="resource-rm" onclick="removeResource(${i})">&#10005;</button>
      </li>`).join('');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Config !== 'undefined' && typeof Database !== 'undefined') {
    try {
      new Database(new Config().config, initFlexi);
    } catch (e) {
      console.warn('Firebase init failed — running standalone:', e);
      initFlexi();
    }
  } else {
    initFlexi();
  }
});
