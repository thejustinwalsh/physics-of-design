import { createPortal } from 'react-dom';
export default function Overlay({ children, onClose = null }) {
  return createPortal(children, document.body);
}
