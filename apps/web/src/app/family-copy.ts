/**
 * The section right under the hero, for the people most likely to need Safehubby: someone off the island with a parent in
 * Puerto Rico. Only what is true today, and a test holds it to that: no prices, phone numbers, 24/7 cover or guarantees.
 */
export interface FamilyItem { title: string; body: string }
export interface FamilyCopy { kicker: string; heading: string; lead: string; items: FamilyItem[]; cta: string; prices: string }

export function familyCopy(lang: "en" | "es"): FamilyCopy {
  if (lang === "es") {
    return {
      kicker: "Primero, la familia",
      heading: "Para tu familia en Puerto Rico",
      lead: "¿Vives lejos de tu mamá o tu papá en la isla? Alguien que tú escoges va en tu lugar.",
      items: [
        { title: "Compañía en el hospital", body: "Les acompaña a citas y estadías en el hospital, espera con ellos y te mantiene al tanto." },
        { title: "Mandados y recogidos", body: "Farmacia, compra y recogidos, con un límite de gasto que tú pones." },
        { title: "Transporte de ida y vuelta", body: "Se lo reservamos, con el precio a la vista primero." },
        { title: "Tú escoges quién va", body: "Ves la foto de tu asistente antes de que llegue. Los check-ins y el SOS son siempre gratis. En una emergencia, llama primero al 911." },
      ],
      cta: "Crea tu cuenta",
      prices: "Ver los precios",
    };
  }
  return {
    kicker: "Family first",
    heading: "For your family in Puerto Rico",
    lead: "Live far from a parent on the island? Someone you choose goes in your place.",
    items: [
      { title: "A companion for hospital days", body: "Goes with them to appointments and hospital stays, waits with them, and keeps you updated." },
      { title: "Errands and pickups", body: "Pharmacy, groceries and pickups, with a spending limit you set." },
      { title: "Rides there and back", body: "Booked for them, with the price shown first." },
      { title: "You choose who goes", body: "You see your assistant's photo before they arrive. Check-ins and SOS are always free. In an emergency, call 911 first." },
    ],
    cta: "Create your account",
    prices: "See the prices",
  };
}
