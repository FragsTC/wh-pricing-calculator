exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { endpoint, payload } = body;

  const ALLOWED = [
    'contacts/locate',
    'contacts/addupdate',
    'contacts/get',
    'appointments/query'
  ];

  if (!ALLOWED.includes(endpoint)) {
    return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Endpoint not allowed' }) };
  }

  try {
    const resp = await fetch(`https://serviceminder.com/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch (err) {
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'ServiceMinder unreachable', detail: err.message })
    };
  }
};
