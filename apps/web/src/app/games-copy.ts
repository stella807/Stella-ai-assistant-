/**
 * The words on Games and on Throw the party, in English and Spanish. Game
 * names, rules and party items come from core and are translated in
 * server-es.ts; this is the screen around them.
 */
export type Lang = "en" | "es";

const EN = {
  games: {
    title: "Games",
    lead: "Seven ways to make looking after each other competitive. None of them score on how much you drink.",
    noCrew: "Games are played with the table you are out with. Start or join a crew on the Tonight tab, then come back — rounds use whoever is in it.",
    live: "Live rounds",
    playing: (n: number) => `${n} playing`,
    hide: "Hide rules",
    how: "How it works",
    forfeit: "Forfeit",
    needs: (n: number) => `Needs ${n}+ players.`,
    needsCrew: (n: number, have: number) => `Needs ${n} in your crew — you have ${have}`,
    start: "Start a round",
    failed: "Could not start that round",
  },
  party: {
    title: "Throw the party",
    lead: "Chairs, food, decorations, entertainment, and the boring things everyone forgets.",
    headcount: "Start from a headcount",
    coming: "People coming",
    build: (n: number) => `Build me a cart for ${n}`,
    starting: "A starting point you can edit — nothing is ordered.",
    rental: " · rental",
    remove: (name: string) => `Remove one ${name}`,
    add: (name: string) => `Add one ${name}`,
    cart: "Your cart",
    toBuy: "To buy",
    rentals: "Rentals (come back)",
    total: "Total",
    covers: (n: number) => `Comfortably covers about ${n} people — set by whichever category is thinnest, so twelve chairs and food for forty still seats twelve.`,
    checkout: "Checkout — not connected yet",
    catalogue: "Vendors are catalogue entries in this build. Nothing here places a real order or takes payment.",
    failed: "Could not save the cart",
  },
};

const ES: typeof EN = {
  games: {
    title: "Juegos",
    lead: "Siete maneras de convertir el cuidarse unos a otros en competencia. Ninguno da puntos por cuánto tomas.",
    noCrew: "Los juegos se juegan con la mesa con la que sales. Crea o únete a un grupo en Inicio y vuelve: las rondas usan a quien esté en él.",
    live: "Rondas en curso",
    playing: (n: number) => `${n} jugando`,
    hide: "Ocultar las reglas",
    how: "Cómo se juega",
    forfeit: "Castigo",
    needs: (n: number) => `Necesita ${n}+ jugadores.`,
    needsCrew: (n: number, have: number) => `Necesita ${n} en tu grupo; tienes ${have}`,
    start: "Empezar una ronda",
    failed: "No se pudo empezar esa ronda",
  },
  party: {
    title: "Haz la fiesta",
    lead: "Sillas, comida, decoración, entretenimiento y lo aburrido que todo el mundo olvida.",
    headcount: "Empieza por cuántos son",
    coming: "Personas que vienen",
    build: (n: number) => `Arma un carrito para ${n}`,
    starting: "Un punto de partida que puedes cambiar; no se pide nada.",
    rental: " · alquiler",
    remove: (name: string) => `Quitar un ${name}`,
    add: (name: string) => `Añadir un ${name}`,
    cart: "Tu carrito",
    toBuy: "Para comprar",
    rentals: "Alquileres (se devuelven)",
    total: "Total",
    covers: (n: number) => `Alcanza cómodamente para unas ${n} personas; lo decide la categoría más corta, así que doce sillas y comida para cuarenta siguen sentando a doce.`,
    checkout: "Pagar: todavía no está conectado",
    catalogue: "Los proveedores son de catálogo en esta versión. Nada de aquí hace un pedido real ni cobra.",
    failed: "No se pudo guardar el carrito",
  },
};

export const gamesWords = (lang: Lang) => (lang === "es" ? ES : EN);
