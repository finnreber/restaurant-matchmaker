const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const post = (u, b, m = "POST") => fetch(u, {method: m, headers: {"Content-Type": "application/json"}, body: JSON.stringify(b)});

const CUISINES = ["Italian","Japanese","Mexican","Thai","Indian","Chinese","Korean","Vietnamese","American","Mediterranean","Pizza","Burgers","Seafood","BBQ"];
const DIET = ["Vegetarian","Vegan","Gluten-free","Halal","Kosher","Dairy-free"];
const PTS = {pass: -2, like: 1, love: 3, super: 5, veto: "veto"};
const S = {people: [{name: "Me", cuisines: [], dietary: [], max_price: 2}, {name: "Her", cuisines: [], dietary: [], max_price: 2}],
  coords: JSON.parse(localStorage.getItem("coords") || "null"), matches: [], votes: [[], []], used: [{s: 0, v: 0}, {s: 0, v: 0}], voter: 0, i: 0};

const show = v => {
  ["setup", "vote", "reveal"].forEach(id => $("#" + id).hidden = id !== v);
  document.querySelectorAll(".steps li").forEach(li => li.classList.toggle("on", li.dataset.s === v));
  window.scrollTo(0, 0);
};

/* ---------- setup ---------- */
function chipGroup(opts, sel) {
  const w = el("div", "chips");
  const draw = () => w.replaceChildren(...[...new Set([...opts, ...sel])].map(o => {
    const b = el("button", "chip", o); b.type = "button"; b.setAttribute("aria-pressed", sel.includes(o));
    b.onclick = () => { const k = sel.indexOf(o); k < 0 ? sel.push(o) : sel.splice(k, 1); draw(); };
    return b;
  }));
  draw(); w.add = o => { if (o && !sel.includes(o)) sel.push(o); draw(); };
  return w;
}

function panel(i) {
  const p = S.people[i], f = el("fieldset", "panel");
  f.innerHTML = `<legend>Person ${i + 1}</legend>
    <label class="f">Name <input class="nm" value="${esc(p.name)}"></label>
    <h4>Cuisines</h4><div class="cu"></div><input class="add" placeholder="Add another, press Enter">
    <h4>Dietary</h4><div class="di"></div>
    <h4>Max price</h4><div class="seg">${[1,2,3,4].map(n => `<button type="button" data-n="${n}" aria-pressed="${p.max_price === n}">${"$".repeat(n)}</button>`).join("")}</div>`;
  $(".nm", f).oninput = e => p.name = e.target.value || "?";
  const cu = chipGroup(CUISINES, p.cuisines); $(".cu", f).replaceWith(cu);
  $(".add", f).onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); cu.add(e.target.value.trim()); e.target.value = ""; } };
  $(".di", f).replaceWith(chipGroup(DIET, p.dietary));
  f.querySelectorAll(".seg button").forEach(b => b.onclick = () => {
    p.max_price = +b.dataset.n; f.querySelectorAll(".seg button").forEach(x => x.setAttribute("aria-pressed", x === b));
  });
  return f;
}

(async () => {
  try { const s = await (await fetch("/api/profiles")).json(); ["a", "b"].forEach((k, i) => s[k] && Object.assign(S.people[i], s[k])); } catch {}
  S.people.forEach((_, i) => $("#people").append(panel(i)));
})();

if (S.coords) $("#near").textContent = "📍 Location set ✓";
$("#mi").oninput = e => $("#miv").textContent = e.target.value;
$("#near").onclick = () => navigator.geolocation.getCurrentPosition(p => {
  S.coords = {lat: p.coords.latitude, lng: p.coords.longitude}; localStorage.setItem("coords", JSON.stringify(S.coords));
  $("#near").textContent = "📍 Location set ✓";
}, () => alert("Couldn't get location. Type an area instead."));

$("#go").onclick = async () => {
  const b = $("#go"), msg = $("#msg"); b.disabled = true; msg.textContent = "Finding places you'll both like…";
  try {
    await Promise.all(["a", "b"].map((k, i) => post(`/api/profiles/${k}`, S.people[i], "PUT")));
    const r = await post("/api/suggest", {people: S.people, area: $("#area").value, radius_km: $("#mi").value * 1.609, ...S.coords});
    let d; try { d = JSON.parse(await r.text()); } catch { throw new Error(`Server error (HTTP ${r.status}). Check the Flask terminal.`); }
    if (!r.ok) throw new Error(d.error || "Search failed");
    $("#left").textContent = `Google searches left this month: ${d.calls_left}`;
    if (!d.matches.length) { msg.textContent = "Nothing matched. Try fewer filters or a wider distance."; return; }
    Object.assign(S, {matches: d.matches, votes: [[], []], used: [{s: 0, v: 0}, {s: 0, v: 0}], voter: 0, i: 0});
    msg.textContent = ""; show("vote"); card();
  } catch (e) { msg.textContent = e.message; } finally { b.disabled = false; }
};

/* ---------- voting (blind, one person at a time) ---------- */
const photo = m => m.photo
  ? `<img src="/api/photo?name=${encodeURIComponent(m.photo.name)}" alt="${esc(m.name)}" onerror="this.outerHTML='<div class=noph>🍽️</div>'"><small>Photo: ${esc(m.photo.author)}</small>`
  : `<div class="noph">🍽️</div>`;
