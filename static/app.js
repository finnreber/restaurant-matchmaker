const $ = (s, r = document) => r.querySelector(s);
const split = v => v.split(",").map(s => s.trim()).filter(Boolean);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slots = {a: $("#pa"), b: $("#pb")};
let coords = JSON.parse(localStorage.getItem("coords") || "null"), matches = [], votes = [];

const read = el => ({name: $(".name", el).value || "?", cuisines: split($(".cuisines", el).value),
  dietary: split($(".dietary", el).value), max_price: +$(".price", el).value});

(async () => {  // prefill saved profiles
  try {
    const saved = await (await fetch("/api/profiles")).json();
    for (const [k, el] of Object.entries(slots)) if (saved[k]) {
      $(".name", el).value = saved[k].name; $(".cuisines", el).value = saved[k].cuisines.join(", ");
      $(".dietary", el).value = saved[k].dietary.join(", "); $(".price", el).value = saved[k].max_price;
    }
  } catch {}
})();

if (coords) $("#near").textContent = "Location set ✓";
$("#near").onclick = () => navigator.geolocation.getCurrentPosition(
  p => { coords = {lat: p.coords.latitude, lng: p.coords.longitude}; localStorage.setItem("coords", JSON.stringify(coords)); $("#near").textContent = "Location set ✓"; },
  () => alert("Couldn't get location. Type an area instead."));

$("#go").onclick = async () => {
  const out = $("#results"), people = [read(slots.a), read(slots.b)];
  out.textContent = "Searching…"; $("#go").disabled = true;
  try {
    await Promise.all(["a", "b"].map((k, i) => fetch(`/api/profiles/${k}`, {method: "PUT",
      headers: {"Content-Type": "application/json"}, body: JSON.stringify(people[i])})));
    const res = await fetch("/api/suggest", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({people, area: $("#area").value, radius_km: $("#km").value * 1.609, ...coords})});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Search failed");
    $("#left").textContent = `Google searches left this month: ${data.calls_left}`;
    matches = data.matches; votes = matches.map(() => [0, 0]); render(people);
  } catch (e) { out.textContent = e.message; } finally { $("#go").disabled = false; }
};

function render(people) {
  const out = $("#results");
  if (!matches.length) { out.textContent = "Nothing matched. Loosen price or cuisine."; return; }
  out.innerHTML = matches.map((r, i) => `<article class="card">
    <h3>${esc(r.name)}</h3>
    <div class="meta">${r.distance_km != null ? (r.distance_km * 0.621).toFixed(1) + " mi · " : ""}${r.price ? "$".repeat(r.price) : "price n/a"} · ★ ${r.rating ?? "n/a"} · ${esc(r.address)}</div>
    ${r.cuisines.map(c => `<span class="tag">${esc(c)}</span>`).join("")}
    <div class="vote">${people.map((p, j) => `<button data-i="${i}" data-j="${j}">${esc(p.name)} 👍</button>`).join("")}</div>
    <a href="${esc(r.maps_url)}" target="_blank" rel="noopener">Open in Maps</a></article>`).join("")
    + `<button id="decide" style="margin-top:16px;width:100%">Decide for us</button><div id="verdict"></div>`;
  out.querySelectorAll(".vote button").forEach(b => b.onclick = () => {
    const i = +b.dataset.i, j = +b.dataset.j; votes[i][j] ^= 1; b.classList.toggle("on");
  });
  $("#decide").onclick = async () => {  // most votes wins; ties go to the higher match score
    const best = matches.map((m, i) => [i, votes[i][0] + votes[i][1]])
      .sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0], m = matches[best];
    $("#verdict").innerHTML = `<h2>Tonight: ${esc(m.name)} 🎉</h2>`;
    await fetch("/api/dinners", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({place_id: m.place_id, name: m.name})});
  };
}
