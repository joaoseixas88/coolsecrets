export interface CoolifyCredentials {
  baseUrl: string;
  apiToken: string;
}

export interface CoolifyApplication {
  id: string;
  name: string;
  projectName: string | null;
}

export interface LocalBinding {
  applicationId: string;
  applicationName: string;
  projectName: string | null;
}

export interface CoolifyApplicationEnvironmentVariable {
  key: string;
  value: string;
  is_preview: boolean;
  is_literal: boolean;
  is_multiline: boolean;
  is_shown_once: boolean;
}

export type InfisicalExport = Record<string, string>;
