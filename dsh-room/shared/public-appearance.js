const COLORS = ['accent', 'belly', 'body', 'cheek', 'dress', 'dress2', 'eye', 'fin', 'hair', 'hair2', 'skin', 'tail'];

export function publicLook(input) {
  const look = {};
  for (const field of COLORS) {
    if (typeof input?.[field] === 'string' && /^#[a-f0-9]{3,8}$/i.test(input[field])) look[field] = input[field];
  }
  if (['maid', 'bow', 'cap', ''].includes(input?.hat)) look.hat = input.hat;
  if (Number.isFinite(input?.size) && input.size >= 0.6 && input.size <= 2.2) look.size = input.size;
  if (input?.rig === false) look.rig = false;
  return look;
}
