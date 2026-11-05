import { useEffect, useRef, useState } from 'react';
import { Column, Field, Text } from './ui';
import { parseNumberDraft } from './design/number-draft.mjs';
export default function EditableAxis({ id, label, value, axis, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setDraft(String(value));
    }
  }, [value]);
  const parsed = parseNumberDraft(draft, axis);
  return (
    <Column gap={5}>
      <Field
        id={id}
        label={label}
        value={draft}
        error={parsed.status === 'invalid' ? parsed.reason : null}
        onChange={(next) => {
          setDraft(next);
          const result = parseNumberDraft(next, axis);
          if (result.status === 'valid' && result.value !== value) {
            last.current = result.value;
            onCommit(result.value);
          }
        }}
      />
      {parsed.status === 'incomplete' && (
        <Text tone="muted">
          Finish entering the value. Applied value: {value}.
        </Text>
      )}
    </Column>
  );
}
