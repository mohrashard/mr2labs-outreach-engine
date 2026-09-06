// ==============================================================================
// MR² LABS OUTREACH ENGINE — SENDABILITY GATE & SCORING COMPOSER (v1.0.0)
// ==============================================================================

import { EmailVerificationResult } from './email-quality';
import { BusinessIdentityResult } from './business-identity';
import { OpportunityResult } from '../opportunity/engine';
import { ConflictEvaluationResult } from './conflicts';
import { LeadStatus } from '@/types/lead';

export interface SendabilityInput {
  emailResult: EmailVerificationResult;
  identityResult: BusinessIdentityResult;
  opportunityResult: OpportunityResult;
  conflictResult: ConflictEvaluationResult;
}

export interface SendabilityDecision {
  status: LeadStatus;
  sendabilityScore: number;
  hardBlockers: string[];
  scoreBreakdown: {
    deliverabilityScore: number;
    targetingScore: number;
    identityScore: number;
    opportunityScore: number;
    conflictPenalty: number;
  };
  isReadyForDraft: boolean;
  requiresReview: boolean;
  decisionReason: string;
}

/**
 * Calculates the composite sendability score and evaluates hard blockers.
 * A weighted score NEVER overrides a hard blocker.
 */
export function calculateSendability(input: SendabilityInput): SendabilityDecision {
  const { emailResult, identityResult, opportunityResult, conflictResult } = input;
  const hardBlockers: string[] = [];

  // --------------------------------------------------------------------------
  // 1. Hard Blockers Evaluation (Immediate Ineligibility)
  // --------------------------------------------------------------------------
  if (emailResult.isPlaceholder) {
    hardBlockers.push('HARD_BLOCKER: PLACEHOLDER_EMAIL');
  }

  if (!emailResult.syntaxValid) {
    hardBlockers.push('HARD_BLOCKER: INVALID_EMAIL_SYNTAX');
  }

  if (identityResult.companyNameConfidence < 35) {
    hardBlockers.push('HARD_BLOCKER: UNKNOWN_OR_BOILERPLATE_COMPANY_NAME');
  }

  // --------------------------------------------------------------------------
  // 2. Weighted Score Composition (0 - 100)
  // --------------------------------------------------------------------------
  // Deliverability (30%): Technical validity and MX deliverability
  // Targeting (25%): Quality of the recipient local-part / role
  // Identity (25%): Company name, location match, verified phone
  // Opportunity (20%): Strategic pain point clarity
  const deliverabilityWeight = 0.30;
  const targetingWeight = 0.25;
  const identityWeight = 0.25;
  const opportunityWeight = 0.20;

  const rawComposite = (
    emailResult.deliverabilityScore * deliverabilityWeight +
    emailResult.targetingScore * targetingWeight +
    identityResult.identityScore * identityWeight +
    opportunityResult.opportunityScore * opportunityWeight
  );

  // Apply Conflict Penalties (up to -60 points)
  const finalScore = Math.max(0, Math.min(100, Math.round(rawComposite - conflictResult.penalty)));

  // --------------------------------------------------------------------------
  // 3. Routing & Decision Tiers
  // --------------------------------------------------------------------------
  // Hard blockers (placeholders, syntax corruption) always reject immediately
  if (hardBlockers.length > 0) {
    return {
      status: 'REJECTED',
      sendabilityScore: finalScore,
      hardBlockers,
      scoreBreakdown: {
        deliverabilityScore: emailResult.deliverabilityScore,
        targetingScore: emailResult.targetingScore,
        identityScore: identityResult.identityScore,
        opportunityScore: opportunityResult.opportunityScore,
        conflictPenalty: conflictResult.penalty,
      },
      isReadyForDraft: false,
      requiresReview: false,
      decisionReason: `Rejected due to hard blockers: ${hardBlockers.join(', ')}`,
    };
  }

  // If there are unresolved conflicts or location mismatch: route to human QA (NEEDS_REVIEW)
  if (conflictResult.hasBlockingConflicts || identityResult.locationStatus === 'LOCATION_MISMATCH') {
    return {
      status: 'NEEDS_REVIEW',
      sendabilityScore: finalScore,
      hardBlockers: [],
      scoreBreakdown: {
        deliverabilityScore: emailResult.deliverabilityScore,
        targetingScore: emailResult.targetingScore,
        identityScore: identityResult.identityScore,
        opportunityScore: opportunityResult.opportunityScore,
        conflictPenalty: conflictResult.penalty,
      },
      isReadyForDraft: false,
      requiresReview: true,
      decisionReason: `Held for QA due to conflict: ${conflictResult.summary || 'Location mismatch detected'}`,
    };
  }

  // Low score without conflicts (< 50)
  if (finalScore < 50) {
    return {
      status: 'REJECTED',
      sendabilityScore: finalScore,
      hardBlockers: [],
      scoreBreakdown: {
        deliverabilityScore: emailResult.deliverabilityScore,
        targetingScore: emailResult.targetingScore,
        identityScore: identityResult.identityScore,
        opportunityScore: opportunityResult.opportunityScore,
        conflictPenalty: conflictResult.penalty,
      },
      isReadyForDraft: false,
      requiresReview: false,
      decisionReason: `Rejected due to low composite score (${finalScore}/100)`,
    };
  }

  // Moderate score (50 - 84): Needs Review
  if (finalScore < 85) {
    return {
      status: 'NEEDS_REVIEW',
      sendabilityScore: finalScore,
      hardBlockers: [],
      scoreBreakdown: {
        deliverabilityScore: emailResult.deliverabilityScore,
        targetingScore: emailResult.targetingScore,
        identityScore: identityResult.identityScore,
        opportunityScore: opportunityResult.opportunityScore,
        conflictPenalty: conflictResult.penalty,
      },
      isReadyForDraft: false,
      requiresReview: true,
      decisionReason: `Held for QA: Score (${finalScore}/100) within review threshold (50-84)`,
    };
  }

  // Clean, high-confidence lead
  return {
    status: 'READY_TO_DRAFT',
    sendabilityScore: finalScore,
    hardBlockers: [],
    scoreBreakdown: {
      deliverabilityScore: emailResult.deliverabilityScore,
      targetingScore: emailResult.targetingScore,
      identityScore: identityResult.identityScore,
      opportunityScore: opportunityResult.opportunityScore,
      conflictPenalty: conflictResult.penalty,
    },
    isReadyForDraft: true,
    requiresReview: false,
    decisionReason: `Approved for AI Drafting: High confidence composite score (${finalScore}/100)`,
  };
}
