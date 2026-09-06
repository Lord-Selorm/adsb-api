export type DataSourceKind = 'serial' | 'mock' | 'tcp' | 'udp';

/**
 * Abstraction over a raw byte feed from an ADS-B receiver.
 * Serial (ADSR-800 via DB9) is the primary transport today; TCP/UDP
 * (RJ45/4G ground receiver) and the mock simulator slot in behind the same
 * contract so nothing downstream changes.
 */
export interface DataSource {
  readonly kind: DataSourceKind;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Register a listener for raw byte chunks from the device. */
  onData(listener: (chunk: Buffer) => void): void;

  /** Register a listener for transport-level errors. */
  onError(listener: (err: Error) => void): void;

  /**
   * Optional outbound commands (e.g. ADSR-800 Uart_Baud=/SetOutput= within
   * 5s of the startup banner).
   */
  write?(data: string | Buffer): Promise<void>;
  /** Return timestamp of last emitted/received message */
  getLastMessageAt(): number;

  /** Return connection status as string */
  getConnectionStatus(): string;
}

/** Injectable marker: DataSource instances are keyed by kind. */
export const DATA_SOURCE = Symbol('DATA_SOURCE');
export const DATA_SOURCE_KIND = Symbol('DATA_SOURCE_KIND');