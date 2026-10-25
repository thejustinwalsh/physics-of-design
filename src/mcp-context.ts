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
const missingSummary = (value: unknown) => {
  const entries = Array.isArray(value) ? value : [];
  return {
    missing: entries.slice(0, 16),
    missingCount: entries.length,
    omittedMissing: Math.max(0, entries.length - 16),
  };
};
export function summarizeResult(
  command: string,
  result: unknown,
  resultRef: string | null,
): { resultRef: string | null; summary: unknown; referenceScope: string } {
  const r = record(result);
  let summary: unknown = result;
  if (command === 'validation plan')
    summary = {
      identity: r.identity,
      designIdentity: record(r.plan).designIdentity,
      scenarios: rows(record(r.plan).scenarios).map((s) => s.id),
      phases: rows(record(r.plan).phases).map((p) => ({
        id: p.id,
        requirements: rows(p.requirements).length,
      })),
      scope: r.scope,
    };
  else if (command === 'validation check')
    summary = {
      planIdentity: r.planIdentity,
      designIdentity: r.designIdentity,
      state: r.state,
      complete: r.complete,
      phases: rows(r.phases).map((p) => ({
        id: p.id,
        ready: p.ready,
        requirements: rows(p.requirements).length,
      })),
      outstandingCount: rows(r.next).length,
      next: rows(r.next)
        .slice(0, 12)
        .map((x) => ({
          id: x.id,
          scenario: x.scenario,
          tool: x.tool,
          status: x.status,
          resultRef: x.resultRef,
        })),
      recordedUnsupported: rows(r.recordedUnsupported).map((x) => x.id),
      neuralCalls: r.neuralCalls,
      scope: r.scope,
    };
  else if (command === 'material candidates')
    summary = {
      paretoIds: r.paretoIds,
      selectedIds: r.selectedIds,
      unresolvedIds: r.unresolvedIds,
      dominatedIds: r.dominatedIds,
      candidateCount: rows(r.candidates).length,
      candidates: rows(r.candidates)
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          residuals: rows(c.residuals).map((x) => ({
            metric: x.metric,
            value: x.value,
            residual: x.residual,
          })),
          comparisonStatus: c.comparisonStatus,
        })),
      selection: r.selection,
      empiricalPreference: r.empiricalPreference,
    };
  else if (command === 'material pair')
    summary = {
      pair: r.pair,
      descriptors: Object.fromEntries(
        Object.entries(record(r.descriptors)).map(([id, v]) => [
          id,
          { value: record(v).value, units: record(v).units },
        ]),
      ),
      physicalModelChecks: r.physicalModelChecks,
      brief: r.brief
        ? {
            id: record(r.brief).id,
            status: record(r.brief).status,
            bands: rows(record(r.brief).bands).map((b) => ({
              metric: b.metric,
              value: b.value,
              min: b.min,
              max: b.max,
              status: b.status,
            })),
          }
        : null,
      textOverlayLegibility: r.textOverlayLegibility,
      empiricalPreference: r.empiricalPreference,
      limits: r.limits,
    };
  else if (command === 'wireframe inspect')
    summary = {
      id: record(r.wireframe).id,
      screen: record(r.wireframe).screen,
      variables: record(r.wireframe).variables,
      nodes: rows(r.nodes).length,
      relations: rows(r.relations).length,
      issues: rows(r.relations)
        .filter(
          (x) => x.status === 'unknown' || x.status === 'outside-authored-band',
        )
        .slice(0, 12),
      scope: r.scope,
    };
  else if (command === 'decision run')
    summary = {
      state: r.state,
      status: r.status,
      nextStage: r.nextStage,
      order: r.order,
      statistics: r.statistics,
      stages: Object.fromEntries(
        Object.entries(record(r.stages)).map(([id, v]) => {
          const s = record(v);
          return [
            id,
            {
              status: s.status,
              assignment: s.assignment,
              reason: s.reason,
              alternatives: rows(s.alternatives).length,
              rendererVerification: s.rendererVerification,
            },
          ];
        }),
      ),
      recipe: resultRef ? { $designRef: resultRef, pointer: '/recipe' } : null,
      scope: r.scope,
    };
  else if (command === 'motion dynamics')
    summary = {
      initial: r.initial,
      final: r.final,
      balanceResidual: r.balanceResidual,
      sampleCount: rows(r.samples).length,
      provenance: r.provenance,
    };
  else if (command === 'motion timeline')
    summary = {
      min: r.min,
      max: r.max,
      durationSeconds: r.durationSeconds,
      sampleCount: Array.isArray(r.values) ? r.values.length : 0,
      provenance: r.provenance,
    };
  else if (command === 'surface textures')
    summary = {
      width: r.width,
      height: r.height,
      parameters: r.parameters,
      encoding: r.encoding,
      algorithm: r.algorithm,
      roughnessMapSemantics: r.roughnessMapSemantics,
      orientation: r.orientation,
      note: 'Texture bytes remain in the exact result reference; request only the needed channel.',
    };
  else if (command === 'prose analyze')
    summary = {
      purpose: r.purpose,
      sections: rows(r.facts).length,
      warningCount: rows(r.warnings).length,
      warnings: rows(r.warnings).slice(0, 12),
      journeys: rows(r.journeys).map((j) => ({
        id: j.id,
        reachable: j.reachable,
        clicks: j.clicks,
        estimatedSeconds: j.estimatedSeconds,
      })),
      aggregate: r.aggregate,
      limits: r.limits,
    };
  else if (command === 'media analyze')
    summary = {
      file: r.file,
      sha256: r.sha256,
      width: r.width,
      height: r.height,
      decoder: r.decoder,
      provenance: r.provenance,
      sampledDescriptors: r.sampledDescriptors,
      contrastRegions: r.contrastRegions,
      contrastScope: r.contrastScope,
    };
  else if (command === 'media crops')
    summary = {
      candidates: rows(r.candidates).map((c) => ({
        id: c.id,
        visibleSource: c.visibleSource,
        penalties: c.penalties,
        weightedPenalty: c.weightedPenalty,
      })),
      weights: r.weights,
      scope: r.scope,
    };
  else if (command === 'component inspect')
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
  else if (command === 'energy analyze')
    summary = {
      programIdentity: r.programIdentity,
      baseline: {
        energy: record(r.baseline).energy,
        status: record(r.baseline).status,
      },
      effects: rows(r.effects).map((e) => ({
        variable: e.variable,
        unit: e.unit,
        locked: e.locked,
        negativeEnergySlope: e.negativeEnergySlope,
      })),
      scope: r.scope,
    };
  else if (command === 'palette analyze')
    summary = {
      summary: r.summary,
      measurementRef: r.measurementRef,
      checks: rows(r.checks).map((c) => ({
        id: c.id,
        status: c.status,
        ratio: c.ratio,
        required: c.required,
      })),
      capabilities: r.capabilities,
    };
  else if (command.startsWith('motion '))
    summary = {
      supported: r.supported,
      reason: r.reason,
      plan: r.plan
        ? { kind: record(r.plan).kind, config: record(r.plan).config }
        : null,
      metrics: r.metrics ?? record(r.analysis).metrics,
      constraints: r.constraints ?? record(r.analysis).constraints,
      candidates: rows(r.candidates).map((c) => ({
        id: c.id,
        spring: c.spring ?? record(c.motion).spring,
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
  else if (command === 'font inspect')
    summary = {
      ...r,
      glyphCoverage: {
        ...record(r.glyphCoverage),
        ...missingSummary(record(r.glyphCoverage).missing),
      },
    };
  else if (command === 'typography inspect')
    summary = {
      inputHash: r.inputHash,
      targetPlatform: r.targetPlatform,
      resolution: r.resolution,
      font: { sha256: record(r.font).sha256, family: record(r.font).family },
      axes: r.axes,
      metrics: r.metrics,
      referenceGlyphs: r.referenceGlyphs,
      shaping: {
        advance: record(r.shaping).advance,
        outlineBounds: record(r.shaping).outlineBounds,
        kerning: record(r.shaping).kerning,
        tracking: record(r.shaping).tracking,
        glyphCount: record(r.shaping).glyphCount,
        ...missingSummary(record(r.shaping).missing),
      },
      renderer: r.renderer
        ? {
            runtime: record(r.renderer).runtime,
            box: record(r.renderer).box,
            totalLines: record(r.renderer).totalLines,
            omittedLines: record(r.renderer).omittedLines,
            baselines: rows(record(r.renderer).lines)
              .slice(0, 8)
              .map((l) => ({
                start: l.start,
                end: l.end,
                baseline: l.baseline,
                source: l.baselineSource,
              })),
            summarizedLines: Math.min(8, rows(record(r.renderer).lines).length),
            layoutOverflow: record(r.renderer).layoutOverflow,
            fontLoading: record(r.renderer).fontLoading,
            lineGrouping: record(r.renderer).lineGrouping,
            probeBudget: record(r.renderer).probeBudget,
          }
        : null,
      coverage: {
        ...record(r.coverage),
        ...missingSummary(record(r.coverage).missing),
      },
      limits: r.limits,
    };
  else if (command === 'typography axes')
    summary = {
      fontHash: r.fontHash,
      targetPlatform: r.targetPlatform,
      resolution: r.resolution,
      axes: r.axes,
      totalCandidates: r.totalCandidates,
      omittedCandidates: r.omittedCandidates,
      resultCount: rows(r.results).length,
      summarizedResults: Math.min(8, rows(r.results).length),
      results: rows(r.results)
        .slice(0, 8)
        .map((c) => ({
          id: c.id,
          axis: c.axis,
          point: c.point,
          value: c.value,
          advance: c.advance,
          effect: c.effect,
          renderer: c.renderer
            ? {
                runtime: record(c.renderer).runtime,
                totalLines: record(c.renderer).totalLines,
                box: record(c.renderer).box,
              }
            : null,
        })),
      method: r.method,
      limits: r.limits,
    };
  else if (command === 'text shape')
    summary = {
      ...Object.fromEntries(
        Object.entries(r).filter(
          ([key]) =>
            !['measurement', 'glyphs', 'lineBreaks', 'missing'].includes(key),
        ),
      ),
      ...missingSummary(r.missing),
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
