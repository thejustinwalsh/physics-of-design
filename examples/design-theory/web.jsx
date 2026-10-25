import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import * as stylex from '@stylexjs/stylex';
import { gsap } from 'gsap';
import {
  createDrivenMotion,
  scrollProgress,
} from '../../src/motion-dynamics.ts';
import { sampleMotion, MotionSpringSchema } from '../../src/motion.ts';
import { mediaCropCandidates } from '../../src/media-geometry.ts';
import { analyzeMaterialPair } from '../../src/material-relations.ts';
import { analyzeProse } from '../../src/prose.ts';
import { probeSurface } from '../../src/surface.ts';
import { resolveWireframe, wireframeSvg } from '../../src/wireframe.ts';
import { profiles, profileList } from './profiles.js';
import { getRuntime } from './runtime.js';
import { Surface } from './Surface.jsx';
import { LayoutPreview, LayoutTitleMeasure } from './LayoutPreview.jsx';

const s = stylex.create({
  app: {
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    fontFamily: 'TheorySans, Arial, sans-serif',
    minHeight: '100vh',
  },
  shell: {
    width: 'min(1320px, calc(100% - 112px))',
    marginInline: 'auto',
    '@media (max-width: 900px)': { width: 'calc(100% - 56px)' },
    '@media (max-width: 540px)': { width: 'calc(100% - 36px)' },
  },
  header: {
    position: 'relative',
    zIndex: 10,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--line)',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 88,
    gap: 24,
    '@media (max-width: 540px)': { minHeight: 74, gap: 12 },
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    color: 'var(--ink)',
    fontSize: 19,
    fontWeight: 800,
    textDecoration: 'none',
    letterSpacing: '-.055em',
    whiteSpace: 'nowrap',
    '@media (max-width: 540px)': { fontSize: 17 },
  },
  navlinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 28,
    fontSize: 13,
    '@media (max-width: 900px)': { display: 'none' },
  },
  navlink: {
    color: 'var(--ink)',
    textDecoration: 'none',
    opacity: 0.8,
    ':hover': { opacity: 1 },
  },
  navcta: {
    backgroundColor: 'transparent',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 20,
    color: 'var(--ink)',
    textDecoration: 'none',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--ink)',
    padding: '12px 16px',
    borderRadius: 'var(--radius)',
    '@media (max-width: 540px)': { padding: '10px 12px', gap: 8, fontSize: 11 },
  },
  hero: {
    paddingBlock: '58px 48px',
    '@media (max-width: 540px)': { paddingBlock: '35px 32px' },
  },
  heroTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  eyebrow: {
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: '.16em',
    fontWeight: 700,
    lineHeight: 1.6,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
  },
  dot: {
    width: 6,
    height: 6,
    backgroundColor: 'var(--accent)',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0,
  },
  edition: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: 'var(--muted)',
    '@media (max-width: 540px)': { display: 'none' },
  },
  heroBody: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    '@media (max-width: 760px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
  },
  heroCopy: { flex: '1 1 58%', minWidth: 0, position: 'relative', zIndex: 2 },
  title: {
    fontFamily: 'var(--display)',
    fontWeight: 400,
    fontSize: 'clamp(65px, 7.7vw, 112px)',
    letterSpacing: 'var(--tracking)',
    lineHeight: 0.98,
    margin: 0,
    maxWidth: 800,
    '@media (max-width: 540px)': {
      fontSize: 'clamp(52px, 13.7vw, 74px)',
      lineHeight: 1.03,
    },
  },
  titleAccent: { color: 'var(--accent)', fontStyle: 'italic' },
  heroDescription: {
    fontSize: 16,
    lineHeight: 1.65,
    color: 'var(--muted)',
    maxWidth: 410,
    marginBlock: '28px 26px',
    '@media (max-width: 540px)': { fontSize: 15, marginBlock: '22px 22px' },
  },
  primary: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 28,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--ink)',
    backgroundColor: 'var(--ink)',
    color: 'var(--paper)',
    fontSize: 12,
    fontWeight: 700,
    padding: '17px 22px',
    minHeight: 48,
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textDecoration: 'none',
    ':hover': {
      backgroundColor: 'var(--accent)',
      borderColor: 'var(--accent)',
    },
  },
  plainButton: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 0',
    fontSize: 12,
    cursor: 'pointer',
    textDecoration: 'none',
    minHeight: 44,
  },
  heroActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 27,
    flexWrap: 'wrap',
  },
  heroArt: {
    flex: '1 1 42%',
    minWidth: 0,
    position: 'relative',
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 470,
    '@media (max-width: 760px)': { minHeight: 370, marginTop: 20 },
    '@media (max-width: 540px)': { minHeight: 315 },
  },
  surface: {
    position: 'relative',
    flex: 1,
    width: '100%',
    minHeight: 380,
    color: 'var(--ink)',
    '@media (max-width: 760px)': { minHeight: 350 },
    '@media (max-width: 540px)': { minHeight: 300 },
  },
  artCircle: {
    position: 'absolute',
    width: '82%',
    aspectRatio: '1',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    borderRadius: '50%',
    top: '9%',
    left: '9%',
  },
  artCaption: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    fontSize: 10,
    letterSpacing: '.03em',
    color: 'var(--muted)',
    paddingInline: 22,
  },
  artIndex: {
    backgroundColor: 'var(--paper)',
    padding: 4,
    position: 'absolute',
    top: '12%',
    right: 0,
    fontFamily: 'monospace',
    fontSize: 10,
    color: 'var(--muted)',
  },
  heroBottom: {
    marginTop: 42,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 24,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--line)',
    paddingTop: 22,
    '@media (max-width: 540px)': { marginTop: 28, alignItems: 'start' },
  },
  caption: { fontSize: 11, lineHeight: 1.6, color: 'var(--muted)', margin: 0 },
  inlineMarks: {
    display: 'flex',
    alignItems: 'center',
    gap: 24,
    fontSize: 10,
    letterSpacing: '.09em',
    textTransform: 'uppercase',
    '@media (max-width: 540px)': {
      gap: 10,
      flexDirection: 'column',
      alignItems: 'end',
    },
  },
  textLink: { color: 'var(--ink)', textUnderlineOffset: 4, fontSize: 12 },
  section: {
    paddingBlock: 80,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--line)',
    '@media (max-width: 540px)': { paddingBlock: 52 },
  },
  sectionHeading: {
    display: 'flex',
    alignItems: 'start',
    gap: 30,
    justifyContent: 'space-between',
    marginBottom: 36,
    '@media (max-width: 760px)': { flexDirection: 'column', gap: 20 },
  },
  sectionIndex: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: 'var(--muted)',
    paddingTop: 10,
    minWidth: 46,
  },
  headingGroup: { flex: '1 1 55%', minWidth: 0 },
  sectionTitle: {
    fontFamily: 'var(--display)',
    fontWeight: 400,
    fontSize: 'clamp(38px, 4.4vw, 62px)',
    lineHeight: 1.06,
    letterSpacing: 'var(--tracking)',
    margin: '0 0 14px',
  },
  sectionIntro: {
    fontSize: 14,
    lineHeight: 1.75,
    color: 'var(--muted)',
    maxWidth: 380,
    margin: '6px 0 0',
    flex: '1 1 35%',
  },
  tag: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.1em',
    color: 'var(--accent)',
    fontWeight: 700,
    marginBottom: 12,
    display: 'block',
  },
  profileRow: {
    display: 'flex',
    gap: 14,
    '@media (max-width: 640px)': { flexDirection: 'column' },
  },
  profileCard: {
    flex: 1,
    display: 'flex',
    textAlign: 'left',
    flexDirection: 'column',
    padding: 20,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    cursor: 'pointer',
    borderRadius: 'var(--radius)',
    minWidth: 0,
    ':hover': { borderColor: 'var(--ink)' },
  },
  profileSelected: {
    borderColor: 'var(--ink)',
    boxShadow: 'inset 0 0 0 1px var(--ink)',
  },
  profilePreview: {
    height: 130,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 22,
    marginBottom: 20,
    width: '100%',
    overflow: 'hidden',
    '@media (max-width: 640px)': { height: 92, marginBottom: 14 },
  },
  previewType: { fontSize: 65, letterSpacing: '-.08em', lineHeight: 1 },
  profileName: {
    fontSize: 14,
    fontWeight: 700,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewDots: { display: 'flex', alignItems: 'center', gap: 6 },
  chip: { width: 21, height: 21, borderRadius: '50%', display: 'block' },
  editor: {
    display: 'flex',
    alignItems: 'start',
    gap: 32,
    paddingTop: 28,
    '@media (max-width: 760px)': { flexDirection: 'column', gap: 20 },
  },
  editorField: { flex: 1, minWidth: 0, width: '100%' },
  label: {
    fontSize: 11,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  textarea: {
    fontFamily: 'inherit',
    fontSize: 14,
    lineHeight: 1.6,
    width: '100%',
    resize: 'vertical',
    minHeight: 90,
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    padding: '14px 16px',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    borderRadius: 'var(--radius)',
  },
  editorAside: {
    width: 275,
    paddingTop: 24,
    '@media (max-width: 760px)': { width: '100%', paddingTop: 0 },
  },
  statline: {
    fontSize: 11,
    lineHeight: 1.6,
    color: 'var(--muted)',
    margin: '10px 0 0',
  },
  darkBand: {
    backgroundColor: 'var(--ink)',
    color: 'var(--paper)',
    paddingBlock: 74,
    '@media (max-width: 540px)': { paddingBlock: 48 },
  },
  lightMuted: { color: 'var(--paper)', opacity: 0.65 },
  motionRow: {
    display: 'flex',
    gap: 54,
    alignItems: 'center',
    '@media (max-width: 800px)': {
      flexDirection: 'column',
      gap: 36,
      alignItems: 'stretch',
    },
  },
  motionCopy: { flex: '1 1 35%', minWidth: 0 },
  motionDemo: {
    flex: '1 1 65%',
    minWidth: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(243,241,232,.23)',
    padding: 28,
    borderRadius: 'var(--radius)',
    backgroundColor: 'rgba(255,255,255,.03)',
    '@media (max-width: 540px)': { padding: 20 },
  },
  demoBar: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    fontFamily: 'monospace',
    fontSize: 10,
    letterSpacing: '.02em',
    alignItems: 'center',
  },
  track: {
    height: 120,
    position: 'relative',
    marginBlock: 18,
    overflow: 'visible',
  },
  trackLine: {
    position: 'absolute',
    top: '50%',
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopStyle: 'dashed',
    borderTopColor: 'rgba(243,241,232,.3)',
  },
  ball: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    backgroundColor: '#d9e8aa',
    boxShadow: 'inset -9px -10px 20px rgba(35,58,40,.2)',
    position: 'absolute',
    top: 30,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 22,
    color: '#273e30',
    willChange: 'transform',
  },
  graph: { width: '100%', height: 74, display: 'block', opacity: 0.8 },
  controlLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'rgba(243,241,232,.2)',
    paddingTop: 18,
    flexWrap: 'wrap',
  },
  inverseButton: {
    backgroundColor: 'var(--paper)',
    color: 'var(--ink)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--paper)',
    padding: '13px 18px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    borderRadius: 'var(--radius)',
    display: 'flex',
    gap: 20,
    alignItems: 'center',
    minHeight: 44,
  },
  rangeLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    minWidth: 120,
    flex: 1,
    fontSize: 10,
  },
  range: {
    width: '100%',
    accentColor: 'var(--accent)',
    minHeight: 24,
    cursor: 'pointer',
    margin: 0,
  },
  badges: { display: 'flex', gap: 9, marginTop: 24, flexWrap: 'wrap' },
  badge: {
    fontSize: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'currentColor',
    borderRadius: 30,
    padding: '7px 10px',
    opacity: 0.75,
  },
  split: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 44,
    '@media (max-width: 800px)': { flexDirection: 'column', gap: 30 },
  },
  surfaceStage: {
    flex: '1 1 58%',
    position: 'relative',
    minWidth: 0,
    minHeight: 440,
    backgroundColor: 'var(--soft)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    '@media (max-width: 540px)': { minHeight: 360 },
  },
  stageLabel: {
    backgroundColor: 'var(--paper)',
    padding: '7px 9px',
    position: 'absolute',
    top: 22,
    left: 24,
    zIndex: 2,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '.12em',
  },
  surfaceControls: {
    flex: '1 1 42%',
    minWidth: 0,
    display: 'flex',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 25,
  },
  controlValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: 'var(--muted)',
    fontWeight: 400,
  },
  sliderControl: {
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--line)',
  },
  surfaceFoot: {
    padding: '14px 24px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 20,
    color: 'var(--muted)',
    fontSize: 10,
  },
  note: { fontSize: 11, lineHeight: 1.65, color: 'var(--muted)', margin: 0 },
  miniTitle: {
    fontFamily: 'var(--display)',
    fontWeight: 400,
    fontSize: 30,
    letterSpacing: '-.04em',
    margin: '0 0 12px',
    lineHeight: 1.1,
  },
  tabs: { display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' },
  tab: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    backgroundColor: 'transparent',
    color: 'var(--ink)',
    padding: '10px 16px',
    fontSize: 11,
    minHeight: 42,
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
  },
  activeTab: {
    backgroundColor: 'var(--ink)',
    color: 'var(--paper)',
    borderColor: 'var(--ink)',
  },
  cropStage: {
    flex: '1 1 62%',
    minWidth: 0,
    backgroundColor: 'var(--soft)',
    padding: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 400,
    '@media (max-width: 540px)': { padding: 18, minHeight: 300 },
  },
  cropFrame: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ddc6a6',
    boxShadow: '0 16px 40px rgba(55,50,33,.13)',
    maxWidth: '100%',
  },
  cropImage: { position: 'absolute', maxWidth: 'none', userSelect: 'none' },
  focal: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'white',
    borderRadius: '50%',
    transform: 'translate(-50%,-50%)',
    backgroundColor: 'rgba(255,255,255,.18)',
    boxShadow: '0 0 0 5px rgba(0,0,0,.15)',
  },
  cropCopy: {
    flex: '1 1 38%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 24,
  },
  specimen: {
    position: 'relative',
    color: '#313f32',
    backgroundColor: '#e8e9db',
    padding: 24,
    minHeight: 380,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    '@media (max-width: 540px)': { padding: 16, minHeight: 330 },
  },
  specimenNav: {
    display: 'flex',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: '#b7c0aa',
    paddingBottom: 12,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    gap: 10,
  },
  specimenContent: {
    display: 'flex',
    gap: 24,
    flex: 1,
    paddingTop: 20,
    alignItems: 'center',
    minWidth: 0,
  },
  specimenHeadline: {
    fontFamily: 'TheorySerif, Georgia, serif',
    fontSize: 42,
    lineHeight: 1.06,
    letterSpacing: '-.06em',
    margin: '0 0 16px',
    '@media (max-width: 540px)': { fontSize: 34 },
  },
  specimenCopy: { flex: 1, minWidth: 0 },
  specimenImage: {
    flex: 1,
    width: '45%',
    minWidth: 0,
    height: 220,
    objectFit: 'cover',
    objectPosition: '70% center',
  },
  specimenButton: {
    display: 'inline-block',
    backgroundColor: '#334e3b',
    color: '#f3f1e8',
    fontSize: 8,
    padding: '10px 14px',
    marginTop: 14,
  },
  wireframeHost: {
    width: '100%',
    maxHeight: 520,
    minHeight: 300,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    overflow: 'auto',
    padding: 12,
    backgroundColor: '#efede3',
  },
  wireframePanel: {
    flex: '1 1 68%',
    minWidth: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  panelToolbar: {
    padding: '14px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 15,
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--line)',
    flexWrap: 'wrap',
  },
  inspector: {
    flex: '1 1 32%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 22,
  },
  metrics: { display: 'flex', gap: 20, flexWrap: 'wrap' },
  metric: {
    flex: 1,
    paddingBlock: 18,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--line)',
    minWidth: 70,
  },
  metricValue: {
    display: 'block',
    fontFamily: 'var(--display)',
    fontSize: 35,
    letterSpacing: '-.05em',
    marginBottom: 4,
  },
  pathRow: {
    display: 'flex',
    gap: 1,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--line)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    '@media (max-width: 640px)': { flexDirection: 'column' },
  },
  pathStep: {
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    padding: '24px 22px',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRightWidth: 1,
    borderRightStyle: 'solid',
    borderRightColor: 'var(--line)',
    color: 'var(--ink)',
    cursor: 'pointer',
    ':last-child': { borderRightWidth: 0 },
    '@media (max-width: 640px)': {
      borderRightWidth: 0,
      borderBottomWidth: 1,
      borderBottomStyle: 'solid',
      borderBottomColor: 'var(--line)',
      padding: '18px 20px',
    },
  },
  pathActive: { backgroundColor: 'var(--soft)' },
  pathNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'monospace',
    fontSize: 10,
    marginBottom: 24,
    '@media (max-width: 640px)': { marginBottom: 10 },
  },
  pathTitle: {
    fontSize: 16,
    fontWeight: 700,
    display: 'block',
    marginBottom: 10,
  },
  workflowDetail: {
    display: 'flex',
    gap: 40,
    paddingTop: 32,
    alignItems: 'start',
    '@media (max-width: 760px)': { flexDirection: 'column', gap: 24 },
  },
  workflowProse: { flex: 1, minWidth: 0 },
  code: {
    flex: 1,
    minWidth: 0,
    width: '100%',
    backgroundColor: 'var(--soft)',
    color: 'var(--ink)',
    padding: 22,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 1.8,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
    borderRadius: 'var(--radius)',
  },
  end: {
    paddingBlock: '76px 48px',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: 'var(--line)',
  },
  endTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 30,
    alignItems: 'center',
    '@media (max-width: 760px)': {
      flexDirection: 'column',
      alignItems: 'start',
    },
  },
  endTitle: {
    fontFamily: 'var(--display)',
    fontWeight: 400,
    fontSize: 'clamp(44px, 6vw, 82px)',
    letterSpacing: 'var(--tracking)',
    lineHeight: 1.05,
    margin: 0,
  },
  footer: {
    display: 'flex',
    alignItems: 'start',
    justifyContent: 'space-between',
    gap: 28,
    paddingTop: 54,
    flexWrap: 'wrap',
  },
  footerLinks: { display: 'flex', gap: 24, flexWrap: 'wrap' },
});

