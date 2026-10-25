import React, { memo, useMemo, useRef } from 'react';
import { createDomSurfaceRecipe, DOM_SURFACE_CSS } from '../../src/dom-surface';
import { useDomMaterial } from './useDomMaterial';

export const HeroMaterial = memo(function HeroMaterial({
  profile,
  roughness,
  damping,
}) {
  const host = useRef(null),
    statusRef = useRef(null);
  const recipe = useMemo(
    () =>
      createDomSurfaceRecipe({
        material: 'enamel',
        baseColor: profile.signal,
        ink: profile.ink,
        roughness,
        radius: 0,
        elevation: 18,
        textureAmount: 0.15,
        contentShieldOpacity: 0,
        light: { x: -0.5, y: -0.7, z: 1.5, intensity: 0.65, ambient: 0.7 },
      }),
    [profile, roughness],
  );
  useDomMaterial(host, recipe, { id: 'hero', statusRef });
  return (
    <div
      style={{
        width: '100%',
        padding: '28px 16px',
        display: 'flex',
        alignItems: 'center',
        flex: 1,
      }}
    >
      <style>{DOM_SURFACE_CSS}</style>
      <div
        ref={host}
        className="dt-dom-surface"
        data-hero-material
        style={{
          ...recipe.cssVariables,
          width: '100%',
          minHeight: 350,
          padding: 'clamp(22px,3vw,42px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 30,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <span
            className="dt-dom-content"
            style={{ fontFamily: 'monospace', fontSize: 10, padding: 8 }}
          >
            <span data-material-contrast>FIELD / 001</span>
          </span>
          <span style={{ fontSize: 42, lineHeight: 1 }} aria-hidden="true">
            ↗
          </span>
        </div>
        <div
          className="dt-dom-content"
          style={{ padding: '18px 16px', maxWidth: 420 }}
        >
          <p
            data-material-contrast
            style={{
              fontSize: 'clamp(36px,4.1vw,66px)',
              fontWeight: 900,
              letterSpacing: '-.06em',
              lineHeight: 1.02,
              margin: 0,
            }}
          >
            A little
            <br />
            friction.
          </p>
          <p
            data-material-contrast
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              margin: '14px 0 0',
              maxWidth: '24ch',
            }}
          >
            Precise enough to inspect.
            <br />
            Open enough to surprise.
          </p>
        </div>
        <div
          className="dt-dom-content"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
            padding: 10,
            fontFamily: 'monospace',
            fontSize: 10,
          }}
        >
          <span data-material-contrast>FINISH {roughness.toFixed(2)}</span>
          <span data-material-contrast>DAMPING {damping}</span>
        </div>
        <span
          ref={statusRef}
          data-material-contrast
          data-dom-renderer-status
          style={{ position: 'relative', zIndex: 1, fontSize: 10 }}
        >
          CSS preview · preparing material light
        </span>
      </div>
    </div>
  );
});
