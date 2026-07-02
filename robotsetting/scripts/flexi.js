/* ═══════════════════════════════════════════════════════════════════════════
 * FLEXI Teacher Interface — flexi.js
 *
 * Firebase paths (under /robots/{robotId}/flexi/):
 *   pushed        – activity pushed to student screen
 *   command       – control commands to student (reset, tryAgain, skip, repeat)
 *   languageLevel – language level setting
 *   result        – result written by student after checking answer
 *   studentStatus – student answering / idle status
 *   teacherQueue  – persisted activity queue
 * ═══════════════════════════════════════════════════════════════════════════ */

// ── Cloudinary Config ──────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = 'dcqqsp2kz';
const CLOUDINARY_PRESET     = 'kolywy3s';

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
    instruction: 'Unscramble the sentence!',
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
      { text: 'A cactus grows in the hot, dry desert.',            image: null },
      { text: 'Lizards and snakes live near the cactus.',          image: null },
      { text: 'Deserts get very little rain each year.',           image: null },
      { text: 'Deserts can be found on every continent on Earth.', image: null },
    ],
  },
  {
    title: 'Ecosystem Food Chain',
    instruction: 'Put these living things in order from producer to top predator.',
    successPhrase: 'Amazing! You just built a food chain!',
    items: [
      { text: 'Grass gets energy from the sun.',          image: null },
      { text: 'A grasshopper eats the grass.',            image: null },
      { text: 'A frog catches and eats the grasshopper.', image: null },
      { text: 'A hawk swoops down and eats the frog.',    image: null },
    ],
  },
];

// ── State ──────────────────────────────────────────────────────────────────
let currentRobotId  = null;
let robot           = null;
let robotConnected  = false;
let languageLevel   = 'sentence';
let lastResultTs    = 0;
let resources       = [];    // Teacher Materials list
let motionTimeouts  = [];

const STUCK_PHRASE = "Uh-oh, I'm stuck. Let's try that again!";

// ── Initialization ─────────────────────────────────────────────────────────
function initFlexi() {
  currentRobotId = Number(new URLSearchParams(window.location.search).get('robot') || 0);

  // Populate preset dropdown
  const sel = document.getElementById('presetSelect');
  PRESETS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value       = i;
    opt.textContent = p.title;
    sel.appendChild(opt);
  });

  // Robot connection
  try {
    robot = new Robot(currentRobotId);
    Robot.initialize();

    let resolved = false;
    firebase.database()
      .ref(`/robots/${currentRobotId}/state`)
      .once('value', snap => { resolved = true; setRobotStatus(snap.val() !== null); })
      .catch(() => { resolved = true; setRobotStatus(false); });
    setTimeout(() => { if (!resolved) setRobotStatus(false); }, 5000);

    firebase.database()
      .ref(`/robots/${currentRobotId}/state`)
      .on('value', snap => setRobotStatus(snap.val() !== null));
  } catch (e) {
    setRobotStatus(false);
  }

  // Student screen link
  const base       = window.location.href.replace(/\/robotfrontend\/.*$/, '');
  const studentUrl = `${base}/robotdisplay/sentence-student.html?robot=${currentRobotId}`;
  const linkEl     = document.getElementById('studentLink');
  linkEl.href        = studentUrl;
  linkEl.textContent = studentUrl;

  listenForResults();
}

function setRobotStatus(connected) {
  robotConnected = connected;
  document.getElementById('statusDot').className   = `status-dot ${connected ? 'dot-on' : 'dot-off'}`;
  document.getElementById('statusText').textContent = connected ? 'Robot connected' : 'Robot not connected (standalone)';
  document.getElementById('robotBadge').textContent = connected ? '🤖 Connected' : '⚠ No robot';
}

// ── Preset Loader ──────────────────────────────────────────────────────────
function loadPreset() {
  const idx    = Number(document.getElementById('presetSelect').value);
  const preset = PRESETS[idx];
  if (!preset) return;
  document.getElementById('edTitle').value       = preset.title;
  document.getElementById('edInstruction').value = preset.instruction;
  document.getElementById('edSuccess').value     = preset.successPhrase;
  renderEditorItems(preset.items);
}

