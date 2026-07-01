var robots = null;
var admins = null;

// Entry point called by database.js when Firebase is ready
function databaseReady() {
  firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
      onSignedIn(user);
    } else {
      onSignedOut();
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

function onSignedOut() {
  document.getElementById('loginSection').style.display = 'flex';
  document.getElementById('userSection').style.display = 'none';
  document.getElementById('adminPanel').classList.remove('visible');
  setRobotIdStatus('locked');
}

function handleSignOut() {
  firebase.auth().signOut();
}

// ── Role views ───────────────────────────────────────────────────────────────

function showAdminView() {
  setRobotIdStatus('admin');
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
    } else {
      setRobotIdStatus('unknown');
    }
  });
}

// ── Robot ID card states ─────────────────────────────────────────────────────

function setRobotIdStatus(state, robotId) {
  var el = document.getElementById('robotIdStatus');
  var badge = document.getElementById('accountBadge');

  if (state === 'locked') {
    el.innerHTML = '<div class="status-icon">🔒</div><div class="status-hint">Please sign in below</div>';
    badge.textContent = 'Your Account';
    badge.style.background = '#f3f4f6';
    badge.style.color = '#374151';
  } else if (state === 'admin') {
    el.innerHTML = '<div class="status-icon">🛡️</div><div class="robot-id-label">Signed in as</div><div class="robot-id-number" style="font-size:1.8rem;">Administrator</div>';
    badge.textContent = 'Admin';
    badge.style.background = '#ede9fe';
    badge.style.color = '#6d28d9';
  } else if (state === 'teacher') {
    el.innerHTML = '<div class="status-icon">🤖</div><div class="robot-id-label">Your Robot ID</div><div class="robot-id-number">' + robotId + '</div>';
    badge.textContent = 'Teacher-facing';
    badge.style.background = '#fef3c7';
    badge.style.color = '#b45309';
  } else {
    el.innerHTML = '<div class="status-icon">❓</div><div class="status-hint">No robot assigned to your account.<br>Contact an admin.</div>';
    badge.textContent = 'Not assigned';
    badge.style.background = '#fee2e2';
    badge.style.color = '#991b1b';
  }
}

// ── Admin: Email ↔ User ID ───────────────────────────────────────────────────

function loadIdEmailList() {
  firebase.database().ref('idEmails').on('value', function(snapshot) {
    var data = snapshot.val();
    var container = document.getElementById('idEmailList');
    if (!container) return;

    if (!data) {
      container.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem;">No registrations yet.</span>';
      return;
    }

    var html = '<table class="email-table"><thead><tr><th>ID</th><th>Email</th></tr></thead><tbody>';
    Object.keys(data).forEach(function(id) {
      html += '<tr><td>' + id + '</td><td>' + data[id].email + '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  });
}

function saveIdEmail() {
  var userId = document.getElementById('userId').value;
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
  firebase.database().ref('/robots/').on('value', function(snapshot) {
    robots = snapshot.val();
    var container = document.getElementById('robotList');
    if (!container || !robots) return;

    var html = '';
    robots.forEach(function(robot, i) {
      html += '<div class="robot-list-item"><span>' + robot.name + '</span>'
        + '<button class="btn-sm-del" onclick="deleteRobot(' + i + ')">Delete</button></div>';
    });
    container.innerHTML = html || '<span style="color:#9ca3af;font-size:0.85rem;">No robots yet.</span>';
  });
}

function addNewRobot() {
  var name = document.getElementById('robotName').value.trim();
  if (!name) { alert('Please enter a robot name.'); return; }
  if (!robots) return;

  var nRobots = robots.length;
  var newRobotData = Object.assign({}, robots[nRobots - 1]);
  newRobotData.name = name;
  var newIndex = nRobots;

  var updates = {};
  updates[newIndex] = newRobotData;
  firebase.database().ref('/robots/').update(updates).then(function() {
    document.getElementById('robotName').value = '';
  });
}

function deleteRobot(index) {
  if (!robots) return;
  if (!confirm('Delete ' + robots[index].name + '?')) return;
  var updated = robots.filter(function(_, i) { return i !== index; });
  firebase.database().ref('/robots/').set(updated);
}

// ── Admin: Admins ────────────────────────────────────────────────────────────

function loadAdminList() {
  firebase.database().ref('/administrators/').on('value', function(snapshot) {
    admins = snapshot.val();
    var container = document.getElementById('adminList');
    if (!container || !admins) return;

    var html = '';
    Object.values(admins).forEach(function(email) {
      html += '<div class="admin-list-item">' + email + '</div>';
    });
    container.innerHTML = html || '<span style="color:#9ca3af;font-size:0.85rem;">No admins.</span>';
  });
}

function addNewAdmin() {
  var email = document.getElementById('adminEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('Please enter a valid email address.');
    return;
  }
  if (!admins) return;

  var keys = Object.keys(admins);
  var newIndex = Number(keys[keys.length - 1]) + 1;
  var updates = {};
  updates[newIndex] = email;
  firebase.database().ref('/administrators/').update(updates).then(function() {
    document.getElementById('adminEmail').value = '';
  });
}
