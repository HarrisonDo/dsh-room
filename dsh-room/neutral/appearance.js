import { TokenBody } from './token-body.js';

export const WHALE_LOOKS = ['#438ca2', '#8976c4', '#bf745b', '#579977'].map(body => ({ body }));

// The workshop uses the same drawing as the scene.
export function paintWhale(ctx, agent) {
  new TokenBody(agent).draw(ctx);
}
