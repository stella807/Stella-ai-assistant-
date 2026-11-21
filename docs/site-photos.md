# Photos on the landing page

Where each card photo on the home page comes from, so any of them can be swapped for the owner's own photos.

The photos are free to use for business (Unsplash and Pexels licenses: no payment, no credit required, changes allowed). The people shown are models in stock photos, not Safehubby clients or staff. The footer says "Photos: Unsplash and Pexels contributors" in both languages (`show.photos` in `apps/web/src/i18n.tsx`).

Each file is a 900 x 1200 crop (the card is 3 to 4) with one shared warm color grade, so the new photos sit well next to the older ones.

| Card | File in `apps/web/public/img/` | Source |
|---|---|---|
| Hospital stays | `showcase-hospital.jpg` | Pexels photo 6129689 (a nurse beside a patient in a hospital bed) |
| Medical appointments | `showcase-appt.jpg` | Pexels photo 20850801 (a caregiver pushing a wheelchair) |
| Groceries | `showcase-groceries.jpg` | Pexels photo 6868788 (a delivery man with a crate of fresh vegetables) |
| Food delivery | `showcase-food.jpg` | Two photos stacked, ordering above and delivery below: Pexels photo 13432284 and Unsplash image `photo-1617347454431-f49d7ff5c3b1` |
| Appointments and bookings | `showcase-booking.jpg` | Unsplash image `photo-1713947505562-299114c58523` (an assistant on the phone with a laptop and notebook) |
| Parties and events | `showcase-events.jpg` | Pexels photo 14581440 (a planner arranging flowers at an event) |
| Personal security | `showcase-security.jpg` | Pexels photo 24286057 (a bodyguard in a suit checking a pistol) |
| Rides, hotels, lounges, venues, jets, yachts | `showcase-ride.jpg` and the others | Unsplash |

A Pexels page is at `https://www.pexels.com/photo/<number>/`; an Unsplash image is at `https://images.unsplash.com/<name>`.

## Replacing a photo with your own

Save it as a JPEG of about 900 x 1200 (portrait) under the same file name and rebuild. Do not show a patient's face without their written permission.

## Personal security card

The photo shows an armed bodyguard in a suit, as the owner asked. The card text does not say "armed" or "licensed": add either word only when it is true for every bodyguard sent (a security license and a firearms license in Puerto Rico).
