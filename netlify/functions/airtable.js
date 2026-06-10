const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN   = process.env.AIRTABLE_TOKEN;
const TABLE   = 'Footage';
const API     = `https://api.airtable.com/v0/${BASE_ID}/${TABLE}`;

const atHeaders = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function respond(statusCode, body) {
  return { statusCode, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    // GET — fetch all records with pagination
    if (event.httpMethod === 'GET') {
      let records = [], offset = null;
      do {
        const url = offset ? `${API}?offset=${offset}` : API;
        const res  = await fetch(url, { headers: atHeaders });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        records = records.concat(json.records || []);
        offset  = json.offset || null;
      } while (offset);
      return respond(200, records);
    }

    // POST — create single record
    if (event.httpMethod === 'POST') {
      const { fields } = JSON.parse(event.body);
      const res  = await fetch(API, { method: 'POST', headers: atHeaders, body: JSON.stringify({ fields }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return respond(200, json);
    }

    // POST batch — create up to 10 records at once
    // Called as POST /api/airtable?batch=1
    if (event.httpMethod === 'POST' && event.queryStringParameters?.batch) {
      const { records } = JSON.parse(event.body);
      const res  = await fetch(API, { method: 'POST', headers: atHeaders, body: JSON.stringify({ records }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return respond(200, json);
    }

    // PATCH — update single record
    if (event.httpMethod === 'PATCH') {
      const { id, fields } = JSON.parse(event.body);
      const res  = await fetch(`${API}/${id}`, { method: 'PATCH', headers: atHeaders, body: JSON.stringify({ fields }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return respond(200, json);
    }

    // DELETE — remove record
    if (event.httpMethod === 'DELETE') {
      const id  = event.queryStringParameters?.id;
      const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: atHeaders });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return respond(200, json);
    }

    return respond(405, { error: 'Method not allowed' });

  } catch (err) {
    return respond(500, { error: err.message });
  }
};
