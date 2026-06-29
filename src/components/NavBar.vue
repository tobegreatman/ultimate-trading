<template>
  <nav class="navbar">
    <!-- Subtle top highlight line -->
    <div class="navbar-shine"></div>
    <!-- Background noise texture overlay -->
    <div class="navbar-noise"></div>

    <div class="navbar-inner">
      <router-link to="/" class="navbar-logo">
        <span class="logo-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 16L7 8L11 12L18 4" stroke="url(#logoGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="logoGrad" x1="2" y1="16" x2="18" y2="4" gradientUnits="userSpaceOnUse">
                <stop stop-color="#0071e3"/>
                <stop offset="1" stop-color="#2997ff"/>
              </linearGradient>
            </defs>
          </svg>
        </span>
        <span class="logo-text">Ultimate Trading System</span>
        <span class="logo-dot"></span>
      </router-link>

      <div class="navbar-divider"></div>

      <div class="navbar-links" ref="linksRef">
        <!-- Sliding pill indicator -->
        <div
          class="nav-pill"
          :style="pillStyle"
        ></div>

        <router-link
          v-for="(item, index) in navItems"
          :key="item.path"
          :to="item.path"
          class="navbar-link"
          :class="{ active: $route.path === item.path }"
          :ref="setLinkRef"
          @mouseenter="onLinkHover(index)"
          @mouseleave="onLinkLeave"
        >
          <span class="nav-link-icon" v-html="icons[item.icon]"></span>
          <span class="nav-link-label">{{ item.label }}</span>
        </router-link>
      </div>

      <div class="navbar-user">
        <button
          class="theme-toggle"
          :class="{ active: isStarship }"
          @click="toggleTheme"
          :title="isStarship ? '当前：Starship 主题（点击切回默认）' : '当前：默认主题（点击切换 Starship）'"
          aria-label="切换主题"
        >
          <span class="theme-toggle__icon" v-html="themeIcon"></span>
          <span class="theme-toggle__label">{{ isStarship ? 'Starship' : 'Default' }}</span>
        </button>
        <span class="user-avatar">{{ userInitial }}</span>
        <span class="user-name">{{ auth.user?.username }}</span>
        <button class="logout-btn" @click="onLogout" title="退出登录">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span class="logout-label">退出</span>
        </button>
      </div>
    </div>

    <!-- Bottom border glow -->
    <div class="navbar-border-glow"></div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'
import { useThemeStore } from '../stores/theme.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const theme = useThemeStore()

const isStarship = computed(() => theme.isStarship)

function toggleTheme() {
  theme.toggle()
}

// 主题图标：Starship 用火箭，默认用星形
const themeIcon = computed(() =>
  isStarship.value
    ? `<svg ${SVG_ATTRS}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`
    : `<svg ${SVG_ATTRS}><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/><path d="M19 3v4"/><path d="M21 5h-4"/></svg>`
)

const userInitial = computed(() => (auth.user?.username || '?').charAt(0).toUpperCase())

function onLogout() {
  auth.logout()
  router.replace({ name: 'Login' })
}
const linksRef = ref(null)
const linkEls = ref([])

const hoveredIndex = ref(-1)
const pillLeft = ref(0)
const pillWidth = ref(0)
const pillOpacity = ref(0)

const navItems = [
  { path: '/', icon: 'dashboard', label: 'Dashboard' },
  { path: '/stock-analysis', icon: 'stock', label: 'Stock Analysis' },
  { path: '/watchlist', icon: 'watchlist', label: 'Watchlist' },
  { path: '/analysis', icon: 'analysis', label: 'Analysis' },
  { path: '/screener', icon: 'screener', label: 'Screener' },
  { path: '/position', icon: 'position', label: 'Position' },
  { path: '/journal', icon: 'journal', label: 'Journal' },
  { path: '/guide', icon: 'guide', label: 'Guide' }
]

