import { css, html } from 'react-strict-dom';
const styles = css.create({ scroll: { overflow: 'auto', flexGrow: 1, flexShrink: 1, minHeight: 0 } });
export default function Scroll({ children }) { return <html.div style={styles.scroll}>{children}</html.div>; }
