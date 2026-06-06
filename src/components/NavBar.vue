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
        <span class="logo-text">SmartStock</span>
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
          <span class="nav-link-icon">{{ item.icon }}</span>
          <span class="nav-link-label">{{ item.label }}</span>
        </router-link>
      </div>
    </div>

    <!-- Bottom border glow -->
    <div class="navbar-border-glow"></div>
  </nav>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const linksRef = ref(null)
const linkEls = ref([])

const hoveredIndex = ref(-1)
const pillLeft = ref(0)
const pillWidth = ref(0)
const pillOpacity = ref(0)

const navItems = [
  { path: '/', icon: '📊', label: 'Dashboard' },
  { path: '/watchlist', icon: '⭐', label: 'Watchlist' },
  { path: '/stock-analysis', icon: '📈', label: '个股分析' },
  { path: '/analysis', icon: '🧭', label: 'Analysis' },
  { path: '/screener', icon: '🔍', label: 'Screener' },
  { path: '/position', icon: '📐', label: 'Position' },
  { path: '/journal', icon: '📓', label: 'Journal' },
  { path: '/guide', icon: '📖', label: 'Guide' }
]

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
  font-size: 14px;
  line-height: 1;
  transition: transform 0.25s ease;
}

.navbar-link:hover {
  color: var(--text-primary);
}

.navbar-link:hover .nav-link-icon {
  transform: scale(1.15);
}

.navbar-link:active {
  transform: scale(0.97);
}

/* Active state — text glow effect */
.navbar-link.active {
  color: #ffffff;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.2);
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
    font-size: 17px;
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
