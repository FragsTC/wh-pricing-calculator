const https = require('https');

const PROJECT_ID = 'ssc-calculator-wh';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function firestoreRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${FIRESTORE_BASE}/${path}`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function toFirestore(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === 'string') fields[k] = { stringValue: v };
    else if (typeof v === 'number') fields[k] = { doubleValue: v };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'object') fields[k] = { mapValue: { fields: toFirestore(v).fields || {} } };
  }
  return { fields };
}

function fromFirestore(doc) {
  if (!doc || !doc.fields) return null;
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    if (v.stringValue !== undefined) obj[k] = v.stringValue;
    else if (v.doubleValue !== undefined) obj[k] = v.doubleValue;
    else if (v.integerValue !== undefined) obj[k] = parseInt(v.integerValue);
    else if (v.booleanValue !== undefined) obj[k] = v.booleanValue;
    else if (v.nullValue !== undefined) obj[k] = null;
    else if (v.mapValue) obj[k] = fromFirestore(v.mapValue);
    else if (v.arrayValue) obj[k] = (v.arrayValue.values||[]).map(i => fromFirestore({ fields: { _: i } })._);
  }
  return obj;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let body;
  try { body = JSON.parse(event.body); }
  catch(e) { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { action, locationId, data } = body;

  try {
    // GET all locations (list)
    if (action === 'list_locations') {
      const res = await firestoreRequest('locations', 'GET');
      if (res.status !== 200) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Firestore error', detail: res.body }) };
      const docs = (res.body.documents || []).map(doc => {
        const id = doc.name.split('/').pop();
        const d = fromFirestore(doc);
        return { id, name: d.name, state: d.state };
      });
      docs.sort((a,b) => a.name.localeCompare(b.name));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ locations: docs }) };
    }

    // GET single location
    if (action === 'get_location') {
      const res = await firestoreRequest(`locations/${locationId}`, 'GET');
      if (res.status === 404) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Location not found' }) };
      if (res.status !== 200) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Firestore error' }) };
      const d = fromFirestore(res.body);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ location: d }) };
    }

    // VERIFY PIN for location
    if (action === 'verify_pin') {
      const res = await firestoreRequest(`locations/${locationId}`, 'GET');
      if (res.status !== 200) return { statusCode: 404, headers: CORS, body: JSON.stringify({ valid: false, error: 'Location not found' }) };
      const d = fromFirestore(res.body);
      const valid = d.pin === data.pin;
      if (!valid) return { statusCode: 200, headers: CORS, body: JSON.stringify({ valid: false }) };
      // Return location data on valid PIN (excluding pin itself)
      const { pin, ...safe } = d;
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ valid: true, location: safe }) };
    }

    // SAVE prices for location
    if (action === 'save_prices') {
      const res = await firestoreRequest(`locations/${locationId}`, 'GET');
      if (res.status !== 200) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Location not found' }) };
      const existing = fromFirestore(res.body);
      const updated = { ...existing, prices: data.prices };
      const patchRes = await firestoreRequest(
        `locations/${locationId}`,
        'PATCH',
        toFirestore(updated)
      );
      if (patchRes.status !== 200) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Save failed' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // CHANGE PIN for location
    if (action === 'change_pin') {
      const res = await firestoreRequest(`locations/${locationId}`, 'GET');
      if (res.status !== 200) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Location not found' }) };
      const existing = fromFirestore(res.body);
      // Verify current PIN
      if (existing.pin !== data.currentPin) return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: false, error: 'Current PIN incorrect' }) };
      const updated = { ...existing, pin: data.newPin };
      const patchRes = await firestoreRequest(`locations/${locationId}`, 'PATCH', toFirestore(updated));
      if (patchRes.status !== 200) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'PIN change failed' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    // MASTER: change PIN for any location
    if (action === 'master_change_pin') {
      const res = await firestoreRequest(`locations/${locationId}`, 'GET');
      if (res.status !== 200) return { statusCode: 404, headers: CORS, body: JSON.stringify({ error: 'Location not found' }) };
      const existing = fromFirestore(res.body);
      const updated = { ...existing, pin: data.newPin };
      const patchRes = await firestoreRequest(`locations/${locationId}`, 'PATCH', toFirestore(updated));
      if (patchRes.status !== 200) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'PIN change failed' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown action' }) };

  } catch(err) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Function error', detail: err.message }) };
  }
};
