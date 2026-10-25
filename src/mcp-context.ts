/** Bounded session references avoid repeating content and renderer receipts in model context. */
export class ResultStore {
  private results = new Map<string, { value: unknown; bytes: number }>();
  private bytes = 0;
  private sequence = 0;
  constructor(
    private maxBytes = 16 * 1024 * 1024,
    private maxEntries = 32,
  ) {}
  put(value: unknown): string | null {
    const serialized = JSON.stringify(value),
      bytes = Buffer.byteLength(serialized);
    if (bytes > this.maxBytes) return null;
    while (
      this.results.size &&
      (this.bytes + bytes > this.maxBytes ||
        this.results.size >= this.maxEntries)
    ) {
      const key = this.results.keys().next().value!;
      this.bytes -= this.results.get(key)!.bytes;
      this.results.delete(key);
    }
    const id = `pod:${++this.sequence}`;
    this.results.set(id, { value: JSON.parse(serialized), bytes });
    this.bytes += bytes;
    return id;
  }
  resolve(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.resolve(item));
    if (!value || typeof value !== 'object') return value;
    const object = value as Record<string, unknown>;
    if (Object.hasOwn(object, '$designRef')) {
      if (
        Object.keys(object).some(
          (key) => !['$designRef', 'pointer'].includes(key),
        )
      )
        throw new Error(
          'A result reference contains only $designRef and pointer',
        );
      const entry = this.results.get(String(object.$designRef));
      if (!entry)
        throw new Error(
          'Unknown or evicted session result; execute again or supply explicit JSON',
        );
      const pointer = object.pointer ?? '';
      if (
        typeof pointer !== 'string' ||
        (pointer !== '' && !pointer.startsWith('/')) ||
        /~(?![01])/u.test(pointer)
      )
        throw new Error('Result pointer must be an RFC 6901 JSON pointer');
      let selected = entry.value;
      if (pointer !== '')
        for (const part of pointer.slice(1).split('/')) {
          const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
          if (
            !selected ||
            typeof selected !== 'object' ||
            !Object.hasOwn(selected, key)
          )
            throw new Error(`Result pointer does not exist: ${pointer}`);
          selected = (selected as Record<string, unknown>)[key];
        }
      return structuredClone(selected);
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [key, this.resolve(item)]),
    );
  }
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.map(record) : [];
export function summarizeResult(
  command: string,
  result: unknown,
  resultRef: string | null,
): { resultRef: string | null; summary: unknown; referenceScope: string } {
  const r = record(result);
  let summary: unknown = result;
  if (command === 'component inspect')
    summary = {
      contract: r.contract,
      scope:
        'Full SVG/HTML is available by result reference and optional MCP App.',
    };
  else if (command === 'motion proof')
    summary = {
      metrics: record(r.analysis).metrics,
      constraints: record(r.analysis).constraints,
      scope:
        'Analytic samples and interactive proof are available by result reference and optional MCP App.',
    };
  else if (['energy search', 'composition solve'].includes(command))
    summary = {
      status: r.status,
      statistics: r.statistics,
      selected: r.selected,
      handoff:
        r.handoff && resultRef
          ? { $designRef: resultRef, pointer: '/handoff' }
          : null,
      candidates: rows(r.candidates).map((c) => ({
        id: c.id,
        assignment: c.assignment,
        energy: c.energy,
        status: c.status,
      })),
      scope: r.scope,
    };
  else if (command === 'decision handoff')
    summary = {
      identity: r.identity,
      decisions: r.decisions,
      verification: r.verification,
      scope: r.scope,
    };
  else if(command==='energy analyze') summary={programIdentity:r.programIdentity,baseline:{energy:record(r.baseline).energy,status:record(r.baseline).status},effects:rows(r.effects).map(e=>({variable:e.variable,unit:e.unit,locked:e.locked,negativeEnergySlope:e.negativeEnergySlope})),scope:r.scope};
  else if(command==='palette analyze') summary={summary:r.summary,measurementRef:r.measurementRef,checks:rows(r.checks).map(c=>({id:c.id,status:c.status,ratio:c.ratio,required:c.required})),capabilities:r.capabilities};
  else if (command.startsWith('motion '))
    summary = {
      supported: r.supported,
      reason:r.reason,
      plan:r.plan?{kind:record(r.plan).kind,config:record(r.plan).config}:null,
      metrics: r.metrics??record(r.analysis).metrics,
      constraints: r.constraints??record(r.analysis).constraints,
      candidates: rows(r.candidates).map((c) => ({
        id: c.id,
        spring: c.spring??record(c.motion).spring,
        factors: c.factors,
      })),
      scope: r.scope,
    };
  else if (command === 'palette candidates')
    summary = {
      statistics: r.statistics,
      candidates: rows(r.candidates).map((c) => ({
        id: c.id,
        system: c.system,
        objective: c.objective,
        measurementRef: c.measurementRef,
      })),
      capabilities: r.capabilities,
    };
  else if (command === 'training export')
    summary = {
      counts: r.counts,
      excluded: r.excluded,
      limits: r.limits,
      manifestHash: r.manifestHash,
      note: 'Full labeled examples are retained by session reference; CLI emits complete JSON.',
    };
  else if (command === 'color candidates')
    summary = {
      attempted: r.attempted,
      rejected: r.rejected,
      exhausted: r.exhausted,
      invariantFailedRoles: r.invariantFailedRoles,
      candidates: rows(r.candidates).map((candidate, index) => ({
        id: candidate.id,
        tokens: record(candidate.system).tokens,
        changes: candidate.changes,
        system: resultRef
          ? { $designRef: resultRef, pointer: `/candidates/${index}/system` }
          : null,
        hardConstraintsPass: record(candidate.analysis).hardConstraintsPass,
        factors: record(candidate.analysis).factors,
      })),
      provenance: r.provenance,
      notes: r.notes,
    };
  else if (command === 'composition analyze')
    summary = {
      whitespace: r.whitespace,
      balance: r.balance,
      hierarchy: r.hierarchy,
      readingOrder: r.readingOrder,
      alignment: {
        tolerance: record(r.alignment).tolerance,
        pairs: rows(record(r.alignment).pairs).length,
      },
      overlap: { pairs: rows(record(r.overlap).pairs).length },
      provenance: r.provenance,
      limitations: r.limitations,
      note: 'Full pairwise geometry is available by result reference or response:full.',
    };
  else if (command === 'system relax')
    summary = {
      viableIds: r.viableIds,
      paretoIds: r.paretoIds,
      rejectedProposals: r.rejectedProposals,
      candidates: rows(r.candidates).map((c, index) => ({
        id: c.id,
        viable: c.viable,
        pareto: c.pareto,
        changes: c.changes,
        state: resultRef
          ? { $designRef: resultRef, pointer: `/candidates/${index}/state` }
          : null,
        variables: rows(record(c.state).blocks).map((b) => ({
          id: b.id,
          font: record(b.font).family,
          size: b.size,
          weight: b.weight,
          trackingEm: b.trackingEm,
          leading: b.leading,
          measure: b.measure,
        })),
        gaps: record(c.state).gaps,
        issues: record(c.measurement).issues,
        stress: {
          scenarios: rows(c.responsive).length,
          failures: rows(c.responsive)
            .filter((m) => !m.feasible)
            .map((m) => m.issues),
        },
      })),
      selection: r.selection,
      search: r.search,
      caveat: r.caveat,
    };
  else if (command === 'layout measure')
    summary = {
      feasible: r.feasible,
      inputHash: r.inputHash,
      engine: r.engine,
      runtime: r.runtime,
      issues: r.issues,
      textSpacing: r.textSpacing,
      blocks: rows(r.blocks).map((b) => ({
        id: b.id,
        box: b.box,
        lineCount: rows(b.lines).length,
        lineEnds: rows(b.lines).map((l) => l.end),
        thresholds: b.thresholds,
      })),
      scope: r.scope,
    };
  else if (command === 'relations score')
    summary = {
      ...r,
      factors: rows(r.factors).map((f) => ({
        id: f.id,
        kind: f.kind,
        value: f.value,
        compatibility: f.compatibility,
        source: f.source,
        uncertainty: f.uncertainty,
        alternatives: f.alternatives,
      })),
    };
  else if (command === 'text shape')
    summary = {
      ...Object.fromEntries(
        Object.entries(r).filter(
          ([key]) => !['measurement', 'glyphs', 'lineBreaks'].includes(key),
        ),
      ),
      lineEnds: rows(r.lineBreaks).map((l) => l.end),
      measurement: summarizeResult('layout measure', r.measurement, null)
        .summary,
    };
  else if (command === 'emit')
    summary = {
      unsupported: r.unsupported,
      caveats: r.caveats,
      note: 'Full emitted source/mapping is available with response:full or the CLI.',
    };
  else if (command === 'proof')
    summary = {
      files: r.files ?? null,
      measured: false,
      preview: 'Available in MCP App; edit and remeasure before selection.',
    };
  else if (command === 'corpus analyze')
    summary = {
      observations: Array.isArray(r.observations)
        ? r.observations.length
        : undefined,
      summary: r.summary,
      issues: r.issues,
      note: 'Use response:full or a result reference for extracted observations.',
    };
  return {
    resultRef,
    summary,
    referenceScope:
      'This MCP session; bounded cache may evict older results. response:full returns complete JSON.',
  };
}
