// Native image source/contain adapter; shared frame remains StyleX/RSD.
import { compat, css } from 'react-strict-dom';
import { Image } from 'react-native';
const style = css.create({ image: { width: '100%', height: 180 } });
export default function MediaImage({ source, alt, id }) {
  return (
    <compat.native as="img" data-testid={id} style={style.image}>
      {(props) => (
        <Image
          {...props}
          source={source}
          accessibilityLabel={alt}
          resizeMode="contain"
        />
      )}
    </compat.native>
  );
}
