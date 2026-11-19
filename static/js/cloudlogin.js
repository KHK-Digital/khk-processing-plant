
'use strict';

// KHK Processing Plant Cloud - Cognito PKCE Authentication

const KHK_AUTH = (() => {
  const config = window.KHK_CLOUD_CONFIG.cognito;
  const callbackUrl =
    window.location.origin + '/cloudkiosk.html';

  let accessToken = null;
  let tokenExpiresAt = 0;

  function base64url(bytes) {
    return btoa(
      String.fromCharCode(...bytes)
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function randomString(size = 32) {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return base64url(bytes);
  }

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    return new Uint8Array(
      await crypto.subtle.digest('SHA-256', bytes)
    );
  }

  async function login() {
    const verifier = randomString();
    const challenge = base64url(
      await sha256(verifier)
    );
    const state = randomString();
    const nonce = randomString();

    sessionStorage.setItem('khk_pkce_verifier', verifier);
    sessionStorage.setItem('khk_oauth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: callbackUrl,
      scope: config.scopes.join(' '),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      nonce
    });

    window.location.assign(
      config.domain + '/oauth2/authorize?' + params
    );
  }

  async function handleCallback() {
    const params = new URLSearchParams(
      window.location.search
    );

    const code = params.get('code');
    if (!code) return false;

    const state = params.get('state');
    const expectedState =
      sessionStorage.getItem('khk_oauth_state');
    const verifier =
      sessionStorage.getItem('khk_pkce_verifier');

    if (!state || state !== expectedState || !verifier) {
      throw new Error('Invalid OAuth state or PKCE verifier');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code,
      redirect_uri: callbackUrl,
      code_verifier: verifier
    });

    const response = await fetch(
      config.domain + '/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded'
        },
        body
      }
    );

    if (!response.ok) {
      throw new Error('Cognito token exchange failed');
    }

    const tokens = await response.json();

    if (!tokens.access_token ||
        !Number.isFinite(Number(tokens.expires_in))) {
      throw new Error('Invalid Cognito token response');
    }

    accessToken = tokens.access_token;
    tokenExpiresAt =
      Date.now() + Number(tokens.expires_in) * 1000;

    sessionStorage.removeItem('khk_pkce_verifier');
    sessionStorage.removeItem('khk_oauth_state');

    window.history.replaceState(
      {},
      document.title,
      callbackUrl
    );

    return true;
  }

  function getAccessToken() {
    if (
      !accessToken ||
      Date.now() >= tokenExpiresAt - 30000
    ) {
      return null;
    }

    return accessToken;
  }

  function logout() {
    accessToken = null;
    tokenExpiresAt = 0;
  }

  return {
    login,
    handleCallback,
    getAccessToken,
    logout
  };
})();

window.KHK_AUTH = KHK_AUTH;
