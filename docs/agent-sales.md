# Selling the vendor lookup to AI agents (x402)

Other AI agents can pay 5 cents in USDC to search Safehubby's vendor research:
event vendors, hotel programs and airport VIP services. Only the published
research is sold, never your own notes, quotes or contacts.

- Address: `GET /api/agent/vendors?q=&category=&place=&limit=`
- Free description: `GET /api/agent/vendors?info`
- Without payment the server answers `402` with the price (x402 version 2).
  An agent pays and asks again with a `PAYMENT-SIGNATURE` header. The answer
  is sent only after the payment is settled.
- Sales show in the owner portal under Money, then Sales to AI agents.

## Turn it on with test money (Railway, API service Variables)

1. Make a wallet, for example Coinbase Wallet. Copy its **receiving address**
   (it starts with `0x`). Never put its secret phrase or private key anywhere.
2. Add:
   - `X402_ENABLED` = `true`
   - `X402_PAY_TO` = your receiving address
3. Redeploy. It uses Base Sepolia, a practice network where the money is not
   real, through the public test facilitator at x402.org.
4. To test a purchase yourself, get free test USDC for Base Sepolia from
   Circle's faucet (faucet.circle.com) in a second wallet.

## Going live (later, only when you decide)

Real money needs both `X402_NETWORK` = `eip155:8453` (Base) and
`X402_ALLOW_MAINNET` = `yes`, plus a facilitator that handles real payments
(`X402_FACILITATOR_URL`; the x402.org one is for test money only). Without
`X402_ALLOW_MAINNET`, a real-money network is refused.

Optional: `X402_PRICE` (default `$0.05`).
