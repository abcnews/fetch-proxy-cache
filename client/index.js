var URI_ROOT =
  window.location.search.indexOf('dev') > -1
    ? 'http://localhost:5000/fetch-proxy-cache/us-central1/'
    : 'https://us-central1-fetch-proxy-cache.cloudfunctions.net/';
var QUERY_ERROR = 'Missing query parameter';
var NOOP = function() {};

function request(functionName, data, cb) {
  var query = Object.keys(data).reduce(function(memo, propName) {
    var value = data[propName];

    if (value == null) {
      return memo;
    }

    return memo + (memo.length ? '&' : '?') + propName + '=' + value;
  }, '');
  var xhrURL = URI_ROOT + functionName + query;
  var xhr = new XMLHttpRequest();

  xhr.onabort = cb || NOOP;
  xhr.onerror = cb || NOOP;
  xhr.onload = cb
    ? function(event) {
        var response;

        if (xhr.status !== 200) {
          return cb(event);
        }

        try {
          response = JSON.parse(xhr.responseText);
        } catch (e) {
          response = { error: xhr.responseText };
        }

        cb(response.error, response.data);
      }
    : NOOP;
  xhr.open('GET', xhrURL);
  xhr.responseType = 'text';
  xhr.send();
}

module.exports.preset = function(name, cb) {
  request('preset', { name: name }, cb);
};
