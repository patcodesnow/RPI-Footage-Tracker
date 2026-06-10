const BASE_ID  = process.env.AIRTABLE_BASE_ID;
const TOKEN    = process.env.AIRTABLE_TOKEN;
const TABLE    = 'Footage';
const API      = `https://api.airtable.com/v0/${BASE_ID}/${TABLE}`;

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  const method = event.httpMethod;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };

  if (method === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    // GET — fetch all records
    if (method === 'GET') {
      let records = [];
      let offset = null;
      do {
        const url = offset ? `${API}?offset=${offset}` : API;
        const res  = await fetch(url, { headers });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        records = records.concat(json.records || []);
        offset  = json.offset || null;
      } while (offset);

      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      };
    }

    // POST — create record
    if (method === 'POST') {
      const body = JSON.parse(event.body);
      const res  = await fetch(API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fields: body.fields }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(json) };
    }

    // PATCH — update record
    if (method === 'PATCH') {
      const body    = JSON.parse(event.body);
      const recId   = body.id;
      const res     = await fetch(`${API}/${recId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ fields: body.fields }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(json) };
    }

    // DELETE — remove record
    if (method === 'DELETE') {
      const recId = event.queryStringParameters?.id;
      const res   = await fetch(`${API}/${recId}`, { method: 'DELETE', headers });
      const json  = await res.json();
      if (json.error) throw new Error(json.error.message);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(json) };
    }

    return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
