import { html } from 'react-strict-dom';
import { Modal } from './ui';
export default function InspectorPanel({ children, onClose }) {
  return (
    <Modal
      title="Current surface inspection"
      id="inspection-panel"
      onClose={onClose}
    >
      <html.div data-design-inspection-ui="panel">{children}</html.div>
    </Modal>
  );
}
