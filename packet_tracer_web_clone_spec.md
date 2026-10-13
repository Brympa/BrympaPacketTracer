# Cisco Packet Tracer Web SPA — Technical Specification & Architecture Document

Этот документ представляет собой нормативную спецификацию для создания легковесного веб-клона Cisco Packet Tracer в формате Single Page Application (SPA). Архитектура основана на открытых стандартах (RFC/IEEE), методологии Clean-Room и дискретно-событийной модели симуляции (Discrete Event Simulation).

---

## 1. Общие архитектурные принципы

- **Client-Side Only:** Вся симуляция, вычисления и сохранение топологий происходят в браузере (Web Worker + IndexedDB / LocalStorage).
- **Изоляция потоков (Thread Separation):**
  - **UI Thread:** Canvas/React Flow (рендер топологии, 60 FPS), xterm.js (терминал), реактивное состояние интерфейса.
  - **Worker Thread:** `SimulationEngine`, обработка сетевых пакетов, очереди событий (DES), таймеры aging ARP/CAM.
  - Взаимодействие через `postMessage` с бинарными/структурированными событиями (типизированный IPC).
- **Соблюдение Clean-Room:** Логика не копирует бинарники Cisco, а реализует спецификации RFC и эталонную модель поведения устройств.

---

## 2. Матрица поддерживаемых протоколов и спецификаций (RFC / IEEE)

| Уровень | Протокол / Стандарт | Ключевая спецификация | Минимально необходимый функционал (MVP) |
|---|---|---|---|
| **L1** | Physical Link | IEEE 802.3 Physical Layer | Статусы линка (`UP`/`DOWN`), duplex, bandwidth, propagation delay (Ethernet = 1ms, Serial = 10ms, Fiber = 0.5ms). |
| **L2** | Ethernet Framing | IEEE 802.3 / Ethernet II | Формирование кадра: `Dest MAC`, `Src MAC`, `EtherType` (`0x0806` ARP, `0x0800` IPv4), `Payload`, CRC/FCS validation. |
| **L2** | ARP | **RFC 826** | Таблица соответствия IP $\leftrightarrow$ MAC, трансляция ARP Request (`FF:FF:FF:FF:FF:FF`) и ARP Reply (Unicast), aging timeout (по умолчанию 300 сек). |
| **L2** | Transparent Bridging | IEEE 802.1D | Обучение MAC-адресам (CAM/MAC table), Unicast Forwarding, Broadcast/Unknown Flooding, aging timeout (по умолчанию 300 сек). |
| **L2** | VLAN & Trunking | IEEE 802.1Q | Тегирование кадров (VLAN ID 1–4094), режимы портов `access` (снятие тега при egress) и `trunk` (сохранение тега, Native VLAN). |
| **L3** | IPv4 | **RFC 791** | Валидация заголовка, Source/Dest IP, Protocol ID (1=ICMP, 6=TCP, 17=UDP), TTL декремент (drop при $\le 0$). |
| **L3** | ICMP | **RFC 792** | Обработка типов: Type 8 Code 0 (`Echo Request`), Type 0 Code 0 (`Echo Reply`), Type 3 Code 1 (`Host Unreachable`), Type 11 Code 0 (`Time Exceeded`). |
| **L3** | IPv4 Routing | Longest Prefix Match (LPM) | Таблица маршрутов (Connected, Static), поиск совпадения по наибольшей длине маски подсети, Next-Hop резолвинг. |
| **L4 / L7** | DHCP Client/Server | **RFC 2131** | Цикл DORA (`Discover`, `Offer`, `Request`, `Ack`), IP pool allocation, lease time. |
| **L4 / L7** | DNS Resolver | **RFC 1035** | Базовый парсинг DNS-запроса типа A, статический маппинг доменных имен в IP-адреса. |

---

## 3. Архитектура движка симуляции (Discrete Event Simulator)

Симулятор не использует `setInterval` для каждого пакета. Все события времени упорядочены в приоритетной очереди (**Priority Queue / Min-Heap**).

```
   ┌────────────────────────────────────────────────────────┐
   │                   EventQueue (Min-Heap)                │
   │  [Event @ t=10ms] -> [Event @ t=11ms] -> [Event @ t=25ms]
   └───────────────────────────┬────────────────────────────┘
                               │ Pop Next Event
                               ▼
                    ┌─────────────────────┐
                    │  SimulationEngine   │
                    └──────────┬──────────┘
                               │ Dispatches to
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
      ┌───────────┐      ┌───────────┐      ┌───────────┐
      │  Host PC  │      │  Switch   │      │  Router   │
      └───────────┘      └───────────┘      └───────────┘
```

