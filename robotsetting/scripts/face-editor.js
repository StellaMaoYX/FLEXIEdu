var config = new Config();
var db = new Database(config.config, null);
var face = new Face();

// Prevent database.js anonymous sign-in — require Google login
Database.handleAuthStateChange = function(user) {
  if (user && !user.isAnonymous && Database.readyCallback) {
    Database.readyCallback(user);
  }
};

firebase.auth().onAuthStateChanged(function(user) {
  if (!user || user.isAnonymous) {
    window.location.href = '../index.html';
    return;
  }
  initializeEdit();
});

function initializeEdit() {
  window.onresize = Face.draw;

  // Load current user's faces only (rules allow reading own /users/{uid}/)
  firebase.database().ref('/users/' + Database.uid + '/').on('value', function(snapshot) {
    currentUserData = snapshot.val() || {};
    updateUserFaceList();
  });
}

function updateUserFaceList() {
  var myFaceList = document.getElementById('myFaceList');
  myFaceList.innerHTML = '';

  var faces = currentUserData && currentUserData.faces;
  if (!faces || faces.length === 0) {
    myFaceList.innerHTML = '<p style="color:#aaa;font-size:0.9rem;">No faces yet. Add one below.</p>';
    return;
  }

  for (var i = 0; i < faces.length; i++) {
    var name = faces[i].name || '…';
    var imgSrc = (faces[i].thumb) || '';

    var wrapper = document.createElement('div');
    wrapper.className = 'deletable-thumb';

    var inner = document.createElement('div');
    inner.className = 'thumb-and-name';

    var img = document.createElement('img');
    img.className = 'face-thumb';
    img.src = imgSrc;
    img.title = name;
    img.dataset.user = Database.uid;
    img.dataset.index = i;
    img.onclick = (function(el, idx) {
      return function() { selectedFaceChanged(el, Database.uid, idx); };
    })(img, i);

    var label = document.createElement('p');
    label.textContent = name;

    inner.appendChild(img);
    inner.appendChild(label);

    var delBtn = document.createElement('div');
    delBtn.className = 'delete-x-button';
    delBtn.innerHTML = '<button class="btn-circle-sm" onclick="removeUserFace(' + i + ')">×</button>';

    wrapper.appendChild(inner);
    wrapper.appendChild(delBtn);
    myFaceList.appendChild(wrapper);
  }

  // Hide "Face Library" card since we can't read other users' data
  var libraryCard = document.getElementById('libraryCard');
  if (libraryCard) libraryCard.style.display = 'none';
}

function removeUserFace(index) {
  var newFaces = (currentUserData.faces || []).slice();
  newFaces.splice(index, 1);
  firebase.database().ref('/users/' + Database.uid + '/').update({ faces: newFaces });
}

function selectedFaceChanged(target, user, index) {
  hasNewParams = true;
  selectedUser = user;
  selectedFace = index;

  document.querySelectorAll('.face-thumb').forEach(function(img) {
    img.classList.remove('selected');
  });
  target.classList.add('selected');

  newParameters = currentUserData.faces[index];
  Face.updateParameters(newParameters);
  updateFaceEditor();
}

function updateFace() {
  if (newParameters) Face.updateParameters(newParameters);
}

function updateFaceEditor() {
  if (!newParameters) return;
  var mainDiv = document.getElementById('faceParameters');

  var scaleExample = document.getElementById('eyeCenterDistPercent');
  if (scaleExample === null) {
    mainDiv.innerHTML = '';

    // Number sliders
    for (var key in newParameters) {
      var param = newParameters[key];
      if (param && param.v2eyes === undefined && param.type === 'number') {
        var nInc = param.nIncrements || 20;
        mainDiv.appendChild(createRangeInput(key, param.name, param.current, param.min, param.max, nInc));
      }
    }

    // Color pickers
    var colorPicker = null;
    for (var key in newParameters) {
      var param = newParameters[key];
      if (param && param.v2eyes === undefined && param.type === 'color') {
        if (!colorPicker) {
          colorPicker = document.createElement('div');
          colorPicker.className = 'colorPicker';
          mainDiv.appendChild(colorPicker);
        }
        colorPicker.innerHTML +=
          '<div><div class="sliderName">' + param.name + '</div>' +
          '<input type="color" onchange="newParameterValue(this,\'current\')" name="' + key + '" id="' + key + 'Color" value="' + param.current + '"></div>';
      }
    }

    // Boolean toggles
    var boolPicker = null;
    for (var key in newParameters) {
      var param = newParameters[key];
      if (param && param.v2eyes === undefined && param.type === 'boolean') {
        if (!boolPicker) {
          boolPicker = document.createElement('div');
          boolPicker.className = 'bool-picker';
          mainDiv.appendChild(boolPicker);
        }
        var checked1 = param.current == 1 ? ' checked' : '';
        var checked0 = param.current != 1 ? ' checked' : '';
        boolPicker.innerHTML +=
          '<div><div class="sliderName">' + param.name + '</div>' +
          'Yes <input type="radio" onchange="newParameterValue(this,\'current\')" name="' + key + '" value="1" id="' + key + 'Choice1"' + checked1 + '> ' +
          'No <input type="radio" onchange="newParameterValue(this,\'current\')" name="' + key + '" value="0" id="' + key + 'Choice0"' + checked0 + '></div>';
      }
    }
  } else {
    updateScales(newParameters);
  }

  var faceName = document.getElementById('faceName');
  faceName.disabled = '';
  faceName.value = newParameters.name || '';
}

