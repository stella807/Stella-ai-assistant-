# Marketing angles

Positioning ideas that are worth keeping but are not yet built or committed to.
Each one records the story, what in the app already supports it, and what would
have to be true before it can be said out loud. Nothing here is a promise made
to a customer.

---

## "Check on my husband, he's climbing Mount Everest"

**The story.** A wife at home. A husband somewhere she cannot reach him. She
opens the app and someone is watching for him — a check-in due, and an alert
the moment one is missed, rather than a silence she has to interpret by
herself.

This is the most vivid form of the thing Safehubby actually sells. The elderly
widower and the wife of a climber are the same product: *someone you love is
somewhere you can't see, and nobody is watching.* The Everest version is the
one people repeat to each other.

**What already supports it.** More than it first appears:

- `checkins.ts` — check-ins on a cadence, with a grace period, and a `missed`
  state that escalates.
- Guardians and `ShareGrant` — somebody other than the traveler gets told.
- `LocationPing` — last known position, with retention limits.
- `flight-tracking.ts` — the app already has a "they are in transit and you
  want to know they landed" surface.

The mechanic exists. It is the framing that is missing.

**Two things that are not true yet, and matter.**

1. **Check-ins are attached to a night out, not to a trip.** `nextCheckInMinutes`
   reads drinks and a BAC estimate to decide the interval. An expedition has no
   drinks and no BAC — it needs a second kind of session with its own cadence
   (daily, or twice daily), and a different definition of "escalated."
2. **There is no phone signal on Everest above base camp.** The literal story
   works over a satellite messenger (Garmin inReach, Iridium), not a cell
   network. Selling the Everest case without a satellite path would be selling
   something the app cannot do.

**So the honest version.** Everest is the headline; the customer is ordinary.
The same mechanic, on networks that exist today, covers:

- A spouse who drives overnight, or works a night shift alone.
- Someone on a long road trip, a hike, a boat, a solo drive home.
- An adult child travelling abroad.
- A parent living alone, which is already the core business.

That is a standard and legitimate move — the aspirational example gets
attention, the everyday case gets the subscription. It only becomes dishonest
if the flier implies Everest is supported when it is not.

**If it is ever pursued properly**, the smallest real step is a trip-mode
session: a start, an end, a check-in cadence set by the person rather than by
drinks, and the same guardian alert on a miss. Satellite is a separate and much
larger question.
