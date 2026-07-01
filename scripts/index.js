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
        if (id !== userId && data[id].email && data[id].email.toLowerCase() === email) {
          throw new Error("duplicate:" + id);
        }
      }
      return firebase.database().ref("idEmails/" + userId).set({ email: email });
    })
    .then(function() {
      alert("Email saved successfully!");
    })
    .catch(function(error) {
      if (error.message.startsWith("duplicate:")) {
        var conflictId = error.message.split(":")[1];
        alert(email + " is already registered to User ID " + conflictId + ". Please remove or update the existing assignment first.");
      } else {
        alert("Error: " + error.message);
      }
    });
}

function loadIdEmailList() {
  firebase.database().ref("idEmails").on("value", function(snapshot) {
    var data = snapshot.val();
    var container = document.getElementById("idEmailList");
    if (!container) return;

    if (!data) {
      container.innerHTML = "<p style='color:#6b7280;font-style:italic;'>No email registrations found.</p>";
      return;
    }

    var html = "<table class='email-table'><thead><tr><th>User ID</th><th>Email</th></tr></thead><tbody>";
    Object.keys(data).forEach(function(id) {
      html += "<tr><td>" + id + "</td><td>" + data[id].email + "</td></tr>";
    });
    html += "</tbody></table>";
    container.innerHTML = html;
  });
}

// Called by database.js when Firebase is ready
function databaseReady() {
  loadIdEmailList();
}