// Modern stroke-based SVG icons (Lucide-style) — replaces legacy emoji
const SVG_ATTRS = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
const icons = {
  dashboard: `<svg ${SVG_ATTRS}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
  stock: `<svg ${SVG_ATTRS}><path d="M3 17l5-5 3 3 7-7"/><path d="M14 8h6v6"/></svg>`,
  watchlist: `<svg ${SVG_ATTRS}><path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8l-5.8 3.1 1.1-6.5L2.6 9.8l6.5-.9z"/></svg>`,
  analysis: `<svg ${SVG_ATTRS}><path d="M3 12h3l3 8 4-16 3 8h5"/></svg>`,
  screener: `<svg ${SVG_ATTRS}><path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/><path d="M7 5v3"/><path d="M17 12v3"/><path d="M12 19v2"/></svg>`,
  position: `<svg ${SVG_ATTRS}><path d="M12 2L3 7l9 5 9-5-9-5z"/><path d="M3 12l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>`,
  journal: `<svg ${SVG_ATTRS}><path d="M4 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 2v20"/><path d="M12 6h5"/><path d="M12 10h5"/></svg>`,
  guide: `<svg ${SVG_ATTRS}><path d="M2 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z"/><path d="M22 4h-6a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h7z"/></svg>`
}

const activeIndex = computed(() =>
  navItems.findIndex(item => item.path === route.path)
)

const pillStyle = computed(() => ({
  left: pillLeft.value + 'px',
  width: pillWidth.value + 'px',
  opacity: pillOpacity.value
}))

function setLinkRef(el) {
  if (el) {
    // router-link yields component instance, native element yields the element itself
    linkEls.value.push(el.$el || el)
  }
}

function measureLink(index) {
  const link = linkEls.value[index]
  const container = linksRef.value
  if (!link || !container) return
  const linkRect = link.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  pillLeft.value = linkRect.left - containerRect.left
  pillWidth.value = linkRect.width
}

function onLinkHover(index) {
  hoveredIndex.value = index
  measureLink(index)
  pillOpacity.value = 1
}

function onLinkLeave() {
  hoveredIndex.value = -1
  if (activeIndex.value >= 0) {
    measureLink(activeIndex.value)
  }
  pillOpacity.value = activeIndex.value >= 0 ? 1 : 0
}

function updatePill() {
  nextTick(() => {
    if (activeIndex.value >= 0) {
      measureLink(activeIndex.value)
      pillOpacity.value = 1
    } else {
      pillOpacity.value = 0
    }
  })
}

onMounted(() => {
  // Delay slightly to ensure all router-link refs are resolved
  setTimeout(updatePill, 50)
})
watch(() => route.path, () => {
  nextTick(updatePill)
})
</script>

<style scoped>
/* ─── Navbar Shell ─── */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 56px;
  z-index: 100;
  /* Deep frosted glass */
  background: linear-gradient(
    180deg,
    rgba(15, 23, 42, 0.92) 0%,
    rgba(30, 41, 59, 0.88) 100%
  );
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
}

/* Subtle top shine — simulates light hitting the glass edge */
.navbar-shine {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.06) 20%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0.06) 80%,
    transparent 100%
  );
  z-index: 1;
}

/* Noise texture for material depth */
.navbar-noise {
  position: absolute;
  inset: 0;
  opacity: 0.018;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 128px 128px;
  pointer-events: none;
  z-index: 1;
}

/* Animated bottom border glow */
.navbar-border-glow {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--accent-dim) 30%,
    rgba(0, 113, 227, 0.25) 50%,
    var(--accent-dim) 70%,
    transparent
  );
  z-index: 1;
}

/* ─── Inner Container ─── */
.navbar-inner {
  position: relative;
  max-width: 1440px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 0;
  z-index: 2;
}

/* ─── Logo ─── */
.navbar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  text-decoration: none;
  position: relative;
  padding: 4px 0;
}

.logo-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(0, 113, 227, 0.1);
  border: 1px solid rgba(0, 113, 227, 0.15);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.navbar-logo:hover .logo-icon {
  background: rgba(0, 113, 227, 0.18);
  border-color: rgba(0, 113, 227, 0.3);
  box-shadow: 0 0 12px rgba(0, 113, 227, 0.15);
  transform: translateY(-1px);
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  transition: all 0.3s ease;
}

.navbar-logo:hover .logo-text {
  background: linear-gradient(135deg, #ffffff 0%, #c8d6e5 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

/* Decorative pulse dot */
.logo-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px rgba(0, 113, 227, 0.6);
  animation: pulse-dot 2.4s ease-in-out infinite;
  margin-left: -4px;
  margin-top: -10px;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.7); }
}