function updateScales(params) {
  for (var key in params) {
    var param = params[key];
    if (!param) continue;
    if (param.type === 'number') {
      var scale = document.getElementById(key + 'Scale');
      if (scale) scale.value = Number(param.current);
      var valueDiv = document.getElementById(key + 'Value');
      if (valueDiv) valueDiv.innerHTML = param.current;
    } else if (param.type === 'color') {
      var elem = document.getElementById(key + 'Color');
      if (elem) elem.value = param.current;
    } else if (param.type === 'boolean') {
      var t = document.getElementById(key + 'Choice1');
      var f = document.getElementById(key + 'Choice0');
      if (t && f) { t.checked = param.current == 1; f.checked = param.current != 1; }
    }
  }
}

function createRangeInput(id, name, current, min, max, nIncrements) {
  var scale = document.createElement('div');
  scale.className = 'scale';
  scale.id = id;
  scale.innerHTML =
    '<div class="sliderName">' + name + '</div>' +
    '<div class="sliderValue" id="' + id + 'Value">' + current + '</div>' +
    '<div class="min-value"><input class="min" type="text" name="' + id + '" onblur="newParameterValue(this,\'min\')" value="' + min + '"></div>' +
    '<input type="range" class="slider" min="' + min + '" max="' + max + '" step="' + ((max - min) / nIncrements) + '" onchange="newParameterValue(this,\'current\')" id="' + id + 'Scale" name="' + id + '" value="' + current + '">' +
    '<div class="max-value"><input class="max" type="text" name="' + id + '" onblur="newParameterValue(this,\'max\')" value="' + max + '"></div>';
  return scale;
}

function newParameterValue(target, param) {
  if (!Database.uid || selectedFace === null) return;
  var key = target.name;
  var newParam = newParameters[key];
  if (!newParam) return;

  if (newParam.type === 'number' || newParam.type === 'boolean') {
    if (param === 'min' || param === 'max') newParam[param] = Number(target.value);
    else newParam.current = Number(target.value);
  } else {
    newParam.current = target.value;
  }

  if (newParam.type === 'number' && param === 'current') {
    var valDiv = document.getElementById(key + 'Value');
    if (valDiv) valDiv.innerHTML = target.value;
  }

  var updates = {};
  updates[key] = newParam;
  firebase.database().ref('users/' + Database.uid + '/faces/' + selectedFace + '/').update(updates);
  hasNewParams = true;
  Face.updateParameters(newParameters);
}

function faceRenamed() {
  if (selectedUser !== Database.uid || selectedFace === null) return;
  var name = document.getElementById('faceName').value;
  firebase.database().ref('users/' + Database.uid + '/faces/' + selectedFace + '/').update({ name: name });
}

function createNewFace() {
  // Copies default blank face for the user to start editing
  if (!currentUserData) return;
  var newFaceIndex = (currentUserData.faces || []).length;
  var blankFace = JSON.parse(JSON.stringify(newParameters || Face.parameters));
  blankFace.name = 'New Face';
  firebase.database().ref('users/' + Database.uid + '/faces/' + newFaceIndex + '/').set(blankFace);
}

// globals needed by facedata.js stubs
var newParameters = null;
var allUserData = null;
var currentUserData = null;
var selectedUser = null;
var selectedFace = null;
var hasNewParams = false;
var isSetup = false;

// Stubs so facedata.js functions don't crash if called
function updateAllUsersFaceList() {}
function updateRobotFaceList() {}
