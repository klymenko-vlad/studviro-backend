import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

export type KeyedRecordValueKind = 'nullableString' | 'boolean';

const MAX_STRING_LENGTH = 64;

function isValidValue(value: unknown, kind: KeyedRecordValueKind): boolean {
  if (kind === 'boolean') return typeof value === 'boolean';

  return value === null || (typeof value === 'string' && value.length <= MAX_STRING_LENGTH);
}

export function IsKeyedRecord(
  allowedKeys: readonly string[],
  kind: KeyedRecordValueKind,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyName) => {
    registerDecorator({
      name: 'isKeyedRecord',
      target: target.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

          return Object.entries(value).every(
            ([key, entry]) => allowedKeys.includes(key) && isValidValue(entry, kind),
          );
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} accepts only the keys ${allowedKeys.join(', ')}`;
        },
      },
    });
  };
}
