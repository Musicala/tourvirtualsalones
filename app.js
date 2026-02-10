/* Tour Musicala — app.js (PRO+)
  ✅ Videos locales (./videos/*.mp4)
  ✅ Un solo video activo (evita doble audio)
  ✅ Modal "cine" (video grande)
  ✅ Swipe móvil + teclado
  ✅ Persistencia (localStorage)
  ✅ Copiar/compartir link (URL absoluta) + fallback
  ✅ Botón ▶ abre el archivo (pestaña nueva)
  ✅ A11y: foco, aria-live, ESC
  ✅ Menos recargas innecesarias + prefetch suave
*/

'use strict';

/* =========================
   DATA (AJUSTA SOLO ESTO)
========================= */
const SPOTS = [
  { key: "general", icon: "🏫", title: "Visita general", desc: "Recorrido rápido por la sede", file: "./videos/general.mp4" },
  { key: "stim",    icon: "🌈", title: "Estimulación artística", desc: "Espacios pensados para peques", file: "./videos/estimulacion.mp4" },
  { key: "artes",   icon: "🎨", title: "Artes plásticas", desc: "Materiales, técnica y creación", file: "./videos/artesplasticas.mp4" },
  { key: "danza",   icon: "💃", title: "Salones de danza", desc: "Espacios amplios y cómodos", file: "./videos/danzas.mp4" },
  { key: "musica",  icon: "🎶", title: "Salones de música", desc: "Instrumentos, sonido y clases", file: "./videos/musica.mp4" },
];

/* =========================
   CONFIG
========================= */
const CFG = {
  LS_KEY: "tour_musicala_idx",
  SWIPE_THRESHOLD: 45,
  PREFETCH_NEXT: true,
  PREFETCH_IDLE_DELAY_MS: 420,
  ERROR_TOAST_COOLDOWN_MS: 1200,
};

/* =========================
   HELPERS
========================= */
const $ = (s) => document.querySelector(s);

function clampIndex(i) {
  const n = SPOTS.length;
  return (i + n) % n;
}

function safeFocus(el) {
  try { el?.focus?.(); } catch {}
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function absUrl(relativePath){
  try { return new URL(relativePath, location.href).href; }
  catch { return relativePath; }
}

function isTypingTarget(el){
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

function idle(fn, ms){
  // requestIdleCallback es bonito, pero no siempre existe
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(fn, { timeout: ms });
  } else {
    setTimeout(fn, ms);
  }
}

/* =========================
   ELEMENTS (ids del HTML)
========================= */
const vidMain     = $("#vidMain");
const vidBig      = $("#vidBig");

const videoTitle  = $("#videoTitle");
const videoDesc   = $("#videoDesc");
const pillNow     = $("#pillNow");
const dots        = $("#dots");
const cards       = $("#cards");

const btnPrev     = $("#btnPrev");
const btnNext     = $("#btnNext");
const btnCinema   = $("#btnCinema");
const btnClose    = $("#btnClose");
const btnStart    = $("#btnStart");

// compat: antes era btnCopy, ahora en el index nuevo lo llamamos btnShare
const btnCopy     = $("#btnCopy") || $("#btnShare");

const btnOpenFile = $("#btnOpenFile");

const modal       = $("#modal");
const modalTitle  = $("#modalTitle");
const linkTop     = $("#linkTop");

// opcional (si existe en el HTML)
const ariaStatus  = $("#ariaStatus");

/* =========================
   STATE
========================= */
let idx = 0;
let lastMainSrc = "";   // para evitar recargas
let lastBigSrc  = "";   // idem modal
let lastFocusedEl = null;
let lastErrorToastAt = 0;

try {
  const saved = Number(localStorage.getItem(CFG.LS_KEY));
  if (Number.isFinite(saved) && saved >= 0 && saved < SPOTS.length) idx = saved;
} catch {}

/* =========================
   VIDEO CONTROL
========================= */
function stopVideo(videoEl){
  if (!videoEl) return;
  try {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();
  } catch {}
}

function setVideoSource(videoEl, src, cacheKey){
  if (!videoEl) return;

  // Evita recargar si ya es el mismo src
  if (cacheKey === "main" && src === lastMainSrc) return;
  if (cacheKey === "big"  && src === lastBigSrc)  return;

  try {
    // Para evitar doble audio y estados raros
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.load();

    videoEl.preload = "metadata";
    videoEl.src = src;
    videoEl.load();

    if (cacheKey === "main") lastMainSrc = src;
    if (cacheKey === "big")  lastBigSrc  = src;
  } catch {}
}

function isModalOpen(){
  return !!modal?.classList.contains("is-open");
}

/* =========================
   RENDER
========================= */
function renderDots() {
  if (!dots) return;
  dots.innerHTML = "";

  SPOTS.forEach((s, i) => {
    const b = document.createElement("button");
    b.className = "dot" + (i === idx ? " is-on" : "");
    b.type = "button";
    b.setAttribute("aria-label", `Ir a ${s.title} (${i + 1} de ${SPOTS.length})`);
    b.addEventListener("click", () => go(i));
    dots.appendChild(b);
  });
}

function renderCards() {
  if (!cards) return;
  cards.innerHTML = "";

  SPOTS.forEach((s, i) => {
    const c = document.createElement("div");
    c.className = "card" + (i === idx ? " is-active" : "");
    c.tabIndex = 0;
    c.role = "button";
    c.setAttribute("aria-label", `Abrir ${s.title}`);

    c.innerHTML = `
      <div class="card__icon">${escapeHtml(s.icon)}</div>
      <div class="card__meta">
        <p class="card__title">${escapeHtml(s.title)}</p>
        <p class="card__desc">${escapeHtml(s.desc)}</p>
      </div>
    `;

    c.addEventListener("click", () => go(i));
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go(i);
      }
    });

    cards.appendChild(c);
  });
}

