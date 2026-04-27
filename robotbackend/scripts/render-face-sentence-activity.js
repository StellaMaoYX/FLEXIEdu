/* ═══════════════════════════════════════════════════════════════════════════
 * render-face-sentence-activity.js
 * Drives the robot face SVG for the sentence ordering activity.
 *
 * Three states:
 *   working – smiling, looking around, gentle blink (default)
 *   correct – big green smile, fast blink, sparkle overlay
 *   stuck   – sad frown, eyes down, animated teardrops
 *
 * Switches state by listening to Firebase:
 *   /robots/{id}/flexi/result   → correct or stuck
 *   /robots/{id}/flexi/pushed   → back to working (new activity loaded)
 *   /robots/{id}/flexi/command  → reset / tryAgain → back to working
 * ═══════════════════════════════════════════════════════════════════════════ */

(function () {

  // ── State constants ────────────────────────────────────────────────────────
  const STATE_WORKING = 'working';
  const STATE_CORRECT = 'correct';
  const STATE_STUCK   = 'stuck';

  let currentFaceState = null;

  // ── Face parameter presets ─────────────────────────────────────────────────
  const PARAMS_WORKING = {
    isHorizontal:          1,
    backgroundColor:       '#1a56a0',   // matches student page primary blue
    eyeOuterRadiusPercent: 7,
    eyeOuterColor:         '#cfe2ff',
    eyeInnerColor:         '#000',
    hasBlinking:           1,
    avgBlinkTime:          5000,
    hasMouth:              1,
    mouthWPercent:         12,
    mouthYPercent:         80,
    mouthH:                28,
    mouthColor:            '#cfe2ff',
    mouthStrokeWidth:      10,
    mouthSlope:            22,
    hasNose:               0,
    hasText:               0,
  };

  const PARAMS_CORRECT = {
    isHorizontal:          1,
    backgroundColor:       '#146e3c',   // matches student page correct overlay
    eyeOuterRadiusPercent: 7,
    eyeOuterColor:         '#b7f5d1',
    eyeInnerColor:         '#000',
    hasBlinking:           1,
    avgBlinkTime:          1200,        // rapid excited blinking
    hasMouth:              1,
    mouthWPercent:         15,
    mouthYPercent:         80,
    mouthH:                38,
    mouthColor:            '#b7f5d1',
    mouthStrokeWidth:      12,
    mouthSlope:            24,
    hasNose:               0,
    hasText:               0,
  };

  const PARAMS_STUCK = {
    isHorizontal:          1,
    backgroundColor:       '#46465a',   // matches student page stuck overlay
    eyeOuterRadiusPercent: 7,
    eyeOuterColor:         '#c8c8d8',
    eyeInnerColor:         '#000',
    hasBlinking:           0,           // still, heavy eyes
    avgBlinkTime:          99999,
    hasMouth:              1,
    mouthWPercent:         11,
    mouthYPercent:         80,
    mouthH:                26,
    mouthColor:            '#9090a8',
    mouthStrokeWidth:      10,
    mouthSlope:            20,
    hasNose:               0,
    hasText:               0,
  };

  // ── State transitions ──────────────────────────────────────────────────────
  function applyState(state) {
    if (state === currentFaceState) return;
    currentFaceState = state;

    stopSparkles();
    removeTears();

    if (state === STATE_CORRECT) {
      Object.assign(Face.parameters, PARAMS_CORRECT);
      Face.isMouthInverted  = false;
      Face.isMouthExtended  = true;
      Eyes.isLookingAround  = true;
      Face.draw();
      startSparkles();
      setLabel('Correct! ✅');

    } else if (state === STATE_STUCK) {
      Object.assign(Face.parameters, PARAMS_STUCK);
      Face.isMouthInverted  = true;
      Face.isMouthExtended  = true;
      Eyes.isLookingAround  = false;
      Eyes.currentLookAt    = 'down';
      Face.draw();
      addTears();
      setLabel("Uh-oh… let's try again");

    } else {
      // working (default)
      Object.assign(Face.parameters, PARAMS_WORKING);
      Face.isMouthInverted  = false;
      Face.isMouthExtended  = true;
      Eyes.isLookingAround  = true;
      Face.draw();
      setLabel('Thinking… 🤔');
    }
  }

  function setLabel(text) {
    const el = document.getElementById('stateLabel');
    if (el) el.textContent = text;
  }

  // ── Resize handler – redraw without re-triggering state guards ─────────────
  function redraw() {
    Face.draw();
    if (currentFaceState === STATE_STUCK) {
      removeTears();
      addTears();
    }
  }

  // ── Sparkles (correct state) ───────────────────────────────────────────────
  const SPARKLE_CHARS = ['⭐', '✨', '🌟', '💫', '🎉', '🎊', '⚡'];

  function startSparkles() {
    const layer = document.getElementById('sparkleLayer');
    layer.innerHTML = '';
    layer.style.display = 'block';
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className    = 'sparkle';
      el.textContent  = SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)];
      el.style.left   = (5 + Math.random() * 88) + '%';
      el.style.top    = (30 + Math.random() * 50) + '%';
      el.style.setProperty('--dur',   (2.2 + Math.random() * 2.4).toFixed(1) + 's');
      el.style.setProperty('--delay', (i * 0.35 + Math.random() * 0.5).toFixed(2) + 's');
      layer.appendChild(el);
    }
  }

  function stopSparkles() {
    const layer = document.getElementById('sparkleLayer');
    if (layer) { layer.style.display = 'none'; layer.innerHTML = ''; }
  }

  // ── Animated teardrops (stuck state) ──────────────────────────────────────
  function addTears() {
    const svg = document.getElementById('faceSVG');
    const w   = svg.clientWidth;
    const h   = svg.clientHeight;

    [['tearLeft', 0.34], ['tearRight', 0.66]].forEach(([id, xFrac]) => {
      const cx    = w * xFrac;
      const startY = h * 0.60;
      const rx    = w * 0.013;
      const ry    = w * 0.020;

      const drop = document.createElementNS(svgNS, 'ellipse');
      drop.setAttribute('id',   id);
      drop.setAttribute('cx',   cx);
      drop.setAttribute('cy',   startY);
      drop.setAttribute('rx',   rx);
      drop.setAttribute('ry',   ry);
      drop.setAttribute('fill', '#89CFF0');

      // Fall downward
      const fall = document.createElementNS(svgNS, 'animateTransform');
      fall.setAttribute('attributeName', 'transform');
      fall.setAttribute('type',          'translate');
      fall.setAttribute('values',        '0 0; 0 ' + Math.round(h * 0.22));
      fall.setAttribute('dur',           '1.6s');
      fall.setAttribute('repeatCount',   'indefinite');
      fall.setAttribute('calcMode',      'spline');
      fall.setAttribute('keySplines',    '0.3 0.7 0.8 1');
      drop.appendChild(fall);

      // Fade in then out
      const fade = document.createElementNS(svgNS, 'animate');
      fade.setAttribute('attributeName', 'opacity');
      fade.setAttribute('values',        '0; 0.85; 0');
      fade.setAttribute('dur',           '1.6s');
      fade.setAttribute('repeatCount',   'indefinite');
      drop.appendChild(fade);

      svg.appendChild(drop);
    });
  }

  function removeTears() {
    ['tearLeft', 'tearRight'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  // ── Firebase listeners ─────────────────────────────────────────────────────
  let lastResultTs = 0;

  function startListening(robotId) {
    const db = firebase.database();

    // Student result → correct or stuck
    db.ref(`/robots/${robotId}/flexi/result`).on('value', snap => {
      const data = snap.val();
      if (!data || data.timestamp <= lastResultTs) return;
      lastResultTs = data.timestamp;
      applyState(data.isCorrect ? STATE_CORRECT : STATE_STUCK);
    });

    // New activity pushed → return to working
    db.ref(`/robots/${robotId}/flexi/pushed`).on('value', snap => {
      if (snap.val()) applyState(STATE_WORKING);
    });

    // Teacher command reset / tryAgain → return to working
    db.ref(`/robots/${robotId}/flexi/command`).on('value', snap => {
      const cmd = snap.val();
      if (!cmd) return;
      if (cmd.type === 'reset' || cmd.type === 'tryAgain') applyState(STATE_WORKING);
    });
  }

  // ── Demo mode (cycles through all states when Firebase is unavailable) ─────
  function runDemo() {
    const cycle = [STATE_WORKING, STATE_CORRECT, STATE_STUCK];
    let i = 0;
    applyState(cycle[i]);
    setInterval(() => {
      i = (i + 1) % cycle.length;
      applyState(cycle[i]);
    }, 4000);
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  function init() {
    new Face();
    window.addEventListener('resize', redraw);

    const robotId = Number(new URLSearchParams(window.location.search).get('robot') || 0);

    applyState(STATE_WORKING);

    try {
      if (typeof Config !== 'undefined' && typeof Database !== 'undefined') {
        new Database(new Config().config, () => startListening(robotId));
      } else {
        runDemo();
      }
    } catch (e) {
      console.warn('Firebase unavailable — running demo mode:', e);
      runDemo();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

})();
