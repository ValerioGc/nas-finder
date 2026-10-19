export interface NasDevice {
  id: string;
  name: string;
  address: string;
  port: number;
  secure: boolean;
  configured: boolean;
  online: boolean;
  saved: boolean;
  previousEndpoint?: string;
}

export type FinderError =
  | 'invalid_address'
  | 'network_unavailable'
  | 'busy'
  | 'storage_unavailable'
  | 'invalid_device'
  | 'browser_unavailable'
  | 'endpoint_changed';
