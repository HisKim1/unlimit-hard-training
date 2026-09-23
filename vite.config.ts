import { defineConfig } from 'vite';

// Netlify Drop 배포: 도메인 최상위('/')에 올라가므로 base는 기본값 그대로 둔다.
export default defineConfig({
  server: { host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