function Arrow({ diagonal = false }) {
  return <span aria-hidden="true">{diagonal ? '↗' : '↗'}</span>;
}
function Logo() {
  return (
    <svg
      width="25"
      height="29"
      viewBox="0 0 25 29"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 3h10a10 10 0 0 1 0 20H2z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M2 13h20M12 3v20M2 27h21"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}
function Header() {
  return (
    <header {...stylex.props(s.header)}>
      <nav {...stylex.props(s.shell, s.nav)} aria-label="Main navigation">
        <a href="#" {...stylex.props(s.brand)}>
          <Logo />
          Design Theory
        </a>
        <div {...stylex.props(s.navlinks)}>
          <a {...stylex.props(s.navlink)} href="#explore">
            The toolkit
          </a>
          <a {...stylex.props(s.navlink)} href="#workflow">
            How it works
          </a>
          <a {...stylex.props(s.navlink)} href="#gallery">
            In practice
          </a>
        </div>
        <a href="#brief" {...stylex.props(s.navcta)}>
          Make it yours <Arrow />
        </a>
      </nav>
    </header>
  );
}
function SectionHeading({ number, eyebrow, title, children }) {
  return (
    <div {...stylex.props(s.sectionHeading)}>
      <span {...stylex.props(s.sectionIndex)}>{number} /</span>
      <div {...stylex.props(s.headingGroup)}>
        <span {...stylex.props(s.tag)}>{eyebrow}</span>
        <h2 {...stylex.props(s.sectionTitle)}>{title}</h2>
      </div>
      <p {...stylex.props(s.sectionIntro)}>{children}</p>
    </div>
  );
}

function MotionDemo({ spring, onChange }) {
  const damping = spring.damping;
  const setDamping = (damping) => onChange({ ...spring, damping });
  const track = useRef(null),
    ball = useRef(null),
    energy = useRef(null),
    driver = useRef(null),
    direction = useRef(1),
    travel = useRef(200),
    origin = useRef(20);
  const graph = useMemo(
    () =>
      Array.from({ length: 100 }, (_, i) => {
        const p = sampleMotion(
          { spring, coordinate: { unit: 'normalized', from: 0, to: 1 } },
          (i * 1.4) / 99,
        );
        return `${i === 0 ? 'M' : 'L'}${i * 5.05} ${66 - p.position * 43}`;
      }).join(' '),
    [spring],
  );
  useEffect(() => {
    const before = driver.current?.snapshot();
    driver.current = createDrivenMotion({
      spring,
      position: before?.position ?? 0,
      target: direction.current,
      velocity: before?.velocity ?? 0,
    });
  }, [spring]);
  useEffect(() => {
    const runtime = getRuntime(),
      setter = gsap.quickSetter(ball.current, 'x', 'px');
    const observer = new ResizeObserver(([e]) => {
      travel.current = Math.max(0, (e.contentRect.width - 60) * 0.7);
      origin.current = Math.max(0, (e.contentRect.width - 60) * 0.12);
    });
    observer.observe(track.current);
    let lastLabel = 0;
    const unsubscribe = runtime.subscribe((time, dt, reduced) => {
      if (!driver.current) return;
      const state = driver.current.advance(dt);
      const position = reduced ? direction.current : state.position;
      setter(origin.current + position * travel.current);
      ball.current.dataset.position = String(position);
      if (time - lastLabel > 0.1) {
        lastLabel = time;
        energy.current.textContent = `E ${state.energy.toFixed(2)}`;
      }
    });
    return () => {
      unsubscribe();
      observer.disconnect();
    };
  }, []);
  const retarget = () => {
    direction.current = direction.current === 1 ? 0 : 1;
    driver.current.retarget(direction.current);
  };
  return (
    <section id="motion" {...stylex.props(s.darkBand)}>
      <div {...stylex.props(s.shell, s.motionRow)}>
        <div {...stylex.props(s.motionCopy)}>
          <span {...stylex.props(s.tag, s.lightMuted)}>
            02 / Motion with intention
          </span>
          <h2 {...stylex.props(s.sectionTitle)}>
            Feel the
            <br />
            difference.
          </h2>
          <p {...stylex.props(s.sectionIntro, s.lightMuted)}>
            A little tension. A satisfying release. Shape the movement, then
            change its destination without losing momentum.
          </p>
          <div {...stylex.props(s.badges)}>
            <span {...stylex.props(s.badge)}>Retargetable springs</span>
            <span {...stylex.props(s.badge)}>One shared clock</span>
          </div>
        </div>
        <div {...stylex.props(s.motionDemo)} data-motion-demo>
          <div {...stylex.props(s.demoBar)}>
            <span>SPRING STUDY — 001</span>
            <span ref={energy}>E 0.00</span>
          </div>
          <div ref={track} {...stylex.props(s.track)}>
            <div {...stylex.props(s.trackLine)} />
            <div ref={ball} data-motion-ball {...stylex.props(s.ball)}>
              <span aria-hidden="true">✳</span>
            </div>
          </div>
          <svg
            viewBox="0 0 500 78"
            preserveAspectRatio="none"
            {...stylex.props(s.graph)}
            aria-label="Analytic spring position over time"
          >
            <path
              d="M0 23H500"
              stroke="currentColor"
              opacity=".2"
              strokeDasharray="3 5"
            />
            <path d={graph} stroke="#d9e8aa" strokeWidth="2" fill="none" />
          </svg>
          <div {...stylex.props(s.controlLine)}>
            <label {...stylex.props(s.rangeLabel)}>
              Damping · {damping}
              <input
                aria-label="Motion damping"
                type="range"
                min="5"
                max="35"
                step="1"
                value={damping}
                onChange={(e) => setDamping(Number(e.target.value))}
                {...stylex.props(s.range)}
              />
            </label>
            <button
              onClick={retarget}
              {...stylex.props(s.inverseButton)}
              data-retarget
            >
              Change direction <span aria-hidden="true">↔</span>
            </button>
          </div>
          <p {...stylex.props(s.note, s.lightMuted)} style={{ marginTop: 16 }}>
            Drag the damping control. Tap again before the motion settles.
          </p>
        </div>
      </div>
    </section>
  );
}

function Materials({ profile, parameters, onChange }) {
  const { roughness, metalness, normalScale, normalStrength } = parameters;
  const update = (key, value) => onChange({ ...parameters, [key]: value });
  const setRoughness = (value) => update('roughness', value),
    setMetalness = (value) => update('metalness', value),
    setNormalScale = (value) => update('normalScale', value),
    setNormalStrength = (value) => update('normalStrength', value);
  const [status, setStatus] = useState('initializing'),
    [permission, setPermission] = useState('idle');
  const controller = useRef(null);
  const surface = useMemo(
    () => ({ ...profile.material, roughness, metalness }),
    [profile, roughness, metalness],
  );
  const probe = useMemo(
    () => probeSurface({ surface, light: [-0.4, 0.5, 1] }),
    [surface],
  );
  const composition = (m) =>
    m === 0
      ? 'homogeneous-dielectric'
      : m === 1
        ? 'homogeneous-conductor'
        : 'mixture';
  const pair = useMemo(
    () =>
      analyzeMaterialPair({
        first: {
          id: 'main',
          surface,
          composition: composition(metalness),
          lighting: { rigId: 'studio-room', environmentId: 'procedural-room' },
          provenance: {
            kind: 'authored',
            source: 'Design Theory gallery profile',
          },
        },
        second: {
          id: 'paired',
          surface: profile.materialPair,
          composition: composition(profile.materialPair.metalness),
          lighting: { rigId: 'studio-room', environmentId: 'procedural-room' },
          provenance: {
            kind: 'authored',
            source: 'Design Theory gallery profile',
          },
        },
        profile: {
          id: profile.id,
          intent: profile.note,
          roleRelation: 'counterpoint',
          source: 'Authored gallery direction; not preference data',
          bands: [
            {
              metric: 'roughnessDifference',
              min: 0,
              max: 0.6,
              rationale:
                'Keep a visible range of finishes available to the author',
              source: 'Editable gallery policy',
            },
          ],
        },
      }),
    [surface, profile],
  );
  const enableTilt = async () => {
    if (controller.current)
      setPermission(await controller.current.requestFromUserGesture());
  };
  return (
    <section id="materials" {...stylex.props(s.section, s.shell)} data-reveal>
      <SectionHeading
        number="03"
        eyebrow="Materials & light"
        title={
          <>
            A surface.
            <br />
            Not just a color.
          </>
        }
      >
        Give an interface a tactile point of view. Explore how roughness,
        reflectance and light change the same form.
      </SectionHeading>
      <div {...stylex.props(s.split)}>
        <div {...stylex.props(s.surfaceStage)}>
          <span {...stylex.props(s.stageLabel)}>
            Form study / {profile.name}
          </span>
          <Surface
            id="material"
            surface={surface}
            accentSurface={profile.materialPair}
            normalScale={normalScale}
            normalStrength={normalStrength}
            controllerRef={controller}
            onStatus={setStatus}
            className={stylex.props(s.surface).className}
          />
          <div {...stylex.props(s.surfaceFoot)}>
            <span>Move your pointer to shift the light</span>
            <span aria-label="Renderer status">
              {status === 'worker'
                ? 'Live · worker'
                : status === 'main'
                  ? 'Live · WebGL'
                  : status === 'static'
                    ? 'Static preview'
                    : 'Preparing…'}
            </span>
          </div>
        </div>
        <div {...stylex.props(s.surfaceControls)}>
          <div>
            <h3 {...stylex.props(s.miniTitle)}>Make it feel like you.</h3>
            <p {...stylex.props(s.note)}>
              Two surfaces, one light. The surface response is modeled; the
              pairing is your choice.
            </p>
          </div>
          <label {...stylex.props(s.sliderControl)}>
            <span {...stylex.props(s.label)}>
              Roughness{' '}
              <output {...stylex.props(s.controlValue)}>
                {roughness.toFixed(2)}
              </output>
            </span>
            <input
              {...stylex.props(s.range)}
              aria-label="Material roughness"
              type="range"
              min=".05"
              max=".95"
              step=".01"
              value={roughness}
              onChange={(e) => setRoughness(Number(e.target.value))}
            />
            <span {...stylex.props(s.caption)}>
              Polished <span style={{ float: 'right' }}>Matte</span>
            </span>
          </label>
          <label {...stylex.props(s.sliderControl)}>
            <span {...stylex.props(s.label)}>
              Metalness{' '}
              <output {...stylex.props(s.controlValue)}>
                {metalness.toFixed(2)}
                {metalness > 0 && metalness < 1 ? ' · blend' : ''}
              </output>
            </span>
            <input
              {...stylex.props(s.range)}
              aria-label="Material metalness"
              type="range"
              min="0"
              max="1"
              step=".01"
              value={metalness}
              onChange={(e) => setMetalness(Number(e.target.value))}
            />
            <span {...stylex.props(s.caption)}>
              Dielectric <span style={{ float: 'right' }}>Conductor</span>
            </span>
          </label>
          <div style={{ display: 'flex', gap: 20 }}>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span {...stylex.props(s.label)}>
                Texture scale{' '}
                <output {...stylex.props(s.controlValue)}>
                  {normalScale.toFixed(1)}×
                </output>
              </span>
              <input
                {...stylex.props(s.range)}
                aria-label="Normal texture scale"
                type="range"
                min=".5"
                max="4"
                step=".1"
                value={normalScale}
                onChange={(e) => setNormalScale(Number(e.target.value))}
              />
            </label>
            <label style={{ flex: 1, minWidth: 0 }}>
              <span {...stylex.props(s.label)}>
                Relief{' '}
                <output {...stylex.props(s.controlValue)}>
                  {normalStrength.toFixed(2)}
                </output>
              </span>
              <input
                {...stylex.props(s.range)}
                aria-label="Normal texture amplitude"
                type="range"
                min="0"
                max=".6"
                step=".01"
                value={normalStrength}
                onChange={(e) => setNormalStrength(Number(e.target.value))}
              />
            </label>
          </div>
          <div>
            <button
              {...stylex.props(s.navcta)}
              onClick={enableTilt}
              data-enable-tilt
            >
              {permission === 'active'
                ? 'Tilt enabled ✓'
                : 'Enable device tilt'}{' '}
              <span aria-hidden="true">↗</span>
            </button>
            <p {...stylex.props(s.statline)} role="status">
              {permission === 'active'
                ? 'Tilt your device gently. Your starting pose is neutral.'
                : permission === 'denied'
                  ? 'Motion permission was not granted. Pointer controls still work.'
                  : permission === 'unsupported'
                    ? 'Device orientation is unavailable here. Try moving your pointer.'
                    : permission === 'paused'
                      ? 'Tilt is paused while reduced motion is on or the page is hidden.'
                      : 'Optional on supported mobile devices. Permission is requested only when you choose.'}
            </p>
          </div>
          <details>
            <summary {...stylex.props(s.caption)}>
              Inspect the material model
            </summary>
            <p {...stylex.props(s.note)} style={{ paddingTop: 10 }}>
              Paired roughness difference:{' '}
              {pair.descriptors.roughnessDifference.value.toFixed(2)}. Color
              parameter distance: {pair.descriptors.deltaEOK.value.toFixed(3)}{' '}
              OKLab. Both shapes share the lighting rig. Intermediate metalness
              is a blend/transition, not a homogeneous material. Roughness maps
              use the control as their center, with material roughness set to 1;
              relief controls the normal-map strength. Text remains on opaque
              matte panels. Directional response ·{' '}
              {probe.radiance.map((x) => x.toFixed(3)).join(' / ')} linear RGB.
              GGX / Schlick / Smith. The rendered scene also includes
              environment light and tone mapping.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}

function CropDemo() {
  const [format, setFormat] = useState('landscape'),
    [focus, setFocus] = useState(68),
    [annotation, setAnnotation] = useState(true);
  const target =
    format === 'portrait'
      ? { width: 270, height: 340 }
      : format === 'square'
        ? { width: 340, height: 340 }
        : { width: 550, height: 340 };
  const result = useMemo(
    () =>
      mediaCropCandidates({
        sourceWidth: 1200,
        sourceHeight: 800,
        ...target,
        focal: { x: focus / 100, y: 0.58 },
        target: { x: 0.6, y: 0.5 },
        subjects: [{ x: 0.46, y: 0.24, width: 0.37, height: 0.62 }],
        weights: {
          subjectLoss: 0,
          focalDisplacement: 4,
          negativeSpaceLoss: 0,
          textSubjectOverlap: 0,
        },
      }),
    [format, focus],
  );
  const crop = result.candidates[0];
  return (
    <section id="images" {...stylex.props(s.section, s.shell)} data-reveal>
      <SectionHeading
        number="04"
        eyebrow="Images, composed"
        title={
          <>
            Keep the part
            <br />
            that matters.
          </>
        }
      >
        An image has a subject, a rhythm and room to breathe. Bring that intent
        into every crop, from a wide story to a small screen.
      </SectionHeading>
      <div {...stylex.props(s.split)}>
        <div {...stylex.props(s.cropStage)}>
          <div
            {...stylex.props(s.cropFrame)}
            style={{
              width: target.width,
              aspectRatio: `${target.width}/${target.height}`,
            }}
            data-crop-frame
          >
            <svg
              viewBox={`0 0 ${target.width} ${target.height}`}
              style={{ display: 'block', width: '100%', height: '100%' }}
              aria-label={`${format} crop of original still life`}
            >
              <image
                href="still-life.svg"
                x={crop.offsetX}
                y={crop.offsetY}
                width={crop.drawWidth}
                height={crop.drawHeight}
              />
              {annotation && (
                <g>
                  <circle
                    cx={crop.focal.x}
                    cy={crop.focal.y}
                    r="9"
                    fill="rgba(255,255,255,.12)"
                    stroke="white"
                    strokeWidth="1.5"
                  />
                  <path
                    d={`M${crop.focal.x - 14} ${crop.focal.y}h28M${crop.focal.x} ${crop.focal.y - 14}v28`}
                    stroke="white"
                    strokeWidth="1"
                  />
                </g>
              )}
            </svg>
          </div>
        </div>
        <div {...stylex.props(s.cropCopy)}>
          <span {...stylex.props(s.tag)}>Still life, no. 01</span>
          <h3 {...stylex.props(s.miniTitle)}>
            One image.
            <br />A family of frames.
          </h3>
          <div {...stylex.props(s.tabs)} aria-label="Crop format">
            {['landscape', 'square', 'portrait'].map((name) => (
              <button
                key={name}
                {...stylex.props(s.tab, format === name && s.activeTab)}
                aria-pressed={format === name}
                onClick={() => setFormat(name)}
              >
                {name[0].toUpperCase() + name.slice(1)}
              </button>
            ))}
          </div>
          <label>
            <span {...stylex.props(s.label)}>
              Focal point{' '}
              <output {...stylex.props(s.controlValue)}>{focus}%</output>
            </span>
            <input
              {...stylex.props(s.range)}
              aria-label="Image focal point"
              type="range"
              min="20"
              max="85"
              step="1"
              value={focus}
              onChange={(e) => setFocus(Number(e.target.value))}
            />
          </label>
          <label
            {...stylex.props(s.note)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <input
              type="checkbox"
              checked={annotation}
              onChange={(e) => setAnnotation(e.target.checked)}
            />{' '}
            Show the authored focal point
          </label>
          <p {...stylex.props(s.note)}>
            Original vector illustration. The focal point is chosen by you; this
            demo does not detect subjects or infer attention.
          </p>
        </div>
      </div>
    </section>
  );
}

function wireframeFor(width, gutter, gap, naturalTextHeight = 0) {
  const stacked = width < 620,
    height = stacked ? 760 : 510;
  const ref = (name) => ({ ref: name }),
    op = (name, ...args) => ({ op: name, args });
  return resolveWireframe({
    version: 1,
    id: 'field-notes',
    screen: { width, height, unit: 'css-px' },
    variables: {
      gutter: { value: gutter, min: 16, max: 64, unit: 'px' },
      gap: { value: gap, min: 12, max: 48, unit: 'px' },
      naturalTextHeight: { value: naturalTextHeight, unit: 'px' },
    },
    derived: [
      {
        id: 'titleHeight',
        expression: op('max', stacked ? 190 : 230, ref('naturalTextHeight')),
        unit: 'px',
      },
      {
        id: 'titleBottom',
        expression: op('add', 104, ref('titleHeight')),
        unit: 'px',
      },
      {
        id: 'imageY',
        expression: stacked ? op('add', ref('titleBottom'), ref('gap')) : 104,
        unit: 'px',
      },
      {
        id: 'actionY',
        expression: stacked
          ? op('add', ref('imageY'), 255, 26)
          : op('add', ref('titleBottom'), ref('gap')),
        unit: 'px',
      },
      {
        id: 'footerY',
        expression: op(
          'max',
          height - 62,
          op('add', ref('actionY'), 44, 34),
          op('add', ref('imageY'), stacked ? 255 : 290, 34),
        ),
        unit: 'px',
      },
      {
        id: 'content',
        expression: op('sub', ref('screen.width'), op('mul', 2, ref('gutter'))),
        unit: 'px',
      },
      {
        id: 'column',
        expression: stacked
          ? ref('content')
          : op('div', op('sub', ref('content'), ref('gap')), 2),
        unit: 'px',
      },
    ],
    nodes: [
      {
        id: 'nav',
        label: 'Navigation',
        role: 'region',
        evidence: 'proposed',
        box: { x: ref('gutter'), y: 30, width: ref('content'), height: 40 },
      },
      {
        id: 'title',
        label: 'Story + introduction',
        role: 'text',
        evidence: 'proposed',
        box: {
          x: ref('gutter'),
          y: 104,
          width: ref('column'),
          height: ref('titleHeight'),
        },
        baseline: 46,
      },
      {
        id: 'image',
        label: 'Focal image',
        role: 'image',
        evidence: 'proposed',
        box: {
          x: stacked
            ? ref('gutter')
            : op('add', ref('gutter'), ref('column'), ref('gap')),
          y: ref('imageY'),
          width: ref('column'),
          height: stacked ? 255 : 290,
        },
      },
      {
        id: 'action',
        label: 'Read the story',
        role: 'control',
        evidence: 'proposed',
        box: {
          x: ref('gutter'),
          y: ref('actionY'),
          width: 160,
          height: 44,
        },
      },
      {
        id: 'footer',
        label: 'Edition + credits',
        role: 'region',
        evidence: 'proposed',
        box: {
          x: ref('gutter'),
          y: ref('footerY'),
          width: ref('content'),
          height: 28,
        },
      },
    ],
    relations: [
      {
        id: 'aligned',
        kind: 'alignment',
        from: 'nav',
        to: 'title',
        axis: 'x',
        band: { min: 0, max: 0 },
        source: 'Authored editorial alignment',
      },
      {
        id: 'columns',
        kind: 'ratio',
        from: 'title',
        to: 'image',
        axis: 'x',
        band: { min: 1, max: 1 },
        source: 'Equal readable and visual columns',
      },
    ],
  });
}
function LayoutGallery() {
  const [view, setView] = useState('design'),
    [width, setWidth] = useState(() =>
      innerWidth < 620 ? 390 : innerWidth < 950 ? 834 : 960,
    ),
    [gutter, setGutter] = useState(32),
    [gap, setGap] = useState(28),
    [selected, setSelected] = useState('title'),
    [measurement, setMeasurement] = useState({ key: '', height: 0 });
  const measurementKey = `${width}/${gutter}/${gap}`;
  const onMeasure = useCallback(
    (key, height) =>
      setMeasurement((previous) =>
        previous.key === key && previous.height === height
          ? previous
          : { key, height },
      ),
    [],
  );
  const measuredHeight =
    measurement.key === measurementKey ? measurement.height : 0;
  const frame = useMemo(
    () => wireframeFor(width, gutter, gap, measuredHeight),
    [width, gutter, gap, measuredHeight],
  );
  const selectedNode = frame.nodes.find((x) => x.id === selected);
  const select = (event) => {
    const node = event.target.closest('[data-wireframe-node]');
    if (node) setSelected(node.getAttribute('data-wireframe-node'));
  };
  return (
    <section
      id="gallery"
      {...stylex.props(s.section, s.shell)}
      data-reveal
      data-layout-measured={measuredHeight > 0}
    >
      <LayoutTitleMeasure
        width={frame.nodes.find((node) => node.id === 'title').box.width}
        mobile={width < 620}
        measurementKey={measurementKey}
        onMeasure={onMeasure}
      />
      <SectionHeading
        number="05"
        eyebrow="Whole compositions"
        title={
          <>
            See the whole.
            <br />
            Inspect the details.
          </>
        }
      >
        Move between the finished idea and the relationships underneath it.
        Width, spacing and proportion stay editable—and understandable.
      </SectionHeading>
      <div {...stylex.props(s.split)}>
        <div {...stylex.props(s.wireframePanel)}>
          <div {...stylex.props(s.panelToolbar)}>
            <div {...stylex.props(s.tabs)}>
              {['design', 'inspect'].map((x) => (
                <button
                  key={x}
                  {...stylex.props(s.tab, view === x && s.activeTab)}
                  aria-pressed={view === x}
                  onClick={() => setView(x)}
                >
                  {x === 'design' ? 'Design' : 'Inspect relationships'}
                </button>
              ))}
            </div>
            <select
              aria-label="Layout viewport"
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
              style={{
                background: 'transparent',
                border: 0,
                color: 'inherit',
                fontSize: 11,
                padding: 8,
              }}
            >
              <option value={390}>Phone · 390</option>
              <option value={834}>Tablet · 834</option>
              <option value={960}>Desktop · 960</option>
            </select>
          </div>
          {view === 'inspect' ? (
            <div
              {...stylex.props(s.wireframeHost)}
              data-wireframe
              style={{ display: 'block' }}
              onClick={select}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(e);
                }
              }}
              dangerouslySetInnerHTML={{
                __html: wireframeSvg(frame, selected),
              }}
            />
          ) : (
            <LayoutPreview frame={frame} />
          )}
        </div>
        <div {...stylex.props(s.inspector)}>
          <h3 {...stylex.props(s.miniTitle)}>
            A system you can
            <br />
            put your hands on.
          </h3>
          <label>
            <span {...stylex.props(s.label)}>
              Page gutter{' '}
              <output {...stylex.props(s.controlValue)}>{gutter}px</output>
            </span>
            <input
              {...stylex.props(s.range)}
              aria-label="Layout gutter"
              type="range"
              min="16"
              max="64"
              value={gutter}
              onChange={(e) => setGutter(Number(e.target.value))}
            />
          </label>
          <label>
            <span {...stylex.props(s.label)}>
              Content gap{' '}
              <output {...stylex.props(s.controlValue)}>{gap}px</output>
            </span>
            <input
              {...stylex.props(s.range)}
              aria-label="Layout content gap"
              type="range"
              min="12"
              max="48"
              value={gap}
              onChange={(e) => setGap(Number(e.target.value))}
            />
          </label>
          <div {...stylex.props(s.metrics)}>
            <div {...stylex.props(s.metric)}>
              <span {...stylex.props(s.metricValue)}>
                {Math.round(frame.values.column)}
              </span>
              <span {...stylex.props(s.caption)}>column / px</span>
            </div>
            <div {...stylex.props(s.metric)}>
              <span {...stylex.props(s.metricValue)}>1:1</span>
              <span {...stylex.props(s.caption)}>column ratio</span>
            </div>
          </div>
          <p {...stylex.props(s.note)}>
            {view === 'inspect'
              ? `${selectedNode.label}: ${Math.round(selectedNode.box.width)} × ${Math.round(selectedNode.box.height)} px. Select a region to inspect it.`
              : 'Choose Inspect relationships to see the whole layout as an editable technical drawing.'}{' '}
            Geometry is authored. The title height expands to fit this browser’s
            measured font and text wrapping.
          </p>
        </div>
      </div>
    </section>
  );
}

const stages = [
  {
    title: 'Begin with intent',
    description: 'The brief comes before the numbers.',
    detail:
      'Write down what matters: the people, the content, the feeling. Choose a direction and keep the constraints that make the work yours.',
    code: '01  Authored brief\n    Audience · purpose · character\n\n    Every preference stays editable.',
  },
  {
    title: 'Explore the space',
    description: 'Keep more than one good possibility.',
    detail:
      'Make room for alternatives. Compare typography, layout, color and motion together, without collapsing every choice into a single quality score.',
    code: '02  Bounded alternatives\n    Type × space × color × motion\n\n    Separate factors. Visible tradeoffs.',
  },
  {
    title: 'Look at the real thing',
    description: 'A model is a proposal. Rendering is evidence.',
    detail:
      'Inspect the actual view at different sizes. Test the interactions. A mathematical relationship can help explain a decision; it cannot replace seeing the result.',
    code: '03  Renderer checks\n    Phone · tablet · desktop\n    Content · focus · reduced motion',
  },
  {
    title: 'Keep what works',
    description: 'Save the choice. Revisit the why.',
    detail:
      'Carry the chosen inputs forward. Replay a saved direction without asking the same questions again, then reopen the decisions when your brief changes.',
    code: '04  Replay the saved inputs\n    Same brief. Same parameters.\n\n    Revisit when the conditions change.',
  },
];
function Workflow({ profile, onReplay, saved, onSave }) {
  const [stage, setStage] = useState(0),
    [copied, setCopied] = useState(false);
  const download = () => {
    const payload = {
      spring: profile.motion,
      coordinate: { unit: 'px', from: 0, to: 120 },
      durationSeconds: 2,
      sampleCount: 121,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'motion.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        'design motion analyze --input motion.json',
      );
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section id="workflow" {...stylex.props(s.section, s.shell)} data-reveal>
      <SectionHeading
        number="06"
        eyebrow="A thoughtful workflow"
        title={
          <>
            From a point of view
            <br />
            to a working system.
          </>
        }
      >
        A toolkit for developers and design-minded agents. Use the parts you
        need, keep the reasoning nearby, and make the final call yourself.
      </SectionHeading>
      <div {...stylex.props(s.pathRow)}>
        {stages.map((item, i) => (
          <button
            key={item.title}
            {...stylex.props(s.pathStep, stage === i && s.pathActive)}
            onClick={() => setStage(i)}
            aria-pressed={stage === i}
            data-workflow-step
          >
            <span {...stylex.props(s.pathNumber)}>
              0{i + 1}
              <Arrow />
            </span>
            <strong {...stylex.props(s.pathTitle)}>{item.title}</strong>
            <span {...stylex.props(s.caption)}>{item.description}</span>
          </button>
        ))}
      </div>
      <div {...stylex.props(s.workflowDetail)}>
        <div {...stylex.props(s.workflowProse)}>
          <h3 {...stylex.props(s.miniTitle)}>{stages[stage].title}</h3>
          <p {...stylex.props(s.sectionIntro)}>{stages[stage].detail}</p>
          <div {...stylex.props(s.heroActions)} style={{ marginTop: 20 }}>
            <button {...stylex.props(s.primary)} onClick={onSave}>
              Save this direction <span aria-hidden="true">+</span>
            </button>
            <button
              {...stylex.props(s.plainButton)}
              onClick={() => {
                onReplay();
                setStage(3);
              }}
            >
              Replay {saved?.name ?? 'saved'} <span aria-hidden="true">↻</span>
            </button>
          </div>
          <p {...stylex.props(s.statline)} role="status">
            Saved locally: {saved?.name ?? profile.name}. This demo replays your
            authored brief profile.
          </p>
        </div>
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <pre {...stylex.props(s.code)}>{stages[stage].code}</pre>
          <div
            {...stylex.props(s.heroActions)}
            style={{ gap: 22, marginTop: 10 }}
          >
            <button onClick={download} {...stylex.props(s.plainButton)}>
              Download motion.json ↓
            </button>
            <button onClick={copy} {...stylex.props(s.plainButton)}>
              {copied ? 'Command copied ✓' : 'Copy CLI command ↗'}
            </button>
          </div>
          <code {...stylex.props(s.caption)} style={{ fontSize: 10 }}>
            design motion analyze --input motion.json
          </code>
        </div>
      </div>
    </section>
  );
}

const materialDefaults = (profile) => ({
  roughness: profile.material.roughness,
  metalness: profile.material.metalness,
  normalScale: 1,
  normalStrength: 0.11,
});
const validMaterialParameters = (value) =>
  value &&
  ['roughness', 'metalness', 'normalScale', 'normalStrength'].every((key) =>
    Number.isFinite(value[key]),
  ) &&
  value.roughness >= 0.05 &&
  value.roughness <= 0.95 &&
  value.metalness >= 0 &&
  value.metalness <= 1 &&
  value.normalScale >= 0.5 &&
  value.normalScale <= 4 &&
  value.normalStrength >= 0 &&
  value.normalStrength <= 0.6;
function App() {
  const [profileId, setProfileId] = useState('editorial'),
    [brief, setBrief] = useState(profiles.editorial.brief),
    [saved, setSaved] = useState({
      ...profiles.editorial,
      materialParameters: materialDefaults(profiles.editorial),
    }),
    [motion, setMotion] = useState(profiles.editorial.motion),
    [materialParameters, setMaterialParameters] = useState(
      materialDefaults(profiles.editorial),
    ),
    [message, setMessage] = useState(''),
    [heroStatus, setHeroStatus] = useState('initializing');
  const profile = profiles[profileId];
  const heroSurface = useMemo(
    () => ({
      ...profile.material,
      roughness: materialParameters.roughness,
      metalness: materialParameters.metalness,
    }),
    [profile, materialParameters],
  );
  const root = useRef(null),
    hero = useRef(null);
  useEffect(() => {
    const runtime = getRuntime();
    window.__DESIGN_THEORY__ = { runtime, ready: true, profile: profileId };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const animatePress = (event) => {
      const button = event.target.closest('button');
      if (button && !media.matches)
        gsap.to(button, { scale: 0.97, duration: 0.12, overwrite: true });
    };
    const release = (event) => {
      const button = event.target.closest('button');
      if (button)
        gsap.to(button, {
          scale: 1,
          duration: media.matches ? 0 : 0.4,
          ease: 'back.out(2)',
          overwrite: true,
        });
    };
    const cancelDecorative = () => {
      if (media.matches) {
        gsap.killTweensOf([
          ...document.querySelectorAll('[data-reveal],button'),
          hero.current,
        ]);
        gsap.set(
          [...document.querySelectorAll('[data-reveal],button'), hero.current],
          { clearProps: 'transform,opacity' },
        );
      }
    };
    media.addEventListener('change', cancelDecorative);
    document.addEventListener('pointerdown', animatePress);
    document.addEventListener('pointerup', release);
    document.addEventListener('pointercancel', release);
    const reveals = [...document.querySelectorAll('[data-reveal]')];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            if (!media.matches)
              gsap.fromTo(
                entry.target,
                { y: 28, opacity: 0.45 },
                {
                  y: 0,
                  opacity: 1,
                  duration: 0.75,
                  ease: 'power3.out',
                  clearProps: 'transform,opacity',
                },
              );
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => observer.observe(el));
    const progress = document.querySelector('[data-scroll-line]');
    const setProgress = gsap.quickSetter(progress, 'scaleX');
    let maxScroll = Math.max(
      1,
      document.documentElement.scrollHeight - innerHeight,
    );
    const resize = new ResizeObserver(() => {
      maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - innerHeight,
      );
    });
    resize.observe(document.body);
    const unsubscribe = runtime.subscribe(() =>
      setProgress(scrollProgress(runtime.stats.scroll, 0, maxScroll)),
    );
    try {
      const stored = JSON.parse(
        localStorage.getItem('design-theory-direction') ?? 'null',
      );
      if (stored && profiles[stored.id] && typeof stored.brief === 'string')
        setSaved({
          ...profiles[stored.id],
          brief: stored.brief,
          motion: MotionSpringSchema.safeParse(stored.motion).success
            ? MotionSpringSchema.parse(stored.motion)
            : profiles[stored.id].motion,
          materialParameters: validMaterialParameters(stored.materialParameters)
            ? stored.materialParameters
            : materialDefaults(profiles[stored.id]),
        });
    } catch {}
    return () => {
      observer.disconnect();
      resize.disconnect();
      unsubscribe();
      media.removeEventListener('change', cancelDecorative);
      document.removeEventListener('pointerdown', animatePress);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      runtime.dispose();
    };
  }, []);
  useEffect(() => {
    if (window.__DESIGN_THEORY__) window.__DESIGN_THEORY__.profile = profileId;
  }, [profileId]);
  const choose = (id) => {
    setProfileId(id);
    setMotion(profiles[id].motion);
    setMaterialParameters(materialDefaults(profiles[id]));
    setBrief(profiles[id].brief);
    setMessage(`${profiles[id].name} direction applied.`);
    if (!getRuntime().reduced)
      gsap.fromTo(
        hero.current,
        { y: 18, opacity: 0.6 },
        {
          y: 0,
          opacity: 1,
          duration: 0.6,
          ease: 'power3.out',
          clearProps: 'transform,opacity',
        },
      );
  };
  const save = () => {
    const next = { ...profile, brief, motion, materialParameters };
    setSaved(next);
    try {
      localStorage.setItem(
        'design-theory-direction',
        JSON.stringify({ id: profileId, brief, motion, materialParameters }),
      );
      setMessage('Direction saved in this browser.');
    } catch {
      setMessage(
        'Direction saved for this visit. Browser storage is unavailable.',
      );
    }
  };
  const replay = () => {
    setProfileId(saved.id);
    setMotion(saved.motion);
    setMaterialParameters(saved.materialParameters);
    setBrief(saved.brief);
    setMessage(`${saved.name} direction replayed.`);
    if (!getRuntime().reduced)
      gsap.fromTo(
        root.current,
        { opacity: 0.7 },
        { opacity: 1, duration: 0.45, clearProps: 'opacity' },
      );
  };
  const vars = {
    '--paper': profile.paper,
    '--ink': profile.ink,
    '--muted': profile.muted,
    '--accent': profile.accent,
    '--soft': profile.soft,
    '--display': profile.display,
    '--tracking': profile.tracking,
    '--radius': profile.radius,
    '--line': `color-mix(in srgb, ${profile.ink} 22%, transparent)`,
  };
  const prose = useMemo(
    () =>
      analyzeProse({
        purpose: 'explanation',
        audience: 'Design-minded developers',
        outcome: 'State the authored visual direction',
        sections: [{ id: 'brief', heading: 'Creative direction', text: brief }],
      }),
    [brief],
  );
  const words = prose.facts[0].words;
  return (
    <div
      ref={root}
      {...stylex.props(s.app)}
      style={vars}
      data-profile={profileId}
    >
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div
        data-scroll-line
        style={{
          position: 'fixed',
          height: 2,
          background: 'var(--accent)',
          top: 0,
          left: 0,
          right: 0,
          transformOrigin: 'left',
          transform: 'scaleX(0)',
          zIndex: 30,
        }}
      />
      <Header />
      <main id="main">
        <section {...stylex.props(s.shell, s.hero)} id="top">
          <div {...stylex.props(s.heroTop)}>
            <span {...stylex.props(s.eyebrow)}>
              <i {...stylex.props(s.dot)} /> A toolkit for deliberate design
            </span>
            <span {...stylex.props(s.edition)}>
              INDEPENDENT TOOLS. SHARED INTENT.
            </span>
          </div>
          <div {...stylex.props(s.heroBody)}>
            <div ref={hero} {...stylex.props(s.heroCopy)}>
              <h1 {...stylex.props(s.title)}>
                Good design
                <br />
                has a{' '}
                <span {...stylex.props(s.titleAccent)}>
                  point
                  <br />
                  of view.
                </span>
              </h1>
              <p {...stylex.props(s.heroDescription)}>
                Bring yours. A hands-on toolkit for typography, composition,
                color, motion and materials—made to work together.
              </p>
              <div {...stylex.props(s.heroActions)}>
                <a href="#explore" {...stylex.props(s.primary)}>
                  Explore the possibilities <Arrow />
                </a>
                <a href="#workflow" {...stylex.props(s.plainButton)}>
                  See how it works <span aria-hidden="true">↓</span>
                </a>
              </div>
            </div>
            <div {...stylex.props(s.heroArt)}>
              <div {...stylex.props(s.artCircle)} />
              <span {...stylex.props(s.artIndex)}>FIG. 01</span>
              <Surface
                id="hero"
                surface={heroSurface}
                normalScale={materialParameters.normalScale}
                normalStrength={materialParameters.normalStrength}
                accentSurface={profile.materialPair}
                onStatus={setHeroStatus}
                className={stylex.props(s.surface).className}
              />
              <div {...stylex.props(s.artCaption)}>
                <span>A study in form, light & movement</span>
                <span aria-hidden="true">↖ INTERACT</span>
              </div>
            </div>
          </div>
          <div {...stylex.props(s.heroBottom)}>
            <p {...stylex.props(s.caption)}>
              For the space between
              <br />
              <strong style={{ fontWeight: 400, color: 'var(--ink)' }}>
                “it works” and “it feels right.”
              </strong>
            </p>
            <div {...stylex.props(s.inlineMarks)}>
              <span>Editable by you</span>
              <span>Inspectable by agents</span>
              <span>Grounded in the real thing</span>
            </div>
          </div>
        </section>
        <section id="explore" {...stylex.props(s.section, s.shell)} data-reveal>
          <div id="brief" style={{ scrollMarginTop: 24 }} />
          <SectionHeading
            number="01"
            eyebrow="Begin with a brief"
            title={
              <>
                Your intent.
                <br />
                Not another template.
              </>
            }
          >
            There is no single right look. Change the direction below and watch
            the type, palette, material and movement respond together.
          </SectionHeading>
          <div {...stylex.props(s.profileRow)}>
            {profileList.map((p) => (
              <button
                key={p.id}
                {...stylex.props(
                  s.profileCard,
                  p.id === profileId && s.profileSelected,
                )}
                aria-pressed={p.id === profileId}
                onClick={() => choose(p.id)}
                data-profile-choice={p.id}
              >
                <div
                  {...stylex.props(s.profilePreview)}
                  style={{ background: p.soft, color: p.ink }}
                >
                  <span
                    {...stylex.props(s.previewType)}
                    style={{
                      fontFamily: p.display,
                      fontWeight: p.id === 'studio' ? 700 : 400,
                    }}
                  >
                    Aa
                  </span>
                  <div {...stylex.props(s.previewDots)}>
                    {[p.ink, p.accent, p.paper].map((color) => (
                      <i
                        key={color}
                        {...stylex.props(s.chip)}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </div>
                <span {...stylex.props(s.profileName)}>
                  {p.name}
                  <span aria-hidden="true">
                    {p.id === profileId ? '●' : '↗'}
                  </span>
                </span>
                <span {...stylex.props(s.caption)}>{p.note}</span>
              </button>
            ))}
          </div>
          <div {...stylex.props(s.editor)}>
            <label {...stylex.props(s.editorField)}>
              <span {...stylex.props(s.label)}>
                The brief{' '}
                <span {...stylex.props(s.controlValue)}>
                  Your words, your direction
                </span>
              </span>
              <textarea
                {...stylex.props(s.textarea)}
                aria-label="Design brief"
                value={brief}
                maxLength={600}
                onChange={(e) => setBrief(e.target.value)}
              />
            </label>
            <div {...stylex.props(s.editorAside)}>
              <button {...stylex.props(s.primary)} onClick={save}>
                Keep this direction <span aria-hidden="true">+</span>
              </button>
              <p {...stylex.props(s.statline)}>
                {words} words · {prose.facts[0].sentences} sentences
                <br />
                Text edits are saved with your selected profile.
              </p>
              <p {...stylex.props(s.statline)} role="status">
                {message || 'Try a direction. Then make it your own.'}
              </p>
            </div>
          </div>
        </section>
        <MotionDemo spring={motion} onChange={setMotion} />
        <Materials
          profile={profile}
          parameters={materialParameters}
          onChange={setMaterialParameters}
        />
        <CropDemo />
        <LayoutGallery />
        <Workflow
          profile={{ ...profile, motion }}
          saved={saved}
          onSave={save}
          onReplay={replay}
        />
        <section {...stylex.props(s.end, s.shell)}>
          <div {...stylex.props(s.endTop)}>
            <h2 {...stylex.props(s.endTitle)}>
              Make something
              <br />
              <span style={{ color: 'var(--accent)', fontStyle: 'italic' }}>
                worth feeling.
              </span>
            </h2>
            <div>
              <a href="#brief" {...stylex.props(s.primary)}>
                Start with your point of view <Arrow />
              </a>
              <p {...stylex.props(s.statline)}>
                Small tools. Connected decisions.
                <br />
                Room for your judgment.
              </p>
            </div>
          </div>
          <footer {...stylex.props(s.footer)}>
            <a href="#" {...stylex.props(s.brand)}>
              <Logo />
              Design Theory
            </a>
            <div {...stylex.props(s.footerLinks)}>
              <a href="#workflow" {...stylex.props(s.textLink)}>
                Workflow
              </a>
              <a href="about.html" {...stylex.props(s.textLink)}>
                About this demo
              </a>
              <a href="assets/spectral-OFL.txt" {...stylex.props(s.textLink)}>
                Font licenses
              </a>
            </div>
            <p {...stylex.props(s.caption)}>
              Original forms & illustration.
              <br />
              Built with React, StyleX, GSAP, Lenis & Three.js.
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<App />);
