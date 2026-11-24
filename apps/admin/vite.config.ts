import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fixed address so Supabase sign-in and reset links (Site URL http://localhost:5173) always land here.
  // 127.0.0.1 rather than "localhost", which on some Windows setups listens on IPv6 only.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
})
