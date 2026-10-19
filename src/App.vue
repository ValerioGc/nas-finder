<script setup lang="ts">

import { onMounted, ref } from 'vue';
import { useFinder } from '@/composables/useFinder';
import { useI18n } from '@/i18n/i18n';
import networkIcon from '@/assets/icons/network.svg?no-inline';
import refreshIcon from '@/assets/icons/refresh.svg?no-inline';
import searchIcon from '@/assets/icons/search.svg?no-inline';
import serverIcon from '@/assets/icons/server.svg?no-inline';
import CommonSpinner from '@/components/common/CommonSpinner.vue';
import TitleBar from '@/components/TitleBar.vue';
import CommonTable from '@/components/common/CommonTable.vue';
import SearchNasModal from '@/components/SearchNasModal.vue';
import PageHeader from '@/components/layout/PageHeader.vue';

const { t, errorText } = useI18n();
const {
  saved,
  found,
  busy,
  refreshing,
  searching,
  pageError,
  searchError,
  scanned,
  searchScanned,
  initialize,
  refresh,
  search,
  save,
  forget,
  open,
  confirmEndpoint,
} = useFinder();
const showSearchModal = ref(false);
onMounted(() => {
  void initialize();
});

</script>

<template>
  <div class="app">
    <TitleBar />

    <main class="view" data-testid="main_view">
      <!-- Page introduction -->
      <div class="page_intro">
        <div class="intro_copy">
          <span class="eyebrow">
            <span
              class="icon"
              :style="{ '--icon_url': `url(${networkIcon})` }"
              aria-hidden="true"
            ></span>
            {{ t('networkLabel') }}
          </span>
          <h1>{{ t('appTitle') }}</h1>
          <p class="body_copy">{{ t('appDescription') }}</p>
        </div>

        <!-- Page header -->
        <PageHeader />
      </div>

      <!-- Devices panel -->
      <section class="devices_panel" aria-labelledby="saved_title" :aria-busy="refreshing">
        <!-- List header -->
        <div class="list_header">
          <div>
            <h2 id="saved_title">
              {{ t('savedTitle') }}
              <span class="count">{{ saved.length }}</span>
            </h2>
            <p class="body_copy">{{ t('savedDescription') }}</p>
          </div>

          <!-- List actions -->
          <div class="list_actions">
            <button class="secondary_button" :disabled="busy" @click="refresh()">
              <CommonSpinner v-if="refreshing" />
              <span
                v-else
                class="icon"
                :style="{ '--icon_url': `url(${refreshIcon})` }"
                aria-hidden="true"
              ></span>
              {{ t('refresh') }}
              <output v-if="refreshing" class="visually_hidden">
                {{ t('refreshing') }}
              </output>
            </button>
            <button class="primary_button" @click="showSearchModal = true">
              <span
                class="icon"
                :style="{ '--icon_url': `url(${searchIcon})` }"
                aria-hidden="true"
              ></span>
              {{ t('searchNas') }}
            </button>
          </div>
        </div>

        <!-- Error message -->
        <p v-if="pageError" class="error_message" role="alert">{{ errorText(pageError) }}</p>

        <!-- Saved devices table -->
        <CommonTable
          v-if="saved.length"
          :devices="saved"
          :busy="busy"
          mode="saved"
          @open="open"
          @forget="forget"
          @confirm="confirmEndpoint"
        />

        <!-- Empty state -->
        <div v-else class="empty_state">
          <div class="empty_symbol">
            <span
              class="icon"
              :style="{ '--icon_url': `url(${serverIcon})` }"
              aria-hidden="true"
            ></span>
          </div>
          <h3>{{ t('emptyTitle') }}</h3>
          <p class="body_copy">{{ t('emptyDescription') }}</p>

          <button class="secondary_button" @click="showSearchModal = true">
            <span
              class="icon"
              :style="{ '--icon_url': `url(${searchIcon})` }"
              aria-hidden="true"
            ></span>
            {{ t('searchNas') }}
          </button>
        </div>
      </section>

      <!-- Footer -->
      <footer>
        <span class="network_hint">
          <span
            class="icon"
            :style="{ '--icon_url': `url(${networkIcon})` }"
            aria-hidden="true"
          ></span>
          {{ t('localNetworkHint') }}
        </span>

        <!-- Found devices count -->
        <button v-if="scanned" class="found_count" @click="showSearchModal = true">
          {{ t('foundCount') }}
          <span>{{ found.length }}</span>
        </button>
      </footer>
    </main>

    <!-- Search NAS Modal -->
    <SearchNasModal
      v-if="showSearchModal"
      :devices="found"
      :busy="searching"
      :blocked="busy"
      :error="searchError"
      :scanned="searchScanned"
      @close="showSearchModal = false"
      @search="search"
      @save="save"
      @open="open($event, 'search')"
      @confirm="(id, url) => confirmEndpoint(id, url, 'search')"
    />
  </div>
