import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

// Core Domain Exports
export * from './core/types/network';
export * from './core/types/frame';
export * from './core/types/packet';
export * from './core/types/event';

export * from './core/utils/mac';
export * from './core/utils/ip';
export * from './core/utils/priority-queue';
export * from './core/utils/object-pool';

export * from './core/topology/interface';
export * from './core/topology/link';

export * from './core/devices/base-device';
export * from './core/devices/host';
export * from './core/devices/switch';
export * from './core/devices/router';

export * from './core/engine/virtual-clock';
export * from './core/engine/simulation-engine';

// Cisco IOS CLI Engine
export * from './core/cli/types';
export * from './core/cli/pager';
export * from './core/cli/command-tree';
export * from './core/cli/commands/common-handlers';
export * from './core/cli/commands/build-cli-trees';
export * from './core/cli/ios-cli';

// Web Worker Host & IPC Protocol
export * from './worker/protocol';
export * from './worker/simulation-worker';
export * from './worker/worker-client';

// UI Exports
export * from './ui/App';

// Browser SPA Entrypoint Mount
if (typeof document !== 'undefined') {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(<App />);
  }
}
