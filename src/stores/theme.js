import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadJson, saveJson } from '../utils/storage.js'

const THEME_KEY = 'theme_mode'
const VALID_MODES = ['default', 'starship']

function applyMode(mode) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', mode)
  }
}

export const useThemeStore = defineStore('theme', () => {
  const stored = loadJson(THEME_KEY, 'default')
  const mode = ref(VALID_MODES.includes(stored) ? stored : 'default')

  // 同步到 <html data-theme="...">，确保与首屏内联脚本保持一致
  applyMode(mode.value)

  const isStarship = computed(() => mode.value === 'starship')

  function setMode(next) {
    if (!VALID_MODES.includes(next)) return
    mode.value = next
    applyMode(next)
    saveJson(THEME_KEY, next)
  }

  function toggle() {
    setMode(mode.value === 'starship' ? 'default' : 'starship')
  }

  return { mode, isStarship, setMode, toggle }
})
