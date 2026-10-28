import { Component, type ReactNode } from "react";
import { useLanguage } from "../i18n.tsx";

interface Props { children: ReactNode; title: string; retry: string; reload: string; hint: string }
interface State { error: Error | null }

/**
 * Keeps one screen's failure from turning the whole app black. React unmounts
 * everything when a screen throws while drawing; this catches it, says so in
 * plain words, and shows what the error was so it can be reported and fixed.
 */
class Guard extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[safehubby] a screen crashed:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <section className="card stack" role="alert">
        <h3 style={{ margin: 0 }}>{this.props.title}</h3>
        <p className="small muted" style={{ margin: 0 }}>{this.props.hint}</p>
        <code className="tiny" style={{ wordBreak: "break-word" }}>{error.name}: {error.message.slice(0, 300)}</code>
        <button className="btn btn-block" onClick={() => this.setState({ error: null })}>{this.props.retry}</button>
        <button className="btn btn-block btn-ghost" onClick={() => window.location.reload()}>{this.props.reload}</button>
      </section>
    );
  }
}

export function ScreenGuard({ children }: { children: ReactNode }) {
  const es = useLanguage().language === "es";
  return (
    <Guard
      title={es ? "Algo falló en esta pantalla" : "Something went wrong on this screen"}
      hint={es ? "El resto de la app sigue funcionando. Si vuelve a pasar, envíanos lo que dice aquí abajo." : "The rest of the app still works. If it happens again, send us what it says below."}
      retry={es ? "Intentar de nuevo" : "Try again"}
      reload={es ? "Recargar la app" : "Reload the app"}
    >
      {children}
    </Guard>
  );
}
