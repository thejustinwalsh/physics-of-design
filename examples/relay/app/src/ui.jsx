import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { html, css } from 'react-strict-dom';
import { Platform, BackHandler } from 'react-native';
import Scroll from './Scroll';
import Overlay from './Overlay';
import resolved from './design/resolved.json';
import specialists from './design/specialist-values.json';
import staged from './design/staged-values.json';
import textWrap from './TextWrap';
export const UI = createContext(null);
export const chosen = resolved.values.desktop;
export const themes = specialists.palette;
export const styles = css.create({
  column: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  row: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  spread: { justifyContent: 'space-between' },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  theme: (canvas, ink, size, leading, tracking) => ({
    backgroundColor: canvas,
    color: ink,
    fontFamily: 'RelayUI',
    fontSize: size,
    lineHeight: leading,
    letterSpacing: tracking,
  }),
  space: (gap) => ({ gap }),
  pad: (padding) => ({ padding }),
  width: (width) => ({ width }),
  height: (height) => ({ height }),
  text: (color, size, weight, leading, tracking) => ({
    color,
    fontFamily: 'RelayUI',
    fontSize: size,
    fontWeight: weight,
    lineHeight: leading,
    letterSpacing: tracking,
    margin: 0,
  }),
  panel: (bg, line, gap) => ({
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap,
    padding: gap,
    backgroundColor: bg,
    borderColor: line,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 10,
  }),
  button: (bg, ink, line, minHeight, size, leading, tracking) => ({
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: bg,
    color: ink,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: line,
    borderRadius: 6,
    minHeight,
    minWidth: minHeight,
    paddingBlock: 8,
    paddingInline: 12,
    fontFamily: 'RelayUI',
    fontSize: size,
    lineHeight: leading,
    letterSpacing: tracking,
    fontWeight: '500',
    maxWidth: '100%',
    cursor: 'pointer',
    opacity: 1,
  }),
  webFocus: (color) => ({
    outlineOffset: 3,
    outlineColor: { default: 'transparent', ':focus-visible': color },
    outlineWidth: 2,
    outlineStyle: 'solid',
  }),
  disabled: { opacity: 0.45 },
  field: (bg, ink, line, size, minHeight, leading, tracking) => ({
    boxSizing: 'border-box',
    width: '100%',
    minWidth: 0,
    minHeight,
    padding: 12,
    backgroundColor: bg,
    color: ink,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: line,
    borderRadius: 6,
    fontFamily: 'RelayUI',
    fontSize: size,
    lineHeight: leading,
    letterSpacing: tracking,
  }),
  badge: (color, bg, size, leading, tracking) => ({
    color,
    backgroundColor: bg,
    fontSize: size,
    lineHeight: leading,
    letterSpacing: tracking,
    fontWeight: '600',
    borderRadius: 4,
    paddingBlock: 4,
    paddingInline: 7,
    alignSelf: 'flex-start',
  }),
  overlay: {
    boxSizing: 'border-box',
    position: 'absolute',
    inset: 0,
    zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  dialog: (bg, line) => ({
    boxSizing: 'border-box',
    width: '100%',
    maxWidth: 620,
    maxHeight: '88%',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 20,
    backgroundColor: bg,
    borderColor: line,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: 12,
  }),
  separator: (line) => ({
    borderBottomColor: line,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    paddingBottom: 12,
  }),
  plot: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
    height: 130,
    gap: 2,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#607988',
    paddingTop: 10,
  },
  bar: (height, color) => ({
    height,
    width: '100%',
    flexShrink: 1,
    backgroundColor: color,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    minHeight: 2,
  }),
  dualBarButton: { flexDirection: 'row', alignItems: 'flex-end' },
  threshold: (bottom, color) => ({
    position: 'absolute',
    left: 0,
    right: 0,
    bottom,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: color,
    pointerEvents: 'none',
  }),
  barButton: {
    display: 'flex',
    justifyContent: 'flex-end',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 1,
    borderWidth: 0,
    padding: 0,
    backgroundColor: 'transparent',
    cursor: 'crosshair',
  },
  cursor: (left, color) => ({
    position: 'absolute',
    left,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: color,
    pointerEvents: 'none',
  }),
  link: { textDecorationLine: 'underline' },
  alignEnd: { alignItems: 'flex-end' },
  flexColumns: (columns, gap) => ({
    display: 'flex',
    flexDirection: columns === 1 ? 'column' : 'row',
    alignItems: 'stretch',
    gap,
    minWidth: 0,
  }),
  spanTrack: {
    height: 16,
    backgroundColor: '#314854',
    position: 'relative',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  spanBar: (left, width, color) => ({
    position: 'absolute',
    left,
    width,
    top: 0,
    bottom: 0,
    backgroundColor: color,
    borderRadius: 3,
  }),
  gridCell: { flexGrow: 1, flexBasis: 110, minWidth: 90 },
  logo: { fontSize: 28, lineHeight: 1, fontWeight: '700', letterSpacing: -1 },
  hidden: { display: 'none' },
});
export function Text({
  children,
  tone = 'ink',
  size = null,
  weight = '400',
  id = null,
  style = null,
  live = null,
}) {
  const u = useContext(UI);
  return (
    <html.p
      data-testid={id}
      ref={id ? u.bind(id) : undefined}
      aria-live={live}
      role={live ? 'status' : undefined}
      style={[
        styles.text(
          u.t[tone] ?? tone,
          size === null ? u.size : size * u.scale,
          weight,
          chosen['service-row.lineHeightRatio'],
          chosen['service-row.letterSpacing'],
        ),
        textWrap,
        style,
      ]}
    >
      {children}
    </html.p>
  );
}
export function Heading({ children, level = 2, id = null }) {
  const u = useContext(UI);
  const H = level === 1 ? html.h1 : html.h2;
  return (
    <H
      data-testid={id}
      ref={id ? u.bind(id) : undefined}
      tabIndex={id === 'page-heading' ? -1 : undefined}
      style={styles.text(
        u.t.ink,
        (level === 1 ? 30 : 18) * u.scale,
        '600',
        chosen['service-row.lineHeightRatio'],
        chosen['service-row.letterSpacing'],
      )}
    >
      {children}
    </H>
  );
}
export function Row({ children, spread = false, style = null }) {
  return (
    <html.div style={[styles.row, spread && styles.spread, style]}>
      {children}
    </html.div>
  );
}
export function Column({ children, gap = 12, style = null }) {
  return (
    <html.div style={[styles.column, styles.space(gap), style]}>
      {children}
    </html.div>
  );
}
export function Button({
  children,
  onPress,
  id = null,
  active = false,
  disabled = false,
  kind = 'normal',
  label = null,
  style = null,
}) {
  const u = useContext(UI);
  return (
    <html.button
      data-testid={id}
      ref={id ? u.bind(id) : undefined}
      aria-label={label ?? undefined}
      aria-pressed={active}
      disabled={disabled}
      style={[
        styles.button(
          active ? u.t.selection : kind === 'primary' ? u.t.accent : u.t.raised,
          kind === 'primary' ? u.t.canvas : u.t.ink,
          active ? u.t.accent : u.t.line,
          staged.controlMinHeight,
          u.size,
          chosen['service-row.lineHeightRatio'],
          chosen['service-row.letterSpacing'],
        ),
        Platform.OS === 'web' && styles.webFocus(u.t.accent),
        disabled && styles.disabled,
        style,
      ]}
      onClick={(event) => {
        if (Platform.OS === 'web')
          event['currentTarget']?.['focus']?.({ preventScroll: true });
        onPress?.(event);
      }}
    >
      <html.span>{children}</html.span>
    </html.button>
  );
}
export function Panel({ children, id = null, title = null, style = null }) {
  const u = useContext(UI);
  return (
    <html.section
      data-testid={id}
      ref={id ? u.bind(id) : undefined}
      style={[
        styles.panel(u.t.panel, u.t.line, chosen['workspace.gap']),
        style,
      ]}
    >
      {title && <Heading>{title}</Heading>}
      {children}
    </html.section>
  );
}
export function Badge({ children = null, status = '' }) {
  const u = useContext(UI);
  const color = /P1|critical|error|triggered|firing/.test(status)
    ? u.t.critical
    : /P2|degraded|investigating|acknowledged/.test(status)
      ? u.t.warning
      : /healthy|resolved|ok/.test(status)
        ? u.t.healthy
        : u.t.muted;
  return (
    <html.span
      style={styles.badge(
        color,
        u.t.raised,
        12 * u.scale,
        chosen['service-row.lineHeightRatio'],
        chosen['service-row.letterSpacing'],
      )}
    >
      {children ?? status}
    </html.span>
  );
}
export function Field({
  label,
  value,
  onChange,
  id,
  multiline = false,
  error = null,
  placeholder = '',
  inputRef = null,
}) {
  const u = useContext(UI);
  const Input = multiline ? html.textarea : html.input;
  return (
    <Column gap={6}>
      <html.label
        for={id}
        style={styles.text(
          u.t.muted,
          u.size,
          '500',
          chosen['service-row.lineHeightRatio'],
          chosen['service-row.letterSpacing'],
        )}
      >
        {label}
      </html.label>
      <Input
        id={id}
        data-testid={id}
        ref={(node) => {
          u.bind(id)(node);
          if (inputRef) inputRef.current = node;
        }}
        aria-label={label}
        aria-invalid={!!error}
        aria-describedby={error ? id + '-error' : undefined}
        value={String(value ?? '')}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={[
          styles.field(
            u.t.canvas,
            u.t.ink,
            error ? u.t.critical : u.t.line,
            u.size,
            specialists.controls.fieldMinHeight,
            chosen['service-row.lineHeightRatio'],
            chosen['service-row.letterSpacing'],
          ),
          Platform.OS === 'web' && styles.webFocus(u.t.accent),
          multiline && styles.height(100),
        ]}
      />
      {error && (
        <Text id={id + '-error'} tone="critical">
          {error}
        </Text>
      )}
    </Column>
  );
}
export function Modal({ title, children, onClose, id = 'relay-dialog' }) {
  const u = useContext(UI);
  useEffect(() => {
    if (Platform.OS !== 'web') {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
      return () => sub.remove();
    }
    const previous = document.activeElement;
    const element = document.querySelector(`[data-testid="${id}"]`);
    const focusables = () =>
      Array.from(
        element?.querySelectorAll('button,input,textarea,[tabindex="0"]') ?? [],
      );
    focusables()[0]?.['focus']?.();
    const listener = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'Tab') {
        const nodes = focusables();
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.['focus']?.();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.['focus']?.();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      previous?.['focus']?.();
    };
  }, []);
  return (
    <Overlay onClose={onClose}>
      <html.div style={styles.overlay}>
        <html.div
          role="dialog"
          aria-modal={true}
          aria-label={title}
          data-testid={id}
          ref={u.bind(id)}
          style={styles.dialog(u.t.panel, u.t.line)}
        >
          <Row spread>
            <Heading>{title}</Heading>
            {u.keyboard?.visible && (
              <Button id="keyboard-dismiss" onPress={u.keyboard.dismiss}>
                Done editing
              </Button>
            )}
            <Button id="dialog-close" onPress={onClose}>
              Close
            </Button>
          </Row>
          <Scroll>{children}</Scroll>
        </html.div>
      </html.div>
    </Overlay>
  );
}
export function Choice({ label, value, options, onChange, id }) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const normalized = options.map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  return (
    <Column gap={5}>
      <Text tone="muted">{label}</Text>
      <Button
        id={id}
        label={`${label}: ${normalized.find((o) => String(o.value) === String(value))?.label ?? value}`}
        onPress={() => setOpen(true)}
      >
        {normalized.find((o) => String(o.value) === String(value))?.label ??
          value}{' '}
        ▾
      </Button>
      {open && (
        <Modal title={label} onClose={() => setOpen(false)} id={id + '-dialog'}>
          <Column>
            {normalized.length > 8 && (
              <Field
                id={id + '-search'}
                label={'Find ' + label.toLowerCase()}
                value={query}
                onChange={setQuery}
              />
            )}
            {normalized
              .filter((o) =>
                o.label.toLowerCase().includes(query.toLowerCase()),
              )
              .map((o) => (
                <Button
                  key={o.value}
                  id={id + '-option-' + o.value}
                  active={String(o.value) === String(value)}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  {o.label}
                </Button>
              ))}
          </Column>
        </Modal>
      )}
    </Column>
  );
}
export const format = (n, d = 0) =>
  Number(n).toLocaleString('en-US', { maximumFractionDigits: d });
