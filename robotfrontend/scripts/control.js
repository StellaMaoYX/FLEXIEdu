var robot = null;
var customAPI = null;
var robotAPI = null;
var face = new Face();
var CustomAPI = window.CustomAPI || null;

var faceState = null;
var screenState = null;
var poseState = null;
var motorState = null;

// Normalize motor data so it always behaves like an array.
// Supports both the original array format and a simple object map format.
function normalizeMotors(motors) {
  if (!motors) {
    return [];
  }
  // If it's already an array, just return it.
  if (Array.isArray(motors)) {
    return motors;
  }
  // If it's an object (e.g. {neckPan: {...}, neckTilt: {...}}),
  // convert it into an array of {name, min, max, value} objects.
  var result = [];
  Object.keys(motors).forEach(function (key) {
    var m = motors[key] || {};
    result.push({
      name: m.name || key,
      min: m.min,
      max: m.max,
      value: m.value || 0,
    });
  });
  return result;
}

function initializeControl(snapshot, config, robotid) {
  console.log('Logging event: ----------');
  console.log('sessionStarted: ' + new Date());

  if (config == null || config == undefined) {
    config = {};
  }

  var firebaseRef = Config.databaseURL;
  // var firebaseRef = 'https://emar-database.firebaseio.com/';
  var firebaseApiKey = Config.apiKey;
  var robotId = robotid;

  // Get robot API for requested robot
  robotAPI = new RobotAPI(firebaseRef, firebaseApiKey, config, robotId);
  customAPI = new RobotAPI(firebaseRef, firebaseApiKey, config, robotId, CustomAPI);
  customAPI.states = customAPI.states || { faces: [], screens: [], motors: [], poses: [] };
  customAPI.inputs = customAPI.inputs || { bellyScreens: [] };
  customAPI.actions = customAPI.actions || { presetSpeak: [] };
  customAPI.actions.presetSpeak = customAPI.actions.presetSpeak || [];
  if ((!customAPI.states.faces || customAPI.states.faces.length === 0) && typeof getDefaultFaceTemplate === 'function') {
    customAPI.states.faces = [getDefaultFaceTemplate()];
  }
  if (customAPI.states.faces && customAPI.states.faces.length > 0) {
    Face.faces = customAPI.states.faces;
  }

  robot = robotAPI.robot;
  console.log('currentRobot: ' + robot.currentRobot);

  customAPI.onRobotStatusChanged(function (snapshot) {
    // console.log(snapshot.val());
    // var robotState = snapshot.val();
    var robotState = snapshot || {};
    var faceList = (customAPI.states && customAPI.states.faces) || [];
    if (faceList.length === 0 && typeof getDefaultFaceTemplate === 'function') {
      faceList = [getDefaultFaceTemplate()];
      customAPI.states.faces = faceList;
    }
    if (faceList.length > 0) {
      var faceIndex = robotState.currentFace;
      if (faceIndex == null || faceIndex < 0 || faceIndex >= faceList.length) {
        faceIndex = 0;
      }
      Face.faces = faceList;
      Face.updateRobotFace(snapshot);
    }
  });

  robotAPI.onRobotStatusChangedCustom(function (snapshot) {
    // console.log(snapshot.val());
    // var robotState = snapshot.val();
    var robotState = snapshot;
    updateRobotState(robotState);
  });

  var faceIndex = 0;

  // Using BigQuery - log the parameters for the session start of the block
  if (CustomAPI != null && CustomAPI != undefined && Config.bigQueryURL != null) {
    var options = customAPI.getRobotOptions();
    options['eventType'] = 'sessionStart';
    options['robotId'] = robot.currentRobot;
    options['robotState'] = snapshot;
    var dataOut = {
      data: options,
    };
    // console.log(dataOut);
    var xhr = new XMLHttpRequest();
    xhr.open('POST', Config.bigQueryURL, true);
    xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
    xhr.send(JSON.stringify(dataOut));
  }

  // Hidden - get value but do not display
  // Make functions in control.js need to be changed
  var faceList = customAPI.states.faces || null;
  var screenList = customAPI.states.screens || null;
  faceState = faceList;
  screenState = screenList;
  motorState = customAPI.states.motors || null;
  poseState = customAPI.states.poses || null;

  // Start by init'ing hidden structures
  updateRobotState(snapshot);

  // Speak control
  // createStateChangeInterface('speakControls', snapshot, customAPI.actions.speak);
  // Preset speak controls
  createPresetSpeakControls();

  console.log('Robot initialized: ' + robot.currentRobot);

}

