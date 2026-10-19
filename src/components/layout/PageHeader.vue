<script setup lang="ts">

import { computed } from 'vue';
import { useI18n } from '@/i18n/i18n';
import type { SupportedLocale } from '@/i18n/i18n';
import { useTheme } from '@/composables/useTheme';
import type { AppTheme } from '@/composables/useTheme';

import sunIcon from '@/assets/icons/sun.svg?no-inline';
import globeIcon from '@/assets/icons/globe.svg?no-inline';
import chevronIcon from '@/assets/icons/down.svg?no-inline';

const { t, locale, setLocale } = useI18n();
const { theme, setTheme } = useTheme();

const selectedLocale = computed<SupportedLocale>({
  get: () => locale.value,
  set: setLocale,
});

const selectedTheme = computed<AppTheme>({
  get: () => theme.value,
  set: setTheme,
});

</script>

<template>
  <header class="page_header" data-testid="page_header">
    <!-- Theme selector -->
    <div class="header_control">
      <span
        class="icon control_icon"
        :style="{ '--icon_url': `url(${sunIcon})` }"
        aria-hidden="true"
      ></span>
      <select id="theme" v-model="selectedTheme" :aria-label="t('theme')" :title="t('theme')">
        <option value="dark">{{ t('dark') }}</option>
        <option value="light">{{ t('light') }}</option>
      </select>
      <span
        class="icon control_chevron"
        :style="{ '--icon_url': `url(${chevronIcon})` }"
        aria-hidden="true"
      ></span>
    </div>

    <!-- Language selector -->
    <div class="header_control">
      <span
        class="icon control_icon"
        :style="{ '--icon_url': `url(${globeIcon})` }"
        aria-hidden="true"
      ></span>
      <select
        id="language"
        v-model="selectedLocale"
        :aria-label="t('language')"
        :title="t('language')"
      >
        <option value="it">{{ t('italian') }}</option>
        <option value="en">{{ t('english') }}</option>
      </select>
      <span
        class="icon control_chevron"
        :style="{ '--icon_url': `url(${chevronIcon})` }"
        aria-hidden="true"
      ></span>
    </div>
  </header>
</template>

<style scoped lang="scss">

.page_header {
  @extend %fx_base;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: $space_2;
  padding-top: $space_2;
  flex-shrink: 0;
}

.header_control {
  @extend %fx_base;
  position: relative;
}

.control_icon,
.control_chevron {
  position: absolute;
  color: var(--muted);
  pointer-events: none;
}

.control_icon {
  @include square(18px);
  left: $space_3;
}

.control_chevron {
  @include square(14px);
  right: $space_2;
}

select {
  appearance: none;
  -webkit-appearance: none;
  min-width: 118px;
  min-height: 38px;
  padding: $space_2 $space_8 $space_2 38px;
  font-size: $font_control;
  font-weight: 500;
  border-radius: $radius_medium;
  background: var(--surface);

  &:hover {
    background: var(--surface-soft);
    border-color: var(--accent-border);
  }
}

.header_control:focus-within .control_icon {
  color: var(--accent);
}

@include compact {
  .page_header {
    padding: 0;
  }
}

</style>
