// functions/_shared/auth.js
// Autenticação nativa PBKDF2-SHA256, assinatura de tokens HMAC-SHA256 e controle RBAC

const DEFAULT_SECRET = 'nova-acropole-dev-secret-2025';

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(str) {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Gera hash PBKDF2-SHA256 no formato: pbkdf2$100000$<salt_hex>$<hash_hex>
 */
export async function hashPassword(password, saltHex = null) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const derivedHex = bytesToHex(new Uint8Array(derived));
  const currentSaltHex = bytesToHex(salt);
  return `pbkdf2$${iterations}$${currentSaltHex}$${derivedHex}`;
}

/**
 * Valida senha contra hash armazenado pbkdf2$100000$<salt_hex>$<hash_hex>
 */
export async function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 4) return false;
  const saltHex = parts[2];
  const expectedHashHex = parts[3];

  const computed = await hashPassword(password, saltHex);
  const computedHashHex = computed.split('$')[3];
  return computedHashHex === expectedHashHex;
}

/**
 * Assina payload JSON em formato Bearer <payload_b64url>.<signature_b64url>
 */
export async function signToken(payload, secret = DEFAULT_SECRET) {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verifica assinatura e validade do token Bearer
 */
export async function verifyToken(token, secret = DEFAULT_SECRET) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBinary = base64UrlDecode(encodedSignature);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(dataToSign));
    if (!isValid) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expirado
    }
    return payload;
  } catch (err) {
    return null;
  }
}

/**
 * Middleware auxiliar para validação RBAC nos endpoints
 */
export async function requireAuth(request, env, allowedRoles = []) {
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Token não fornecido ou inválido' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  const token = authHeader.substring(7).trim();
  const secret = (env && env.AUTH_SECRET) || DEFAULT_SECRET;
  const user = await verifyToken(token, secret);

  if (!user) {
    return {
      user: null,
      errorResponse: new Response(JSON.stringify({ error: 'Sessão inválida ou expirada' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      user,
      errorResponse: new Response(JSON.stringify({ error: 'Acesso negado: permissão insuficiente' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    };
  }

  return { user, errorResponse: null };
}

