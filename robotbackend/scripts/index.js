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

    // Lock dropdown for non-admins
    if (!isAdmin) {
      var btn = document.querySelector('.selector-bar .btn.dropdown-toggle');
      if (btn) {
        btn.style.pointerEvents = 'none';
        btn.style.cursor = 'default';
      }
    }
  });
}

function selectRobot(robotId) {
  if (!isAdmin) return;
  currentRobot = robotId;
  document.getElementById('selectedRobot').innerHTML = robotNames[currentRobot];
}

function startPageWithRobot(pageName) {
  if (currentRobot < 0) { alert('Please select a robot first.'); return; }
  window.location.href = pageName + '.html?robot=' + currentRobot;
}
