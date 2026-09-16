import { dollars } from "../money.ts";

type MaskedCard = { network: string; last4: string; expMonth: number; expYear: number };

/**
 * The spend-capped card issued for a task — an errand runner buying what
 * was asked for, or a personal assistant covering costs while they're with
 * someone. Shown as an actual card rather than a line of text, because
 * "network ···· last4" buried the one fact that matters here: this is a
 * separate card with a hard ceiling, not the customer's own card and not a
 * blank check to the assistant either.
 *
 * Used from both sides of the same task, which is why the caption and the
 * "who's on it" line are passed in rather than assumed: the customer reads
 * it as "not yours, only theirs, only up to this"; the assistant reads the
 * identical numbers as "this is what you can spend, and no more."
 *
 * Every field is real — `card` is the masked card `CardIssuingPort` actually
 * returned (see the `card` field's doc comment on `ConciergeTask` in
 * concierge.ts) and `capCents` is `spendCapCents`, the same number
 * `remainingSpendCents` gates against. There is no full card number to show
 * even if this wanted to — the app never receives one, only the id, last
 * four, and expiry.
 */
export function TaskCardVisual({ card, capCents, caption, holderLabel, holderValue, footnote }: {
  card: MaskedCard | undefined;
  capCents: number;
  caption: string;
  holderLabel: string;
  holderValue: string;
  footnote: string;
}) {
  if (!card) return null;

  return (
    <div className="task-card-visual">
      <div className="task-card-visual-row">
        <span className="task-card-visual-label">{caption}</span>
        <span className="task-card-visual-network">{card.network}</span>
      </div>

      <div className="task-card-visual-number">•••• •••• •••• {card.last4}</div>

      <div className="task-card-visual-row task-card-visual-details">
        <div className="stack" style={{ gap: 1 }}>
          <span className="task-card-visual-caption">{holderLabel}</span>
          <span className="task-card-visual-value">{holderValue}</span>
        </div>
        <div className="stack" style={{ gap: 1 }}>
          <span className="task-card-visual-caption">Exp</span>
          <span className="task-card-visual-value">
            {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
          </span>
        </div>
        <div className="stack" style={{ gap: 1 }}>
          <span className="task-card-visual-caption">Spend cap</span>
          <span className="task-card-visual-value">{dollars(capCents)}</span>
        </div>
      </div>

      <p className="tiny muted" style={{ margin: 0 }}>{footnote}</p>
    </div>
  );
}
