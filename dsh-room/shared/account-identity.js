export function accountOrigin(service) {
  const url = new URL(service);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new TypeError('账户服务必须是 HTTP(S) 来源');
  }
  return url.origin;
}

export function accountScope(service, accountId) {
  if (typeof accountId !== 'string' || !accountId) throw new TypeError('缺少账号标识');
  return JSON.stringify([accountOrigin(service), accountId]);
}

export function characterIdentity(service, accountId, characterId) {
  if (typeof characterId !== 'string' || !characterId) throw new TypeError('缺少角色标识');
  return { serviceOrigin: accountOrigin(service), accountId, characterId };
}
