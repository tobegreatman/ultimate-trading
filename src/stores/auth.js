import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loadJson, saveJson } from '../utils/storage.js'

const AUTH_KEY = 'auth_user'

// 默认账号配置
const DEFAULT_USERS = [
  { username: 'admin', password: '123' }
]

export const useAuthStore = defineStore('auth', () => {
  const user = ref(loadJson(AUTH_KEY, null))

  const isAuthenticated = computed(() => !!user.value)

  /**
   * 登录校验
   * @returns {{ ok: boolean, error?: string }}
   */
  function login(username, password) {
    const matched = DEFAULT_USERS.find(
      u => u.username === username && u.password === password
    )
    if (!matched) {
      return { ok: false, error: '用户名或密码错误' }
    }
    user.value = { username: matched.username }
    saveJson(AUTH_KEY, user.value)
    return { ok: true }
  }

  function logout() {
    user.value = null
    saveJson(AUTH_KEY, null)
  }

  return { user, isAuthenticated, login, logout }
})
