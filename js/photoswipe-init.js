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

  lightbox.on('uiRegister', function() {
    // Override default close button with Fluent Icon
    lightbox.pswp.ui.registerElement({
      name: 'close',
      order: 20,
      isButton: true,
      html: {
        isCustomSVG: true,
        inner: '<path d="m4.21 4.387.083-.094a1 1 0 0 1 1.32-.083l.094.083L12 10.585l6.293-6.292a1 1 0 1 1 1.414 1.414L13.415 12l6.292 6.293a1 1 0 0 1 .083 1.32l-.083.094a1 1 0 0 1-1.32.083l-.094-.083L12 13.415l-6.293 6.292a1 1 0 0 1-1.414-1.414L10.585 12 4.293 5.707a1 1 0 0 1-.083-1.32l.083-.094-.083.094Z"/>',
        outlineID: 'pswp__icn-close'
      },
      onInit: (el, pswp) => {
        el.setAttribute('title', 'Close (Esc)');
        el.setAttribute('data-custom', 'true');
        el.addEventListener('click', () => { pswp.close(); });
      }
    });

    // Override default zoom button with Fluent Icon  
    lightbox.pswp.ui.registerElement({
      name: 'zoom',
      order: 10,
      isButton: true,
      html: {
        isCustomSVG: true,
        inner: '<path d="M10 2.5a7.5 7.5 0 0 1 5.964 12.048l4.743 4.744a1 1 0 0 1-1.32 1.497l-.094-.083-4.744-4.743A7.5 7.5 0 1 1 10 2.5Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm-2.5 5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1H8a.5.5 0 0 1-.5-.5Zm2-2a.5.5 0 0 1 .5-.5.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5.5.5 0 0 1-.5-.5v-4Z"/>',
        outlineID: 'pswp__icn-zoom'
      },
      onInit: (el, pswp) => {
        el.setAttribute('title', 'Zoom in/out');
        el.setAttribute('data-custom', 'true');
        el.addEventListener('click', () => {
          pswp.currSlide && pswp.currSlide.toggleZoom();
        });
      }
    });

    // Download button
    lightbox.pswp.ui.registerElement({
      name: 'download-button',
      order: 8,
      isButton: true,
      tagName: 'a',
      html: {
        isCustomSVG: true,
        inner: '<path d="M18.25 20.5a.75.75 0 1 1 0 1.5l-13 .004a.75.75 0 1 1 0-1.5l13-.004ZM11.648 2.012l.102-.007a.75.75 0 0 1 .743.648l.007.102-.001 13.685 3.722-3.72a.75.75 0 0 1 .976-.073l.085.073a.75.75 0 0 1 .072.976l-.073.084-4.997 4.997a.75.75 0 0 1-.976.073l-.085-.073-5.003-4.996a.75.75 0 0 1 .976-1.134l.084.072 3.719 3.714L11 2.755a.75.75 0 0 1 .648-.743l.102-.007-.102.007Z"/>',
        outlineID: 'pswp__icn-download'
      },
      onInit: (el, pswp) => {
        el.setAttribute('download', '');
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');

        pswp.on('change', () => {
          const slide = pswp.currSlide;
          if (slide) {
            el.href = slide.data.src;
            // Set proper filename for download
            try {
              const url = new URL(slide.data.src);
              const filename = url.pathname.split('/').pop();
              if (filename && filename.includes('.')) {
                el.setAttribute('download', filename);
              } else {
                el.setAttribute('download', 'image-' + Date.now() + '.png');
              }
            } catch (e) {
              el.setAttribute('download', 'image-' + Date.now() + '.png');
            }
          }
        });
      }
    });

    // Use prompt button
    lightbox.pswp.ui.registerElement({
      name: 'useprompt-button',
      order: 9,
      isButton: true,
      tagName: 'button',
      html: {
        isCustomSVG: true,
        inner: '<path d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10c-1.821 0-3.53-.487-5-1.338L2.999 21.5a1 1 0 0 1-1.28-1.28L2.5 16.218C1.487 14.77 2 13.06 2 12c0-5.523 4.477-10 10-10Zm0 1.5A8.5 8.5 0 0 0 3.5 12c0 1.47.373 2.883 1.073 4.137l.15.27-1.076 3.236 3.236-1.076.27.15A8.5 8.5 0 1 0 12 3.5ZM8.75 13h4.498a.75.75 0 0 1 .102 1.493l-.102.007H8.75a.75.75 0 0 1-.102-1.493L8.75 13h4.498H8.75Zm0-3.5h6.505a.75.75 0 0 1 .101 1.493l-.101.007H8.75a.75.75 0 0 1-.102-1.493L8.75 9.5h6.505H8.75Z"/>',
        outlineID: 'pswp__icn-prompt'
      },
      onInit: (el, pswp) => {
        el.setAttribute('title', 'Use Prompt');
        el.addEventListener('click', () => {
          const slide = pswp.currSlide;
          if (slide) {
            const prompt = slide.data.element?.dataset.prompt || '';
            const promptInput = document.getElementById('prompt');
            if (promptInput) {
              promptInput.value = prompt;
            }
          }
        });
      }
    });

    // Delete button
    lightbox.pswp.ui.registerElement({
      name: 'delete-button',
      order: 10,
      isButton: true,
      tagName: 'button',
      html: {
        isCustomSVG: true,
        inner: '<path d="M12 1.75a3.25 3.25 0 0 1 3.245 3.066L15.25 5h5.25a.75.75 0 0 1 .102 1.493L20.5 6.5h-.796l-1.28 13.02a2.75 2.75 0 0 1-2.561 2.474l-.176.006H8.313a2.75 2.75 0 0 1-2.714-2.307l-.023-.174L4.295 6.5H3.5a.75.75 0 0 1-.743-.648L2.75 5.75a.75.75 0 0 1 .648-.743L3.5 5h5.25A3.25 3.25 0 0 1 12 1.75Zm6.197 4.75H5.802l1.267 12.872a1.25 1.25 0 0 0 1.117 1.122l.127.006h7.374c.6 0 1.109-.425 1.225-1.002l.02-.126L18.196 6.5ZM13.75 9.25a.75.75 0 0 1 .743.648L14.5 10v7a.75.75 0 0 1-1.493.102L13 17v-7a.75.75 0 0 1 .75-.75Zm-3.5 0a.75.75 0 0 1 .743.648L11 10v7a.75.75 0 0 1-1.493.102L9.5 17v-7a.75.75 0 0 1 .75-.75Zm1.75-6a1.75 1.75 0 0 0-1.744 1.606L10.25 5h3.5A1.75 1.75 0 0 0 12 3.25Z"/>',
        outlineID: 'pswp__icn-delete'
      },
      onInit: (el, pswp) => {
        el.setAttribute('title', 'Delete');
        
        // Hide for non-gallery (result) images; show only if element has data-image-id (saved gallery item)
        const updateVisibility = () => {
          const slide = pswp.currSlide;
          if (slide) {
            const link = slide.data.element;
            if (link) {
              const inResults = !!link.closest('#result-images');
              const hasImageId = !!link.dataset.imageId;
              el.style.display = (!inResults && hasImageId) ? '' : 'none';
            }
          }
        };
        
        pswp.on('change', updateVisibility);
        pswp.on('afterInit', updateVisibility);
        
        el.addEventListener('click', () => {
          const slide = pswp.currSlide;
          if (slide) {
            const imageId = slide.data.element?.dataset.imageId;
            if (imageId && confirm('Delete this image?')) {
              const gallery = window.falGallery;
              gallery.savedImages = gallery.savedImages.filter(img => String(img.timestamp) !== String(imageId));
              gallery.saveImages();
              slide.data.element.remove();
              gallery.showInlineGallery();
              gallery.updateMobileGallery();
              pswp.close();
            }
          }
        });
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

  // Remove duplicate default buttons after initialization
  lightbox.on('afterInit', () => {
    // Remove default buttons that might still appear
    const defaultClose = lightbox.pswp.element.querySelector('.pswp__button--close:not(.pswp__button--close[data-custom])');
    const defaultZoom = lightbox.pswp.element.querySelector('.pswp__button--zoom:not(.pswp__button--zoom[data-custom])');
    
    if (defaultClose && defaultClose !== lightbox.pswp.element.querySelector('.pswp__button--close[data-custom]')) {
      defaultClose.remove();
    }
    if (defaultZoom && defaultZoom !== lightbox.pswp.element.querySelector('.pswp__button--zoom[data-custom]')) {
      defaultZoom.remove();
    }
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
