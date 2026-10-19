import { onMounted, ref } from 'vue';

export type AppTheme = 'light' | 'dark';

const theme = ref<AppTheme>('dark');

function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.style.colorScheme = theme.value;
}

export function setTheme(nextTheme: AppTheme) {
  theme.value = nextTheme;
  applyTheme();
}

export function useTheme() {
  onMounted(applyTheme);

  return { theme, setTheme };
}
