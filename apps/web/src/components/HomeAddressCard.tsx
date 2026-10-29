import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { LiveMap } from "./LiveMap.tsx";
import { currentFix, locationAlreadyAllowed } from "../native/location.ts";
import { useLanguage } from "../i18n.tsx";

// Only a starting view until there is a saved address or a real fix: San Juan, where the service runs.
const START = { lat: 18.4655, lng: -66.1057 };

/**
 * Where "Get home" rides and supply drop-offs go, saved once in account
 * settings so nobody has to set it in the middle of getting a ride. It is the
 * same address the Rides screen saves; this is just the place to do it
 * calmly, with the pin where the door is.
 */
export function HomeAddressCard() {
  const { language } = useLanguage();
  const es = language === "es";
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [pin, setPin] = useState(START);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.homeAddress().then((r) => {
      if (r.address) { setSaved(r.address); setPin({ lat: r.address.lat, lng: r.address.lng }); setLabel(r.address.label); }
      else {
        // Ask only if the browser already allows it: a cold prompt on opening settings gets a reflex "no".
        locationAlreadyAllowed().then((ok) => (ok ? currentFix() : null)).then((f) => { if (f) setPin({ lat: f.lat, lng: f.lng }); }).catch(() => {});
      }
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = await api.saveHomeAddress(pin.lat, pin.lng, label.trim() || (es ? "Casa" : "Home"));
      setSaved(r.address); setLabel(r.address.label);
      setNote(es ? "Guardada. Los viajes a casa y las entregas van aquí." : "Saved. Rides home and deliveries go here.");
    } catch (e) {
      setError(e instanceof Error ? e.message : es ? "No se pudo guardar" : "That did not save");
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return null;
  const moved = !saved || saved.lat !== pin.lat || saved.lng !== pin.lng || saved.label !== label.trim();

  return (
    <section className="card stack" aria-label={es ? "Dirección de casa" : "Home address"}>
      <h3 style={{ margin: 0 }}>{es ? "Mi dirección de casa" : "My home address"}</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {saved
          ? (es ? `Guardada: ${saved.label}. Mueve el pin para cambiarla.` : `Saved: ${saved.label}. Move the pin to change it.`)
          : (es ? "Guárdala una vez y tus viajes a casa y entregas ya sabrán adónde ir." : "Save it once and your rides home and deliveries already know where to go.")}
      </p>
      <LiveMap points={[{ lat: pin.lat, lng: pin.lng, label: es ? "Casa" : "Home" }]} onPick={setPin} onLocate={currentFix} height={260} />
      <p className="tiny muted" style={{ margin: 0 }}>
        {es ? "Arrastra el pin o toca el mapa donde está la puerta. Toca Mi ubicación si estás en casa." : "Drag the pin, or tap the map, where the door is. Tap My location if you are home."}
      </p>
      <div className="field">
        <label htmlFor="home-address-label" className="tiny muted">{es ? "Nombre o dirección (para el chofer)" : "Name or address (shown to the driver)"}</label>
        <input id="home-address-label" type="text" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)}
          placeholder={es ? "Casa, Calle Luna 12, Apt 3" : "Home, 12 Luna St, Apt 3"} />
      </div>
      <button className="btn btn-primary btn-block" disabled={busy || !moved} onClick={() => void save()}>
        {es ? "Guardar dirección" : "Save address"}
      </button>
      {note && <div className="banner banner-safe">{note}</div>}
      {error && <div className="banner banner-danger" role="alert">{error}</div>}
    </section>
  );
}