// ── Editor Item Building ───────────────────────────────────────────────────
function buildRow(index, text, imgUrl) {
  const row = document.createElement('div');
  row.className   = 'editor-item';
  row.dataset.idx = index;
  row.innerHTML = `
    <span class="item-order-num">${index + 1}</span>
    <div class="item-fields">
      <input class="item-text-input" type="text" placeholder="Word or sentence…"
             value="${esc(text)}">
      <div style="display:flex;gap:6px;align-items:center;">
        <input class="item-img-input" type="url"
               placeholder="Image URL (optional — or upload below)"
               value="${esc(imgUrl)}"
               style="flex:1;">
        <label style="cursor:pointer;white-space:nowrap;
                      padding:5px 10px;background:#1a56a0;color:white;
                      border-radius:7px;font-size:0.82rem;" title="Upload image">
          📤 Upload
          <input type="file" accept="image/*" style="display:none"
                 onchange="uploadItemImage(this)">
        </label>
      </div>
      <div class="item-img-preview" style="display:${imgUrl ? 'block' : 'none'};margin-top:4px;">
        ${imgUrl ? `<img src="${esc(imgUrl)}" style="max-height:60px;border-radius:6px;">` : ''}
      </div>
    </div>
    <button class="item-remove" onclick="removeEditorItem(this)" title="Remove">&#10005;</button>`;

  // Keep preview in sync when URL is typed manually
  const urlInput = row.querySelector('.item-img-input');
  const preview  = row.querySelector('.item-img-preview');
  urlInput.addEventListener('change', () => {
    const url = urlInput.value.trim();
    if (url) {
      preview.style.display = 'block';
      preview.innerHTML     = `<img src="${url}" style="max-height:60px;border-radius:6px;">`;
    } else {
      preview.style.display = 'none';
      preview.innerHTML     = '';
    }
  });

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

function renderEditorItems(items) {
  const container = document.getElementById('editorItems');
  container.innerHTML = '';
  items.forEach((item, i) => container.appendChild(buildRow(i, item.text, item.image || '')));
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

// ── Image Upload (Cloudinary) for Activity Items ───────────────────────────
function uploadItemImage(fileInput) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;

  const row       = fileInput.closest('.editor-item');
  const urlInput  = row.querySelector('.item-img-input');
  const preview   = row.querySelector('.item-img-preview');
  const uploadLabel = fileInput.parentElement;

  const origText = uploadLabel.childNodes[0].textContent;
  uploadLabel.childNodes[0].textContent = ' Uploading…';
  uploadLabel.style.background = '#888';

  const formData = new FormData();
  formData.append('file',           file);
  formData.append('upload_preset',  CLOUDINARY_PRESET);

  fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body:   formData,
  })
    .then(res => {
      if (!res.ok) return res.json().then(err => { throw err; });
      return res.json();
    })
    .then(data => {
      urlInput.value        = data.secure_url;
      preview.style.display = 'block';
      preview.innerHTML     = `<img src="${data.secure_url}" style="max-height:60px;border-radius:6px;">`;
      uploadLabel.childNodes[0].textContent = origText;
      uploadLabel.style.background = '#1a56a0';
    })
    .catch(err => {
      console.error('Image upload failed:', err);
      alert('Image upload failed. Check the console for details.');
      uploadLabel.childNodes[0].textContent = origText;
      uploadLabel.style.background = '#1a56a0';
    });

  // Reset the file input so the same file can be re-uploaded if needed
  fileInput.value = '';
}

// ── Read Editor State ──────────────────────────────────────────────────────
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

  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/pushed`)
      .set(activity)
      .then(() => {
        showPushStatus('✓ Pushed to student screen!', 'ok');
        startWaitingMotion();
        showAnsweringState();
      })
      .catch(e => showPushStatus('Firebase error: ' + e.message, 'error'));
  } catch (e) {
    showPushStatus('Firebase unavailable — check your connection.', 'error');
  }
}

function showPushStatus(msg, type) {
  const el     = document.getElementById('pushStatus');
  el.textContent = msg;
  el.className   = `push-status ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'push-status'; }, 4000);
}

// ── Teacher Commands ───────────────────────────────────────────────────────
function sendCommand(type) {
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/command`)
      .set({ type, timestamp: Date.now() });
    if (type === 'reset' || type === 'tryAgain') showAnsweringState();
  } catch (e) { console.warn('Command send failed:', e); }
}

// ── Language Level ─────────────────────────────────────────────────────────
function setLevel(level) {
  languageLevel = level;
  document.querySelectorAll('.level-btn[data-level]').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.level === level)
  );
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/languageLevel`)
      .set(level);
  } catch (e) {}
}