/* ─── Divider ─── */
.navbar-divider {
  width: 1px;
  height: 20px;
  background: linear-gradient(
    180deg,
    transparent,
    rgba(255, 255, 255, 0.1) 50%,
    transparent
  );
  margin: 0 20px;
  flex-shrink: 0;
}

/* ─── Nav Links Container ─── */
.navbar-links {
  position: relative;
  display: flex;
  gap: 2px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 4px;
}

.navbar-links::-webkit-scrollbar {
  display: none;
}

/* ─── Sliding Pill Indicator ─── */
.nav-pill {
  position: absolute;
  top: 4px;
  height: calc(100% - 8px);
  border-radius: 8px;
  background: rgba(0, 113, 227, 0.28);
  border: 1px solid rgba(0, 113, 227, 0.2);
  box-shadow: 0 0 12px rgba(0, 113, 227, 0.12);
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 0;
}

/* When hovering a non-active item, use a subtler pill */
.navbar-links:hover .nav-pill {
  background: rgba(0, 113, 227, 0.18);
  border-color: rgba(0, 113, 227, 0.12);
}

/* ─── Individual Link ─── */
.navbar-link {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: none;
  transition:
    color 0.25s ease,
    transform 0.2s ease;
  white-space: nowrap;
  user-select: none;
}

.nav-link-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  line-height: 1;
  color: var(--text-muted);
  transition: transform 0.25s ease, color 0.25s ease;
}

.nav-link-icon :deep(svg) {
  display: block;
  width: 16px;
  height: 16px;
}

.navbar-link:hover {
  color: var(--text-primary);
}

.navbar-link:hover .nav-link-icon {
  transform: scale(1.12);
  color: var(--text-primary);
}

.navbar-link:active {
  transform: scale(0.97);
}

/* Active state — text glow effect */
.navbar-link.active {
  color: #ffffff;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.2);
}

.navbar-link.active .nav-link-icon {
  color: var(--accent);
}

/* ─── User Section ─── */
.navbar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
  padding-left: 16px;
  flex-shrink: 0;
}

.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, #0071e3 0%, #2997ff 100%);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 0 10px rgba(0, 113, 227, 0.25);
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
}

.logout-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  transition: all 0.2s ease;
}

.logout-btn:hover {
  background: var(--red-dim);
  border-color: rgba(255, 69, 58, 0.3);
  color: var(--red);
}

/* ─── Theme Toggle ─── */
.theme-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  transition: all 0.2s ease;
}

.theme-toggle__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  line-height: 1;
}

.theme-toggle__icon :deep(svg) {
  display: block;
  width: 14px;
  height: 14px;
}

.theme-toggle:hover {
  color: var(--text-secondary);
  border-color: rgba(255, 255, 255, 0.16);
}

.theme-toggle:active {
  transform: scale(0.96);
}

/* Starship 激活态：青色辉光 */
.theme-toggle.active {
  color: var(--accent);
  border-color: rgba(34, 211, 238, 0.4);
  background: var(--accent-dim);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.18);
}

/* ─── Responsive ─── */
@media (max-width: 768px) {
  .navbar-inner {
    padding: 0 14px;
  }

  .navbar-divider {
    margin: 0 12px;
  }

  .nav-link-label {
    display: none;
  }

  .nav-link-icon {
    width: 18px;
    height: 18px;
  }

  .nav-link-icon :deep(svg) {
    width: 18px;
    height: 18px;
  }

  .navbar-link {
    padding: 8px 12px;
  }

  .logo-text {
    display: none;
  }

  .logo-dot {
    display: none;
  }

  .navbar-divider {
    display: none;
  }

  .navbar-user {
    padding-left: 10px;
    gap: 8px;
  }

  .user-name {
    display: none;
  }

  .logout-label {
    display: none;
  }

  .theme-toggle__label {
    display: none;
  }
}

/* ─── Reduced motion preference ─── */
@media (prefers-reduced-motion: reduce) {
  .nav-pill,
  .navbar-link,
  .logo-icon,
  .nav-link-icon {
    transition: none !important;
  }
  .logo-dot {
    animation: none !important;
  }
}
</style>
