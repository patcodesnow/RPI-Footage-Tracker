const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TOKEN   = process.env.AIRTABLE_TOKEN;
const API     = `https://api.airtable.com/v0/${BASE_ID}/Footage`;
const HEADERS = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  try {
    if (event.httpMethod === 'GET') {
      let records = [], offset = null;
      do {
        const url = offset ? `${API}?offset=${offset}` : API;
        const res  = await fetch(url, { headers: HEADERS });
        const json = await res.json();
        if (json.error) throw new Error(json.error.message);
        records = records.concat(json.records || []);
        offset  = json.offset || null;
      } while (offset);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(records) };
    }

    if (event.httpMethod === 'POST') {
      const { fields } = JSON.parse(event.body);
      const res  = await fetch(API, { method: 'POST', headers: HEADERS, body: JSON.stringify({ fields }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(json) };
    }

    if (event.httpMethod === 'PATCH') {
      const { id, fields } = JSON.parse(event.body);
      const res  = await fetch(`${API}/${id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ fields }) });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(json) };
    }

    if (event.httpMethod === 'DELETE') {
      const id  = event.queryStringParameters?.id;
      const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: HEADERS });
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(json) };
    }

    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  } catch (err) {
    return { statusCode: 500, headers: cors, body: JSON.stringify({ error: err.message }) };
  }
};
