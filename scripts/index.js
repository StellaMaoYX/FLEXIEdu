var robots = null;
var admins = null;

// Initialize Firebase directly
firebase.initializeApp({
  apiKey: "AIzaSyB10dHhQqD1TMXTJfQNLmFkrJtVyQ4JTuA",
  authDomain: "flexi-f7d77.firebaseapp.com",
  databaseURL: "https://flexi-f7d77-default-rtdb.firebaseio.com",
  projectId: "flexi-f7d77",
  storageBucket: "flexi-f7d77.appspot.com",
  messagingSenderId: "441373455093"
});

firebase.auth().onAuthStateChanged(function(user) {
  if (user && !user.isAnonymous) {
    onSignedIn(user);
  } else {
    onSignedOut();
  }
});

function signInWithGoogle() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).then(function(result) {
    if (result && result.user) {
      onSignedIn(result.user);
    }
  }).catch(function(error) {
    if (error.code !== 'auth/cancelled-popup-request' &&
        error.code !== 'auth/popup-closed-by-user') {
      alert('Sign-in failed: ' + error.message);
    }
  });
}

// ── Auth state handlers ──────────────────────────────────────────────────────

function onSignedIn(user) {
  // Show user bar, hide sign-in button
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('userSection').style.display = 'flex';
  document.getElementById('userEmailDisplay').textContent = user.email;
  var avatar = document.getElementById('userAvatar');
  if (user.photoURL) {
    avatar.src = user.photoURL;
    avatar.style.display = 'block';
  } else {
    avatar.style.display = 'none';
  }

  setLaunchButtonsEnabled(true);
  var email = user.email.toLowerCase();

  // Check admin first
  firebase.database().ref('/administrators/').once('value').then(function(snapshot) {
    var data = snapshot.val();
    var adminList = data ? Object.values(data).map(function(e) { return e.toLowerCase(); }) : [];

    if (adminList.includes(email)) {
      showAdminView();
    } else {
      checkTeacherRole(email);
    }
  });
}

function setLaunchButtonsEnabled(enabled) {
  ['btnRobotDisplay', 'btnTeacherDash'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (enabled) {
      el.classList.remove('btn-disabled');
    } else {
      el.classList.add('btn-disabled');
    }
  });
}

function onSignedOut() {
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('userSection').style.display = 'none';
  document.getElementById('adminPanel').classList.remove('visible');
  setRobotIdStatus('locked');
  setLaunchButtonsEnabled(false);
}

function handleSignOut() {
  firebase.auth().signOut().then(onSignedOut);
}

// ── Role views ───────────────────────────────────────────────────────────────

function setButtonUrls(isAdmin, robotId) {
  var params = isAdmin ? '?role=admin' : '?robotId=' + robotId;
  var btnDisplay = document.getElementById('btnRobotDisplay');
  var btnTeacher = document.getElementById('btnTeacherDash');
  if (btnDisplay) btnDisplay.href = 'robotbackend/index.html' + params;
  if (btnTeacher) btnTeacher.href = 'robotfrontend/index.html' + params;
}

function showAdminView() {
  setRobotIdStatus('admin');
  setButtonUrls(true, null);
  var panel = document.getElementById('adminPanel');
  panel.classList.add('visible');
  loadIdEmailList();
  loadRobotList();
  loadAdminList();
}

function checkTeacherRole(email) {
  firebase.database().ref('idEmails').once('value').then(function(snapshot) {
    var data = snapshot.val() || {};
    var robotId = null;
    Object.keys(data).forEach(function(id) {
      if (data[id].email && data[id].email.toLowerCase() === email) {
        robotId = id;
      }
    });
    if (robotId !== null) {
      setRobotIdStatus('teacher', robotId);
      setButtonUrls(false, robotId);
    } else {
      setRobotIdStatus('unknown');
    }
  });
}

// ── Robot ID card states ─────────────────────────────────────────────────────

function setRobotIdStatus(state, robotId) {
  var el = document.getElementById('robotIdStatus');
  if (!el) return;

  if (state === 'locked') {
    el.innerHTML = '<span>🔒</span><span style="color:#9ca3af;font-style:italic;">Please sign in below</span>';
  } else if (state === 'admin') {
    el.innerHTML = '<span>🛡️</span><span style="font-weight:600;color:#6d28d9;">Administrator</span>';
  } else if (state === 'teacher') {
    el.innerHTML = '<span>🤖</span><span style="font-weight:700;font-size:1.1rem;color:#1a1a2e;">Robot ' + robotId + '</span>';
  } else {
    el.innerHTML = '<span>❓</span><span style="color:#991b1b;">No robot assigned — contact an admin</span>';
  }
}

// ── Admin: Email ↔ User ID ───────────────────────────────────────────────────

