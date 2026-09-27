# Budget Dashboard: a spreadsheet you can sell

A finished digital download: a personal budget workbook that works in Excel,
Google Sheets, Apple Numbers and LibreOffice. You list it once and deliver it
automatically, with no inventory, shipping or hosting.

## What's in the box (what the buyer gets)

| File | What it is |
|---|---|
| `dist/Budget-Dashboard.xlsx` | The workbook with sample data filled in, so buyers see it working right away |
| `dist/Budget-Dashboard-Blank.xlsx` | The same workbook, empty and ready to use |

Seven tabs:

- **Start Here**: five-step setup, a colour legend and tips
- **Dashboard**: pick a month from a dropdown to see income, spending, money left over, savings rate and running balance, plus a budget-vs-actual table (overspending shows in red) and a chart
- **Year View**: all twelve months by category, with income vs. spending totals and a chart
- **Settings**: up to 40 categories with monthly budgets, and a "left unassigned" check for zero-based budgeting
- **Transactions**: 2,000 rows with a category dropdown, date validation, and type/month filled in automatically. Unknown categories are flagged on the Dashboard so they can't drop out of the totals without anyone noticing.
- **Goals**: savings goals with progress bars and the amount to save each month to hit each date
- **Debt Payoff**: months to pay off each debt, payoff date and total interest, with an "extra payment" box that goes to the highest APR (avalanche method)

It has about 7,000 formulas and no macros, so it opens without security warnings.
Every formula was checked with a full recalculation: zero errors.

## Listing images

`listing/` has 200-dpi screenshots rendered from the real file:
`1-dashboard.png`, `2-year-view.png`, `3-savings-goals.png`, `4-debt-payoff.png`, `5-start-here.png`.
Use the dashboard as your main image. A Canva mockup (the screenshot on a
laptop screen with a title banner) usually converts better than a plain
screenshot.

## Where to sell it

| Platform | Fees (check current rates) | Good for |
|---|---|---|
| **Etsy** | $0.20 listing + ~6.5% transaction + payment processing | The most shoppers already searching "budget spreadsheet" |
| **Gumroad** | ~10% per sale, no monthly fee | Fastest setup, good if you'll promote it yourself (TikTok, Pinterest, Instagram) |
| **Payhip / Lemon Squeezy** | ~5% | Lower fees, and they handle EU VAT for you |

Upload both `.xlsx` files as the digital download. On Etsy, choose
"Digital" as the item type so delivery happens automatically.

**Suggested price:** $9.99 at launch, then $14–19 once you have reviews.
Comparable budget templates sell for $5–30.

## Listing copy (paste and edit)

**Title (Etsy, 140 chars max):**
Budget Spreadsheet Template, Monthly & Annual Budget Planner, Excel & Google Sheets, Debt Payoff Tracker, Savings Goals, Personal Finance

**Tags (Etsy allows 13):**
budget spreadsheet, budget template, google sheets budget, excel budget, monthly budget, budget planner, debt payoff tracker, savings tracker, personal finance, expense tracker, zero based budget, finance dashboard, digital planner

**Description:**

> See exactly where your money goes, in one clean dashboard.
>
> Pick a month and the Budget Dashboard shows your income, spending, what's
> left over, your savings rate and your running balance. Every category is
> shown against its budget, and anything over budget turns red.
>
> WHAT'S INSIDE
> ✔ Monthly dashboard with a dropdown month picker and budget-vs-actual chart
> ✔ Year-at-a-glance view of all 12 months by category
> ✔ Up to 40 custom income and expense categories
> ✔ Transaction log with dropdowns (2,000 rows)
> ✔ Savings goal tracker: tells you how much to save each month
> ✔ Debt payoff calculator: payoff date and total interest, with the avalanche method
> ✔ Start Here guide, plus a sample-data copy and a blank copy
>
> WORKS WITH
> Microsoft Excel (desktop, web and mobile), Google Sheets (free), Apple Numbers, LibreOffice.
> No macros, no add-ins and no subscription.
>
> HOW IT WORKS
> 1. Download instantly after purchase
> 2. Set your categories and budgets (5 minutes)
> 3. Log transactions as you go, and the dashboard does the rest
>
> PLEASE NOTE
> This is a digital download. No physical item will be shipped. For
> personal use only; please don't resell or share the file.

## Rebuilding / customising

The workbook is generated from `build_workbook.py`, so you can change the
colours, default categories or sample data and make a new version (for
example a UK £ edition, a "couples" edition, or a small-business edition).

```bash
pip install openpyxl
python build_workbook.py          # dist/Budget-Dashboard.xlsx (sample data)
python build_workbook.py --blank  # dist/Budget-Dashboard-Blank.xlsx
```

It uses only formulas that behave the same in Excel, Google Sheets, Numbers
and LibreOffice (`SUMIFS`, `INDEX/MATCH`, `NPER`, no `XLOOKUP` or dynamic
arrays). Keep it that way when you make changes.
