import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { roiModel, rentalAgreement, autopayContract } from '@/lib/db/schema'

/** An owner's ROI explorations, newest first. Kept until exported or deleted. */
export async function listRoiModels(ownerId: string, limit = 20) {
  return db
    .select()
    .from(roiModel)
    .where(eq(roiModel.ownerId, ownerId))
    .orderBy(desc(roiModel.updatedAt))
    .limit(limit)
}

/** Agreements where the user is the owner collecting rent. */
export async function listAgreementsAsOwner(ownerId: string, limit = 50) {
  return db
    .select()
    .from(rentalAgreement)
    .where(eq(rentalAgreement.ownerId, ownerId))
    .orderBy(desc(rentalAgreement.startAt))
    .limit(limit)
}

/** Agreements where the user is the renter paying. */
export async function listAgreementsAsRenter(renterId: string, limit = 50) {
  return db
    .select()
    .from(rentalAgreement)
    .where(eq(rentalAgreement.renterId, renterId))
    .orderBy(desc(rentalAgreement.startAt))
    .limit(limit)
}

/** Active auto-pay contracts for an agreement. */
export async function listAutopay(agreementId: string) {
  return db.select().from(autopayContract).where(eq(autopayContract.agreementId, agreementId))
}
