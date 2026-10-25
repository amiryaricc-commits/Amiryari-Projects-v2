<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d3b7edc4-d36c-4c45-bb02-900a91764189

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run with Docker

From the parent `Emkan` directory, build and start the production web image:

```bash
docker compose build farapay
docker compose up -d farapay
```

The production image serves the built static app on port `8090`. Source changes
require rebuilding the image. The development dependencies and source tree are
not mounted into the running web container.
