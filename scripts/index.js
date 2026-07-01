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
  if (user) {
    onSignedIn(user);
  } else {
    onSignedOut();
  }
});

function signInWithGoogle() {
  var provider = new firebase.auth.GoogleAuthProvider();
  firebase.auth().signInWithPopup(provider).catch(function(error) {
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
      container.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem;">No registrations yet.</span>';
      return;
    }

    var html = '<table class="email-table"><thead><tr><th>ID</th><th>Email</th><th></th></tr></thead><tbody>';
    Object.keys(data).forEach(function(id) {
      html += '<tr><td>' + id + '</td><td>' + data[id].email + '</td>'
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
    if (!container) return;

    if (!robots || robots.length === 0) {
      container.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem;">No robots yet.</span>';
      return;
    }

    var html = '';
    robots.forEach(function(robot, i) {
      html += '<div class="robot-list-item"><span>' + robot.name + '</span>'
        + '<button class="btn-sm-del" onclick="deleteRobot(' + i + ')">✕</button></div>';
    });
    container.innerHTML = html;
  });
}

function addNewRobot() {
  var name = document.getElementById('robotName').value.trim();
  if (!name) { alert('Please enter a robot name.'); return; }

  var updates = {};
  var newIndex = robots ? robots.length : 0;
  var template = (robots && robots.length > 0) ? Object.assign({}, robots[robots.length - 1]) : {};
  template.name = name;
  updates[newIndex] = template;

  firebase.database().ref('/robots/').update(updates).then(function() {
    document.getElementById('robotName').value = '';
  }).catch(function(err) { alert('Error: ' + err.message); });
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
