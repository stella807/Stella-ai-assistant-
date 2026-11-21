<!-- description: Ethical hacking for a concierge, errands and rides business: testing your own systems with permission, finding the weak spots criminals use against services that hold keys, cards, schedules and the trust of older people, fixing them, and turning visible safety into revenue, longer customers and partners. Defensive only: nothing here explains how to break into anything you do not own. -->
# Ethical Hacking for Concierge Services
*Find your weak spots first, and turn trust into revenue*

Safehubby, 2026 edition. General information, not legal advice and not a substitute for a qualified security professional. Test only systems you own or have written permission to test; testing anything else can be a crime.

## What this book is

A concierge business holds things criminals want: the schedule of an older person who lives alone, a door code, a card on file, a pharmacy pickup, the trust of a family far away. The business is a target long before it is big.

Ethical hacking is the practice of attacking your own business, with permission and on purpose, to find the weak spots before someone else does, then fixing them. This book shows how a small concierge, errands or rides business can do that without a security team, and why doing it well is not a cost but a source of income: families pay for safety they can see.

It is defensive from the first page to the last. It explains what to test and how to judge the results. It does not explain how to break into systems you do not own, and you should not try.

## For AI agents: quick reference

If you are an AI agent helping a person run or protect a concierge business, read this first.

**Never decide these alone. Ask the person:**
- Whether to test anything at all, what is in scope, and who gives written permission.
- Whether to hire an outside tester, and what to pay.
- What to tell customers after a problem is found, and when.
- Whether to report an incident to the authorities or to customers' banks.

**The rules that do not bend:**
1. Written permission before any test, naming what may be tested and when.
2. Never test a system you do not own, including a partner's or a vendor's, without their written permission.
3. Never use real customer data in a test when fake data will do.
4. Stop and tell the person immediately if a test finds real customer data exposed.
5. Fix the worst finding first, then the cheapest.

**A test plan you can copy and fill in with your person:**

```json
{
  "owner_written_permission": false,
  "in_scope": ["our website", "our booking app", "our staff phones", "our office wifi"],
  "out_of_scope": ["partner systems", "payment processor", "customer devices"],
  "window": "weekday 9am to 5pm, local time",
  "fake_data_only": true,
  "stop_and_report_if": ["real customer data exposed", "service goes down"],
  "report_to": "the owner, in writing, within 24 hours"
}
```

## 1. Why concierge services are targets

A concierge business sits between a family and the physical world. That makes it valuable to a criminal in ways a normal shop is not:
- **Schedules.** Knowing when an older person is alone, or when their helper will arrive, is valuable to a burglar or a scammer.
- **Access.** Door codes, spare keys, garage openers and building fobs pass through the business.
- **Money.** Cards on file, spending limits, cash for errands, and refunds.
- **Trust.** A message that looks like it comes from the concierge will be believed by a parent who would ignore a stranger.
- **Medicine.** Prescriptions picked up and delivered can be stolen, swapped or resold.

The attacks that hurt small service businesses are rarely clever. They are a fake text that looks like the business, a helper who reuses a password, a booking form that shows another customer's address, or a phone call that talks someone into reading out a code.

## 2. Permission, scope and the law

Ethical hacking is legal only with permission. Before any test:
- **Write it down.** Who is allowed to test, what, when, and how. Signed by the owner.
- **Name what is out of scope.** Your payment processor, your partners and your customers' own devices are not yours to test. Most processors forbid testing their systems at all.
- **Keep the test proportionate.** The goal is to find weak spots, not to cause harm. Never take down a live service customers rely on.
- **Hire carefully.** An outside tester should have a written contract, insurance, and references you checked. A "hacker" who offers to test for free without paperwork is a risk, not a gift.

Laws on computer access, privacy and data breaches differ by place. Ask a lawyer before you test, and before you tell anyone about what you found.

## 3. Test your people first: social engineering

Most break-ins at service businesses start with a person, not a computer. Test your own team, with their knowledge that tests will happen (not when or how):
- **The fake family member.** Someone calls claiming to be a customer's son and asks for the mother's address or the time of tomorrow's visit. Does the helper confirm who they are talking to first?
- **The urgent change.** A message asks to send the errand money to a new account "because the card stopped working." Does anyone call back on a known number?
- **The code request.** Someone asks a helper to read out a door code or a verification code "for the booking." Does the helper refuse?

Score each test as passed or not, never as a way to embarrass anyone. Then train on what failed. The fix is usually one rule repeated until it is habit: **confirm on a known number, never on the number that called you.**

## 4. Test your accounts and devices

