/**
 * Gallery module: handles saved/generated images, selection, and PhotoSwipe integration.
 */

class FalAIGallery {
    constructor(app) {
        this.app = app;
        this.savedImages = JSON.parse(localStorage.getItem('falai_saved_images') || '[]');
        this.likedImages = JSON.parse(localStorage.getItem('falai_liked_images') || '[]');
        this.currentImageIndex = 0;

        // Filter state
        this.showOnlyLiked = false;

        // Selection state
        this.selectionMode = false;
        this.selectedImages = new Set();

        this.initializeEventListeners();
        this.updateMobileStickyHeights();

        // Initialize galleries if they exist
        setTimeout(() => {
            if (document.getElementById('inline-gallery-content')) {
                this.showInlineGallery();
            }
            if (document.getElementById('mobile-gallery-content')) {
                this.updateMobileGallery();
            }
        }, 100);

        window.addEventListener('resize', () => this.updateMobileStickyHeights());
        window.falGallery = this; // expose for photoswipe-init
    }

    initializeEventListeners() {
        // Right panel tab controls
        const resultsTabEl = document.getElementById('results-panel-tab');
        if (resultsTabEl) {
            resultsTabEl.addEventListener('click', () => {
                this.switchRightPanelView('results');
            });
        }
        const galleryTabEl = document.getElementById('gallery-panel-tab');
        if (galleryTabEl) {
            galleryTabEl.addEventListener('click', () => {
                this.switchRightPanelView('gallery');
            });
        }

        // Selection mode controls (both inline & mobile)
        const selectionButtons = document.querySelectorAll('.selection-mode-btn');
        selectionButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.toggleSelectionMode();
                selectionButtons.forEach(b => {
                    b.textContent = this.selectionMode ? 'Cancel' : 'Select';
                    b.classList.toggle('active', this.selectionMode);
                });
            });
        });

        // Inline bulk action controls (multiple scopes)
        document.querySelectorAll('.select-all-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectAllImages());
        });
        document.querySelectorAll('.clear-selection-btn').forEach(btn => {
            btn.addEventListener('click', () => this.clearSelection());
        });
        document.querySelectorAll('.bulk-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => this.bulkDeleteImages());
        });
        document.querySelectorAll('.select-not-liked-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectNotLikedImages());
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when gallery is visible and not in input
            const galleryVisible = !document.getElementById('inline-gallery')?.classList.contains('hidden');
            if (!galleryVisible || e.target.matches('input, textarea')) return;

            switch (e.key) {
                case 'Escape':
                    if (this.selectionMode) {
                        this.toggleSelectionMode();
                        document.querySelectorAll('.selection-mode-btn').forEach(b => {
                            b.textContent = 'Select';
                            b.classList.remove('active');
                        });
                    }
                    break;
                case 'a':
                case 'A':
                    if ((e.ctrlKey || e.metaKey) && this.selectionMode) {
                        e.preventDefault();
                        this.selectAllImages();
                    }
                    break;
                case 'Delete':
                case 'Backspace':
                    if (this.selectionMode && this.selectedImages.size > 0) {
                        e.preventDefault();
                        this.bulkDeleteImages();
                    }
                    break;
            }
        });
    }

    // (placeholder for future lightbox-related helpers if needed)

    // Switch between Results and Gallery views
    switchRightPanelView(view) {
        const resultsTab = document.getElementById('results-panel-tab');
        const galleryTab = document.getElementById('gallery-panel-tab');
        const placeholder = document.getElementById('no-images-placeholder');
        const results = document.getElementById('results');
        const inlineGallery = document.getElementById('inline-gallery');

        if (view === 'gallery') {
            // Switch to gallery view
            if (resultsTab) resultsTab.classList.remove('active');
            if (galleryTab) galleryTab.classList.add('active');
            placeholder.classList.add('hidden');
            results.classList.add('hidden');
            inlineGallery.classList.remove('hidden');

            // Load gallery content
            this.showInlineGallery();
        } else {
            // Switch to results view
            if (galleryTab) galleryTab.classList.remove('active');
            if (resultsTab) resultsTab.classList.add('active');
            inlineGallery.classList.add('hidden');

            // Show appropriate results content
            if (results.classList.contains('hidden') && placeholder.classList.contains('hidden')) {
                placeholder.classList.remove('hidden');
            } else {
                results.classList.remove('hidden');
            }
        }
    }

    // Switch to gallery view programmatically
    switchToGalleryView() {
        this.switchRightPanelView('gallery');
    }

    // Display inline gallery with images
    showInlineGallery() {
        const container = document.getElementById('inline-gallery-content');

        if (!container) return;

        container.innerHTML = '';

        if (this.savedImages.length === 0) {
            container.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 2rem; color: #6b7280;">No saved images yet</div>';
        } else {
            this.savedImages.forEach((image, index) => {
                const item = this.createInlineGalleryItem(image, index);
                container.appendChild(item);
            });
        }

        // Update like indicators after DOM update
        requestAnimationFrame(() => {
            this.updateGalleryLikes();
        });

        // PhotoSwipe reads DOM on open; no explicit reinit needed
    }

    // Create gallery item for inline display (PhotoSwipe)
    createInlineGalleryItem(imageData, index) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.setAttribute('data-image-id', imageData.timestamp); // Unique identifier

        // Check if liked and add class
        const isLiked = this.likedImages.includes(String(imageData.timestamp));
        if (isLiked) {
            div.classList.add('liked');
        }

        const date = new Date(imageData.timestamp).toLocaleDateString();

        // Selection checkbox
        const selectionOverlay = document.createElement('div');
        selectionOverlay.className = 'gallery-item-selection';
        selectionOverlay.innerHTML = `
            <div class="selection-checkbox">
                <input type="checkbox" id="select-${imageData.timestamp}">
                <label for="select-${imageData.timestamp}">✓</label>
            </div>
        `;

        // Anchor for PhotoSwipe
        const link = document.createElement('a');
        link.href = imageData.url;
        link.className = 'pswp-item';
        link.dataset.endpoint = imageData.endpoint || '';
        link.dataset.prompt = imageData.prompt || '';
        link.dataset.seed = imageData.seed || '';
        link.dataset.meta = JSON.stringify(imageData.parameters || {});
        link.dataset.imageId = imageData.timestamp;
        this._assignNaturalSize(link, imageData.url);

        const img = document.createElement('img');
        img.src = imageData.url;
        img.alt = 'Saved image';
        img.loading = 'lazy';

        const info = document.createElement('div');
        info.className = 'gallery-item-info';
        info.innerHTML = `
            <div>${imageData.endpoint}</div>
            <div>${date}</div>
        `;

        // Add selection event listeners
        const checkbox = selectionOverlay.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.toggleImageSelection(imageData.timestamp, e.target.checked);
        });

        // Add click handler for selection mode
        div.addEventListener('click', (e) => {
            if (this.selectionMode) {
                e.preventDefault();
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                this.toggleImageSelection(imageData.timestamp, checkbox.checked);
            }
        });

        link.appendChild(img);
        div.appendChild(selectionOverlay);
        div.appendChild(link);
        div.appendChild(info);

        // Always add like indicator area (visible only when liked, but always clickable)
        const likeIndicator = document.createElement('div');
        likeIndicator.className = 'like-indicator';
        likeIndicator.style.display = isLiked ? 'flex' : 'none';
        likeIndicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8.106 18.247C5.298 16.083 2 13.542 2 9.137 2 6.386 4.386 4 7.137 4c1.323 0 2.617.613 3.617 1.553L12 6.998l1.246-1.445C14.246 4.613 15.54 4 16.863 4 19.614 4 22 6.386 22 9.137c0 4.405-3.298 6.946-6.106 9.11L12 21.35l-3.894-3.103Z"/></svg>';
        
        // Add click handler for like toggle
        likeIndicator.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLike(imageData.timestamp);
        });

        // Add invisible click area for easier clicking when not liked
        const clickArea = document.createElement('div');
        clickArea.style.position = 'absolute';
        clickArea.style.top = '8px';
        clickArea.style.left = '8px';
        clickArea.style.width = '32px';
        clickArea.style.height = '32px';
        clickArea.style.zIndex = '9';
        clickArea.style.cursor = 'pointer';
        clickArea.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLike(imageData.timestamp);
        });

        div.appendChild(clickArea);
        div.appendChild(likeIndicator);

        return div;
    }

    // Create result image item (PhotoSwipe)
    createResultImageItem(imageUrl, metadata = {}) {
        const div = document.createElement('div');
        div.className = 'result-image';

        const link = document.createElement('a');
        link.href = imageUrl;
        link.className = 'pswp-item';
        link.dataset.endpoint = metadata.endpoint || '';
        link.dataset.prompt = (document.getElementById('prompt')?.value || '').trim();
        link.dataset.seed = metadata.seed || '';
        link.dataset.meta = JSON.stringify(metadata.parameters || {});
        this._assignNaturalSize(link, imageUrl);

        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Generated image';
        img.loading = 'lazy';

        // Action buttons overlay
        const actions = document.createElement('div');
        actions.className = 'result-image-actions';

        link.appendChild(img);
        div.appendChild(link);
        div.appendChild(actions);

        return div;
    }

    // Update mobile gallery content
    updateMobileGallery() {
        const container = document.getElementById('mobile-gallery-content');

        if (!container) return;

        container.innerHTML = '';

        if (this.savedImages.length === 0) {
            container.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 2rem; color: #6b7280;">No saved images yet</div>';
        } else {
            this.savedImages.forEach((image, index) => {
                const item = this.createMobileGalleryItem(image, index);
                container.appendChild(item);
            });
        }

        // Update like indicators after DOM update
        requestAnimationFrame(() => {
            this.updateGalleryLikes();
        });

        // After DOM updates recalc sticky offsets
        this.updateMobileStickyHeights();
    }

    // Recalculate and store heights used for sticky positioning (CSS variables)
    updateMobileStickyHeights() {
        const galleryEl = document.getElementById('mobile-gallery');
        if (!galleryEl) return;
        const header = galleryEl.querySelector('.mobile-gallery-header');
        const meta = galleryEl.querySelector('.mobile-gallery-meta');
        if (header) {
            const h = header.getBoundingClientRect().height;
            galleryEl.style.setProperty('--mobile-gallery-header-height', h + 'px');
        }
        if (meta) {
            const m = meta.getBoundingClientRect().height;
            galleryEl.style.setProperty('--mobile-gallery-meta-height', m + 'px');
        }
    }

    // Create mobile gallery item
    createMobileGalleryItem(imageData, index) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.setAttribute('data-image-id', imageData.timestamp); // Unique identifier

        // Check if liked and add class
        const isLiked = this.likedImages.includes(String(imageData.timestamp));
        if (isLiked) {
            div.classList.add('liked');
        }

        const date = new Date(imageData.timestamp).toLocaleDateString();

        // Selection checkbox
        const selectionOverlay = document.createElement('div');
        selectionOverlay.className = 'gallery-item-selection';
        selectionOverlay.innerHTML = `
            <div class="selection-checkbox">
                <input type="checkbox" id="select-mobile-${imageData.timestamp}">
                <label for="select-mobile-${imageData.timestamp}">✓</label>
            </div>
        `;

        const link = document.createElement('a');
        link.href = imageData.url;
        link.className = 'pswp-item';
        link.dataset.endpoint = imageData.endpoint || '';
        link.dataset.prompt = imageData.prompt || '';
        link.dataset.seed = imageData.seed || '';
        link.dataset.meta = JSON.stringify(imageData.parameters || {});
        link.dataset.imageId = imageData.timestamp;
        this._assignNaturalSize(link, imageData.url);

        const img = document.createElement('img');
        img.src = imageData.url;
        img.alt = 'Saved image';
        img.loading = 'lazy';

        // Add selection event listeners
        const checkbox = selectionOverlay.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            this.toggleImageSelection(imageData.timestamp, e.target.checked);
        });

        // Add click handler for selection mode
        div.addEventListener('click', (e) => {
            if (this.selectionMode) {
                e.preventDefault();
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                this.toggleImageSelection(imageData.timestamp, checkbox.checked);
            }
        });

        link.appendChild(img);
        div.appendChild(selectionOverlay);
        div.appendChild(link);

        // Always add like indicator area (visible only when liked, but always clickable)
        const likeIndicator = document.createElement('div');
        likeIndicator.className = 'like-indicator';
        likeIndicator.style.display = isLiked ? 'flex' : 'none';
        likeIndicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8.106 18.247C5.298 16.083 2 13.542 2 9.137 2 6.386 4.386 4 7.137 4c1.323 0 2.617.613 3.617 1.553L12 6.998l1.246-1.445C14.246 4.613 15.54 4 16.863 4 19.614 4 22 6.386 22 9.137c0 4.405-3.298 6.946-6.106 9.11L12 21.35l-3.894-3.103Z"/></svg>';
        
        // Add click handler for like toggle
        likeIndicator.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLike(imageData.timestamp);
        });

        // Add invisible click area for easier clicking when not liked
        const clickArea = document.createElement('div');
        clickArea.style.position = 'absolute';
        clickArea.style.top = '8px';
        clickArea.style.left = '8px';
        clickArea.style.width = '32px';
        clickArea.style.height = '32px';
        clickArea.style.zIndex = '9';
        clickArea.style.cursor = 'pointer';
        clickArea.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleLike(imageData.timestamp);
        });

        div.appendChild(clickArea);
        div.appendChild(likeIndicator);

        return div;
    }

    // (no lightbox re-init needed for PhotoSwipe)

    // Save image to gallery (auto use, dedupe, silent optional)
    saveImage(imageUrl, metadata = {}, options = {}) {
        const { dedupe = true, silent = false } = options;
        if (dedupe && this.savedImages.some(img => img.url === imageUrl)) {
            return false; // already stored
        }
        const promptValue = (document.getElementById('prompt')?.value || '').trim();
        const imageData = {
            url: imageUrl,
            timestamp: Date.now(),
            endpoint: metadata.endpoint || 'Unknown',
            parameters: metadata.parameters || {},
            prompt: promptValue,
            ...metadata
        };
        this.savedImages.unshift(imageData);
        this.saveImages();
        this.showInlineGallery();
        this.updateMobileGallery();
        if (!silent && this.app && this.app.showNotification) {
            this.app.showNotification('Image added to gallery', 'success');
        }
        return true;
    }

    // Save images to localStorage
    saveImages() {
        try {
            localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));
        } catch (e) {
            console.warn('Failed to save gallery (likely quota exceeded)', e);
            // Try freeing space by removing oldest images until it fits or list empty
            let removed = 0;
            while (this.savedImages.length > 0) {
                this.savedImages.pop(); // remove oldest (we unshift new ones)
                try {
                    localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));
                    if (this.app && this.app.showNotification) {
                        this.app.showNotification(`Storage full. Removed ${removed + 1}+ old images to save new ones`, 'warning');
                    }
                    return;
                } catch (err) {
                    removed++;
                    continue;
                }
            }
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Storage full. Failed to save image.', 'error');
            } else {
                alert('Storage full. Failed to save image.');
            }
        }
    }

    // Save likes to localStorage
    saveLikes() {
        try {
            localStorage.setItem('falai_liked_images', JSON.stringify(this.likedImages));
        } catch (e) {
            console.warn('Failed to save likes', e);
        }
    }

    // Toggle like state for an image
    toggleLike(imageId) {
        const imageIdStr = String(imageId);
        const index = this.likedImages.indexOf(imageIdStr);
        
        if (index > -1) {
            // Remove from likes
            this.likedImages.splice(index, 1);
        } else {
            // Add to likes
            this.likedImages.push(imageIdStr);
        }
        
        this.saveLikes();
        this.updateGalleryLikes();
        
        return this.likedImages.includes(imageIdStr);
    }

    // Find or save result image and return its ID for syncing with PhotoSwipe
    findOrSaveResultImage(imageUrl, metadata = {}) {
        // Try to find existing saved image with this URL
        const existingImage = this.savedImages.find(img => img.url === imageUrl);
        if (existingImage) {
            return existingImage.timestamp;
        }

        // If it's a result image being liked, save it to gallery
        const imageData = {
            url: imageUrl,
            timestamp: Date.now(),
            endpoint: metadata.endpoint || 'Unknown',
            parameters: metadata.parameters || {},
            prompt: metadata.prompt || '',
            ...metadata
        };
        
        this.savedImages.unshift(imageData);
        this.saveImages();
        this.showInlineGallery();
        this.updateMobileGallery();
        
        return imageData.timestamp;
    }

    // Update gallery display to show like states
    updateGalleryLikes() {
        const galleryItems = document.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            const link = item.querySelector('a[data-image-id]');
            if (link) {
                const imageId = String(link.dataset.imageId);
                const isLiked = this.likedImages.includes(imageId);
                item.classList.toggle('liked', isLiked);

                // Show/hide like indicator based on like state
                const likeIndicator = item.querySelector('.like-indicator');
                if (likeIndicator) {
                    likeIndicator.style.display = isLiked ? 'flex' : 'none';
                }
            }
        });
    }

    // Clean up old images (called by app cleanup utility)
    cleanupOldGalleryImages(daysOld = 30) {
        const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
        const initialCount = this.savedImages.length;

        this.savedImages = this.savedImages.filter(image => image.timestamp > cutoffDate);

        if (this.savedImages.length < initialCount) {
            this.saveImages();
            this.showInlineGallery();
            this.updateMobileGallery();
        }

        return initialCount - this.savedImages.length;
    }

    // Clean base64 images from gallery
    cleanGalleryBase64() {
        const initialCount = this.savedImages.length;
        this.savedImages = this.savedImages.filter(image => !image.url.startsWith('data:'));

        if (this.savedImages.length < initialCount) {
            this.saveImages();
            this.showInlineGallery();
            this.updateMobileGallery();
        }

        return initialCount - this.savedImages.length;
    }

    // Analyze gallery for storage info
    analyzeGallery() {
        const stats = {
            totalImages: this.savedImages.length,
            totalSize: 0,
            oldestImage: null,
            newestImage: null,
            endpointBreakdown: {}
        };

        if (this.savedImages.length > 0) {
            stats.oldestImage = new Date(Math.min(...this.savedImages.map(img => img.timestamp)));
            stats.newestImage = new Date(Math.max(...this.savedImages.map(img => img.timestamp)));

            // Calculate approximate size and endpoint breakdown
            this.savedImages.forEach(image => {
                // Estimate size for base64 images
                if (image.url.startsWith('data:')) {
                    const base64Data = image.url.split(',')[1];
                    stats.totalSize += (base64Data.length * 3) / 4; // Approximate byte size
                }

                // Count by endpoint
                const endpoint = image.endpoint || 'Unknown';
                stats.endpointBreakdown[endpoint] = (stats.endpointBreakdown[endpoint] || 0) + 1;
            });
        }

        return stats;
    }

    // Clear all gallery images
    clearGallery() {
        if (confirm('Are you sure you want to clear all saved images? This action cannot be undone.')) {
            this.savedImages = [];
            this.selectedImages.clear();
            this.saveImages();
            this.showInlineGallery();
            this.updateMobileGallery();

            if (this.app && this.app.showNotification) {
                this.app.showNotification('Gallery cleared', 'success');
            }
        }
    }

    // Toggle selection mode
    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;
        this.selectedImages.clear();

        // Update both inline and mobile gallery containers
        const galleryContainer = document.getElementById('inline-gallery');
        const mobileGalleryContainer = document.getElementById('mobile-gallery');

        if (galleryContainer) {
            galleryContainer.classList.toggle('selection-mode', this.selectionMode);
        }

        if (mobileGalleryContainer) {
            mobileGalleryContainer.classList.toggle('selection-mode', this.selectionMode);
        }

        this.updateSelectionUI();
        this.showInlineGallery(); // Refresh to show/hide checkboxes
        this.updateMobileGallery(); // Refresh mobile gallery too
    }

    // Toggle individual image selection
    toggleImageSelection(imageId, selected) {
        if (selected) {
            this.selectedImages.add(imageId);
        } else {
            this.selectedImages.delete(imageId);
        }

        this.updateSelectionUI();
        this.updateGalleryItemSelection(imageId, selected);
    }

    // Update gallery item visual selection state
    updateGalleryItemSelection(imageId, selected) {
        const galleryItem = document.querySelector(`[data-image-id="${imageId}"]`);
        if (galleryItem) {
            galleryItem.classList.toggle('selected', selected);
        }
    }

    // Update selection UI (count, buttons, etc.)
    updateSelectionUI() {
        const selectionCount = this.selectedImages.size;

        // Show/hide selection action rows
        document.querySelectorAll('.selection-actions-row').forEach(row => {
            row.style.display = this.selectionMode ? 'block' : 'none';
        });

        // Show/hide inline action buttons
        document.querySelectorAll('.gallery-inline-actions').forEach(container => {
            const counter = container.querySelector('.selection-counter');
            const selectAllBtn = container.querySelector('.select-all-btn');
            const selectNotLikedBtn = container.querySelector('.select-not-liked-btn');
            const clearBtn = container.querySelector('.clear-selection-btn');
            const deleteBtn = container.querySelector('.bulk-delete-btn');

            // Update counter and selection mode button
            if (counter) {
                counter.style.display = this.selectionMode ? 'inline-block' : 'none';
                counter.textContent = `${selectionCount} selected`;
            }

            // Update buttons in selection actions row
            if (container.classList.contains('selection-actions-row')) {
                if (deleteBtn) deleteBtn.style.display = selectionCount > 0 ? 'inline-block' : 'none';
            }
        });
    }

    // Select all images
    selectAllImages() {
        this.selectedImages.clear();
        this.savedImages.forEach(image => {
            this.selectedImages.add(image.timestamp);
        });

        // Update all checkboxes
        const checkboxes = document.querySelectorAll('.gallery-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
        });

        // Update visual state
        const galleryItems = document.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            item.classList.add('selected');
        });

        this.updateSelectionUI();
    }

    // Clear all selections
    clearSelection() {
        this.selectedImages.clear();

        // Update all checkboxes
        const checkboxes = document.querySelectorAll('.gallery-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        // Update visual state
        const galleryItems = document.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            item.classList.remove('selected');
        });

        this.updateSelectionUI();
    }

    // Select only not-liked images (for deletion)
    selectNotLikedImages() {
        this.clearSelection();

        // Only select images that are NOT liked
        const galleryItems = document.querySelectorAll('.gallery-item');
        galleryItems.forEach(item => {
            const link = item.querySelector('a[data-image-id]');
            if (link) {
                const imageId = link.dataset.imageId;
                const isLiked = this.likedImages.includes(imageId);

                if (!isLiked) {
                    const checkbox = item.querySelector('input[type="checkbox"]');
                    if (checkbox) {
                        checkbox.checked = true;
                        this.selectedImages.add(imageId);
                        item.classList.add('selected');
                    }
                }
            }
        });

        this.updateSelectionUI();
    }

    // Bulk delete selected images
    bulkDeleteImages() {
        const selectedCount = this.selectedImages.size;
        if (selectedCount === 0) return;

        const confirmMessage = `Are you sure you want to delete ${selectedCount} selected image${selectedCount > 1 ? 's' : ''}? This action cannot be undone.`;

        if (confirm(confirmMessage)) {
            // Remove selected images from savedImages array
            this.savedImages = this.savedImages.filter(image =>
                !this.selectedImages.has(image.timestamp)
            );

            // Clear selection
            this.selectedImages.clear();

            // Save and refresh
            this.saveImages();
            this.showInlineGallery();
            this.updateMobileGallery();

            if (this.app && this.app.showNotification) {
                this.app.showNotification(`${selectedCount} image${selectedCount > 1 ? 's' : ''} deleted successfully`, 'success');
            }
        }
    }

    // Helper: set intrinsic image size for PhotoSwipe to avoid stretch
    _assignNaturalSize(anchorEl, url) {
        const img = new Image();
        img.onload = () => {
            // Only set if dimensions look valid and not already set
            if (!anchorEl.getAttribute('data-pswp-width')) {
                anchorEl.setAttribute('data-pswp-width', img.naturalWidth);
                anchorEl.setAttribute('data-pswp-height', img.naturalHeight);
            }
        };
        // Use decoding async for faster paint if supported
        try { img.decoding = 'async'; } catch (e) { }
        img.src = url;
    }
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FalAIGallery;
}