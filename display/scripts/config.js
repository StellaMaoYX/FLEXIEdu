function Config() {
  this.config = {
    apiKey: "AIzaSyB10dHhQqD1TMXTJfQNLmFkrJtVyQ4JTuA",
    authDomain: "flexi-f7d77.firebaseapp.com",
    databaseURL: "https://flexi-f7d77-default-rtdb.firebaseio.com",
    projectId: "flexi-f7d77",
    storageBucket: "flexi-f7d77.appspot.com",
    messagingSenderId: "441373455093"
  };
  
  Config.getURLParameter = function(paramName) {
    var url = window.location.toString();
    var urlParamIndex = url.indexOf(paramName+"=");
    var paramValue = null;
    if (urlParamIndex != -1) {
      var valueIndex = urlParamIndex + paramName.length + 1;
      paramValue = url.substring(valueIndex);
      console.log(paramName + ":" + paramValue);
    }
    return paramValue;
  }
}
  
