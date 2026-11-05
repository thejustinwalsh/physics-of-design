import { useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { css, html } from 'react-strict-dom';
import { UI, Row, Heading, Button } from './ui';
import Scroll from './Scroll';

const styles = css.create({
  dock: (background, ink, line, phone) => ({
    position: 'fixed',
    zIndex: 90,
    right: phone ? 0 : 12,
    bottom: phone ? 0 : 12,
    top: phone ? 'auto' : 12,
    width: phone ? '100%' : 370,
    maxWidth: '100%',
    maxHeight: phone ? '48%' : 'calc(100% - 24px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    boxSizing: 'border-box',
    backgroundColor: background,
    color: ink,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: line,
    borderRadius: phone ? 0 : 10,
  }),
});

export default function InspectorPanel({ children, onClose }) {
  const ui = useContext(UI);
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const escape = (event) => {
      if (
        event.key === 'Escape' &&
        ref.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('keydown', escape);
      if (previous?.isConnected) previous['focus']?.();
    };
  }, []);
  return createPortal(
    <html.aside
      ref={ref}
      role="region"
      aria-label="Current surface inspection"
      data-testid="inspection-panel"
      data-design-inspection-ui="panel"
      style={styles.dock(ui.t.panel, ui.t.ink, ui.t.line, ui.phone)}
    >
      <Row spread>
        <Heading>Surface inspection</Heading>
        <Button id="inspection-close" onPress={onClose}>
          Close
        </Button>
      </Row>
      <Scroll>{children}</Scroll>
    </html.aside>,
    document.body,
  );
}