const meta = m => [m.distance_km != null ? (m.distance_km * .621).toFixed(1) + " mi" : "", m.price ? "$".repeat(m.price) : "", m.rating ? "★ " + m.rating : ""].filter(Boolean).join(" · ");

function card() {
  const v = S.voter, m = S.matches[S.i], u = S.used[v], box = $("#vote");
  box.innerHTML = `<p><b>${esc(S.people[v].name)}'s turn</b> <span class="meta">· ${S.i + 1} of ${S.matches.length}</span></p>
    <div class="bar"><i style="width:${S.i / S.matches.length * 100}%"></i></div>
    <article class="vcard"><div class="ph">${photo(m)}</div><div class="body"><h2>${esc(m.name)}</h2>
      <p class="meta">${esc(meta(m))}</p>${m.reasons.map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div></article>
    <div class="acts"><button class="b pass" data-a="pass">👎 Pass</button><button class="b like" data-a="like">👍 Like</button><button class="b love" data-a="love">🔥 Love</button></div>
    <div class="tokens"><button class="b ghost" data-a="super" ${u.s ? "disabled" : ""}>⭐ Super pick (${1 - u.s} left)</button>
      <button class="b ghost" data-a="veto" ${u.v ? "disabled" : ""}>🚫 Veto (${1 - u.v} left)</button></div>`;
  box.querySelectorAll("[data-a]").forEach(b => b.onclick = () => cast(b.dataset.a));
}

function cast(a) {
  const v = S.voter;
  if (a === "super") S.used[v].s = 1; if (a === "veto") S.used[v].v = 1;
  S.votes[v][S.i] = PTS[a];
  if (++S.i < S.matches.length) return card();
  if (v === 0) {
    S.voter = 1; S.i = 0;
    $("#vote").innerHTML = `<div class="center"><div class="big">🤫</div><h2>Votes locked in!</h2>
      <p>Pass the device to <b>${esc(S.people[1].name)}</b>. No peeking.</p><button class="b primary" id="ready">I'm ready</button></div>`;
    $("#ready").onclick = card; return;
  }
  reveal();
}

/* ---------- reveal ---------- */
const nrm = x => x === -2 ? 0 : x === 1 ? .6 : x === 3 ? .9 : 1;
const em = x => ({"-2": "👎", 1: "👍", 3: "🔥", 5: "⭐"}[x] || "🚫");
const medal = n => n === 2 ? "🥈" : n === 3 ? "🥉" : `#${n}`;

function confetti() {
  const e = ["🎉","🍕","🍣","🍝","🌮","🍰"];
  for (let i = 0; i < 36; i++) {
    const c = el("i", "conf", e[i % 6]);
    c.style.cssText = `left:${Math.random() * 100}vw;animation-delay:${Math.random() * .8}s;font-size:${16 + Math.random() * 16}px`;
    document.body.append(c); setTimeout(() => c.remove(), 3800);
  }
}

function reveal() {
  show("reveal");
  const [A, B] = S.people, box = $("#reveal");
  const rows = S.matches.map((m, i) => {
    const a = S.votes[0][i], b = S.votes[1][i];
    if (a === "veto" || b === "veto") return {m, out: a === "veto" ? A.name : B.name};
    const x = nrm(a), y = nrm(b);
    return {m, a, b, pct: Math.round(100 * (x + y) / 2 * (1 - .3 * Math.abs(x - y)))};
  });
  const ok = rows.filter(r => !r.out).sort((p, q) => q.pct - p.pct || q.m.score - p.m.score), vetoed = rows.filter(r => r.out);
  if (!ok.length) {
    box.innerHTML = `<div class="center"><div class="big">😅</div><h2>Everything got vetoed</h2><button class="b primary" id="again">Start over</button></div>`;
    $("#again").onclick = () => show("setup"); return;
  }
  const w = ok[0], rs = ok.slice(1, 5), wd = rs.length * .6 + 1;
  const rowHtml = rs.map((r, k) => ({r, n: k + 2})).reverse().map((o, k) => `<div class="row pop" style="animation-delay:${k * .6 + .4}s">
    <span class="medal">${medal(o.n)}</span><b>${esc(o.r.m.name)}</b><span class="pct">${em(o.r.a)}${em(o.r.b)} ${o.r.pct}%</span>
    <div class="bar"><i style="width:${o.r.pct}%"></i></div></div>`).join("");
  box.innerHTML = `<p class="center meta">Drumroll… 🥁</p>${rowHtml}
    <article class="win pop" style="animation-delay:${wd}s"><div class="ph">${photo(w.m)}</div><div class="body">
      <span class="medal">🥇</span><h2>${esc(w.m.name)}</h2><div class="pctbig">${w.pct}% match</div>
      <p class="meta">${esc(A.name)} ${em(w.a)} · ${esc(B.name)} ${em(w.b)} · ${esc(meta(w.m))}</p>
      ${w.m.reasons.map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div></article>
    ${vetoed.length ? `<p class="meta">🚫 Vetoed: ${vetoed.map(r => esc(`${r.m.name} (${r.out})`)).join(", ")}</p>` : ""}
    <div class="tokens"><button class="b primary" id="here">We're going here 🎉</button><button class="b ghost" id="again">Start over</button></div>`;
  setTimeout(confetti, wd * 1000);
  $("#again").onclick = () => show("setup");
  $("#here").onclick = async e => {
    e.target.disabled = true; await post("/api/dinners", {place_id: w.m.place_id, name: w.m.name}); e.target.textContent = "Saved. Enjoy dinner! 🍽️";
  };
}