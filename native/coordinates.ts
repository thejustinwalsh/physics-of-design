import { Dimensions, Platform, StatusBar } from 'react-native';

/** Native measureInWindow observations use dp; Android's app window excludes the status bar. */
export function getCoordinateSpace() {
  return {
    units: 'dp' as const,
    origin:
      Platform.OS === 'android' ? 'window excluding status bar' : 'window',
    screenOffset: {
      x: 0,
      y: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
    },
    screen: Dimensions.get('screen'),
  };
}
