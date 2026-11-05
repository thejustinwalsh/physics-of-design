// Product binding validation, not a selector receipt or renderer verification.
export function resolveRelayRuntimeChoice(choice) {
  if (choice?.resultIdentity === null) return null; // Explicit historical baseline.
  for (const key of ['resultIdentity', 'workflowIdentity'])
    if (!/^[a-f0-9]{64}$/.test(choice?.[key] ?? ''))
      throw Error(`Relay runtime choice requires ${key}`);
  const physics = choice.physics;
  if (!physics) throw Error('Relay runtime choice requires physics');
  for (const key of [
    'mass',
    'stiffness',
    'dampingRatio',
    'damping',
    'lightResponse',
    'roughness',
  ])
    if (!Number.isFinite(physics[key]))
      throw Error(`Relay runtime choice requires finite ${key}`);
  if (
    physics.mass <= 0 ||
    physics.stiffness <= 0 ||
    physics.dampingRatio <= 0 ||
    physics.damping <= 0 ||
    physics.lightResponse <= 0 ||
    physics.lightResponse > 100 ||
    physics.roughness < 0 ||
    physics.roughness > 1
  )
    throw Error(
      'Relay runtime choice exceeds supported physical/adapter domains',
    );
  const derived =
    2 * physics.dampingRatio * Math.sqrt(physics.stiffness * physics.mass);
  if (
    !Number.isFinite(derived) ||
    Math.abs(physics.damping - derived) > 1e-10 * Math.max(1, derived)
  )
    throw Error(
      'Relay damping disagrees with mass, stiffness and damping ratio',
    );
  return {
    resultIdentity: choice.resultIdentity,
    workflowIdentity: choice.workflowIdentity,
    palette: choice.palette,
    spring: {
      mass: physics.mass,
      stiffness: physics.stiffness,
      damping: physics.damping,
    },
    roughness: physics.roughness,
    lightResponse: physics.lightResponse,
  };
}
