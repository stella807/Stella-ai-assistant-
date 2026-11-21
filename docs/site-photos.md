# Photos on the landing page

Where each card photo on the home page comes from, so any of them can be swapped for the owner's own photos.

The photos are free to use for business (Unsplash and Pexels licenses: no payment, no credit required, changes allowed). The people shown are models in stock photos, not Safehubby clients or staff. The footer says "Photos: Unsplash and Pexels contributors" in both languages (`show.photos` in `apps/web/src/i18n.tsx`).

Each file is a 900 x 1200 crop (the card is 3 to 4) with one shared warm color grade, so the new photos sit well next to the older ones.

| Card | File in `apps/web/public/img/` | Source |
|---|---|---|
| Hospital stays | `showcase-hospital.jpg` | Pexels photo 3934328 |
| Medical appointments | `showcase-appt.jpg` | Pexels photo 20850801 |
| Groceries | `showcase-groceries.jpg` | Pexels photo 7262870 |
| Food delivery | `showcase-food.jpg` | Pexels photo 6839661 |
| Appointments and bookings | `showcase-booking.jpg` | Pexels photo 7821339 |
| Parties and events | `showcase-events.jpg` | Pexels photo 5834736 |
| Personal security | `showcase-security.jpg` | Pexels photo 38094471 |
| Rides, hotels, lounges, venues, jets, yachts | `showcase-ride.jpg` and the others | Unsplash |

A Pexels page is at `https://www.pexels.com/photo/<number>/`.

## Replacing a photo with your own

Save it as a JPEG of about 900 x 1200 (portrait) under the same file name and rebuild. Do not show a patient's face without their written permission.

## Personal security card

The photo shows a suited bodyguard with no weapon on purpose. Say "armed" on the site only when every bodyguard sent holds both a security license and a firearms license in Puerto Rico.
