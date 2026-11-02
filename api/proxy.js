export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Requested-With, X-OP-URL',
    'Access-Control-Max-Age': '86400',
  };

  // Preflight CORS request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const reqUrl = new URL(req.url);
    const targetEndpoint = reqUrl.searchParams.get('endpoint');

    if (!targetEndpoint) {
      return new Response(JSON.stringify({ error: 'Missing target endpoint parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Forward required request headers
    const outboundHeaders = new Headers();
    const authHeader = req.headers.get('authorization');
    if (authHeader) outboundHeaders.set('Authorization', authHeader);

    const contentType = req.headers.get('content-type');
    if (contentType) outboundHeaders.set('Content-Type', contentType);

    const acceptHeader = req.headers.get('accept');
    if (acceptHeader) outboundHeaders.set('Accept', acceptHeader);

    const fetchOptions = {
      method: req.method,
      headers: outboundHeaders,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const buffer = await req.arrayBuffer();
      if (buffer && buffer.byteLength > 0) {
        fetchOptions.body = buffer;
      }
    }

    const response = await fetch(targetEndpoint, fetchOptions);

    const responseHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => {
      responseHeaders.set(k, v);
    });

    // Remove headers that might interfere with browser rendering or encoding
    responseHeaders.delete('content-security-policy');
    responseHeaders.delete('x-frame-options');
    responseHeaders.delete('content-encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Proxy request failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
