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

// ── Cloudinary Config ──────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = 'dcqqsp2kz';
const CLOUDINARY_PRESET     = 'kolywy3s';

// ── Preset Activities ──────────────────────────────────────────────────────
const PRESETS = [
  {
    title: 'Life Cycle of a Butterfly',
    successPhrase: 'You got the butterfly life cycle right!',
    levels: {
      word:     { instruction: 'Put these words in order!',    items: [] },
      phrase:   { instruction: 'Put these phrases in order!',  items: [] },
      sentence: {
        instruction: 'Put these steps in the correct order!',
        items: [
          { text: 'A butterfly lays eggs on a leaf.',        image: null },
          { text: 'The eggs hatch into tiny caterpillars.',  image: null },
          { text: 'The caterpillar forms a chrysalis.',      image: null },
          { text: 'A butterfly emerges from the chrysalis!', image: null },
        ],
      },
    },
  },
  {
    title: 'The Hungry Cat',
    successPhrase: 'The cat sat on the mat!',
    levels: {
      word: {
        instruction: 'Unscramble the sentence! Drag the words into the right order.',
        items: [
          { text: 'The', image: null },
          { text: 'cat', image: null },
          { text: 'sat', image: null },
          { text: 'on',  image: null },
          { text: 'the', image: null },
          { text: 'mat', image: null },
        ],
      },
      phrase:   { instruction: 'Put these phrases in order!',  items: [] },
      sentence: { instruction: 'Put these steps in the correct order!', items: [] },
    },
  },
  {
    title: 'Desert Habitat',
    successPhrase: 'Fantastic! You know so much about desert habitats!',
    levels: {
      word:     { instruction: 'Put these words in order!',   items: [] },
      phrase:   { instruction: 'Put these phrases in order!', items: [] },
      sentence: {
        instruction: 'Order these habitat facts from smallest to biggest idea.',
        items: [
          { text: 'A cactus grows in the hot, dry desert.',             image: null },
          { text: 'Lizards and snakes live near the cactus.',           image: null },
          { text: 'Deserts get very little rain each year.',            image: null },
          { text: 'Deserts can be found on every continent on Earth.',  image: null },
        ],
      },
    },
  },
  {
    title: 'Ecosystem Food Chain',
    successPhrase: 'Amazing! You just built a food chain!',
    levels: {
      word:     { instruction: 'Put these words in order!',   items: [] },
      phrase:   { instruction: 'Put these phrases in order!', items: [] },
      sentence: {
        instruction: 'Put these living things in order from producer to top predator.',
        items: [
          { text: 'Grass gets energy from the sun.',           image: null },
          { text: 'A grasshopper eats the grass.',             image: null },
          { text: 'A frog catches and eats the grasshopper.',  image: null },
          { text: 'A hawk swoops down and eats the frog.',     image: null },
        ],
      },
    },
  },
];

// ── State ──────────────────────────────────────────────────────────────────
let currentRobotId  = null;
let robot           = null;
let robotConnected  = false;
// let resources    = [];  // Teacher Materials (disabled)
let languageLevel   = 'sentence';
let lastResultTs    = 0;    // prevent duplicate result triggers

const STUCK_PHRASE = "Uh-oh, I'm stuck. Let's try that again!";

// ── Activity Queue ─────────────────────────────────────────────────────────
let activityQueue  = [];
let activeIndex    = 0;
let dragSrcIndex   = null;

function storageKey() { return `emar_queue_robot${currentRobotId}`; }

function migrateActivity(act) {
  if (act.levels) return act;
  return {
    title:         act.title         || 'Untitled',
    successPhrase: act.successPhrase || '',
    levels: {
      word:     { instruction: '',                    items: [] },
      phrase:   { instruction: '',                    items: [] },
      sentence: { instruction: act.instruction || '', items: act.items || [] },
    },
  };
}

function _loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) {
      const data    = JSON.parse(raw);
      activityQueue = (data.queue || []).map(migrateActivity);
      activeIndex   = data.activeIndex || 0;
    }
  } catch (e) { /* corrupted */ }
  if (activityQueue.length === 0) {
    activityQueue = PRESETS.map(p => JSON.parse(JSON.stringify(p)));
    activeIndex   = 0;
  }
}

