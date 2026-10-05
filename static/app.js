const list = id => document.getElementById(id).value.split(",").map(s => s.trim()).filter(Boolean);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

document.getElementById("go").addEventListener("click", async () => {
  const out = document.getElementById("results");
  out.textContent = "Searching…";
  try {
    const res = await fetch("/api/match", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        city: document.getElementById("city").value,
        cuisines: list("cuisines"), vibes: list("vibes"), dietary: list("dietary"),
        max_price: +document.getElementById("price").value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    out.innerHTML = data.matches.length ? data.matches.map(r => `
      <article class="card">
        <h3>${esc(r.name)}</h3>
        <div class="meta">${esc(r.cuisine)} · ${"$".repeat(r.price_level)} · ★ ${r.rating} · match ${r.score}</div>
        ${[...r.vibes, ...r.dietary].map(t => `<span class="tag">${esc(t)}</span>`).join("")}
      </article>`).join("") : "No matches. Try loosening a dietary need or changing the city.";
  } catch (e) { out.textContent = e.message; }
});
