import React, { useEffect, useRef, useState } from 'react';

export function LayoutTitle({ mobile, scale = 1 }) {
  return (
    <>
      {' '}
      <span
        style={{
          fontSize: 9 * scale,
          letterSpacing: '.1em',
          lineHeight: `${14 * scale}px`,
          flexShrink: 0,
        }}
      >
        OBJECTS / ISSUE 001
      </span>
      <h3
        style={{
          flexShrink: 0,
          fontFamily: 'TheorySerif, Georgia, serif',
          fontSize: (mobile ? 40 : 50) * scale,
          lineHeight: 1.04,
          letterSpacing: '-.055em',
          fontWeight: 400,
          margin: `${12 * scale}px 0 ${10 * scale}px`,
        }}
      >
        The beauty
        <br />
        of ordinary
        <br />
        things.
      </h3>
      <p
        style={{
          fontSize: 12 * scale,
          flexShrink: 0,
          lineHeight: 1.5,
          maxWidth: 250 * scale,
          margin: 0,
        }}
      >
        A study in everyday forms. Made slowly, with room for the unexpected.
      </p>
    </>
  );
}

/** Natural-size measurement of exactly the preview's title content. Kept mounted
 * in both modes so inspector edits use font/wrap measurements too. */
export function LayoutTitleMeasure({
  width,
  mobile,
  measurementKey,
  onMeasure,
}) {
  const element = useRef(null);
  useEffect(() => {
    let disposed = false;
    const measure = () => {
      if (!disposed)
        onMeasure(
          measurementKey,
          Math.ceil(element.current.getBoundingClientRect().height),
        );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element.current);
    document.fonts.ready.then(measure);
    measure();
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [width, mobile, measurementKey, onMeasure]);
  return (
    <div
      ref={element}
      data-layout-title-measure
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        visibility: 'hidden',
        pointerEvents: 'none',
        width,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
      }}
    >
      <LayoutTitle mobile={mobile} />
    </div>
  );
}

/** Flex rendering of the SAME resolved nodes shown by the technical diagram.
 * Authored screen pixels are uniformly scaled to the available preview width.
 * No separate gutter/gap multipliers or alternate mobile reading order. */
export function LayoutPreview({ frame }) {
  const host = useRef(null),
    [available, setAvailable] = useState(600);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const { width, height } = frame.wireframe.screen;
  const scale = Math.min(1, available / width);
  const box = (id) => frame.nodes.find((node) => node.id === id).box;
  const nav = box('nav'),
    title = box('title'),
    image = box('image'),
    action = box('action'),
    footer = box('footer');
  const mobile = image.y > title.y;
  const size = (node) => ({
    width: node.width * scale,
    height: node.height * scale,
    flexShrink: 0,
    minWidth: 0,
  });
  const gap = (amount) => (
    <div aria-hidden="true" style={{ height: amount * scale, flexShrink: 0 }} />
  );
  const headline = (
    <div
      data-design-node="title"
      style={{
        ...size(title),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'start',
      }}
    >
      <LayoutTitle mobile={mobile} scale={scale} />
    </div>
  );
  const artwork = (
    <img
      data-design-node="image"
      src="still-life.svg"
      alt="Terracotta vessels and a green sphere"
      style={{
        ...size(image),
        display: 'block',
        objectFit: 'cover',
        objectPosition: '70% center',
      }}
    />
  );
  const cta = (
    <span
      data-design-node="action"
      style={{
        ...size(action),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#334e3b',
        color: '#f3f1e8',
        fontSize: 11 * scale,
      }}
    >
      Read the story ↗
    </span>
  );
  const contentBottom = Math.max(
    image.y + image.height,
    action.y + action.height,
    title.y + title.height,
  );
  return (
    <div
      ref={host}
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        background: '#e8e9db',
      }}
    >
      <div
        data-layout-preview
        data-preview-scale={scale}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'start',
          width: width * scale,
          height: height * scale,
          paddingTop: nav.y * scale,
          paddingInline: nav.x * scale,
          color: '#313f32',
          background: '#e8e9db',
        }}
      >
        <div
          data-design-node="nav"
          style={{
            ...size(nav),
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'start',
            borderBottom: '1px solid #b7c0aa',
            fontSize: 10 * scale,
            letterSpacing: '.06em',
          }}
        >
          <strong>FIELD NOTES</strong>
          <span>A journal of slower things ↗</span>
        </div>
        {gap(title.y - nav.y - nav.height)}
        {mobile ? (
          <>
            {headline}
            {gap(image.y - title.y - title.height)}
            {artwork}
            {gap(action.y - image.y - image.height)}
            {cta}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: (image.x - title.x - title.width) * scale,
              alignItems: 'start',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: title.width * scale,
              }}
            >
              {headline}
              {gap(action.y - title.y - title.height)}
              {cta}
            </div>
            {artwork}
          </div>
        )}
        {gap(footer.y - contentBottom)}
        <div
          data-design-node="footer"
          style={{
            ...size(footer),
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #b7c0aa',
            paddingTop: 7 * scale,
            fontSize: 9 * scale,
          }}
        >
          <span>Made with intention.</span>
          <span>01 — 03</span>
        </div>
      </div>
    </div>
  );
}