function loadQueueFromStorage() {
  function applyAndRender() {
    if (activeIndex >= activityQueue.length) activeIndex = 0;
    renderQueue();
    loadActivityIntoEditor(activeIndex);
  }

  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/teacherQueue`)
      .once('value',
        snapshot => {
          const data = snapshot.val();
          if (data && data.queue && data.queue.length > 0) {
            activityQueue = data.queue.map(migrateActivity);
            activeIndex   = data.activeIndex || 0;
          } else {
            _loadFromLocalStorage();
          }
          applyAndRender();
        },
        error => {
          console.warn('Firebase queue load failed:', error);
          _loadFromLocalStorage();
          applyAndRender();
        }
      );
  } catch (e) {
    _loadFromLocalStorage();
    applyAndRender();
  }
}

function saveQueueToStorage() {
  const data = { queue: activityQueue, activeIndex };
  // Save to localStorage (instant local backup)
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch (e) {}
  // Save to Firebase (persistent, cross-device)
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/teacherQueue`)
      .set(data)
      .catch(e => console.warn('Firebase queue save failed:', e));
  } catch (e) {}
}

function renderQueue() {
  const container = document.getElementById('queueList');
  if (!container) return;
  container.innerHTML = '';
  activityQueue.forEach((act, i) => {
    const div = document.createElement('div');
    div.className = 'queue-item' + (i === activeIndex ? ' active' : '');
    div.draggable = true;
    div.innerHTML = `
      <span class="queue-drag">&#8942;</span>
      <span class="queue-num">${i + 1}</span>
      <span class="queue-title">${esc(act.title || 'Untitled')}</span>
      <button class="queue-rm" title="Remove" onclick="event.stopPropagation();removeActivity(${i})">&#10005;</button>`;
    div.addEventListener('click', () => selectActivity(i));
    div.addEventListener('dragstart', e => {
      dragSrcIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => div.classList.add('dragging'), 0);
    });
    div.addEventListener('dragend', () => {
      dragSrcIndex = null;
      document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('dragging', 'drag-over'));
    });
    div.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('drag-over'));
      div.classList.add('drag-over');
    });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over'));
    div.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      if (dragSrcIndex === null || dragSrcIndex === i) return;
      saveCurrentToQueue();
      const moved = activityQueue.splice(dragSrcIndex, 1)[0];
      activityQueue.splice(i, 0, moved);
      if      (activeIndex === dragSrcIndex)                              activeIndex = i;
      else if (dragSrcIndex < i && activeIndex > dragSrcIndex && activeIndex <= i) activeIndex--;
      else if (dragSrcIndex > i && activeIndex < dragSrcIndex && activeIndex >= i) activeIndex++;
      renderQueue();
      saveQueueToStorage();
    });
    container.appendChild(div);
  });
}

function selectActivity(i) {
  saveCurrentToQueue();
  activeIndex = i;
  renderQueue();
  loadActivityIntoEditor(i);
}

function loadActivityIntoEditor(i) {
  const act = activityQueue[i];
  if (!act) return;
  document.getElementById('edTitle').value   = act.title         || '';
  document.getElementById('edSuccess').value = act.successPhrase || '';
  const lvl = (act.levels || {})[languageLevel] || { instruction: '', items: [] };
  document.getElementById('edInstruction').value = lvl.instruction || '';
  renderEditorItems(lvl.items || []);
  updateEditorLevelTabs();
}

function saveCurrentToQueue() {
  if (!activityQueue.length) return;
  const rows  = document.querySelectorAll('#editorItems .editor-item');
  const items = Array.from(rows).map(row => ({
    text:  row.querySelector('.item-text-input').value.trim(),
    image: row.querySelector('.item-img-input').value.trim() || null,
  })).filter(item => item.text);
  const act = activityQueue[activeIndex];
  if (!act.levels) act.levels = { word: { instruction:'', items:[] }, phrase: { instruction:'', items:[] }, sentence: { instruction:'', items:[] } };
  act.title         = document.getElementById('edTitle').value.trim()   || 'Untitled';
  act.successPhrase = document.getElementById('edSuccess').value.trim() || '';
  act.levels[languageLevel] = {
    instruction: document.getElementById('edInstruction').value.trim() || '',
    items,
  };
  renderQueue();
  saveQueueToStorage();
}

function addActivity() {
  saveCurrentToQueue();
  activityQueue.push({
    title: 'New Activity',
    successPhrase: 'Great job!',
    levels: {
      word:     { instruction: 'Put these words in order!',    items: [] },
      phrase:   { instruction: 'Put these phrases in order!',  items: [] },
      sentence: { instruction: 'Put these steps in the correct order!', items: [] },
    },
  });
  activeIndex = activityQueue.length - 1;
  renderQueue();
  loadActivityIntoEditor(activeIndex);
  saveQueueToStorage();
}

