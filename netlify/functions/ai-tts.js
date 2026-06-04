// Tixuz AI · Text-to-Speech vía ElevenLabs
// Usa eleven_multilingual_v2 con voz masculina disponible en plan FREE.

exports.handler = async function (event) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'ELEVENLABS_API_KEY not configured', hint: 'env var missing in Netlify' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const text = (body.text || '').trim();
  if (!text || text.length < 1) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'Empty text' }) };
  }

  const safeText = text.slice(0, 1500);

  // Voces OFICIALES de ElevenLabs disponibles en TODOS los planes (incluyendo FREE):
  //  - "JBFqnCBsd6RMkjVDRZzb" → George (masculina, profunda, británica)
  //  - "nPczCjzI2devNBz1zQrb" → Brian (masculina, narrador)
  //  - "cjVigY5qzO86Huf0OWal" → Eric (masculina, joven amigable) ← BUENA PARA ESPAÑOL
  //  - "iP95p4xoKVk53GoZ742B" → Chris (masculina casual, joven) ← LA QUE USAMOS
  //  - "onwK4e9ZLuTAKqWW03F9" → Daniel (masculina, autoritaria)
  //  - "TX3LPaxmHKxFdv7VOQHJ" → Liam (masculina, joven)
  //  - "bIHbv24MWmeRgasZH58o" → Will (masculina, casual)
  // Doc: https://elevenlabs.io/docs/api-reference/voices
  const voiceId = body.voiceId || 'iP95p4xoKVk53GoZ742B'; // Chris - voz masculina cálida joven

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: safeText,
        model_id: 'eleven_multilingual_v2', // Mejor modelo para español
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.85,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Devolvemos el error EXACTO de ElevenLabs para diagnosticar
      return {
        statusCode: 502,
        headers: cors,
        body: JSON.stringify({
          error: 'ElevenLabs TTS error',
          status: res.status,
          detail: errText.slice(0, 500),
          voiceId,
        }),
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        audio: `data:audio/mpeg;base64,${base64}`,
        chars: safeText.length,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: 'Server error', detail: String(err.message).slice(0, 300) }),
    };
  }
};
