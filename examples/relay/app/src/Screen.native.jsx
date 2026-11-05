// Native adapter exception: OS keyboard avoidance owns the outer native inset.
// The application's shared styling and layout remain in RSD inside this frame.
import { KeyboardAvoidingView, Platform } from 'react-native';
import { invalidateInspection } from './inspection-events.mjs';
export default function Screen({ children }) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      enabled
      onLayout={invalidateInspection}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
