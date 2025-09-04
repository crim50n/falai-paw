class FalAI {
    constructor() {
        this.apiKey = localStorage.getItem('falai_api_key') || '';
        this.endpoints = new Map();
        this.currentEndpoint = null;
        this.currentRequestId = null;
        this.statusPolling = null;
        this.savedImages = JSON.parse(localStorage.getItem('falai_saved_images') || '[]');
        this.endpointSettings = JSON.parse(localStorage.getItem('falai_endpoint_settings') || '{}');
        this.currentImageIndex = 0;
        this.fullscreenImages = [];
        this.debugMode = localStorage.getItem('falai_debug_mode') === 'true';

        this.init();
    }

    logDebug(message, type = 'info', data = null) {
        if (!this.debugMode) return;

        const timestamp = new Date().toLocaleTimeString();
        const debugContent = document.getElementById('debug-content');

        const entry = document.createElement('div');
        entry.className = `debug-entry ${type}`;

        entry.innerHTML = `
            <div class="timestamp">${timestamp}</div>
            <div class="type">${type.toUpperCase()}</div>
            <div class="message">${message}</div>
            ${data ? `<pre>${JSON.stringify(data, null, 2)}</pre>` : ''}
        `;

        debugContent.appendChild(entry);
        debugContent.scrollTop = debugContent.scrollHeight;
    }

    async init() {
        await this.loadEndpoints();
        this.loadCustomEndpoints();
        this.renderEndpointDropdown(); // Re-render after loading custom endpoints
        this.setupEventListeners();
        this.restoreUIState();
        this.setupPWA();
        this.initDebugMode();

        // Log storage info on startup if debug mode is enabled
        if (this.debugMode) {
            this.logStorageInfo();
        } else {
            // Always log if storage is critically full (>90%)
            const info = this.getStorageSize();
            if (parseFloat(info.usage) > 90) {
                console.warn(`⚠️ Storage ${info.usage}% full! Run falaiStorage.info() for details`);
            }
        }

        // Make storage functions available globally for debugging
        window.falaiStorage = {
            info: () => this.logStorageInfo(),
            cleanup: () => {
                console.log('🧹 Starting cleanup...');
                const base64 = this.cleanupBase64Images();
                const settings = this.cleanupOldSettings();
                const gallery = this.cleanupOldGalleryImages();
                console.log(`✅ Cleanup complete:`);
                console.log(`  📷 Base64 images: ${base64.count} removed (${this.formatBytes(base64.sizeFreed)} freed)`);
                console.log(`  ⚙️  Settings: ${settings} removed`);
                console.log(`  🖼️  Gallery: ${gallery} entries removed`);
                this.logStorageInfo();
            },
            cleanBase64: () => {
                const result = this.cleanupBase64Images();
                console.log(`Removed ${result.count} base64 images, freed ${this.formatBytes(result.sizeFreed)}`);
                this.logStorageInfo();
            },
            clear: () => {
                this.savedImages = [];
                localStorage.setItem('falai_saved_images', '[]');
                console.log('Gallery cleared');
                this.logStorageInfo();
            },
            findLargest: () => {
                console.log('🔍 Finding largest localStorage entries...');
                const entries = [];
                for (let key in localStorage) {
                    if (localStorage.hasOwnProperty(key)) {
                        const value = localStorage.getItem(key);
                        const size = new Blob([value]).size;
                        entries.push({ key, size, preview: value.substring(0, 100) + (value.length > 100 ? '...' : '') });
                    }
                }
                entries.sort((a, b) => b.size - a.size);
                entries.slice(0, 10).forEach((entry, i) => {
                    console.log(`${i + 1}. ${entry.key}: ${this.formatBytes(entry.size)}`);
                    console.log(`   Preview: ${entry.preview}`);
                });
                return entries;
            },
            analyzeGallery: () => {
                console.log('🖼️ Analyzing gallery images...');
                const images = this.savedImages;
                console.log(`Total images: ${images.length}`);

                let urlCount = 0;
                let base64Count = 0;
                let totalSize = 0;

                images.forEach((img, i) => {
                    const size = new Blob([img.url]).size;
                    totalSize += size;

                    if (img.url.startsWith('data:image/')) {
                        base64Count++;
                        console.log(`${i + 1}. [BASE64] ${this.formatBytes(size)} - ${img.endpoint} (${new Date(img.timestamp).toLocaleString()})`);
                    } else {
                        urlCount++;
                        console.log(`${i + 1}. [URL] ${this.formatBytes(size)} - ${img.url.substring(0, 50)}...`);
                    }
                });

                console.log(`Summary: ${urlCount} URLs, ${base64Count} base64 images`);
                console.log(`Total size: ${this.formatBytes(totalSize)}`);

                if (base64Count > 0) {
                    console.log(`💡 Run falaiStorage.cleanGalleryBase64() to remove base64 images from gallery`);
                }
            },
            cleanGalleryBase64: () => {
                const before = this.savedImages.length;
                const sizeBefore = new Blob([JSON.stringify(this.savedImages)]).size;

                this.savedImages = this.savedImages.filter(img => !img.url.startsWith('data:image/'));

                const after = this.savedImages.length;
                const sizeAfter = new Blob([JSON.stringify(this.savedImages)]).size;

                localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));

                console.log(`🧹 Cleaned gallery: removed ${before - after} base64 images`);
                console.log(`💾 Freed ${this.formatBytes(sizeBefore - sizeAfter)} from gallery`);
                this.logStorageInfo();
            }
        };
    }

    initDebugMode() {
        const debugCheckbox = document.getElementById('debug-checkbox');
        const debugPanel = document.getElementById('debug-panel');

        // Restore debug mode state
        debugCheckbox.checked = this.debugMode;
        if (this.debugMode) {
            debugPanel.classList.remove('hidden');
            this.logDebug('Debug mode restored', 'system');
        }
    }

    async loadEndpoints() {
        try {
            const response = await fetch('/endpoints');
            if (!response.ok) {
                // Fallback: manually load known endpoints
                await this.loadEndpointsManually();
                return;
            }
            const endpointPaths = await response.json();

            for (const path of endpointPaths) {
                await this.loadEndpoint(path);
            }
        } catch (error) {
            console.warn('Could not auto-discover endpoints, loading manually:', error);
            await this.loadEndpointsManually();
        }

        this.renderEndpointDropdown();
    }

    async loadEndpointsManually() {
        const knownEndpoints = [
            'endpoints/flux-pro/kontext/openapi.json',
            'endpoints/flux-krea-lora/openapi.json',
            'endpoints/flux-lora/openapi.json',
            'endpoints/flux-kontext/dev/openapi.json'
        ];

        for (const path of knownEndpoints) {
            await this.loadEndpoint(path);
        }
    }

    async loadEndpoint(path) {
        try {
            const response = await fetch(path);
            if (!response.ok) {
                console.warn(`Failed to load endpoint from ${path}`);
                return;
            }

            const schema = await response.json();
            const metadata = schema.info?.['x-fal-metadata'];

            if (!metadata) {
                console.warn(`No fal metadata found in ${path}`);
                return;
            }

            const endpoint = {
                path,
                schema,
                metadata,
                title: schema.info.title,
                description: schema.info.description
            };

            this.endpoints.set(metadata.endpointId, endpoint);
            console.log(`Loaded endpoint: ${metadata.endpointId}`);

            // Re-render dropdown after each endpoint loads
            this.renderEndpointDropdown();
        } catch (error) {
            console.warn(`Error loading endpoint ${path}:`, error);
        }
    }

    renderEndpointDropdown() {
        const dropdown = document.getElementById('endpoint-dropdown');
        if (!dropdown) {
            console.warn('endpoint-dropdown element not found');
            return;
        }

        dropdown.innerHTML = '<option value="">Choose an endpoint...</option>';

        console.log(`Rendering dropdown with ${this.endpoints.size} endpoints`);

        // Convert endpoints to array and sort alphabetically by endpoint name
        const sortedEndpoints = Array.from(this.endpoints.entries()).sort((a, b) => {
            const nameA = a[1].metadata.endpointId.toLowerCase();
            const nameB = b[1].metadata.endpointId.toLowerCase();
            return nameA.localeCompare(nameB);
        });

        for (const [id, endpoint] of sortedEndpoints) {
            const option = document.createElement('option');
            option.value = id;
            const isCustom = id.startsWith('custom-');
            option.textContent = `${endpoint.metadata.endpointId} (${endpoint.metadata.category})${isCustom ? ' 🔧' : ''}`;
            dropdown.appendChild(option);
        }

        // Update delete button visibility for current selection
        this.updateDeleteButtonVisibility(dropdown.value);

        // Auto-select last used endpoint if available
        const lastEndpoint = localStorage.getItem('falai_last_endpoint');
        if (lastEndpoint && this.endpoints.has(lastEndpoint) && dropdown.value === '') {
            dropdown.value = lastEndpoint;
            this.selectEndpoint(lastEndpoint);
            this.updateDeleteButtonVisibility(lastEndpoint);
        }
    }

    selectEndpoint(endpointId) {
        const endpoint = this.endpoints.get(endpointId);
        if (!endpoint) return;

        this.currentEndpoint = endpoint;
        this.currentEndpointId = endpointId;

        this.showEndpointInfo();
        this.generateForm();
        this.hideResults();
    }

    clearEndpointSelection() {
        this.currentEndpoint = null;
        this.currentEndpointId = null;

        // Hide endpoint info and form
        document.getElementById('endpoint-info').classList.add('hidden');
        document.getElementById('api-form').classList.add('hidden');

        this.hideResults();
    }

    showEndpointInfo() {
        const endpoint = this.currentEndpoint;
        const info = document.getElementById('endpoint-info');

        document.getElementById('endpoint-thumbnail').src = endpoint.metadata.thumbnailUrl;
        document.getElementById('endpoint-title').textContent = endpoint.metadata.endpointId;
        document.getElementById('endpoint-category').textContent = endpoint.metadata.category;
        document.getElementById('playground-link').href = endpoint.metadata.playgroundUrl;
        document.getElementById('docs-link').href = endpoint.metadata.documentationUrl;

        info.classList.remove('hidden');
    }

    updateDeleteButtonVisibility(endpointId) {
        const deleteBtn = document.getElementById('delete-endpoint-btn');
        if (!deleteBtn) {
            console.warn('delete-endpoint-btn element not found in updateDeleteButtonVisibility');
            return;
        }

        if (endpointId && endpointId.startsWith('custom-')) {
            deleteBtn.classList.remove('hidden');
        } else {
            deleteBtn.classList.add('hidden');
        }
    }

    deleteCurrentEndpoint() {
        console.log('deleteCurrentEndpoint called, currentEndpointId:', this.currentEndpointId);

        if (!this.currentEndpointId || !this.currentEndpointId.startsWith('custom-')) {
            console.log('Not a custom endpoint or no endpoint selected');
            return;
        }

        const endpoint = this.endpoints.get(this.currentEndpointId);
        if (!endpoint) {
            console.log('Endpoint not found');
            return;
        }

        const endpointName = endpoint.metadata.endpointId;
        console.log('Deleting endpoint:', endpointName);

        if (confirm(`Are you sure you want to delete the custom endpoint "${endpointName}"? This action cannot be undone.`)) {
            // Remove from endpoints map
            this.endpoints.delete(this.currentEndpointId);

            // Update storage
            this.saveCustomEndpoints();

            // Update UI
            this.renderEndpointDropdown();
            this.clearEndpointSelection();
            this.updateDeleteButtonVisibility(null);

            // Reset dropdown selection
            document.getElementById('endpoint-dropdown').value = '';

            // Show success message
            this.logDebug(`Successfully deleted custom endpoint: ${endpointName}`, 'success');

            // Show alert if debug is disabled
            if (!this.debugMode) {
                alert(`Successfully deleted custom endpoint: ${endpointName}`);
            }
        }
    }

    generateForm() {
        const endpoint = this.currentEndpoint;
        const schema = endpoint.schema;

        // Find the input schema
        const inputSchema = this.findInputSchema(schema);
        if (!inputSchema) {
            console.error('Could not find input schema');
            return;
        }

        const container = document.getElementById('form-fields');
        container.innerHTML = '';

        // Generate form fields based on schema
        this.generateFormFields(inputSchema, container);

        // Restore saved settings for this endpoint
        this.restoreEndpointSettings(endpoint.metadata.endpointId);

        document.getElementById('api-form').classList.remove('hidden');
    }

    findInputSchema(schema) {
        // Look for POST endpoint that accepts the input
        for (const [path, methods] of Object.entries(schema.paths)) {
            if (methods.post && methods.post.requestBody) {
                const content = methods.post.requestBody.content;
                if (content['application/json'] && content['application/json'].schema) {
                    const schemaRef = content['application/json'].schema;
                    return this.resolveSchema(schemaRef, schema);
                }
            }
        }
        return null;
    }

    resolveSchema(schemaRef, rootSchema) {
        if (schemaRef.$ref) {
            const refPath = schemaRef.$ref.replace('#/', '').split('/');
            let resolved = rootSchema;
            for (const part of refPath) {
                resolved = resolved[part];
            }
            return resolved;
        }
        return schemaRef;
    }

    generateFormFields(schema, container) {
        const properties = schema.properties || {};
        const required = schema.required || [];
        const order = schema['x-fal-order-properties'] || Object.keys(properties);

        // Create main fields container
        const mainFields = document.createElement('div');
        mainFields.className = 'main-fields';

        // Create advanced options container
        const advancedContainer = document.createElement('div');
        advancedContainer.className = 'advanced-options';
        advancedContainer.innerHTML = `
            <button type="button" class="advanced-options-toggle">
                ▼ Advanced Options
            </button>
            <div class="advanced-options-content"></div>
        `;

        const advancedContent = advancedContainer.querySelector('.advanced-options-content');
        const toggle = advancedContainer.querySelector('.advanced-options-toggle');

        toggle.addEventListener('click', () => {
            advancedContent.classList.toggle('visible');
            toggle.textContent = advancedContent.classList.contains('visible')
                ? '▲ Advanced Options'
                : '▼ Advanced Options';
        });

        // Only show prompt in main fields, everything else goes to advanced options
        for (const fieldName of order) {
            const fieldSchema = properties[fieldName];
            if (!fieldSchema) continue;

            const isRequired = required.includes(fieldName);
            const field = this.createFormField(fieldName, fieldSchema, isRequired);

            // Determine which fields should be in main interface vs advanced options
            const isMainField = fieldName === 'prompt' ||
                              (fieldName.includes('image') && fieldName.includes('_url')) ||
                              fieldName.includes('mask') ||
                              fieldName.includes('reference');

            if (isMainField) {
                // Main fields: prompt and all image/mask fields
                mainFields.appendChild(field);
            } else {
                // All other fields go to advanced options
                advancedContent.appendChild(field);
            }
        }

        container.appendChild(mainFields);
        container.appendChild(advancedContainer);
    }

    createFormField(name, schema, required = false) {
        const field = document.createElement('div');
        field.className = 'form-field';

        const label = document.createElement('label');
        label.textContent = (schema.title || name) + (required ? ' *' : '');
        label.setAttribute('for', name);

        let input;

        // Handle anyOf schemas (like image_size)
        if (schema.anyOf && schema.anyOf.length > 0) {
            // Find the enum option in anyOf
            const enumSchema = schema.anyOf.find(option => option.enum);
            if (enumSchema) {
                schema = { ...schema, enum: enumSchema.enum };
            } else {
                // Use first option if no enum found
                schema = { ...schema, ...schema.anyOf[0] };
            }
        }

        // Handle image URL fields with file upload
        if (name.includes('image_url') || name.includes('mask_url') ||
            (name.includes('image') && schema.type === 'string' && !schema.enum) ||
            (name.includes('mask') && schema.type === 'string' && !schema.enum)) {
            return this.createImageUploadField(name, schema, required, label, field);
        }

        // Handle array fields (like loras)
        if (schema.type === 'array') {
            return this.createArrayField(name, schema, required, label, field);
        }

        if (schema.enum) {
            // Special handling for image_size field
            if (name === 'image_size') {
                return this.createImageSizeField(name, schema, required, label, field);
            }

            input = document.createElement('select');
            input.innerHTML = '<option value="">Select...</option>';
            for (const option of schema.enum) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                input.appendChild(opt);
            }
        } else if (schema.type === 'boolean') {
            input = document.createElement('input');
            input.type = 'checkbox';
        } else if (schema.type === 'integer' || schema.type === 'number') {
            // Create range slider for numeric fields with min/max
            if (schema.minimum !== undefined && schema.maximum !== undefined) {
                return this.createSliderField(name, schema, required, label, field);
            }

            input = document.createElement('input');
            input.type = 'number';
            if (schema.minimum !== undefined) input.min = schema.minimum;
            if (schema.maximum !== undefined) input.max = schema.maximum;
            if (schema.default !== undefined) input.value = schema.default;
        } else if (schema.description && schema.description.length > 100) {
            input = document.createElement('textarea');
        } else {
            input = document.createElement('input');
            input.type = schema.format === 'password' ? 'password' : 'text';
        }

        // Add example prompts for prompt field
        if (name === 'prompt') {
            return this.createPromptField(name, schema, required, label, field);
        }

        input.id = name;
        input.name = name;

        if (schema.default !== undefined && input.type !== 'checkbox') {
            input.value = schema.default;
        } else if (schema.default !== undefined && input.type === 'checkbox') {
            input.checked = schema.default;
        }

        if (required) {
            input.required = true;
        }

        field.appendChild(label);
        field.appendChild(input);

        if (schema.description) {
            const desc = document.createElement('div');
            desc.className = 'field-description';
            desc.textContent = schema.description;
            field.appendChild(desc);
        }

        // Add change listener to save settings
        input.addEventListener('change', () => {
            this.saveEndpointSettings();
        });

        return field;
    }

    createPromptField(name, schema, required, label, field) {
        field.appendChild(label);

        const promptContainer = document.createElement('div');
        promptContainer.className = 'prompt-container';

        const textarea = document.createElement('textarea');
        textarea.id = name;
        textarea.name = name;
        textarea.placeholder = 'Describe the image you want to generate...';
        textarea.rows = 3;
        if (required) textarea.required = true;

        // Example prompts based on endpoint category
        const examples = this.getExamplePrompts();

        if (examples.length > 0) {
            const examplesContainer = document.createElement('div');
            examplesContainer.className = 'prompt-examples';

            const examplesLabel = document.createElement('div');
            examplesLabel.className = 'examples-label';
            examplesLabel.textContent = 'Example prompts:';

            const examplesList = document.createElement('div');
            examplesList.className = 'examples-list';

            examples.forEach((example, index) => {
                const exampleButton = document.createElement('button');
                exampleButton.type = 'button';
                exampleButton.className = 'example-prompt';
                exampleButton.textContent = example;

                exampleButton.addEventListener('click', () => {
                    textarea.value = example;
                    this.saveEndpointSettings();
                });

                examplesList.appendChild(exampleButton);
            });

            examplesContainer.appendChild(examplesLabel);
            examplesContainer.appendChild(examplesList);
            promptContainer.appendChild(examplesContainer);
        }

        textarea.addEventListener('input', () => {
            this.saveEndpointSettings();
        });

        promptContainer.appendChild(textarea);
        field.appendChild(promptContainer);

        if (schema.description) {
            const desc = document.createElement('div');
            desc.className = 'field-description';
            desc.textContent = schema.description;
            field.appendChild(desc);
        }

        // Add generation buttons after prompt
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'prompt-buttons';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.id = 'reset-btn';
        resetBtn.className = 'btn secondary';
        resetBtn.textContent = 'Reset';
        resetBtn.addEventListener('click', () => {
            this.resetFormToDefaults();
        });

        const generateBtn = document.createElement('button');
        generateBtn.type = 'submit';
        generateBtn.className = 'btn primary generate-btn';
        generateBtn.innerHTML = `
            <span class="generate-text">Generate</span>
            <span class="generate-loading hidden">Generating...</span>
        `;

        buttonContainer.appendChild(resetBtn);
        buttonContainer.appendChild(generateBtn);
        field.appendChild(buttonContainer);

        return field;
    }

    getExamplePrompts() {
        const endpoint = this.currentEndpoint;
        if (!endpoint) return [];

        const category = endpoint.metadata.category;
        const endpointId = endpoint.metadata.endpointId;

        if (endpointId.includes('kontext')) {
            return [
                "A serene lake with mountains in the background, replace the mountains with a modern city skyline",
                "Transform this portrait into a renaissance painting style",
                "Change the weather from sunny to snowy while keeping everything else the same"
            ];
        } else if (endpointId.includes('lora')) {
            return [
                "A futuristic robot in a cyberpunk city, neon lights, highly detailed",
                "Portrait of a woman in the style of Van Gogh, swirling brushstrokes",
                "Anime character with blue hair and magical powers, fantasy setting",
                "Minimalist logo design for a tech company, clean geometric shapes"
            ];
        } else {
            return [
                "A majestic dragon soaring through cloudy skies, fantasy art",
                "Cozy coffee shop interior with warm lighting and vintage furniture",
                "Abstract geometric pattern in blue and gold colors",
                "Photorealistic portrait of a wise elderly person"
            ];
        }
    }

    createImageUploadField(name, schema, required, label, field) {
        field.appendChild(label);

        const uploadContainer = document.createElement('div');
        uploadContainer.className = 'image-upload-container';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.id = name;
        urlInput.name = name;
        urlInput.placeholder = 'Enter image URL or upload file';
        if (required) urlInput.required = true;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';

        const uploadArea = document.createElement('div');
        uploadArea.className = 'upload-area';

        // Check if this is a mask field for inpainting
        const isMaskField = name.toLowerCase().includes('mask');

        if (isMaskField) {
            uploadArea.innerHTML = `
                <div class="upload-content">
                    <span>🎨 Create mask or upload image</span>
                    <small>Draw on reference image or upload mask file</small>
                </div>
            `;
        } else {
            uploadArea.innerHTML = `
                <div class="upload-content">
                    <span>📁 Drop image here or click to upload</span>
                    <small>Supports: JPG, PNG, WebP, GIF</small>
                </div>
            `;
        }

        const preview = document.createElement('div');
        preview.className = 'image-preview hidden';
        preview.innerHTML = `
            <img src="" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 4px;">
            <button type="button" class="remove-image btn secondary small">Remove</button>
        `;

        // Add mask editor for mask fields
        if (isMaskField) {
            const maskEditorContainer = document.createElement('div');
            maskEditorContainer.className = 'mask-editor-container hidden';

            const maskEditorButton = document.createElement('button');
            maskEditorButton.type = 'button';
            maskEditorButton.className = 'btn secondary small mask-editor-btn';
            maskEditorButton.textContent = '🎨 Draw Mask';
            maskEditorButton.style.marginTop = '8px';

            maskEditorButton.addEventListener('click', () => {
                this.openMaskEditor(name, urlInput);
            });

            uploadContainer.appendChild(maskEditorButton);
        }

        // Upload area click
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });

        uploadArea.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                await this.handleFileUpload(files[0], urlInput, uploadArea, preview);
            }
        });

        // File input change
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await this.handleFileUpload(e.target.files[0], urlInput, uploadArea, preview);
            }
        });

        // Remove button
        preview.querySelector('.remove-image').addEventListener('click', () => {
            urlInput.value = '';
            uploadArea.classList.remove('hidden');
            preview.classList.add('hidden');
            this.saveEndpointSettings();
        });

        // URL input change
        urlInput.addEventListener('input', () => {
            if (urlInput.value) {
                this.showImagePreview(urlInput.value, uploadArea, preview);

                // Auto-set custom dimensions based on image URL
                this.autoSetImageDimensions(urlInput.value);
            } else {
                uploadArea.classList.remove('hidden');
                preview.classList.add('hidden');
            }
            this.saveEndpointSettings();
        });

        uploadContainer.appendChild(urlInput);
        uploadContainer.appendChild(uploadArea);
        uploadContainer.appendChild(preview);
        uploadContainer.appendChild(fileInput);

        field.appendChild(uploadContainer);

        if (schema.description) {
            const desc = document.createElement('div');
            desc.className = 'field-description';
            desc.textContent = schema.description;
            field.appendChild(desc);
        }

        return field;
    }

    createSliderField(name, schema, required, label, field) {
        field.appendChild(label);

        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-container';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = name;
        slider.name = name;
        slider.min = schema.minimum;
        slider.max = schema.maximum;
        slider.value = schema.default || schema.minimum;
        slider.step = schema.type === 'integer' ? 1 : 0.1;

        const valueInput = document.createElement('input');
        valueInput.type = 'number';
        valueInput.className = 'slider-value-input';
        valueInput.name = name; // Add name attribute for proper syncing
        valueInput.value = slider.value;
        valueInput.min = schema.minimum;
        valueInput.max = schema.maximum;
        valueInput.step = schema.type === 'integer' ? 1 : 0.01; // More precise step for manual input

        const sliderLabels = document.createElement('div');
        sliderLabels.className = 'slider-labels';
        sliderLabels.innerHTML = `
            <span>${schema.minimum}</span>
            <span>${schema.maximum}</span>
        `;

        // Update input when slider changes
        slider.addEventListener('input', () => {
            valueInput.value = slider.value;
            this.saveEndpointSettings();
        });

        // Update slider when input changes
        valueInput.addEventListener('input', () => {
            const value = parseFloat(valueInput.value);
            if (!isNaN(value) && value >= schema.minimum && value <= schema.maximum) {
                slider.value = value;
                this.saveEndpointSettings();
            }
        });

        // Validate input on blur
        valueInput.addEventListener('blur', () => {
            const value = parseFloat(valueInput.value);
            if (isNaN(value) || value < schema.minimum || value > schema.maximum) {
                valueInput.value = slider.value; // Reset to slider value if invalid
            }
        });

        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueInput);
        sliderContainer.appendChild(sliderLabels);

        field.appendChild(sliderContainer);

        if (schema.description) {
            const desc = document.createElement('div');
            desc.className = 'field-description';
            desc.textContent = schema.description;
            field.appendChild(desc);
        }

        return field;
    }

    async handleFileUpload(file, urlInput, uploadArea, preview) {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        try {
            // Convert to base64 data URL for immediate use
            const reader = new FileReader();
            reader.onload = (e) => {
                urlInput.value = e.target.result;
                this.showImagePreview(e.target.result, uploadArea, preview);

                // Auto-set custom dimensions based on image size
                this.autoSetImageDimensions(e.target.result);

                this.saveEndpointSettings();
            };
            reader.readAsDataURL(file);

        } catch (error) {
            console.error('File upload error:', error);
            alert('Failed to process image file');
        }
    }

    showImagePreview(src, uploadArea, preview) {
        const img = preview.querySelector('img');
        img.src = src;
        uploadArea.classList.add('hidden');
        preview.classList.remove('hidden');
    }

    setupEventListeners() {
        // API Key modal
        document.getElementById('api-key-btn').addEventListener('click', () => {
            document.getElementById('api-key-input').value = this.apiKey;
            document.getElementById('api-key-modal').classList.remove('hidden');
        });

        document.getElementById('save-api-key').addEventListener('click', () => {
            const key = document.getElementById('api-key-input').value.trim();
            this.apiKey = key;
            localStorage.setItem('falai_api_key', key);
            document.getElementById('api-key-modal').classList.add('hidden');
        });

        document.getElementById('cancel-api-key').addEventListener('click', () => {
            document.getElementById('api-key-modal').classList.add('hidden');
        });


        // Panel tabs
        document.getElementById('results-panel-tab').addEventListener('click', () => {
            this.switchRightPanelView('results');
        });

        document.getElementById('gallery-panel-tab').addEventListener('click', () => {
            this.switchRightPanelView('gallery');
        });

        // Endpoint dropdown
        document.getElementById('endpoint-dropdown').addEventListener('change', (e) => {
            const endpointId = e.target.value;
            if (endpointId) {
                this.selectEndpoint(endpointId);
                this.updateDeleteButtonVisibility(endpointId);
                // Save last selected endpoint
                localStorage.setItem('falai_last_endpoint', endpointId);
            } else {
                this.clearEndpointSelection();
                this.updateDeleteButtonVisibility(null);
            }
        });

        // Delete endpoint button
        const deleteBtn = document.getElementById('delete-endpoint-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                this.deleteCurrentEndpoint();
            });
        } else {
            console.warn('delete-endpoint-btn element not found');
        }

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

        // Results tab switching
        document.getElementById('images-tab').addEventListener('click', () => {
            this.switchResultsTab('images');
        });

        document.getElementById('json-tab').addEventListener('click', () => {
            this.switchResultsTab('json');
        });

        // Form submission
        document.getElementById('generation-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateImage();
        });

        // Cancel generation
        document.getElementById('cancel-btn').addEventListener('click', () => {
            this.cancelGeneration();
        });

        // Debug mode toggle
        document.getElementById('debug-checkbox').addEventListener('change', (e) => {
            this.debugMode = e.target.checked;
            localStorage.setItem('falai_debug_mode', this.debugMode);

            const debugPanel = document.getElementById('debug-panel');
            if (this.debugMode) {
                debugPanel.classList.remove('hidden');
                this.logDebug('Debug mode enabled', 'system');
            } else {
                debugPanel.classList.add('hidden');
            }
        });

        // Settings import/export
        document.getElementById('export-settings-btn').addEventListener('click', () => {
            this.exportSettings();
        });

        document.getElementById('import-settings-btn').addEventListener('click', () => {
            document.getElementById('import-file-input').click();
        });

        document.getElementById('import-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.importSettings(file);
                e.target.value = ''; // Reset file input
            }
        });

        // Clear debug log
        document.getElementById('clear-debug').addEventListener('click', () => {
            document.getElementById('debug-content').innerHTML = '';
        });

        // Custom endpoint modal
        document.getElementById('add-endpoint-btn').addEventListener('click', () => {
            document.getElementById('custom-endpoint-modal').classList.remove('hidden');
        });

        document.getElementById('cancel-custom-endpoint').addEventListener('click', () => {
            this.closeCustomEndpointModal();
        });

        document.getElementById('add-custom-endpoint').addEventListener('click', () => {
            this.addCustomEndpoint();
        });

        // Schema file upload
        const schemaUploadArea = document.getElementById('schema-upload-area');
        const schemaFileInput = document.getElementById('openapi-file');
        const schemaFileInfo = document.getElementById('schema-file-info');
        const schemaFileName = document.getElementById('schema-file-name');
        const schemaRemoveFile = document.getElementById('schema-remove-file');

        schemaUploadArea.addEventListener('click', () => {
            schemaFileInput.click();
        });

        schemaUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            schemaUploadArea.classList.add('drag-over');
        });

        schemaUploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            schemaUploadArea.classList.remove('drag-over');
        });

        schemaUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            schemaUploadArea.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type === 'application/json') {
                this.handleSchemaFileSelection(files[0]);
            }
        });

        schemaFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleSchemaFileSelection(e.target.files[0]);
            }
        });

        schemaRemoveFile.addEventListener('click', () => {
            this.clearSchemaFileSelection();
        });

        // Close modals on background click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.add('hidden');
            }
            if (e.target.classList.contains('fullscreen-viewer')) {
                this.closeFullscreenViewer();
            }
        });

        // Keyboard navigation for full-screen viewer
        document.addEventListener('keydown', (e) => {
            const viewer = document.getElementById('fullscreen-viewer');
            const mobileMenu = document.getElementById('mobile-menu');

            // Handle Escape key
            if (e.key === 'Escape') {
                // Close mobile menu if it's open
                if (mobileMenu.classList.contains('active')) {
                    this.closeMobileMenu();
                    return;
                }
                // Close fullscreen viewer if it's open
                if (!viewer.classList.contains('hidden')) {
                    this.closeFullscreenViewer();
                    return;
                }
            }

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

        // Mobile hamburger menu
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

        hamburgerMenu.addEventListener('click', () => {
            this.toggleMobileMenu();
        });

        mobileMenuOverlay.addEventListener('click', () => {
            this.closeMobileMenu();
        });

        // Mobile menu close button
        const mobileMenuCloseBtn = document.getElementById('mobile-menu-close');
        mobileMenuCloseBtn.addEventListener('click', () => {
            this.closeMobileMenu();
        });

        // Mobile menu control buttons
        document.getElementById('mobile-api-key-btn').addEventListener('click', () => {
            this.closeMobileMenu();
            document.getElementById('api-key-btn').click();
        });

        document.getElementById('mobile-add-endpoint-btn').addEventListener('click', () => {
            this.closeMobileMenu();
            document.getElementById('add-endpoint-btn').click();
        });

        document.getElementById('mobile-export-settings-btn').addEventListener('click', () => {
            this.closeMobileMenu();
            document.getElementById('export-settings-btn').click();
        });

        document.getElementById('mobile-import-settings-btn').addEventListener('click', () => {
            this.closeMobileMenu();
            document.getElementById('import-settings-btn').click();
        });

    }

    toggleMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

        const isOpen = hamburgerMenu.classList.contains('active');

        if (isOpen) {
            this.closeMobileMenu();
        } else {
            this.openMobileMenu();
        }
    }

    openMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

        hamburgerMenu.classList.add('active');
        mobileMenu.classList.add('active');
        mobileMenuOverlay.classList.add('active');

        // Populate mobile menu with advanced options
        this.populateMobileAdvancedOptions();

        // Prevent body scroll when menu is open
        document.body.style.overflow = 'hidden';
    }

    closeMobileMenu() {
        const hamburgerMenu = document.getElementById('hamburger-menu');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

        hamburgerMenu.classList.remove('active');
        mobileMenu.classList.remove('active');
        mobileMenuOverlay.classList.remove('active');

        // Restore body scroll
        document.body.style.overflow = '';
    }

    populateMobileAdvancedOptions() {
        const mobileContainer = document.getElementById('mobile-advanced-options');
        const advancedContainer = document.querySelector('.advanced-options');

        // Clear existing content
        mobileContainer.innerHTML = '';

        if (!advancedContainer || !this.currentEndpoint) {
            mobileContainer.innerHTML = '<p class="no-options-message">Select an endpoint to see advanced options</p>';
            return;
        }

        // Find the actual content container (the fields inside advanced options)
        const advancedContent = advancedContainer.querySelector('.advanced-options-content');
        if (!advancedContent) {
            mobileContainer.innerHTML = '<p class="no-options-message">No advanced options available</p>';
            return;
        }

        // Clone only the content (form fields), not the wrapper with toggle button
        const clonedContent = advancedContent.cloneNode(true);
        clonedContent.classList.add('mobile-advanced-content');
        clonedContent.classList.remove('hidden');
        clonedContent.style.display = 'block';

        // Keep mask editor elements in mobile version

        // Update any IDs to avoid conflicts
        const elements = clonedContent.querySelectorAll('[id]');
        elements.forEach(el => {
            el.id = 'mobile-' + el.id;
        });

        mobileContainer.appendChild(clonedContent);

        // Re-attach event listeners for mobile advanced options
        this.attachMobileAdvancedOptionEvents(mobileContainer);
    }

    attachMobileAdvancedOptionEvents(container) {
        // Re-attach event listeners for all form elements in mobile menu
        const inputs = container.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            // Sync input events (for typing, slider movement, etc.)
            input.addEventListener('input', (e) => {
                this.syncMobileToDesktop(e.target);
                this.saveEndpointSettings();
            });

            // Sync change events (for dropdowns, checkboxes, etc.)
            input.addEventListener('change', (e) => {
                this.syncMobileToDesktop(e.target);
                this.saveEndpointSettings();
            });
        });

        // Handle array add buttons for mobile (LoRA, etc.)
        const arrayAddButtons = container.querySelectorAll('.btn.secondary.small');
        arrayAddButtons.forEach(button => {
            // Check if this is an "Add LoRA" or similar button
            if (button.textContent.includes('Add')) {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Find the corresponding desktop button and click it
                    const buttonText = button.textContent;
                    const desktopButtons = document.querySelectorAll(`#generation-form .btn.secondary.small`);

                    // Find the matching desktop button by text content
                    for (let dBtn of desktopButtons) {
                        if (dBtn.textContent === buttonText) {
                            dBtn.click();
                            // Re-populate mobile menu to show the new item
                            setTimeout(() => {
                                this.populateMobileAdvancedOptions();
                            }, 100);
                            break;
                        }
                    }
                });
            }
        });

        // Handle array remove buttons for mobile
        const arrayRemoveButtons = container.querySelectorAll('.btn.danger');
        arrayRemoveButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Find the corresponding desktop remove button
                const arrayItem = button.closest('.array-item');
                if (arrayItem) {
                    const itemIndex = Array.from(arrayItem.parentNode.children).indexOf(arrayItem);
                    const desktopArrayItems = document.querySelectorAll('#generation-form .array-item');

                    if (desktopArrayItems[itemIndex]) {
                        const desktopRemoveBtn = desktopArrayItems[itemIndex].querySelector('.btn.danger');
                        if (desktopRemoveBtn) {
                            desktopRemoveBtn.click();
                            // Re-populate mobile menu to show the updated list
                            setTimeout(() => {
                                this.populateMobileAdvancedOptions();
                            }, 100);
                        }
                    }
                }
            });
        });

        // Handle special slider-input pairs for mobile
        const sliderContainers = container.querySelectorAll('.slider-container');
        sliderContainers.forEach(sliderContainer => {
            const slider = sliderContainer.querySelector('input[type="range"]');
            const valueInput = sliderContainer.querySelector('input[type="number"].slider-value-input');

            if (slider && valueInput) {
                // Ensure initial sync
                valueInput.value = slider.value;

                // Add event listeners for slider
                slider.addEventListener('input', (e) => {
                    e.stopPropagation();
                    const newValue = slider.value;
                    valueInput.value = newValue;

                    // Sync to desktop
                    this.syncMobileToDesktop(slider);
                    this.saveEndpointSettings();
                });

                // Add event listeners for value input
                valueInput.addEventListener('input', (e) => {
                    e.stopPropagation();
                    const value = parseFloat(valueInput.value);
                    const min = parseFloat(slider.min);
                    const max = parseFloat(slider.max);

                    if (!isNaN(value) && value >= min && value <= max) {
                        slider.value = value;

                        // Sync both slider and value input to desktop
                        this.syncMobileToDesktop(slider);
                        this.saveEndpointSettings();
                    }
                });
            }
        });
    }

    syncMobileToDesktop(mobileElement) {
        let desktopElement = null;

        // Try to find desktop element by ID first
        const mobileId = mobileElement.id;
        if (mobileId && mobileId.startsWith('mobile-')) {
            const desktopId = mobileId.replace('mobile-', '');
            desktopElement = document.getElementById(desktopId);
        }

        // If not found by ID, try to find by name attribute
        if (!desktopElement && mobileElement.name) {
            desktopElement = document.querySelector(`#generation-form [name="${mobileElement.name}"]`);
        }

        if (desktopElement) {
            if (mobileElement.type === 'checkbox') {
                desktopElement.checked = mobileElement.checked;
            } else {
                desktopElement.value = mobileElement.value;
            }

            // Trigger events on desktop element to maintain consistency
            desktopElement.dispatchEvent(new Event('input', { bubbles: true }));
            desktopElement.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    isMobileDevice() {
        return window.innerWidth <= 768;
    }

    setupMobileTouchFix(fabricCanvas) {
        console.log('📱 Setting up mobile touch coordinate fix');

        // Force proper offset calculation
        fabricCanvas.calcOffset();

        // Override touch event handling
        const canvas = fabricCanvas.upperCanvasEl;
        const originalTouch = canvas.ontouchstart;

        // Add touch coordinate correction
        fabricCanvas.on('path:created', (e) => {
            if (this.isMobileDevice() && e.path) {
                // Get canvas container for correct offset calculation
                const container = canvas.parentElement;
                const containerRect = container.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();

                // Calculate any offset due to container positioning
                const offsetX = canvasRect.left - containerRect.left;
                const offsetY = canvasRect.top - containerRect.top;

                console.log('🖱️ Touch offset compensation:', offsetX, offsetY);
            }
        });

        // Recalculate offset after any resize or change
        const observer = new ResizeObserver(() => {
            fabricCanvas.calcOffset();
        });
        observer.observe(canvas.parentElement);
    }

    fixMobileTouchCoordinates(fabricCanvas) {
        // Override the _getPointer method to fix touch coordinates on mobile
        const originalGetPointer = fabricCanvas._getPointer;

        if (!originalGetPointer || typeof originalGetPointer !== 'function') {
            console.warn('⚠️ Original _getPointer method not found, skipping touch coordinate fix');
            return;
        }

        fabricCanvas._getPointer = function(e, ignoreZoom) {
            // Use the original method as base
            const pointer = originalGetPointer.call(this, e, ignoreZoom);

            // For touch events, we need to recalculate coordinates
            if (e.touches || e.changedTouches) {
                const canvasElement = this.upperCanvasEl;
                const rect = canvasElement.getBoundingClientRect();
                const touch = e.touches?.[0] || e.changedTouches?.[0];

                if (touch) {
                    // Calculate correct touch coordinates relative to canvas
                    const scaleX = canvasElement.width / rect.width;
                    const scaleY = canvasElement.height / rect.height;

                    pointer.x = (touch.clientX - rect.left) * scaleX;
                    pointer.y = (touch.clientY - rect.top) * scaleY;
                }
            }

            return pointer;
        };

        // Also fix the getPointer method for public API
        const originalPublicGetPointer = fabricCanvas.getPointer;
        fabricCanvas.getPointer = function(e, ignoreZoom) {
            if (e.touches || e.changedTouches) {
                return this._getPointer(e, ignoreZoom);
            }
            return originalPublicGetPointer.call(this, e, ignoreZoom);
        };

        // Force canvas to recalculate offset on touch start
        fabricCanvas.on('mouse:down', function() {
            this.calcOffset();
        });

        // Additional fix for retina displays
        if (window.devicePixelRatio > 1) {
            const canvas = fabricCanvas.upperCanvasEl;
            const context = canvas.getContext('2d');

            // Scale the drawing context for retina
            const pixelRatio = window.devicePixelRatio;
            canvas.width = canvas.offsetWidth * pixelRatio;
            canvas.height = canvas.offsetHeight * pixelRatio;
            context.scale(pixelRatio, pixelRatio);
            canvas.style.width = canvas.offsetWidth + 'px';
            canvas.style.height = canvas.offsetHeight + 'px';
        }

        console.log('✅ Mobile touch coordinates fixed for mask editor');
    }

    async generateImage() {
        if (!this.apiKey) {
            alert('Please set your API key first');
            return;
        }

        if (!this.currentEndpoint) {
            alert('Please select an endpoint first');
            return;
        }

        // Collect form data
        const formData = this.collectFormData();

        // Filter out LoRAs with weight 0 before sending request
        this.filterLoRAs(formData);

        try {
            // Update button state
            const generateBtn = document.querySelector('.generate-btn');
            const generateText = generateBtn.querySelector('.generate-text');
            const generateLoading = generateBtn.querySelector('.generate-loading');

            generateBtn.classList.add('loading');
            generateText.classList.add('hidden');
            generateLoading.classList.remove('hidden');

            // Show status
            this.showGenerationStatus('Submitting request...');

            // Submit to queue
            const queueResponse = await this.submitToQueue(formData);

            // Check if response already contains results (synchronous response)
            if (queueResponse.images) {
                // Direct response with results
                this.displayResults(queueResponse);
                this.hideGenerationStatus();
                this.resetGenerateButton();
                return;
            }

            // Asynchronous response - need to poll
            this.currentRequestId = queueResponse.request_id;
            this.statusUrl = queueResponse.status_url;
            this.resultUrl = queueResponse.response_url;

            // Start polling
            this.startStatusPolling();

        } catch (error) {
            console.error('Generation error:', error);
            this.showError('Generation failed: ' + error.message);
            this.resetGenerateButton();
        }
    }

    resetGenerateButton() {
        const generateBtn = document.querySelector('.generate-btn');
        const generateText = generateBtn.querySelector('.generate-text');
        const generateLoading = generateBtn.querySelector('.generate-loading');

        generateBtn.classList.remove('loading');
        generateText.classList.remove('hidden');
        generateLoading.classList.add('hidden');
    }

    collectFormData() {
        const form = document.getElementById('generation-form');
        const data = {};

        // Get all form inputs
        const inputs = form.querySelectorAll('input, select, textarea');

        inputs.forEach(input => {
            const key = input.name;
            if (!key) return;

            // Handle array fields (like loras[0].path)
            if (key.includes('[') && key.includes(']')) {
                this.setNestedProperty(data, key, this.getInputValue(input));
                return;
            }

            // Skip custom size fields - they'll be handled by image_size logic
            if (key.includes('_width') || key.includes('_height')) {
                return;
            }

            if (input.type === 'checkbox') {
                data[key] = input.checked;
            } else if (input.type === 'number' || input.type === 'range') {
                const value = input.value;
                if (value !== '') {
                    data[key] = parseFloat(value);
                }
            } else if (input.value !== '') {
                data[key] = input.value;
            }
        });

        // Special handling for image_size field
        this.handleImageSizeData(data, form);

        return data;
    }

    handleImageSizeData(data, form) {
        const imageSizeSelect = form.querySelector('select[name="image_size"]');
        if (!imageSizeSelect || !imageSizeSelect.value) return;

        if (imageSizeSelect.value === 'custom') {
            // Use custom width/height values
            const widthInput = form.querySelector('input[name="image_size_width"]');
            const heightInput = form.querySelector('input[name="image_size_height"]');

            if (widthInput && heightInput && widthInput.value && heightInput.value) {
                data.image_size = {
                    width: parseInt(widthInput.value),
                    height: parseInt(heightInput.value)
                };
            }
        } else {
            // Use preset size
            data.image_size = imageSizeSelect.value;
        }
    }

    autoSetImageDimensions(imageUrl) {
        // Create an image element to get dimensions
        const img = new Image();

        img.onload = () => {
            const width = img.naturalWidth;
            const height = img.naturalHeight;

            // Only set dimensions if we got valid values
            if (width > 0 && height > 0) {
                // Find image_size select and custom dimension inputs
                const imageSizeSelect = document.querySelector('select[name="image_size"]');
                const widthInput = document.querySelector('input[name="image_size_width"]');
                const heightInput = document.querySelector('input[name="image_size_height"]');

                if (imageSizeSelect && widthInput && heightInput) {
                    // Set to custom mode
                    imageSizeSelect.value = 'custom';
                    // Show custom fields first
                    imageSizeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Set original dimensions in the scale control
                    const container = imageSizeSelect.closest('.image-size-container');
                    if (container && container.setOriginalDimensions) {
                        container.setOriginalDimensions(width, height);
                    }

                    // Set width and height to match the uploaded image (scale 1:1 initially)
                    widthInput.value = width;
                    heightInput.value = height;
                    
                    // Reset scale to 100%
                    const scaleInput = document.querySelector('input[name="image_size_scale"]');
                    const scaleValue = document.querySelector('.scale-value');
                    if (scaleInput && scaleValue) {
                        scaleInput.value = '1';
                        scaleValue.textContent = '100%';
                    }

                    // Trigger input events to save settings
                    widthInput.dispatchEvent(new Event('input', { bubbles: true }));
                    heightInput.dispatchEvent(new Event('input', { bubbles: true }));

                    if (this.debugMode) {
                        console.log(`✅ Auto-set image dimensions: ${width}x${height} (with scale controls)`);
                    }
                }
            }
        };

        img.onerror = () => {
            if (this.debugMode) {
                console.warn('⚠️ Could not determine image dimensions - image failed to load');
            }
        };

        // Set crossOrigin for external URLs (may help with CORS)
        if (!imageUrl.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
        }

        img.src = imageUrl;
    }

    getInputValue(input) {
        if (input.type === 'checkbox') {
            return input.checked;
        } else if (input.type === 'number' || input.type === 'range') {
            const value = input.value;
            return value !== '' ? parseFloat(value) : undefined;
        } else {
            return input.value !== '' ? input.value : undefined;
        }
    }

    setNestedProperty(obj, path, value) {
        if (value === undefined) return;

        // Parse path like "loras[0].path" into ["loras", 0, "path"]
        const parts = path.split(/[\[\].]/).filter(part => part !== '');
        let current = obj;

        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            const nextPart = parts[i + 1];

            if (!current[part]) {
                // Create array if next part is a number, otherwise create object
                current[part] = !isNaN(parseInt(nextPart)) ? [] : {};
            }

            current = current[part];
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
    }

    filterLoRAs(data) {
        // Filter out LoRAs with weight 0 from the request
        if (data.loras && Array.isArray(data.loras)) {
            data.loras = data.loras.filter(lora => {
                // Keep LoRA if it has a valid path and weight > 0
                const hasPath = lora && lora.path && lora.path.trim() !== '';
                const hasValidWeight = lora && lora.weight !== undefined && lora.weight !== null && lora.weight > 0;

                if (this.debugMode && lora && hasPath && !hasValidWeight) {
                    console.log(`🚫 Filtering out LoRA "${lora.path}" with weight ${lora.weight}`);
                }

                return hasPath && hasValidWeight;
            });

            // Remove loras field completely if empty
            if (data.loras.length === 0) {
                delete data.loras;
            }
        }
    }

    async submitToQueue(data) {
        const endpoint = this.currentEndpoint;
        const baseUrl = endpoint.schema.servers[0].url;
        const endpointPath = this.getSubmissionPath(endpoint.schema);
        const fullUrl = baseUrl + endpointPath;

        this.logDebug('Submitting request to queue', 'request', {
            url: fullUrl,
            endpoint: endpoint.metadata.endpointId,
            method: 'POST',
            headers: {
                'Authorization': 'Key [HIDDEN]',
                'Content-Type': 'application/json'
            },
            body: data
        });

        const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Key ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.text();
            this.logDebug('Request failed', 'error', {
                status: response.status,
                statusText: response.statusText,
                error: error
            });
            throw new Error(`HTTP ${response.status}: ${error}`);
        }

        const result = await response.json();
        this.logDebug('Request submitted successfully', 'response', result);

        return result;
    }

    getSubmissionPath(schema) {
        for (const [path, methods] of Object.entries(schema.paths)) {
            if (methods.post && methods.post.requestBody) {
                return path;
            }
        }
        throw new Error('No submission endpoint found');
    }

    startStatusPolling() {
        if (this.statusPolling) {
            clearInterval(this.statusPolling);
        }

        this.statusPolling = setInterval(async () => {
            try {
                await this.checkStatus();
            } catch (error) {
                console.error('Status check failed:', error);
                clearInterval(this.statusPolling);
                this.showError('Status check failed: ' + error.message);
            }
        }, 2000);
    }

    async checkStatus() {
        if (!this.statusUrl) return;

        const response = await fetch(this.statusUrl, {
            headers: {
                'Authorization': `Key ${this.apiKey}`
            }
        });

        if (!response.ok) {
            // If status endpoint returns 404 or 405, the job might be completed
            // Try to fetch results directly
            if (response.status === 404 || response.status === 405) {
                this.logDebug('Status endpoint not available, trying to fetch results directly', 'info', {
                    status: response.status,
                    statusText: response.statusText
                });
                clearInterval(this.statusPolling);
                await this.fetchResults();
                this.resetGenerateButton();
                return;
            }

            this.logDebug('Status check failed', 'error', {
                status: response.status,
                statusText: response.statusText
            });
            throw new Error(`Status check failed: ${response.status}`);
        }

        const status = await response.json();
        this.logDebug('Status response', 'response', status);
        this.updateStatusDisplay(status);

        if (status.status === 'COMPLETED') {
            clearInterval(this.statusPolling);
            await this.fetchResults();
            this.resetGenerateButton();
        } else if (status.status === 'FAILED') {
            clearInterval(this.statusPolling);
            this.showError('Generation failed');
            this.resetGenerateButton();
        }
    }

    getStatusPath(schema, requestId) {
        for (const [path, methods] of Object.entries(schema.paths)) {
            if (path.includes('/status') && methods.get) {
                return path.replace('{request_id}', requestId);
            }
        }
        throw new Error('No status endpoint found');
    }

    updateStatusDisplay(status) {
        const statusMessage = document.getElementById('status-message');
        const progressFill = document.getElementById('progress-fill');

        // Update message based on status
        let message = '';
        let progress = 0;

        if (status.status === 'IN_PROGRESS') {
            if (status.percentage !== undefined) {
                message = `Processing... ${Math.round(status.percentage)}%`;
                progress = status.percentage;
            } else {
                message = 'Processing your request...';
                progress = 25; // Default progress for processing
            }
        } else if (status.status === 'IN_QUEUE') {
            if (status.queue_position !== undefined) {
                message = `In queue (position ${status.queue_position})`;
                progress = 10;
            } else {
                message = 'Waiting in queue...';
                progress = 5;
            }
        } else if (status.status === 'COMPLETED') {
            message = 'Generation completed successfully!';
            progress = 100;
        } else {
            message = status.status.toLowerCase().replace('_', ' ');
            progress = 15;
        }

        statusMessage.textContent = message;
        progressFill.style.width = `${progress}%`;

        this.logDebug('Status updated', 'status', { status: status.status, progress, message });
    }

    async fetchResults() {
        if (!this.resultUrl) return;

        const response = await fetch(this.resultUrl, {
            headers: {
                'Authorization': `Key ${this.apiKey}`
            }
        });

        if (!response.ok) {
            this.logDebug('Result fetch failed', 'error', {
                status: response.status,
                statusText: response.statusText
            });
            throw new Error(`Result fetch failed: ${response.status}`);
        }

        const result = await response.json();
        this.logDebug('Results fetched successfully', 'response', result);

        this.displayResults(result);
        this.hideGenerationStatus();
    }

    getResultPath(schema, requestId) {
        for (const [path, methods] of Object.entries(schema.paths)) {
            if (path.includes('/{request_id}') && !path.includes('/status') && !path.includes('/cancel') && methods.get) {
                return path.replace('{request_id}', requestId);
            }
        }
        throw new Error('No result endpoint found');
    }

    displayResults(result) {
        const container = document.getElementById('result-images');
        container.innerHTML = '';

        // Store result for JSON display
        this.lastResult = result;

        if (result.images && result.images.length > 0) {
            for (const image of result.images) {
                const imageElement = this.createImageElement(image, result);
                container.appendChild(imageElement);
            }

            // Update JSON display
            this.updateJsonDisplay(result);

            // Switch to results view and show results
            this.switchRightPanelView('results');
            document.getElementById('no-images-placeholder').classList.add('hidden');
            document.getElementById('results').classList.remove('hidden');
            this.switchResultsTab('images');
        }
    }

    switchResultsTab(tab) {
        const imagesTab = document.getElementById('images-tab');
        const jsonTab = document.getElementById('json-tab');
        const imagesContent = document.getElementById('result-images');
        const jsonContent = document.getElementById('result-json');

        if (tab === 'images') {
            imagesTab.classList.add('active');
            jsonTab.classList.remove('active');
            imagesContent.classList.remove('hidden');
            jsonContent.classList.add('hidden');
        } else {
            jsonTab.classList.add('active');
            imagesTab.classList.remove('active');
            jsonContent.classList.remove('hidden');
            imagesContent.classList.add('hidden');
        }
    }

    updateJsonDisplay(result) {
        const jsonOutput = document.getElementById('json-output');
        jsonOutput.textContent = JSON.stringify(result, null, 2);
    }

    createImageElement(image, metadata) {
        const div = document.createElement('div');
        div.className = 'result-image';

        const img = document.createElement('img');
        img.src = image.url;
        img.alt = 'Generated image';
        img.loading = 'lazy';

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'result-image-actions';

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn secondary';
        downloadBtn.innerHTML = '💾';
        downloadBtn.title = 'Download';
        downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.downloadImage(image.url, image.file_name || 'image.jpg');
        });

        actionsDiv.appendChild(downloadBtn);

        div.appendChild(img);
        div.appendChild(actionsDiv);

        // Add click handler for image zoom with results context
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            // Create images array from current results
            const resultImages = this.lastResult ? this.lastResult.images || [] : [];
            const currentIndex = resultImages.findIndex(img => img.url === image.url);
            this.openImageModalWithNavigation(image.url, resultImages, currentIndex, 'results');
        });

        // Try to save to gallery when image is generated (non-blocking)
        this.saveToGallery(image.url, metadata, false); // false = no visual feedback

        return div;
    }

    switchToGalleryView() {
        this.switchRightPanelView('gallery');
    }

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
            } else if (!results.classList.contains('hidden')) {
                results.classList.remove('hidden');
            } else {
                placeholder.classList.remove('hidden');
            }
        }
    }

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

    openImageModal(imageUrl) {
        // Fallback for simple image viewing
        this.openImageModalWithNavigation(imageUrl, [{ url: imageUrl }], 0, 'single');
    }

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

            // Close on ESC key and navigation keys
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
        modal._navigationData = {
            images,
            currentIndex,
            context
        };

        // Set image and show modal
        this.updateZoomModal(imageUrl, currentIndex, images.length);
        modal.classList.remove('hidden');

        document.body.style.overflow = 'hidden';
    }

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

        // Hide navigation entirely if only one image
        const showNav = totalImages > 1;
        prevBtn.style.display = showNav ? 'block' : 'none';
        nextBtn.style.display = showNav ? 'block' : 'none';
        counter.style.display = showNav ? 'block' : 'none';

        // Show/hide delete button based on context
        const deleteBtn = modal.querySelector('#zoom-delete');
        if (deleteBtn && modal._navigationData) {
            deleteBtn.style.display = modal._navigationData.context === 'gallery' ? 'block' : 'none';
        }
    }

    closeImageModal() {
        const modal = document.getElementById('image-zoom-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            modal._navigationData = null;
        }
    }

    downloadCurrentZoomImage() {
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
            this.downloadImage(imageUrl, filename);
        }
    }

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
                    // No images left, close modal
                    this.closeImageModal();
                } else {
                    // Update navigation data and current index
                    const newIndex = Math.min(currentIndex, this.savedImages.length - 1);
                    modal._navigationData.images = this.savedImages;
                    modal._navigationData.currentIndex = newIndex;

                    // Update display
                    this.updateZoomModal(this.savedImages[newIndex].url, newIndex, this.savedImages.length);
                }
            }
        }
    }


    resetFormToDefaults() {
        if (!this.currentEndpoint) return;

        const form = document.getElementById('generation-form');
        const inputs = form.querySelectorAll('input, select, textarea');

        // Get the input schema for this endpoint
        const inputSchema = this.getInputSchema(this.currentEndpoint.schema);
        if (!inputSchema || !inputSchema.properties) return;

        // Clear all array containers first
        const arrayContainers = form.querySelectorAll('.array-items');
        arrayContainers.forEach(container => {
            container.innerHTML = '';
        });

        // Reset each field to its default value
        inputs.forEach(input => {
            const fieldName = input.name;
            if (!fieldName) return;

            // Skip array fields, they'll be handled separately
            if (fieldName.includes('[') && fieldName.includes(']')) return;

            let fieldSchema = inputSchema.properties[fieldName];
            if (!fieldSchema) return;

            // Handle anyOf schemas (like image_size)
            if (fieldSchema.anyOf && fieldSchema.anyOf.length > 0) {
                const enumSchema = fieldSchema.anyOf.find(option => option.enum);
                if (enumSchema) {
                    fieldSchema = { ...fieldSchema, enum: enumSchema.enum, default: fieldSchema.default };
                } else {
                    fieldSchema = { ...fieldSchema, ...fieldSchema.anyOf[0] };
                }
            }

            this.setFieldToDefault(input, fieldSchema);
        });

        // Handle array fields - reset to default arrays
        Object.entries(inputSchema.properties).forEach(([fieldName, fieldSchema]) => {
            if (fieldSchema.type === 'array') {
                const container = document.getElementById(`${fieldName}-items`);
                if (container && fieldSchema.default) {
                    // Add default array items
                    fieldSchema.default.forEach(() => {
                        this.addArrayItem(fieldName, fieldSchema, container);
                    });
                }
            }
        });
    }

    setFieldToDefault(input, schema) {
        if (schema.default === undefined) {
            // Clear the field if no default
            if (input.type === 'checkbox') {
                input.checked = false;
            } else {
                input.value = '';
            }
            return;
        }

        if (input.type === 'checkbox') {
            input.checked = Boolean(schema.default);
        } else if (input.type === 'range' || input.type === 'number') {
            input.value = schema.default;
            // Update slider display if it exists
            const valueDisplay = input.parentElement.querySelector('.slider-value');
            if (valueDisplay) {
                valueDisplay.textContent = schema.default;
            }
        } else {
            input.value = schema.default;
        }
    }

    createImageSizeField(name, schema, required, label, field) {
        const container = document.createElement('div');
        container.className = 'image-size-container';

        // Get the ImageSize schema from anyOf to check if custom sizes are supported
        const imageSizeSchema = this.getImageSizeSchemaFromAnyOf(schema);
        const supportsCustomSize = imageSizeSchema !== null;

        // Create select dropdown with preset options
        const select = document.createElement('select');
        select.name = name;
        select.id = name;
        select.className = 'image-size-select';
        select.innerHTML = '<option value="">Select size...</option>';

        // Add preset size options from enum
        for (const option of schema.enum) {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            select.appendChild(opt);
        }

        // Add Custom option only if ImageSize schema is available
        if (supportsCustomSize) {
            const customOpt = document.createElement('option');
            customOpt.value = 'custom';
            customOpt.textContent = 'Custom';
            select.appendChild(customOpt);
        }

        container.appendChild(select);

        // Create custom size fields from ImageSize schema (initially hidden) only if supported
        if (supportsCustomSize && imageSizeSchema) {
            const customFields = document.createElement('div');
            customFields.className = 'custom-size-fields hidden';

            // Create fields based on ImageSize schema properties
            const widthProperty = imageSizeSchema.properties.width;
            const heightProperty = imageSizeSchema.properties.height;

            const widthField = document.createElement('div');
            widthField.className = 'custom-size-field';
            widthField.innerHTML = `
                <label for="${name}_width">${widthProperty.title || 'Width'}</label>
                <input type="number"
                       id="${name}_width"
                       name="${name}_width"
                       min="${widthProperty.exclusiveMinimum ? widthProperty.exclusiveMinimum + 1 : (widthProperty.minimum || 1)}"
                       max="${widthProperty.maximum || 14142}"
                       value="${widthProperty.default || 512}"
                       title="${widthProperty.description || ''}">
            `;

            const heightField = document.createElement('div');
            heightField.className = 'custom-size-field';
            heightField.innerHTML = `
                <label for="${name}_height">${heightProperty.title || 'Height'}</label>
                <input type="number"
                       id="${name}_height"
                       name="${name}_height"
                       min="${heightProperty.exclusiveMinimum ? heightProperty.exclusiveMinimum + 1 : (heightProperty.minimum || 1)}"
                       max="${heightProperty.maximum || 14142}"
                       value="${heightProperty.default || 512}"
                       title="${heightProperty.description || ''}">
            `;

            // Add scale field for proportional resizing
            const scaleField = document.createElement('div');
            scaleField.className = 'custom-size-field scale-field';
            scaleField.innerHTML = `
                <label for="${name}_scale">Scale</label>
                <div class="scale-controls">
                    <input type="range" 
                           id="${name}_scale" 
                           name="${name}_scale" 
                           min="0.1" 
                           max="2" 
                           step="0.1" 
                           value="1"
                           title="Scale factor for original image dimensions">
                    <span class="scale-value">100%</span>
                    <button type="button" class="btn secondary small reset-scale" title="Reset to original size">1:1</button>
                </div>
                <div class="original-size-info hidden">
                    <small>Original: <span class="original-dimensions">-</span> → Scaled: <span class="scaled-dimensions">-</span></small>
                </div>
            `;

            customFields.appendChild(widthField);
            customFields.appendChild(heightField);
            customFields.appendChild(scaleField);
            container.appendChild(customFields);

            // Add event listener to show/hide custom fields
            select.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    customFields.classList.remove('hidden');
                } else {
                    customFields.classList.add('hidden');
                }
            });

            // Add scale control functionality
            const scaleInput = scaleField.querySelector('input[type="range"]');
            const scaleValue = scaleField.querySelector('.scale-value');
            const resetButton = scaleField.querySelector('.reset-scale');
            const widthInput = widthField.querySelector('input');
            const heightInput = heightField.querySelector('input');
            const originalInfo = scaleField.querySelector('.original-size-info');
            const originalDimensions = scaleField.querySelector('.original-dimensions');
            const scaledDimensions = scaleField.querySelector('.scaled-dimensions');

            // Store original dimensions
            let originalWidth = 0, originalHeight = 0;

            // Scale slider change handler
            scaleInput.addEventListener('input', (e) => {
                const scale = parseFloat(e.target.value);
                scaleValue.textContent = Math.round(scale * 100) + '%';
                
                if (originalWidth > 0 && originalHeight > 0) {
                    const newWidth = Math.round(originalWidth * scale);
                    const newHeight = Math.round(originalHeight * scale);
                    
                    widthInput.value = newWidth;
                    heightInput.value = newHeight;
                    scaledDimensions.textContent = `${newWidth}×${newHeight}`;
                    
                    // Trigger input events to save settings
                    widthInput.dispatchEvent(new Event('input', { bubbles: true }));
                    heightInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            });

            // Reset scale button
            resetButton.addEventListener('click', () => {
                scaleInput.value = '1';
                scaleInput.dispatchEvent(new Event('input'));
            });

            // Function to set original dimensions and show scale controls
            container.setOriginalDimensions = (width, height) => {
                originalWidth = width;
                originalHeight = height;
                originalDimensions.textContent = `${width}×${height}`;
                scaledDimensions.textContent = `${width}×${height}`;
                originalInfo.classList.remove('hidden');
            };
        }

        field.appendChild(label);
        field.appendChild(container);

        return field;
    }

    getImageSizeSchemaFromAnyOf(schema) {
        // Find ImageSize schema reference from anyOf
        if (schema.anyOf) {
            for (const option of schema.anyOf) {
                if (option.$ref && option.$ref.includes('ImageSize')) {
                    // Resolve the ImageSize schema
                    return this.resolveSchema(option, this.currentEndpoint.schema);
                }
            }
        }
        return null;
    }

    exportSettings() {
        try {
            // Collect all settings including custom endpoints
            const customEndpoints = JSON.parse(localStorage.getItem('falai_custom_endpoints') || '{}');
            const settings = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                apiKey: this.apiKey,
                endpointSettings: this.endpointSettings,
                savedImages: this.savedImages,
                debugMode: this.debugMode,
                advancedVisible: localStorage.getItem('falai_advanced_visible') === 'true',
                customEndpoints: customEndpoints
            };

            // Create and download file
            const blob = new Blob([JSON.stringify(settings, null, 2)], {
                type: 'application/json'
            });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
            a.href = url;
            a.download = `falai-settings-${timestamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.logDebug('Settings exported successfully', 'success');

        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export settings: ' + error.message);
            this.logDebug('Settings export failed: ' + error.message, 'error');
        }
    }

    async importSettings(file) {
        try {
            const text = await file.text();
            const settings = JSON.parse(text);

            // Validate settings structure
            if (!settings.version || !settings.endpointSettings) {
                throw new Error('Invalid settings file format');
            }

            // Show confirmation dialog
            const customEndpointsCount = settings.customEndpoints ? Object.keys(settings.customEndpoints).length : 0;
            const message = `Import settings from ${settings.timestamp || 'unknown date'}?\n\nThis will replace:\n- All endpoint settings\n- API key\n- Saved images (${settings.savedImages?.length || 0} images)\n- Custom endpoints (${customEndpointsCount} endpoints)\n- Other preferences`;

            if (!confirm(message)) {
                return;
            }

            // Import settings
            if (settings.apiKey) {
                this.apiKey = settings.apiKey;
                localStorage.setItem('falai_api_key', this.apiKey);
            }

            if (settings.endpointSettings) {
                // Filter out base64 data from imported settings
                const filteredSettings = {};
                for (const [endpointId, endpointData] of Object.entries(settings.endpointSettings)) {
                    filteredSettings[endpointId] = this.filterBase64Data(endpointData);
                }

                this.endpointSettings = filteredSettings;
                localStorage.setItem('falai_endpoint_settings', JSON.stringify(this.endpointSettings));
            }

            if (settings.savedImages) {
                this.savedImages = settings.savedImages;
                localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));
            }
            if (settings.customEndpoints) {
                // Import custom endpoints
                localStorage.setItem('falai_custom_endpoints', JSON.stringify(settings.customEndpoints));
                // Reload custom endpoints into the current session
                for (const [id, endpoint] of Object.entries(settings.customEndpoints)) {
                    this.endpoints.set(id, endpoint);
                }
                // Re-render dropdown to show imported custom endpoints
                this.renderEndpointDropdown();
                this.logDebug(`Imported ${Object.keys(settings.customEndpoints).length} custom endpoints`, 'info');
            }

            if (settings.debugMode !== undefined) {
                this.debugMode = settings.debugMode;
                localStorage.setItem('falai_debug_mode', this.debugMode);
                document.getElementById('debug-checkbox').checked = this.debugMode;

                const debugPanel = document.getElementById('debug-panel');
                if (this.debugMode) {
                    debugPanel.classList.remove('hidden');
                } else {
                    debugPanel.classList.add('hidden');
                }
            }

            if (settings.advancedVisible !== undefined) {
                localStorage.setItem('falai_advanced_visible', settings.advancedVisible);
            }

            // Refresh UI
            if (this.currentEndpoint) {
                this.restoreEndpointSettings(this.currentEndpoint.metadata.endpointId);
            }

            // Refresh gallery if open
            const galleryTab = document.getElementById('gallery-panel-tab');
            if (galleryTab && galleryTab.classList.contains('active')) {
                this.showInlineGallery();
            }

            alert('Settings imported successfully!');
            this.logDebug('Settings imported successfully', 'success', {
                endpointSettings: Object.keys(settings.endpointSettings || {}).length,
                savedImages: settings.savedImages?.length || 0
            });

        } catch (error) {
            console.error('Import failed:', error);
            alert('Failed to import settings: ' + error.message);
            this.logDebug('Settings import failed: ' + error.message, 'error');
        }
    }

    createArrayField(name, schema, required, label, field) {
        const arrayContainer = document.createElement('div');
        arrayContainer.className = 'array-field-container';

        const description = document.createElement('div');
        description.className = 'field-description';
        description.textContent = schema.description || '';

        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'array-items';
        itemsContainer.id = `${name}-items`;

        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'btn secondary small';
        addButton.textContent = '+ Add ' + (name === 'loras' ? 'LoRA' : 'Item');
        addButton.addEventListener('click', () => {
            this.addArrayItem(name, schema, itemsContainer);
        });

        field.appendChild(label);
        field.appendChild(description);
        field.appendChild(itemsContainer);
        field.appendChild(addButton);

        // Add initial empty item if default is not empty array
        if (schema.default && schema.default.length > 0) {
            schema.default.forEach(() => {
                this.addArrayItem(name, schema, itemsContainer);
            });
        }

        return field;
    }

    addArrayItem(arrayName, arraySchema, container) {
        const itemIndex = container.children.length;
        const itemContainer = document.createElement('div');
        itemContainer.className = 'array-item';

        // Resolve $ref if present
        let itemSchema = arraySchema.items;
        if (itemSchema.$ref) {
            const refPath = itemSchema.$ref.replace('#/components/schemas/', '');
            itemSchema = this.currentEndpoint.schema.components.schemas[refPath];
        }

        if (itemSchema.type === 'object' && itemSchema.properties) {
            // Handle object items (like LoraWeight)
            Object.entries(itemSchema.properties).forEach(([propName, propSchema]) => {
                const fieldName = `${arrayName}[${itemIndex}].${propName}`;
                const propField = this.createFormField(fieldName, propSchema,
                    itemSchema.required && itemSchema.required.includes(propName));
                propField.classList.add('array-item-field');
                itemContainer.appendChild(propField);

                // Add change listener to save settings
                const input = propField.querySelector('input, select, textarea');
                if (input) {
                    input.addEventListener('change', () => {
                        this.saveEndpointSettings();
                    });
                    input.addEventListener('input', () => {
                        this.saveEndpointSettings();
                    });
                }
            });
        } else {
            // Handle simple items
            const fieldName = `${arrayName}[${itemIndex}]`;
            const itemField = this.createFormField(fieldName, itemSchema, false);
            itemField.classList.add('array-item-field');
            itemContainer.appendChild(itemField);

            // Add change listener to save settings
            const input = itemField.querySelector('input, select, textarea');
            if (input) {
                input.addEventListener('change', () => {
                    this.saveEndpointSettings();
                });
                input.addEventListener('input', () => {
                    this.saveEndpointSettings();
                });
            }
        }

        // Add remove button
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn danger small';
        removeButton.textContent = '×';
        removeButton.title = 'Remove';
        removeButton.addEventListener('click', () => {
            container.removeChild(itemContainer);
            this.updateArrayIndices(arrayName, container);
            this.saveEndpointSettings();
        });

        itemContainer.appendChild(removeButton);
        container.appendChild(itemContainer);
    }

    updateArrayIndices(arrayName, container) {
        Array.from(container.children).forEach((item, index) => {
            const fields = item.querySelectorAll('input, select, textarea');
            fields.forEach(field => {
                if (field.name.startsWith(arrayName)) {
                    const baseName = field.name.replace(/\[\d+\]/, `[${index}]`);
                    field.name = baseName;
                    field.id = baseName;
                }
            });
        });
    }

    async downloadImage(url, filename) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename || 'image.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Download failed');
        }
    }

    saveToGallery(url, metadata, showFeedback = false) {
        try {
            // Don't save base64 images to gallery - they're too large and temporary
            if (url && url.startsWith('data:image/')) {
                this.logDebug('Skipped saving base64 image to gallery - use download button to save', 'warning');

                // Show warning to user about base64 result
                if (!showFeedback) { // Only show automatic warning, not for manual saves
                    this.showBase64Warning();
                }
                return;
            }

            // Check if image already exists to avoid duplicates
            const exists = this.savedImages.some(img => img.url === url);
            if (exists && !showFeedback) {
                return; // Don't save duplicate unless explicitly requested
            }

            if (!exists) {
                const imageData = {
                    url,
                    metadata,
                    timestamp: Date.now(),
                    endpoint: this.currentEndpoint ? this.currentEndpoint.metadata.endpointId : 'unknown'
                };

                this.savedImages.unshift(imageData);

                // Try to save with storage management
                this.saveWithStorageCheck('falai_saved_images', this.savedImages);

                // Update inline gallery if currently visible
                const inlineGallery = document.getElementById('inline-gallery');
                if (inlineGallery && !inlineGallery.classList.contains('hidden')) {
                    this.showInlineGallery();
                }

                this.logDebug(`Image saved to gallery: ${url.substring(0, 50)}... (${url.length} chars)`, 'success');

                if (showFeedback) {
                    this.logDebug(`Image saved to gallery with user feedback`, 'success');
                }
            }
        } catch (error) {
            // Don't crash the app if gallery save fails - just log it
            console.warn('Failed to save to gallery (storage full):', error.message);
            this.logDebug(`Gallery save failed: ${error.message}`, 'warning');

            if (showFeedback) {
                // Only show user feedback if they explicitly tried to save
                alert(`Could not save to gallery: ${error.message}`);
            }
        }
    }

    saveWithStorageCheck(key, data) {
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                localStorage.setItem(key, JSON.stringify(data));
                return; // Success
            } catch (error) {
                if (error.name === 'QuotaExceededError') {
                    this.logDebug(`Storage quota exceeded (attempt ${attempt + 1}/${maxRetries}), cleaning up...`, 'warning');

                    if (attempt < maxRetries - 1) {
                        // Try to free up space - prioritize base64 images first
                        const base64Cleanup = this.cleanupBase64Images();

                        if (base64Cleanup.count === 0) {
                            // No base64 images to clean, try other cleanup methods
                            const settingsCleanup = this.cleanupOldSettings();

                            if (settingsCleanup === 0) {
                                // Only clean gallery as last resort and only if very large
                                this.cleanupOldGalleryImages();
                            }
                        }
                    } else {
                        // Last attempt failed, throw error
                        throw new Error('Storage quota exceeded even after cleanup. Consider clearing gallery or browser data.');
                    }
                } else {
                    throw error; // Different error, don't retry
                }
            }
        }
    }

    cleanupBase64Images() {
        let totalCleaned = 0;
        let sizeFreed = 0;

        // Clean base64 images from endpoint settings
        for (const [endpointId, settings] of Object.entries(this.endpointSettings)) {
            for (const [key, value] of Object.entries(settings)) {
                if (typeof value === 'string' && this.isBase64DataURL(value)) {
                    const sizeBefore = new Blob([value]).size;
                    delete settings[key];
                    totalCleaned++;
                    sizeFreed += sizeBefore;
                    this.logDebug(`Removed base64 image from ${endpointId}.${key} (${this.formatBytes(sizeBefore)})`, 'info');
                }
            }
        }

        if (totalCleaned > 0) {
            localStorage.setItem('falai_endpoint_settings', JSON.stringify(this.endpointSettings));
            this.logDebug(`Cleaned up ${totalCleaned} base64 images, freed ${this.formatBytes(sizeFreed)}`, 'success');
        }

        return { count: totalCleaned, sizeFreed };
    }

    isBase64DataURL(str) {
        // Check if string is a data URL with base64 image
        return typeof str === 'string' &&
            str.startsWith('data:image/') &&
            str.includes('base64,') &&
            str.length > 1000; // Only consider large data URLs (small ones might be icons)
    }

    cleanupOldGalleryImages(maxImages = 500) {
        // Only clean gallery if it's extremely large (500+ images)
        // Gallery URLs are small, so we keep more
        if (!this.savedImages || this.savedImages.length <= maxImages) {
            return 0; // Nothing to clean
        }

        const originalCount = this.savedImages.length;

        // Sort by timestamp (newest first) and keep only the most recent images
        this.savedImages.sort((a, b) => b.timestamp - a.timestamp);
        this.savedImages = this.savedImages.slice(0, maxImages);

        const removedCount = originalCount - this.savedImages.length;

        this.logDebug(`Cleaned up ${removedCount} old gallery entries, kept ${this.savedImages.length} most recent`, 'info');

        return removedCount;
    }

    cleanupOldSettings() {
        // Clean up old endpoint settings for endpoints that no longer exist
        const currentEndpoints = new Set(Array.from(this.endpoints.keys()));
        const settingsKeys = Object.keys(this.endpointSettings);
        let cleaned = 0;

        for (const endpointId of settingsKeys) {
            if (!currentEndpoints.has(endpointId)) {
                delete this.endpointSettings[endpointId];
                cleaned++;
            }
        }

        if (cleaned > 0) {
            localStorage.setItem('falai_endpoint_settings', JSON.stringify(this.endpointSettings));
            this.logDebug(`Cleaned up settings for ${cleaned} removed endpoints`, 'info');
        }

        return cleaned;
    }

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
                <button class="btn secondary" onclick="falai.downloadImageFromGallery(${index})" title="Download">💾</button>
                <button class="btn secondary" onclick="falai.deleteImageFromGallery(${index})" title="Delete">🗑️</button>
            </div>
            <div class="gallery-item-info">
                <div>${imageData.endpoint}</div>
                <div>${date}</div>
            </div>
        `;

        // Click on image (not buttons) opens full-screen viewer
        const img = div.querySelector('img');
        img.addEventListener('click', (e) => {
            e.stopPropagation();
            // Open image zoom modal for quick preview
            this.openImageModal(imageData.url);
        });

        return div;
    }

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
        metadata.textContent = `${currentImage.endpoint} • ${date}`;

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
        await this.downloadImage(currentImage.url, filename);
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
            // Remove from saved images
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

    async downloadImageFromGallery(index) {
        const imageData = this.savedImages[index];
        const filename = `falai-image-${index + 1}.jpg`;
        await this.downloadImage(imageData.url, filename);
    }

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

    async cancelGeneration() {
        if (!this.currentRequestId) return;

        try {
            const endpoint = this.currentEndpoint;
            const baseUrl = endpoint.schema.servers[0].url;
            const cancelPath = this.getCancelPath(endpoint.schema, this.currentRequestId);

            await fetch(baseUrl + cancelPath, {
                method: 'PUT',
                headers: {
                    'Authorization': `Key ${this.apiKey}`
                }
            });

            clearInterval(this.statusPolling);
            this.hideGenerationStatus();
        } catch (error) {
            console.error('Cancel failed:', error);
        }
    }

    getCancelPath(schema, requestId) {
        for (const [path, methods] of Object.entries(schema.paths)) {
            if (path.includes('/cancel') && methods.put) {
                return path.replace('{request_id}', requestId);
            }
        }
        throw new Error('No cancel endpoint found');
    }

    showGenerationStatus(message, type = 'generating') {
        const statusPanel = document.getElementById('generation-status');
        const statusMessage = document.getElementById('status-message');
        const statusContainer = statusPanel.querySelector('.status-container');
        const progressFill = document.getElementById('progress-fill');

        // Hide placeholder and results
        document.getElementById('no-images-placeholder').classList.add('hidden');
        document.getElementById('results').classList.add('hidden');
        document.getElementById('inline-gallery').classList.add('hidden');

        // Update message
        statusMessage.textContent = message;

        // Reset container classes
        statusContainer.className = 'status-container';

        // Add type-specific styling
        if (type === 'success') {
            statusContainer.classList.add('status-success');
            statusContainer.querySelector('.status-title').textContent = 'Generation Complete';
            progressFill.style.width = '100%';
        } else if (type === 'error') {
            statusContainer.classList.add('status-error');
            statusContainer.querySelector('.status-title').textContent = 'Generation Failed';
            progressFill.style.width = '0%';
        } else {
            statusContainer.querySelector('.status-title').textContent = 'Generating Image';
            // Keep current progress
        }

        // Show status panel
        statusPanel.classList.remove('hidden');

        this.logDebug(`Status shown: ${message}`, 'status', { type });
    }

    hideGenerationStatus() {
        document.getElementById('generation-status').classList.add('hidden');
        this.currentRequestId = null;

        // Reset progress
        document.getElementById('progress-fill').style.width = '0%';

        this.logDebug('Status hidden', 'status');
    }

    showError(message) {
        this.showGenerationStatus(message, 'error');

        // Auto-hide error status after 5 seconds
        setTimeout(() => {
            this.hideGenerationStatus();
            document.getElementById('no-images-placeholder').classList.remove('hidden');
        }, 5000);

        this.logDebug('Error shown: ' + message, 'error');
    }

    hideResults() {
        document.getElementById('results').classList.add('hidden');
    }

    saveEndpointSettings() {
        if (!this.currentEndpoint) return;

        const formData = this.collectFormData();

        // Filter out base64 image data to save localStorage space
        const filteredData = this.filterBase64Data(formData);

        // Log size savings in debug mode
        if (this.debugMode) {
            const originalSize = JSON.stringify(formData).length;
            const filteredSize = JSON.stringify(filteredData).length;
            const saved = originalSize - filteredSize;
            if (saved > 0) {
                console.log(`💾 Settings size: ${this.formatBytes(filteredSize)} (saved ${this.formatBytes(saved)} by excluding base64)`);
            }
        }

        this.endpointSettings[this.currentEndpoint.metadata.endpointId] = filteredData;
        localStorage.setItem('falai_endpoint_settings', JSON.stringify(this.endpointSettings));
    }

    filterBase64Data(data) {
        const filtered = {};

        for (const [key, value] of Object.entries(data)) {
            // Skip fields with base64 image data
            if (this.isBase64DataURL(value)) {
                if (this.debugMode) {
                    console.log(`🚫 Excluding base64 field '${key}' from settings (${this.formatBytes(value.length)})`);
                }
                continue;
            }

            // Recursively filter objects and arrays
            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value)) {
                    // Filter arrays
                    const filteredArray = value.map(item => {
                        if (typeof item === 'object' && item !== null) {
                            return this.filterBase64Data(item);
                        } else if (this.isBase64DataURL(item)) {
                            if (this.debugMode) {
                                console.log(`🚫 Excluding base64 array item from '${key}' (${this.formatBytes(item.length)})`);
                            }
                            return undefined; // Skip base64 items
                        }
                        return item;
                    }).filter(item => item !== undefined);

                    if (filteredArray.length > 0) {
                        filtered[key] = filteredArray;
                    }
                } else {
                    // Filter nested objects
                    const filteredObject = this.filterBase64Data(value);
                    if (Object.keys(filteredObject).length > 0) {
                        filtered[key] = filteredObject;
                    }
                }
            } else {
                filtered[key] = value;
            }
        }

        return filtered;
    }

    restoreEndpointSettings(endpointId) {
        const settings = this.endpointSettings[endpointId];
        if (!settings) return;

        const form = document.getElementById('generation-form');

        for (const [key, value] of Object.entries(settings)) {
            // Handle array fields (like loras)
            if (Array.isArray(value)) {
                this.restoreArrayField(key, value, form);
                continue;
            }

            // Handle image_size object
            if (key === 'image_size' && typeof value === 'object') {
                this.restoreImageSizeField(value, form);
                continue;
            }

            // Handle simple fields
            const input = form.querySelector(`[name="${key}"]`);
            if (!input) continue;

            if (input.type === 'checkbox') {
                input.checked = Boolean(value);
            } else if (input.type === 'range') {
                input.value = value;
                // Update slider value display (old span element)
                const valueDisplay = input.parentElement.querySelector('.slider-value');
                if (valueDisplay) {
                    valueDisplay.textContent = value;
                }
                // Update slider value input (new input element)
                const valueInput = input.parentElement.querySelector('.slider-value-input');
                if (valueInput) {
                    valueInput.value = value;
                }
            } else {
                input.value = value;
            }

            // Trigger change event to update any dependent elements
            input.dispatchEvent(new Event('change'));
        }
    }

    restoreArrayField(fieldName, arrayValue, form) {
        const container = form.querySelector(`#${fieldName}-items`);
        if (!container) return;

        // Clear existing items
        container.innerHTML = '';

        // Add items for each saved value
        arrayValue.forEach((itemValue, index) => {
            // Get the schema for this array field
            const schema = this.getFieldSchema(fieldName);
            if (!schema) return;

            this.addArrayItem(fieldName, schema, container);

            // Set values for the newly added item
            if (typeof itemValue === 'object') {
                for (const [propName, propValue] of Object.entries(itemValue)) {
                    const input = container.querySelector(`[name="${fieldName}[${index}].${propName}"]`);
                    if (input) {
                        input.value = propValue;
                    }
                }
            } else {
                const input = container.querySelector(`[name="${fieldName}[${index}]"]`);
                if (input) {
                    input.value = itemValue;
                }
            }
        });
    }

    restoreImageSizeField(value, form) {
        const select = form.querySelector('select[name="image_size"]');
        if (!select) return;

        if (value.width && value.height) {
            // Custom size
            select.value = 'custom';
            select.dispatchEvent(new Event('change')); // Show custom fields

            const widthInput = form.querySelector('input[name="image_size_width"]');
            const heightInput = form.querySelector('input[name="image_size_height"]');

            if (widthInput) widthInput.value = value.width;
            if (heightInput) heightInput.value = value.height;
        }
    }

    getFieldSchema(fieldName) {
        if (!this.currentEndpoint) return null;

        const inputSchema = this.findInputSchema(this.currentEndpoint.schema);
        if (!inputSchema || !inputSchema.properties) return null;

        return inputSchema.properties[fieldName];
    }

    // Storage management functions
    getStorageSize() {
        let totalSize = 0;
        const storageData = {};

        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                const value = localStorage.getItem(key);
                const size = new Blob([value]).size;
                storageData[key] = {
                    size: size,
                    sizeFormatted: this.formatBytes(size),
                    items: key.startsWith('falai_') ?
                        (key === 'falai_saved_images' ? JSON.parse(value || '[]').length : 1) : 1
                };
                totalSize += size;
            }
        }

        return {
            total: totalSize,
            totalFormatted: this.formatBytes(totalSize),
            limit: this.getStorageLimit(),
            limitFormatted: this.formatBytes(this.getStorageLimit()),
            usage: (totalSize / this.getStorageLimit() * 100).toFixed(1),
            breakdown: storageData
        };
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getStorageLimit() {
        // Return cached limit if already calculated
        if (this._cachedStorageLimit) {
            return this._cachedStorageLimit;
        }

        try {
            // Use common browser limits (testing is risky when storage is full)
            const userAgent = navigator.userAgent.toLowerCase();
            let limit = 10 * 1024 * 1024; // Default 10MB

            if (userAgent.includes('chrome') || userAgent.includes('edge')) {
                limit = 10 * 1024 * 1024; // Chrome/Edge: ~10MB
            } else if (userAgent.includes('firefox')) {
                limit = 10 * 1024 * 1024; // Firefox: ~10MB
            } else if (userAgent.includes('safari')) {
                limit = 5 * 1024 * 1024;  // Safari: ~5MB
            }

            // Cache the result
            this._cachedStorageLimit = limit;
            return limit;

        } catch (e) {
            this._cachedStorageLimit = 5 * 1024 * 1024; // 5MB fallback
            return this._cachedStorageLimit;
        }
    }

    logStorageInfo() {
        const info = this.getStorageSize();

        // Analyze base64 images in settings
        const base64Analysis = this.analyzeBase64Images();

        console.group('📊 LocalStorage Usage');
        console.log(`Total: ${info.totalFormatted} / ${info.limitFormatted} (${info.usage}%)`);

        if (base64Analysis.count > 0) {
            console.log(`⚠️  Base64 images found: ${base64Analysis.count} images (${this.formatBytes(base64Analysis.totalSize)})`);
        }

        console.log('Breakdown:');

        // Sort by size descending
        const sorted = Object.entries(info.breakdown)
            .sort(([, a], [, b]) => b.size - a.size);

        for (const [key, data] of sorted) {
            let extra = data.items > 1 ? ` (${data.items} items)` : '';
            if (key === 'falai_endpoint_settings' && base64Analysis.count > 0) {
                extra += ` - includes ${base64Analysis.count} base64 images`;
            }
            console.log(`  ${key}: ${data.sizeFormatted}${extra}`);
        }

        if (base64Analysis.count > 0) {
            console.log(`💡 Run falaiStorage.cleanBase64() to free up ${this.formatBytes(base64Analysis.totalSize)}`);
        }

        console.groupEnd();

        return info;
    }

    analyzeBase64Images() {
        let count = 0;
        let totalSize = 0;

        for (const settings of Object.values(this.endpointSettings)) {
            for (const value of Object.values(settings)) {
                if (typeof value === 'string' && this.isBase64DataURL(value)) {
                    count++;
                    totalSize += new Blob([value]).size;
                }
            }
        }

        return { count, totalSize };
    }

    showBase64Warning() {
        // Don't show multiple warnings in a short time
        const now = Date.now();
        if (this._lastBase64Warning && (now - this._lastBase64Warning) < 30000) {
            return; // Don't show again within 30 seconds
        }
        this._lastBase64Warning = now;

        // Show temporary notification
        const notification = document.createElement('div');
        notification.className = 'base64-warning';
        notification.innerHTML = `
            <div class="warning-content">
                <div class="warning-icon">⚠️</div>
                <div class="warning-text">
                    <strong>Temporary result format</strong>
                    <p>Server returned image in base64 format. This won't be saved to gallery automatically. Use the download button to save it now.</p>
                </div>
                <button class="warning-close" onclick="this.parentElement.remove()">✕</button>
            </div>
        `;

        // Add styles if not already added
        if (!document.getElementById('base64-warning-styles')) {
            const styles = document.createElement('style');
            styles.id = 'base64-warning-styles';
            styles.textContent = `
                .base64-warning {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    z-index: 1000;
                    max-width: 400px;
                    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                    border: 1px solid #f59e0b;
                    border-radius: 12px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
                    animation: slideIn 0.3s ease-out;
                }

                .warning-content {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 16px;
                }

                .warning-icon {
                    font-size: 24px;
                    flex-shrink: 0;
                }

                .warning-text {
                    flex: 1;
                }

                .warning-text strong {
                    color: #92400e;
                    font-size: 14px;
                    display: block;
                    margin-bottom: 4px;
                }

                .warning-text p {
                    color: #78350f;
                    font-size: 13px;
                    margin: 0;
                    line-height: 1.4;
                }

                .warning-close {
                    background: none;
                    border: none;
                    color: #92400e;
                    font-size: 16px;
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    flex-shrink: 0;
                }

                .warning-close:hover {
                    background: rgba(146, 64, 14, 0.1);
                }

                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(styles);
        }

        document.body.appendChild(notification);

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.style.animation = 'slideIn 0.3s ease-out reverse';
                setTimeout(() => notification.remove(), 300);
            }
        }, 10000);
    }

    restoreUIState() {
        // Restore advanced options state
        const advancedVisible = localStorage.getItem('falai_advanced_visible') === 'true';
        if (advancedVisible) {
            setTimeout(() => {
                const toggle = document.querySelector('.advanced-options-toggle');
                const content = document.querySelector('.advanced-options-content');
                if (toggle && content) {
                    content.classList.add('visible');
                    toggle.textContent = '▲ Advanced Options';
                }
            }, 100);
        }

        // Save advanced options state when toggled
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('advanced-options-toggle')) {
                setTimeout(() => {
                    const content = document.querySelector('.advanced-options-content');
                    if (content) {
                        localStorage.setItem('falai_advanced_visible',
                            content.classList.contains('visible'));
                    }
                }, 10);
            }
        });
    }

    setupPWA() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('ServiceWorker registration successful: ', registration.scope);
                    })
                    .catch((error) => {
                        console.log('ServiceWorker registration failed: ', error);
                    });
            });
        }

        // Handle install prompt
        let deferredPrompt;
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing
            e.preventDefault();
            deferredPrompt = e;

            // Show install button in header
            this.showInstallButton(deferredPrompt);
        });

        // Handle successful installation
        window.addEventListener('appinstalled', () => {
            console.log('FalAI was installed');
            this.hideInstallButton();
        });

        // Check if launched from PWA
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            console.log('Running as PWA');
        }

        // Handle gallery shortcut
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('gallery') === 'true') {
            setTimeout(() => this.showGallery(), 1000);
        }
    }

    showInstallButton(deferredPrompt) {
        const headerControls = document.querySelector('.header-controls');

        // Check if install button already exists
        if (headerControls.querySelector('#install-btn')) return;

        const installBtn = document.createElement('button');
        installBtn.id = 'install-btn';
        installBtn.className = 'btn secondary';
        installBtn.textContent = 'Install App';

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to install prompt: ${outcome}`);
                deferredPrompt = null;
                this.hideInstallButton();
            }
        });

        headerControls.insertBefore(installBtn, headerControls.firstChild);
    }

    hideInstallButton() {
        const installBtn = document.getElementById('install-btn');
        if (installBtn) {
            installBtn.remove();
        }
    }

    // Custom endpoint functions
    handleSchemaFileSelection(file) {
        const schemaFileInfo = document.getElementById('schema-file-info');
        const schemaFileName = document.getElementById('schema-file-name');

        schemaFileName.textContent = file.name;
        schemaFileInfo.classList.remove('hidden');
    }

    clearSchemaFileSelection() {
        const schemaFileInfo = document.getElementById('schema-file-info');
        const schemaFileInput = document.getElementById('openapi-file');

        schemaFileInfo.classList.add('hidden');
        schemaFileInput.value = '';
    }

    closeCustomEndpointModal() {
        document.getElementById('custom-endpoint-modal').classList.add('hidden');
        this.clearSchemaFileSelection();
    }

    async addCustomEndpoint() {
        try {
            // Load from file
            const fileInput = document.getElementById('openapi-file');
            const file = fileInput.files[0];
            if (!file) {
                alert('Please select a JSON file');
                return;
            }

            this.logDebug(`Loading custom endpoint from file: ${file.name}`, 'info');
            const schema = await this.loadEndpointFromFile(file);
            const endpointName = file.name.replace(/\.json$/, '');

            // Validate schema
            if (!this.validateOpenAPISchema(schema)) {
                return; // Error already shown in validate function
            }

            // Add to endpoints
            const customId = `custom-${Date.now()}`;
            this.endpoints.set(customId, {
                schema: schema,
                metadata: this.extractMetadata(schema, endpointName)
            });

            // Save custom endpoints to localStorage
            this.saveCustomEndpoints();

            // Update dropdown
            this.renderEndpointDropdown();

            // Close modal
            this.closeCustomEndpointModal();

            // Show success message
            this.logDebug(`Successfully added custom endpoint: ${endpointName}`, 'success');
            alert(`Successfully added custom endpoint: ${endpointName}`);

        } catch (error) {
            console.error('Failed to add custom endpoint:', error);
            this.logDebug(`Failed to add custom endpoint: ${error.message}`, 'error');
            alert(`Failed to add custom endpoint: ${error.message}`);
        }
    }


    async loadEndpointFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const schema = JSON.parse(e.target.result);
                    resolve(schema);
                } catch (error) {
                    reject(new Error('Invalid JSON file'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    validateOpenAPISchema(schema) {
        if (!schema || typeof schema !== 'object') {
            alert('Invalid schema: must be a JSON object');
            return false;
        }

        if (!schema.openapi) {
            alert('Invalid schema: missing "openapi" field');
            return false;
        }

        if (!schema.info) {
            alert('Invalid schema: missing "info" field');
            return false;
        }

        if (!schema.paths) {
            alert('Invalid schema: missing "paths" field');
            return false;
        }

        // Check for POST endpoints
        const hasPostEndpoint = Object.values(schema.paths).some(path => path.post);
        if (!hasPostEndpoint) {
            alert('Warning: No POST endpoints found in schema');
        }

        return true;
    }

    extractMetadata(schema, fallbackName) {
        const info = schema.info;
        let metadata = {
            endpointId: info.title || fallbackName,
            category: 'custom',
            thumbnailUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%234f46e5"/><text x="50" y="50" text-anchor="middle" dy="0.35em" fill="white" font-size="40">🔧</text></svg>',
            playgroundUrl: '#',
            documentationUrl: info.externalDocs?.url || '#'
        };

        // Try to extract fal.ai metadata if present
        if (info['x-fal-metadata']) {
            metadata = { ...metadata, ...info['x-fal-metadata'] };
        }

        return metadata;
    }

    openMaskEditor(fieldName, urlInput) {
        // Get reference image from image_url field or other image fields
        let referenceImageUrl = null;

        // Try different common names for reference image
        const imageFieldNames = ['image_url', 'image', 'input_image', 'source_image'];

        for (const fieldName of imageFieldNames) {
            const imageField = document.querySelector(`[name="${fieldName}"]`);
            if (imageField && imageField.value) {
                referenceImageUrl = imageField.value;
                break;
            }
        }

        if (!referenceImageUrl) {
            alert('Please upload or enter a reference image first (in the image field)');
            return;
        }

        // Create mask editor modal
        this.createMaskEditorModal(fieldName, urlInput, referenceImageUrl);
    }

    createMaskEditorModal(fieldName, urlInput, referenceImageUrl) {
        // Remove existing modal if any
        const existingModal = document.getElementById('mask-editor-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'mask-editor-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content mask-editor-content">
                <div class="modal-header">
                    <div class="mask-editor-hotkeys" style="display: ${this.isMobileDevice() ? 'none' : 'block'}">
                        <small>💡 Hotkeys: Shift+Wheel (zoom), Alt+Wheel (brush size), Ctrl+Z (undo), Ctrl+Y (redo), R (reset zoom), F (fit screen), Esc (close)</small>
                    </div>
                    <button type="button" id="close-mask-editor" class="btn secondary small">✕</button>
                </div>
                <div class="mask-editor-body">
                    <div class="mask-editor-controls">
                        <div class="control-group">
                            <label>Brush Size:</label>
                            <div class="brush-size-row">
                                <button type="button" id="brush-smaller" class="btn secondary small">-</button>
                                <input type="range" id="brush-size" min="1" max="100" value="20">
                                <span id="brush-size-value">20px</span>
                                <button type="button" id="brush-larger" class="btn secondary small">+</button>
                            </div>
                        </div>
                        <div class="control-group">
                            <button type="button" id="zoom-out" class="btn secondary small" title="Zoom out">🔍-</button>
                            <button type="button" id="zoom-in" class="btn secondary small" title="Zoom in">🔍+</button>
                            <button type="button" id="zoom-fit" class="btn secondary small" title="Fit to screen (F)">🔍 Fit</button>
                            <button type="button" id="zoom-reset" class="btn secondary small" title="Reset zoom (R)">↻ Reset</button>
                        </div>
                        <div class="control-group">
                            <button type="button" id="undo-mask" class="btn secondary small" disabled title="Undo (Ctrl+Z)">↶ Undo</button>
                            <button type="button" id="redo-mask" class="btn secondary small" disabled title="Redo (Ctrl+Y)">↷ Redo</button>
                            <button type="button" id="clear-mask" class="btn secondary small" title="Clear all">🗑 Clear</button>
                        </div>
                    </div>
                    <div class="canvas-container" id="canvas-container">
                        <canvas id="mask-canvas"></canvas>
                    </div>
                    <div class="mask-editor-actions">
                        <button type="button" id="cancel-mask" class="btn secondary">Cancel</button>
                        <button type="button" id="apply-mask" class="btn primary">Apply Mask</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.remove('hidden');

        // Block body scrolling on mobile
        if (this.isMobileDevice()) {
            document.body.style.overflow = 'hidden';
        }

        // Initialize mask editor
        this.initializeMaskEditor(modal, fieldName, urlInput, referenceImageUrl);
    }

    initializeMaskEditor(modal, fieldName, urlInput, referenceImageUrl) {
        console.log('🎨 Initializing Fabric.js mask editor for field:', fieldName);

        const canvasElement = modal.querySelector('#mask-canvas');
        const canvasContainer = modal.querySelector('#canvas-container');
        const brushSizeSlider = modal.querySelector('#brush-size');
        const brushSizeValue = modal.querySelector('#brush-size-value');
        const undoBtn = modal.querySelector('#undo-mask');
        const redoBtn = modal.querySelector('#redo-mask');
        const zoomFitBtn = modal.querySelector('#zoom-fit');
        const zoomResetBtn = modal.querySelector('#zoom-reset');
        const zoomInBtn = modal.querySelector('#zoom-in');
        const zoomOutBtn = modal.querySelector('#zoom-out');
        const brushSmallerBtn = modal.querySelector('#brush-smaller');
        const brushLargerBtn = modal.querySelector('#brush-larger');

        // Debug: Check if all required elements exist
        if (!canvasElement) {
            console.error('❌ Canvas element not found');
            return;
        }

        let fabricCanvas;
        let undoStack = [];
        let redoStack = [];

        // State for zoom and pan
        let zoomLevel = 1;
        let panX = 0;
        let panY = 0;

        // Load reference image first
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            // Calculate available space for canvas
            const container = canvasContainer;
            const containerRect = container.getBoundingClientRect();

            // Get available dimensions considering mobile interface
            let maxWidth, maxHeight;
            if (this.isMobileDevice()) {
                // On mobile, use more of the available space
                maxWidth = Math.min(window.innerWidth - 40, 600); // 20px padding each side
                maxHeight = Math.min(window.innerHeight * 0.6, 400); // 60% of screen height max
            } else {
                maxWidth = 700;
                maxHeight = 500;
            }

            let canvasWidth = img.width;
            let canvasHeight = img.height;

            // Calculate scale factor to fit within max dimensions while preserving aspect ratio
            const scaleX = maxWidth / canvasWidth;
            const scaleY = maxHeight / canvasHeight;
            const scale = Math.min(scaleX, scaleY, 1); // Don't upscale, only downscale

            // Apply the scale factor
            canvasWidth = Math.round(canvasWidth * scale);
            canvasHeight = Math.round(canvasHeight * scale);

            console.log('📏 Canvas sizing:', {
                original: { width: img.width, height: img.height },
                maxSize: { width: maxWidth, height: maxHeight },
                final: { width: canvasWidth, height: canvasHeight },
                scale: scale
            });

            // Initialize Fabric.js canvas with exact calculated dimensions
            fabricCanvas = new fabric.Canvas(canvasElement, {
                width: canvasWidth,
                height: canvasHeight,
                isDrawingMode: true,
                selection: false,
                preserveObjectStacking: true,
                enableRetinaScaling: true
            });

            // Store original dimensions for zoom calculations
            fabricCanvas.originalWidth = canvasWidth;
            fabricCanvas.originalHeight = canvasHeight;
            
            // Make canvas container properly sized and scrollable for zoom
            canvasContainer.style.position = 'relative';
            canvasContainer.style.overflow = 'auto';
            canvasContainer.style.width = '100%';
            canvasContainer.style.height = '100%';
            
            // Set initial canvas size but allow viewport adjustments
            canvasElement.style.width = canvasWidth + 'px';
            canvasElement.style.height = canvasHeight + 'px';

            // Fix touch coordinates for mobile devices
            if (this.isMobileDevice()) {
                this.setupMobileTouchFix(fabricCanvas);
            }

            // Add background image with exact fit (no additional scaling)
            const backgroundImg = new fabric.Image(img, {
                left: 0,
                top: 0,
                scaleX: scale,
                scaleY: scale,
                selectable: false,
                evented: false,
                excludeFromExport: false
            });

            fabricCanvas.setBackgroundImage(backgroundImg, () => {
                fabricCanvas.renderAll();

                // Force canvas to update its internal coordinates
                fabricCanvas.calcOffset();

                // Additional calibration for mobile devices
                if (this.isMobileDevice()) {
                    // Force recalculation after a short delay to ensure proper sizing
                    setTimeout(() => {
                        fabricCanvas.calcOffset();
                        console.log('📱 Mobile canvas coordinates recalibrated');
                    }, 100);
                }

                console.log('✅ Canvas size:', canvasWidth, 'x', canvasHeight);
                console.log('✅ Image scale:', scale);
                console.log('✅ Original image size:', img.width, 'x', img.height);
            });

            // Configure drawing brush
            fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
            fabricCanvas.freeDrawingBrush.width = 20;
            fabricCanvas.freeDrawingBrush.color = 'rgba(255, 0, 0, 0.4)'; // Semi-transparent red

            // Add event listener for coordinate debugging
            fabricCanvas.on('mouse:down', function(e) {
                const pointer = fabricCanvas.getPointer(e.e);
                console.log('🖱️ Click at canvas coordinates:', pointer.x, pointer.y);
            });

            // Improved touch coordinate handling for mobile
            if (this.isMobileDevice()) {
                console.log('📱 Setting up improved touch coordinates for mobile');

                // Override default pointer calculation for better accuracy
                const originalGetPointer = fabricCanvas.getPointer;
                fabricCanvas.getPointer = function(e, ignoreZoom) {
                    // For touch events, use custom calculation that respects zoom
                    if ((e.touches || e.changedTouches) && !ignoreZoom) {
                        const touch = e.touches?.[0] || e.changedTouches?.[0];
                        if (touch) {
                            const rect = this.upperCanvasEl.getBoundingClientRect();

                            // Get raw touch coordinates relative to canvas
                            const rawX = touch.clientX - rect.left;
                            const rawY = touch.clientY - rect.top;

                            // Apply zoom and viewport transform
                            const vpt = this.viewportTransform;
                            const zoom = this.getZoom();

                            // Convert screen coordinates to canvas coordinates
                            const pointer = {
                                x: (rawX - vpt[4]) / zoom,
                                y: (rawY - vpt[5]) / zoom
                            };

                            console.log('📱 Touch corrected (zoom-aware):', pointer.x, pointer.y, 'zoom:', zoom);
                            return pointer;
                        }
                    }

                    // Use original for non-touch events
                    return originalGetPointer.call(this, e, ignoreZoom);
                };
            }

            // Store initial state for undo after everything is set up
            setTimeout(() => {
                saveState();
                updateUndoRedoButtons();
            }, 100);

            // Setup event listeners
            setupControls();
            setupUndoRedo();
            setupZoomPan.call(this);
            setupHotkeys();

            console.log('✅ Fabric.js canvas initialized successfully');
        };

        img.onerror = () => {
            console.error('❌ Failed to load reference image:', referenceImageUrl);
            alert('Failed to load reference image. Please try again.');
        };

        img.src = referenceImageUrl;

        function setupControls() {
            // Brush size control
            brushSizeSlider.addEventListener('input', () => {
                const size = parseInt(brushSizeSlider.value);
                fabricCanvas.freeDrawingBrush.width = size;
                brushSizeValue.textContent = size + 'px';
            });

            // Clear mask - remove only drawn paths, keep background image
            modal.querySelector('#clear-mask').addEventListener('click', () => {
                // Get all objects except background
                const objects = fabricCanvas.getObjects();
                // Remove only drawn objects (paths), keeping background
                objects.forEach(obj => {
                    if (obj.type === 'path') {
                        fabricCanvas.remove(obj);
                    }
                });
                fabricCanvas.renderAll();
                saveState();
            });

            // Zoom controls
            zoomFitBtn.addEventListener('click', fitToContainer);
            zoomResetBtn.addEventListener('click', resetZoom);
            zoomInBtn.addEventListener('click', () => {
                const center = { x: fabricCanvas.width / 2, y: fabricCanvas.height / 2 };
                zoom(center, 1.2);
            });
            zoomOutBtn.addEventListener('click', () => {
                const center = { x: fabricCanvas.width / 2, y: fabricCanvas.height / 2 };
                zoom(center, 0.8);
            });

            // Brush size controls
            brushSmallerBtn.addEventListener('click', () => {
                adjustBrushSize(-5);
            });
            brushLargerBtn.addEventListener('click', () => {
                adjustBrushSize(5);
            });
        }

        function setupUndoRedo() {
            // Save state after each drawing action
            fabricCanvas.on('path:created', () => {
                saveState();
            });

            undoBtn.addEventListener('click', undo);
            redoBtn.addEventListener('click', redo);
        }

        function saveState() {
            const state = JSON.stringify(fabricCanvas.toJSON());
            undoStack.push(state);
            redoStack = []; // Clear redo stack when new action is performed

            // Limit undo stack size
            if (undoStack.length > 20) {
                undoStack.shift();
            }

            updateUndoRedoButtons();
        }

        function undo() {
            if (undoStack.length > 1) {
                redoStack.push(undoStack.pop());
                const state = undoStack[undoStack.length - 1];
                fabricCanvas.loadFromJSON(state, () => {
                    fabricCanvas.renderAll();
                    updateUndoRedoButtons();
                });
            }
        }

        function redo() {
            if (redoStack.length > 0) {
                const state = redoStack.pop();
                undoStack.push(state);
                fabricCanvas.loadFromJSON(state, () => {
                    fabricCanvas.renderAll();
                    updateUndoRedoButtons();
                });
            }
        }

        function updateUndoRedoButtons() {
            undoBtn.disabled = undoStack.length <= 1;
            redoBtn.disabled = redoStack.length === 0;
        }

        function setupZoomPan() {
            function showZoomFeedback(zoomLevel) {
                // Remove existing feedback if present
                const existingFeedback = document.querySelector('.zoom-feedback');
                if (existingFeedback) {
                    existingFeedback.remove();
                }

                // Create zoom feedback element
                const feedback = document.createElement('div');
                feedback.className = 'zoom-feedback';
                feedback.textContent = `${Math.round(zoomLevel * 100)}%`;
                feedback.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 0.5rem 1rem;
                    border-radius: 20px;
                    font-size: 1.2rem;
                    font-weight: bold;
                    z-index: 3000;
                    pointer-events: none;
                    opacity: 0.9;
                    transition: opacity 0.3s ease;
                `;

                document.body.appendChild(feedback);

                // Remove feedback after a short delay
                setTimeout(() => {
                    feedback.style.opacity = '0';
                    setTimeout(() => {
                        if (feedback.parentNode) {
                            feedback.remove();
                        }
                    }, 300);
                }, 800);
            }

            // Mouse wheel zoom with Shift key (instead of Ctrl to avoid browser zoom conflict)
            canvasContainer.addEventListener('wheel', (e) => {
                if (e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = e.deltaY > 0 ? 0.9 : 1.1;
                    const pointer = fabricCanvas.getPointer(e);
                    zoom(pointer, delta);
                } else if (e.altKey) {
                    // Alt + wheel for brush size
                    e.preventDefault();
                    e.stopPropagation();
                    adjustBrushSize(e.deltaY > 0 ? -5 : 5);
                }
            }, { passive: false });

            // Pan with middle mouse or Ctrl+drag (when not drawing)
            let isPanning = false;
            let lastPanPoint = null;

            canvasContainer.addEventListener('mousedown', (e) => {
                if (e.button === 1 || (e.button === 0 && e.ctrlKey && !fabricCanvas.isDrawingMode)) {
                    isPanning = true;
                    lastPanPoint = { x: e.clientX, y: e.clientY };
                    canvasContainer.style.cursor = 'grabbing';
                    fabricCanvas.isDrawingMode = false; // Disable drawing during pan
                    e.preventDefault();
                }
            });

            canvasContainer.addEventListener('mousemove', (e) => {
                if (isPanning && lastPanPoint) {
                    const deltaX = e.clientX - lastPanPoint.x;
                    const deltaY = e.clientY - lastPanPoint.y;
                    pan(deltaX, deltaY);
                    lastPanPoint = { x: e.clientX, y: e.clientY };
                }
            });

            canvasContainer.addEventListener('mouseup', () => {
                if (isPanning) {
                    isPanning = false;
                    lastPanPoint = null;
                    canvasContainer.style.cursor = 'default';
                    fabricCanvas.isDrawingMode = true; // Re-enable drawing
                }
            });

            // Touch gestures for mobile
            if (this.isMobileDevice()) {
                let initialDistance = 0;
                let initialScale = 1;
                let touches = [];

                canvasContainer.addEventListener('touchstart', (e) => {
                    touches = Array.from(e.touches);

                    if (touches.length === 2) {
                        // Two-finger touch for zoom
                        e.preventDefault();
                        fabricCanvas.isDrawingMode = false; // Disable drawing during zoom

                        const touch1 = touches[0];
                        const touch2 = touches[1];
                        initialDistance = Math.hypot(
                            touch2.clientX - touch1.clientX,
                            touch2.clientY - touch1.clientY
                        );
                        initialScale = fabricCanvas.getZoom();
                    }
                }, { passive: false });

                canvasContainer.addEventListener('touchmove', (e) => {
                    touches = Array.from(e.touches);

                    if (touches.length === 2) {
                        e.preventDefault();

                        const touch1 = touches[0];
                        const touch2 = touches[1];
                        const currentDistance = Math.hypot(
                            touch2.clientX - touch1.clientX,
                            touch2.clientY - touch1.clientY
                        );

                        if (initialDistance > 0) {
                            const scale = (currentDistance / initialDistance) * initialScale;
                            const centerX = (touch1.clientX + touch2.clientX) / 2;
                            const centerY = (touch1.clientY + touch2.clientY) / 2;

                            // Convert screen coordinates to canvas coordinates
                            const rect = canvasContainer.getBoundingClientRect();
                            const pointer = {
                                x: (centerX - rect.left) * (fabricCanvas.width / rect.width),
                                y: (centerY - rect.top) * (fabricCanvas.height / rect.height)
                            };

                            fabricCanvas.zoomToPoint(new fabric.Point(pointer.x, pointer.y), Math.max(0.1, Math.min(5, scale)));

                            // Force canvas offset recalculation after zoom
                            setTimeout(() => {
                                fabricCanvas.calcOffset();
                            }, 50);

                            // Show zoom level feedback on mobile
                            if (this.isMobileDevice()) {
                                showZoomFeedback(scale);
                            }
                        }
                    }
                }, { passive: false });

                canvasContainer.addEventListener('touchend', (e) => {
                    if (touches.length === 2) {
                        fabricCanvas.isDrawingMode = true; // Re-enable drawing
                    }
                    touches = [];
                    initialDistance = 0;
                }, { passive: false });
            }
        }

        function setupHotkeys() {
            const handleKeydown = (e) => {
                // Only handle keys if mask editor modal is active
                if (!modal.parentNode) return;

                switch (e.key.toLowerCase()) {
                    case 'r':
                        if (!e.ctrlKey && !e.altKey) {
                            e.preventDefault();
                            resetZoom();
                        }
                        break;
                    case 'f':
                        if (!e.ctrlKey && !e.altKey) {
                            e.preventDefault();
                            fitToContainer();
                        }
                        break;
                    case 'z':
                        if (e.ctrlKey && !e.shiftKey) {
                            e.preventDefault();
                            undo();
                        }
                        break;
                    case 'y':
                        if (e.ctrlKey) {
                            e.preventDefault();
                            redo();
                        }
                        break;
                    case 'escape':
                        e.preventDefault();
                        if (fabricCanvas) fabricCanvas.dispose();
                        // Restore body scrolling
                        document.body.style.overflow = '';
                        modal.remove();
                        break;
                }
            };

            document.addEventListener('keydown', handleKeydown);

            // Clean up event listener on modal close
            const cleanup = () => document.removeEventListener('keydown', handleKeydown);
            modal.addEventListener('remove', cleanup);
        }

        function adjustBrushSize(delta) {
            const currentSize = parseInt(brushSizeSlider.value);
            const newSize = Math.max(1, Math.min(100, currentSize + delta));
            brushSizeSlider.value = newSize;
            fabricCanvas.freeDrawingBrush.width = newSize;
            brushSizeValue.textContent = newSize + 'px';
        }

        function zoom(point, delta) {
            const oldZoom = fabricCanvas.getZoom();
            const newZoom = Math.max(0.1, Math.min(5, oldZoom * delta));

            fabricCanvas.zoomToPoint(new fabric.Point(point.x, point.y), newZoom);
            zoomLevel = newZoom;
            
            // Update canvas display size to match new zoom level
            const imageWidth = fabricCanvas.originalWidth;
            const imageHeight = fabricCanvas.originalHeight;
            const scaledWidth = imageWidth * newZoom;
            const scaledHeight = imageHeight * newZoom;
            canvasElement.style.width = scaledWidth + 'px';
            canvasElement.style.height = scaledHeight + 'px';

            // Force offset recalculation after zoom (especially important on mobile)
            setTimeout(() => {
                fabricCanvas.calcOffset();
            }, 50);
        }

        function pan(deltaX, deltaY) {
            const vpt = fabricCanvas.viewportTransform;
            vpt[4] += deltaX;
            vpt[5] += deltaY;
            fabricCanvas.setViewportTransform(vpt);
            fabricCanvas.renderAll();
        }

        function resetZoom() {
            // Reset should show image in real size (1:1 pixel ratio)
            fabricCanvas.setZoom(1);
            
            // Restore original canvas display size
            const imageWidth = fabricCanvas.originalWidth;
            const imageHeight = fabricCanvas.originalHeight;
            canvasElement.style.width = imageWidth + 'px';
            canvasElement.style.height = imageHeight + 'px';

            // Center the image in the container
            const containerWidth = canvasContainer.clientWidth;
            const containerHeight = canvasContainer.clientHeight;

            const vpt = fabricCanvas.viewportTransform;
            vpt[4] = (containerWidth - imageWidth) / 2;
            vpt[5] = (containerHeight - imageHeight) / 2;

            fabricCanvas.setViewportTransform(vpt);
            fabricCanvas.renderAll();
            zoomLevel = 1;

            // Force offset recalculation
            setTimeout(() => {
                fabricCanvas.calcOffset();
            }, 50);

            console.log('🔄 Reset zoom to 1:1, image centered');
        }

        function fitToContainer() {
            // Fit should fit image to container width while maintaining aspect ratio
            const containerWidth = canvasContainer.clientWidth - 40; // padding
            const containerHeight = canvasContainer.clientHeight - 40;

            const imageWidth = fabricCanvas.originalWidth;
            const imageHeight = fabricCanvas.originalHeight;

            // Calculate scale to fit width, but check if height fits too
            let scale = containerWidth / imageWidth;

            // If scaled height exceeds container height, scale by height instead
            if (imageHeight * scale > containerHeight) {
                scale = containerHeight / imageHeight;
            }

            // Don't scale up beyond original size
            scale = Math.min(scale, 1);

            fabricCanvas.setZoom(scale);
            
            // Update canvas display size to match viewport
            const scaledWidth = imageWidth * scale;
            const scaledHeight = imageHeight * scale;
            canvasElement.style.width = scaledWidth + 'px';
            canvasElement.style.height = scaledHeight + 'px';

            // Center the image
            const vpt = fabricCanvas.viewportTransform;
            vpt[4] = (containerWidth - scaledWidth) / 2 + 20; // +20 for padding
            vpt[5] = (containerHeight - scaledHeight) / 2 + 20;
            fabricCanvas.setViewportTransform(vpt);
            fabricCanvas.renderAll();

            zoomLevel = scale;

            // Force offset recalculation
            setTimeout(() => {
                fabricCanvas.calcOffset();
            }, 50);

            console.log('📐 Fit to container:', { scale, scaledWidth, scaledHeight });
        }

        // Close modal handlers
        modal.querySelector('#close-mask-editor').addEventListener('click', () => {
            if (fabricCanvas) fabricCanvas.dispose();
            // Restore body scrolling
            document.body.style.overflow = '';
            modal.remove();
        });

        modal.querySelector('#cancel-mask').addEventListener('click', () => {
            if (fabricCanvas) fabricCanvas.dispose();
            // Restore body scrolling
            document.body.style.overflow = '';
            modal.remove();
        });

        // Apply mask
        modal.querySelector('#apply-mask').addEventListener('click', () => {
            if (fabricCanvas) {
                this.generateMaskFromFabricCanvas(fabricCanvas, urlInput);
                fabricCanvas.dispose();
            }
            // Restore body scrolling
            document.body.style.overflow = '';
            modal.remove();
        });
    }

    generateMaskFromFabricCanvas(fabricCanvas, urlInput) {
        console.log('🎨 Generating mask from Fabric.js canvas');

        // Get the original image dimensions that were used for the background
        const bgImage = fabricCanvas.backgroundImage;
        const originalWidth = bgImage.width;
        const originalHeight = bgImage.height;

        console.log('📐 Original image size:', originalWidth, 'x', originalHeight);
        console.log('📐 Canvas size:', fabricCanvas.width, 'x', fabricCanvas.height);
        console.log('📐 Number of drawn objects:', fabricCanvas.getObjects().length);

        // Create a temporary canvas with original image size
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        tempCanvas.width = originalWidth;
        tempCanvas.height = originalHeight;

        // Start with black background
        tempCtx.fillStyle = 'black';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Calculate scale factor from canvas to original size
        const scaleToOriginal = originalWidth / fabricCanvas.width;

        // Get all drawn objects (paths)
        const objects = fabricCanvas.getObjects();

        if (objects.length === 0) {
            console.log('⚠️ No drawn objects found, creating empty black mask');
        } else {
            console.log('✅ Found', objects.length, 'drawn objects');

            // Set white brush for mask
            tempCtx.fillStyle = 'white';
            tempCtx.strokeStyle = 'white';
            tempCtx.globalCompositeOperation = 'source-over';

            // Draw each path object scaled to original size
            objects.forEach((obj, index) => {
                if (obj.type === 'path') {
                    console.log(`🎨 Processing path ${index + 1}/${objects.length}`);

                    // Get the path data and scale it
                    const pathData = obj.path;
                    if (pathData && pathData.length > 0) {
                        tempCtx.beginPath();
                        tempCtx.lineWidth = (obj.strokeWidth || 20) * scaleToOriginal;
                        tempCtx.lineCap = 'round';
                        tempCtx.lineJoin = 'round';

                        // Process the path commands
                        for (let i = 0; i < pathData.length; i++) {
                            const cmd = pathData[i];
                            const command = cmd[0];

                            switch (command) {
                                case 'M': // Move to
                                    tempCtx.moveTo(cmd[1] * scaleToOriginal, cmd[2] * scaleToOriginal);
                                    break;
                                case 'L': // Line to
                                    tempCtx.lineTo(cmd[1] * scaleToOriginal, cmd[2] * scaleToOriginal);
                                    break;
                                case 'Q': // Quadratic curve
                                    tempCtx.quadraticCurveTo(
                                        cmd[1] * scaleToOriginal, cmd[2] * scaleToOriginal,
                                        cmd[3] * scaleToOriginal, cmd[4] * scaleToOriginal
                                    );
                                    break;
                                case 'C': // Cubic curve
                                    tempCtx.bezierCurveTo(
                                        cmd[1] * scaleToOriginal, cmd[2] * scaleToOriginal,
                                        cmd[3] * scaleToOriginal, cmd[4] * scaleToOriginal,
                                        cmd[5] * scaleToOriginal, cmd[6] * scaleToOriginal
                                    );
                                    break;
                            }
                        }
                        tempCtx.stroke();
                    }
                }
            });
        }

        // Convert to base64 and set in input
        const maskDataUrl = tempCanvas.toDataURL('image/png');
        urlInput.value = maskDataUrl;

        // Trigger input event to update preview
        urlInput.dispatchEvent(new Event('input'));

        // Save settings
        this.saveEndpointSettings();

        console.log('✅ Fabric.js mask generated and applied to', urlInput.name);
        console.log('📐 Final mask size:', tempCanvas.width, 'x', tempCanvas.height);
    }
    saveCustomEndpoints() {
        const customEndpoints = {};
        for (const [id, endpoint] of this.endpoints.entries()) {
            if (id.startsWith('custom-')) {
                customEndpoints[id] = endpoint;
            }
        }
        localStorage.setItem('falai_custom_endpoints', JSON.stringify(customEndpoints));
    }

    loadCustomEndpoints() {
        try {
            const saved = localStorage.getItem('falai_custom_endpoints');
            if (saved) {
                const customEndpoints = JSON.parse(saved);
                for (const [id, endpoint] of Object.entries(customEndpoints)) {
                    this.endpoints.set(id, endpoint);
                }
                this.logDebug(`Loaded ${Object.keys(customEndpoints).length} custom endpoints`, 'info');
            }
        } catch (error) {
            console.warn('Failed to load custom endpoints:', error);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const falai = new FalAI();
    console.log('FalAI initialized');
});