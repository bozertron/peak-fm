/**
 * Admin and beta-operations tables.
 *
 * The dashboard exists because the product is about to be handed to beta
 * testers on a URL. Everything here is in service of that: who is in, what
 * they did, what broke, and what can be turned off without a deploy.
 */
import { pgTable, text, timestamp, boolean, integer, jsonb, index } from 'drizzle-orm/pg-core'
import { id, createdAt, updatedAt } from './_shared'
import { user } from './auth'

/**
 * Append-only record of privileged actions. Never updated, never deleted —
 * a moderator who removes a listing must leave a trace.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: id(),
    actorId: text('actorId').references(() => user.id, { onDelete: 'set null' }),
    /** Denormalised so the log survives the actor being deleted. */
    actorEmail: text('actorEmail'),

    action: text('action').notNull(),
    entityType: text('entityType').notNull(),
    entityId: text('entityId'),

    before: jsonb('before'),
    after: jsonb('after'),
    note: text('note'),

    ipAddress: text('ipAddress'),
    createdAt: createdAt(),
  },
  (t) => [
    index('admin_audit_actor_idx').on(t.actorId, t.createdAt),
    index('admin_audit_entity_idx').on(t.entityType, t.entityId),
  ],
)

/** Closed beta access. A code is single-use unless `maxRedemptions` says more. */
export const betaInvite = pgTable(
  'beta_invite',
  {
    id: id(),
    code: text('code').notNull().unique(),
    email: text('email'),
    note: text('note'),

    issuedById: text('issuedById').references(() => user.id, { onDelete: 'set null' }),
    maxRedemptions: integer('maxRedemptions').notNull().default(1),
    redemptionCount: integer('redemptionCount').notNull().default(0),

    redeemedById: text('redeemedById').references(() => user.id, { onDelete: 'set null' }),
    redeemedAt: timestamp('redeemedAt'),
    expiresAt: timestamp('expiresAt'),
    revokedAt: timestamp('revokedAt'),

    createdAt: createdAt(),
  },
  (t) => [index('beta_invite_email_idx').on(t.email)],
)

/**
 * Runtime kill switches. Beta testing without these means a deploy for every
 * bad surface, which is not a position to be in with real testers watching.
 */
export const featureFlag = pgTable(
  'feature_flag',
  {
    key: text('key').primaryKey(),
    description: text('description').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    /** { marketIds?: string[], userIds?: string[], percentage?: number } */
    rollout: jsonb('rollout').notNull().default({}),
    updatedById: text('updatedById').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
)

export const moderationReport = pgTable(
  'moderation_report',
  {
    id: id(),
    reporterId: text('reporterId').references(() => user.id, { onDelete: 'set null' }),

    /** 'listing' | 'message' | 'user' | 'plan' | 'find' | 'bulletin_post' */
    entityType: text('entityType').notNull(),
    entityId: text('entityId').notNull(),

    reason: text('reason').notNull(),
    detail: text('detail'),

    /** 'open' | 'reviewing' | 'actioned' | 'dismissed' */
    status: text('status').notNull().default('open'),
    resolvedById: text('resolvedById').references(() => user.id, { onDelete: 'set null' }),
    resolutionNote: text('resolutionNote'),
    resolvedAt: timestamp('resolvedAt'),

    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('moderation_status_idx').on(t.status, t.createdAt),
    index('moderation_entity_idx').on(t.entityType, t.entityId),
  ],
)

/**
 * Structured feedback from beta testers, raised in-app. Distinct from a
 * moderation report: this is about the product, not about another member.
 */
export const betaFeedback = pgTable(
  'beta_feedback',
  {
    id: id(),
    userId: text('userId').references(() => user.id, { onDelete: 'set null' }),
    surface: text('surface').notNull(),
    /** 'bug' | 'confusion' | 'idea' | 'praise' */
    kind: text('kind').notNull().default('bug'),
    body: text('body').notNull(),
    /** Route, viewport, user agent — captured automatically at submit time. */
    context: jsonb('context').notNull().default({}),
    status: text('status').notNull().default('new'),
    createdAt: createdAt(),
  },
  (t) => [index('beta_feedback_surface_idx').on(t.surface, t.status)],
)

export type AdminAuditLog = typeof adminAuditLog.$inferSelect
export type BetaInvite = typeof betaInvite.$inferSelect
export type FeatureFlag = typeof featureFlag.$inferSelect
