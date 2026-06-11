const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const AT_BASE       = process.env.AIRTABLE_BASE_ID;
const AT_TOKEN      = process.env.AIRTABLE_TOKEN;
const AT_API        = `https://api.airtable.com/v0/${AT_BASE}/Footage`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are an expert video editor working on a brand sizzle reel for RPI (Rensselaer Polytechnic Institute). Analyze footage folder names and assign each to the correct beat. You must return an entry for EVERY folder provided — do not skip any.

BEATS:
hook — Stops someone mid-scroll in first 3 seconds. Kinetic movement, drones, sports, formula cars, fast action, hockey, athletic energy, machinery in motion.
b01 — World established. Wide campus shots, drone, city views, architecture, RPI signage, overlooks of Troy NY.
b02 — Inventive Curiosity (5-15s). Labs, hands on prototypes, engineering workspaces, The Forge, The MILL, CBIS Building, computer science, architecture studio, B-Roll subfolders from named person segments.
b03 — Collaboration (15-25s). Establishing subfolders from named person segments, classrooms, clubs, student orgs, engineering ambassadors, group moments, mentorship.
b04 — Life + Troy (25-35s). Hockey, football, athletics, Troy NY, farmers market, downtown, campus life, hammocks, a dog, leisure and human moments.
b05 — Inspired/Payoff (35-45s). Alumni segments, entrepreneurship footage, Velan Studios, Karthik Bala, brand VFX, title sequences, exports, lower thirds.
tbd — Anything inside a GEMS folder path. Rights unconfirmed.
new — Anything you are unsure about or that does not clearly fit another beat.

PRIORITY: high = strong editorial value. med = useful but needs review. low = weak fit.
NOTES: One sentence. What to look for and why it fits.

You MUST return an entry for every single folder. Return ONLY valid JSON array, no markdown:
[{"folder":"name","beat":"hook|b01|b02|b03|b04|b05|tbd|new","priority":"high|med|low","notes":"note"}]`;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: 'Method not allowed' };

  try {
    const { folders } = JSON.parse(event.body);
    if (!folders || !folders.length) {
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: 0 }) };
    }

    // Call Claude with this batch
    const folderList = folders.map(f => `- "${f.folder}" (path: ${f.path})`).join('\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Analyze these footage folders for the RPI sizzle reel. Mark anything in a GEMS path as tbd. Return an entry for EVERY folder.\n\nFOLDERS:\n${folderList}\n\nReturn only the JSON array.`
        }]
      })
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API ${claudeRes.status}: ${errText}`);
    }

    const claudeData = await claudeRes.json();
    if (claudeData.error) throw new Error(claudeData.error.message);

    const text     = claudeData.content?.[0]?.text || '[]';
    const analyzed = JSON.parse(text.replace(/```json|```/g, '').trim());

    // Build a lookup from Claude's response
    const lookup = {};
    for (const row of analyzed) lookup[row.folder] = row;

    // Write EVERY input folder — use Claude's beat/notes where available, fallback to new
    const atHeaders = { 'Authorization': `Bearer ${AT_TOKEN}`, 'Content-Type': 'application/json' };
    let saved = 0;

    for (const f of folders) {
      const claude = lookup[f.folder] || {};
      await fetch(AT_API, {
        method: 'POST',
        headers: atHeaders,
        body: JSON.stringify({
          fields: {
            Folder:   f.folder          || '',
            Path:     f.path            || '',
            Beat:     claude.beat       || 'new',
            Priority: claude.priority   || 'med',
            Status:   'unchecked',
            Notes:    claude.notes      || '',
            isAI:     true,
          }
        })
      });
      saved++;
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ saved, total: analyzed.length }),
    };

  } catch (err) {
    console.error('analyze error:', err.message);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
