import { Nav } from '../web/roomkit/nav.js';

export function activityLayout(world, activity) {
  const nav = new Nav(world);
  const { w, h } = world.room;
  const spawn = nav.nearestFree(w / 2, h / 2, Math.max(w, h));
  if (!spawn) throw new Error('scene.room 没有可走的出生格');
  const targets = new Map();
  if (!activity) return { nav, spawn, targets };

  for (const id of [...activity.beaconIds, activity.exitId]) {
    const object = world.byId.get(id);
    if (!object) throw new Error(`activity 引用了不存在的物件 ${id}`);
    const def = world.def(object);
    const slots = def.slots.map((slot) => {
      const pose = world.slotPose(object, slot);
      return pose && (pose.approach || { x: pose.x, y: pose.y });
    }).filter((point) => point && nav.freeAt(point.x, point.y) && nav.path(spawn, point));
    if (!slots.length) {
      const area = world.footprint(object, def);
      const near = area ? { x: (area.x0 + area.x1) / 2, y: area.y1 + 0.5 }
        : object.wall === 'left' ? { x: 0.5, y: object.at } : { x: object.at, y: 0.5 };
      const point = nav.nearestFree(near.x, near.y, 1);
      if (point && nav.path(spawn, point)) slots.push(point);
    }
    if (!slots.length) throw new Error(`activity 物件 ${id} 的交互位不可达`);
    targets.set(id, slots);
  }
  return { nav, spawn, targets };
}

export function beaconEffect({ activity, runtime, state, actor, objectId, accountFor, eligible, completionId }) {
  const positions = runtime.targets.get(objectId);
  if (!activity || !positions) return { code: 'invalid_action', message: '这个物件没有活动交互' };
  if (!positions.some((point) => Math.hypot(point.x - actor.x, point.y - actor.y) <= 0.85)) {
    return { code: 'too_far', message: '请先走到交互位附近' };
  }
  if (state.activity.completion) return { code: 'already_done', message: '活动已经完成' };
  const contributions = state.activity.contributions;
  if (activity.beaconIds.includes(objectId)) {
    if (contributions.some(({ beaconId }) => beaconId === objectId)) return { code: 'already_done', message: '信标已经点亮' };
    return { type: 'beacon.lit', payload: { beaconId: objectId } };
  }
  const accounts = new Set(contributions.map(({ characterId }) => accountFor(characterId)).filter(Boolean));
  if (contributions.length !== activity.beaconIds.length || accounts.size < activity.minContributors) {
    return { code: 'invalid_action', message: '需要两个不同账号共同点亮三个信标' };
  }
  return { type: 'activity.completed', payload: {
    worldId: state.worldId, revision: state.revision, completionId,
    exitId: objectId,
    participants: state.participants.filter(({ online, characterId }) => online && eligible(characterId)).map(({ characterId, name }) => ({ characterId, name })),
    contributions,
  } };
}
