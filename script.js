// Floating hearts generator (works on all pages)
(() => {
  const layer = document.querySelector(".hearts");
  if (!layer) return;

  const colors = ["#ff5aa8", "#ffd06a", "#7ad0ff", "#ffffff"];

  function spawnHeart() {
    const h = document.createElement("div");
    h.className = "heart";
    const size = 10 + Math.random() * 14;
    h.style.width = `${size}px`;
    h.style.height = `${size}px`;
    h.style.left = `${Math.random() * 100}vw`;
    h.style.bottom = `-10vh`;
    h.style.color = colors[Math.floor(Math.random() * colors.length)];
    const dur = 6 + Math.random() * 6;
    h.style.animationDuration = `${dur}s`;
    h.style.opacity = `${0.35 + Math.random() * 0.55}`;

    layer.appendChild(h);
    setTimeout(() => h.remove(), dur * 1000 + 200);
  }

  // Initial burst
  for (let i = 0; i < 18; i++) setTimeout(spawnHeart, i * 120);

  // Continuous hearts
  setInterval(spawnHeart, 260);
})();

// Runaway "No" button (index page)
(() => {
  const noBtn = document.getElementById("noBtn");
  if (!noBtn) return;

  noBtn.addEventListener("click", () => {
    // hide the button
    noBtn.style.opacity = "0";
    noBtn.style.transform = "scale(0.9)";
    noBtn.style.pointerEvents = "none";

    // remove it after the fade
    setTimeout(() => noBtn.remove(), 250);

    // optional: show a message
    const msg = document.createElement("p");
    msg.textContent = "You say one ah 😭💔";
    msg.style.marginTop = "16px";
    msg.style.color = "rgba(255,255,255,.75)";
    msg.style.fontSize = "14px";
    msg.style.fontWeight = "600";
    msg.style.textAlign = "center";

    const card = document.querySelector(".center-card");
    if (card) card.appendChild(msg);
  });

  // nice hover feel (optional)
  noBtn.style.transition = "opacity 220ms ease, transform 220ms ease";
})();