function removeActivity(i) {
  if (activityQueue.length <= 1) return;
  activityQueue.splice(i, 1);
  if (activeIndex >= activityQueue.length) activeIndex = activityQueue.length - 1;
  renderQueue();
  loadActivityIntoEditor(activeIndex);
  saveQueueToStorage();
}

function saveQueue() {
  saveCurrentToQueue();
  saveQueueToStorage();
  showSaveStatus('✓ Saved!');
}

function showSaveStatus(msg) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'save-status ok';
  setTimeout(() => { el.textContent = ''; el.className = 'save-status'; }, 3000);
}

function skipToNext() {
  if (activityQueue.length < 2) { showPushStatus('Only one activity in the queue.', 'error'); return; }
  saveCurrentToQueue();
  activeIndex = (activeIndex + 1) % activityQueue.length;
  renderQueue();
  loadActivityIntoEditor(activeIndex);
  saveQueueToStorage();
  pushToStudent();
}

// ── Initialization ─────────────────────────────────────────────────────────
function initFlexi() {
  currentRobotId = Number(new URLSearchParams(window.location.search).get('robot') || 0);

  // Connect to Firebase and check if the robot backend is actually online.
  // We listen to /robots/{id}/state/ — the backend writes this when it's running.
  // If that path has no data within 5 seconds we mark the robot as offline.
  try {
    robot = new Robot(currentRobotId);
    Robot.initialize();

    let statusResolved = false;

    firebase.database()
      .ref(`/robots/${currentRobotId}/state`)
      .once('value', snapshot => {
        statusResolved = true;
        const hasState = snapshot.val() !== null;
        robotConnected = hasState;
        setRobotStatus(hasState);
      })
      .catch(() => {
        statusResolved = true;
        setRobotStatus(false);
      });

    // Fallback: if Firebase doesn't respond in 5s, show offline
    setTimeout(() => {
      if (!statusResolved) setRobotStatus(false);
    }, 5000);

    // Keep status in sync — goes offline/online as robot backend starts/stops
    firebase.database()
      .ref(`/robots/${currentRobotId}/state`)
      .on('value', snapshot => {
        const online = snapshot.val() !== null;
        robotConnected = online;
        setRobotStatus(online);
      });

  } catch (e) {
    console.warn('Firebase unavailable — standalone mode:', e);
    setRobotStatus(false);
  }

  // Set student screen link
  const base = window.location.href.replace(/\/robotsetting\/.*$/, '');
  const studentUrl = `${base}/robotdisplay/sentence-student.html?robot=${currentRobotId}`;
  const linkEl = document.getElementById('studentLink');
  linkEl.href        = studentUrl;
  linkEl.textContent = studentUrl;

  // Load activity queue from localStorage (falls back to presets if empty)
  loadQueueFromStorage();

  // Listen for student results
  listenForResults();
}

function setRobotStatus(connected) {
  robotConnected = connected;
  document.getElementById('statusDot').className  = `status-dot ${connected ? 'dot-on' : 'dot-off'}`;
  document.getElementById('statusText').textContent = connected ? 'Robot connected' : 'Robot not connected (standalone)';
  document.getElementById('robotBadge').textContent = connected ? '🤖 Connected' : '⚠ No robot';
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
      <div style="display:flex;gap:6px;align-items:center;">
        <input class="item-img-input" type="url"
               placeholder="Image URL (optional — or upload ▶)"
               value="${esc(imgUrl)}"
               style="flex:1;">
        <label style="cursor:pointer;white-space:nowrap;padding:4px 9px;
                      background:#1a56a0;color:white;border-radius:7px;
                      font-size:0.8rem;flex-shrink:0;" title="Upload image from computer">
          📤 Upload
          <input type="file" accept="image/*" style="display:none"
                 onchange="uploadItemImage(this)">
        </label>
      </div>
      <div class="item-img-preview" style="display:${imgUrl ? 'block' : 'none'};margin-top:4px;">
        ${imgUrl ? `<img src="${esc(imgUrl)}" style="max-height:56px;border-radius:6px;border:1px solid #dde;">` : ''}
      </div>
    </div>
    <button class="item-remove" onclick="removeEditorItem(this)" title="Remove">&#10005;</button>`;

  // Sync preview when URL is typed manually
  const urlInput = row.querySelector('.item-img-input');
  const preview  = row.querySelector('.item-img-preview');
  urlInput.addEventListener('change', () => {
    const url = urlInput.value.trim();
    preview.style.display = url ? 'block' : 'none';
    preview.innerHTML     = url
      ? `<img src="${url}" style="max-height:56px;border-radius:6px;border:1px solid #dde;">`
      : '';
  });

  return row;
}

