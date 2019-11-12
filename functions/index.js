const cors = require('cors')({ origin: true });
const RateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const got = require('got');
const tasks = require('./tasks');

const ABC_IPS = '203.2.218.'; // ABC-AU is allocated 203.2.218.0 to 203.2.218.255
const QUERY_ERROR = `Missing query parameter`;
const REFERENCE_ERROR = `Reference does not exist`;
const SLASHES_PATTERN = /\//g;
const DEFAULT_TTL = 60 * 1000; // 1 minute

admin.initializeApp();

const db = admin.database();

// Rate-limit requests from IP addresses outside the ABC network to 15 per 15 minute window
const limiter = new RateLimit({
  delayMs: 0,
  headers: false,
  keyGenerator: req => req.ip,
  max: 15,
  skip: req => req.ip.indexOf(ABC_IPS) === 0,
  windowMs: 15 * 60 * 1000
});

function waitForAny(ref, onFailure) {
  return new Promise(resolve => {
    ref
      .once('value')
      .then(snapshot => resolve(snapshot.val()))
      .catch(onFailure);
  });
}

// Return a preset
exports.preset = functions.https.onRequest((req, res) =>
  cors(req, res, () =>
    limiter(req, res, async () => {
      const success = data => res.json({ data });
      const failure = error => res.json({ error });
      const { name } = req.method === 'POST' ? JSON.parse(req.body) : req.query;

      if (!name) {
        return failure(QUERY_ERROR);
      }

      const path = `presets/${name}`;
      const presetRef = db.ref(path);

      // Get the current preset
      let preset = await waitForAny(presetRef, failure);

      // Only continue for known presets
      if (preset == null) {
        return failure(REFERENCE_ERROR);
      }

      // If the preset's current value exists and is fresh or is being updated, return it
      if (
        preset.latestResponse &&
        (preset.isBeingUpdated ||
          preset.latestResponse.time + (preset.ttl || DEFAULT_TTL) > Date.now())
      ) {
        return success(preset.latestResponse.data);
      }

      // Update the value, then return it
      preset.isBeingUpdated = true;
      presetRef
        .transaction(_ => preset)
        .then(() => {
          const onData = data => {
            preset.isBeingUpdated = null;
            preset.latestResponse = {
              time: Date.now(),
              data
            };

            // Store it
            presetRef
              .transaction(_ => preset)
              .then(() => {
                // Then return it
                console.info(`Updated ${path} with ${JSON.stringify(data)}`);
                success(data);
              })
              .catch(failure);
          };

          // Presets either have a single `url` or a `taskName` that matches
          // a local task, either of which may have a `config` object

          if (preset.url) {
            return got(preset.url, Object.assign({}, preset.config))
              .then(({ body }) =>
                Promise.resolve(
                  typeof body === 'object' ? body : JSON.parse(body)
                )
              )
              .then(onData)
              .catch(failure);
          }

          if (preset.taskName && tasks[preset.taskName]) {
            return tasks[preset.taskName](preset.config)
              .then(onData)
              .catch(failure);
          }

          failure(new Error(`Preset [${name}] not properly configured.`));
        })
        .catch(failure);
    })
  )
);
