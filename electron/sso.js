'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');

// ---- PKCE / 工具 -------------------------------------------------------------
function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function randomToken(bytes = 64) {
  return b64url(crypto.randomBytes(bytes));
}
function pkceChallenge(verifier) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}
function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return {};
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

// ---- OIDC 流程 --------------------------------------------------------------
async function discover(issuer) {
  const url = String(issuer || '').replace(/\/+$/, '') + '/.well-known/openid-configuration';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`无法获取 OIDC 配置（HTTP ${res.status}），请检查 Issuer 地址`);
  return res.json();
}

async function exchangeCode(tokenEndpoint, clientId, redirectUri, code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `令牌交换失败（HTTP ${res.status}）`);
  }
  return data;
}

async function fetchUserInfo(userinfoEndpoint, accessToken) {
  if (!userinfoEndpoint || !accessToken) return {};
  try {
    const res = await fetch(userinfoEndpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function parseUser(tokens, meta) {
  const c = decodeJwt(tokens.id_token || '');
  return {
    sub: c.sub || '',
    name: c.name || c.preferred_username || c.nickname || '',
    email: c.email || '',
    picture: c.picture || '',
  };
}

/**
 * 打开登录窗口，执行 OIDC 授权码 + PKCE 流程。
 * config: { issuer, clientId, redirectUri, scopes }
 * 返回 { ok, user?, tokens?, error? }
 */
async function startLogin(config, parentWindow) {
  const issuer = String(config.issuer || '');
  const clientId = String(config.clientId || '');
  const redirectUri = String(config.redirectUri || '');
  if (!issuer || !clientId || !redirectUri) {
    return { ok: false, error: 'SSO 未配置完整（缺少 Issuer / Client ID / 回调地址）' };
  }
  const meta = await discover(issuer);
  if (!meta.authorization_endpoint || !meta.token_endpoint) {
    return { ok: false, error: 'OIDC 配置缺少 authorization/token 端点' };
  }

  const verifier = randomToken();
  const challenge = pkceChallenge(verifier);
  const state = randomToken(24);
  const scopes = String(config.scopes || 'openid profile email');
  const authUrl =
    meta.authorization_endpoint +
    '?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 680,
      title: '登录 Wonder',
      autoHideMenuBar: true,
      parent: parentWindow && !parentWindow.isDestroyed() ? parentWindow : undefined,
      modal: false,
      webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
    });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      try {
        win.close();
      } catch {
        /* ignore */
      }
      resolve(r);
    };

    const handleRedirect = async (url) => {
      if (!url.startsWith(redirectUri)) return;
      let u;
      try {
        u = new URL(url);
      } catch {
        return;
      }
      if (u.searchParams.get('state') !== state) {
        finish({ ok: false, error: 'state 校验失败，登录可能被篡改' });
        return;
      }
      const err = u.searchParams.get('error');
      if (err) {
        finish({ ok: false, error: `${err}: ${u.searchParams.get('error_description') || ''}` });
        return;
      }
      const code = u.searchParams.get('code');
      if (!code) {
        finish({ ok: false, error: '未获取到授权码' });
        return;
      }
      try {
        const tokens = await exchangeCode(meta.token_endpoint, clientId, redirectUri, code, verifier);
        const user = parseUser(tokens, meta);
        const info = await fetchUserInfo(meta.userinfo_endpoint, tokens.access_token);
        if (info && typeof info === 'object') {
          user.name = user.name || info.name || info.nickname || info.preferred_username || '';
          user.email = user.email || info.email || '';
          user.picture = user.picture || info.picture || '';
        }
        finish({ ok: true, tokens, user });
      } catch (e) {
        finish({ ok: false, error: e.message });
      }
    };

    win.webContents.on('will-redirect', (e, url) => {
      if (url.startsWith(redirectUri)) {
        e.preventDefault();
        handleRedirect(url);
      }
    });
    win.webContents.on('did-navigate', (_e, url) => {
      if (url.startsWith(redirectUri)) handleRedirect(url);
    });
    // 真正的加载失败（DNS、连接被拒等）才报错；ERR_ABORTED (-3) 是重定向过程中的正常中断，忽略
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      if (code === -3) return;
      finish({ ok: false, error: `无法打开登录页：${desc}（${code}）` });
    });
    win.on('closed', () => {
      if (!done) finish({ ok: false, error: '登录窗口已关闭' });
    });
    win.loadURL(authUrl).catch((e) => {
      const msg = String((e && e.message) || e);
      if (/ERR_ABORTED/.test(msg)) return; // 重定向中断，属正常
      finish({ ok: false, error: '无法打开登录页：' + msg });
    });
  });
}

// ---- 会话存储 ----------------------------------------------------------------
function storePath(app) {
  return path.join(app.getPath('userData'), 'sso.json');
}
function loadSession(app) {
  try {
    const raw = fs.readFileSync(storePath(app), 'utf8');
    const s = JSON.parse(raw);
    if (s && s.user) {
      if (s.expiresAt && Date.now() > s.expiresAt) return null; // 已过期
      return s;
    }
    return null;
  } catch {
    return null;
  }
}
function saveSession(app, session) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(storePath(app), JSON.stringify(session, null, 2), 'utf8');
}
function clearSession(app) {
  try {
    fs.rmSync(storePath(app), { force: true });
  } catch {
    /* ignore */
  }
}

module.exports = { startLogin, loadSession, saveSession, clearSession };