function uploadItemImage(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const row         = fileInput.closest('.editor-item');
  const urlInput    = row.querySelector('.item-img-input');
  const preview     = row.querySelector('.item-img-preview');
  const uploadLabel = fileInput.parentElement;
  const origText    = uploadLabel.childNodes[0].textContent;

  uploadLabel.childNodes[0].textContent = ' Uploading…';
  uploadLabel.style.background = '#888';

  const formData = new FormData();
  formData.append('file',          file);
  formData.append('upload_preset', CLOUDINARY_PRESET);

  fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body:   formData,
  })
    .then(res => res.ok ? res.json() : res.json().then(err => { throw err; }))
    .then(data => {
      urlInput.value        = data.secure_url;
      preview.style.display = 'block';
      preview.innerHTML     = `<img src="${data.secure_url}" style="max-height:56px;border-radius:6px;border:1px solid #dde;">`;
      uploadLabel.childNodes[0].textContent = origText;
      uploadLabel.style.background = '#1a56a0';
      saveCurrentToQueue();
    })
    .catch(err => {
      console.error('Image upload failed:', err);
      alert('Image upload failed. Check the console for details.');
      uploadLabel.childNodes[0].textContent = origText;
      uploadLabel.style.background = '#1a56a0';
    });

  fileInput.value = '';
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

  // Push to Firebase regardless of robot hardware status
  // (robot connection only affects physical robot actions like speak/moveNeck)
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/pushed`)
      .set(Object.assign({}, activity, { _pushedAt: Date.now() }))
      .then(() => { showPushStatus('✓ Pushed to student screen!', 'ok'); startWaitingMotion(); showAnsweringState(); })
      .catch(e => showPushStatus('Firebase error: ' + e.message, 'error'));
  } catch (e) {
    showPushStatus('Firebase unavailable — check your connection.', 'error');
  }
}

function showPushStatus(msg, type) {
  const el = document.getElementById('pushStatus');
  el.textContent = msg;
  el.className   = `push-status ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'push-status'; }, 4000);
}

// ── Robot Motion ───────────────────────────────────────────────────────────
let waitingMotionInterval = null;
let motionTimeouts = [];

function clearMotionTimeouts() {
  motionTimeouts.forEach(id => clearTimeout(id));
  motionTimeouts = [];
}

function mot(fn, delay) {
  motionTimeouts.push(setTimeout(fn, delay));
}

function startWaitingMotion() {
  if (!robotConnected || !robot || !Robot.currentMotorState) return;
  stopWaitingMotion();
  clearMotionTimeouts();
  try {
    // Reset head to neutral, then tilt left/right 3 times and stop
    robot.moveNeck(0, -1100, 0, 0);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck( 150, 0, 0, 0); }, 600);   // tilt right (1)
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(-450, 0, 0, 0); }, 1200);  // tilt left  (2)
    mot(() => { if (Robot.currentMotorState) robot.moveNeck( 300, 0, 0, 0); }, 1800);  // back center (3)
  } catch (e) {}
}

function stopWaitingMotion() {
  if (waitingMotionInterval) {
    clearInterval(waitingMotionInterval);
    waitingMotionInterval = null;
  }
}

function playCorrectMotion() {
  if (!robotConnected || !robot || !Robot.currentMotorState) return;
  stopWaitingMotion();
  clearMotionTimeouts();
  try {
    // Tilt up/down 3 times, return to starting position
    robot.moveNeck(0,  200, 0, 0);                                                        // up   (1)
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, -400, 0, 0); }, 500);     // down
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0,  400, 0, 0); }, 1000);    // up   (2)
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, -400, 0, 0); }, 1500);    // down
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0,  400, 0, 0); }, 2000);    // up   (3)
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, -200, 0, 0); }, 2500);    // return to neutral
  } catch (e) {}
}

function playStuckMotion() {
  if (!robotConnected || !robot || !Robot.currentMotorState) return;
  stopWaitingMotion();
  clearMotionTimeouts();
  try {
    // Negative tilt = lower head (sad)
    robot.moveNeck(0, -200, 0, 0);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0, -300); }, 600);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0,  600); }, 1200);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0, -600); }, 1800);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0,  300); }, 2400);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 200, 0,   0); }, 3000);   // return to neutral
  } catch (e) {}
}

