import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { X, CornerDownLeft, HelpCircle } from 'lucide-react';
import { SimulationWorkerClient } from '../../worker/worker-client';

export interface ConsoleModalProps {
  deviceId: string;
  deviceName: string;
  client: SimulationWorkerClient;
  onClose: () => void;
}

export const ConsoleModal: React.FC<ConsoleModalProps> = ({
  deviceId,
  deviceName,
  client,
  onClose,
}) => {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const currentLineRef = useRef('');
  const promptRef = useRef(`${deviceName}>`);
  const [activePrompt, setActivePrompt] = useState(`${deviceName}>`);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 13,
      theme: {
        background: '#090d14',
        foreground: '#f0f6fc',
        cursor: '#38bdf8',
        selectionBackground: '#1e3a5f',
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalRef.current);
    fit.fit();

    xtermInstance.current = term;
    fitAddon.current = fit;

    // Welcome banner & prompt
    term.writeln(`--- Connected to ${deviceName} Cisco IOS Console ---`);
    term.writeln('Press RETURN to get started.\r\n');
    term.write(promptRef.current + ' ');

    // Handle terminal input
    term.onData((data) => {
      handleTermData(data);
    });

    // Wire worker CLI responses
    const prevCliOutput = client.onCliOutput;
    const prevCliTab = client.onCliTabReply;
    const prevCliHelp = client.onCliHelpReply;

    client.onCliOutput = (devId, output, prompt) => {
      if (devId === deviceId) {
        promptRef.current = prompt;
        setActivePrompt(prompt);
        if (output) {
          term.write(`\r\n${output.replace(/\n/g, '\r\n')}`);
        }
        term.write(`\r\n${prompt} `);
        currentLineRef.current = '';
      }
      prevCliOutput?.(devId, output, prompt);
    };

    client.onCliTabReply = (res) => {
      if (res.deviceId === deviceId) {
        if (!res.isAmbiguous && res.completedLine) {
          // Erase old input on line and replace with completed
          term.write('\r' + promptRef.current + ' ' + res.completedLine);
          currentLineRef.current = res.completedLine;
        } else if (res.candidates.length > 1) {
          term.write(`\r\n${res.candidates.join('  ')}\r\n${promptRef.current} ${currentLineRef.current}`);
        }
      }
      prevCliTab?.(res);
    };

    client.onCliHelpReply = (res) => {
      if (res.deviceId === deviceId) {
        term.write('\r\n');
        for (const item of res.items) {
          term.write(`  ${item.token.padEnd(20, ' ')} ${item.description}\r\n`);
        }
        term.write(`${promptRef.current} ${currentLineRef.current}`);
      }
      prevCliHelp?.(res);
    };

    const handleResize = () => fit.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      client.onCliOutput = prevCliOutput;
      client.onCliTabReply = prevCliTab;
      client.onCliHelpReply = prevCliHelp;
    };
  }, [deviceId, deviceName]);

  const handleTermData = (data: string) => {
    const term = xtermInstance.current;
    if (!term) return;

    if (data === '\r') {
      // Enter
      const line = currentLineRef.current;
      term.write('\r\n');
      if (line.trim().length > 0) {
        client.sendCliInput(deviceId, line);
      } else {
        term.write(`${promptRef.current} `);
      }
      currentLineRef.current = '';
    } else if (data === '\t') {
      // Tab
      client.sendCliTab(deviceId, currentLineRef.current);
    } else if (data === '?') {
      // Context Help
      client.sendCliHelp(deviceId, currentLineRef.current);
    } else if (data === '\u0003') {
      // Ctrl+C
      term.write('^C\r\n' + promptRef.current + ' ');
      currentLineRef.current = '';
    } else if (data === '\u007F' || data === '\b') {
      // Backspace
      if (currentLineRef.current.length > 0) {
        currentLineRef.current = currentLineRef.current.slice(0, -1);
        term.write('\b \b');
      }
    } else if (data >= ' ') {
      currentLineRef.current += data;
      term.write(data);
    }
  };

  const insertQuickKey = (key: string) => {
    const term = xtermInstance.current;
    if (!term) return;

    if (key === 'Enter') {
      handleTermData('\r');
    } else if (key === 'Tab') {
      handleTermData('\t');
    } else if (key === '?') {
      handleTermData('?');
    } else if (key === 'Ctrl+C') {
      handleTermData('\u0003');
    } else {
      currentLineRef.current += key;
      term.write(key);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        width: 'min(720px, calc(100vw - 48px))',
        height: '420px',
        backgroundColor: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--status-up)' }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
            {deviceName} — Cisco Console
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            [{activePrompt}]
          </span>
        </div>

        <button onClick={onClose} style={{ padding: '4px 6px', border: 'none', background: 'transparent' }}>
          <X size={16} />
        </button>
      </div>

      {/* Terminal Viewport */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          padding: 8,
          backgroundColor: '#090d14',
          overflow: 'hidden',
        }}
      />

      {/* Mobile Keyboard Accessory Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        <button onClick={() => insertQuickKey('Tab')} title="Autocomplete command">
          Tab
        </button>
        <button onClick={() => insertQuickKey('?')} title="Contextual Help">
          <HelpCircle size={13} />
          ?
        </button>
        <button onClick={() => insertQuickKey('Ctrl+C')} title="Interrupt">
          Ctrl+C
        </button>
        <button onClick={() => insertQuickKey('en\r')} title="Enable">
          en
        </button>
        <button onClick={() => insertQuickKey('conf t\r')} title="Configure Terminal">
          conf t
        </button>
        <button onClick={() => insertQuickKey('sh ip int br\r')} title="Show Interfaces">
          sh ip int br
        </button>
        <button onClick={() => insertQuickKey('exit\r')} title="Exit">
          exit
        </button>
        <button className="primary" onClick={() => insertQuickKey('Enter')} title="Send Line">
          <CornerDownLeft size={13} />
          Enter
        </button>
      </div>
    </div>
  );
};
