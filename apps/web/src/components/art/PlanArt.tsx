import type { PlanId } from "@safehubby/core";
import { AssistantArt, DeskArt, ErrandArt, RideArt, WingmanIcon } from "./Art.tsx";

/**
 * A picture for each plan, so the ladder reads as a ladder of experiences and
 * not a table of numbers. Everyday plans show the help they bring; the Elite
 * plans show the evenings they open up.
 */
const ART: Partial<Record<PlanId, () => JSX.Element>> = {
  free: () => <RideArt />,
  "premium-basic": () => <ErrandArt />,
  "premium-plus": () => <AssistantArt />,
  family: () => <DeskArt />,
  elite: () => <img src="/img/jet.jpg" alt="" className="plan-photo" width={340} height={300} />,
  "elite-signature": () => <img src="/img/jet.jpg" alt="" className="plan-photo" width={340} height={300} />,
  "elite-private": () => <WingmanIcon size={96} />,
};

export function PlanArt({ planId }: { planId: string }) {
  const Art = ART[planId as PlanId];
  if (!Art) return null;
  return <div className="plan-art" aria-hidden="true"><Art /></div>;
}