// ── Teacher Commands ───────────────────────────────────────────────────────
function sendCommand(type) {
  // if (!robotConnected) return;
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/command`)
      .set({ type, timestamp: Date.now() });
    if (type === 'reset' || type === 'tryAgain') showAnsweringState();
  } catch (e) { console.warn('Command send failed:', e); }
}

// ── Language Level ─────────────────────────────────────────────────────────
function switchEditorLevel(level) {
  saveCurrentToQueue();
  languageLevel = level;
  const act = activityQueue[activeIndex];
  if (act) {
    const lvl = (act.levels || {})[level] || { instruction: '', items: [] };
    document.getElementById('edInstruction').value = lvl.instruction || '';
    renderEditorItems(lvl.items || []);
  }
  updateEditorLevelTabs();
}

function updateEditorLevelTabs() {
  document.querySelectorAll('#editorLevelTabs .level-btn, .level-btn[data-level]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.level === languageLevel)
  );
}

function setLevel(level) {
  switchEditorLevel(level);
}

// ── Student Result Listener ────────────────────────────────────────────────
function listenForResults() {
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/result`)
      .on('value', snapshot => {
        const data = snapshot.val();
        if (!data || data.timestamp <= lastResultTs) return;
        lastResultTs = data.timestamp;
        handleStudentResult(data.isCorrect);
      });
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/studentStatus`)
      .on('value', snapshot => {
        const data = snapshot.val();
        if (data && data.status === 'answering') showAnsweringState();
      });
  } catch (e) { console.warn('Result listener failed:', e); }
}

function handleStudentResult(isCorrect) {
  const activity = readActivity();

  if (isCorrect) {
    updateResultBox(true, activity.successPhrase || '');
    robotSpeak(activity.successPhrase || 'Wonderful! You did it!');
    playCorrectMotion();
  } else {
    updateResultBox(false);
    robotSpeak(STUCK_PHRASE);
    playStuckMotion();
  }
}

function robotSpeak(text) {
  if (robotConnected) {
    try { Robot._requestRobotAction('speak', { text }); } catch (e) { /* standalone */ }
  }
}

function showAnsweringState() {
  const box = document.getElementById('resultBox');
  box.className = 'result-box answering';
  box.innerHTML = `
    <div class="result-emoji">✏️</div>
    <div class="result-label">Student is answering…</div>
    <div class="result-time"></div>`;
}

function updateResultBox(isCorrect, successPhrase) {
  const box = document.getElementById('resultBox');
  const now = new Date().toLocaleTimeString();
  if (isCorrect) {
    box.className = 'result-box correct';
    box.innerHTML = `
      <div class="result-emoji">🎉</div>
      <div class="result-label">Amazing! You got it right!</div>
      ${successPhrase ? `<div class="result-sub">${esc(successPhrase)}</div>` : ''}
      <div class="result-time">at ${now}</div>`;
  } else {
    box.className = 'result-box incorrect';
    box.innerHTML = `
      <div class="result-emoji">🤔</div>
      <div class="result-label">Hmm, I'm stuck…</div>
      <div class="result-sub">Let's try that again!</div>
      <div class="result-time">at ${now}</div>`;
  }
}

// ── Static Content (Teacher Materials — disabled) ──────────────────────────
// function handleUpload(e) {
//   Array.from(e.target.files).forEach(file => {
//     resources.push({ name: file.name, url: URL.createObjectURL(file) });
//     renderResources();
//   });
//   e.target.value = '';
// }
//
// function addLink() {
//   const input = document.getElementById('linkInput');
//   const url   = input.value.trim();
//   if (!url) return;
//   resources.push({ name: url, url });
//   input.value = '';
//   renderResources();
// }
//
// function removeResource(i) {
//   resources.splice(i, 1);
//   renderResources();
// }
//
// function renderResources() {
//   document.getElementById('resourceList').innerHTML =
//     resources.map((r, i) => `
//       <li class="resource-item">
//         <a href="${r.url}" target="_blank" rel="noopener">${r.name}</a>
//         <button class="resource-rm" onclick="removeResource(${i})">&#10005;</button>
//       </li>`).join('');
// }

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

// Save before page refresh / close
window.addEventListener('beforeunload', () => saveCurrentToQueue());
