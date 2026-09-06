// ==============================================================================
// MR² LABS OUTREACH ENGINE — CONFLICT ENGINE & REGISTRY (v1.0.0)
// ==============================================================================

import { LeadConflict, ConflictSeverity } from '@/types/evidence';

export interface ConflictEvaluationResult {
  hasConflicts: boolean;
  hasBlockingConflicts: boolean; // Severity === 'HIGH'
  conflicts: LeadConflict[];
  penalty: number; // Penalty to apply to sendability score
  summary: string;
}

/**
 * Creates a normalized LeadConflict object.
 */
export function createConflict(
  leadId: string,
  conflictType: LeadConflict['conflict_type'],
  severity: ConflictSeverity,
  values: string[],
  sources: string[],
  notes?: string
): LeadConflict {
  return {
    lead_id: leadId,
    conflict_type: conflictType,
    severity,
    values,
    sources,
    resolved: false,
    resolution_notes: notes || null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Evaluates a list of accumulated conflicts and calculates sendability penalties.
 */
export function evaluateConflicts(conflicts: LeadConflict[]): ConflictEvaluationResult {
  if (!conflicts || conflicts.length === 0) {
    return {
      hasConflicts: false,
      hasBlockingConflicts: false,
      conflicts: [],
      penalty: 0,
      summary: 'No conflicts detected.',
    };
  }

  const unresolved = conflicts.filter((c) => !c.resolved);
  let totalPenalty = 0;
  let hasBlocking = false;
  const summaryParts: string[] = [];

  for (const c of unresolved) {
    if (c.severity === 'HIGH') {
      hasBlocking = true;
      totalPenalty += 40;
      summaryParts.push(`[HIGH] ${c.conflict_type}: ${c.values.join(' vs ')}`);
    } else if (c.severity === 'MEDIUM') {
      totalPenalty += 20;
      summaryParts.push(`[MEDIUM] ${c.conflict_type}: ${c.values.join(' vs ')}`);
    } else {
      totalPenalty += 5;
      summaryParts.push(`[LOW] ${c.conflict_type}`);
    }
  }

  return {
    hasConflicts: unresolved.length > 0,
    hasBlockingConflicts: hasBlocking,
    conflicts: unresolved,
    penalty: Math.min(60, totalPenalty),
    summary: summaryParts.join('; '),
  };
}
