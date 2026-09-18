CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'member' NOT NULL,
	"avatarKind" text DEFAULT 'initials' NOT NULL,
	"avatarSeed" text,
	"marketId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parentId" text,
	"appliesTo" text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "market" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"country" text DEFAULT 'CA' NOT NULL,
	"centerLat" double precision NOT NULL,
	"centerLng" double precision NOT NULL,
	"radiusKm" integer DEFAULT 40 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "market_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"offeringType" text DEFAULT 'goods' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"sellerId" text NOT NULL,
	"marketId" text NOT NULL,
	"categoryId" text,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"priceCents" integer,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"pricingUnit" text,
	"bidAsSale" boolean DEFAULT false NOT NULL,
	"locationName" text,
	"lat" double precision,
	"lng" double precision,
	"viewCount" integer DEFAULT 0 NOT NULL,
	"saveCount" integer DEFAULT 0 NOT NULL,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_attribute" (
	"id" text PRIMARY KEY NOT NULL,
	"listingId" text NOT NULL,
	"key" text NOT NULL,
	"valueText" text,
	"valueNumber" double precision,
	"valueBool" boolean
);
--> statement-breakpoint
CREATE TABLE "listing_block" (
	"id" text PRIMARY KEY NOT NULL,
	"listingId" text NOT NULL,
	"blockedUserId" text NOT NULL,
	"reason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_media" (
	"id" text PRIMARY KEY NOT NULL,
	"listingId" text NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'image' NOT NULL,
	"alt" text,
	"position" integer DEFAULT 0 NOT NULL,
	"capturedInApp" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_booking" (
	"id" text PRIMARY KEY NOT NULL,
	"widgetId" text NOT NULL,
	"tierId" text,
	"customerId" text NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_pricing_tier" (
	"id" text PRIMARY KEY NOT NULL,
	"widgetId" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"priceCents" integer NOT NULL,
	"unit" text DEFAULT 'flat' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_widget" (
	"id" text PRIMARY KEY NOT NULL,
	"listingId" text NOT NULL,
	"headline" text NOT NULL,
	"overview" text NOT NULL,
	"bookingMode" text DEFAULT 'request' NOT NULL,
	"leadTimeHours" integer DEFAULT 24 NOT NULL,
	"serviceAreaKm" integer DEFAULT 25 NOT NULL,
	"generatedBy" text DEFAULT 'manual' NOT NULL,
	"generationLog" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "service_widget_listingId_unique" UNIQUE("listingId")
);
--> statement-breakpoint
CREATE TABLE "accounting_record" (
	"id" text PRIMARY KEY NOT NULL,
	"orderId" text NOT NULL,
	"perspective" text NOT NULL,
	"itemDescription" text NOT NULL,
	"itemPurpose" text,
	"costCents" integer NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"taxAllocations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accountFrom" text,
	"accountTo" text,
	"taxTreatment" text,
	"reliefNotes" text,
	"researchSources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text DEFAULT 'unsupported' NOT NULL,
	"generatedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_question" (
	"id" text PRIMARY KEY NOT NULL,
	"listingId" text NOT NULL,
	"buyerId" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answeredAt" timestamp,
	"threadId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"listingId" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"buyerId" text NOT NULL,
	"sellerId" text NOT NULL,
	"subtotalCents" integer NOT NULL,
	"taxCents" integer DEFAULT 0 NOT NULL,
	"feeCents" integer DEFAULT 0 NOT NULL,
	"totalCents" integer NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"threadId" text,
	"providerRef" text,
	"providerName" text,
	"placedAt" timestamp,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "order_line" (
	"id" text PRIMARY KEY NOT NULL,
	"orderId" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unitPriceCents" integer NOT NULL,
	"taxCents" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autopay_contract" (
	"id" text PRIMARY KEY NOT NULL,
	"agreementId" text NOT NULL,
	"cadence" text DEFAULT 'monthly' NOT NULL,
	"amountCents" integer NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp,
	"nextRunAt" timestamp,
	"ownerAcceptedAt" timestamp,
	"renterAcceptedAt" timestamp,
	"active" boolean DEFAULT false NOT NULL,
	"providerRef" text,
	"providerName" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rental_agreement" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"listingId" text NOT NULL,
	"ownerId" text NOT NULL,
	"renterId" text NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp,
	"rateCents" integer NOT NULL,
	"unit" text DEFAULT 'day' NOT NULL,
	"depositCents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"signedAt" timestamp,
	"endedAt" timestamp,
	"threadId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rental_agreement_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "roi_model" (
	"id" text PRIMARY KEY NOT NULL,
	"ownerId" text NOT NULL,
	"listingId" text,
	"assetName" text NOT NULL,
	"categoryId" text,
	"acquisitionCostCents" integer DEFAULT 0 NOT NULL,
	"annualMaintenanceCents" integer DEFAULT 0 NOT NULL,
	"annualCarryingCents" integer DEFAULT 0 NOT NULL,
	"targetRecoupMonths" integer DEFAULT 24 NOT NULL,
	"expectedUtilizationPct" integer DEFAULT 30 NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"demandEvidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggestedRateCents" integer,
	"suggestedUnit" text DEFAULT 'day' NOT NULL,
	"breakEvenMonths" integer,
	"scenarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exportedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"listingId" text NOT NULL,
	"offererId" text NOT NULL,
	"parentOfferId" text,
	"offerKind" text NOT NULL,
	"cashCents" integer,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"offeredListingId" text,
	"offeredDescription" text,
	"message" text,
	"status" text DEFAULT 'open' NOT NULL,
	"respondedAt" timestamp,
	"threadId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "find_match" (
	"id" text PRIMARY KEY NOT NULL,
	"findRequestId" text NOT NULL,
	"responderId" text NOT NULL,
	"matchKind" text NOT NULL,
	"matchRefId" text,
	"score" integer,
	"scoreBasis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"threadId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "find_request" (
	"id" text PRIMARY KEY NOT NULL,
	"seekerId" text NOT NULL,
	"marketId" text NOT NULL,
	"categoryId" text,
	"title" text NOT NULL,
	"details" text,
	"budgetMinCents" integer,
	"budgetMaxCents" integer,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"originSurface" text NOT NULL,
	"originEntityType" text,
	"originEntityId" text,
	"originMetadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"satisfiedAt" timestamp,
	"satisfiedNote" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"userId" text NOT NULL,
	"body" text NOT NULL,
	"stance" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_item" (
	"id" text PRIMARY KEY NOT NULL,
	"marketId" text NOT NULL,
	"kind" text NOT NULL,
	"authorId" text,
	"sourceName" text,
	"sourceUrl" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"locationName" text,
	"startsAt" timestamp,
	"endsAt" timestamp,
	"feedbackOpen" boolean DEFAULT false NOT NULL,
	"feedbackClosesAt" timestamp,
	"status" text DEFAULT 'published' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"ownerId" text NOT NULL,
	"marketId" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"budgetCents" integer,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"startAt" timestamp,
	"endAt" timestamp,
	"visibility" text DEFAULT 'private' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"planId" text NOT NULL,
	"findRequestId" text,
	"providerId" text NOT NULL,
	"recipientId" text,
	"priceCents" integer NOT NULL,
	"currency" text DEFAULT 'CAD' NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guaranteeText" text,
	"validUntil" timestamp,
	"status" text DEFAULT 'sent' NOT NULL,
	"respondedAt" timestamp,
	"threadId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_step" (
	"id" text PRIMARY KEY NOT NULL,
	"planId" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"durationDays" integer,
	"costCents" integer,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "bulletin_post" (
	"id" text PRIMARY KEY NOT NULL,
	"marketId" text NOT NULL,
	"authorId" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text NOT NULL,
	"senderId" text,
	"kind" text DEFAULT 'text' NOT NULL,
	"body" text,
	"payload" jsonb,
	"editedAt" timestamp,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"messageId" text NOT NULL,
	"url" text NOT NULL,
	"contentType" text NOT NULL,
	"byteSize" integer,
	"fileName" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread" (
	"id" text PRIMARY KEY NOT NULL,
	"subjectType" text DEFAULT 'direct' NOT NULL,
	"subjectId" text,
	"marketId" text,
	"title" text,
	"lastMessageAt" timestamp,
	"lastMessagePreview" text,
	"messageCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thread_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"threadId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"lastReadAt" timestamp,
	"archivedAt" timestamp,
	"mutedAt" timestamp,
	"deletedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actorId" text,
	"actorEmail" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text,
	"before" jsonb,
	"after" jsonb,
	"note" text,
	"ipAddress" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beta_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"surface" text NOT NULL,
	"kind" text DEFAULT 'bug' NOT NULL,
	"body" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "beta_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"email" text,
	"note" text,
	"issuedById" text,
	"maxRedemptions" integer DEFAULT 1 NOT NULL,
	"redemptionCount" integer DEFAULT 0 NOT NULL,
	"redeemedById" text,
	"redeemedAt" timestamp,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "beta_invite_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"key" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updatedById" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_report" (
	"id" text PRIMARY KEY NOT NULL,
	"reporterId" text,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolvedById" text,
	"resolutionNote" text,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_marketId_market_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_categoryId_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_attribute" ADD CONSTRAINT "listing_attribute_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_block" ADD CONSTRAINT "listing_block_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_block" ADD CONSTRAINT "listing_block_blockedUserId_user_id_fk" FOREIGN KEY ("blockedUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_media" ADD CONSTRAINT "listing_media_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_booking" ADD CONSTRAINT "service_booking_widgetId_service_widget_id_fk" FOREIGN KEY ("widgetId") REFERENCES "public"."service_widget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_booking" ADD CONSTRAINT "service_booking_tierId_service_pricing_tier_id_fk" FOREIGN KEY ("tierId") REFERENCES "public"."service_pricing_tier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_booking" ADD CONSTRAINT "service_booking_customerId_user_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_pricing_tier" ADD CONSTRAINT "service_pricing_tier_widgetId_service_widget_id_fk" FOREIGN KEY ("widgetId") REFERENCES "public"."service_widget"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_widget" ADD CONSTRAINT "service_widget_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_record" ADD CONSTRAINT "accounting_record_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_question" ADD CONSTRAINT "buyer_question_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_question" ADD CONSTRAINT "buyer_question_buyerId_user_id_fk" FOREIGN KEY ("buyerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_buyerId_user_id_fk" FOREIGN KEY ("buyerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_sellerId_user_id_fk" FOREIGN KEY ("sellerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_orderId_order_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopay_contract" ADD CONSTRAINT "autopay_contract_agreementId_rental_agreement_id_fk" FOREIGN KEY ("agreementId") REFERENCES "public"."rental_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement" ADD CONSTRAINT "rental_agreement_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement" ADD CONSTRAINT "rental_agreement_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rental_agreement" ADD CONSTRAINT "rental_agreement_renterId_user_id_fk" FOREIGN KEY ("renterId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roi_model" ADD CONSTRAINT "roi_model_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roi_model" ADD CONSTRAINT "roi_model_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_listingId_listing_id_fk" FOREIGN KEY ("listingId") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_offererId_user_id_fk" FOREIGN KEY ("offererId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_offer" ADD CONSTRAINT "trade_offer_offeredListingId_listing_id_fk" FOREIGN KEY ("offeredListingId") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "find_match" ADD CONSTRAINT "find_match_findRequestId_find_request_id_fk" FOREIGN KEY ("findRequestId") REFERENCES "public"."find_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "find_match" ADD CONSTRAINT "find_match_responderId_user_id_fk" FOREIGN KEY ("responderId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "find_request" ADD CONSTRAINT "find_request_seekerId_user_id_fk" FOREIGN KEY ("seekerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "find_request" ADD CONSTRAINT "find_request_marketId_market_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "find_request" ADD CONSTRAINT "find_request_categoryId_category_id_fk" FOREIGN KEY ("categoryId") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_feedback" ADD CONSTRAINT "community_feedback_itemId_community_item_id_fk" FOREIGN KEY ("itemId") REFERENCES "public"."community_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_feedback" ADD CONSTRAINT "community_feedback_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_item" ADD CONSTRAINT "community_item_marketId_market_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_item" ADD CONSTRAINT "community_item_authorId_user_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_marketId_market_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_planId_plan_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_findRequestId_find_request_id_fk" FOREIGN KEY ("findRequestId") REFERENCES "public"."find_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_providerId_user_id_fk" FOREIGN KEY ("providerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposal" ADD CONSTRAINT "plan_proposal_recipientId_user_id_fk" FOREIGN KEY ("recipientId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_step" ADD CONSTRAINT "plan_step_planId_plan_id_fk" FOREIGN KEY ("planId") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_post" ADD CONSTRAINT "bulletin_post_marketId_market_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulletin_post" ADD CONSTRAINT "bulletin_post_authorId_user_id_fk" FOREIGN KEY ("authorId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_threadId_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_senderId_user_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_messageId_message_id_fk" FOREIGN KEY ("messageId") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread" ADD CONSTRAINT "thread_marketId_market_id_fk" FOREIGN KEY ("marketId") REFERENCES "public"."market"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participant" ADD CONSTRAINT "thread_participant_threadId_thread_id_fk" FOREIGN KEY ("threadId") REFERENCES "public"."thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_participant" ADD CONSTRAINT "thread_participant_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actorId_user_id_fk" FOREIGN KEY ("actorId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_feedback" ADD CONSTRAINT "beta_feedback_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invite" ADD CONSTRAINT "beta_invite_issuedById_user_id_fk" FOREIGN KEY ("issuedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invite" ADD CONSTRAINT "beta_invite_redeemedById_user_id_fk" FOREIGN KEY ("redeemedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_updatedById_user_id_fk" FOREIGN KEY ("updatedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_reporterId_user_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_report" ADD CONSTRAINT "moderation_report_resolvedById_user_id_fk" FOREIGN KEY ("resolvedById") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_market_idx" ON "user" USING btree ("marketId");--> statement-breakpoint
CREATE INDEX "user_role_idx" ON "user" USING btree ("role");--> statement-breakpoint
CREATE INDEX "category_parent_idx" ON "category" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "market_active_idx" ON "market" USING btree ("active");--> statement-breakpoint
CREATE INDEX "listing_browse_idx" ON "listing" USING btree ("marketId","kind","status");--> statement-breakpoint
CREATE INDEX "listing_seller_idx" ON "listing" USING btree ("sellerId");--> statement-breakpoint
CREATE INDEX "listing_category_idx" ON "listing" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "listing_published_idx" ON "listing" USING btree ("publishedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_attribute_unique" ON "listing_attribute" USING btree ("listingId","key");--> statement-breakpoint
CREATE INDEX "listing_attribute_filter_idx" ON "listing_attribute" USING btree ("key","valueText");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_block_unique" ON "listing_block" USING btree ("listingId","blockedUserId");--> statement-breakpoint
CREATE INDEX "listing_media_listing_idx" ON "listing_media" USING btree ("listingId","position");--> statement-breakpoint
CREATE INDEX "service_booking_widget_idx" ON "service_booking" USING btree ("widgetId","startAt");--> statement-breakpoint
CREATE INDEX "service_booking_customer_idx" ON "service_booking" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "service_pricing_tier_widget_idx" ON "service_pricing_tier" USING btree ("widgetId","position");--> statement-breakpoint
CREATE INDEX "accounting_record_order_idx" ON "accounting_record" USING btree ("orderId","perspective");--> statement-breakpoint
CREATE INDEX "buyer_question_listing_buyer_idx" ON "buyer_question" USING btree ("listingId","buyerId","position");--> statement-breakpoint
CREATE INDEX "order_buyer_idx" ON "order" USING btree ("buyerId","status");--> statement-breakpoint
CREATE INDEX "order_seller_idx" ON "order" USING btree ("sellerId","status");--> statement-breakpoint
CREATE INDEX "order_listing_idx" ON "order" USING btree ("listingId");--> statement-breakpoint
CREATE INDEX "order_line_order_idx" ON "order_line" USING btree ("orderId","position");--> statement-breakpoint
CREATE INDEX "autopay_agreement_idx" ON "autopay_contract" USING btree ("agreementId");--> statement-breakpoint
CREATE INDEX "autopay_next_run_idx" ON "autopay_contract" USING btree ("active","nextRunAt");--> statement-breakpoint
CREATE INDEX "rental_agreement_owner_idx" ON "rental_agreement" USING btree ("ownerId","status");--> statement-breakpoint
CREATE INDEX "rental_agreement_renter_idx" ON "rental_agreement" USING btree ("renterId","status");--> statement-breakpoint
CREATE INDEX "roi_model_owner_idx" ON "roi_model" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "roi_model_listing_idx" ON "roi_model" USING btree ("listingId");--> statement-breakpoint
CREATE INDEX "trade_offer_listing_idx" ON "trade_offer" USING btree ("listingId","status");--> statement-breakpoint
CREATE INDEX "trade_offer_offerer_idx" ON "trade_offer" USING btree ("offererId");--> statement-breakpoint
CREATE INDEX "trade_offer_parent_idx" ON "trade_offer" USING btree ("parentOfferId");--> statement-breakpoint
CREATE INDEX "find_match_request_idx" ON "find_match" USING btree ("findRequestId","status");--> statement-breakpoint
CREATE INDEX "find_match_responder_idx" ON "find_match" USING btree ("responderId","status");--> statement-breakpoint
CREATE INDEX "find_request_market_idx" ON "find_request" USING btree ("marketId","status");--> statement-breakpoint
CREATE INDEX "find_request_seeker_idx" ON "find_request" USING btree ("seekerId","status");--> statement-breakpoint
CREATE INDEX "find_request_category_idx" ON "find_request" USING btree ("categoryId","status");--> statement-breakpoint
CREATE INDEX "community_feedback_item_idx" ON "community_feedback" USING btree ("itemId");--> statement-breakpoint
CREATE INDEX "community_item_market_idx" ON "community_item" USING btree ("marketId","kind","status");--> statement-breakpoint
CREATE INDEX "community_item_starts_idx" ON "community_item" USING btree ("startsAt");--> statement-breakpoint
CREATE INDEX "plan_owner_idx" ON "plan" USING btree ("ownerId","scope","status");--> statement-breakpoint
CREATE INDEX "plan_market_idx" ON "plan" USING btree ("marketId","scope","visibility");--> statement-breakpoint
CREATE INDEX "plan_proposal_find_idx" ON "plan_proposal" USING btree ("findRequestId","status");--> statement-breakpoint
CREATE INDEX "plan_proposal_provider_idx" ON "plan_proposal" USING btree ("providerId","status");--> statement-breakpoint
CREATE INDEX "plan_proposal_recipient_idx" ON "plan_proposal" USING btree ("recipientId","status");--> statement-breakpoint
CREATE INDEX "plan_step_plan_idx" ON "plan_step" USING btree ("planId","position");--> statement-breakpoint
CREATE INDEX "bulletin_market_idx" ON "bulletin_post" USING btree ("marketId","status","createdAt");--> statement-breakpoint
CREATE INDEX "message_thread_idx" ON "message" USING btree ("threadId","createdAt");--> statement-breakpoint
CREATE INDEX "message_attachment_message_idx" ON "message_attachment" USING btree ("messageId");--> statement-breakpoint
CREATE INDEX "thread_subject_idx" ON "thread" USING btree ("subjectType","subjectId");--> statement-breakpoint
CREATE INDEX "thread_recent_idx" ON "thread" USING btree ("lastMessageAt");--> statement-breakpoint
CREATE UNIQUE INDEX "thread_participant_unique" ON "thread_participant" USING btree ("threadId","userId");--> statement-breakpoint
CREATE INDEX "thread_participant_inbox_idx" ON "thread_participant" USING btree ("userId","archivedAt","deletedAt");--> statement-breakpoint
CREATE INDEX "admin_audit_actor_idx" ON "admin_audit_log" USING btree ("actorId","createdAt");--> statement-breakpoint
CREATE INDEX "admin_audit_entity_idx" ON "admin_audit_log" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE INDEX "beta_feedback_surface_idx" ON "beta_feedback" USING btree ("surface","status");--> statement-breakpoint
CREATE INDEX "beta_invite_email_idx" ON "beta_invite" USING btree ("email");--> statement-breakpoint
CREATE INDEX "moderation_status_idx" ON "moderation_report" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "moderation_entity_idx" ON "moderation_report" USING btree ("entityType","entityId");