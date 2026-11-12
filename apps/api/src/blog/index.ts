import type { Article } from "../blog.ts";
import { article as membershipComplaints } from "./2026-11-10-concierge-membership-complaints.ts";
import { article as conciergePrices } from "./2026-11-10-concierge-prices-puerto-rico.ts";
import { article as assistantCost } from "./2026-11-10-personal-assistant-cost-puerto-rico.ts";
import { article as questionsBeforeHiring } from "./2026-11-12-questions-before-hiring-concierge.ts";
import { article as safeRideHome } from "./2026-11-12-safe-ride-home-puerto-rico.ts";
import { article as membershipsLeaveOut } from "./2026-11-10-what-memberships-leave-out.ts";

/**
 * Every published article. To publish one: add its file beside this one
 * (named by date and subject), import it here, and add it to the list. The
 * rules an article has to follow are in docs/blog.md, and test/blog.test.ts
 * holds every article in this list to them.
 */
export const ARTICLES: Article[] = [conciergePrices, membershipsLeaveOut, assistantCost, membershipComplaints, safeRideHome, questionsBeforeHiring];
