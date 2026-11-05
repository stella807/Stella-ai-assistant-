/**
 * The box a client checks to agree. One wording, used at sign-up and again
 * before a first armed booking, so the two cannot drift apart. Like the Terms
 * it points to, it is a draft until counsel has read it.
 */
export interface ConsentCopy {
  label: string;
  terms: string;
  privacy: string;
  disclosures: string;
  armedHeading: string;
  armedBody: string;
  save: string;
  failed: string;
  needed: string;
}

export function consentCopy(lang: "en" | "es"): ConsentCopy {
  if (lang === "es") {
    return {
      label: "Acepto los Términos de servicio, la Política de privacidad y las Divulgaciones al cliente, y entiendo y permito que personal armado (guardaespaldas con licencia) esté conmigo cuando reserve protección armada.",
      terms: "Términos de servicio",
      privacy: "Política de privacidad",
      disclosures: "Divulgaciones al cliente",
      armedHeading: "Antes de reservar protección armada",
      armedBody: "La protección armada la hacen guardaespaldas con licencia de armas y de guardia de seguridad vigentes. Para reservarla, confirma que aceptas los términos y que permites que personal armado esté contigo durante esa reserva.",
      save: "Guardar mi acuerdo",
      failed: "No pudimos guardar tu acuerdo. Intenta de nuevo.",
      needed: "Marca la casilla para continuar.",
    };
  }
  return {
    label: "I agree to the Terms of Service, Privacy Policy and Client Disclosures, and I understand and allow armed personnel (licensed bodyguards) to be with me when I book armed protection.",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    disclosures: "Client Disclosures",
    armedHeading: "Before you book armed protection",
    armedBody: "Armed protection is done by bodyguards who hold current firearms and security-guard licences. To book it, confirm that you agree to the terms and that you allow armed personnel to be with you during that booking.",
    save: "Save my agreement",
    failed: "We couldn't save your agreement. Please try again.",
    needed: "Check the box to continue.",
  };
}
