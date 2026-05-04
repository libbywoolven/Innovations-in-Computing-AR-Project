import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    allowedHosts: true, // This tells Vite to allow any tunnel URL
    headers: {
      "Content-Security-Policy": "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:;"
    }
  }
});