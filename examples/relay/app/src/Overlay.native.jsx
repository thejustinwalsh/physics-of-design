// Native adapter exception: OS modal supplies accessible layer containment.
import { Modal } from 'react-native';
export default function Overlay({ children, onClose }) {
  return (
    <Modal
      visible
      transparent
      animationType="none"
      supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
    >
      {children}
    </Modal>
  );
}
