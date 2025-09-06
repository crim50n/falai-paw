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

    lightbox.on('uiRegister', function () {

        // Like button
        lightbox.pswp.ui.registerElement({
            name: 'like-button',
            order: 11,
            isButton: true,
            tagName: 'button',
            html: {
                isCustomSVG: true,
                inner: '<path d="M8.106 18.247C5.298 16.083 2 13.542 2 9.137 2 6.386 4.386 4 7.137 4c1.323 0 2.617.613 3.617 1.553L12 6.998l1.246-1.445C14.246 4.613 15.54 4 16.863 4 19.614 4 22 6.386 22 9.137c0 4.405-3.298 6.946-6.106 9.11L12 21.35l-3.894-3.103Z"/>',
                outlineID: 'pswp__icn-like'
            },
            onInit: (el, pswp) => {
                el.setAttribute('title', 'Like');

                const updateLikeState = () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const imageId = String(slide.data.element?.dataset.imageId || '');
                        if (imageId) {
                            const gallery = window.falGallery;
                            const isLiked = gallery.likedImages && gallery.likedImages.includes(imageId);
                            el.classList.toggle('liked', isLiked);
                            el.setAttribute('title', isLiked ? 'Unlike' : 'Like');
                            // Update SVG fill
                            const svg = el.querySelector('svg');
                            if (svg) {
                                svg.style.fill = isLiked ? '#ff4757' : '';
                            }
                        }
                    }
                };

                pswp.on('change', updateLikeState);
                pswp.on('afterInit', updateLikeState);

                el.addEventListener('click', () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const gallery = window.falGallery;
                        const link = slide.data.element;
                        let imageId = link?.dataset.imageId;
                        
                        // If no imageId (result image), find or save it first
                        if (!imageId && link) {
                            const inResults = !!link.closest('#result-images');
                            if (inResults) {
                                const metadata = {
                                    endpoint: link.dataset.endpoint || '',
                                    prompt: link.dataset.prompt || '',
                                    seed: link.dataset.seed || '',
                                    parameters: JSON.parse(link.dataset.meta || '{}')
                                };
                                imageId = gallery.findOrSaveResultImage(slide.data.src, metadata);
                                // Update the link with the new imageId for future reference
                                link.dataset.imageId = imageId;
                            }
                        }
                        
                        if (imageId) {
                            gallery.toggleLike(imageId);
                            updateLikeState();
                        }
                    }
                });
            }
        });

        // Download button
        lightbox.pswp.ui.registerElement({
            name: 'download-button',
            order: 12,
            isButton: true,
            tagName: 'a',
            html: {
                isCustomSVG: true,
                inner: '<path d="M18.25 20.5a.75.75 0 1 1 0 1.5l-13 .004a.75.75 0 1 1 0-1.5l13-.004ZM11.648 2.012l.102-.007a.75.75 0 0 1 .743.648l.007.102-.001 13.685 3.722-3.72a.75.75 0 0 1 .976-.073l.085.073a.75.75 0 0 1 .072.976l-.073.084-4.997 4.997a.75.75 0 0 1-.976.073l-.085-.073-5.003-4.996a.75.75 0 0 1 .976-1.134l.084.072 3.719 3.714L11 2.755a.75.75 0 0 1 .648-.743l.102-.007-.102.007Z"/>',
                outlineID: 'pswp__icn-download'
            },
            onInit: (el, pswp) => {
                el.setAttribute('download', '');
                el.setAttribute('title', 'Download image');

                pswp.on('change', () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const src = slide.data.src;

                        // Set proper filename for download
                        let filename = 'image.png';
                        try {
                            const url = new URL(src);
                            const last = url.pathname.split('/').pop();
                            filename = (last && last.includes('.')) ? last : 'image-' + Date.now() + '.png';
                        } catch (e) {
                            filename = 'image-' + Date.now() + '.png';
                        }

                        el.addEventListener('click', async (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            const triggerDownload = (url) => {
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = filename;
                                a.style.display = 'none';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                            };

                            try {
                                if (src.startsWith('data:')) {
                                    triggerDownload(src);
                                    return;
                                }

                                const response = await fetch(src, { mode: 'cors' });
                                const blob = await response.blob();
                                const url = URL.createObjectURL(blob);
                                triggerDownload(url);
                                setTimeout(() => URL.revokeObjectURL(url), 4000);
                            } catch (err) {
                                // Fallback: try direct download
                                triggerDownload(src);
                            }
                        });
                    }
                });
            }
        });

        // View in new tab button
        lightbox.pswp.ui.registerElement({
            name: 'view-button',
            order: 13,
            isButton: true,
            tagName: 'a',
            html: {
                isCustomSVG: true,
                inner: '<path d="M6.25 4.5A1.75 1.75 0 0 0 4.5 6.25v11.5c0 .966.784 1.75 1.75 1.75h11.5a1.75 1.75 0 0 0 1.75-1.75V12a.75.75 0 0 1 1.5 0v5.75A3.25 3.25 0 0 1 17.75 21H6.25A3.25 3.25 0 0 1 3 17.75V6.25A3.25 3.25 0 0 1 6.25 3H12a.75.75 0 0 1 0 1.5H6.25ZM14.5 3a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V4.56l-6.22 6.22a.75.75 0 1 1-1.06-1.06L18.44 3.5H14.5a.75.75 0 0 1-.75-.75Z"/>',
                outlineID: 'pswp__icn-view'
            },
            onInit: (el, pswp) => {
                el.setAttribute('title', 'View in new tab');
                el.setAttribute('target', '_blank');
                el.setAttribute('rel', 'noopener');

                pswp.on('change', () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        el.href = slide.data.src;
                    }
                });
            }
        });

        // Use prompt button
        lightbox.pswp.ui.registerElement({
            name: 'prompt-button',
            order: 14,
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

        // Use seed button
        lightbox.pswp.ui.registerElement({
            name: 'seed-button',
            order: 15,
            isButton: true,
            tagName: 'button',
            html: {
                isCustomSVG: true,
                inner: '<path d="M10,15 L14,15 L14,9 L10,9 L10,15 Z M10,17 L10,20 C10,20.5522847 9.55228475,21 9,21 C8.44771525,21 8,20.5522847 8,20 L8,17 L5,17 C4.44771525,17 4,16.5522847 4,16 C4,15.4477153 4.44771525,15 5,15 L8,15 L8,9 L5,9 C4.44771525,9 4,8.55228475 4,8 C4,7.44771525 4.44771525,7 5,7 L8,7 L8,4 C8,3.44771525 8.44771525,3 9,3 C9.55228475,3 10,3.44771525 10,4 L10,7 L14,7 L14,4 C14,3.44771525 14.4477153,3 15,3 C15.5522847,3 16,3.44771525 16,4 L16,7 L19,7 C19.5522847,7 20,7.44771525 20,8 C20,8.55228475 19.5522847,9 19,9 L16,9 L16,15 L19,15 C19.5522847,15 20,15.4477153 20,16 C20,16.5522847 19.5522847,17 19,17 L16,17 L16,20 C16,20.5522847 15.5522847,21 15,21 C14.4477153,21 14,20.5522847 14,20 L14,17 L10,17 Z"/>',
                outlineID: 'pswp__icn-seed'
            },
            onInit: (el, pswp) => {
                el.setAttribute('title', 'Use Seed');

                // Show for all images (can be customized later if needed)
                const updateVisibility = () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const link = slide.data.element;
                        if (link) {
                            // For now, show for all images
                            el.style.display = '';
                        }
                    }
                };

                pswp.on('change', updateVisibility);
                pswp.on('afterInit', updateVisibility);

                el.addEventListener('click', () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const seed = slide.data.element?.dataset.seed || '';
                        const seedInput = document.getElementById('seed');
                        if (seedInput && seed) {
                            seedInput.value = seed;
                        }
                    }
                });
            }
        });

        // Delete button
        lightbox.pswp.ui.registerElement({
            name: 'delete-button',
            order: 16,
            isButton: true,
            tagName: 'button',
            html: {
                isCustomSVG: true,
                inner: '<path d="M12 1.75a3.25 3.25 0 0 1 3.245 3.066L15.25 5h5.25a.75.75 0 0 1 .102 1.493L20.5 6.5h-.796l-1.28 13.02a2.75 2.75 0 0 1-2.561 2.474l-.176.006H8.313a2.75 2.75 0 0 1-2.714-2.307l-.023-.174L4.295 6.5H3.5a.75.75 0 0 1-.743-.648L2.75 5.75a.75.75 0 0 1 .648-.743L3.5 5h5.25A3.25 3.25 0 0 1 12 1.75Zm6.197 4.75H5.802l1.267 12.872a1.25 1.25 0 0 0 1.117 1.122l.127.006h7.374c.6 0 1.109-.425 1.225-1.002l.02-.126L18.196 6.5ZM13.75 9.25a.75.75 0 0 1 .743.648L14.5 10v7a.75.75 0 0 1-1.493.102L13 17v-7a.75.75 0 0 1 .75-.75Zm-3.5 0a.75.75 0 0 1 .743.648L11 10v7a.75.75 0 0 1-1.493.102L9.5 17v-7a.75.75 0 0 1 .75-.75Zm1.75-6a1.75 1.75 0 0 0-1.744 1.606L10.25 5h3.5A1.75 1.75 0 0 0 12 3.25Z"/>',
                outlineID: 'pswp__icn-delete'
            },
            onInit: (el, pswp) => {
                el.setAttribute('title', 'Delete');

                // Show for both saved gallery items and result images
                const updateVisibility = () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const link = slide.data.element;
                        if (link) {
                            const inResults = !!link.closest('#result-images');
                            const hasImageId = !!link.dataset.imageId;
                            // Show for saved gallery items OR result images
                            el.style.display = (hasImageId || inResults) ? '' : 'none';
                        }
                    }
                };

                pswp.on('change', updateVisibility);
                pswp.on('afterInit', updateVisibility);

                el.addEventListener('click', () => {
                    const slide = pswp.currSlide;
                    if (slide) {
                        const link = slide.data.element;
                        if (link && confirm('Delete this image?')) {
                            const gallery = window.falGallery;
                            const imageId = link.dataset.imageId;
                            const inResults = !!link.closest('#result-images');
                            
                            if (imageId) {
                                // Delete from saved gallery
                                gallery.savedImages = gallery.savedImages.filter(img => String(img.timestamp) !== String(imageId));
                                gallery.saveImages();
                                gallery.showInlineGallery();
                                gallery.updateMobileGallery();
                            }
                            
                            if (inResults) {
                                // Delete from results display
                                const resultContainer = link.closest('.result-image');
                                if (resultContainer) {
                                    resultContainer.remove();
                                }
                            } else {
                                // Delete gallery item
                                link.closest('.gallery-item')?.remove();
                            }
                            
                            pswp.close();
                        }
                    }
                });
            }
        });

        // Override default zoom button with Fluent Icon  
        lightbox.pswp.ui.registerElement({
            name: 'zoom',
            order: 19,
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

        // Metadata overlay
        lightbox.pswp.ui.registerElement({
            name: 'meta', order: 5, appendTo: 'root',
            onInit: (el, pswp) => {
                el.className = 'pswp-meta-overlay';
                const render = async () => {
                    const slide = pswp.currSlide; if (!slide) return; const link = slide.data.element; if (!link) return;
                    const endpoint = link.dataset.endpoint || '';
                    const prompt = link.dataset.prompt || '';
                    const seed = link.dataset.seed || '';

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
                    const seedSection = seed ? `<div><strong>Seed:</strong> ${escapeHtml(seed)}</div>` : '';
                    el.innerHTML = `<div class="meta-block">${imageInfo}<div><strong>Endpoint:</strong> ${escapeHtml(endpoint || 'Unknown')}</div><div><strong>Prompt:</strong> ${escapeHtml(prompt)}</div>${seedSection}${metaSection}</div>`;
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
                    const link = slide.data.element;
                    if (link && confirm('Delete this image?')) {
                        const gallery = window.falGallery;
                        const imageId = link.dataset.imageId;
                        const inResults = !!link.closest('#result-images');
                        
                        if (imageId) {
                            // Delete from saved gallery
                            gallery.savedImages = gallery.savedImages.filter(img => String(img.timestamp) !== String(imageId));
                            gallery.saveImages();
                            gallery.showInlineGallery();
                            gallery.updateMobileGallery();
                        }
                        
                        if (inResults) {
                            // Delete from results display
                            const resultContainer = link.closest('.result-image');
                            if (resultContainer) {
                                resultContainer.remove();
                            }
                        } else {
                            // Delete gallery item
                            link.closest('.gallery-item')?.remove();
                        }
                        
                        lightbox.pswp.close();
                    }
                }
            }
        }
        startY = null; startX = null;
    });

    lightbox.init();
}

initLightbox();