// Speak both through the robot (if available) and locally via Web Speech API.
function speakTextOutLoud(text) {
  if (!text) {
    return;
  }

  if (robot && typeof robot.speak === 'function') {
    robot.speak(text);
  }

  if ('speechSynthesis' in window) {
    var utterance = new SpeechSynthesisUtterance(text);
    var voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      // Prefer an English voice when available; otherwise use the first.
      var preferred =
        voices.find(function (v) {
          return v.lang && v.lang.toLowerCase().indexOf('en') === 0;
        }) || voices[0];
      utterance.voice = preferred;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } else {
    console.warn('Web Speech API not supported in this browser; skipping local speech.');
  }
}

function updateRobotState(snapshot) {
  if (customAPI != null && robotAPI != null) {
    var robotState = snapshot || {};

    var apiStates = customAPI.states || {};
    var faceIndex = robotState.currentFace;
    var faceList = apiStates.faces || [];
    if (faceList.length === 0 && typeof getDefaultFaceTemplate === 'function') {
      faceList = [getDefaultFaceTemplate()];
      apiStates.faces = faceList;
      customAPI.states = apiStates;
    }
    if (faceList.length > 0) {
      Face.faces = faceList;
    }

    var screenList = apiStates.screens || (customAPI.inputs && customAPI.inputs.bellyScreens) || [];
    if (screenList.length === 0 && customAPI.inputs && customAPI.inputs.bellyScreens && customAPI.inputs.bellyScreens.length > 0) {
      screenList = customAPI.inputs.bellyScreens;
    }
    Belly.bellyScreens = screenList.length > 0 ? screenList : [];

    if (Face && typeof Face.updateRobotFace === 'function') {
      if (robotState.currentFace == null && faceList.length > 0) {
        robotState.currentFace = 0;
      }
      Face.updateRobotFace(snapshot);
    }

    // EYES
    var div = document.getElementById('faceControls');
    div.innerHTML = '';
    if (faceList.length > 0) {
      createStateChangeInterface(
        'faceControls',
        snapshot,
        faceList,
        faceIndex,
        'Set robot eyes',
        function () {
          return 'Robot is looking at a ';
        },
        function () {
          return ' face.';
        },
        function (robotState) {
          var idx = robotState.currentFace;
          return faceList[idx] ? faceList[idx].name : '';
        },
        robot.setFace.bind(robot),
        'currentFace'
      );
    } else {
      div.innerHTML = '<p class="text-muted">No faces available. Use Robot Setup to add faces.</p>';
    }

    // SCREEN
    var div = document.getElementById('screenControls');
    div.innerHTML = '';
    var screenIndex = robotState.currentScreen;
    if (screenList.length > 0) {
      createStateChangeInterface(
        'screenControls',
        snapshot,
        screenList,
        screenIndex,
        'Set robot screen',
        function () {
          return 'Robot screen will show ';
        },
        function () {
          return '.';
        },
        function (robotState) {
          var idx = robotState.currentScreen;
          return screenList[idx] ? screenList[idx].name : '';
        },
        robot.setScreen.bind(robot),
        'currentScreen'
      );
    } else {
      div.innerHTML = '<p class="text-muted">No screens available. Use Belly Editor to add screens.</p>';
    }

    // POSES
    var poseList = apiStates.poses || [];
    var div = document.getElementById('poseControls');
    div.innerHTML = '';
    if (poseList.length > 0) {
      poseList.forEach((elem, index) => {
        if (elem != null) {
          div.innerHTML +=
            `<div class="btn-group" role="group" style="padding-bottom:4pt">` +
            `<button type="button" class="btn btn-info" onclick="poseChanged(` +
            index +
            `, '` +
            elem.name +
            `')">` +
            elem.name +
            `</button></div>`;
        }
      });
    } else {
      div.innerHTML = '<p class="text-muted">No poses available.</p>';
    }

    // Set multiple motors at once (pose editor/sliders)
    var poseControlDiv = document.getElementById('motorPoseControls');
    poseControlDiv.innerHTML = '';
    poseControlDiv.innerHTML =
      '<div class="d-flex row flex-nowrap"><div class="col" id="poseMotorLabels"></div><div class="col-auto" id="poseMotorInputs"></div></div>';
    var labelDiv = document.getElementById('poseMotorLabels');
    var inputDiv = document.getElementById('poseMotorInputs');

    motorState = normalizeMotors(apiStates.motors);

    if (motorState && motorState.length > 0) {
      motorState.forEach((elem, index) => {
        var motorValue = 'value=' + (elem && elem.value ? parseInt(elem.value) : 0);
        var motorName = elem && elem.name ? elem.name : 'Motor ' + index;
        var motorMin = elem && elem.min != undefined ? parseInt(elem.min) : 1500;
        var motorMax = elem && elem.max != undefined ? parseInt(elem.max) : 2500;

        labelDiv.innerHTML +=
          `<h3 class="pr-2" style="padding-top: 5pt">` + motorName + `: </h3>`;
        inputDiv.innerHTML +=
          `<div class="row" style="padding-bottom: 7pt"> <input class="col slider" type="range" id="poseControl` +
          index +
          `" min="` +
          motorMin +
          `" max="` +
          motorMax +
          `" ` +
          motorValue +
          ` oninput="manualPoseChanged()"></div>`;
      });
    } else {
      labelDiv.innerHTML = '<p class="text-muted">No motor controls available.</p>';
    }

    // Individual motors
    var div = document.getElementById('motorControls');
    div.innerHTML = '';
    div.innerHTML =
      '<div class="d-flex row flex-nowrap"><div class="col" id="indivMotorLabels"></div><div class="col-auto" id="indivMotorInputs"></div></div>';
    var labelDiv = document.getElementById('indivMotorLabels');
    var inputDiv = document.getElementById('indivMotorInputs');
    if (robotState.motors) {
      motorState = normalizeMotors(robotState.motors);
      motorState.forEach((elem, index) => {
        motorValue = 'value=' + (elem && elem.value ? parseInt(elem.value) : 0);
        motorName = elem && elem.name ? elem.name : 'Motor ' + index;
        motorMin = elem && elem.min != undefined ? parseInt(elem.min) : 1500;
        motorMax = elem && elem.max != undefined ? parseInt(elem.max) : 2500;
        labelDiv.innerHTML +=
          `<h3 class="pr-2" style="padding-top: 5pt">` + motorName + `: </h3>`;
        inputDiv.innerHTML +=
          `<div class="row" style="padding-bottom: 7pt"> <button class="btn btn-info btn-sm mx-1" onclick="motorInputChanged(` +
          index +
          `,'` +
          elem.name +
          `',` +
          `{'value':` +
          motorMin +
          `})"><<</button><input class="col slider" type="range" id="motorControl` +
          index +
          `" min="` +
          motorMin +
          `" max="` +
          motorMax +
          `" ` +
          motorValue +
          ` oninput="motorInputChanged(` +
          index +
          `,'` +
          elem.name +
          `',this)">` +
          `<button class="btn btn-info btn-sm mx-1" onclick="motorInputChanged(` +
          index +
          `,'` +
          elem.name +
          `',` +
          `{'value':` +
          motorMax +
          `})">>></button></div>`;
      });
    } else {
      labelDiv.innerHTML = '<p class="text-muted">No motors in state.</p>';
    }

    // Head touch indicator
    var headTouchedDiv = document.getElementById('headTouched');
    if (robotState.headTouched != null && robotState.headTouched != undefined) {
      if (robotState.headTouched == true) {
        headTouchedDiv.className = 'col-md align-content-center headTouched';
        headTouchedDiv.innerHTML = '<h5>Head Touched</h5>';
      } else {
        headTouchedDiv.className = 'col-md align-content-center headNotTouched';
        headTouchedDiv.innerHTML = '<h5>Head Not Touched</h5>';
      }
    } else {
      headTouchedDiv.className = 'col-md align-content-center';
      headTouchedDiv.innerHTML = '';
    }
  }
}

