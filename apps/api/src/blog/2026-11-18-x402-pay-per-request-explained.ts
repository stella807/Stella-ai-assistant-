import type { Article } from "../blog.ts";

export const article: Article = {
  slug: { en: "x402-pay-per-request-explained", es: "x402-pagar-por-solicitud-explicado" },
  publishedOn: "2026-11-18",
  title: {
    en: "x402 explained: paying a few cents for one web request",
    es: "x402 explicado: pagar unos centavos por una solicitud web",
  },
  description: {
    en: "What the x402 payment standard is, how an AI agent pays for a page or a data lookup, what can go wrong, and how Safehubby uses it.",
    es: "Qué es el estándar de pago x402, cómo un agente de IA paga por una página o una consulta de datos, qué puede salir mal y cómo lo usa Safehubby.",
  },
  blocks: [
    { p: {
      en: "Most of the web asks you to make an account, enter a card and subscribe before you can read or use anything. That works for a person with a wallet. It does not work for a piece of software that wants one answer and nothing else. x402 is a way for a website to say \"this costs five cents\" and for the software to pay it on the spot, with no account.",
      es: "La mayor parte de la web te pide crear una cuenta, poner una tarjeta y suscribirte antes de leer o usar algo. Eso funciona para una persona con cartera. No funciona para un programa que quiere una sola respuesta y nada más. x402 es una forma de que un sitio diga \"esto cuesta cinco centavos\" y de que el programa lo pague al momento, sin cuenta.",
    } },
    { h2: { en: "The idea in one minute", es: "La idea en un minuto" } },
    { p: {
      en: "Web servers have always had a status code for \"payment required\": 402. It was set aside in the early days of the web and almost never used. x402 puts it to work. When you ask for something that costs money, the server answers 402 and says how much, in which currency, and where to send it. You pay, ask again with proof of payment, and the server hands over the answer.",
      es: "Los servidores web siempre han tenido un código de estado para \"pago requerido\": 402. Se reservó en los primeros días de la web y casi nunca se usó. x402 lo pone a trabajar. Cuando pides algo que cuesta dinero, el servidor responde 402 y dice cuánto, en qué moneda y adónde enviarlo. Pagas, vuelves a pedir con la prueba del pago, y el servidor entrega la respuesta.",
    } },
    { h2: { en: "The steps", es: "Los pasos" } },
    { ul: [
      { en: "**1. Ask.** The software requests an address, for example a lookup or an article.",
        es: "**1. Pedir.** El programa pide una dirección, por ejemplo una consulta o un artículo." },
      { en: "**2. Get the price.** The server answers 402 with the price, the network, and the receiving address, in a header called PAYMENT-REQUIRED.",
        es: "**2. Recibir el precio.** El servidor responde 402 con el precio, la red y la dirección que recibe el pago, en un encabezado llamado PAYMENT-REQUIRED." },
      { en: "**3. Sign a payment.** The software signs a payment for exactly that amount. It does not send the wallet's secret key to anyone.",
        es: "**3. Firmar un pago.** El programa firma un pago por esa cantidad exacta. No le manda a nadie la clave secreta de la cartera." },
      { en: "**4. Ask again.** The signed payment goes back in a header called PAYMENT-SIGNATURE.",
        es: "**4. Pedir otra vez.** El pago firmado regresa en un encabezado llamado PAYMENT-SIGNATURE." },
      { en: "**5. Check and settle.** The server asks a payment service, called a facilitator, to check the payment and finish it.",
        es: "**5. Verificar y liquidar.** El servidor le pide a un servicio de pagos, llamado facilitador, que verifique el pago y lo complete." },
      { en: "**6. Get the answer.** Only after the payment is settled does the server send the answer, with a receipt in a header called PAYMENT-RESPONSE.",
        es: "**6. Recibir la respuesta.** Solo cuando el pago está liquidado el servidor manda la respuesta, con un recibo en un encabezado llamado PAYMENT-RESPONSE." },
    ] },
    { h2: { en: "Why a few cents works", es: "Por qué funcionan unos centavos" } },
    { p: {
      en: "Card payments have fixed fees that make a five-cent sale pointless. A stablecoin payment, a token meant to stay worth one dollar, can be tiny. {{cheapestPlan}} is the cheapest plan Safehubby sells to people. A web request for one answer is a different kind of sale, and it only makes sense when the price is a few cents and nobody has to sign up.",
      es: "Los pagos con tarjeta tienen cargos fijos que hacen inútil una venta de cinco centavos. Un pago en moneda estable, una ficha pensada para valer un dólar, puede ser diminuto. {{cheapestPlan}} es el plan más barato que Safehubby vende a personas. Una solicitud web por una respuesta es otro tipo de venta, y solo tiene sentido cuando el precio son unos centavos y nadie tiene que registrarse.",
    } },
    { h2: { en: "Practice money and real money", es: "Dinero de práctica y dinero real" } },
    { p: {
      en: "A seller can run x402 on a practice network, where the money has no value, to check that everything works. Safehubby's store does this before it takes real money, and its public catalog says which one it is using in a field called testMoneyOnly. If you are building a buyer, pay on the practice network first. Check the receiving address character by character: a payment to a wrong address cannot be taken back.",
      es: "Un vendedor puede correr x402 en una red de práctica, donde el dinero no vale nada, para comprobar que todo funciona. La tienda de Safehubby lo hace antes de recibir dinero real, y su catálogo público dice cuál usa en un campo llamado testMoneyOnly. Si estás construyendo un comprador, paga primero en la red de práctica. Revisa la dirección que recibe el pago carácter por carácter: un pago a una dirección equivocada no se puede recuperar.",
    } },
    { h2: { en: "What it costs the seller", es: "Cuánto le cuesta al vendedor" } },
    { p: {
      en: "The facilitator charges for settling. PayAI, one facilitator, says it settles the first 1,000 payments to a receiving wallet for free, and after that each payment costs the network's gas plus 30 percent, never a share of what the buyer pays. It also says testnets are always free. Other facilitators price it differently, so read the current terms before you choose one.",
      es: "El facilitador cobra por liquidar. PayAI, un facilitador, dice que liquida gratis los primeros 1,000 pagos a una cartera receptora, y después cada pago cuesta el gas de la red más 30 por ciento, nunca una parte de lo que paga el comprador. También dice que las redes de prueba son siempre gratis. Otros facilitadores cobran distinto, así que lee las condiciones vigentes antes de escoger uno.",
    } },
    { h2: { en: "How Safehubby uses it", es: "Cómo lo usa Safehubby" } },
    { p: {
      en: "Safehubby sells a few things that software can use directly: research on event vendors, hotel programs and airport VIP services, the facts that answer questions about our plans, and a clean-text copy of each blog article. The articles stay free for people and for search engines. Only the clean-text copy made for software costs a few cents. A free catalog at safehubby.com/api/agent/catalog lists what is for sale, the price, and the network. Anything that needs a person, such as an errand or a visit, is not sold this way: payment is not taken for work nobody has agreed to do.",
      es: "Safehubby vende algunas cosas que un programa puede usar directamente: investigación sobre proveedores de eventos, programas de hoteles y servicios VIP de aeropuerto, los datos que responden preguntas sobre nuestros planes, y una copia en texto limpio de cada artículo del blog. Los artículos siguen siendo gratis para las personas y para los buscadores. Solo la copia en texto limpio hecha para programas cuesta unos centavos. Un catálogo gratis en safehubby.com/api/agent/catalog dice qué se vende, el precio y la red. Lo que requiere una persona, como un mandado o una visita, no se vende así: no se cobra por trabajo que nadie ha aceptado hacer.",
    } },
    { p: {
      en: "If you want to see how we think about trust and prices, read [what concierge memberships leave out](/blog/what-concierge-memberships-leave-out), or go back to the [Safehubby home page](/).",
      es: "Si quieres ver cómo pensamos sobre la confianza y los precios, lee [lo que las membresías de conserjería no te dicen](/es/blog/lo-que-no-incluyen-las-membresias-de-concierge), o vuelve a la [página principal de Safehubby](/es).",
    } },
  ],
  faq: [
    { q: { en: "What does the 402 status code mean?", es: "¿Qué significa el código de estado 402?" },
      a: { en: "It means payment is required. With x402 the server uses it to say how much to pay, in which currency and to which address.", es: "Significa pago requerido. Con x402 el servidor lo usa para decir cuánto pagar, en qué moneda y a qué dirección." } },
    { q: { en: "Does an AI agent need an account to pay with x402?", es: "¿Un agente de IA necesita una cuenta para pagar con x402?" },
      a: { en: "No account with the seller. It needs a wallet with enough of the right currency, and it signs each payment itself.", es: "No necesita cuenta con el vendedor. Necesita una cartera con suficiente de la moneda correcta, y firma cada pago por sí mismo." } },
    { q: { en: "Can the seller keep my secret key?", es: "¿Puede el vendedor quedarse con mi clave secreta?" },
      a: { en: "It should never see it. The buyer signs the payment locally and sends only the signed result.", es: "Nunca debería verla. El comprador firma el pago localmente y envía solo el resultado firmado." } },
    { q: { en: "Is it safe to try?", es: "¿Es seguro probarlo?" },
      a: { en: "Start on a practice network, where the money has no value. Move to real money only after a full test purchase works.", es: "Empieza en una red de práctica, donde el dinero no vale nada. Pasa al dinero real solo cuando una compra de prueba completa funcione." } },
  ],
  companies: [
    { name: "PayAI", source: "https://docs.payai.network/x402/facilitators/pricing", checked: "2026-11" },
  ],
  sources: [
    { name: { en: "x402 documentation: the 402 headers", es: "Documentación de x402: los encabezados 402" }, url: "https://docs.x402.org/core-concepts/http-402", checked: "2026-11" },
  ],
};
