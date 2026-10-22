/**
 * Stripe's payment forms dressed in Safehubby's own colours — the navy ground,
 * gold primary action and white text from styles/base.css — so the card
 * fields read as part of the app rather than a white box dropped into it.
 * Stripe draws inside its own frame and cannot read our CSS variables, which
 * is why the values are repeated here; keep them in step with base.css.
 */
export const STRIPE_APPEARANCE = {
  theme: "night",
  labels: "auto",
  inputs: "spaced",
  variables: {
    borderRadius: "12px",
    colorBackground: "#121a2c",
    colorDanger: "#ff8a9b",
    colorPrimary: "#c99a4c",
    colorSuccess: "#3ddc97",
    colorText: "#ffffff",
    colorTextSecondary: "#a7b1cc",
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSizeBase: "16px",
    spacingUnit: "4px",
  },
} as const;