function updateTextUI(){
  const s = SPOTS[idx];

  if (videoTitle) videoTitle.textContent = s.title;
  if (videoDesc)  videoDesc.textContent  = s.desc;
  if (pillNow)    pillNow.textContent    = `${s.icon} ${s.title} · ${idx + 1}/${SPOTS.length}`;
  if (ariaStatus) ariaStatus.textContent = `Mostrando: ${s.title}`;

  // Botón ▶: abrir video en pestaña nueva (cliente-friendly)
  if (btnOpenFile) {
    btnOpenFile.href = s.file;
    btnOpenFile.target = "_blank";
    btnOpenFile.rel = "noopener";
  }
}

function updateVideos(){
  const s = SPOTS[idx];

  if (isModalOpen()){
    // modal manda: solo big
    stopVideo(vidMain);
    setVideoSource(vidBig, s.file, "big");
    vidBig?.play?.().catch(() => {});
  } else {
    setVideoSource(vidMain, s.file, "main");
  }
}

function persist(){
  try { localStorage.setItem(CFG.LS_KEY, String(idx)); } catch {}
}

function updateUI(){
  updateTextUI();
  renderDots();
  renderCards();
  updateVideos();
  persist();

  // prefetch siguiente video (suave, cuando el browser esté libre)
  if (CFG.PREFETCH_NEXT) {
    const nextIdx = clampIndex(idx + 1);
    const nextFile = SPOTS[nextIdx]?.file;
    if (nextFile) idle(() => prefetchVideo(nextFile), CFG.PREFETCH_IDLE_DELAY_MS);
  }
}

/* =========================
   NAV
========================= */
function go(nextIdx){
  idx = clampIndex(nextIdx);
  updateUI();

  if (navigator.vibrate) {
    try { navigator.vibrate(10); } catch {}
  }
}

function next(){ go(idx + 1); }
function prev(){ go(idx - 1); }

/* =========================
   MODAL (CINEMA)
========================= */
function openModal(){
  if (!modal) return;

  lastFocusedEl = document.activeElement;

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");

  const s = SPOTS[idx];
  if (modalTitle) modalTitle.textContent = s.title;

  // evita doble audio
  stopVideo(vidMain);

  // carga big
  setVideoSource(vidBig, s.file, "big");

  // lock scroll
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // play best-effort
  vidBig?.play?.().catch(() => {});

  safeFocus(btnClose);
}