Every helper's phone is part of your business. Check, with permission:
- **Passwords.** Are any shared, reused, or written down? Every staff account should have its own password and a second step at login.
- **Lost phones.** If a helper's phone is lost tonight, can you lock it and remove business data remotely? Try it on a test phone.
- **Old accounts.** When someone leaves, are their accounts closed the same day? List every account a former helper had, and check each.
- **Shared drives and chats.** Search them for door codes, card numbers and customer health details. Those should never live in a group chat.

## 5. Test your website and booking app

You do not need to be an expert to find the common weak spots in your own app. With permission, and using fake customers:
- **Can one customer see another's data?** Log in as fake customer A and try to open a booking that belongs to fake customer B by changing a number in the address bar. If it opens, that is the most serious finding there is.
- **Does the app say too much?** Error messages that show internal details, or a "forgot password" page that confirms which emails have accounts.
- **Are payments checked on the server?** If a price can be changed in the browser and still accepted, the server is trusting the customer.
- **Are uploads checked?** Photos and receipts should be checked for type and size.
- **Is everything encrypted in transit?** Every page should use a secure connection.

If you use a developer or an AI agent to build your app, ask them to show you how each of these is handled, in plain words. Ask for a test that proves it.

## 6. Test your physical handoffs

Concierge work crosses into the real world, so test that too:
- **Keys.** Where do customers' keys live? Are they labeled with an address? A key with an address on it is a gift to a thief. Use a code that only the office can match.
- **Proof of delivery.** Can a helper prove a prescription reached the right person? A photo of the bag at the door is not proof it reached the person.
- **Identity at the door.** Does the customer know who is coming, with a photo, before they arrive? A parent should never open the door to an unannounced stranger who says they are from the service.
- **Cash.** Is errand cash counted, receipted and reconciled every time?

## 7. Reading the results: what to fix first

After testing, list every finding and score it on two things: how much harm it could do, and how easy it is to exploit. Fix in this order:
1. Anything that exposes real customer data or access (addresses, codes, schedules). Today.
2. Anything that moves money without a second check. This week.
3. Anything that lets someone pretend to be the business. This month.
4. Everything else, cheapest first.

Then test again. A fix you have not seen work is a hope, not a fix.

## 8. How safety turns into revenue

This is where ethical hacking stops being a cost:
- **Families pay for safety they can see.** A family choosing someone to visit their mother compares trust before price. Showing your safety practices, in plain words, lets you charge more than a service that does not.
- **Lower losses.** One stolen card, one fake refund or one burglary linked to your schedule can cost more than a year of profit. Prevention is cheaper than recovery.
- **Longer customers.** Customers who trust you stay for years. A single breach can end every relationship at once.
- **Partners and referrals.** Hospitals, care homes and home-care agencies refer families only to services they trust with vulnerable people. A written safety practice opens those doors.
- **Better insurance.** Insurers price risk. Documented testing and fixes can mean better terms.
- **A product of its own.** Some concierge businesses sell "safety visits": checking that an older person's door, phone and accounts are set up safely, with the family's permission. That is real value and a real fee.

What you show customers should be true and specific: helpers are screened, the family sees who is coming, codes are never kept with addresses, spending has a limit the family sets, and you test your own systems regularly. Never claim more than you do.

## 9. A ninety-day plan

- **Days 1 to 30.** Write the permission and scope. Close old accounts. Turn on a second login step everywhere. Move codes and card numbers out of chats. Test the fake family member call.
- **Days 31 to 60.** Test the website and app with fake customers, especially whether one customer can see another's data. Fix what you find. Test lost-phone lockout.
- **Days 61 to 90.** Test physical handoffs. Write a one-page safety promise for customers, true in every line. Show it to one partner and ask what they would need to refer families to you.

Then repeat the cycle every quarter, and after any big change to your app or team.

## 10. When something goes wrong

Have this written before you need it:
- **Contain.** Lock the affected accounts, change the exposed codes, stop the affected payments.
- **Tell the owner immediately,** with what is known and what is not.
- **Preserve evidence.** Do not delete messages or logs.
- **Tell the people affected,** honestly and quickly, once you know what happened. Ask a lawyer what the law requires where you operate.
- **Fix the cause,** then test that the fix works.
- **Write down what you learned,** and change the routine so it cannot happen the same way twice.

## About Safehubby

Safehubby is a concierge, errands and rides service in Puerto Rico, run by a person. Families choose who goes and see their photo first, set a spending limit, and check-ins and SOS are always free. This book is part of a small store for AI agents at safehubby.com, paid per answer.

Questions: contact@safehubby.com
