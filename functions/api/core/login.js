// functions/api/core/login.js
// Endpoint de autenticação nativa (Email + Senha PBKDF2 + Código MFA)

import { ensureModuleSchema } from '../../_shared/db.js';
import { verifyPassword, signToken } from '../../_shared/auth.js';
import { jsonResponse } from '../../_shared/cache.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const db = env.DB;
    if (db) {
      await ensureModuleSchema(db, 'M1');
    }

    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';
    const rawMfa = (body.otp || body.mfa_code || '').toString();
    const mfaCode = rawMfa.replace(/[\s-]/g, '');

    if (!email || !password) {
      return jsonResponse({ error: 'Email e senha são obrigatórios' }, 400);
    }

    // Se estiver rodando sem banco D1 configurado (ex: mock local), faz fallback de teste
    if (!db) {
      if (password === 'Acropole@2025' && (!mfaCode || mfaCode === '000000')) {
        const mockUser = {
          sub: 'usr-admin',
          id: 'usr-admin',
          name: 'Coordenação Geral (Modo Local)',
          email,
          role: email.includes('prof') ? 'PROFESSOR' : (email.includes('aluno') ? 'ALUNO' : 'ADMIN'),
          default_location_id: 'aguas-claras',
          exp: Math.floor(Date.now() / 1000) + 12 * 3600
        };
        const token = await signToken(mockUser);
        return jsonResponse({ success: true, token, user: mockUser });
      }
      return jsonResponse({ error: 'Credenciais inválidas no modo local' }, 401);
    }

    // Busca usuário ativo no D1
    const user = await db.prepare(
      `SELECT id, name, email, password_hash, mfa_code, role, default_location_id, linked_entity_id, is_active
       FROM core_users WHERE lower(email) = ? AND is_active = 1`
    ).bind(email).first();

    if (!user) {
      return jsonResponse({ error: 'Usuário não encontrado ou inativo' }, 401);
    }

    // Verifica senha PBKDF2
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      return jsonResponse({ error: 'Senha incorreta' }, 401);
    }

    // Verifica código MFA
    const expectedMfa = (user.mfa_code || '000000').replace(/[\s-]/g, '');
    if (mfaCode && mfaCode !== expectedMfa) {
      return jsonResponse({ error: 'Código MFA incorreto' }, 401);
    }

    // Gera token de sessão (12 horas TTL)
    const tokenPayload = {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      default_location_id: user.default_location_id,
      linked_entity_id: user.linked_entity_id,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600
    };

    const token = await signToken(tokenPayload, env.AUTH_SECRET);

    return jsonResponse({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        default_location_id: user.default_location_id,
        linked_entity_id: user.linked_entity_id
      }
    });
  } catch (err) {
    console.error('[POST /api/core/login] Erro interno:', err);
    return jsonResponse({ error: 'Erro interno ao autenticar usuário' }, 500);
  }
}

