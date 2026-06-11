// This function is no longer used — analysis runs client-side directly
// Keeping file to avoid 404s on old deploys
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify({ ok: true })
});