### Режимы работы:
1. **Real-Time Mode:** Очередь обрабатывается непрерывно с привязкой к виртуальному таймеру `virtualTime += delta`.
2. **Simulation / Step-by-Step Mode (визитная карточка Packet Tracer):**
   - Выполнение останавливается на каждом дискретном событии (`step()`).
   - Событие отправляет в UI уведомление: координаты узла-отправителя, координаты узла-получателя, PDU-инспектор (структура пакета по слоям L2/L3/L4).
   - UI анимирует конверт вдоль линии связи.

---

## 4. Модель данных и типы TypeScript

```typescript
export type MacAddress = string; // Формат "XX:XX:XX:XX:XX:XX"
export type Ipv4Address = string; // Формат "A.B.C.D"

export interface EthernetFrame {
  destMac: MacAddress;
  srcMac: MacAddress;
  vlanId?: number; // 802.1Q Tag (если trunk)
  etherType: 0x0806 | 0x0800; // 0x0806 = ARP, 0x0800 = IPv4
  payload: ArpPacket | Ipv4Packet;
}

export interface ArpPacket {
  hardwareType: 1; // Ethernet
  protocolType: 0x0800; // IPv4
  operation: 'REQUEST' | 'REPLY';
  senderMac: MacAddress;
  senderIp: Ipv4Address;
  targetMac: MacAddress; // "00:00:00:00:00:00" для Request
  targetIp: Ipv4Address;
}

export interface Ipv4Packet {
  version: 4;
  ihl: 5;
  tos: 0;
  ttl: number;
  protocol: 1 | 6 | 17; // 1 = ICMP, 6 = TCP, 17 = UDP
  srcIp: Ipv4Address;
  destIp: Ipv4Address;
  payload: IcmpPacket | Uint8Array;
}

export interface IcmpPacket {
  type: 0 | 3 | 8 | 11; // 8=Echo, 0=Echo Reply, 3=Unreachable, 11=TTL Expired
  code: number;
  checksum: number;
  sequenceNumber: number;
  payload?: Uint8Array;
}

export interface NetworkInterface {
  id: string;
  name: string; // "FastEthernet0/1", "GigabitEthernet0/0"
  macAddress: MacAddress;
  ipAddress?: Ipv4Address;
  subnetMask?: Ipv4Address;
  status: 'UP' | 'DOWN';
  adminStatus: 'UP' | 'DOWN';
  mode: 'access' | 'trunk' | 'routed';
  accessVlan: number;
  allowedVlans: number[];
  connectedLinkId?: string;
}

export interface RouteEntry {
  network: Ipv4Address;
  netmask: Ipv4Address;
  prefixLength: number;
  nextHop?: Ipv4Address;
  interfaceName: string;
  metric: number;
  type: 'CONNECTED' | 'STATIC';
}
```

---

## 5. Конечный автомат Cisco IOS CLI (State Machine)

Консоль роутеров и коммутаторов эмулируется как конечный автомат с контекстными деревьями команд:

### Граф состояний

```
[Disconnected]
      │ (Console session open)
      ▼
┌──────────────┐   "enable"   ┌─────────────────┐  "configure term"  ┌─────────────────┐
│  User EXEC   ├─────────────►│ Privileged EXEC ├───────────────────►│  Global Config  │
│  Router>     │◄─────────────┤ Router#         │◄───────────────────┤  Router(config)#│
└──────────────┘   "disable"  └─────────────────┘       "exit"       └────────┬────────┘
                                                                              │
                                 ┌────────────────────────────────────────────┼───────────────────────────┐
                                 │ "interface <name>"                         │ "router ospf <id>"        │ "line console 0"
                                 ▼                                            ▼                           ▼
                      ┌──────────────────────┐                     ┌────────────────────┐      ┌────────────────────┐
                      │ Interface Config     │                     │ Router Config      │      │ Line Config        │
                      │ Router(config-if)#   │                     │ Router(config-rtr)#│      │ Router(config-line)│
                      └──────────────────────┘                     └────────────────────┘      └────────────────────┘
```

### Набор команд Фазы 1 (MVP)

