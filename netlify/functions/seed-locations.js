const https = require('https');

const PROJECT_ID = 'ssc-calculator-wh';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const LOCATIONS = [
  { id: 'birmingham-al',      name: 'Birmingham',       state: 'Alabama' },
  { id: 'scottsdale-az',      name: 'Scottsdale',       state: 'Arizona' },
  { id: 'boca-raton-fl',      name: 'Boca Raton',       state: 'Florida' },
  { id: 'orlando-fl',         name: 'Orlando',          state: 'Florida' },
  { id: 'ormond-beach-fl',    name: 'Ormond Beach',     state: 'Florida' },
  { id: 'sarasota-fl',        name: 'Sarasota',         state: 'Florida' },
  { id: 'northern-tampa-fl',  name: 'Northern Tampa',   state: 'Florida' },
  { id: 'atlanta-ga',         name: 'Atlanta',          state: 'Georgia' },
  { id: 'boise-id',           name: 'Boise',            state: 'Idaho' },
  { id: 'northwest-omaha-ne', name: 'Northwest Omaha',  state: 'Nebraska' },
  { id: 'albuquerque-nm',     name: 'Albuquerque',      state: 'New Mexico' },
  { id: 'huntington-ny',      name: 'Huntington',       state: 'New York' },
  { id: 'cary-nc',            name: 'Cary',             state: 'North Carolina' },
  { id: 'charlotte-nc',       name: 'Charlotte',        state: 'North Carolina' },
  { id: 'concord-nc',         name: 'Concord',          state: 'North Carolina' },
  { id: 'durham-chapel-hill-nc', name: 'Durham–Chapel Hill', state: 'North Carolina' },
  { id: 'greensboro-nc',      name: 'Greensboro',       state: 'North Carolina' },
  { id: 'lake-norman-nc',     name: 'Lake Norman',      state: 'North Carolina' },
  { id: 'raleigh-nc',         name: 'Raleigh',          state: 'North Carolina' },
  { id: 'wilmington-nc',      name: 'Wilmington',       state: 'North Carolina' },
  { id: 'winston-salem-nc',   name: 'Winston-Salem',    state: 'North Carolina' },
  { id: 'north-columbus-oh',  name: 'North Columbus',   state: 'Ohio' },
  { id: 'charleston-sc',      name: 'Charleston',       state: 'South Carolina' },
  { id: 'columbia-sc',        name: 'Columbia',         state: 'South Carolina' },
  { id: 'greenville-sc',      name: 'Greenville',       state: 'South Carolina' },
  { id: 'lake-wylie-sc',      name: 'Lake Wylie',       state: 'South Carolina' },
  { id: 'franklin-tn',        name: 'Franklin',         state: 'Tennessee' },
  { id: 'nashville-tn',       name: 'Nashville',        state: 'Tennessee' },
  { id: 'west-knoxville-tn',  name: 'West Knoxville',   state: 'Tennessee' },
  { id: 'austin-tx',          name: 'Austin',           state: 'Texas' },
  { id: 'college-station-tx', name: 'College Station',  state: 'Texas' },
  { id: 'frisco-tx',          name: 'Frisco',           state: 'Texas' },
  { id: 'fort-worth-tx',      name: 'Fort Worth',       state: 'Texas' },
  { id: 'southlake-tx',       name: 'Southlake',        state: 'Texas' },
  { id: 'the-woodlands-tx',   name: 'The Woodlands',    state: 'Texas' },
  { id: 'west-houston-tx',    name: 'West Houston',     state: 'Texas' },
  { id: 'leesburg-va',        name: 'Leesburg',         state: 'Virginia' },
];

const DEFAULT_PRICES = {
  'win-ie':    [250,450,560,null],
  'win-e':     [175,250,320,null],
  'win-sky':   [15,15,15,15],
  'win-sol':   [15,15,15,15],
  'win-sil':   [100,200,250,null],
  'win-scr':   [100,200,275,null],
  'win-scre':  [100,200,250,null],
  'gut-cl':    [175,215,285,null],
  'gut-gd':    [175,200,225,null],
  'gut-gi':    [null,null,null,null],
  'hw-wash':   [275,325,450,null],
  'hw-porch':  [75,75,100,null],
  'hw-sid':    [null,null,null,null],
  'pw-driv':   [null,null,null,null],
  'pw-oth':    [null,null,null,null],
  'rf-conc':   [null,null,null,null],
  'rf-slat':   [null,null,null,null],
  'rf-span':   [null,null,null,null],
  'rf-met':    [null,null,null,null],
  'rf-bar':    [null,null,null,null],
  'oth-hd':    [null,null,null,null],
  'oth-pc':    [null,null,null,null],
  'oth-storm': [null,null,null,null],
  'oth-pool':  [null,null,null,null],
};

function toFirestoreValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFirestoreValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toFirestoreValue(val);
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFirestore(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) fields[k] = toFirestoreValue(v);
  return { fields };
}

function firestoreWrite(locationId, docBody) {
  return new Promise((resolve, reject) => {
    const path = `/v1/projects/${PROJECT_ID}/databases/(default)/documents/locations/${locationId}`;
    const bodyStr = JSON.stringify(docBody);
    const options = {
      hostname: 'firestore.googleapis.com',
      path,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  // Simple secret check so this can't be called by anyone
  const secret = event.queryStringParameters && event.queryStringParameters.secret;
  if (secret !== 'wh-seed-2024') {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  const results = [];
  for (const loc of LOCATIONS) {
    const doc = toFirestore({
      name: loc.name,
      state: loc.state,
      pin: '1234',
      ownerEmail: '',
      ownerName: '',
      smApiKey: '',
      prices: DEFAULT_PRICES
    });
    try {
      const res = await firestoreWrite(loc.id, doc);
      results.push({ id: loc.id, status: res.status });
    } catch(e) {
      results.push({ id: loc.id, error: e.message });
    }
  }

  const ok = results.filter(r => r.status === 200).length;
  const fail = results.filter(r => r.error || r.status !== 200).length;

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ seeded: ok, failed: fail, results })
  };
};
