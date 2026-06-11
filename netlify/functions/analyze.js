const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are an expert video editor and creative director working on a brand sizzle reel for Rensselaer Polytechnic Institute (RPI). Your job is to analyze footage folder names and assign each one to the correct beat in the film's editorial structure.

THE FILM STRUCTURE — 5 beats:

HOOK (beat: "hook") — 0-5 seconds
The most important section. Stops someone mid-scroll on social media. A great hook has:
- Immediate visual energy — something is already happening
- Kinetic movement — drones, sports, fast action, formula cars, machinery in motion
- Texture and detail — hands on things, close-ups, surfaces
- Athletic energy — hockey, stadium moments, competition
Best folder types: drone footage, aerial, sports/athletics, makerspaces with machinery, formula car builds, anything with speed or movement

BEAT 01 — World established (beat: "b01") — 0-5s
Establishing the world of RPI. Wide shots, campus identity.
Best folder types: drone, aerial, campus exteriors, building exteriors, city views, overlooking Troy, signage

BEAT 02 — Inventive Curiosity (beat: "b02") — 5-15s
People making things. Labs, hands on prototypes, building and discovery.
Best folder types: labs, engineering spaces, makerspaces, The Forge, The MILL, CBIS, computer science, architecture, formula car builds, research footage, B-Roll from named person segments

BEAT 03 — Collaborative Problem-Solving (beat: "b03") — 15-25s
People working together across disciplines.
Best folder types: named person segments (Establishing shots), classrooms, clubs, student organizations, engineering ambassadors, group discussions, mentorship moments

BEAT 04 — Life + Troy (beat: "b04") — 25-35s
The human side of RPI. Life beyond the work.
Best folder types: hockey, football, athletics, Troy NY, farmers market, downtown, campus life, hammocks, social moments, a dog

BEAT 05 — Inspired / Brand Payoff (beat: "b05") — 35-45s
Where ideas become reality. Alumni impact, brand resolution.
Best folder types: alumni segments, entrepreneurship footage, Velan Studios, Karthik Bala, company footage, brand VFX, title sequences, exports

TBD — Rights unclear (beat: "tbd")
Anything inside the GEMS folder structure — rights unconfirmed.

SKIP — Do not include (beat: "skip")
Internal project files, not actual footage:
- Files ending in .PRV
- Adobe Premiere Audio/Video Previews, Auto-Save folders
- Render Files, Proxy Media, Transcoded Media
- System folders (.lock-dir, __Temp)
- Raw camera card subfolders (DCIM, AUDIO, MISC, CARD_1, CARD_2, CARD_3)
- Date-stamped Premiere project backup names (like GEMS_251113.PRV)
- Motion template internals

Return ONLY a valid JSON array. No markdown, no explanation. Format:
[{"folder":"exact folder name","beat":"hook|b01|b02|b03|b04|b05|tbd|skip","priority":"high|med|low","notes":"one sentence max"}]`;

async function analyzeChunk(folders) {
  const folderList = folders.map(f => `- "${f.folder}" (path: ${f.path})`).join('\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      messages: [{
        role: 'user',
        content: `Analyze these footage folders. Mark GEMS/ content as tbd, internal project files as skip.\n\nFOLDERS:\n${folderList}\n\nReturn only the JSON array.`
      }]
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Claude API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const text  = data.content?.[0]?.text || '[]';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  try {
    const { folders } = JSON.parse(event.body);

    // Pre-filter obvious junk before sending to Claude
    const filtered = folders.filter(f => {
      const name = f.folder.toLowerCase();
      if (!name || name.length < 2) return false;
      if (name.endsWith('.prv')) return false;
      if (name.startsWith('.')) return false;
      if (/^gems_\d{6}/.test(name)) return false; // GEMS project backup names
      return true;
    });

    if (!filtered.length) {
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify([]) };
    }

    // Process in chunks of 40 to stay well within token limits
    const CHUNK_SIZE = 40;
    const chunks = [];
    for (let i = 0; i < filtered.length; i += CHUNK_SIZE) {
      chunks.push(filtered.slice(i, i + CHUNK_SIZE));
    }

    let allResults = [];
    for (const chunk of chunks) {
      const chunkResults = await analyzeChunk(chunk);
      allResults = allResults.concat(chunkResults);
    }

    // Merge back with original path data
    const result = allResults.map(a => {
      const original = filtered.find(f => f.folder === a.folder) || {};
      return {
        folder:   a.folder,
        path:     original.path || '',
        beat:     a.beat     || 'new',
        priority: a.priority || 'med',
        notes:    a.notes    || '',
        status:   'unchecked',
        isAI:     true,
      };
    });

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };

  } catch (err) {
    console.error('Analyze error:', err);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
