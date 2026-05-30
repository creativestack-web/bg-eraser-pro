/* ═══════════════════════════════════════════════════════════
   BG ERASER — script.js
   Full functional logic — remove.bg API integration
   Supports: PNG · JPG · JPEG · SVG · WebP
═══════════════════════════════════════════════════════════ */

'use strict';

/* ─── API CONFIGURATION ─────────────────────────────────────
   Your remove.bg API key has been securely integrated below.
   ─────────────────────────────────────────────────────────── */
const API_KEY      = 'Ae1eLKek9znYXGtRPeAPC4tq';
const API_ENDPOINT = 'https://api.remove.bg/v1.0/removebg';

/* ─── SUPPORTED FORMATS ─────────────────────────────────────
   All MIME types accepted by this tool and the API.
   ─────────────────────────────────────────────────────────── */
const ALLOWED_TYPES = [
  'image/png',
  'image/jpeg',       // covers both .jpg and .jpeg
  'image/webp',
  'image/svg+xml',    // SVG — rasterised server-side by remove.bg
];
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
const MAX_FILE_BYTES      = 10 * 1024 * 1024; // 10 MB

/* ─── DOM REFERENCES ────────────────────────────────────────
   These IDs must match index.html exactly.
   ─────────────────────────────────────────────────────────── */
const uploadZone       = document.getElementById('upload-zone');
const fileInput        = document.getElementById('fileInput');
const uploadPrompt     = document.getElementById('uploadPrompt');
const uploadPreview    = document.getElementById('uploadPreview');
const previewThumb     = document.getElementById('previewThumb');
const fileNameEl       = document.getElementById('fileName');
const fileSizeEl       = document.getElementById('fileSize');
const btnReset         = document.getElementById('btnReset');
const btnRemove        = document.getElementById('btnRemove');
const btnDownload      = document.getElementById('btnDownload');
const heroActions      = document.getElementById('heroActions');
const previewGrid      = document.getElementById('previewGrid');
const originalImg      = document.getElementById('originalImg');
const resultImg        = document.getElementById('resultImg');
const processingOverlay= document.getElementById('processingOverlay');
const progressFill     = document.getElementById('progressFill');
const toastEl          = document.getElementById('toast');
const footerYear       = document.getElementById('footerYear');
const burgerBtn        = document.getElementById('burgerBtn');
const navDrawer        = document.getElementById('navDrawer');

/* ─── STATE ─────────────────────────────────────────────────*/
let selectedFile   = null;   // File object currently staged
let resultBlobURL  = null;   // Object URL of the processed PNG
let toastTimerId   = null;   // Debounce timer for toast

/* ─── INIT ──────────────────────────────────────────────────*/
(function init() {
  // Footer year
  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // Scroll-reveal observer
  initScrollReveal();

  // Mobile nav
  if (burgerBtn) {
    burgerBtn.addEventListener('click', toggleMobileNav);
  }

  // Close nav when a drawer link is clicked
  if (navDrawer) {
    navDrawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMobileNav);
    });
  }
})();

/* ═══════════════════════════════════════════════════════════
   SCROLL REVEAL
═══════════════════════════════════════════════════════════ */
function initScrollReveal() {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger siblings within the same parent
        const siblings = [...entry.target.parentElement.children];
        const idx      = siblings.indexOf(entry.target);
        entry.target.style.transitionDelay = `${idx * 0.07}s`;
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  targets.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════
   MOBILE NAVIGATION
═══════════════════════════════════════════════════════════ */
function toggleMobileNav() {
  const isOpen = navDrawer.classList.toggle('open');
  burgerBtn.setAttribute('aria-expanded', isOpen);
  navDrawer.setAttribute('aria-hidden',  !isOpen);
}
function closeMobileNav() {
  navDrawer.classList.remove('open');
  burgerBtn.setAttribute('aria-expanded', 'false');
  navDrawer.setAttribute('aria-hidden', 'true');
}

/* ═══════════════════════════════════════════════════════════
   UTILITY HELPERS
═══════════════════════════════════════════════════════════ */

/** Format bytes → human-readable string */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const units = ['Bytes','KB','MB','GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${units[i]}`;
}

/** Truncate long filenames for display */
function truncateName(name, max = 38) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf('.');
  const ext = dot !== -1 ? name.slice(dot) : '';
  return `${name.slice(0, max - ext.length - 1)}…${ext}`;
}

