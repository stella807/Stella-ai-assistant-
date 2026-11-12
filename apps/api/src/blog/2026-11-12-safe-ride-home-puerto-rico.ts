import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "safe-ride-home-puerto-rico", es: "transporte-seguro-a-casa-puerto-rico" },
  publishedOn: "2026-11-12",
  title: {
    en: "Getting home safe after a night out in Puerto Rico",
    es: "Llegar a casa seguro después de salir en Puerto Rico",
  },
  description: {
    en: "Every way to get home after drinking in Puerto Rico, what each one is good for, where each falls short, and what to arrange before you go out.",
    es: "Todas las formas de llegar a casa después de beber en Puerto Rico, para qué sirve cada una, en qué falla y qué dejar listo antes de salir.",
  },
  blocks: [
    { p: {
      en: "The decision that goes wrong is rarely the first drink. It is the one at the end of the night, when the plan to get home is still \"we will figure it out\". The fix is to have the plan before you leave the house.",
      es: "La decisión que sale mal casi nunca es el primer trago. Es la del final de la noche, cuando el plan para llegar a casa sigue siendo \"ya veremos\". La solución es tener el plan antes de salir de la casa.",
    } },
    { h2: { en: "Your options", es: "Tus opciones" } },
    { ul: [
      { en: "**A friend who does not drink.** Free and personal, but it only works if that friend agrees before the night starts and actually stays sober.",
        es: "**Un amigo que no bebe.** Es gratis y de confianza, pero solo funciona si ese amigo acepta antes de que empiece la noche y de verdad se queda sobrio." },
      { en: "**A ride-hailing app.** Quick in San Juan and the metro area. Late at night, in a smaller town or after a big event, waits get long and prices rise, so do not count on it alone.",
        es: "**Una app de viajes.** Es rápida en San Juan y el área metro. De madrugada, en un pueblo pequeño o después de un evento grande, las esperas se alargan y los precios suben, así que no cuentes solo con ella." },
      { en: "**A taxi or a pre-booked car.** Booking ahead removes the worry about waiting. You agree on the pickup time while you are still sober.",
        es: "**Un taxi o un carro reservado.** Reservar antes quita la preocupación de esperar. Acuerdas la hora de recogido mientras todavía estás sobrio." },
      { en: "**A secure-transport driver.** A professional driver who takes you door to door. It costs more, and it is the right choice when you carry valuables or have to be certain someone gets you inside.",
        es: "**Un chofer de transporte seguro.** Un chofer profesional que te lleva de puerta a puerta. Cuesta más, y es lo correcto cuando llevas objetos de valor o necesitas la certeza de que alguien te lleva hasta adentro." },
    ] },
    { h2: { en: "Where every option falls short", es: "Dónde falla cada opción" } },
    { p: {
      en: "None of these knows whether you arrived. A driver drops you at the curb and leaves. If you are very drunk, alone and a little confused, the ride was not the dangerous part. The next ten minutes are. That is the gap a check-in covers.",
      es: "Ninguna sabe si llegaste. El chofer te deja en la acera y se va. Si estás muy borracho, solo y algo confundido, el viaje no era lo peligroso. Lo peligroso son los próximos diez minutos. Ese es el hueco que cubre un chequeo.",
    } },
    { h2: { en: "What to set up before you go out", es: "Qué dejar listo antes de salir" } },
    { ul: [
      { en: "Pick the way home first, and pay or book it before the first drink.",
        es: "Escoge primero cómo vas a volver, y págalo o resérvalo antes del primer trago." },
      { en: "Tell someone you trust when you expect to be home, and have them hear from you when you are.",
        es: "Dile a alguien de confianza a qué hora esperas llegar, y que reciba un aviso tuyo cuando llegues." },
      { en: "Share your location with that person for the night.",
        es: "Comparte tu ubicación con esa persona durante la noche." },
      { en: "Know the red flags. Someone who cannot be woken, vomits while sleeping or breathes slowly or irregularly needs 911, not a nap.",
        es: "Conoce las señales de alarma. Alguien a quien no se puede despertar, que vomita mientras duerme o respira lento o de forma irregular necesita el 911, no una siesta." },
    ] },
    { h2: { en: "How Safehubby fits", es: "Dónde entra Safehubby" } },
    { p: {
      en: "In the Safehubby app one tap orders a ride, a delivery or a secure-transport driver. Friends and family can follow your night, and a missed check-in alerts them right away, not the next morning. Check-ins, location sharing and SOS are free on every plan. If a friend should not be alone, you can ask for an assistant to come and stay, from {{hourly}} an hour beyond your plan's included hours. More on [the safe-ride page](/safe-ride-home-puerto-rico).",
      es: "En la app de Safehubby, un toque pide un viaje, una entrega o un chofer de transporte seguro. Tus amigos y familia pueden seguir tu noche, y un chequeo que falta los alerta enseguida, no a la mañana siguiente. Los chequeos, la ubicación y el SOS son gratis en todos los planes. Si un amigo no debería estar solo, puedes pedir que un asistente vaya y se quede, desde {{hourly}} la hora más allá de las horas incluidas en tu plan. Más en [la página de transporte seguro](/es/transporte-seguro-puerto-rico).",
    } },
    { p: {
      en: "Safehubby is not an emergency service. In an emergency, call 911 first. For what an assistant costs, read [how much a personal assistant costs in Puerto Rico](/blog/personal-assistant-cost-puerto-rico). Prices are always on [the home page](/).",
      es: "Safehubby no es un servicio de emergencia. En una emergencia, llama primero al 911. Para saber cuánto cuesta un asistente, lee [cuánto cuesta un asistente personal en Puerto Rico](/es/blog/cuanto-cuesta-asistente-personal-puerto-rico). Los precios siempre están en [la página principal](/es).",
    } },
  ],
  faq: [
    { q: { en: "Is there a designated-driver service in Puerto Rico?", es: "¿Hay un servicio de chofer designado en Puerto Rico?" },
      a: { en: "We did not find a dedicated one while researching this article. The common options are a sober friend, a ride-hailing app, a taxi or a pre-booked car. Safehubby lets you order a secure-transport driver in its app.", es: "No encontramos uno dedicado al investigar este artículo. Las opciones comunes son un amigo sobrio, una app de viajes, un taxi o un carro reservado. Safehubby te deja pedir un chofer de transporte seguro en su app." } },
    { q: { en: "How do I make sure a friend got home?", es: "¿Cómo me aseguro de que un amigo llegó a casa?" },
      a: { en: "Agree on a check-in before the night starts. In Safehubby a missed check-in alerts the people you chose right away, and they can see your shared location.", es: "Acuerden un chequeo antes de que empiece la noche. En Safehubby, un chequeo que falta alerta enseguida a las personas que escogiste, y pueden ver tu ubicación compartida." } },
    { q: { en: "When is it an emergency?", es: "¿Cuándo es una emergencia?" },
      a: { en: "If someone cannot be woken, is vomiting while unconscious, or breathes slowly or irregularly, call 911. Do not wait for them to sleep it off.", es: "Si no se puede despertar a alguien, vomita estando inconsciente o respira lento o de forma irregular, llama al 911. No esperes a que se le pase durmiendo." } },
  ],
};
