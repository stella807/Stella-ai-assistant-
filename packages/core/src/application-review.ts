/**
 * The review pipeline every job application moves through, whatever the job.
 *
 * Extracted here because driver applications and staff applications are
 * genuinely different shapes — one has a vehicle and a licence, the other has
 * availability and a paragraph about experience — but the rules for moving
 * one through review are not different at all, and should not be able to
 * drift. In particular: **nothing goes from submitted straight to approved.**
 * That rule protects the people this company sends to strangers' homes, and a
 * second copy of it is a second chance to get it wrong.
 *
 * Deliberately about status only. It takes and returns an
 * `ApplicationStatus`, never an application, so neither application type has
 * to be widened or faked to reuse it.
 */

export type ApplicationStatus = "submitted" | "under-review" | "approved" | "rejected" | "withdrawn";

/**
 * `submitted` and `under-review` are open; `approved`, `rejected` and
 * `withdrawn` are terminal from the applicant's side, but an admin can
 * deliberately reopen a decided application to `under-review` — people
 * appeal, and paperwork gets fixed.
 */
const REVIEWABLE_FROM: ApplicationStatus[] = ["submitted", "under-review", "approved", "rejected"];

/** Validates a review transition and returns the status to store. */
export function nextReviewStatus(
  current: ApplicationStatus,
  next: Exclude<ApplicationStatus, "withdrawn">,
): Exclude<ApplicationStatus, "withdrawn"> {
  if (current === "withdrawn") throw new Error("This application was withdrawn by the applicant.");
  if (!REVIEWABLE_FROM.includes(current)) throw new Error(`Cannot review from status ${current}.`);
  if (next === "approved" && current === "submitted") {
    throw new Error("Move to under-review before approving — nothing should be approved sight-unseen.");
  }
  return next;
}

/** Withdrawal is the applicant's own call, and works from any non-terminal
 *  state. Throws if there is nothing left to withdraw. */
export function assertWithdrawable(current: ApplicationStatus): void {
  if (current === "approved" || current === "rejected" || current === "withdrawn") {
    throw new Error(`Cannot withdraw an application that is already ${current}.`);
  }
}
