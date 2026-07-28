exports.config = { schedule: '*/5 * * * *' };

exports.handler = async () => {
  const started = Date.now();
  try {
    const base = process.env.SITE_URL || 'https://tixuzautos.com';
    const res = await fetch(`${base}/.netlify/functions/buscar-externos?q=warmup&nocache=1`, {
      headers: { Accept: 'application/json' }
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: res.ok, status: res.status, elapsed_ms: Date.now() - started })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err.message || err).slice(0, 200), elapsed_ms: Date.now() - started })
    };
  }
};
