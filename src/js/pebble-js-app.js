Pebble.addEventListener("showConfiguration",
  function(e) {
    //Load the remote config page
    Pebble.openURL("http://winterwinter.github.io/DuckHunt/");
  }
);

Pebble.addEventListener("webviewclosed",
  function(e) {
    //Get JSON dictionary
    var config = JSON.parse(decodeURIComponent(e.response));
    console.log("Temperature Scale " + JSON.stringify(config.scale));

    // Persist city in this JS environment's own storage. (apiKey is no
    // longer used - see note below - but we still accept it harmlessly
    // if the config page sends one.)
    localStorage.setItem("city", config.city || "");

    var dictionary = {
      "KEY_SCALE" : config.scale,
       };

    //Send to Pebble, persist there
    Pebble.sendAppMessage(dictionary,
      function(e) {
        console.log("Sending settings data...");
      },
      function(e) {
        console.log("Settings feedback failed!");
      }
    );

    // Refresh weather immediately with the (possibly new) city
    getWeather();
  }
);

// Open-Meteo weather codes (WMO) -> DuckHunt's 5 icon slots.
// 0/1: clear/mostly clear, 2/3: cloudy/overcast, 45/48: fog,
// 51-67 & 80-82: drizzle/rain, 71-77 & 85/86: snow, 95-99: thunderstorm.
function iconFromWeatherCode(code) {
  if (code >= 95) {
    return 4; // Storm
  } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return 2; // Snow
  } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return 3; // Rain
  } else if (code >= 2) {
    return 1; // Cloud (covers 2/3 cloudy/overcast and 45/48 fog)
  } else {
    return 0; // Sun (0 clear, 1 mostly clear)
  }
}


var xhrRequest = function (url, type, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function () {
    callback(this.status, this.responseText);
  };
  xhr.open(type, url);
  xhr.send();
};

function sendWeatherToWatch(tempCelsius, weatherCode) {
  // main.c expects Kelvin (it subtracts 273.15 itself depending on the
  // saved unit preference), so convert here to keep the watch side
  // untouched.
  var kelvin = Math.round(tempCelsius + 273.15);
  var icon = iconFromWeatherCode(weatherCode);

  console.log("Temperature is " + tempCelsius + "C, icon " + icon);

  var dictionary = {
    "KEY_TEMPERATURE": kelvin,
    "KEY_ICON": icon
  };

  Pebble.sendAppMessage(dictionary,
    function(e) {
      console.log("Weather info sent to Pebble successfully!");
    },
    function(e) {
      console.log("Error sending weather info to Pebble!");
    }
  );
}

function fetchWeatherForCoords(lat, lon) {
  var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
      "&longitude=" + lon + "&current=temperature_2m,weather_code";

  xhrRequest(url, 'GET', function(status, text) {
    var json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.log("Weather response wasn't valid JSON: " + text);
      return;
    }

    if (status !== 200 || !json.current) {
      console.log("Open-Meteo weather error (status " + status + "): " + text);
      return;
    }

    sendWeatherToWatch(json.current.temperature_2m, json.current.weather_code);
  });
}

function fetchWeatherForCity(city) {
  var geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(city) + "&count=1&language=en&format=json";

  xhrRequest(geoUrl, 'GET', function(status, text) {
    var json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      console.log("Geocoding response wasn't valid JSON: " + text);
      return;
    }

    if (status !== 200 || !json.results || !json.results.length) {
      console.log("Could not find city '" + city + "', falling back to GPS.");
      navigator.geolocation.getCurrentPosition(locationSuccess, locationError,
        {timeout: 15000, maximumAge: 60000});
      return;
    }

    var result = json.results[0];
    fetchWeatherForCoords(result.latitude, result.longitude);
  });
}

function locationSuccess(pos) {
  fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude);
}

function locationError(err) {
  console.log("Error requesting location!");
}

function getWeather() {
  var city = localStorage.getItem("city");
  if (city) {
    fetchWeatherForCity(city);
  } else {
    navigator.geolocation.getCurrentPosition(
      locationSuccess,
      locationError,
      {timeout: 15000, maximumAge: 60000}
    );
  }
}

// Listen for when the watchface is opened
Pebble.addEventListener('ready', 
  function(e) {
    console.log("PebbleKit JS ready!");

    // Get the initial weather
    getWeather();
  }
);

// Listen for when an AppMessage is received
Pebble.addEventListener('appmessage',
  function(e) {
    console.log("AppMessage received!");
    getWeather();
  }                     
);
