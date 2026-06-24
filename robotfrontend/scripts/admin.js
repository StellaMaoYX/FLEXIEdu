var config = new Config();
var db = new Database(config.config, initializeControl);
var robots = null;
var admins = null;
var is

function initializeControl() {
  /* Register database callbacks */
  let dbRobotsRef = firebase.database().ref('/robots/');
  dbRobotsRef.on("value", updateRobots);

  let dbAdminsRef = firebase.database().ref('/administrators/');
  dbAdminsRef.on("value", updateAdmins);

}

function updateAdmins(snapshot) {
  admins = snapshot.val();

  let nAdmins = admins.length;
  let adminDiv = document.getElementById("adminInfo");
  adminDiv.innerHTML = "";
  let text = document.createElement('p');
  text.setAttribute('class', 'text-info');
  text.innerHTML = "There are currently " + nAdmins + " administrators.";
  adminDiv.appendChild(text);
  let ul = document.createElement('ul');
  ul.setAttribute('class', 'list-group');
  for (let i=0; i<nAdmins; i++) {
    let li = document.createElement('li');
    li.setAttribute('class', 'list-group-item');
    li.innerHTML = admins[i];
    ul.appendChild(li);
  }
  adminDiv.appendChild(ul);

  let newRobotDiv = document.getElementById("newRobot");
  if (Database.userEmail == null){
    let text = document.createElement('p');
    text.setAttribute('class', 'text-danger');
    text.innerHTML = "You are not logged in with Google."
    newRobotDiv.innerHTML = "";
    newRobotDiv.appendChild(text);
  }
  else if (admins.includes(Database.userEmail) == false) {
    let text = document.createElement('p');
    text.setAttribute('class', 'text-danger');
    text.innerHTML = "You do not have admin access."
    newRobotDiv.innerHTML = "";
    newRobotDiv.appendChild(text);
  }
}

function updateRobots(snapshot) {
  robots = snapshot.val();
  // Display information about existing robots
  let nRobots = robots.length;
  let robotDiv = document.getElementById("robotInfo");
  robotDiv.innerHTML = "";
  let text = document.createElement('p');
  text.setAttribute('class', 'text-info');
  text.innerHTML = "There are currently " + nRobots + " robots.";
  robotDiv.appendChild(text);
  let ul = document.createElement('ul');
  ul.setAttribute('class', 'list-group');
  for (let i=0; i<nRobots; i++) {
    let li = document.createElement('li');
    li.setAttribute('class', 'list-group-item');
    let inner = "<div style='display: flex; justify-content: space-between'><p>";
    inner += robots[i].name;
    inner +=
      `</p>
      <div style='display: flex; flex-direction: row;'>
        <button style="margin-right: 20px;" class="btn btn-secondary btn-lg" type="button" onclick="copyRobot(` +
      i +
      `)">Copy Robot</button>
        <button class="btn btn-danger btn-lg" type="button" onclick="deleteRobot(` +
      i +
      `)">Delete Robot</button>
      </div>
      </div>
    `;
    li.innerHTML = inner;
    ul.appendChild(li);
  }
  robotDiv.appendChild(ul);
}

function addNewRobot() {
  if (robots != null) {
    let nRobots = robots.length;
    let newRobotData = Object.values(robots)[nRobots-1];
    let newRobotIndex = Number(Object.keys(robots)[nRobots-1]) + 1;
    let robotName = document.getElementById('robotName').value;
    newRobotData.name = robotName;

    let dbRef = firebase.database().ref("/robots/");
    let updates = {};
    updates[newRobotIndex] = newRobotData;
    dbRef.update(updates);
  }
}

function copyRobot(index) {
  if (robots != null) {
    let nRobots = robots.length;
    let newRobotData = Object.values(robots)[index];
    let newRobotIndex = Number(Object.keys(robots)[nRobots - 1]) + 1;
    let robotName = newRobotData.name + "_copy";
    newRobotData.name = robotName;

    let dbRef = firebase.database().ref('/robots/');
    let updates = {};
    updates[newRobotIndex] = newRobotData;
    console.log(updates);
    dbRef.update(updates);
  }
}

function deleteRobot(index) {
  var confirmation = confirm(
    'Are you sure you want to delete ' + robots[index].name + "?"
  );
  if (confirmation) {
    let updRobots = [...robots];
    updRobots.splice(index, 1);
    let dbRef = firebase.database().ref('/robots/');
    dbRef.set(updRobots);
  }
}

function addNewAdmin() {
  if (admins != null) {
    let nAdmins = admins.length;
    let newAdminIndex = Number(Object.keys(admins)[nAdmins-1]) + 1;
    let adminEmail = document.getElementById('adminEmail').value;
    let dbRef = firebase.database().ref("/administrators/");
    let updates = {};
    updates[newAdminIndex] = adminEmail;
     dbRef.update(updates);
  }
}

async function loadIdEmailList() {
  const container = document.getElementById("idEmailList");

  try {
    const res = await fetch(`${API_BASE_URL}/admin/id-emails`);
    const data = await res.json();

    let html = "<table class='table table-bordered'><tr><th>ID</th><th>Email</th></tr>";

    for (let i = 0; i <= 13; i++) {
      html += `
        <tr>
          <td>${i}</td>
          <td>${data[i] || "<em>Not assigned</em>"}</td>
        </tr>
      `;
    }

    html += "</table>";
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = "Failed to load ID-email list.";
    console.error(err);
  }
}
function adminReady() {
  console.log("Firebase ready");
  loadIdEmailList();
}

function saveIdEmail() {
    var userId = document.getElementById("userId").value;
    var email = document.getElementById("linkedEmail").value.trim().toLowerCase();

    var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        alert("Please enter a valid email address.");
        return;
    }

    firebase.database().ref("idEmails").once("value")
        .then(function(snapshot) {

            var data = snapshot.val() || {};

            for (var id in data) {
                if (
                    id !== userId &&
                    data[id].email &&
                    data[id].email.toLowerCase() === email
                ) {
                    alert("This email is already assigned to User ID " + id);
                    return;
                }
            }

            return firebase.database().ref("idEmails/" + userId).set({
                email: email
            });
        })
        .then(function() {
            alert("Email saved successfully!");
            loadIdEmailList();
        })
        .catch(function(error) {
            if (error) {
                alert("Error: " + error.message);
            }
        });
}

function loadIdEmailList() {

  firebase.database().ref("idEmails").on("value", function(snapshot) {

    var data = snapshot.val();

    if (!data) {
      document.getElementById("idEmailList").innerHTML =
        "<div class='alert alert-info'>No email registrations found.</div>";
      return;
    }

    var html =
      "<table class='table table-bordered'>" +
      "<tr><th>User ID</th><th>Email</th></tr>";

    Object.keys(data).forEach(function(id) {
      html += "<tr><td>" + id + "</td><td>" + data[id].email + "</td></tr>";
    });

    html += "</table>";

    document.getElementById("idEmailList").innerHTML = html;
  });
}