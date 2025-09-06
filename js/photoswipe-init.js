import PhotoSwipeLightbox from 'https://unpkg.com/photoswipe@5/dist/photoswipe-lightbox.esm.min.js';

function escapeHtml(s = '') {
  return s.replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function initLightbox() {
  if (!window.falGallery) { requestAnimationFrame(initLightbox); return; }

  const lightbox = new PhotoSwipeLightbox({
    gallery: '.pswp-gallery',
    children: 'a.pswp-item',
    pswpModule: () => import('https://unpkg.com/photoswipe@5/dist/photoswipe.esm.min.js'),
    padding: { top: 60, bottom: 60, left: 16, right: 16 }
  });

  lightbox.on('uiRegister', () => {
    // Download button
    lightbox.pswp.ui.registerElement({
      name: 'download', order: 10, isButton: true, title: 'Download', html: '<span class="pswp-btn-label">Download</span>',
      onClick: async () => {
        const s = lightbox.pswp.currSlide; if (!s) return;
        const src = s.data.src;
        let filename = 'image.png';
        try { const u = new URL(src); const last = u.pathname.split('/').pop(); filename = (last && last.includes('.')) ? last : 'image-' + Date.now() + '.png'; } catch(e) { filename = 'image-' + Date.now() + '.png'; }

        const triggerDownload = (url) => {
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        };

        try {
            if (src.startsWith('data:')) {
              triggerDownload(src);
              return;
            }
            const resp = await fetch(src, {mode:'cors'});
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            triggerDownload(url);
            setTimeout(()=>URL.revokeObjectURL(url), 4000);
        } catch(err) {
            // Fallback: open in new tab if direct download impossible
            triggerDownload(src);
        }
      }
    });
    // Use prompt button
    lightbox.pswp.ui.registerElement({
      name: 'useprompt', order: 11, isButton: true, title: 'Use Prompt', html: '<span class="pswp-btn-label">Prompt</span>',
      onClick: () => { const s = lightbox.pswp.currSlide; if (!s) return; const p = s.data.element?.dataset.prompt || ''; const inp = document.getElementById('prompt'); if (inp) inp.value = p; }
    });
    // Delete button
    lightbox.pswp.ui.registerElement({
      name: 'delete', order: 12, isButton: true, title: 'Delete', html: '<span class="pswp-btn-label">Delete</span>',
      onInit: (el, pswp) => {
        // Hide for non-gallery (result) images; show only if element has data-image-id (saved gallery item)
        const updateVisibility = () => {
          const slide = pswp.currSlide; if (!slide) return; const link = slide.data.element; if (!link) return;
          const inResults = !!link.closest('#result-images');
          const hasImageId = !!link.dataset.imageId; // present only for saved images
            el.style.display = (!inResults && hasImageId) ? '' : 'none';
        };
        pswp.on('change', updateVisibility); pswp.on('afterInit', updateVisibility);
        el.addEventListener('click', () => {
          const s = pswp.currSlide; if (!s) return; const id = s.data.element?.dataset.imageId; if (!id) return;
          if (confirm('Delete this image?')) {
            const g = window.falGallery; g.savedImages = g.savedImages.filter(img => String(img.timestamp) !== String(id)); g.saveImages();
            s.data.element.remove(); g.showInlineGallery(); g.updateMobileGallery(); pswp.close();
          }
        });
      }
    });
    // Metadata overlay
    lightbox.pswp.ui.registerElement({
      name: 'meta', order: 5, appendTo: 'root',
      onInit: (el, pswp) => {
        el.className = 'pswp-meta-overlay';
        const render = () => {
          const slide = pswp.currSlide; if (!slide) return; const link = slide.data.element; if (!link) return;
          const endpoint = link.dataset.endpoint || ''; const prompt = link.dataset.prompt || '';
          let metaObj = {}; try { metaObj = JSON.parse(link.dataset.meta || '{}'); } catch (e) { }
          const hasMeta = metaObj && Object.keys(metaObj).length > 0;
          const metaSection = hasMeta ? `<pre class="meta-json">${escapeHtml(JSON.stringify(metaObj, null, 2))}</pre>` : '';
          el.innerHTML = `<div class="meta-block"><div><strong>Endpoint:</strong> ${escapeHtml(endpoint || 'Unknown')}</div><div><strong>Prompt:</strong> ${escapeHtml(prompt)}</div>${metaSection}</div>`;
        };
        pswp.on('change', render); pswp.on('afterInit', render);
      }
    });
  });

  // Swipe up to delete gesture
  let startY = null, startX = null;
  lightbox.on('pointerDown', e => { startY = e.originalEvent.clientY; startX = e.originalEvent.clientX; });
  lightbox.on('pointerUp', e => {
    if (startY !== null) {
      const dy = e.originalEvent.clientY - startY;
      const dx = Math.abs(e.originalEvent.clientX - startX);
      if (dy < -120 && dx < 80) {
        const slide = lightbox.pswp.currSlide;
        if (slide) {
          const id = slide.data.element?.dataset.imageId;
            if (id && confirm('Delete this image?')) {
              const g = window.falGallery; g.savedImages = g.savedImages.filter(img => String(img.timestamp) !== String(id)); g.saveImages();
              slide.data.element.remove(); g.showInlineGallery(); g.updateMobileGallery(); lightbox.pswp.close();
            }
        }
      }
    }
    startY = null; startX = null;
  });

  lightbox.init();
}

initLightbox();
