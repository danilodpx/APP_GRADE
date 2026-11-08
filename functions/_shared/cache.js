// functions/_shared/cache.js
// Utilitários de cache na borda (Edge Cache) e ETag para preservação da cota D1

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
}

export function generateETag(objOrStr) {
  const str = typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

export function checkETag(request, etag) {
  const clientETag = request.headers.get('If-None-Match');
  if (clientETag && clientETag === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60'
      }
    });
  }
  return null;
}

