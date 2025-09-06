/**
 * Gallery Module for FalAI
 * Enhanced with Fancybox 5 for modern gallery experience
 * Handles image display, storage, and navigation
 */

class FalAIGallery {
    constructor(app) {
        this.app = app;
        this.savedImages = JSON.parse(localStorage.getItem('falai_saved_images') || '[]');
        this.currentImageIndex = 0;
        this.fancyboxInstance = null;
        
        // Selection state
        this.selectionMode = false;
        this.selectedImages = new Set();
        
        this.initializeEventListeners();
        this.initializeFancybox();
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

        // Selection mode controls
        const selectionModeBtn = document.getElementById('selection-mode-btn');
        if (selectionModeBtn) {
            selectionModeBtn.addEventListener('click', () => {
                this.toggleSelectionMode();
                selectionModeBtn.textContent = this.selectionMode ? 'Cancel' : 'Select';
                selectionModeBtn.classList.toggle('active', this.selectionMode);
            });
        }

        // Bulk action controls
        const selectAllBtn = document.getElementById('select-all-btn');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                this.selectAllImages();
            });
        }

        const clearSelectionBtn = document.getElementById('clear-selection-btn');
        if (clearSelectionBtn) {
            clearSelectionBtn.addEventListener('click', () => {
                this.clearSelection();
            });
        }

        const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => {
                this.bulkDeleteImages();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when gallery is visible and not in input
            const galleryVisible = !document.getElementById('inline-gallery')?.classList.contains('hidden');
            if (!galleryVisible || e.target.matches('input, textarea')) return;

            switch (e.key) {
                case 'Escape':
                    if (this.selectionMode) {
                        this.toggleSelectionMode();
                        const selectionBtn = document.getElementById('selection-mode-btn');
                        if (selectionBtn) {
                            selectionBtn.textContent = 'Select';
                            selectionBtn.classList.remove('active');
                        }
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

    initializeFancybox() {
        // Initialize Fancybox with custom options
        if (typeof Fancybox !== 'undefined') {
            // Gallery images
            Fancybox.bind('[data-fancybox="gallery"]', this.getFancyboxOptions());
            
            // Mobile gallery images
            Fancybox.bind('[data-fancybox="mobile-gallery"]', this.getFancyboxOptions());
            
            // Result images
            Fancybox.bind('[data-fancybox="result-gallery"]', this.getFancyboxOptions());
        }
    }

    getFancyboxOptions() {
        return {
            // Appearance - disable all animations that cause dimming
            compact: false,
            idle: false,
            animated: false,  // Disable all animations
            
            // UI Configuration
            Toolbar: {
                display: {
                    left: ["infobar"],
                    middle: [],
                    right: ["iterateZoom", "slideshow", "fullscreen", "thumbs", "close"]
                }
            },
            
            // Images - prevent loading states
            Images: {
                zoom: true,
                initialSize: "fit",
                lazy: false  // Disable lazy loading
            },
            
            // Enhanced Carousel settings for smooth navigation
            Carousel: {
                infinite: false,
                friction: 0.12,
                preload: 2
            },
            
            // Event handlers to force brightness
            on: {
                "init": (fancybox) => {
                    // Remove any dimming immediately on init
                    if (fancybox.$container) {
                        fancybox.$container.style.setProperty('--fancybox-content-opacity', '1', 'important');
                    }
                },
                "ready": (fancybox) => {
                    // Force full opacity on all slides
                    const slides = fancybox.$container?.querySelectorAll('.fancybox__slide');
                    if (slides) {
                        slides.forEach(slide => {
                            slide.style.opacity = '1';
                            const content = slide.querySelector('.fancybox__content');
                            if (content) {
                                content.style.opacity = '1';
                                content.style.filter = 'none';
                            }
                            const img = slide.querySelector('img');
                            if (img) {
                                img.style.opacity = '1';
                                img.style.filter = 'none';
                            }
                        });
                    }
                },
                "reveal": (fancybox, slide) => {
                    // Ensure immediate full brightness on reveal
                    if (slide.$content) {
                        slide.$content.style.setProperty('opacity', '1', 'important');
                        slide.$content.style.setProperty('filter', 'none', 'important');
                        
                        const img = slide.$content.querySelector('img');
                        if (img) {
                            img.style.setProperty('opacity', '1', 'important');
                            img.style.setProperty('filter', 'none', 'important');
                        }
                    }
                },
                "Carousel.change": (fancybox, carousel, to) => {
                    this.currentImageIndex = to;
                }
            }
        };
    }

    addCustomButtons(fancybox) {
        // Add a small delay to ensure DOM is ready
        setTimeout(() => {
            try {
                // Add download button
                const downloadBtn = document.createElement('button');
                downloadBtn.className = 'f-button f-button--download';
                downloadBtn.innerHTML = '💾';
                downloadBtn.title = 'Download';
                downloadBtn.addEventListener('click', () => {
                    this.downloadCurrentImage(fancybox);
                });
                
                // Add delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'f-button f-button--delete';
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Delete';
                deleteBtn.style.color = '#dc3545';
                deleteBtn.addEventListener('click', () => {
                    this.deleteCurrentImage(fancybox);
                });
                
                // Find toolbar using multiple selectors
                let toolbar = null;
                const possibleSelectors = [
                    '.f-toolbar__right',
                    '.fancybox__toolbar',
                    '.f-toolbar',
                    '[data-fancybox-toolbar]'
                ];
                
                for (const selector of possibleSelectors) {
                    if (fancybox.$container) {
                        toolbar = fancybox.$container.querySelector(selector);
                        if (toolbar) break;
                    }
                }
                
                if (toolbar) {
                    // Insert before close button
                    const closeBtn = toolbar.querySelector('[data-fancybox-close]') || 
                                   toolbar.querySelector('.f-button--close') ||
                                   toolbar.lastElementChild;
                    
                    if (closeBtn && closeBtn.parentNode === toolbar) {
                        toolbar.insertBefore(deleteBtn, closeBtn);
                        toolbar.insertBefore(downloadBtn, closeBtn);
                    } else {
                        toolbar.appendChild(downloadBtn);
                        toolbar.appendChild(deleteBtn);
                    }
                } else {
                    console.warn('Could not find Fancybox toolbar to add custom buttons');
                }
            } catch (error) {
                console.error('Error adding custom buttons:', error);
            }
        }, 100);
    }

    downloadCurrentImage(fancybox) {
        const currentSlide = fancybox.getSlide();
        if (currentSlide && currentSlide.src) {
            const link = document.createElement('a');
            link.href = currentSlide.src;
            
            // Extract filename from URL or use timestamp
            let filename = 'falai-image.png';
            try {
                const url = new URL(currentSlide.src);
                const pathSegments = url.pathname.split('/');
                const lastSegment = pathSegments[pathSegments.length - 1];
                if (lastSegment && lastSegment.includes('.')) {
                    filename = lastSegment;
                } else {
                    filename = `falai-image-${Date.now()}.png`;
                }
            } catch (e) {
                filename = `falai-image-${Date.now()}.png`;
            }
            
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    deleteCurrentImage(fancybox) {
        const currentIndex = fancybox.getSlide().index;
        
        if (confirm('Are you sure you want to delete this image?')) {
            // Remove from saved images
            this.savedImages.splice(currentIndex, 1);
            this.saveImages();
            
            // Close fancybox and refresh gallery
            fancybox.close();
            this.showInlineGallery();
            this.updateMobileGallery();
            
            // Show success message
            if (this.app && this.app.showNotification) {
                this.app.showNotification('Image deleted successfully', 'success');
            }
        }
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
        
        // Reinitialize Fancybox for new elements
        this.reinitializeFancybox();
    }

    // Create gallery item for inline display with Fancybox integration
    createInlineGalleryItem(imageData, index) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.setAttribute('data-image-id', imageData.timestamp); // Unique identifier
        
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
        
        // Create anchor element for Fancybox
        const link = document.createElement('a');
        link.href = imageData.url;
        link.setAttribute('data-fancybox', 'gallery');
        link.setAttribute('data-caption', `${imageData.endpoint} - ${date}`);
        link.setAttribute('data-index', index);
        
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

        return div;
    }

    // Create result image item with Fancybox support
    createResultImageItem(imageUrl, metadata = {}) {
        const div = document.createElement('div');
        div.className = 'result-image';

        // Create anchor for Fancybox
        const link = document.createElement('a');
        link.href = imageUrl;
        link.setAttribute('data-fancybox', 'result-gallery');
        
        if (metadata.endpoint) {
            link.setAttribute('data-caption', `Generated with ${metadata.endpoint}`);
        }

        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = 'Generated image';
        img.loading = 'lazy';

        // Action buttons overlay
        const actions = document.createElement('div');
        actions.className = 'result-image-actions';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn secondary small';
        saveBtn.innerHTML = '💾';
        saveBtn.title = 'Save to gallery';
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.saveImage(imageUrl, metadata);
        });

        actions.appendChild(saveBtn);
        
        link.appendChild(img);
        div.appendChild(link);
        div.appendChild(actions);

        return div;
    }

    // Update mobile gallery content
    updateMobileGallery() {
        const container = document.getElementById('mobile-gallery-content');
        const countElement = document.getElementById('mobile-gallery-count');

        if (!container) return;

        container.innerHTML = '';
        countElement.textContent = `${this.savedImages.length} images`;

        if (this.savedImages.length === 0) {
            container.innerHTML = '<div class="text-center" style="grid-column: 1/-1; padding: 2rem; color: #6b7280;">No saved images yet</div>';
        } else {
            this.savedImages.forEach((image, index) => {
                const item = this.createMobileGalleryItem(image, index);
                container.appendChild(item);
            });
        }
        
        // Reinitialize Fancybox for mobile gallery elements
        this.reinitializeFancybox();
    }

    // Create mobile gallery item
    createMobileGalleryItem(imageData, index) {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.setAttribute('data-image-id', imageData.timestamp); // Unique identifier
        
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
        link.setAttribute('data-fancybox', 'mobile-gallery');
        link.setAttribute('data-caption', `${imageData.endpoint} - ${date}`);
        
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

        return div;
    }

    // Reinitialize Fancybox for new elements
    reinitializeFancybox() {
        // Destroy existing instances
        if (this.fancyboxInstance) {
            Fancybox.destroy();
        }
        
        // Reinitialize
        this.initializeFancybox();
    }

    // Save image to gallery
    saveImage(imageUrl, metadata = {}) {
        const imageData = {
            url: imageUrl,
            timestamp: Date.now(),
            endpoint: metadata.endpoint || 'Unknown',
            parameters: metadata.parameters || {},
            ...metadata
        };

        this.savedImages.unshift(imageData);
        this.saveImages();
        
        // Update galleries
        this.showInlineGallery();
        this.updateMobileGallery();

        // Show success notification
        if (this.app && this.app.showNotification) {
            this.app.showNotification('Image saved to gallery', 'success');
        }
    }

    // Save images to localStorage
    saveImages() {
        localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));
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
        const bulkToolbar = document.getElementById('bulk-actions-toolbar');
        const selectionCounter = document.getElementById('selection-counter');
        
        if (bulkToolbar) {
            bulkToolbar.style.display = selectionCount > 0 ? 'flex' : 'none';
        }
        
        if (selectionCounter) {
            selectionCounter.textContent = `${selectionCount} selected`;
        }
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
}

// Export for use in main app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FalAIGallery;
}