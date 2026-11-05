# Inspect a current browser element

`createBrowserElementInspector` from `@design-theory/toolkit/browser` reads an actual current element identified by its `id` or `data-testid`. It reports viewport bounding geometry, computed CSS, observer-delivered local content dimensions and conservative clipping metadata. It does not calculate text ink, baselines, occlusion, accessibility conformity or design quality.

```ts
const inspector = createBrowserElementInspector({
  targetId: 'relay-workspace',
  context: { sourceIdentity, inputKey },
  onSample: receipt => updateDrawing(receipt),
});
// After a committed input change:
inspector.update({ targetId, context: { sourceIdentity, inputKey } });
// Imperatively starting a Web Animation also invalidates the inspection:
inspector.invalidate();
// When the inspection mode closes:
inspector.dispose();
```

The caller supplies a small exact input identity, not a screenshot or a large result object. It must clear or withhold a receipt whose target or context no longer matches its committed inputs. `read()` obtains current facts synchronously; `onSample` coalesces relevant events into animation frames. There is no polling timer or idle animation loop. Visible running target/ancestor animations keep observations active until they stop. Font, scroll, viewport, DOM, resize and intersection events invalidate the current result. Hidden documents pause geometry reads; disposal releases listeners and observers.

Mark drawing and inspection controls with `data-design-inspection-ui`. Their own writes are ignored to prevent measurement-feedback loops, and marked elements cannot become inspected targets. Missing, duplicate, hidden or detached targets have no substitute rectangle. A content-box observation is withheld after layout-affecting changes until ResizeObserver delivers a current observation. Its coordinate space differs from the transformed viewport bounding box; do not project one as the other. Rectangular clipping metadata does not establish pixel visibility.

Relay uses this adapter in a nonmodal web inspection dock/phone sheet. Native inspection uses explicit actual-host captures and currently reports its modal-coordinate projection as unsupported. Normal product use has no recurring inspection clock or observer network traffic. `__RELAY_CAPTURE__()` is an explicit test/inspection operation; only its result establishes the captured app state. A previous `__EXPO_DESIGN_PROOF__` value is cleared after a new root commit.

Responsive rules consume the web root's ResizeObserver content box or the native outer keyboard-avoidance view's Yoga `onLayout` width, then subtract the safe-area padding actually applied by the shared root. The nominal window is retained separately. Before an observation arrives, the provisional nominal input is labeled; collapsed/invalid later observations hold the previous usable width and label it held. Local content dimensions, native parent-relative geometry and modal/screen projections remain distinct. Receiving a root event is not independent renderer verification: the snapshot reports `rendererRootObserved` separately from `rendererRootVerified`.

The lifecycle browser tests cover replacement, duplicate identifiers, resize invalidation, current identity, animation completion, self-write feedback and disposal in Chromium and WebKit. Relay's application renderer and task-flow receipts are separate from these adapter tests. Neither Linux WebKit nor a native static export establishes physical Safari performance or native rendering parity.
