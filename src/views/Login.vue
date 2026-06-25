<template>
  <div class="login-page">
    <div class="login-bg-glow"></div>

    <div class="login-card">
      <div class="login-header">
        <div class="login-logo">
          <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
            <path d="M2 16L7 8L11 12L18 4" stroke="url(#loginGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="loginGrad" x1="2" y1="16" x2="18" y2="4" gradientUnits="userSpaceOnUse">
                <stop stop-color="#0071e3"/>
                <stop offset="1" stop-color="#2997ff"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 class="login-title">Ultimate Trading System</h1>
        <p class="login-subtitle">登录以继续</p>
      </div>

      <form class="login-form" @submit.prevent="onSubmit">
        <div class="form-field">
          <label class="field-label">用户名</label>
          <input
            v-model.trim="username"
            type="text"
            class="field-input"
            placeholder="请输入用户名"
            autocomplete="username"
            :disabled="loading"
          />
        </div>

        <div class="form-field">
          <label class="field-label">密码</label>
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            class="field-input"
            placeholder="请输入密码"
            autocomplete="current-password"
            :disabled="loading"
          />
          <button
            type="button"
            class="toggle-pwd"
            @click="showPassword = !showPassword"
            tabindex="-1"
          >
            {{ showPassword ? '隐藏' : '显示' }}
          </button>
        </div>

        <transition name="fade">
          <div v-if="error" class="form-error">{{ error }}</div>
        </transition>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? '登录中…' : '登 录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

async function onSubmit() {
  error.value = ''
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  // 模拟短暂延迟，避免过快闪烁
  await nextTick()
  setTimeout(() => {
    const res = auth.login(username.value, password.value)
    loading.value = false
    if (!res.ok) {
      error.value = res.error
      return
    }
    const redirect = route.query.redirect || '/'
    router.replace(redirect)
  }, 200)
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: radial-gradient(
    ellipse at top,
    rgba(0, 113, 227, 0.08) 0%,
    transparent 50%
  ), var(--bg-primary);
  overflow: hidden;
}

.login-bg-glow {
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  width: 600px;
  height: 600px;
  background: radial-gradient(
    circle,
    rgba(0, 113, 227, 0.12) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}

.login-card {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  padding: 40px 32px 32px;
  background: linear-gradient(
    180deg,
    rgba(30, 41, 59, 0.9) 0%,
    rgba(15, 23, 42, 0.92) 100%
  );
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.login-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(0, 113, 227, 0.12);
  border: 1px solid rgba(0, 113, 227, 0.2);
  margin-bottom: 14px;
}

.login-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.login-subtitle {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.field-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 14px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.field-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(91, 156, 245, 0.12);
}

.field-input::placeholder {
  color: var(--text-muted);
}

.field-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 覆盖浏览器自动填充的白色背景 */
.field-input:-webkit-autofill,
.field-input:-webkit-autofill:hover,
.field-input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text-primary);
  -webkit-box-shadow: 0 0 0 1000px var(--bg-primary) inset;
  caret-color: var(--text-primary);
  transition: background-color 5000s ease-in-out 0s;
}

.toggle-pwd {
  position: absolute;
  right: 8px;
  bottom: 7px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  transition: color 0.2s;
}

.toggle-pwd:hover {
  color: var(--text-secondary);
}

.form-error {
  padding: 8px 12px;
  background: var(--red-dim);
  border: 1px solid rgba(255, 69, 58, 0.2);
  border-radius: var(--radius-sm);
  color: var(--red);
  font-size: 12px;
}

.login-btn {
  margin-top: 4px;
  padding: 11px 16px;
  background: linear-gradient(135deg, #0071e3 0%, #2997ff 100%);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
}

.login-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(0, 113, 227, 0.3);
}

.login-btn:active:not(:disabled) {
  transform: translateY(0);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 480px) {
  .login-card {
    padding: 32px 22px 24px;
  }
}
</style>
