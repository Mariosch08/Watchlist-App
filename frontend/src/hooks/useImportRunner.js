import { useSyncExternalStore } from 'react';
import { getImportState, subscribeImport } from '../lib/importRunner.js';

export function useImportRunner() {
  return useSyncExternalStore(subscribeImport, getImportState, getImportState);
}
