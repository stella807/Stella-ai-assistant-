/* Safehubby website assistant: type or talk, and hear the answer.
 *
 * Plain script, no framework, no inline styles (the site's policy forbids
 * them). Everything a visitor or the model says is written with textContent,
 * never as HTML. Voice uses the browser's own speech recognition and speech
 * synthesis, so there is no extra service or key; where a browser has neither,
 * the mic and the read-aloud toggle simply do not appear and it is a text chat.
 */
(function () {
  var tag = document.currentScript;
  if (!tag) return;
  var endpoint = tag.getAttribute("data-endpoint");
  var lang = tag.getAttribute("data-lang") === "es" ? "es" : "en";
  if (!endpoint) return;

  var T = {
    en: {
      open: "Ask Safehubby", title: "Ask Safehubby", close: "Close", placeholder: "Ask about pricing or how it works",
      send: "Send", mic: "Speak your question", micStop: "Stop listening", listening: "Listening…", thinking: "Thinking…",
      read: "Read answers aloud", note: "AI assistant. It can be wrong, and it is not for emergencies: call 911.",
      voiceNote: "Voice uses your browser's speech service.",
      hello: "Hi! I can answer questions about Safehubby's prices and how it works. What would you like to know?",
      offline: "I could not reach the assistant. You can email contact@safehubby.com and a person will answer.",
      denied: "The microphone is blocked for this site. Allow it in your browser settings, or type your question.",
      ideas: ["How much does it cost?", "What is included in Premium?", "How does the Wingman Club work?", "How does an errand work?"],
      speech: "en-US"
    },
    es: {
      open: "Pregunta a Safehubby", title: "Pregunta a Safehubby", close: "Cerrar", placeholder: "Pregunta por los precios o cómo funciona",
      send: "Enviar", mic: "Di tu pregunta", micStop: "Dejar de escuchar", listening: "Escuchando…", thinking: "Pensando…",
      read: "Leer las respuestas en voz alta", note: "Asistente de IA. Puede equivocarse y no es para emergencias: llama al 911.",
      voiceNote: "La voz usa el servicio de voz de tu navegador.",
      hello: "¡Hola! Puedo responder preguntas sobre los precios de Safehubby y cómo funciona. ¿Qué quieres saber?",
      offline: "No pude comunicarme con el asistente. Escribe a contact@safehubby.com y una persona te contestará.",
      denied: "El micrófono está bloqueado para este sitio. Permítelo en los ajustes del navegador o escribe tu pregunta.",
      ideas: ["¿Cuánto cuesta?", "¿Qué incluye Premium?", "¿Cómo funciona el Wingman Club?", "¿Cómo funciona un mandado?"],
      speech: "es-PR"
    }
  }[lang];

  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var canSpeak = "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  var history = [];
  var busy = false;
  var listening = false;
  var recognizer = null;
  var readAloud = false;

  function el(name, cls, text) {
    var n = document.createElement(name);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  var launcher = el("button", "chat-launcher", T.open);
  launcher.type = "button";
  launcher.setAttribute("aria-haspopup", "dialog");

  var panel = el("section", "chat-panel");
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", T.title);

  var head = el("div", "chat-head");
  head.appendChild(el("strong", "", T.title));
  var closeBtn = el("button", "chat-close", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", T.close);
  head.appendChild(closeBtn);

  var log = el("div", "chat-log");
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");

  var ideas = el("div", "chat-ideas");
  T.ideas.forEach(function (q) {
    var b = el("button", "chat-idea", q);
    b.type = "button";
    b.addEventListener("click", function () { ask(q, false); });
    ideas.appendChild(b);
  });

  var form = el("form", "chat-form");
  var input = el("input", "chat-input");
  input.type = "text";
  input.maxLength = 500;
  input.placeholder = T.placeholder;
  input.setAttribute("aria-label", T.placeholder);
  input.autocomplete = "off";
  var micBtn = null;
  var sendBtn = el("button", "chat-send", T.send);
  sendBtn.type = "submit";
  form.appendChild(input);
  if (Recognition) {
    micBtn = el("button", "chat-mic", "🎤");
    micBtn.type = "button";
    micBtn.setAttribute("aria-label", T.mic);
    form.appendChild(micBtn);
  }
  form.appendChild(sendBtn);

  var foot = el("div", "chat-foot");
  if (canSpeak) {
    var label = el("label", "chat-read");
    var box = el("input");
    box.type = "checkbox";
    box.addEventListener("change", function () { readAloud = box.checked; if (!readAloud) stopSpeaking(); });
    label.appendChild(box);
    label.appendChild(document.createTextNode(" " + T.read));
    foot.appendChild(label);
  }
  foot.appendChild(el("p", "chat-note", T.note + (Recognition ? " " + T.voiceNote : "")));

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(ideas);
  panel.appendChild(form);
  panel.appendChild(foot);
  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  function add(role, text) {
    var m = el("p", "chat-msg chat-" + role, text);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function stopSpeaking() { if (canSpeak) window.speechSynthesis.cancel(); }

  function speak(text) {
    if (!canSpeak || !readAloud) return;
    stopSpeaking();
    var u = new window.SpeechSynthesisUtterance(text);
    u.lang = T.speech;
    window.speechSynthesis.speak(u);
  }

  function stopListening() {
    listening = false;
    if (recognizer) { try { recognizer.stop(); } catch { /* already stopped */ } }
    if (micBtn) { micBtn.classList.remove("on"); micBtn.setAttribute("aria-label", T.mic); }
  }

  function ask(text, spoken) {
    text = String(text || "").trim();
    if (!text || busy) return;
    ideas.hidden = true;
    add("user", text);
    input.value = "";
    history.push({ role: "user", content: text });
    history = history.slice(-12);
    busy = true;
    sendBtn.disabled = true;
    var wait = add("bot", T.thinking);
    wait.classList.add("chat-wait");
    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j && j.error ? j.error : T.offline);
          return j;
        });
      })
      .then(function (j) {
        wait.classList.remove("chat-wait");
        wait.textContent = j.reply;
        history.push({ role: "assistant", content: j.reply });
        // Someone who spoke gets spoken to; someone who typed gets silence unless they asked for it.
        if (spoken && !readAloud && canSpeak) { readAloud = true; box.checked = true; }
        speak(j.reply);
      })
      .catch(function (e) {
        wait.classList.remove("chat-wait");
        wait.classList.add("chat-error");
        wait.textContent = e && e.message && e.message !== "Failed to fetch" ? e.message : T.offline;
        history.pop();
      })
      .then(function () { busy = false; sendBtn.disabled = false; });
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value, false); });

  if (micBtn) {
    micBtn.addEventListener("click", function () {
      if (listening) return stopListening();
      stopSpeaking();
      recognizer = new Recognition();
      recognizer.lang = T.speech;
      recognizer.interimResults = true;
      recognizer.maxAlternatives = 1;
      var finalText = "";
      recognizer.onresult = function (ev) {
        var t = "";
        for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
        finalText = t;
        input.value = t;
      };
      recognizer.onerror = function (ev) {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") add("bot", T.denied).classList.add("chat-error");
        finalText = "";
      };
      recognizer.onend = function () {
        var had = listening;
        stopListening();
        if (had && finalText.trim()) ask(finalText, true);
      };
      listening = true;
      micBtn.classList.add("on");
      micBtn.setAttribute("aria-label", T.micStop);
      input.placeholder = T.listening;
      try { recognizer.start(); } catch { stopListening(); }
    });
  }

  function open() {
    panel.hidden = false;
    launcher.hidden = true;
    if (!log.childNodes.length) add("bot", T.hello);
    input.focus();
  }
  function close() {
    panel.hidden = true;
    launcher.hidden = false;
    stopListening();
    stopSpeaking();
    launcher.focus();
  }
  launcher.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
})();
