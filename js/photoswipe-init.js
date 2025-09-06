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
    // Create custom button container in bottom area
    lightbox.pswp.ui.registerElement({
      name: 'custom-buttons',
      order: 9,
      appendTo: 'wrapper',
      onInit: (el, pswp) => {
        el.className = 'pswp-custom-buttons';
        el.style.cssText = `
          position: absolute !important;
          bottom: 80px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          display: flex !important;
          gap: 0.4rem !important;
          z-index: 1000 !important;
          pointer-events: none !important;
        `;
        
        // Create download button
        const downloadBtn = document.createElement('button');
        downloadBtn.innerHTML = '<span class="pswp-btn-label">Download</span>';
        downloadBtn.style.cssText = `
          background: #3b82f6 !important;
          color: #ffffff !important;
          border: 1px solid #3b82f6 !important;
          border-radius: 6px !important;
          font-size: 0.8rem !important;
          font-weight: 500 !important;
          padding: 0.4rem 0.8rem !important;
          height: 32px !important;
          min-width: 80px !important;
          width: auto !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
          opacity: 1 !important;
          pointer-events: auto !important;
        `;
        
        // Create prompt button
        const promptBtn = document.createElement('button');
        promptBtn.innerHTML = '<span class="pswp-btn-label">Prompt</span>';
        promptBtn.style.cssText = `
          background: #ffffff !important;
          color: #475569 !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 6px !important;
          font-size: 0.8rem !important;
          font-weight: 500 !important;
          padding: 0.4rem 0.8rem !important;
          height: 32px !important;
          min-width: 80px !important;
          width: auto !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
          opacity: 1 !important;
          pointer-events: auto !important;
        `;
        
        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<span class="pswp-btn-label">Delete</span>';
        deleteBtn.style.cssText = `
          background: #dc2626 !important;
          color: #ffffff !important;
          border: 1px solid #dc2626 !important;
          border-radius: 6px !important;
          font-size: 0.8rem !important;
          font-weight: 500 !important;
          padding: 0.4rem 0.8rem !important;
          height: 32px !important;
          min-width: 80px !important;
          width: auto !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          cursor: pointer !important;
          transition: all 0.15s ease !important;
          box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;
          opacity: 1 !important;
          pointer-events: auto !important;
        `;
        
        // Download functionality
        downloadBtn.addEventListener('click', async () => {
          const s = pswp.currSlide; if (!s) return;
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
              triggerDownload(src);
          }
        });
        
        // Prompt functionality
        promptBtn.addEventListener('click', () => {
          const s = pswp.currSlide; if (!s) return;
          const p = s.data.element?.dataset.prompt || '';
          const inp = document.getElementById('prompt');
          if (inp) inp.value = p;
        });
        
        // Delete functionality and visibility
        const updateDeleteVisibility = () => {
          const slide = pswp.currSlide; if (!slide) return; const link = slide.data.element; if (!link) return;
          const inResults = !!link.closest('#result-images');
          const hasImageId = !!link.dataset.imageId;
          deleteBtn.style.display = (!inResults && hasImageId) ? 'inline-flex' : 'none';
        };
        
        deleteBtn.addEventListener('click', () => {
          const s = pswp.currSlide; if (!s) return; const id = s.data.element?.dataset.imageId; if (!id) return;
          if (confirm('Delete this image?')) {
            const g = window.falGallery; g.savedImages = g.savedImages.filter(img => String(img.timestamp) !== String(id)); g.saveImages();
            s.data.element.remove(); g.showInlineGallery(); g.updateMobileGallery(); pswp.close();
          }
        });
        
        pswp.on('change', updateDeleteVisibility);
        pswp.on('afterInit', updateDeleteVisibility);
        
        el.appendChild(downloadBtn);
        el.appendChild(promptBtn);
        el.appendChild(deleteBtn);
      }
    });
    // Metadata overlay
    lightbox.pswp.ui.registerElement({
      name: 'meta', order: 5, appendTo: 'root',
      onInit: (el, pswp) => {
        el.className = 'pswp-meta-overlay';
        const render = async () => {
          const slide = pswp.currSlide; if (!slide) return; const link = slide.data.element; if (!link) return;
          const endpoint = link.dataset.endpoint || ''; 
          const prompt = link.dataset.prompt || '';
          
          // Get image info
          let imageInfo = '';
          try {
            const img = slide.content?.element;
            if (img && img.tagName === 'IMG') {
              const naturalWidth = img.naturalWidth;
              const naturalHeight = img.naturalHeight;
              
              // Get file type from URL
              const src = slide.data.src || '';
              let fileType = 'Unknown';
              let fileSize = '';
              
              // Extract file extension
              try {
                const url = new URL(src);
                const pathname = url.pathname.toLowerCase();
                if (pathname.includes('.png')) fileType = 'PNG';
                else if (pathname.includes('.jpg') || pathname.includes('.jpeg')) fileType = 'JPEG';
                else if (pathname.includes('.webp')) fileType = 'WebP';
                else if (pathname.includes('.gif')) fileType = 'GIF';
                else if (pathname.includes('.svg')) fileType = 'SVG';
                else if (src.startsWith('data:image/')) {
                  const dataType = src.split(';')[0].split(':')[1];
                  fileType = dataType.split('/')[1].toUpperCase();
                }
              } catch (e) {
                // Keep fileType as 'Unknown'
              }
              
              // Try to get file size
              try {
                if (!src.startsWith('data:')) {
                  const response = await fetch(src, { method: 'HEAD', mode: 'cors' });
                  const contentLength = response.headers.get('content-length');
                  if (contentLength) {
                    const bytes = parseInt(contentLength);
                    if (bytes < 1024) {
                      fileSize = `${bytes} B`;
                    } else if (bytes < 1024 * 1024) {
                      fileSize = `${(bytes / 1024).toFixed(1)} KB`;
                    } else {
                      fileSize = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                    }
                  }
                }
              } catch (e) {
                // Size unavailable
              }
              
              imageInfo = `<div><strong>Size:</strong> ${naturalWidth} × ${naturalHeight}px</div>`;
              imageInfo += `<div><strong>Type:</strong> ${fileType}`;
              if (fileSize) imageInfo += ` (${fileSize})`;
              imageInfo += `</div>`;
            }
          } catch (e) {
            // Fallback if image info unavailable
          }
          
          let metaObj = {}; try { metaObj = JSON.parse(link.dataset.meta || '{}'); } catch (e) { }
          const hasMeta = metaObj && Object.keys(metaObj).length > 0;
          const metaSection = hasMeta ? `<pre class="meta-json">${escapeHtml(JSON.stringify(metaObj, null, 2))}</pre>` : '';
          el.innerHTML = `<div class="meta-block">${imageInfo}<div><strong>Endpoint:</strong> ${escapeHtml(endpoint || 'Unknown')}</div><div><strong>Prompt:</strong> ${escapeHtml(prompt)}</div>${metaSection}</div>`;
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
