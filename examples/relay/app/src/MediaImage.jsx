import { html, css } from 'react-strict-dom';
const style = css.create({
  image: { width: '100%', height: 180, objectFit: 'contain' },
});
export default function MediaImage({ source, alt, id }) {
  return (
    <html.img data-testid={id} src={source} alt={alt} style={style.image} />
  );
}