// ── Student Result Listener ────────────────────────────────────────────────
function listenForResults() {
  try {
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/result`)
      .on('value', snap => {
        const data = snap.val();
        if (!data || data.timestamp <= lastResultTs) return;
        lastResultTs = data.timestamp;
        handleStudentResult(data.isCorrect);
      });
    firebase.database()
      .ref(`/robots/${currentRobotId}/flexi/studentStatus`)
      .on('value', snap => {
        const data = snap.val();
        if (data && data.status === 'answering') showAnsweringState();
      });
  } catch (e) { console.warn('Result listener failed:', e); }
}

function handleStudentResult(isCorrect) {
  const activity = readActivity();
  if (isCorrect) {
    updateResultBox(true, activity.successPhrase);
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
    try { Robot._requestRobotAction('speak', { text }); } catch (e) {}
  }
}

function showAnsweringState() {
  const box     = document.getElementById('resultBox');
  box.className = 'result-box waiting';
  box.innerHTML = `
    <div class="result-emoji">✏️</div>
    <div class="result-label">Student is answering…</div>
    <div class="result-time" id="resultTime"></div>`;
}

function updateResultBox(isCorrect, successPhrase) {
  const box = document.getElementById('resultBox');
  const now = new Date().toLocaleTimeString();
  if (isCorrect) {
    box.className = 'result-box correct';
    box.innerHTML = `
      <div class="result-emoji">🎉</div>
      <div class="result-label">Amazing! You got it right!</div>
      ${successPhrase ? `<div style="font-size:0.85rem;color:#555;margin-top:4px;">${esc(successPhrase)}</div>` : ''}
      <div class="result-time">at ${now}</div>`;
  } else {
    box.className = 'result-box incorrect';
    box.innerHTML = `
      <div class="result-emoji">🤔</div>
      <div class="result-label">Hmm, I'm stuck…</div>
      <div style="font-size:0.85rem;color:#555;margin-top:4px;">Let's try that again!</div>
      <div class="result-time">at ${now}</div>`;
  }
}

// ── Robot Motion ───────────────────────────────────────────────────────────
function mot(fn, delay) {
  motionTimeouts.push(setTimeout(fn, delay));
}

function clearMotion() {
  motionTimeouts.forEach(id => clearTimeout(id));
  motionTimeouts = [];
}

function startWaitingMotion() {
  if (!robotConnected || !robot || !Robot.currentMotorState) return;
  clearMotion();
  try {
    robot.moveNeck(0, -1100, 0, 0);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck( 150, 0, 0, 0); }, 600);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(-450, 0, 0, 0); }, 1200);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck( 300, 0, 0, 0); }, 1800);
  } catch (e) {}
}

function playCorrectMotion() {
  if (!robotConnected || !robot || !Robot.currentMotorState) return;
  clearMotion();
  try {
    robot.moveNeck(0,  200, 0, 0);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, -400, 0, 0); }, 500);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0,  400, 0, 0); }, 1000);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, -400, 0, 0); }, 1500);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0,  400, 0, 0); }, 2000);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, -200, 0, 0); }, 2500);
  } catch (e) {}
}

function playStuckMotion() {
  if (!robotConnected || !robot || !Robot.currentMotorState) return;
  clearMotion();
  try {
    robot.moveNeck(0, -200, 0, 0);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0, -300); }, 600);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0,  600); }, 1200);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0, -600); }, 1800);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 0, 0,  300); }, 2400);
    mot(() => { if (Robot.currentMotorState) robot.moveNeck(0, 200, 0,   0); }, 3000);
  } catch (e) {}
}

// ── Teacher Materials ──────────────────────────────────────────────────────
function handleUpload(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  files.forEach(file => {
    const isImage = file.type.startsWith('image/');
    const isPDF   = file.type === 'application/pdf';

    if (isImage) {
      // Upload image to Cloudinary
      const formData = new FormData();
      formData.append('file',          file);
      formData.append('upload_preset', CLOUDINARY_PRESET);

      fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body:   formData,
      })
        .then(res => res.ok ? res.json() : res.json().then(err => { throw err; }))
        .then(data => {
          resources.push({ name: file.name, url: data.secure_url, type: 'image' });
          renderResources();
        })
        .catch(err => {
          console.error('Material upload failed:', err);
          alert(`Failed to upload ${file.name}. Check the console for details.`);
        });
    } else if (isPDF) {
      // Use local object URL for PDFs (no Cloudinary PDF support on free tier)
      resources.push({ name: file.name, url: URL.createObjectURL(file), type: 'pdf' });
      renderResources();
    }
  });

  e.target.value = '';
}

function addLink() {
  const input = document.getElementById('linkInput');
  const url   = (input.value || '').trim();
  if (!url) return;
  const name = url.length > 50 ? url.slice(0, 50) + '…' : url;
  resources.push({ name, url, type: 'link' });
  input.value = '';
  renderResources();
}

function removeResource(i) {
  resources.splice(i, 1);
  renderResources();
}

function renderResources() {
  const icons = { image: '🖼️', pdf: '📄', link: '🔗' };
  document.getElementById('resourceList').innerHTML = resources.map((r, i) => `
    <li class="resource-item">
      <a href="${r.url}" target="_blank" rel="noopener">${icons[r.type] || '📎'} ${esc(r.name)}</a>
      <button class="resource-rm" onclick="removeResource(${i})" title="Remove">&#10005;</button>
    </li>`).join('');
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
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
