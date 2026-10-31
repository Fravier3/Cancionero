import {defineConfig} from 'vite';
export default defineConfig({base:'/Cancionero/',publicDir:'public',build:{outDir:'dist',emptyOutDir:true,sourcemap:false,minify:'esbuild',target:'es2020'}});
