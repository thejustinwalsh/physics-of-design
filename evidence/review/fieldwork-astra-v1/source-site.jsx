import React, { useState, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import { planComposition, cropMedia } from '../../src/composition-plan.ts';
import data from './content.json';

const s = stylex.create({
  page: { backgroundColor: '#f3f0e7', color: '#242c25', minHeight: '100vh', fontFamily: 'FieldworkSans', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  frame: { width: '100%', maxWidth: 1568, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minWidth: 0 },
  pad: (gutter) => ({ paddingLeft: gutter, paddingRight: gutter }),
  row: { display: 'flex', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 },
  between: { justifyContent: 'space-between' },
  top: { alignItems: 'flex-start' },
  column: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  gap: (gap) => ({ gap }),
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  text: (size, leading, tracking) => ({ fontSize: size, lineHeight: leading, letterSpacing: tracking, margin: 0 }),
  serif: { fontFamily: 'FieldworkSerif', fontWeight: 400 },
  heavy: { fontFamily: 'FieldworkHeavy', fontWeight: 900 },
  label: (size) => ({ fontFamily: 'FieldworkHeavy', fontSize: size, letterSpacing: 1.6, lineHeight: 1.5, textTransform: 'uppercase' }),
  muted: { color: '#5c665c' },
  accent: { color: '#8d3d26' },
  header: { paddingTop: 22, paddingBottom: 22, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#c9cbbf' },
  button: { appearance: 'none', borderWidth: 0, backgroundColor: 'transparent', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', textAlign: 'left', cursor: 'pointer', padding: 0, textDecoration: 'none', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', borderRadius: 0 },
  link: (size) => ({ minHeight: 44, color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 12, textDecoration: 'none', fontSize: size, fontFamily: 'FieldworkHeavy', cursor: 'pointer', backgroundColor: 'transparent', borderWidth: 0, padding: 0 }),
  pill: { borderWidth: 1, borderStyle: 'solid', borderColor: '#687464', paddingLeft: 22, paddingRight: 22, borderRadius: 28, minHeight: 44 },
  rule: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#c9cbbf' },
  inset: (top, bottom) => ({ paddingTop: top, paddingBottom: bottom }),
  image: (aspect) => ({ display: 'flex', width: '100%', aspectRatio: aspect, objectFit: 'cover', objectPosition: 'center', backgroundColor: '#c3b49a' }),
  tile: (basis) => ({ display: 'flex', flexDirection: 'column', flexGrow: 0, flexShrink: 1, flexBasis: basis, minWidth: 0 }),
  crop: (position) => ({ objectPosition: position }),
  half: (basis) => ({ display: 'flex', flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: basis, minWidth: 0 }),
  narrow: { maxWidth: 330 },
  measure: (width) => ({ width: '100%', maxWidth: width }),
  story: { overflowWrap: 'anywhere' },
  cap: (max) => ({ maxWidth: max }),
  theme: { backgroundColor: '#263d2e', color: '#f0ecdc' },
  cream: { color: '#d4dbc9' },
  issueNumber: { fontFamily: 'FieldworkSerif', fontSize: 96, letterSpacing: -5, lineHeight: 1 },
  footer: { borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: '#c9cbbf', paddingTop: 32, paddingBottom: 32 },
  input: { flexGrow: 1, minWidth: 150, minHeight: 48, backgroundColor: 'transparent', color: '#242c25', fontSize: 17, borderWidth: 0, borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: '#697360', borderRadius: 0 },
  backdrop: { position: 'fixed', inset: 0, backgroundColor: '#14201699', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 10 },
  dialog: { backgroundColor: '#f3f0e7', padding: 32, maxWidth: 520, width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 24 },
});
const props = (...styles) => stylex.props(...styles);
function Arrow() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>; }
function Asterisk() { return <svg width="33" height="33" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{[0,45,90,135].map(a => <path key={a} d="M20 2v36" transform={`rotate(${a} 20 20)`} />)}</svg>; }
function App() {
  const parameters = new URLSearchParams(location.search);
  const [width, setWidth] = useState(innerWidth), [view, setView] = useState(parameters.get('view') || 'cover'), [storyId, setStoryId] = useState(parameters.get('story') || data.stories[0].id), [dialog, setDialog] = useState(''), [email, setEmail] = useState(''), [subscribed, setSubscribed] = useState(false);
  useLayoutEffect(() => { const handler = () => setWidth(innerWidth); addEventListener('resize', handler); window.__FIELDWORK_READY__ = true; return () => removeEventListener('resize', handler); }, []);
  const scale = Number(parameters.get('textScale') || 1), density = Number(parameters.get('density') || 1), expression = Number(parameters.get('expression') || 1);
  const p = planComposition({ mode: 'publication', width, textScale: scale, density, expression }), compact = width < 700;
  window.__FIELDWORK_PLAN__ = p;
  const text = (size, leading = 1.4, tracking = 0) => s.text(size * scale, leading, tracking * scale);
  const story = data.stories.find(item => item.id === storyId) || data.stories[0];
  function go(next, id) { setView(next); if (id) setStoryId(id); history.replaceState({}, '', `?view=${next}${id ? `&story=${id}` : ''}`); scrollTo({ top: 0 }); }
  const link = (label, next, id, arrow = false) => <button {...props(s.link(14 * scale))} onClick={() => go(next, id)}>{label}{arrow && <Arrow />}</button>;
  const img = (item, aspect) => <img {...props(s.image(aspect),s.crop(cropMedia({sourceWidth:1536,sourceHeight:1024,width:aspect,height:1,focalX:item.focal.x,focalY:item.focal.y}).objectPosition))} src={`assets/${item.image}.png`} alt={item.caption} />;
  function StoryTile({ item, index }) { return <article data-region={`story-${item.id}`} {...props(s.tile(p.columns === 1 ? '100%' : (p.contentWidth - p.gap) / 2), s.gap(18))}><button {...props(s.button)} onClick={() => go('story', item.id)} aria-label={`Read ${item.title}`}>{img(item, 1.5)}</button><div {...props(s.row,s.between,s.gap(12))}><span {...props(s.label(11 * scale),s.accent)}>{item.category}</span><span {...props(s.label(11 * scale),s.muted)}>0{index + 1}</span></div><h3 {...props(text(compact ? 31 : 39,1.1,-0.6),s.serif)}>{item.title}</h3><p {...props(text(p.bodySize,1.55),s.muted,s.cap(500))}>{item.deck}</p>{link('Read the story','story',item.id,true)}</article>; }
  return <div {...props(s.page)}><a href="#main" className="skip">Skip to content</a><div {...props(s.frame,s.pad(p.gutter))}>
    <header {...props(s.row,s.between,s.header,s.gap(20))}><button {...props(s.button,text(32,1,-1.6),s.heavy)} aria-label="Fieldwork home" onClick={() => go('cover')}>Fieldwork<span {...props(s.accent)}>.</span></button><nav aria-label="Main navigation" {...props(s.row,s.gap(compact ? 16 : 32))}>{!compact && link('The journal','cover')}{link('Issue 08','issue')}{!compact && <button {...props(s.link(14 * scale))} onClick={() => setDialog('about')}>Our practice</button>}<button {...props(s.link(14 * scale),s.pill)} onClick={() => setDialog('subscribe')}>{compact ? 'Field notes' : 'Get field notes'}<span aria-hidden="true">↗</span></button></nav></header>
    <main id="main" {...props(s.column)}>
    {view === 'cover' && <>
      <section data-region="cover-heading" {...props(s.column,s.gap(28),s.inset(compact ? 32 : 48,compact ? 32 : 48))}><div {...props(s.row,s.between,s.gap(16))}><span {...props(s.label(11 * scale))}>An independent journal of place & practice</span><span {...props(s.label(11 * scale),s.accent)}>Issue 08  ·  Autumn 2026</span></div><div {...props(s.row,s.gap(p.gap),s.between)}><h1 {...props(text(p.titleSize,p.titleLeading,p.titleTrackingEm * p.titleSize),s.serif,s.story,s.half(compact ? '100%' : 700))}>For the<br />longer look.</h1><div {...props(s.column,s.gap(24),s.narrow,s.inset(compact ? 0 : 68,0))}><Asterisk /><p {...props(text(p.bodySize,1.55))}>Places that make us pause.<br />People who work with care.<br />Ideas worth taking outside.</p>{link('Explore the outside issue','issue',undefined,true)}</div></div></section>
      <figure data-region="cover-image" {...props(s.column,s.gap(16))} style={{ margin: 0 }}><button {...props(s.button)} onClick={() => go('story',data.stories[0].id)} aria-label="Read the cover story">{img(data.stories[0],p.imageAspect)}</button><figcaption {...props(s.row,s.between,s.gap(12))}><span {...props(text(12),s.muted)}>01 / THE ART OF LOOKING LONGER</span><span {...props(text(12),s.muted)}>An imagined headland, a different perspective.</span>{link('Read the cover story','story',data.stories[0].id,true)}</figcaption></figure>
      <section data-region="latest-stories" {...props(s.column,s.gap(32),s.inset(p.sectionGap,p.sectionGap))}><div {...props(s.row,s.between,s.rule,s.inset(22,0),s.gap(16))}><h2 {...props(text(compact ? 36 : 52,1.12,-1),s.serif)}>Further afield</h2><span {...props(s.label(11 * scale),s.muted)}>New perspectives, found slowly</span></div><div {...props(s.row,s.top,s.gap(p.gap))}>{data.stories.slice(1).map((item,index) => <StoryTile key={item.id} item={item} index={index + 1} />)}</div></section>
      <section data-region="issue-overview" {...props(s.row,s.gap(p.gap),s.rule,s.inset(32,p.sectionGap))}><div {...props(s.half(compact ? '100%' : 300),s.gap(24))}><span {...props(s.label(11 * scale),s.accent)}>The outside issue</span><h2 {...props(text(compact ? 42 : 64,1.05,-1.8),s.serif)}>A small invitation<br />to pay attention.</h2><p {...props(text(p.bodySize,1.55),s.narrow,s.muted)}>This issue begins with a simple practice: stay a little longer. Take the slower road. See what the familiar has been keeping from you.</p></div><div {...props(s.half(compact ? '100%' : 500))}>{data.stories.map((item,index) => <button key={item.id} {...props(s.button,s.row,s.between,s.rule,s.gap(20),s.inset(24,24))} onClick={() => go('story',item.id)}><span {...props(text(12),s.muted)}>0{index + 1}</span><span {...props(text(compact ? 25 : 32,1.2),s.serif,s.grow)}>{item.title}</span><Arrow /></button>)}</div></section>
    </>}
    {view === 'issue' && <><section {...props(s.row,s.gap(p.gap),s.inset(48,48))}><div {...props(s.column,s.gap(20),s.grow)}><span {...props(s.label(11 * scale),s.accent)}>FIELDWORK / ISSUE 08</span><h1 {...props(text(compact ? 64 : 110,1,-2.4),s.serif,s.story)}>The outside<br />issue.</h1><p {...props(text(p.bodySize,1.6),s.cap(480))}>An invitation to look beyond the familiar, and find a little more in the world we already share.</p></div>{!compact && <span {...props(s.issueNumber,s.accent)} aria-hidden="true">08</span>}</section><div {...props(s.row,s.gap(p.gap),s.inset(0,p.sectionGap))}>{data.stories.map((item,index) => <StoryTile key={item.id} item={item} index={index} />)}</div></>}
    {view === 'story' && <article data-region="article"><header {...props(s.column,s.gap(24),s.inset(40,40))}>{link('← Back to the issue','issue')}<span {...props(s.label(11 * scale),s.accent)}>{story.category}</span><h1 {...props(text(compact ? 58 : 106,1.02,-2),s.serif,s.cap(1100),s.story)}>{story.title}</h1><div {...props(s.row,s.between,s.gap(24))}><p {...props(text(compact ? 19 : 23,1.5),s.cap(650),s.muted)}>{story.deck}</p><span {...props(text(12,1.8),s.muted)}>{story.byline}<br />{story.minutes} minute read · Issue 08</span></div></header><figure style={{ margin: 0 }}>{img(story,compact ? 1.1 : 2.2)}<figcaption {...props(text(11),s.muted,s.inset(12,0))}>{story.caption}</figcaption></figure><div {...props(s.row,s.gap(p.gap),s.inset(p.sectionGap,p.sectionGap))}><aside {...props(s.column,s.gap(20),s.half(compact ? '100%' : 200),s.cap(300))}><Asterisk /><blockquote {...props(text(compact ? 29 : 36,1.2,-0.5),s.serif)} style={{ margin: 0 }}>“A good place can return our attention to us.”</blockquote><span {...props(s.label(11 * scale),s.muted)}>From the Fieldwork notebook</span></aside><div {...props(s.column,s.gap(26),s.half(500),s.cap(p.readingMeasure))}>{story.paragraphs.map((paragraph,index) => <p key={index} {...props(text(p.readingSize,p.readingLeading),s.serif)}>{paragraph}</p>)}<div {...props(s.rule,s.inset(24,0))}>{link('Continue exploring the issue','issue',undefined,true)}</div></div></div></article>}
    </main>
  </div>
  <section data-region="fieldnotes" {...props(s.frame,s.theme,s.pad(p.gutter),s.inset(compact ? 40 : 64,compact ? 40 : 64),s.gap(32))}><div {...props(s.row,s.gap(p.gap),s.between)}><div {...props(s.column,s.gap(20),s.half(450))}><span {...props(s.label(11 * scale),s.cream)}>A NOTE FROM FIELDWORK</span><h2 {...props(text(compact ? 44 : 70,1.04,-1.7),s.serif)}>A little further<br />from the feed.</h2></div><div {...props(s.column,s.gap(24),s.half(300),s.cap(460))}><p {...props(text(18,1.6),s.cream)}>Occasional notes on thoughtful places, useful ideas and the pleasure of noticing. Something to read slowly.</p><button {...props(s.link(14 * scale),s.pill)} onClick={() => setDialog('subscribe')}>Get field notes <Arrow /></button></div></div></section>
  <footer {...props(s.frame,s.pad(p.gutter),s.footer,s.gap(24))}><div {...props(s.row,s.between,s.gap(20))}><span {...props(text(compact ? 42 : 72,1,-2),s.heavy)}>Fieldwork.</span><span {...props(text(12,1.7),s.muted)}>A little more attention.<br />A different kind of everyday.</span></div><div {...props(s.row,s.between,s.gap(18))}><span {...props(text(11),s.muted)}>Original publication concept · Imagined places, original writing & generated photography.</span><button {...props(s.link(14 * scale))} onClick={() => setDialog('about')}>About this journal ↗</button></div></footer>
  {dialog && <div {...props(s.backdrop)} role="presentation" onClick={() => setDialog('')}><section role="dialog" aria-modal="true" aria-label={dialog === 'about' ? 'About Fieldwork' : 'Get field notes'} {...props(s.dialog)} onClick={event => event.stopPropagation()}><div {...props(s.row,s.between)}><Asterisk /><button autoFocus {...props(s.link(14 * scale))} onClick={() => setDialog('')}>Close ×</button></div><h2 {...props(text(44,1.1,-1),s.serif)}>{dialog === 'about' ? 'A practice of attention.' : subscribed ? 'A little curiosity, kept.' : 'Notes worth making room for.'}</h2>{dialog === 'about' ? <p {...props(text(18,1.6))}>Fieldwork is an original publication and companion-app concept exploring place, design and attention. The writing is original sample content. Its photographs show generated, imagined landscapes. No real reporting, awards or subscriber claims are implied.</p> : subscribed ? <p {...props(text(17,1.6))}>Your address is saved to this browser’s local preview list. No email has been sent and no external subscription was created.</p> : <form {...props(s.column,s.gap(20))} onSubmit={event => { event.preventDefault(); localStorage.setItem('fieldwork-preview-email',email); setSubscribed(true); }}><p {...props(text(17,1.55),s.muted)}>Leave an address in the local prototype to try the sign-up flow.</p><label {...props(s.column,s.gap(8))}><span {...props(s.label(11 * scale))}>Email address</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} {...props(s.input,text(17))} placeholder="you@example.com" /></label><button type="submit" {...props(s.link(14 * scale),s.pill)}>Keep me curious <Arrow /></button></form>}</section></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
