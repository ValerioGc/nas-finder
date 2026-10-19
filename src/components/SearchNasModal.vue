<script setup lang="ts">

import { ref } from 'vue';
import { useI18n } from '@/i18n/i18n';
import type { FinderError, NasDevice } from '@/types';

import CommonSpinner from '@/components/common/CommonSpinner.vue';
import CommonModal from '@/components/common/CommonModal.vue';
import CommonTable from '@/components/common/CommonTable.vue';

import searchIcon from '@/assets/icons/search.svg?no-inline';
import serverIcon from '@/assets/icons/server.svg?no-inline';
import networkIcon from '@/assets/icons/network.svg?no-inline';

interface Props {
  devices: NasDevice[];
  busy: boolean;
  blocked?: boolean;
  error: FinderError | null;
  scanned: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  search: [target: string];
  save: [id: string];
  open: [id: string];
  confirm: [id: string, expectedUrl: string];
}>();

const target = ref('');

const { t, errorText } = useI18n();

function submit() {
  if (!props.busy && !props.blocked) {
    emit('search', target.value);
  }
}

</script>

<template>
  <CommonModal :title="t('searchTitle')" @close="emit('close')">
    <p class="body_copy description">{{ t('searchDescription') }}</p>

    <!-- Manual NAS address input -->
    <form @submit.prevent="submit">
      <label for="nas_address">
        {{ t('manualAddress') }}
        <span>{{ t('optional') }}</span>
      </label>
      <div class="search_controls">
        <input
          id="nas_address"
          v-model="target"
          inputmode="decimal"
          autocomplete="off"
          autofocus
          placeholder="192.168.1.10"
          :disabled="busy || blocked"
          aria-describedby="address_hint"
        />
        <button class="primary_button" :disabled="busy || blocked" type="submit">
          <span
            class="icon"
            :style="{ '--icon_url': `url(${searchIcon})` }"
            aria-hidden="true"
          ></span>
          {{ t('searchNas') }}
        </button>
      </div>

      <p id="address_hint" class="hint">{{ t('manualHint') }}</p>
    </form>

    <!-- Error message -->
    <p v-if="error" class="error_message" role="alert">{{ errorText(error) }}</p>

    <section class="results" :aria-busy="busy" :aria-label="t('resultsTitle')">
      <!-- Search in progress -->
      <output v-if="busy" class="empty_state search_progress">
        <CommonSpinner />
        <span>{{ t('searching') }}</span>
      </output>

      <!-- Results section -->
      <template v-else-if="devices.length">
        <div class="results_header">
          <h3>{{ t('resultsTitle') }}</h3>
          <span class="results_count">{{ devices.length }}</span>
        </div>

        <CommonTable
          :devices="devices"
          :busy="blocked ?? busy"
          mode="search"
          @save="emit('save', $event)"
          @open="emit('open', $event)"
          @confirm="(id, url) => emit('confirm', id, url)"
        />
      </template>

      <!-- Empty results -->
      <div v-else-if="!error" class="empty_state empty_results">
        <span
          class="icon"
          :style="{ '--icon_url': `url(${scanned ? serverIcon : networkIcon})` }"
          aria-hidden="true"
        ></span>
        <h3>{{ scanned ? t('noResults') : t('searchIdleTitle') }}</h3>
        <p class="hint">{{ scanned ? t('noResultsDescription') : t('searchIdleDescription') }}</p>
      </div>
    </section>
  </CommonModal>
</template>

<style scoped lang="scss">

.description {
  margin-bottom: $space_6;
}

form {
  @include surface($background: var(--surface-soft));
  padding: $space_5;
}

label {
  @extend %fx_base;
  gap: $space_2;
  margin-bottom: $space_3;
  font-weight: 600;
  font-size: $font_small;

  span {
    color: var(--muted);
    font-weight: 400;
  }
}

.search_controls {
  @extend %fx_row;
  gap: $space_2;
}

input {
  flex: 1;
  min-width: 0;
  width: 100%;
  background: var(--surface);
  font-variant-numeric: tabular-nums;
}

form .hint {
  margin-top: $space_3;
}

.results {
  margin-top: $space_6;

  &_count {
    @extend %muted_label;
  }

  &_header {
    @extend %fx_base;
    gap: $space_2;
    margin-bottom: $space_3;
  }
}

h3 {
  font-size: $font_body;
  font-weight: 600;
}

.empty_results,
.search_progress {
  min-height: 164px;
  padding: $space_6 $space_4;
}

.empty_results > .icon {
  @include square(28px);
  color: var(--muted);
  margin-bottom: $space_1;
}

.empty_results p {
  max-width: 400px;
}

.search_progress {
  color: var(--muted);
}

.error_message {
  margin-top: $space_4;
  margin-bottom: 0;
}

@media (max-width: 480px) {
  .search_controls {
    flex-direction: column;
  }
}

@media (max-height: 540px) {
  .description {
    margin-bottom: $space_4;
  }

  form {
    padding: $space_4;
  }

  .results {
    margin-top: $space_4;
  }

  .empty_results,
  .search_progress {
    min-height: 100px;
    padding: $space_3;
    gap: $space_2;
  }

  .empty_results > .icon {
    display: none;
  }
}

</style>
