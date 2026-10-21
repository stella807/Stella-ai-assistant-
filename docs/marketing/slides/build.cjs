// Builds safehubby-site.pptx: every screen of the app, in the navy-and-gold look.
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("/root/.claude/skills/synced/5f84b597-7352-43ba-8708-4deb5403e5d9_d0445e32-d664-4d9e-b46b-fdbb1c79599f/pptx/scripts/apply_theme.js");
const path = require("path");
const I = (f) => path.join(__dirname, "img", f);

const THEME = {
  name: "Safehubby", headFontFace: "Cambria", bodyFontFace: "Calibri",
  colors: { dk1: "0A0E1A", lt1: "FBF6EA", dk2: "1A1410", lt2: "D9CDB4", accent1: "C99A4C", accent2: "E6CF9D",
    accent3: "0F1626", accent4: "8F8670", accent5: "F3E2B3", accent6: "241C14", hlink: "E6CF9D", folHlink: "C99A4C" },
};

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  pres.title = "Safehubby — The Entire Site";
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
  const C = pres.SchemeColor;

  pres.defineSlideMaster({
    title: "Screens", background: { color: C.text1 },
    objects: [
      { placeholder: { options: { name: "eyebrow", type: "body", x: 0.7, y: 1.2, w: 6.2, h: 0.4, fontSize: 13, bold: true, charSpacing: 4, color: C.accent2, align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 1.7, w: 6.2, h: 1.7, fontSize: 40, bold: true, color: C.background1, valign: "top", align: "left", margin: 0 }, text: "" } },
      { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 3.3, w: 6.2, h: 2.8, fontSize: 18, color: C.background2, valign: "top", align: "left", margin: 0, lineSpacingMultiple: 1.2 }, text: "" } },
      { image: { x: 0.7, y: 6.55, w: 0.42, h: 0.42, path: I("logo.png") } },
      { text: { text: "Safehubby", options: { x: 1.2, y: 6.55, w: 3, h: 0.42, fontSize: 12, color: C.accent4, valign: "middle", margin: 0 } } },
    ],
    slideNumber: { x: 6.2, y: 6.6, w: 0.7, h: 0.35, fontSize: 12, color: C.accent4, align: "right" },
  });
  pres.defineSlideMaster({ title: "Feature", background: { color: C.text2 }, objects: [] });

  const phone = (slide, file, x, alt) => slide.addImage({
    path: I(file), x, y: 0.75, w: 2.77, h: 6.0, altText: alt, rounding: false,
    shadow: { type: "outer", color: "000000", blur: 12, offset: 4, angle: 90, opacity: 0.5 },
  });
  const frame = (slide, x) => slide.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x: x - 0.04, y: 0.71, w: 2.85, h: 6.08, rectRadius: 0.18, fill: { color: C.accent1 }, line: { color: C.accent1 },
  });

  const screens = [
    ["The website", "The front door", "The jet-and-G-Wagon photo, one gold button to create an account, and what Safehubby does: assistants, errands, rides, things handled for you, and safety.", "01-landing.png", "02-landing-services.png", "The website"],
    ["The website", "Who we are, and the way in", "Leadership and the mission, then a quiet footer: Contact, Press, Terms, Privacy, the Employee and Management portals, and “Various payment methods accepted.”", "20-about-leadership.png", "03-landing-footer.png"],
    ["The customer’s app", "Home: one big ask", "“Hello, Maria.” A gold “Speak with your assistant” button, Get a ride and Games beside it, and a fold-out list of everything an assistant can do.", "04-home.png", "05-assistant-can-do.png", "The customer’s app"],
    ["The customer’s app", "Games, and Get help", "Games for the group, right from home. Get help opens on the jet photo with just two tabs: Send an assistant, and Rides.", "06-games.png", "07-get-help.png"],
    ["The customer’s app", "Ask an assistant", "One grid of nine choices, one “What do you need?” box, one Send it. No prices on screen — the cost is emailed. Each request has its own page with a Send box, the map, and who is with her.", "08-ask-an-assistant.png", "09-request-live.png"],
    ["The customer’s app", "Rides, on the map", "Drop a pin and someone books the ride for you. The moment a driver is assigned, a map pops up with who is coming and buttons to call or text.", "10-rides.png", "11-ride-map-popup.png"],
    ["The customer’s app", "How it works", "Four steps: tell us what you need, choose your assistant, follow it from your phone, pay only for what was used. Then what each plan includes and costs.", "12-how-it-works.png", "13-how-pricing.png"],
    ["The customer’s app", "Payments and plans", "Your plan, an ATH Móvil balance, your card or PayPal. Premium ($89.99), Premium Plus ($99.99) and Family ($539.94) a month, side by side.", "14-payments.png", "15-plans.png"],
    ["The customer’s app", "Elite, and watching over someone", "Elite memberships from $1,500 a month: jets, villas, yachts and a 24/7 desk. Watch lets family follow a night out with check-ins and SOS, always free.", "16-elite.png", "19-watch.png"],
    ["The customer’s app", "Your account, your alerts", "Your plan at a glance, and alerts by text, by email, or both. Each says only “open the app” — never a place or an amount.", "17-account.png", "18-alerts.png"],
    ["En español", "Hola, Maria.", "One tap on ES and the home screen and Get help speak Spanish: “Habla con tu asistente”, “Pide un viaje”, and every choice — Acompañar a alguien, Sacar una cita, Trámites.", "es-home.png", "es-help.png"],
    ["The Wingman Club", "By invitation only", "Your club assistant signs in with their own key, sees how the business is doing, and invites customers. Only then does the club appear on their home screen.", "21-club-assistant-desk.png", "22-home-club-invited.png", "The Wingman Club"],
    ["The Wingman Club", "One evening a month", "Cigars, bourbon, events and the sky — one pick a month for the whole club, a cigar and a drink at every event, and a club assistant who arranges anything a member asks.", "23-wingman-club.png", "24-wingman-rotation.png"],
    ["The assistants’ portal", "Every assistant’s own sign-in", "Requests from customers, alerts by phone, text or email. Open a request to chat, send photos — and hand the legwork to a runner. The customer never sees the runner.", "25-employee-portal.png", "26-employee-task-runner.png", "The assistants’ portal"],
    ["The assistants’ portal", "How assistants are paid", "Pay rates published up front — $35 an hour in Puerto Rico — paid every 14 days, with 10% held back for Hacienda unless they have an exemption certificate.", "27-pay-rates.png", null],
    ["The management portal", "The whole business, one place", "You, your secretary and your club assistant sign in here, each seeing only what their key allows: the club desk, customers, errands in progress, hiring and pickups.", "28-management-portal.png", "29-management-customers.png", "The management portal"],
    ["The management portal", "Money, prices and the access log", "What was charged, what is owed to assistants, what is held back for Hacienda, the launch checklist and pricing controls — and a log of every look.", "30-management-money.png", null],
  ];

  // Cover
  pres.addSection({ title: "Safehubby" });
  let s = pres.addSlide({ masterName: "Feature", sectionTitle: "Safehubby" });
  s.addImage({ path: I("hero-luxury.jpg"), x: 0, y: 0, w: 13.333, h: 7.5, sizing: { type: "cover", w: 13.333, h: 7.5 }, altText: "A man in a suit beside a private jet and a black SUV at sunset" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.text1, transparency: 35 }, line: { type: "none" } });
  s.addImage({ path: I("logo.png"), x: 0.9, y: 2.3, w: 1.2, h: 1.2, altText: "Safehubby shield logo" });
  s.addText("THE ENTIRE SITE", { x: 0.9, y: 3.75, w: 8, h: 0.4, fontSize: 14, bold: true, charSpacing: 6, color: C.accent2, margin: 0, isTextBox: true });
  s.addText("Safehubby", { x: 0.9, y: 4.15, w: 10, h: 1.2, fontSize: 66, bold: true, fontFace: "Cambria", color: C.background1, margin: 0, isTextBox: true });
  s.addText("Real people. For anything. Puerto Rico · 24/7", { x: 0.9, y: 5.35, w: 10, h: 0.5, fontSize: 20, color: C.background2, margin: 0, isTextBox: true });
  s.addNotes("A walk through every screen: the customer’s app, the Wingman Club, the assistants’ portal and the management portal. Screenshots use demo data.");

  let section = "Safehubby";
  for (const [eyebrow, title, body, a, b, newSection] of screens) {
    if (newSection) { section = newSection; pres.addSection({ title: section }); }
    s = pres.addSlide({ masterName: "Screens", sectionTitle: section });
    s.addText(eyebrow.toUpperCase(), { placeholder: "eyebrow" });
    s.addText(title, { placeholder: "title" });
    s.addText(body, { placeholder: "body" });
    const xs = b ? [7.3, 10.25] : [9.8];
    frame(s, xs[0]); phone(s, a, xs[0], title);
    if (b) { frame(s, xs[1]); phone(s, b, xs[1], title); }
  }

  // How the money moves
  pres.addSection({ title: "Behind the scenes" });
  s = pres.addSlide({ masterName: "Feature", sectionTitle: "Behind the scenes" });
  s.addText("BEHIND THE SCENES", { x: 0.7, y: 0.8, w: 8, h: 0.4, fontSize: 13, bold: true, charSpacing: 4, color: C.accent2, margin: 0, isTextBox: true });
  s.addText("How the money moves", { x: 0.7, y: 1.25, w: 12, h: 0.9, fontSize: 40, bold: true, fontFace: "Cambria", color: C.background1, margin: 0, isTextBox: true });
  const cards = [
    ["The customer pays", "Their saved PayPal account is held when they ask, charged only what was spent when it’s done, and emailed both amounts. ATH Móvil and crypto load a prepaid balance."],
    ["The assistant spends", "A one-task Lithic card capped at the limit. Lithic shows the number in their portal; they can add it to Apple Wallet."],
    ["The assistant is paid", "Every 14 days, worked out for you, with 10% held back for Hacienda in Puerto Rico. You send it from the bank or ATH Business."],
  ];
  cards.forEach(([h, t], i) => {
    const x = 0.7 + i * 4.05;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 2.6, w: 3.8, h: 3.6, rectRadius: 0.15, fill: { color: C.accent6 }, line: { color: C.accent1, width: 1.5 }, objectName: `card-${i}` });
    s.addText(h, { x: x + 0.35, y: 2.95, w: 3.1, h: 0.6, fontSize: 24, bold: true, fontFace: "Cambria", color: C.accent5, margin: 0, isTextBox: true });
    s.addText(t, { x: x + 0.35, y: 3.65, w: 3.1, h: 2.3, fontSize: 16, color: C.background2, valign: "top", margin: 0, isTextBox: true });
  });
  s.addNotes("Needs PayPal keys and an approved Lithic card program before real money moves.");

  // Closing
  s = pres.addSlide({ masterName: "Feature", sectionTitle: "Behind the scenes" });
  s.addImage({ path: I("wingman-bourbon-cigar.jpg"), x: 0, y: 0, w: 13.333, h: 7.5, sizing: { type: "cover", w: 13.333, h: 7.5 }, altText: "A glass of bourbon and a cigar on an oak barrel" });
  s.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: C.text1, transparency: 30 }, line: { type: "none" } });
  s.addImage({ path: I("logo.png"), x: 0.9, y: 3.0, w: 1.0, h: 1.0, altText: "Safehubby shield logo" });
  s.addText("safehubby.com", { x: 0.9, y: 4.15, w: 10, h: 1.1, fontSize: 60, bold: true, fontFace: "Cambria", color: C.background1, margin: 0, isTextBox: true });
  s.addText("contact@safehubby.com · Puerto Rico", { x: 0.9, y: 5.25, w: 10, h: 0.5, fontSize: 20, color: C.background2, margin: 0, isTextBox: true });

  await pres.writeFile({ fileName: path.join(__dirname, "safehubby-site.pptx") });
  await applyTheme(path.join(__dirname, "safehubby-site.pptx"), THEME);
  console.log("written");
})();
