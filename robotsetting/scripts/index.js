// Read URL params set by homepage
var urlParams = new URLSearchParams(window.location.search);
var isAdmin = urlParams.get('role') === 'admin';
var lockedRobotId = urlParams.get('robotId') !== null ? parseInt(urlParams.get('robotId')) : (isAdmin ? null : 0);

var config = new Config();
var db = new Database(config.config, null);
var currentRobot = lockedRobotId !== null ? lockedRobotId : 0;
var robotNames = [];
var robotsLoaded = false;

// Fire once any auth state is established (anonymous or Google)
function waitForAuth() {
  if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged(function(user) {
      if (user && !robotsLoaded) {
        robotsLoaded = true;
        loadRobots();
      }
    });
  } else {
    setTimeout(waitForAuth, 200);
  }
}
waitForAuth();

function loadRobots() {
  firebase.database().ref('/robots/').once('value').then(function(snapshot) {
    var robots = snapshot.val();
    if (!robots) return;

    var robotArray = Array.isArray(robots) ? robots : Object.values(robots);
    robotNames = robotArray.map(function(r) { return r ? (r.name || '') : ''; });

    var robotListHTML = '';
    if (isAdmin) {
      robotArray.forEach(function(robot, i) {
        if (!robot) return;
        robotListHTML += "<a class='dropdown-item' href='#' onclick='selectRobot(" + i + ")'>" + robot.name + "</a>";
      });
    }

    document.getElementById('robots').innerHTML = robotListHTML;
    document.getElementById('selectedRobot').innerHTML = robotNames[currentRobot] || ('Robot ' + currentRobot);

    if (!isAdmin) {
      var bar = document.querySelector('.selector-bar');
      if (bar) {
        var robotName = robotNames[currentRobot] || ('Robot ' + currentRobot);
        bar.innerHTML = '<span style="font-size:1rem;font-weight:600;color:#374151;">Your Robot:</span>'
          + '<span style="font-size:1rem;font-weight:700;color:#1a1a2e;">' + robotName + '</span>';
      }
    }

    // Hide admin card for non-admins
    var adminButton = document.getElementById('adminButton');
    if (adminButton) adminButton.style.display = isAdmin ? '' : 'none';
  });
}

function selectRobot(robotId) {
  if (!isAdmin) return;
  currentRobot = robotId;
  document.getElementById('selectedRobot').innerHTML = robotNames[currentRobot];
}

function signInWithGoogle() { Database.signInWithGoogle(); }
function signOutFromGoogle() { Database.signOut(); }

function startController() { window.location.href = 'control.html?robot=' + currentRobot; }
function startEditor()     { window.location.href = 'face-editor.html'; }
function startBellyEditor(){ window.location.href = 'belly-editor.html?robot=' + currentRobot; }
function startSetup()      { window.location.href = 'setup.html?robot=' + currentRobot; }
function startFlexi()      { window.location.href = 'sentence-ordering.html?robot=' + currentRobot; }
function startAdmin()      { window.location.href = 'admin.html'; }
