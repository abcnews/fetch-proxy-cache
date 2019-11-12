const got = require('got');

exports.jsonPlaceholderTask = (config = {}) =>
  got(
    `https://jsonplaceholder.typicode.com/todos/${config.id}`
  ).then(({ body }) =>
    Promise.resolve(typeof body === 'object' ? body : JSON.parse(body))
  );