function createPresetSpeakControls() {
  if (customAPI != null && robotAPI != null) {
    var presetSpeakList = customAPI.actions.presetSpeak;

    if (presetSpeakList != null) {
      var presetDiv = document.getElementById('presetSpeak');
      var presetHTML = '';
      for (var i = 0; i < presetSpeakList.length; i++) {
        presetHTML += "<button class='btn btn-info' onclick='sayPreset(this)'>";
        presetHTML += presetSpeakList[i] + '</button>';
      }
      presetDiv.innerHTML = presetHTML;
    }
  }
}

function createStateChangeInterface(
  divName,
  snapshot,
  stateList,
  currentIndex,
  headerText,
  textIntro,
  textOutro,
  getStateNameFromRobotState,
  setState,
  stateKey
) {
  var div = document.getElementById(divName);

  var text = '';
  text += '<h2>' + headerText + '</h2>';
  text += '<p class="card-text font-weight-light">';
  text += textIntro();
  text +=
    '<span id="' +
    stateKey +
    'Name">' +
    getStateNameFromRobotState(snapshot) +
    '</span>';
  text += textOutro();
  text += '</p>';

  text += '<div class="row flex-nowrap green-scroll">';

  text += '<div class="btn-group mr-2 py-2" role="group">';
  for (var i = 0; i < stateList.length; i++) {
    if (stateList[i] != null) {
      var className = 'btn btn-light';
      if (i == currentIndex) {
        className = 'btn btn-warning';
      }
      text +=
        "<button type='button' class='" +
        className +
        "' onclick='set" +
        stateKey +
        '(' +
        i +
        ")' id='set" +
        stateKey +
        'Button' +
        i +
        "'>";
      text += stateList[i].name;
      text += '</button>';
    }
  }
  text += '</div>';

  text += '</div>';
  div.innerHTML = text;

  window['set' + stateKey] = function (index) {
    var robotState = snapshot;
    robotState[stateKey] =
      index >= 0 && index < stateList.length ? index : robotState[stateKey];
    setState(robotState, stateList);
  };
}

