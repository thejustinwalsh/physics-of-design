// Refresh only the raw-evaluator comparison after the unchanged main run ends.
// Never starts a browser or changes a navigation observation or frozen page.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const [trialArgument] = process.argv.slice(2);
if (!trialArgument) throw new Error('Usage: node research/marketing-study/validation/refresh-navigation-comparison.mjs TRIAL_DIR');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = path.join(path.resolve(trialArgument), 'evaluation');
const reportPath = path.join(output, 'navigation-adjudication.json');
const originalBytes = await fs.readFile(reportPath);
const report = JSON.parse(originalBytes);
const rawBytes = await fs.readFile(path.join(output, 'report.json'));
const raw = JSON.parse(rawBytes);
if (!raw.completedAt) throw new Error('Main evaluator still running; original comparison remains incomplete. Retry after completedAt exists.');
try { await fs.writeFile(path.join(output, 'navigation-adjudication.initial.json'), originalBytes, { flag: 'wx' }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
const snapshot = {
  phase: 'completed main evaluator comparison refresh', readAt: new Date().toISOString(),
  sha256: hash(rawBytes), completedAt: raw.completedAt,
  runs: raw.arms.flatMap(arm => arm.runs.map(run => ({ id: arm.id, engine: run.engine, viewport: run.viewport, hardFailures: run.hardFailures, anchors: run.anchors, anchorConcepts: run.anchorConcepts, executionError: run.executionError }))),
};
report.originalRawSnapshots.push(snapshot);
let recovered = 0, missingRaw = 0;
for (const run of report.runs) {
  const original = snapshot.runs.find(candidate => candidate.id === run.id && candidate.engine === run.engine && candidate.viewport.width === run.viewport.width && candidate.viewport.height === run.viewport.height);
  run.originalRaw = original || { unavailable: 'Matching original run absent from completed report' };
  if (!original) missingRaw++;
  for (const [concept, observation] of Object.entries(run.concepts)) {
    observation.originalFailure = original?.hardFailures?.filter(failure => failure.includes(`anchor for ${concept}`)) || [];
    if (observation.executionError) observation.adjudication = 'Unverified supplementary execution error';
    else if (observation.status !== 'working') observation.adjudication = 'Actual missing or unusable existing same-page link remains a failure';
    else if (!original) observation.adjudication = 'Supplementary working observation; original comparison unverified because matching raw run is absent';
    else if (observation.originalFailure.length) {
      recovered++;
      const label = observation.workingLink?.label || '';
      const originalRegex = concept === 'features' ? /feature|capabilit|what.*(?:get|do|build)/i : concept === 'getStarted' ? /get\s*started|start|begin|try|join|sign\s*up/i : /how\s+(?:it\s+)?works|workflow|process/i;
      const causes = [];
      if (observation.menuToggle) causes.push('closed menu discovery');
      if (!originalRegex.test(label)) causes.push('equivalent label classification');
      if (observation.attempts.some(attempt => attempt.status === 'working' && attempt.at650ms && !attempt.at650ms.inViewport)) causes.push('target timing');
      observation.adjudication = `Supplementary working observation; raw failure retained; possible harness differences: ${causes.join(', ') || 'not isolated'}`;
    } else observation.adjudication = 'Supplementary working observation; no matching original anchor failure in completed raw run';
  }
}
const refresh = {
  at: new Date().toISOString(), previousReportSHA256: hash(originalBytes), rawReportSHA256: hash(rawBytes),
  comparisonCodeSHA256: hash(await fs.readFile(fileURLToPath(import.meta.url))),
  rawRunCount: snapshot.runs.length, missingRawRuns: missingRaw, rawFailureRecoveries: recovered,
  scope: 'Comparison metadata only. Original navigation code hash, observations, target samples, screenshots and public-source hashes unchanged. First report preserved as navigation-adjudication.initial.json.',
};
(report.comparisonRefreshes ||= []).push(refresh);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(refresh, null, 2));
