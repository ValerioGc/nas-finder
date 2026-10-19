<script setup lang="ts">

import { useI18n } from '@/i18n/i18n';
import type { MessageKey } from '@/i18n/i18n';
import { ref } from 'vue';
import CommonModal from '@/components/common/CommonModal.vue';
import { deviceUrl } from '@/services/finder';
import type { NasDevice } from '@/types';

import serverIcon from '@/assets/icons/server.svg?no-inline';
import externalIcon from '@/assets/icons/link.svg?no-inline';
import deleteIcon from '@/assets/icons/delete.svg?no-inline';

const { t } = useI18n();

interface Props {
  devices: NasDevice[];
  busy: boolean;
  mode: 'saved' | 'search';
}

defineProps<Props>();

const emit = defineEmits<{
  open: [id: string];
  save: [id: string];
  forget: [id: string];
  confirm: [id: string, expectedUrl: string];
}>();

const headers: MessageKey[] = ['name', 'address', 'status', 'actions'];
const pendingConfirmation = ref<NasDevice | null>(null);

function confirmConnection() {
  if (pendingConfirmation.value) {
    emit('confirm', pendingConfirmation.value.id, deviceUrl(pendingConfirmation.value));
    pendingConfirmation.value = null;
  }
}

</script>

<template>
  <div
    class="table_scroll"
    :class="{ saved_table: mode === 'saved', search_table: mode === 'search' }"
  >
    <table>
      <thead>
        <tr>
          <th v-for="(header, index) in headers" :key="index" scope="col">
            {{ t(header) }}
          </th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="device in devices" :key="device.id" data-testid="nas_row">
          <!-- Device name column -->
          <td class="device_name">
            <span class="device_symbol">
              <span
                class="icon"
                :style="{ '--icon_url': `url(${serverIcon})` }"
                aria-hidden="true"
              ></span>
            </span>
            {{ device.name }}
          </td>

          <!-- Device address column -->
          <td>
            <span class="address_text">{{ device.address }}</span>
            <small>{{ deviceUrl(device) }}</small>
          </td>

          <!-- Device status column -->
          <td>
            <span
              class="status_badge"
              :class="{
                status_ready: device.online && device.configured && !device.previousEndpoint,
                status_setup: device.online && (!device.configured || !!device.previousEndpoint),
              }"
            >
              {{
                !device.online
                  ? t('offline')
                  : device.previousEndpoint
                    ? t('endpointChanged')
                    : device.configured
                      ? t('configured')
                      : t('setupRequired')
              }}
            </span>
          </td>

          <!-- Actions column -->
          <td>
            <div class="row_actions">
              <a
                class="icon_button"
                role="link"
                :href="
                  device.online && !busy && !device.previousEndpoint ? deviceUrl(device) : undefined
                "
                :aria-disabled="!device.online || busy || !!device.previousEndpoint"
                :aria-label="device.configured ? t('openPage') : t('configure')"
                :title="device.configured ? t('openPage') : t('configure')"
                :tabindex="device.online && !busy && !device.previousEndpoint ? 0 : -1"
                @click.prevent="
                  device.online && !busy && !device.previousEndpoint && emit('open', device.id)
                "
              >
                <span
                  class="icon"
                  :style="{ '--icon_url': `url(${externalIcon})` }"
                  aria-hidden="true"
                ></span>
              </a>
              <button
                v-if="device.online && device.previousEndpoint"
                class="save_button"
                :disabled="busy"
                @click="pendingConfirmation = { ...device }"
              >
                {{ t('confirmEndpoint') }}
              </button>
              <button
                v-if="mode === 'saved'"
                class="icon_button"
                :disabled="busy"
                :aria-label="`${t('forgetNas')} ${device.name}`"
                :title="`${t('forgetNas')} ${device.name}`"
                @click="emit('forget', device.id)"
              >
                <span
                  class="icon"
                  :style="{ '--icon_url': `url(${deleteIcon})` }"
                  aria-hidden="true"
                ></span>
              </button>
              <button
                v-else-if="!device.saved"
                class="save_button"
                :disabled="busy"
                @click="emit('save', device.id)"
              >
                {{ t('saveNas') }}
              </button>

              <span v-else class="saved_label">{{ t('saved') }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <CommonModal
      v-if="pendingConfirmation"
      :title="t('confirmEndpointTitle')"
      @close="pendingConfirmation = null"
    >
      <strong>{{ pendingConfirmation.name }}</strong>
      <p class="body_copy">{{ t('confirmEndpointDescription') }}</p>
      <dl class="endpoint_details">
        <dt>{{ t('previousEndpoint') }}</dt>
        <dd>{{ pendingConfirmation.previousEndpoint }}</dd>
        <dt>{{ t('newEndpoint') }}</dt>
        <dd>{{ deviceUrl(pendingConfirmation) }}</dd>
      </dl>
      <div class="confirmation_actions">
        <button class="secondary_button" @click="pendingConfirmation = null">
          {{ t('close') }}
        </button>
        <button class="primary_button" :disabled="busy" @click="confirmConnection">
          {{ t('confirmEndpoint') }}
        </button>
      </div>
    </CommonModal>
  </div>
</template>

<style scoped lang="scss">

.table_scroll {
  @include surface($background: null);
  overflow: auto;
}

.saved_table {
  border: 0;
  border-radius: 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  background: var(--surface);

  th {
    @extend %muted_label;
    padding: $space_3 $space_4;
    font-weight: 500;
    background: var(--surface-soft);
  }

  td {
    padding: $space_4;
    border-top: $border_width solid var(--border);
    vertical-align: middle;
  }
}

.device_name {
  font-weight: 600;
  white-space: nowrap;
}

.device_symbol {
  @extend %selected_control;
  display: inline-grid;
  place-items: center;
  @include square($control_size);
  margin-right: $space_2;
  border-radius: $radius_small;
}

.address_text {
  font-variant-numeric: tabular-nums;
}

small {
  display: block;
  color: var(--muted);
  margin-top: $space_1;
  white-space: nowrap;
}

.status_badge {
  @extend %muted_label;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px $space_2;
  border-radius: $radius_small;
  background: var(--surface-soft);
  white-space: nowrap;

  &::before {
    @include square(6px);
    content: '';
    background: currentColor;
    border-radius: $radius_round;
  }
}

.status_ready {
  color: var(--success);
  background: var(--success-soft);
}

.status_setup {
  color: var(--warning);
  background: var(--warning-soft);
}

.row_actions {
  @extend %fx_base;
  gap: $space_3;
  flex-wrap: wrap;
}

.search_table .row_actions {
  gap: $space_1;
}

.search_table .saved_label {
  @extend %fx_base;
  min-height: 30px;
}

a {
  color: var(--accent);
}

a:not([aria-disabled='true']):hover {
  background: var(--surface-hover);
}

a[aria-disabled='true'] {
  color: var(--muted);
  cursor: default;
}

table button {
  @extend %muted_label;
}

.save_button {
  @extend %selected_control;
  padding: $space_2 $space_3;
}

.saved_label {
  @extend %muted_label;
}

.endpoint_details {
  @extend %stack;
  gap: $space_2;
  margin-top: $space_4;

  dt {
    @extend %muted_label;
  }

  dd {
    overflow-wrap: anywhere;
  }
}

.confirmation_actions {
  @extend %fx_row;
  justify-content: flex-end;
  gap: $space_2;
  margin-top: $space_5;
}

</style>
