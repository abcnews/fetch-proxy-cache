const { preset } = require('.');

preset('json-placeholder-url', (error, data) => {
  console.log('preset(json-placeholder-url)', error, data);
});

preset('json-placeholder-task', (error, data) => {
  console.log('preset(json-placeholder-task)', error, data);
});

// preset("vote-compass-results-count", (error, data) => {
//   console.log("preset(vote-compass-results-count)", error, data);
// });
