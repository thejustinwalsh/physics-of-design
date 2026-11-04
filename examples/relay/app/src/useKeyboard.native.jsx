// Native keyboard lifecycle adapter. Done is a real task action, including multiline fields.
import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
export function useKeyboard() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
        setVisible(true),
      ),
      hide = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return { visible, dismiss: () => Keyboard.dismiss() };
}
