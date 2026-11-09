import test from 'node:test';
import assert from 'node:assert/strict';
import { Town } from '../web/roomkit/town.js';

test('宿主把登录交给系统浏览器时，房间仍继续轮询并提供备用链接', async (t) => {
  let opened;
  globalThis.window = { open(url) { opened = url; return null; } };
  t.after(() => { delete globalThis.window; });

  const town = new Town({});
  town.url = 'https://roomkit.example';
  town.call = async (method, body) => {
    assert.equal(method, 'authPoll');
    assert.equal(body.nonce, new URL(opened).searchParams.get('nonce'));
    return { token: 'test-session' };
  };
  town.connect = async () => true;

  const login = town.login('github');
  assert.equal(town.loginAttempt.fallbackUrl, opened);
  assert.equal(new URL(opened).pathname, '/auth/github/start');
  assert.equal(await town.login('github'), false);
  assert.equal(await login, true);
  assert.equal(town.token, 'test-session');
  assert.equal(town.loginAttempt, null);
});
