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
        this.setupEventListeners();
        this.restoreUIState();
        this.setupPWA();
        this.initDebugMode();
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
        
        for (const [id, endpoint] of this.endpoints) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${endpoint.metadata.endpointId} (${endpoint.metadata.category})`;
            dropdown.appendChild(option);
        }
    }
    
    selectEndpoint(endpointId) {
        const endpoint = this.endpoints.get(endpointId);
        if (!endpoint) return;
        
        this.currentEndpoint = endpoint;
        
        this.showEndpointInfo();
        this.generateForm();
        this.hideResults();
    }
    
    clearEndpointSelection() {
        this.currentEndpoint = null;
        
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
            
            if (fieldName === 'prompt') {
                // Only prompt field is shown by default
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
        if (name.includes('image_url') || name.includes('image') && schema.type === 'string') {
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
        uploadArea.innerHTML = `
            <div class="upload-content">
                <span>📁 Drop image here or click to upload</span>
                <small>Supports: JPG, PNG, WebP, GIF</small>
            </div>
        `;
        
        const preview = document.createElement('div');
        preview.className = 'image-preview hidden';
        preview.innerHTML = `
            <img src="" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 4px;">
            <button type="button" class="remove-image btn secondary small">Remove</button>
        `;
        
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
        
        const valueDisplay = document.createElement('span');
        valueDisplay.className = 'slider-value';
        valueDisplay.textContent = slider.value;
        
        const sliderLabels = document.createElement('div');
        sliderLabels.className = 'slider-labels';
        sliderLabels.innerHTML = `
            <span>${schema.minimum}</span>
            <span>${schema.maximum}</span>
        `;
        
        slider.addEventListener('input', () => {
            valueDisplay.textContent = slider.value;
            this.saveEndpointSettings();
        });
        
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(valueDisplay);
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
            } else {
                this.clearEndpointSelection();
            }
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
        
        // Clear debug log
        document.getElementById('clear-debug').addEventListener('click', () => {
            document.getElementById('debug-content').innerHTML = '';
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
            if (!viewer.classList.contains('hidden')) {
                switch (e.key) {
                    case 'Escape':
                        this.closeFullscreenViewer();
                        break;
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
        const content = document.getElementById('status-content');
        content.innerHTML = `
            <div class="status-item">
                <span>Status:</span>
                <span>${status.status}</span>
            </div>
            ${status.queue_position !== undefined ? `
                <div class="status-item">
                    <span>Queue Position:</span>
                    <span>${status.queue_position}</span>
                </div>
            ` : ''}
            ${status.logs ? `
                <div class="status-item">
                    <span>Logs:</span>
                    <pre>${JSON.stringify(status.logs, null, 2)}</pre>
                </div>
            ` : ''}
        `;
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
        
        // Automatically save to gallery when image is generated
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
        
        const overlay = document.createElement('div');
        overlay.className = 'gallery-item-overlay';
        
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'btn secondary';
        downloadBtn.innerHTML = '💾';
        downloadBtn.title = 'Download';
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadImageFromGallery(index);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn secondary';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteImageFromGallery(index);
        });
        
        overlay.appendChild(downloadBtn);
        overlay.appendChild(deleteBtn);
        
        const info = document.createElement('div');
        info.className = 'gallery-item-info';
        info.innerHTML = `
            <div>${imageData.endpoint}</div>
            <div>${date}</div>
        `;
        
        div.appendChild(img);
        div.appendChild(overlay);
        div.appendChild(info);
        
        // Click on entire gallery item opens zoom modal with gallery context
        div.addEventListener('click', (e) => {
            // Only handle clicks that aren't on buttons
            if (!e.target.closest('button')) {
                e.preventDefault();
                e.stopPropagation();
                this.openImageModalWithNavigation(imageData.url, this.savedImages, index, 'gallery');
            }
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
                this.deleteImageFromGallery(currentIndex);
                
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
            
            customFields.appendChild(widthField);
            customFields.appendChild(heightField);
            container.appendChild(customFields);
            
            // Add event listener to show/hide custom fields
            select.addEventListener('change', (e) => {
                if (e.target.value === 'custom') {
                    customFields.classList.remove('hidden');
                } else {
                    customFields.classList.add('hidden');
                }
            });
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
            });
        } else {
            // Handle simple items
            const fieldName = `${arrayName}[${itemIndex}]`;
            const itemField = this.createFormField(fieldName, itemSchema, false);
            itemField.classList.add('array-item-field');
            itemContainer.appendChild(itemField);
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
            localStorage.setItem('falai_saved_images', JSON.stringify(this.savedImages));
            
            // Update inline gallery if currently visible
            const inlineGallery = document.getElementById('inline-gallery');
            if (inlineGallery && !inlineGallery.classList.contains('hidden')) {
                this.showInlineGallery();
            }
        }
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
    
    deleteImageFromGallery(index) {
        if (!confirm('Are you sure you want to delete this image?')) {
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
    
    showGenerationStatus(message) {
        document.getElementById('status-content').innerHTML = `<div>${message}</div>`;
        document.getElementById('generation-status').classList.remove('hidden');
    }
    
    hideGenerationStatus() {
        document.getElementById('generation-status').classList.add('hidden');
        this.currentRequestId = null;
    }
    
    showError(message) {
        alert(message); // Simple error display - could be improved
        this.hideGenerationStatus();
    }
    
    hideResults() {
        document.getElementById('results').classList.add('hidden');
    }
    
    saveEndpointSettings() {
        if (!this.currentEndpoint) return;
        
        const formData = this.collectFormData();
        this.endpointSettings[this.currentEndpoint.metadata.endpointId] = formData;
        localStorage.setItem('falai_endpoint_settings', JSON.stringify(this.endpointSettings));
    }
    
    restoreEndpointSettings(endpointId) {
        const settings = this.endpointSettings[endpointId];
        if (!settings) return;
        
        const form = document.getElementById('generation-form');
        
        for (const [key, value] of Object.entries(settings)) {
            const input = form.querySelector(`[name="${key}"]`);
            if (!input) continue;
            
            if (input.type === 'checkbox') {
                input.checked = Boolean(value);
            } else if (input.type === 'range') {
                input.value = value;
                // Update slider value display
                const valueDisplay = input.parentElement.querySelector('.slider-value');
                if (valueDisplay) {
                    valueDisplay.textContent = value;
                }
            } else {
                input.value = value;
            }
        }
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
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const falai = new FalAI();
    console.log('FalAI initialized');
});