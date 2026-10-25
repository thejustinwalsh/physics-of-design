import assert from 'node:assert/strict';

/** Pure receipt check: identifies the measured dock action, never its header namesake. */
export function assertNativePrimary(receipt) {
  const snapshot = receipt?.snapshot;
  const screen = snapshot?.screen;
  const name = {
    detail: snapshot?.elapsedSeconds > 0 ? 'Resume session' : 'Start session',
    active: snapshot?.running ? 'Pause session' : 'Resume session',
    complete: 'Back to Today',
  }[screen];
  if (!name) return { status: 'not-applicable', screen };
  assert.equal(
    receipt.incomplete,
    false,
    'Primary requires a complete native receipt',
  );
  const candidates = receipt.observations.filter(
    (o) =>
      o.kind === 'target' &&
      o.name === name &&
      typeof o.clipId === 'string' &&
      o.clipId.length > 0,
  );
  assert.equal(
    candidates.length,
    1,
    `Expected exactly one clipped-scroll primary: ${name}`,
  );
  const primary = candidates[0];
  const clips = receipt.observations.filter(
    (o) => o.kind === 'clip' && o.id === primary.clipId,
  );
  assert.equal(
    clips.length,
    1,
    `Primary lacks a measured clip ancestor: ${name}`,
  );
  const finite = (value, label) =>
    assert.ok(
      typeof value === 'number' && Number.isFinite(value),
      `Invalid ${label}`,
    );
  const rect = (value, label) => {
    assert.ok(value, `Missing ${label}`);
    for (const key of ['x', 'y', 'width', 'height'])
      finite(value[key], `${label}/${key}`);
    assert.ok(value.width > 0 && value.height > 0, `Empty ${label}`);
  };
  rect(primary.box, 'primary box');
  rect(primary.visibleBox, 'primary visible box');
  rect(clips[0].box, 'primary clip box');
  const tolerance = 1; // Existing native coordinate reconstruction tolerance, unchanged.
  for (const key of ['x', 'y', 'width', 'height'])
    assert.ok(
      Math.abs(primary.box[key] - primary.visibleBox[key]) <= tolerance,
      `Primary action clipped: ${name}/${key}`,
    );
  assert.ok(
    primary.box.width >= 44 && primary.box.height >= 44,
    `Primary below touch minimum: ${name}`,
  );
  const { window, safeArea, coordinateSpace } = snapshot;
  assert.ok(
    window &&
      safeArea &&
      coordinateSpace?.screen &&
      coordinateSpace?.screenOffset,
    'Primary requires explicit window, safe area and screen coordinate evidence',
  );
  for (const key of ['width', 'height']) {
    finite(window[key], `window/${key}`);
    finite(coordinateSpace.screen[key], `screen/${key}`);
    assert.ok(
      window[key] > 0 && coordinateSpace.screen[key] > 0,
      'Invalid viewport dimensions',
    );
  }
  for (const key of ['top', 'right', 'bottom', 'left']) {
    finite(safeArea[key], `safeArea/${key}`);
    assert.ok(safeArea[key] >= 0, 'Invalid safe-area inset');
  }
  for (const key of ['x', 'y'])
    finite(coordinateSpace.screenOffset[key], `screenOffset/${key}`);
  const box = primary.box;
  const screenBox = {
    ...box,
    x: box.x + coordinateSpace.screenOffset.x,
    y: box.y + coordinateSpace.screenOffset.y,
  };
  assert.ok(
    box.x >= -tolerance &&
      box.y >= -tolerance &&
      box.x + box.width <= window.width + tolerance &&
      box.y + box.height <= window.height + tolerance &&
      screenBox.x >= safeArea.left - tolerance &&
      screenBox.y >= safeArea.top - tolerance &&
      screenBox.x + screenBox.width <=
        coordinateSpace.screen.width - safeArea.right + tolerance &&
      screenBox.y + screenBox.height <=
        coordinateSpace.screen.height - safeArea.bottom + tolerance,
    `Primary action outside safe viewport: ${name}`,
  );
  return {
    status: 'verified',
    screen,
    label: name,
    targetId: primary.id,
    clipId: primary.clipId,
    box: { ...box },
    screenBox,
    tolerance,
  };
}