</template>

<style scoped lang="scss">

.app {
  @extend %stack;
  flex: 1;
  min-height: 0;
}

.view {
  @extend %stack;
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin-inline: auto;
  min-height: 0;
  overflow: auto;
  padding: $space_8;
  gap: $space_6;
}

.page_intro {
  @extend %fx_between_center;
  align-items: flex-start;
  gap: $space_6;
  padding-block: $space_2 $space_4;
}

.intro_copy {
  max-width: 560px;
}

.eyebrow {
  @extend %fx_base;
  gap: $space_2;
  color: var(--accent);
  font-size: $font_small;
  font-weight: 600;
  margin-bottom: $space_3;
}

.eyebrow .icon,
.network_hint .icon {
  @include square(16px);
}

h1 {
  font-size: 30px;
  font-weight: 650;
  letter-spacing: -0.8px;
  margin-bottom: $space_2;
}

.devices_panel {
  @include surface($radius: $radius_large, $shadow: var(--panel-shadow));
  overflow: hidden;
  flex-shrink: 0;
}

.list_header {
  @extend %panel_header;
  flex-wrap: wrap;

  p {
    font-size: $font_small;
    margin-top: $space_1;
  }
}

h2 {
  @extend %fx_base;
  gap: $space_2;
  font-size: 16px;
  font-weight: 600;
}

.list_actions {
  @extend %fx_row;
  gap: $space_2;
}

.count {
  @extend %muted_label;
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  padding-inline: $space_2;
  font-weight: 500;
  border-radius: $radius_small;
  background: var(--surface-soft);
}

.error_message {
  margin: $space_4 $space_6;
}

.empty_state {
  padding: $space_12 $space_6;
  min-height: 320px;

  h3 {
    font-size: $font_title;
    font-weight: 600;
  }

  p {
    max-width: 390px;
  }

  button {
    margin-top: $space_2;
  }
}

.empty_symbol {
  @extend %selected_control;
  display: grid;
  place-items: center;
  @include square(56px);
  border: $border_width solid var(--accent-border);
  border-radius: 16px;
  margin-bottom: $space_2;
}

.empty_symbol .icon {
  @include square(28px);
}

footer {
  @extend %fx_between_center;
  @extend %muted_label;
  flex-wrap: wrap;
  gap: $space_3;
}

.network_hint {
  @extend %fx_base;
  gap: $space_2;
}

.found_count {
  @extend %fx_base;
  @include surface($radius: null);
  gap: $space_2;
  padding: $space_2 $space_3;

  span {
    color: var(--accent);
    font-weight: 600;
  }
}

@include compact {
  .view {
    padding: $space_5;
  }

  .page_intro {
    flex-wrap: wrap;
    gap: $space_4;
    padding-bottom: 0;
  }

  .list_header {
    padding: $space_4;
  }

  .empty_state {
    min-height: 260px;
    padding: $space_8 $space_5;
  }
}

</style>