function closeModal(force=false){
  if (!modal) return;
  if (!modal.classList.contains("is-open") && !force) return;

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");

  stopVideo(vidBig);

  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";

  safeFocus(lastFocusedEl);
  lastFocusedEl = null;

  // vuelve el video principal del spot actual
  setVideoSource(vidMain, SPOTS[idx].file, "main");
}

/* =========================
   SHARE / COPY
========================= */
async function shareOrCopyCurrent(){
  const s = SPOTS[idx];
  const url = absUrl(s.file);

  // Si el navegador soporta share (móvil), úsalo
  if (navigator.share) {
    try {
      await navigator.share({ title: `Tour Musicala · ${s.title}`, text: s.desc, url });
      toast("Listo ✅");
      return;
    } catch {
      // si cancelan share, no es error real
    }
  }

  // Clipboard API
  try {
    await navigator.clipboard.writeText(url);
    toast("Enlace copiado ✅");
    return;
  } catch {}

  // Fallback clásico
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    toast("Enlace copiado ✅");
  } catch {
    toast("No se pudo copiar 😅");
  }
}

/* =========================
   PREFETCH (suave)
========================= */
const _prefetched = new Set();
function prefetchVideo(src){
  if (!src) return;
  if (_prefetched.has(src)) return;
  _prefetched.add(src);

  // Esto es “hint”, no garantiza nada, pero ayuda
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "video";
  link.href = src;
  document.head.appendChild(link);
}

/* =========================
   ERRORS (video fail)
========================= */
function onVideoError(){
  const now = Date.now();
  if (now - lastErrorToastAt < CFG.ERROR_TOAST_COOLDOWN_MS) return;
  lastErrorToastAt = now;

  toast("No se pudo cargar el video 😅");
}

function bindVideoErrors(){
  vidMain?.addEventListener("error", onVideoError);
  vidBig?.addEventListener("error", onVideoError);
}

/* =========================
   EVENTS
========================= */
btnNext?.addEventListener("click", next);
btnPrev?.addEventListener("click", prev);

btnStart?.addEventListener("click", () => {
  document.querySelector(".hero")?.scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => safeFocus(btnNext), 350);
});

btnCinema?.addEventListener("click", openModal);
btnClose?.addEventListener("click", () => closeModal());

modal?.addEventListener("click", (e) => {
  const t = e.target;
  if (t && t.dataset && t.dataset.close) closeModal();
});

btnCopy?.addEventListener("click", shareOrCopyCurrent);

linkTop?.addEventListener("click", (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Keyboard (sin sabotear cuando alguien escribe en inputs)
window.addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;

  if (e.key === "Escape") closeModal();
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
});

/* =========================
   SWIPE (mobile)
========================= */
(function enableSwipe(){
  const area = document.querySelector(".hero__card");
  if (!area) return;

  let x0 = null, y0 = null;

  area.addEventListener("touchstart", (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    x0 = t.clientX;
    y0 = t.clientY;
  }, { passive: true });

  area.addEventListener("touchend", (e) => {
    if (x0 == null || y0 == null) return;
    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - x0;
    const dy = t.clientY - y0;

    // ignora scroll vertical
    if (Math.abs(dy) > Math.abs(dx)) { x0 = y0 = null; return; }

    if (dx > CFG.SWIPE_THRESHOLD) prev();
    else if (dx < -CFG.SWIPE_THRESHOLD) next();

    x0 = y0 = null;
  }, { passive: true });
})();

/* =========================
   TOAST
========================= */
let toastTimer = null;
function toast(msg){
  let el = document.getElementById("toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "84px";
    el.style.transform = "translateX(-50%)";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.background = "rgba(255,255,255,.92)";
    el.style.border = "1px solid rgba(12,65,196,.18)";
    el.style.boxShadow = "0 18px 38px rgba(15,23,42,.12)";
    el.style.fontWeight = "800";
    el.style.zIndex = "60";
    el.style.opacity = "0";
    el.style.transition = "opacity .15s ease";
    document.body.appendChild(el);
  }

  el.textContent = msg;
  requestAnimationFrame(() => { el.style.opacity = "1"; });

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 1400);
}

/* =========================
   INIT
========================= */
bindVideoErrors();
updateUI();
