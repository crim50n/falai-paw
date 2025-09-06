/**
 * Gallery Module for FalAI
 * Handles all gallery-related functionality including image display,
 * fullscreen viewing, navigation, storage, and touch gestures.
 */

class FalAIGallery {
    constructor(app) {
        this.app = app;
        this.savedImages = JSON.parse(localStorage.getItem('falai_saved_images') || '[]');
        this.currentImageIndex = 0;
        this.fullscreenImages = [];
        
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        // Right panel tab controls
        document.getElementById('results-panel-tab').addEventListener('click', () => {
            this.switchRightPanelView('results');
        });
        document.getElementById('gallery-panel-tab').addEventListener('click', () => {
            this.switchRightPanelView('gallery');
        });

        // Full-screen viewer controls
        document.getElementById('fullscreen-close').addEventListener('click', () => {
            this.closeFullscreenViewer();
        });
        document.getElementById('fullscreen-prev').addEventListener('click', () => {
            this.navigateFullscreen(-1);
        });
        document.getElementById('fullscreen-next').addEventListener('click', () => {
            this.navigateFullscreen(1);
        });
        document.getElementById('fullscreen-download').addEventListener('click', () => {
            this.downloadCurrentFullscreenImage();
        });
        document.getElementById('fullscreen-delete').addEventListener('click', () => {
            this.deleteCurrentFullscreenImage();
        });

        // Add keyboard navigation for fullscreen viewer
        document.addEventListener('keydown', (e) => {
            const viewer = document.getElementById('fullscreen-viewer');
            if (!viewer.classList.contains('hidden')) {
                switch (e.key) {
                    case 'ArrowLeft':
                        this.navigateFullscreen(-1);
                        break;
                    case 'ArrowRight':
                        this.navigateFullscreen(1);
                        break;
                    case 'd':
                    case 'D':
                        this.downloadCurrentFullscreenImage();
                        break;
                    case 'Delete':
                    case 'Backspace':
                        this.deleteCurrentFullscreenImage();
                        break;
                }
            }
        });

        // Close fullscreen on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('fullscreen-viewer')) {
                this.closeFullscreenViewer();
            }
        });
    }

    // Switch between Results and Gallery views
    switchRightPanelView(view) {
        const resultsTab = document.getElementById('results-panel-tab');
        const galleryTab = document.getElementById('gallery-panel-tab');
        const placeholder = document.getElementById('no-images-placeholder');
        const results = document.getElementById('results');
        const inlineGallery = document.getElementById('inline-gallery');

        if (view === 'gallery') {
            // Switch to gallery view
            resultsTab.classList.remove('active');
            galleryTab.classList.add('active');
            placeholder.classList.add('hidden');
            results.classList.add('hidden');
            inlineGallery.classList.remove('hidden');

            // Load gallery content
            this.showInlineGallery();
        } else {
            // Switch to results view
            galleryTab.classList.remove('active');
            resultsTab.classList.add('active');
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
        const countElement = document.getElementById('gallery-count');

        if (!container) return;

        container.innerHTML = '';
        countElement.textContent = `${this.savedImages.length} images`;

        if (this.savedImages.length === 0) {
            container.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 2rem; color: #6b7280;">No saved images yet</div>';
        } else {
            this.savedImages.forEach((image, index) => {
                const item = this.createInlineGalleryItem(image, index);
                container.appendChild(item);
            });
        }
    }

    // Create gallery item for inline display
    createInlineGalleryItem(imageData, index) {
        const div = document.createElement('div');
        div.className = 'gallery-item';

        const date = new Date(imageData.timestamp).toLocaleDateString();
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

        div.appendChild(img);
        div.appendChild(info);

        // Click on entire gallery item opens zoom modal with gallery context
        div.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openImageModalWithNavigation(imageData.url, this.savedImages, index, 'gallery');
        });

        return div;
    }

    // Open image modal with navigation capabilities
    openImageModalWithNavigation(imageUrl, images, currentIndex, context) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('image-zoom-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'image-zoom-modal';
            modal.className = 'image-zoom-modal hidden';
            modal.innerHTML = `
                <div class="image-zoom-backdrop"></div>
                <div class="image-zoom-container">
                    <img id="zoom-image" src="" alt="Zoomed image">
                    <div class="zoom-controls">
                        <button id="zoom-prev" class="zoom-nav-btn" title="Previous image">‹</button>
                        <div class="zoom-counter"></div>
                        <button id="zoom-next" class="zoom-nav-btn" title="Next image">›</button>
                    </div>
                    <button id="close-zoom" class="close-zoom-btn" title="Close">✕</button>
                    <button id="zoom-download" class="zoom-action-btn zoom-download-btn" title="Download image">💾</button>
                    <button id="zoom-delete" class="zoom-action-btn zoom-delete-btn" title="Delete image">🗑️</button>
                </div>
            `;
            document.body.appendChild(modal);

            // Setup advanced touch gestures with Hammer.js
            this.setupAdvancedGestures(modal);

            // Add event listeners
            modal.querySelector('.image-zoom-backdrop').addEventListener('click', () => {
                this.closeImageModal();
            });
            modal.querySelector('#close-zoom').addEventListener('click', () => {
                this.closeImageModal();
            });
            modal.querySelector('#zoom-download').addEventListener('click', () => {
                this.downloadCurrentZoomImage();
            });
            modal.querySelector('#zoom-delete').addEventListener('click', () => {
                this.deleteCurrentZoomImage();
            });
            modal.querySelector('#zoom-prev').addEventListener('click', () => {
                this.navigateZoomModal(-1);
            });
            modal.querySelector('#zoom-next').addEventListener('click', () => {
                this.navigateZoomModal(1);
            });

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (!modal.classList.contains('hidden')) {
                    if (e.key === 'Escape') {
                        this.closeImageModal();
                    } else if (e.key === 'ArrowLeft') {
                        this.navigateZoomModal(-1);
                    } else if (e.key === 'ArrowRight') {
                        this.navigateZoomModal(1);
                    } else if (e.key === 'Delete') {
                        // Delete only works when delete button is visible
                        const deleteBtn = modal.querySelector('#zoom-delete');
                        if (deleteBtn && !deleteBtn.classList.contains('hidden')) {
                            this.deleteCurrentZoomImage();
                        }
                    }
                }
            });
        }

        // Store navigation data
        modal._navigationData = { images, currentIndex, context };

        // Set image and show modal
        this.updateZoomModal(imageUrl, currentIndex, images.length);
        modal.classList.remove('hidden');

        // Show/hide delete button based on context
        const deleteBtn = modal.querySelector('#zoom-delete');
        if (deleteBtn && modal._navigationData) {
            deleteBtn.style.display = modal._navigationData.context === 'gallery' ? 'block' : 'none';
        }
    }

    // Navigate in zoom modal
    navigateZoomModal(direction) {
        const modal = document.getElementById('image-zoom-modal');
        if (!modal || !modal._navigationData) return;

        const { images, currentIndex } = modal._navigationData;
        const newIndex = currentIndex + direction;

        if (newIndex >= 0 && newIndex < images.length) {
            modal._navigationData.currentIndex = newIndex;
            const imageUrl = images[newIndex].url || images[newIndex];
            this.updateZoomModal(imageUrl, newIndex, images.length);
        }
    }

    // Update zoom modal content
    updateZoomModal(imageUrl, currentIndex, totalImages) {
        const modal = document.getElementById('image-zoom-modal');
        if (!modal) return;

        const zoomImage = modal.querySelector('#zoom-image');
        if (!zoomImage) return;

        zoomImage.src = imageUrl;

        const counter = modal.querySelector('.zoom-counter');
        counter.textContent = `${currentIndex + 1} / ${totalImages}`;

        // Update navigation button visibility
        const prevBtn = modal.querySelector('#zoom-prev');
        const nextBtn = modal.querySelector('#zoom-next');
        prevBtn.style.visibility = currentIndex > 0 ? 'visible' : 'hidden';
        nextBtn.style.visibility = currentIndex < totalImages - 1 ? 'visible' : 'hidden';

        // Show/hide delete button based on context
        const deleteBtn = modal.querySelector('#zoom-delete');
        if (deleteBtn && modal._navigationData) {
            deleteBtn.style.display = modal._navigationData.context === 'gallery' ? 'block' : 'none';
        }
    }

    // Close image modal
    closeImageModal() {
        const modal = document.getElementById('image-zoom-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal._navigationData = null;
        }
    }

    // Download current zoom image
    async downloadCurrentZoomImage() {
        const modal = document.getElementById('image-zoom-modal');
        if (!modal || !modal._navigationData) return;

        const { images, currentIndex, context } = modal._navigationData;

        let imageUrl;
        let filename;
        if (context === 'gallery') {
            imageUrl = this.savedImages[currentIndex]?.url;
            filename = `gallery-image-${currentIndex + 1}.jpg`;
        } else {
            imageUrl = images[currentIndex]?.url || images[currentIndex];
            filename = `generated-image-${currentIndex + 1}.jpg`;
        }

        if (imageUrl) {
            await this.app.downloadImage(imageUrl, filename);
        }
    }

    // Delete current zoom image
    deleteCurrentZoomImage() {
        const modal = document.getElementById('image-zoom-modal');
        if (!modal || !modal._navigationData) return;

        const { currentIndex, context } = modal._navigationData;

        // Only allow deletion from gallery context
        if (context === 'gallery') {
            if (confirm('Are you sure you want to delete this image?')) {
                this.deleteImageFromGallery(currentIndex, true); // Skip second confirm

                // Update modal data after deletion
                if (this.savedImages.length === 0) {
                    this.closeImageModal();
                } else {
                    // Update navigation data with new array
                    modal._navigationData.images = this.savedImages;
                    
                    // Adjust current index if needed
                    const newIndex = Math.min(currentIndex, this.savedImages.length - 1);
                    modal._navigationData.currentIndex = newIndex;
                    
                    // Update display
                    this.updateZoomModal(this.savedImages[newIndex].url, newIndex, this.savedImages.length);
                }
            }
        }
    }

    // Save image to gallery
    saveToGallery(url, metadata, showFeedback = false) {
        try {
            // Don't save base64 images to gallery - they're too large and temporary
            if (url && url.startsWith('data:image/')) {
                this.app.logDebug('Skipped saving base64 image to gallery - use download button to save', 'warning');
                // Show warning to user about base64 result
                if (!showFeedback) { // Only show automatic warning, not for manual saves
                    return;
                }
            }

            if (url && !url.startsWith('data:image/')) {
                const imageData = {
                    url: url,
                    timestamp: Date.now(),
                    endpoint: metadata.endpoint || 'Unknown',
                    prompt: metadata.prompt || '',
                    parameters: metadata.parameters || {},
                    size: metadata.size || 'Unknown'
                };

                // Add to beginning of array (most recent first)
                this.savedImages.unshift(imageData);

                // Try to save with storage management
                this.app.saveWithStorageCheck('falai_saved_images', this.savedImages);

                // Update inline gallery if currently visible
                const inlineGallery = document.getElementById('inline-gallery');
                if (inlineGallery && !inlineGallery.classList.contains('hidden')) {
                    this.showInlineGallery();
                }

                this.app.logDebug(`Image saved to gallery: ${url.substring(0, 50)}... (${url.length} chars)`, 'success');
                if (showFeedback) {
                    this.app.logDebug(`Image saved to gallery with user feedback`, 'success');
                }
            }
        } catch (error) {
            // Don't crash the app if gallery save fails - just log it
            console.warn('Failed to save to gallery (storage full):', error.message);
            this.app.logDebug(`Gallery save failed: ${error.message}`, 'warning');
            if (showFeedback) {
                // Only show user feedback if they explicitly tried to save
                alert(`Could not save to gallery: ${error.message}`);
            }
        }
    }

    // Delete image from gallery
    deleteImageFromGallery(index, skipConfirm = false) {
        if (!skipConfirm && !confirm('Are you sure you want to delete this image?')) {
            return;
        }

        this.savedImages.splice(index, 1);
        localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));

        // Refresh current gallery view
        const inlineGallery = document.getElementById('inline-gallery');
        if (!inlineGallery.classList.contains('hidden')) {
            // We're in inline gallery mode
            this.showInlineGallery();
        } else {
            // We're in modal gallery mode (fallback)
            this.showGallery();
        }
    }

    // Download image from gallery by index
    async downloadImageFromGallery(index) {
        const imageData = this.savedImages[index];
        const filename = `falai-image-${index + 1}.jpg`;
        await this.app.downloadImage(imageData.url, filename);
    }

    // Legacy gallery methods for backward compatibility
    showGallery() {
        const container = document.getElementById('gallery-content');
        container.innerHTML = '';

        if (this.savedImages.length === 0) {
            container.innerHTML = '<p class="text-center">No saved images yet</p>';
        } else {
            this.savedImages.forEach((image, index) => {
                const item = this.createGalleryItem(image, index);
                container.appendChild(item);
            });
        }

        document.getElementById('gallery-modal').classList.remove('hidden');
    }

    createGalleryItem(imageData, index) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        const date = new Date(imageData.timestamp).toLocaleDateString();

        div.innerHTML = `
            <img src="${imageData.url}" alt="Saved image" loading="lazy">
            <div class="gallery-item-overlay">
                <button class="btn secondary" data-action="download" data-index="${index}" title="Download">💾</button>
                <button class="btn secondary" data-action="delete" data-index="${index}" title="Delete">🗑️</button>
            </div>
            <div class="gallery-item-info">
                <div>${imageData.endpoint}</div>
                <div>${date}</div>
            </div>
        `;

        // Add click handler for image zoom with gallery context
        const img = div.querySelector('img');
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            // Open image zoom modal for quick preview
            this.openImageModalWithNavigation(imageData.url, [imageData], 0, 'gallery');
        });

        // Add event listeners for action buttons
        const downloadBtn = div.querySelector('[data-action="download"]');
        const deleteBtn = div.querySelector('[data-action="delete"]');
        
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadImageFromGallery(index);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteImageFromGallery(index);
        });

        return div;
    }

    // Legacy fullscreen viewer methods
    openFullscreenViewer(index) {
        // fullscreenImages should already be set by the caller
        if (!this.fullscreenImages) {
            this.fullscreenImages = this.savedImages;
        }

        this.currentImageIndex = index;
        this.updateFullscreenViewer();

        document.getElementById('fullscreen-viewer').classList.remove('hidden');
        document.body.style.overflow = 'hidden';

        // Hide gallery modal if it exists
        const galleryModal = document.getElementById('gallery-modal');
        if (galleryModal) {
            galleryModal.classList.add('hidden');
        }
    }

    updateFullscreenViewer() {
        if (this.fullscreenImages.length === 0) return;

        const viewer = document.getElementById('fullscreen-viewer');
        const image = document.getElementById('fullscreen-image');
        const counter = document.getElementById('fullscreen-counter');
        const metadata = document.getElementById('fullscreen-metadata');

        const currentImage = this.fullscreenImages[this.currentImageIndex];
        image.src = currentImage.url;
        counter.textContent = `${this.currentImageIndex + 1} / ${this.fullscreenImages.length}`;

        const date = new Date(currentImage.timestamp).toLocaleDateString();
        metadata.innerHTML = `
            <div><strong>Date:</strong> ${date}</div>
            <div><strong>Endpoint:</strong> ${currentImage.endpoint}</div>
        `;

        // Toggle single image class
        if (this.fullscreenImages.length === 1) {
            viewer.classList.add('single-image');
        } else {
            viewer.classList.remove('single-image');
        }
    }

    closeFullscreenViewer() {
        document.getElementById('fullscreen-viewer').classList.add('hidden');
        document.body.style.overflow = '';

        // Clear fullscreen images array
        this.fullscreenImages = [];
        this.currentImageIndex = 0;
    }

    navigateFullscreen(direction) {
        if (this.fullscreenImages.length <= 1) return;

        this.currentImageIndex += direction;

        if (this.currentImageIndex < 0) {
            this.currentImageIndex = this.fullscreenImages.length - 1;
        } else if (this.currentImageIndex >= this.fullscreenImages.length) {
            this.currentImageIndex = 0;
        }

        this.updateFullscreenViewer();
    }

    async downloadCurrentFullscreenImage() {
        if (this.fullscreenImages.length === 0) return;

        const currentImage = this.fullscreenImages[this.currentImageIndex];
        const filename = `falai-image-${this.currentImageIndex + 1}.jpg`;
        await this.app.downloadImage(currentImage.url, filename);
    }

    async deleteCurrentFullscreenImage() {
        if (this.fullscreenImages.length === 0) return;

        if (!confirm('Are you sure you want to delete this image?')) {
            return;
        }

        // Find the actual index in savedImages
        const currentImage = this.fullscreenImages[this.currentImageIndex];
        const savedIndex = this.savedImages.findIndex(img =>
            img.url === currentImage.url && img.timestamp === currentImage.timestamp
        );

        if (savedIndex !== -1) {
            this.savedImages.splice(savedIndex, 1);
            localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));

            // Update fullscreen images array
            this.fullscreenImages.splice(this.currentImageIndex, 1);

            if (this.fullscreenImages.length === 0) {
                // No more images, close viewer and refresh gallery
                this.closeFullscreenViewer();
                this.showGallery();
            } else {
                // Adjust current index if needed
                if (this.currentImageIndex >= this.fullscreenImages.length) {
                    this.currentImageIndex = this.fullscreenImages.length - 1;
                }
                this.updateFullscreenViewer();
            }
        }
    }

    // Setup advanced touch gestures using Hammer.js
    setupAdvancedGestures(modal) {
        const zoomContainer = modal.querySelector('.image-zoom-container');
        const zoomImage = modal.querySelector('#zoom-image');
        
        if (!window.Hammer) {
            console.warn('Hammer.js not loaded, advanced gestures disabled');
            return;
        }

        // Initialize Hammer manager
        const hammer = new window.Hammer.Manager(zoomContainer);
        
        // Add recognizers with proper configuration
        const pan = new window.Hammer.Pan({ threshold: 10, pointers: 1 });
        const pinch = new window.Hammer.Pinch({ threshold: 0.1 });
        const swipe = new window.Hammer.Swipe({ 
            direction: window.Hammer.DIRECTION_HORIZONTAL, 
            velocity: 0.1, // Lower velocity threshold
            threshold: 30  // Lower distance threshold
        });
        const doubletap = new window.Hammer.Tap({ 
            event: 'doubletap', 
            taps: 2, 
            interval: 300, 
            threshold: 10 
        });
        const singletap = new window.Hammer.Tap({ 
            event: 'singletap',
            taps: 1
        });
        const press = new window.Hammer.Press({ time: 500 });

        hammer.add([pan, pinch, swipe, doubletap, singletap, press]);

        // Set recognizer relationships
        pinch.recognizeWith(pan);
        doubletap.requireFailure(singletap);
        // Important: Don't make swipe require pan failure - they should work independently
        pan.recognizeWith(swipe);
        
        // Gesture state
        let currentScale = 1;
        let currentX = 0;
        let currentY = 0;
        const minScale = 1;
        const maxScale = 4;

        const applyTransform = () => {
            zoomImage.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
        };

        // Pinch to zoom
        let lastScale = 1;
        hammer.on('pinchstart', (e) => {
            lastScale = currentScale;
            zoomImage.style.transition = 'none';
        });

        hammer.on('pinchmove', (e) => {
            const newScale = Math.max(minScale, Math.min(maxScale, lastScale * e.scale));
            currentScale = newScale;
            applyTransform();
        });

        hammer.on('pinchend', () => {
            // Only reset if very close to scale 1
            if (currentScale > 0.9 && currentScale < 1.1) {
                currentScale = 1;
                currentX = 0;
                currentY = 0;
            }
            zoomImage.style.transition = 'transform 0.3s ease';
            applyTransform();
        });

        // Pan when zoomed or scaled
        let isPanning = false;
        let lastPanX = 0;
        let lastPanY = 0;

        hammer.on('panstart', (e) => {
            console.log('Pan start, scale:', currentScale);
            if (currentScale !== 1) {
                isPanning = true;
                lastPanX = currentX;
                lastPanY = currentY;
                zoomImage.style.transition = 'none';
            }
        });

        hammer.on('panmove', (e) => {
            if (currentScale !== 1 && isPanning) {
                currentX = lastPanX + e.deltaX / currentScale;
                currentY = lastPanY + e.deltaY / currentScale;
                applyTransform();
            }
        });

        hammer.on('panend', () => {
            if (isPanning) {
                isPanning = false;
                zoomImage.style.transition = 'transform 0.1s ease';
            }
        });

        // Swipe navigation with debounce protection
        let lastSwipeTime = 0;
        hammer.on('swipe', (e) => {
            const now = Date.now();
            console.log('Swipe detected:', {
                direction: e.direction,
                velocity: e.velocity,
                deltaX: e.deltaX,
                scale: currentScale
            });

            // Only allow swipe navigation when not zoomed and not too frequent
            if (currentScale === 1 && now - lastSwipeTime > 300) {
                lastSwipeTime = now;
                e.preventDefault();
                e.srcEvent.stopPropagation();
                
                if (e.direction === window.Hammer.DIRECTION_LEFT) {
                    console.log('🔄 Navigate to next image');
                    this.navigateZoomModal(1); // Next image
                } else if (e.direction === window.Hammer.DIRECTION_RIGHT) {
                    console.log('🔄 Navigate to previous image');
                    this.navigateZoomModal(-1); // Previous image
                }
            }
        });

        // Double tap to zoom toggle
        hammer.on('doubletap', (e) => {
            console.log('Double tap detected, current scale:', currentScale);
            e.preventDefault();
            if (currentScale !== 1) {
                // Reset zoom
                currentScale = 1;
                currentX = 0;
                currentY = 0;
            } else {
                // Zoom in to 2x
                currentScale = 2;
            }
            zoomImage.style.transition = 'transform 0.3s ease';
            applyTransform();
        });

        // Long press for context menu (download/delete)
        hammer.on('press', () => {
            if (navigator.vibrate) {
                navigator.vibrate(50); // Haptic feedback
            }
            console.log('Long press detected - could show context menu');
        });

        // Reset transform when modal content changes
        const originalUpdateZoomModal = this.updateZoomModal.bind(this);
        this.updateZoomModal = function(imageUrl, currentIndex, totalImages) {
            // Reset transform state when switching images
            currentScale = 1;
            currentX = 0;
            currentY = 0;
            zoomImage.style.transform = 'none';
            zoomImage.style.transition = 'transform 0.3s ease';
            
            return originalUpdateZoomModal(imageUrl, currentIndex, totalImages);
        };

        // Store hammer instance for cleanup
        modal._hammerInstance = hammer;
    }

    // Cleanup old gallery images to manage storage
    cleanupOldGalleryImages(maxImages = 500) {
        // Only clean gallery if it's extremely large (500+ images)
        // Gallery URLs are small, so we keep more
        if (!this.savedImages || this.savedImages.length <= maxImages) {
            return 0; // Nothing to clean
        }

        const originalCount = this.savedImages.length;
        // Keep only the most recent images
        this.savedImages = this.savedImages.slice(0, maxImages);
        localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));

        const removedCount = originalCount - this.savedImages.length;
        this.app.logDebug(`Cleaned up ${removedCount} old gallery entries, kept ${this.savedImages.length} most recent`, 'info');
        return removedCount;
    }

    // Storage management helpers
    analyzeGallery() {
        console.log('🖼️ Analyzing gallery images...');
        const images = this.savedImages;
        console.log(`Total images: ${images.length}`);
        
        let totalSize = 0;
        let base64Count = 0;
        let urlCount = 0;
        
        images.forEach(img => {
            const imgSize = new Blob([JSON.stringify(img)]).size;
            totalSize += imgSize;
            
            if (img.url.startsWith('data:image/')) {
                base64Count++;
            } else {
                urlCount++;
            }
        });
        
        console.log(`URL images: ${urlCount}`);
        console.log(`Base64 images: ${base64Count}`);
        console.log(`Total size: ${this.app.formatBytes(totalSize)}`);
        
        if (base64Count > 0) {
            console.log(`💡 Run falaiStorage.cleanGalleryBase64() to remove base64 images from gallery`);
        }
    }

    cleanGalleryBase64() {
        const before = this.savedImages.length;
        const sizeBefore = new Blob([JSON.stringify(this.savedImages)]).size;
        
        this.savedImages = this.savedImages.filter(img => !img.url.startsWith('data:image/'));
        
        const after = this.savedImages.length;
        const sizeAfter = new Blob([JSON.stringify(this.savedImages)]).size;
        
        localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));
        console.log(`🧹 Cleaned gallery: removed ${before - after} base64 images`);
        console.log(`💾 Freed ${this.app.formatBytes(sizeBefore - sizeAfter)} from gallery`);
        this.app.logStorageInfo();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FalAIGallery;
}