/** Show a transient toast notification */
function showToast(msg, type = '', duration = 5000) {
  if (toastTimerId) clearTimeout(toastTimerId);
  toastEl.textContent = msg;
  toastEl.className   = `toast${type ? ` toast--${type}` : ''}`;
  void toastEl.offsetHeight; // force reflow → restart transition
  toastEl.classList.add('show');
  toastTimerId = setTimeout(() => toastEl.classList.remove('show'), duration);
}

/** Toggle the processing overlay */
function setProcessing(active) {
  processingOverlay.classList.toggle('active', active);
  processingOverlay.setAttribute('aria-hidden', String(!active));
  btnRemove.disabled = active;
  btnRemove.setAttribute('aria-disabled', String(active));

  // Animate overlay step indicators when activating
  if (active) animateOverlaySteps();
}

/** Cycle through overlay step labels */
function animateOverlaySteps() {
  const steps = processingOverlay.querySelectorAll('.ostep');
  let idx = 0;
  steps.forEach(s => s.classList.remove('ostep--active'));
  steps[0].classList.add('ostep--active');

  const interval = setInterval(() => {
    steps[idx]?.classList.remove('ostep--active');
    idx = (idx + 1) % steps.length;
    steps[idx]?.classList.add('ostep--active');

    // Stop cycling once overlay is hidden
    if (!processingOverlay.classList.contains('active')) clearInterval(interval);
  }, 1100);
}

/* ═══════════════════════════════════════════════════════════
   FILE VALIDATION
═══════════════════════════════════════════════════════════ */
function validateFile(file) {
  // Check MIME type (primary check)
  if (ALLOWED_TYPES.includes(file.type)) return { ok: true };

  // Fallback: check file extension (handles cases where browser reports wrong MIME)
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) return { ok: true };

  // Size check (secondary — do after format check to give the right error first)
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      error: `File too large (${formatBytes(file.size)}). Maximum is 10 MB.`,
    };
  }

  return {
    ok: false,
    error: `Unsupported format. Please upload a PNG, JPG, JPEG, SVG, or WebP image.`,
  };
}

/* ═══════════════════════════════════════════════════════════
   FILE SELECTION & STAGING
═══════════════════════════════════════════════════════════ */
function stageFile(file) {
  // Size check (always run)
  if (file.size > MAX_FILE_BYTES) {
    showToast(`⚠️ File too large (${formatBytes(file.size)}). Maximum allowed is 10 MB.`, 'error');
    return;
  }

  // Format check
  const ext   = '.' + file.name.split('.').pop().toLowerCase();
  const valid = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(ext);
  if (!valid) {
    showToast('⚠️ Unsupported format. Please upload a PNG, JPG, JPEG, SVG, or WebP image.', 'error');
    return;
  }

  // Release previous object URLs to avoid memory leaks
  if (previewThumb.src.startsWith('blob:')) URL.revokeObjectURL(previewThumb.src);
  if (resultBlobURL) { URL.revokeObjectURL(resultBlobURL); resultBlobURL = null; }

  selectedFile = file;

  // Build a preview — SVG can use the file URL directly; raster types render fine too
  const objectURL = URL.createObjectURL(file);
  previewThumb.src = objectURL;
  previewThumb.alt = file.name;
  fileNameEl.textContent = truncateName(file.name);
  fileSizeEl.textContent  = formatBytes(file.size);

  // Switch UI state
  uploadPrompt.hidden  = true;
  uploadPreview.hidden = false;
  previewGrid.hidden   = true;

  // Enable the primary CTA
  btnRemove.disabled = false;
  btnRemove.removeAttribute('aria-disabled');
}

/* ─── Drag & Drop ───────────────────────────────────────── */
uploadZone.addEventListener('dragenter', e => {
  e.preventDefault();
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  uploadZone.classList.add('drag-over');
});
uploadZone.addEventListener('dragleave', e => {
  if (!uploadZone.contains(e.relatedTarget)) {
    uploadZone.classList.remove('drag-over');
  }
});
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files?.[0];
  if (file) stageFile(file);
});

/* ─── Click to Browse ───────────────────────────────────── */
uploadZone.addEventListener('click', e => {
  if (e.target.closest('#btnReset')) return; // don't re-open on reset click
  fileInput.click();
});
uploadZone.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('#btnReset')) {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) {
    stageFile(fileInput.files[0]);
    fileInput.value = ''; // allow re-selecting the same file
  }
});

/* ─── Clipboard Paste ───────────────────────────────────── */
document.addEventListener('paste', e => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      e.preventDefault();
      const file = item.getAsFile();
      if (file) {
        stageFile(file);
        showToast('📋 Image pasted from clipboard!', 'success', 2500);
      }
      break;
    }
  }
});

