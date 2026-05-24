import { z } from 'zod';

import type {
  CoolifyApplication,
  CoolifyCredentials,
  InfisicalExport,
  LocalBinding,
} from './types.js';

export interface SchemaValidator {
  normalizeCoolifyCredentials(input: { baseUrl: string; apiToken: string }): CoolifyCredentials;
  parseGlobalConfig(value: unknown): CoolifyCredentials;
  parseLocalBinding(value: unknown): LocalBinding;
  parseApplicationsPayload(value: unknown): CoolifyApplication[];
  parseInfisicalExport(value: unknown): InfisicalExport;
}

export class ZodSchemaValidator implements SchemaValidator {
  private readonly apiTokenSchema = z.string().trim().min(1, 'Coolify API token is required.');

  private readonly baseUrlSchema = z
    .string()
    .trim()
    .min(1, 'Coolify base URL is required.')
    .url('Coolify base URL must be a valid absolute URL.')
    .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
      message: 'Coolify base URL must use http or https.',
    })
    .transform((value) => value.replace(/\/$/, ''));

  private readonly coolifyCredentialsSchema = z.object({
    baseUrl: this.baseUrlSchema,
    apiToken: this.apiTokenSchema,
  });

  private readonly localBindingSchema = z.object({
    applicationId: z.string().trim().min(1, 'Application ID is required.'),
    applicationName: z.string().trim().min(1, 'Application name is required.'),
    projectName: z.string().trim().min(1).nullable(),
  });

  private readonly infisicalExportSchema = z.record(
    z.string().trim().min(1, 'Environment variable keys must not be empty.'),
    z.string(),
  );

  private readonly rawCoolifyApplicationSchema = z
    .object({
      id: z.string().trim().min(1).optional(),
      uuid: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1, 'Coolify application payload is missing a valid name.'),
      project: z
        .object({
          name: z.string().trim().min(1).optional(),
        })
        .partial()
        .nullish(),
      projectName: z.string().trim().min(1).optional(),
      project_name: z.string().trim().min(1).optional(),
    })
    .passthrough()
    .transform((value, context): CoolifyApplication => {
      const applicationId = value.id ?? value.uuid;

      if (!applicationId) {
        context.addIssue({
          code: 'custom',
          message: 'Coolify application payload is missing a valid id or uuid.',
        });
        return z.NEVER;
      }

      return {
        id: applicationId,
        name: value.name,
        projectName: value.project?.name ?? value.projectName ?? value.project_name ?? null,
      };
    });

  private readonly applicationsPayloadSchema = z
    .union([
      z.array(this.rawCoolifyApplicationSchema),
      z.object({
        data: z.array(this.rawCoolifyApplicationSchema),
      }),
    ])
    .transform((value) => (Array.isArray(value) ? value : value.data));

  public normalizeCoolifyCredentials(input: {
    baseUrl: string;
    apiToken: string;
  }): CoolifyCredentials {
    return this.parseWithSchema(
      this.coolifyCredentialsSchema,
      input,
      'Invalid Coolify credentials.',
    );
  }

  public parseGlobalConfig(value: unknown): CoolifyCredentials {
    return this.parseWithSchema(this.coolifyCredentialsSchema, value, 'Invalid global config format.');
  }

  public parseLocalBinding(value: unknown): LocalBinding {
    return this.parseWithSchema(this.localBindingSchema, value, 'Invalid local binding format.');
  }

  public parseApplicationsPayload(value: unknown): CoolifyApplication[] {
    return this.parseWithSchema(
      this.applicationsPayloadSchema,
      value,
      'Invalid applications payload received from Coolify.',
    );
  }

  public parseInfisicalExport(value: unknown): InfisicalExport {
    return this.parseWithSchema(
      this.infisicalExportSchema,
      value,
      'Infisical export payload must be a JSON object with string values.',
    );
  }

  private parseWithSchema<TSchema extends z.ZodType>(
    schema: TSchema,
    value: unknown,
    fallbackMessage: string,
  ): z.infer<TSchema> {
    const result = schema.safeParse(value);

    if (!result.success) {
      throw new Error(this.getFirstIssueMessage(result.error, fallbackMessage));
    }

    return result.data;
  }

  private getFirstIssueMessage(error: z.ZodError, fallbackMessage: string): string {
    return error.issues[0]?.message ?? fallbackMessage;
  }
}
