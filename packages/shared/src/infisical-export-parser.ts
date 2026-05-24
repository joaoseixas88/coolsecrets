import { ZodSchemaValidator, type SchemaValidator } from './schemas.js';
import type { CoolifyApplicationEnvironmentVariable } from './types.js';

export class InfisicalExportParser {
  constructor(private readonly validator: SchemaValidator = new ZodSchemaValidator()) {}

  public parse(rawInput: string): CoolifyApplicationEnvironmentVariable[] {
    return this.fromObject(this.parseJson(rawInput));
  }

  public fromObject(payload: unknown): CoolifyApplicationEnvironmentVariable[] {
    const exportPayload = this.validator.parseInfisicalExport(payload);
    const environmentVariables = Object.entries(exportPayload).map(([key, value]) => ({
      key,
      value,
      is_preview: false,
      is_literal: false,
      is_multiline: value.includes('\n'),
      is_shown_once: false,
    }));

    if (environmentVariables.length === 0) {
      throw new Error('Infisical export payload does not contain any environment variables.');
    }

    return environmentVariables;
  }

  private parseJson(rawInput: string): unknown {
    try {
      return JSON.parse(rawInput);
    } catch {
      throw new Error('Infisical export input must be valid JSON.');
    }
  }
}
