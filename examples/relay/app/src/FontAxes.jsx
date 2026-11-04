import { useEffect } from 'react';
export default function FontAxes({ axes }) {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent =
      'p,h1,h2,button,input,textarea,span{font-optical-sizing:none;font-kerning:auto;font-feature-settings:normal;font-variation-settings:' +
      Object.entries(axes ?? {})
        .map(([key, value]) => '"' + key + '" ' + Number(value))
        .join(',') +
      ';}';
    if (!Object.keys(axes ?? {}).length)
      style.textContent = style.textContent.replace(
        'font-variation-settings:;',
        'font-variation-settings:normal;',
      );
    document.head.append(style);
    return () => style.remove();
  }, [axes]);
  return null;
}
