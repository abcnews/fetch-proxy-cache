const cors = require('cors')({ origin: true });
const RateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const got = require('got');

const ABC_IPS = '203.2.218.'; // ABC-AU is allocated 203.2.218.0 to 203.2.218.255
const QUERY_ERROR = `Missing query parameter`;
const REFERENCE_ERROR = `Reference does not exist`;
const SLASHES_PATTERN = /\//g;

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

// Return a preset
exports.preset = functions.https.onRequest((req, res) =>
  cors(req, res, () =>
    limiter(req, res, async () => {
      const { name } = req.method === 'POST' ? JSON.parse(req.body) : req.query;
      const success = data => res.json({ data });
      const failure = error => res.json({ error });

      if (!name) {
        return failure(QUERY_ERROR);
      }

      const path = `presets/${name}`;
      const lockPath = `locks/${path.replace(SLASHES_PATTERN, '__')}`;
      const lockPathRef = db.ref(lockPath);

      // If this is currently locked, wait
      await new Promise(resolve => {
        function lockHandler(snapshot) {
          if (snapshot.val() === null) {
            lockPathRef.off('value', lockHandler);
            resolve();
          }
        }

        lockPathRef.on('value', lockHandler);
      });

      async function unlockAndRespond(error, data) {
        await lockPathRef.remove();

        if (error) {
          return failure(error);
        }

        success(data);
      }

      const presetRef = db.ref(path);

      presetRef
        .once('value')
        .then(async snapshot => {
          const preset = snapshot.val();

          if (preset == null) {
            return failure(REFERENCE_ERROR);
          }

          if (preset.latestResponse && preset.latestResponse.time + preset.maxAgeMS > Date.now()) {
            return success(preset.latestResponse.data);
          }

          await lockPathRef.set(true);

          got(preset.url, Object.assign({}, preset.config))
            .then(({ body }) => {
              const data = typeof body === 'object' ? body : JSON.parse(body);

              preset.latestResponse = {
                time: Date.now(),
                data
              };

              presetRef
                .transaction(_ => preset)
                .then(() => {
                  console.info(`Updated ${path} with ${JSON.stringify(data)}`);
                  unlockAndRespond(null, data);
                })
                .catch(unlockAndRespond);
            })
            .catch(unlockAndRespond);
        })
        .catch(failure);
    })
  )
);
