import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

const regionNumbers = Object.freeze({
  nav: '01',
  title: '02',
  image: '03',
  action: '04',
  footer: '05',
});
export const layoutRegionNumber = (id) => regionNumbers[id] ?? id;

export function LayoutTitle({
  mobile,
  scale = 1,
  title = 'The beauty\nof ordinary\nthings.',
}) {
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
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {title}
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
  title,
}) {
  const element = useRef(null);
  useLayoutEffect(() => {
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
  }, [width, mobile, measurementKey, onMeasure, title]);
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
      <LayoutTitle mobile={mobile} title={title} />
    </div>
  );
}

/** Flex rendering of the SAME resolved nodes shown by the technical diagram.
 * Authored screen pixels are uniformly scaled to the available preview width.
 * No separate gutter/gap multipliers or alternate mobile reading order. */
export function LayoutPreview({
  frame,
  inspect = false,
  selected = 'title',
  onSelect,
  onReceipt,
  title: titleContent,
}) {
  const host = useRef(null),
    preview = useRef(null),
    [available, setAvailable] = useState(600),
    [observed, setObserved] = useState([]);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setAvailable(entry.contentRect.width),
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const { width, height } = frame.wireframe.screen;
  const scale = Math.min(1, available / width);
  useLayoutEffect(() => {
    const root = preview.current;
    const origin = root.getBoundingClientRect();
    const nodes = [...root.querySelectorAll('[data-design-node]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        id: el.dataset.designNode,
        box: {
          x: (rect.x - origin.x) / scale,
          y: (rect.y - origin.y) / scale,
          width: rect.width / scale,
          height: rect.height / scale,
        },
      };
    });
    const maxError = Math.max(
      0,
      ...nodes.flatMap((node) =>
        ['x', 'y', 'width', 'height'].map((key) =>
          Math.abs(
            node.box[key] - frame.nodes.find((n) => n.id === node.id).box[key],
          ),
        ),
      ),
    );
    const receipt = {
      kind: 'browser-observed',
      coordinateSpace:
        'authored CSS pixels after dividing actual uniform preview scale',
      scale,
      screen: frame.wireframe.screen,
      inputs: frame.wireframe.variables,
      content: { title: titleContent },
      nodes,
      maxError,
      observedAt: new Date().toISOString(),
      limits: [
        'Rectangle measurements do not establish raster text bounds or aesthetic quality.',
      ],
    };
    setObserved(nodes);
    onReceipt?.(receipt);
  }, [frame, scale, onReceipt, titleContent]);
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
      <LayoutTitle mobile={mobile} scale={scale} title={titleContent} />
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
        paddingInline: 28,
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={preview}
        data-layout-preview
        data-preview-scale={scale}
        style={{
          display: 'flex',
          position: 'relative',
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
        {inspect && (
          <svg
            data-wireframe
            role="group"
            aria-label="Current preview geometry. Select a region."
            viewBox={`0 0 ${width} ${height}`}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}
          >
            {observed.map((node) => (
              <g
                key={node.id}
                data-wireframe-node={node.id}
                role="button"
                tabIndex={0}
                aria-label={`Inspect ${frame.nodes.find((n) => n.id === node.id).label}`}
                aria-pressed={selected === node.id}
                onClick={() => onSelect?.(node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect?.(node.id);
                  }
                }}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  {...node.box}
                  fill={
                    selected === node.id ? 'rgba(223,77,28,.12)' : 'transparent'
                  }
                  stroke={selected === node.id ? '#a82f16' : '#315947'}
                  strokeWidth={(selected === node.id ? 2 : 1) / scale}
                />
                <path
                  data-wireframe-badge={node.id}
                  d={`M${node.box.x - 28 / scale} ${node.box.y}h${22 / scale}v${18 / scale}h${-22 / scale}z`}
                  fill={selected === node.id ? '#a82f16' : '#315947'}
                />
                <text
                  x={node.box.x - 24 / scale}
                  y={node.box.y + 12 / scale}
                  fontSize={10 / scale}
                  fontFamily="monospace"
                  fill="white"
                >
                  {layoutRegionNumber(node.id)}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
}
