// Runs before the page paints, so a saved light choice never flashes dark first.
// External rather than inline because the server's Content-Security-Policy allows no inline scripts.
try {
  if (localStorage.getItem("safehubby-theme") === "light") {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.background = "#f6f1e7";
    document.querySelector('meta[name="theme-color"]').setAttribute("content", "#f6f1e7");
  }
} catch (e) { /* storage blocked: stay dark */ }
