exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({ status: 'ok', ts: new Date().toISOString() }),
  };
};
