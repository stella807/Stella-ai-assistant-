import type { Article } from "../blog.ts";
import { article as membershipComplaints } from "./2026-11-10-concierge-membership-complaints.ts";
import { article as conciergePrices } from "./2026-11-10-concierge-prices-puerto-rico.ts";
import { article as assistantCost } from "./2026-11-10-personal-assistant-cost-puerto-rico.ts";
import { article as questionsBeforeHiring } from "./2026-11-12-questions-before-hiring-concierge.ts";
import { article as hospitalCompanion } from "./2026-11-14-hospital-companion-puerto-rico.ts";
import { article as settlingIn } from "./2026-11-14-settling-in-puerto-rico.ts";
import { article as x402Explained } from "./2026-11-18-x402-pay-per-request-explained.ts";
import { article as airportVip } from "./2026-11-18-airport-vip-meet-and-greet-guide.ts";
import { article as safeRideHome } from "./2026-11-12-safe-ride-home-puerto-rico.ts";
import { article as membershipsLeaveOut } from "./2026-11-10-what-memberships-leave-out.ts";

import { article as checkOnAParent } from "./2026-11-19-check-on-a-parent-in-puerto-rico-from-far-away.ts";
import { article as parentMedicines } from "./2026-11-19-manage-a-parents-medicines-from-far-away.ts";
import { article as first24Hours } from "./2026-11-19-first-24-hours-parent-in-hospital-far-away.ts";
import { article as leavingGuilt } from "./2026-11-19-leaving-your-parents-behind-guilt-and-the-honest-talk.ts";
import { article as siblingsCare } from "./2026-11-19-siblings-two-places-one-parent-sharing-the-care.ts";
import { article as hurricaneSeason } from "./2026-11-19-hurricane-season-with-a-parent-alone-in-puerto-rico.ts";
import { article as medicalAppointments } from "./2026-11-19-get-a-parent-to-medical-appointments-from-far-away.ts";
import { article as groceriesFood } from "./2026-11-19-food-and-groceries-for-a-parent-who-cannot-get-out.ts";
import { article as payingFromAfar } from "./2026-11-19-paying-for-a-parents-help-from-afar-safely.ts";
import { article as scamsOlderParents } from "./2026-11-19-scams-aimed-at-older-parents-when-family-is-far-away.ts";
import { article as lonelyParent } from "./2026-11-19-when-a-parent-is-lonely-and-you-are-a-flight-away.ts";
import { article as stopDriving } from "./2026-11-19-when-a-parent-should-stop-driving-and-what-comes-next.ts";

/**
 * Every published article. To publish one: add its file beside this one
 * (named by date and subject), import it here, and add it to the list. The
 * rules an article has to follow are in docs/blog.md, and test/blog.test.ts
 * holds every article in this list to them.
 */
export const ARTICLES: Article[] = [conciergePrices, membershipsLeaveOut, assistantCost, membershipComplaints, safeRideHome, questionsBeforeHiring, hospitalCompanion, settlingIn, x402Explained, airportVip, checkOnAParent, parentMedicines, first24Hours, leavingGuilt, siblingsCare, hurricaneSeason, medicalAppointments, groceriesFood, payingFromAfar, scamsOlderParents, lonelyParent, stopDriving];