function motorInputChanged(index, name, target) {
  robot.setMotor(index, name, parseInt(target.value), motorState);
}

function excitementChanged(target) {
  value = target.value;
  if (value > 0 && value < 100) {
    // console.log(value);
    robot.setExcitement(target.value);
  }
}

function manualPoseChanged() {
  let updatedMotorState = [...motorState];
  motorState.forEach((elem, index) => {
    updatedMotorState[index] = {
      ...updatedMotorState[index],
      value: parseInt(document.getElementById('poseControl' + index).value),
    };
  });
  robot.setMotors(updatedMotorState);
}

function poseChanged(index, name) {
  robot.setPose(index, name, poseState, motorState);
}

function saveAsPose() {
  var text = document.getElementById('savePoseText').value;
  robot.savePose(text, motorState);
}

function headTouched() {
  // To be done if needed
}

function sayPreset(target) {
  var text = target.innerHTML;
  speakTextOutLoud(text);
}

function speakPressed() {
  var speakText = document.getElementById('speakText');
  var text = speakText.value;
  console.log('Speaking');
  console.log('will say:' + text);
  // requestRobotAction("speak", {text:text});
  speakTextOutLoud(text);
}

function bubblePressed() {
  var bubbleText = document.getElementById('bubbleInputText');
  var text = bubbleText.value;
  robot.setSpeechBubble(text);
}

function bubbleClear() {
  robot.setSpeechBubble('');
}
