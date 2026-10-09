import type { ErrorObject, ValidateFunction } from "ajv";

/** Explain the actual failing contract, not a guessed shared status vocabulary.
 * JSON quoting keeps control characters and arbitrary schema values visible. */
export function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  return (errors ?? []).map(error => {
    const field = error.instancePath || "/";
    const base = `${field} ${error.message ?? "is invalid"}`;
    if (error.keyword === "enum" && Array.isArray(error.params.allowedValues)) {
      return `${base}; allowed values: ${error.params.allowedValues.map(value => JSON.stringify(value)).join(", ")}`;
    }
    if (error.keyword === "const" && "allowedValue" in error.params) {
      return `${base}; required value: ${JSON.stringify(error.params.allowedValue)}`;
    }
    return base;
  }).join("; ");
}

export function formatValidatorErrors(validate: ValidateFunction): string {
  return formatSchemaErrors(validate.errors);
}