/* ─── Reset ─────────────────────────────────────────────── */
btnReset.addEventListener('click', e => {
  e.stopPropagation();
  resetTool();
});

function resetTool() {
  selectedFile = null;
  if (previewThumb.src.startsWith('blob:')) URL.revokeObjectURL(previewThumb.src);
  if (resultBlobURL) { URL.revokeObjectURL(resultBlobURL); resultBlobURL = null; }

  previewThumb.src = '';
  uploadPrompt.hidden  = false;
  uploadPreview.hidden = true;
  previewGrid.hidden   = true;
  fileInput.value      = '';

  btnRemove.disabled = true;
  btnRemove.setAttribute('aria-disabled', 'true');
}

/* ═══════════════════════════════════════════════════════════
   BACKGROUND REMOVAL — remove.bg API
═══════════════════════════════════════════════════════════ */
btnRemove.addEventListener('click', removeBackground);

async function removeBackground() {
  /* Guard: API key not set */
  if (!API_KEY || API_KEY === 'YOUR_API_KEY_HERE') {
    showToast(
      '⚠️ No API key configured. Add your remove.bg key to script.js (Ae1eLKek9znYXGtRPeAPC4tq).',
      'error', 8000
    );
    return;
  }

  /* Guard: no file selected */
  if (!selectedFile) {
    showToast('⚠️ Please select an image first.', 'error');
    return;
  }

  setProcessing(true);

  try {
    /* Build multipart form payload */
    const formData = new FormData();
    formData.append('image_file', selectedFile);
    formData.append('size', 'auto');  // 'auto' = best quality for the plan tier

    /* Call remove.bg API */
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY },
      body: formData,
    });

    /* Handle non-OK HTTP responses */
    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        errMsg = errJson?.errors?.[0]?.title || errMsg;
      } catch (_) { /* JSON parse failed — use status string */ }
      throw new Error(errMsg);
    }

    /* Parse binary PNG response */
    const blob      = await response.blob();
    resultBlobURL   = URL.createObjectURL(blob);

    /* Populate comparison panels */
    originalImg.src = URL.createObjectURL(selectedFile); // fresh URL (old one released on next reset)
    originalImg.alt = `${selectedFile.name} — original`;
    resultImg.src   = resultBlobURL;
    resultImg.alt   = `${selectedFile.name} — background removed`;

    /* Reveal result grid */
    previewGrid.hidden = false;

    /* Smooth scroll to result */
    setTimeout(() => {
      previewGrid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    showToast('✅ Background removed! Download your HD PNG below.', 'success');

  } catch (err) {
    console.error('[BG Eraser] API error:', err);
    showToast(humanizeError(err.message), 'error', 8000);

  } finally {
    setProcessing(false);
  }
}

/** Map technical API errors to friendly user messages */
function humanizeError(raw = '') {
  const msg = raw.toLowerCase();
  if (msg.includes('credit') || msg.includes('insufficient'))
    return '❌ remove.bg API credits exhausted. Please top up your account at remove.bg.';
  if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden'))
    return '❌ Invalid API key. Double-check the API_KEY value at the top of script.js.';
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed'))
    return '❌ Network error. Please check your internet connection and try again.';
  if (msg.includes('422') || msg.includes('unprocessable'))
    return '❌ This image could not be processed. Try a different photo with a clearer subject.';
  if (msg.includes('429') || msg.includes('rate limit'))
    return '❌ API rate limit reached. Please wait a moment before trying again.';
  if (msg.includes('413') || msg.includes('too large'))
    return '❌ Image too large for the API. Try a file under 10 MB.';
  return `❌ Something went wrong: ${raw || 'unknown error'}. Please try again.`;
}

/* ═══════════════════════════════════════════════════════════
   DOWNLOAD
═══════════════════════════════════════════════════════════ */
btnDownload.addEventListener('click', downloadResult);

function downloadResult() {
  if (!resultBlobURL) {
    showToast('⚠️ No result available yet. Please remove a background first.', 'error');
    return;
  }
  const base      = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'image';
  const filename = `${base}-bg-removed.png`;

  const a = Object.assign(document.createElement('a'), {
    href:     resultBlobURL,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showToast('📥 Download started — enjoy your transparent PNG!', 'success', 3000);
}

/* ═══════════════════════════════════════════════════════════
   SMOOTH SCROLL — honour sticky header height
═══════════════════════════════════════════════════════════ */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const id     = this.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const headerH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--header-h')
    ) || 70;
    const top = target.getBoundingClientRect().top + window.scrollY - headerH - 12;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});