function loadIdEmailList() {
  firebase.database().ref('idEmails').on('value', function(snapshot) {
    var data = snapshot.val();
    var container = document.getElementById('idEmailList');
    if (!container) return;

    if (!data) {
      container.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem;">No assignments yet.</span>';
      return;
    }

    var robotArray = robots ? (Array.isArray(robots) ? robots : Object.values(robots)) : [];
    var html = '<table class="email-table"><thead><tr><th>Robot</th><th>Email</th><th></th></tr></thead><tbody>';
    Object.keys(data).forEach(function(id) {
      var robotName = (robotArray[id] && robotArray[id].name) ? robotArray[id].name : ('Robot ' + id);
      html += '<tr><td>' + robotName + '</td><td>' + data[id].email + '</td>'
        + '<td><button class="btn-sm-del" onclick="deleteIdEmail(\'' + id + '\')">✕</button></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  });
}

function deleteIdEmail(id) {
  if (!confirm('Remove User ID ' + id + '?')) return;
  firebase.database().ref('idEmails/' + id).remove();
}

function saveIdEmail() {
  var userId = document.getElementById('robotSelect').value;
  var email = document.getElementById('linkedEmail').value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  firebase.database().ref('idEmails').once('value').then(function(snapshot) {
    var data = snapshot.val() || {};
    for (var id in data) {
      if (id !== userId && data[id].email && data[id].email.toLowerCase() === email) {
        throw new Error('duplicate:' + id);
      }
    }
    return firebase.database().ref('idEmails/' + userId).set({ email: email });
  }).then(function() {
    alert('Email saved successfully!');
    document.getElementById('linkedEmail').value = '';
  }).catch(function(err) {
    if (err.message.startsWith('duplicate:')) {
      var conflictId = err.message.split(':')[1];
      alert(email + ' is already registered to User ID ' + conflictId + '. Please remove or update the existing assignment first.');
    } else {
      alert('Error: ' + err.message);
    }
  });
}

// ── Admin: Robots ────────────────────────────────────────────────────────────

function loadRobotList() {
  var container = document.getElementById('robotList');
  if (container) container.innerHTML = '<span style="color:#6b7280;font-size:0.85rem;">Fetching...</span>';
  firebase.database().ref('/robots/').on('value', function(snapshot) {
    robots = snapshot.val();
    var container = document.getElementById('robotList');
    if (!container) return;

    if (!robots) {
      container.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem;">No robots yet.</span>';
      var sel = document.getElementById('robotSelect');
      if (sel) sel.innerHTML = '<option value="">No robots</option>';
      return;
    }

    // Always iterate by actual Firebase keys to avoid index/key mismatch
    var keys = Object.keys(robots);
    var html = '';
    var selectHtml = '';
    keys.forEach(function(key) {
      var robot = robots[key];
      if (!robot) return;
      var name = robot.name || '(unnamed)';
      html += '<div class="robot-list-item"><span>' + name + '</span>'
        + '<div style="display:flex;gap:4px;">'
        + '<button class="btn-sm-edit" onclick="renameRobot(\'' + key + '\')">✎</button>'
        + '<button class="btn-sm-del" onclick="deleteRobot(\'' + key + '\')">✕</button>'
        + '</div></div>';
      selectHtml += '<option value="' + key + '">' + name + '</option>';
    });
    container.innerHTML = html || '<span style="color:#9ca3af;font-size:0.85rem;">No robots yet.</span>';
    var sel = document.getElementById('robotSelect');
    if (sel) sel.innerHTML = selectHtml || '<option value="">No robots</option>';
  }, function(error) {
    var container = document.getElementById('robotList');
    if (container) container.innerHTML = '<span style="color:#991b1b;font-size:0.85rem;">Error: ' + error.message + '</span>';
  });
}

function addNewRobot() {
  var name = document.getElementById('robotName').value.trim();
  if (!name) { alert('Please enter a robot name.'); return; }

  // Find next numeric key (max existing key + 1, or 0)
  var nextKey = 0;
  if (robots) {
    var existingKeys = Object.keys(robots).map(Number).filter(function(n) { return !isNaN(n); });
    if (existingKeys.length > 0) nextKey = Math.max.apply(null, existingKeys) + 1;
  }

  firebase.database().ref('/robots/' + nextKey).set({ name: name }).then(function() {
    document.getElementById('robotName').value = '';
  }).catch(function(err) { alert('Error: ' + err.message); });
}

function renameRobot(key) {
  var robot = robots && robots[key];
  var current = robot ? (robot.name || '') : '';
  var newName = prompt('Rename "' + current + '" to:', current);
  if (newName === null || !newName.trim()) return;
  firebase.database().ref('/robots/' + key + '/name').set(newName.trim())
    .catch(function(err) { alert('Error: ' + err.message); });
}

function deleteRobot(key) {
  if (!robots || !robots[key]) return;
  if (!confirm('Delete "' + robots[key].name + '"?')) return;
  firebase.database().ref('/robots/' + key).remove()
    .catch(function(err) { alert('Error: ' + err.message); });
}

// ── Admin: Admins ────────────────────────────────────────────────────────────

function loadAdminList() {
  firebase.database().ref('/administrators/').on('value', function(snapshot) {
    admins = snapshot.val();
    var container = document.getElementById('adminList');
    if (!container) return;

    if (!admins) {
      container.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem;">No admins.</span>';
      return;
    }

    var html = '';
    Object.keys(admins).forEach(function(key) {
      html += '<div class="admin-list-item"><span>' + admins[key] + '</span>'
        + '<button class="btn-sm-del" onclick="deleteAdmin(\'' + key + '\')">✕</button></div>';
    });
    container.innerHTML = html;
  });
}

function addNewAdmin() {
  var email = document.getElementById('adminEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }

  var newIndex = admins ? Number(Object.keys(admins).pop()) + 1 : 0;
  var updates = {};
  updates[newIndex] = email;
  firebase.database().ref('/administrators/').update(updates).then(function() {
    document.getElementById('adminEmail').value = '';
  }).catch(function(err) { alert('Error: ' + err.message); });
}

function deleteAdmin(key) {
  if (!confirm('Remove admin ' + admins[key] + '?')) return;
  firebase.database().ref('/administrators/' + key).remove();
}
