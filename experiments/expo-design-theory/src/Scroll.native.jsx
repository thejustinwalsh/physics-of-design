import { compat, css } from 'react-strict-dom';
import { ScrollView } from 'react-native';
const styles = css.create({ scroll: { flexGrow: 1, flexShrink: 1, minHeight: 0 } });
// Strict DOM does not implement a native scroll container. The documented
// compat boundary preserves the shared style contract around a real ScrollView.
export default function Scroll({ children }) {
  return <compat.native as="div" style={styles.scroll}>{(nativeProps) => <ScrollView {...nativeProps}>{children}</ScrollView>}</compat.native>;
}
