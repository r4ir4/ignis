import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        ignis: {
          background: { value: '#1f2228' },
          ink: { value: '#f1f0f4' },
          muted: { value: '#b2b7c7' },
          selection: { value: '#2b3347' },
          accent: { value: '#ee91ae' },
        },
      },
      fonts: {
        heading: { value: '"Avenir Next", Avenir, system-ui, sans-serif' },
        body: { value: '"Avenir Next", Avenir, system-ui, sans-serif' },
      },
    },
  },
  globalCss: {
    html: { bg: 'ignis.background', color: 'ignis.ink', colorScheme: 'dark' },
    body: { margin: 0, minHeight: '100svh' },
    '::selection': { bg: 'ignis.selection', color: 'ignis.ink' },
  },
})

export const system = createSystem(defaultConfig, config)
