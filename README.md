# FalAI - Universal AI Image Generation Client

FalAI is a comprehensive web-based client designed to interact with various `fal.ai` image generation APIs. It provides a unified, user-friendly interface to select different AI models, configure their parameters, generate images, and manage the results. It is built as a Progressive Web App (PWA) for a seamless, native-like experience.

## Features

*   **Dynamic Endpoint Discovery**: Automatically discovers and populates available AI models by scanning for OpenAPI schemas.
*   **Custom Endpoint Support**: Add your own `fal.ai`-compatible models by simply uploading their OpenAPI JSON schema.
*   **Dynamic UI Generation**: The user interface for model parameters is generated on-the-fly based on the selected model's OpenAPI schema.
*   **Rich Input Controls**: Includes advanced controls like sliders for numeric values, image uploads, and a canvas-based mask editor for inpainting tasks.
*   **Image Processing**: Features client-side image compression and resizing to match model requirements before API submission.
*   **Progressive Web App (PWA)**: Installable on desktop and mobile devices for offline access and a native app feel.
*   **Local Gallery**: Save your favorite generations directly in the browser's local storage for easy access.
*   **Results Viewer**: View generated images and the corresponding raw JSON output from the API.
*   **State Persistence**: Remembers your API key, last-used endpoint, and form settings between sessions.
*   **Settings Management**: Export all your settings and custom endpoints to a single JSON file, and import them into another browser.
*   **Debugging Tools**: An optional debug panel provides insight into API requests, responses, and application state.
*   **Responsive Design**: A clean, mobile-friendly interface that works across all screen sizes.

## Tech Stack

*   **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
*   **Backend (Development)**: Python 3 (`http.server`)
*   **API Specification**: OpenAPI (Swagger)
*   **Drawing/Canvas**: `fabric.js`
*   **Deployment**: GitHub Actions for GitHub Pages

## Project Structure

```
/
├───app.js              # Main application logic (client-side)
├───index.html          # Main HTML structure
├───styles.css          # All application styles
├───server.py           # Simple Python dev server for serving files and endpoint discovery
├───sw.js               # Service Worker for PWA functionality
├───manifest.json       # PWA configuration file
├───endpoints/          # Directory containing OpenAPI schemas for different models
└───README.md           # This file
```

## Getting Started

### Prerequisites

*   Python 3.x (for running the local development server)
*   A modern web browser (Chrome, Firefox, Safari, Edge)
*   A `fal.ai` API Key. You can get one from the [fal.ai website](https://fal.ai/).

### Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd falai-paw
    ```

2.  **Start the development server:**
    The server will host the static files and provide the `/endpoints` route for model discovery.
    ```bash
    python3 server.py
    ```
    The server will start on `http://localhost:8000`.

3.  **Configure the Application:**
    *   Open your browser and navigate to `http://localhost:8000`.
    *   Click the **"Set API Key"** button in the header.
    *   Enter your `fal.ai` API key and click **"Save"**. The key is stored securely in your browser's `localStorage`.

4.  **Generate an Image:**
    *   Select an AI model from the "Select Endpoint" dropdown.
    *   Fill in the parameters in the dynamically generated form.
    *   Click **"Generate"**. The results will appear on the right-hand panel.

## How It Works

### 1. Endpoint Discovery

On startup, the frontend sends a request to the local `/endpoints` path. The `server.py` script handles this by searching the `endpoints/` directory for all `openapi.json` files and returns a list of their paths. The frontend then fetches each schema to populate the endpoint dropdown.

### 2. Dynamic Form Generation

When you select an endpoint, `app.js` parses its OpenAPI schema. It reads the `requestBody` definition for the POST endpoint to identify all possible input parameters, their types (string, integer, boolean), constraints (min/max, enums), and default values. It then dynamically creates the appropriate HTML form fields (text inputs, sliders, dropdowns, etc.).

### 3. Image Generation

When you click "Generate", the application:
1.  Collects all data from the form.
2.  If any images were uploaded, they are compressed and converted to base64 data URLs.
3.  A POST request is sent to the `fal.ai` API endpoint.
4.  The app handles both synchronous responses (where the image is returned directly) and asynchronous responses by polling the `status_url` until the job is complete.
5.  The final results are displayed in the "Results" panel.
