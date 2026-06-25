<template>
  <NavBar v-if="!isLoginPage" />
  <main class="main-content" :class="{ 'main-content--bare': isLoginPage }">
    <router-view />
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import NavBar from './components/NavBar.vue'

const route = useRoute()
const isLoginPage = computed(() => route.meta.public === true)
</script>
