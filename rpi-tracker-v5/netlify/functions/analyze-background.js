const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const AT_BASE       = process.env.AIRTABLE_BASE_ID;
const AT_TOKEN      = process.env.AIRTABLE_TOKEN;
const AT_API        = `https://api.airtable.com/v0/${AT_BASE}/Footage`;
const CHUNK_SIZE    = 35;

const SYSTEM_PROMPT = `You are an expert video editor and creative director working on a brand sizzle reel for Rensselaer Polytechnic Institute (RPI). Analyze footage folder names and assign each to the correct beat.

BEATS:
hook — Stops someone mid-scroll. Kinetic movement, drones, sports, formula cars, fast action, athletic energy, machinery in motion. High priority if it has speed or movement.
b01 — World established. Wide campus shots, drone, city views, architecture, RPI signage, overlooks.
b02 — Inventive Curiosity (5-15s). Labs, hands on prototypes, engineering workspaces, The Forge, The MILL, CBIS, computer science, architecture studio, B-Roll from named person segments.
b03 — Collaboration (15-25s). Establishing shots from named person segments (portraits), classrooms, clubs, student orgs, engineering ambassadors, group moments, mentorship.
b04 — Life + Troy (25-35s). Hockey, football, athletics, Troy NY, farmers market, downtown, campus life, hammocks, a dog, leisure moments.
b05 — Inspired/Payoff (35-45s). Alumni segments, entrepreneurship, Velan Studios, Karthik Bala, brand VFX, title sequences, exports, lower thirds.
tbd — Anything inside GEMS/ folder. Rights unconfirmed.
skip — Internal project files only: .PRV files, Adobe Premiere Audio/Video Previews, Auto-Save, Render Files, Proxy Media, Transcoded Media, .lock-dir, __Temp, DCIM, AUDIO, MISC, CARD_1/2/3.

PRIORITY: high = clear editorial value. med = needs review. low = backup only.
NOTES: One sentence max. Specific about what to look for.

Return ONLY a valid JSON array, no markdown:
[{"folder":"name","beat":"hook|b01|b02|b03|b04|b05|tbd|skip","priority":"high|med|low","notes":"note"}]`;

async function analyzeChunk(folders) {
  const folderList = folders.map(f => `- "${f.folder}" (path: ${f.path})`).join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Analyze these footage folders. Mark GEMS/ content as tbd, internal project files as skip.\n\nFOLDERS:\n${folderList}\n\nReturn only the JSON array.` }]
    })
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const text = json.content?.[0]?.text || '[]';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function writeToAirtable(rows) {
  const headers = { 'Authorization': `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' };
  for (const row of rows) {
    await fetch(AT_API, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        fields: {
          Folder: row.folder || '',
          Path: row.path || '',
          Beat: row.beat || 'new',
          Priority: row.priority || 'med',
          Status: 'unchecked',
          Notes: row.notes || '',
          isAI: true,
        }
      })
    });
  }
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  try {
    const { folders } = JSON.parse(event.body);

    const filtered = folders.filter(f => {
      const n = f.folder.toLowerCase();
      if (!n || n.length < 2) return false;
      if (n.endsWith('.prv')) return false;
      if (n.startsWith('.')) return false;
      if (/^gems_\d{6}/i.test(n)) return false;
      return true;
    });

    if (!filtered.length) {
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ added: 0, skipped: 0 }) };
    }

    // Process in chunks
    const chunks = [];
    for (let i = 0; i < filtered.length; i += CHUNK_SIZE) chunks.push(filtered.slice(i, i + CHUNK_SIZE));

    let allResults = [];
    for (const chunk of chunks) {
      const results = await analyzeChunk(chunk);
      allResults = allResults.concat(results);
    }

    // Filter skip, merge paths, write to Airtable
    const toAdd = allResults
      .filter(a => a.beat !== 'skip')
      .map(a => {
        const orig = filtered.find(f => f.folder === a.folder) || {};
        return { ...a, path: orig.path || '' };
      });

    await writeToAirtable(toAdd);

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ added: toAdd.length, skipped: allResults.length - toAdd.length }),
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