| Режим | Команда | Действие |
|---|---|---|
| **User EXEC** | `enable` (`en`) | Переход в Privileged EXEC |
| **Privileged** | `disable` | Возврат в User EXEC |
| **Privileged** | `configure terminal` (`conf t`) | Переход в Global Configuration |
| **Privileged** | `show ip interface brief` | Таблица статусов интерфейсов и IP-адресов |
| **Privileged** | `show ip route` | Вывод таблицы маршрутизации |
| **Privileged** | `show mac address-table` | Вывод CAM-таблицы (для коммутатора) |
| **Privileged** | `ping <target-ip>` | Запуск генерации ICMP Echo пакетов |
| **Global Config** | `hostname <name>` | Смена имени устройства и prompt'а |
| **Global Config** | `interface <name>` (`int <name>`) | Переход в контекст настройки интерфейса |
| **Global Config** | `ip route <net> <mask> <next-hop>` | Добавление статического маршрута |
| **Interface Config**| `ip address <ip> <mask>` | Назначение адреса и маски |
| **Interface Config**| `no shutdown` / `shutdown` | Включение/выключение интерфейса |
| **Interface Config**| `switchport mode access\|trunk` | Смена режима L2-порта |
| **Interface Config**| `switchport access vlan <id>` | Привязка порта к VLAN |

---

## 6. Стек фронтенда и компонентов UI

```
┌────────────────────────────────────────────────────────┐
│                      React 18 / Vite                   │
├──────────────────────────┬─────────────────────────────┤
│      @xyflow/react       │       xterm.js + WebLinks   │
│   (Холст топологии,      │  (Терминалы устройств,      │
│  Drag-and-Drop портов)   │   поддержка ANSI/Resize)    │
├──────────────────────────┴─────────────────────────────┤
│            Zustand Store (UI State & Workspaces)       │
├────────────────────────────────────────────────────────┤
│     Web Worker (Simulation Engine / Network Stack)     │
└────────────────────────────────────────────────────────┘
```

- **@xyflow/react (React Flow):** Управление графом. Кастомные ноды `RouterNode`, `SwitchNode`, `PCNode` с портами в виде Handle-элементов.
- **xterm.js:** Терминал с поддержкой клавиш стрелок (история команд), `Tab` (автодополнение префиксов), `?` (список доступных команд в контексте) и `Ctrl+C` (прерывание).
- **Packet Inspector Modal:** При клике на анимацию пакета отображение детализации PDU (In Layers / Out Layers), аналогично Packet Tracer.

---

## 7. Пошаговый план разработки (Roadmap для AI-агентов)

### Этап 1: Чистое ядро симуляции (Core Networking)
- [ ] Реализовать структуры данных пакетов (`Frame`, `ArpPacket`, `IPv4Packet`).
- [ ] Реализовать класс `VirtualSwitch` с логикой CAM-таблицы (обучение + форвардинг).
- [ ] Реализовать класс `VirtualHost` (генерация ARP Request, отправка ICMP Echo).
- [ ] Реализовать класс `VirtualRouter` (таблица маршрутов, декремент TTL, LPM).
- [ ] Покрыть ядро юнит-тестами Vitest (ping PC1 $\rightarrow$ Switch $\rightarrow$ PC2 без UI).

### Этап 2: Движок событий (DES Engine)
- [ ] Реализовать `PriorityQueue` для планирования событий во времени.
- [ ] Реализовать пошаговое проигрывание событий с генерацией трассировки (Trace Log).
- [ ] Вынести движок симуляции в отдельный `Web Worker`.

### Этап 3: CLI Эмулятор
- [ ] Построить контекстное дерево команд (Cisco FSM).
- [ ] Реализовать парсер сокращений команд (`sh ip int br` $\rightarrow$ `show ip interface brief`).
- [ ] Реализовать автодополнение по `Tab` и контекстную справку по `?`.
- [ ] Интегрировать CLI-парсер с `xterm.js`.

### Этап 4: Топология и визуализация (React Flow)
- [ ] Создать интерактивный холст с устройствами (Router, Switch, PC).
- [ ] Реализовать соединение узлов кабелями (выбор интерфейсов на концах провода).
- [ ] Создать компонент анимированного пакета, двигающегося вдоль SVG-траектории ребра графа.
- [ ] Реализовать сохранение/загрузку топологии в JSON-формате.