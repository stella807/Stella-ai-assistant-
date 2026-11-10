import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "concierge-membership-complaints", es: "quejas-membresias-de-concierge" },
  publishedOn: "2026-11-10",
  title: {
    en: "Concierge memberships: what customers complain about",
    es: "Membresías de concierge: de qué se quejan los clientes",
  },
  description: {
    en: "We read three public complaint pages about memberships sold with a concierge promise. The same four complaints repeat. Here they are, with dates and amounts.",
    es: "Leímos tres páginas públicas de quejas sobre membresías que se venden con promesa de concierge. Se repiten las mismas cuatro quejas. Aquí están, con fechas y montos.",
  },
  blocks: [
    { p: {
      en: "Nobody posts a review when the dinner reservation goes through. People write when they have paid thousands for a membership and cannot get an answer. We read three public complaint pages about memberships sold with a concierge promise, and wrote down what customers said, when they said it, and what the company answered.",
      es: "Nadie escribe una reseña cuando la reserva de la cena sale bien. La gente escribe cuando pagó miles por una membresía y no consigue una respuesta. Leímos tres páginas públicas de quejas sobre membresías que se venden con promesa de concierge, y anotamos lo que dijeron los clientes, cuándo lo dijeron y qué contestó la compañía.",
    } },
    { p: {
      en: "These are travel memberships, not services like ours, and that is the point: “concierge” is the word that helped sell them. What follows is the customers' own account. We have not verified it, and where a company replied we show the reply.",
      es: "Son membresías de viajes, no servicios como el nuestro, y ese es el punto: “concierge” es la palabra que ayudó a venderlas. Lo que sigue es el relato de los propios clientes. No lo hemos verificado, y donde la compañía contestó mostramos su respuesta. Las citas están traducidas del inglés.",
    } },
    { table: {
      head: [
        { en: "Where we read it", es: "Dónde lo leímos" },
        { en: "What customers wrote", es: "Lo que escribieron los clientes" },
        { en: "What the company said", es: "Lo que dijo la compañía" },
      ],
      rows: [
        [{ en: "Better Business Bureau page for Elegant Concierge Services (Arizona)", es: "Página del Better Business Bureau sobre Elegant Concierge Services (Arizona)" },
          { en: "Five complaints in three years. October 2026, after paying $4,998: “I have been unable to get meaningful assistance from the company.” August 2026: “We invested $6,998 plus annual dues because we were told membership would provide exclusive travel pricing.” August 2025: “We paid $8000.00 and got nothing.”",
            es: "Cinco quejas en tres años. Octubre de 2026, tras pagar $4,998: “No he podido conseguir ayuda real de la compañía.” Agosto de 2026: “Invertimos $6,998 más cuotas anuales porque nos dijeron que la membresía daría precios de viaje exclusivos.” Agosto de 2025: “Pagamos $8000.00 y no recibimos nada.”" },
          { en: "It disputed the 2025 complaint, saying the members asked to transfer a cruise booked before they joined, which its terms do not allow. The two 2026 complaints show as unanswered. The BBB rates the business F.",
            es: "Disputó la queja de 2025: dijo que los miembros pidieron transferir un crucero reservado antes de unirse, algo que sus términos no permiten. Las dos quejas de 2026 aparecen sin contestar. El BBB le da a la empresa una calificación de F." }],
        [{ en: "ComplaintsBoard page for Lux Vacation Resorts", es: "Página de ComplaintsBoard sobre Lux Vacation Resorts" },
          { en: "“They promised me a personal concierge, but it's really just whoever happens to read your email or answer the phone.” The writer says they paid $4,000, pay $500 a year to renew, and save about $20 a trip.",
            es: "“Me prometieron un concierge personal, pero en realidad es quien lea tu correo o conteste el teléfono.” Quien escribe dice que pagó $4,000, paga $500 al año para renovar y ahorra unos $20 por viaje." },
          { en: "No reply is shown. The review carries no date; the page was updated in September 2026.",
            es: "No aparece respuesta. La reseña no tiene fecha; la página se actualizó en septiembre de 2026." }],
        [{ en: "Trustpilot page for HelloVacay", es: "Página de Trustpilot sobre HelloVacay" },
          { en: "October 2025: “I was promised free lounge access for delays, so I purchased a lifetime membership.” July 2024: “I want my money back. This is not what I signed up for.”",
            es: "Octubre de 2025: “Me prometieron acceso gratis a salas VIP en caso de retrasos, así que compré una membresía de por vida.” Julio de 2024: “Quiero mi dinero de vuelta. Esto no es lo que contraté.”" },
          { en: "It answered a June 2024 review, citing a vendor change and a membership upgrade. Of its 130 reviews, 57% are five-star and 22% are one-star.",
            es: "Contestó una reseña de junio de 2024 y citó un cambio de proveedor y una mejora de la membresía. De sus 130 reseñas, el 57% son de cinco estrellas y el 22% de una estrella." }],
      ],
    } },
    { h2: { en: "The four complaints that repeat", es: "Las cuatro quejas que se repiten" } },
    { ul: [
      { en: "**A large fee.** The amounts customers name are $4,000, $4,998, $6,998 and $8,000, with yearly dues on top in two cases.",
        es: "**Una cuota grande.** Los montos que mencionan los clientes son $4,000, $4,998, $6,998 y $8,000, con cuotas anuales encima en dos casos." },
      { en: "**Value that is hard to find.** One writer worked out that the membership saved about $20 a trip.",
        es: "**Un valor difícil de encontrar.** Una persona calculó que la membresía le ahorraba unos $20 por viaje." },
      { en: "**No particular person.** The “personal concierge” turned out to be whoever answered.",
        es: "**Ninguna persona en particular.** El “concierge personal” resultó ser quien contestara." },
      { en: "**Silence, or a different deal.** Two recent complaints on the BBB page show no answer. On Trustpilot, customers say they did not get the lounge access they were promised, and the company's reply cites a vendor change.",
        es: "**Silencio, o un trato distinto.** Dos quejas recientes en la página del BBB aparecen sin respuesta. En Trustpilot, los clientes dicen que no recibieron el acceso a salas VIP que les prometieron, y la respuesta de la compañía cita un cambio de proveedor." },
    ] },
    { h2: { en: "The questions that would have helped", es: "Las preguntas que habrían ayudado" } },
    { p: {
      en: "Each of these complaints starts with a question nobody asked before paying. What does it cost in total, with renewals? What is included each month? Who exactly helps me? What happens if I want out? We set them out in [five things concierge memberships leave out](/blog/what-concierge-memberships-leave-out).",
      es: "Cada una de estas quejas empieza con una pregunta que nadie hizo antes de pagar. ¿Cuánto cuesta en total, con renovaciones? ¿Qué incluye cada mes? ¿Quién me ayuda exactamente? ¿Qué pasa si quiero salirme? Las explicamos en [cinco cosas que las membresías de concierge no incluyen](/es/blog/lo-que-no-incluyen-las-membresias-de-concierge).",
    } },
    { h2: { en: "How Safehubby is set up", es: "Cómo funciona Safehubby" } },
    { p: {
      en: "The safety basics are free. Paid plans are billed by the month or the year, and the price of every job is on [the home page](/) before you make an account: an assistant is {{hourly}} an hour beyond the hours in your plan, and an errand starts at {{errandFrom}}. A person we hired comes to you, and you set the spending limit.",
      es: "Lo básico de seguridad es gratis. Los planes de pago se cobran por mes o por año, y el precio de cada trabajo está en [la página principal](/es) antes de que crees una cuenta: un asistente cuesta {{hourly}} la hora después de las horas de tu plan, y un mandado empieza en {{errandFrom}}. Llega una persona contratada por nosotros, y tú fijas el límite de gasto.",
    } },
    { p: {
      en: "If you run one of these companies and something here is out of date, write to contact@safehubby.com and we will correct it. And if a concierge service has let you down, tell us. We are collecting what customers say, and we never publish a name without permission.",
      es: "Si diriges una de estas compañías y algo aquí está desactualizado, escribe a contact@safehubby.com y lo corregimos. Y si un servicio de concierge te falló, cuéntanos. Estamos reuniendo lo que dicen los clientes, y nunca publicamos un nombre sin permiso.",
    } },
  ],
  sources: [
    { name: { en: "Better Business Bureau: complaints about Elegant Concierge Services", es: "Better Business Bureau: quejas sobre Elegant Concierge Services" },
      url: "https://www.bbb.org/us/az/scottsdale/profile/travel-agency/elegant-concierge-services-1126-1000054739/complaints", checked: "2026-11" },
    { name: { en: "ComplaintsBoard: a review of Lux Vacation Resorts", es: "ComplaintsBoard: una reseña de Lux Vacation Resorts" },
      url: "https://www.complaintsboard.com/lux-vacation-resorts-incentive-not-received-c1414457", checked: "2026-11" },
    { name: { en: "Trustpilot: reviews of HelloVacay", es: "Trustpilot: reseñas de HelloVacay" },
      url: "https://www.trustpilot.com/review/hellovacay.com", checked: "2026-11" },
  ],
};
