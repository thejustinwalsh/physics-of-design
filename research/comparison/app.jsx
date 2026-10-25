import React from 'react';
import {createRoot} from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
const styles=stylex.create({root:{display:'flex',flexDirection:'column',padding:24}});
createRoot(document.getElementById('root')).render(<main {...stylex.props(styles.root)}><h1>Build the workbench</h1><p>Replace this neutral scaffold with the complete brief.</p></main>);
