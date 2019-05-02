const cors = require('cors')({ origin: true });
const RateLimit = require('express-rate-limit');
const admin = require('firebase-admin');
const functions = require('firebase-functions');
const got = require('got');

const ABC_IPS = '203.2.218.'; // ABC-AU is allocated 203.2.218.0 to 203.2.218.255
const QUERY_ERROR = `Missing query parameter`;
const REFERENCE_ERROR = `Reference does not exist`;

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

const probes = {};

// Return a preset
exports.preset = functions.https.onRequest((req, res) =>
  cors(req, res, () =>
    limiter(req, res, () => {
      const { name } = req.method === 'POST' ? JSON.parse(req.body) : req.query;

      if (!name) {
        return res.json({ error: QUERY_ERROR });
      }

      const path = `presets/${name}`;

      if (!probes[path]) {
        probes[path] = new Promise((resolve, reject) => {
          const presetRef = db.ref(path);

          presetRef
            .once('value')
            .then(snapshot => {
              const preset = snapshot.val();

              if (preset == null) {
                return reject(REFERENCE_ERROR);
              }

              if (preset.latestResponse && preset.latestResponse.time + preset.maxAgeMS > Date.now()) {
                return resolve(preset.latestResponse.data);
              }

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
                      resolve(data);
                    })
                    .catch(reject);
                })
                .catch(reject);
            })
            .catch(reject);
        });

        function always() {
          setImmediate(() => {
            delete probes[path];
          });
        }

        probes[path].then(always, always);
      }

      probes[path].then(data => res.json({ data })).catch(error => res.json({ error }));
    })
  )
);
