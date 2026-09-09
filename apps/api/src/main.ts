import { createApp, makeCtx } from "./server.ts";
import { SEED } from "./seed.ts";
import { Store } from "./store.ts";

const port = Number(process.env.PORT ?? 8787);
const store = new Store();
if (store.data.travelers.length === 0) store.reset(SEED);

createApp(makeCtx(store)).listen(port, () => {
  console.log(`Safehubby API listening on http://localhost:${port}`);
});
